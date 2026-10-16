import { useState } from "react";
import { appName } from "@shared/constants";
import type {
  ArquivoImportado,
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  MapaMental as MapaMentalArtefato,
  Quiz as QuizArtefato,
  Resumo as ResumoArtefato,
} from "@shared/types";
import { OllamaStatus } from "./components/OllamaStatus";
import { getApi } from "./api";
import { Importar } from "./views/Importar";
import { Resumo } from "./views/Resumo";
import { Flashcards } from "./views/Flashcards";
import { Exercicios } from "./views/Exercicios";
import { MapaMental } from "./views/MapaMental";
import { Quiz } from "./views/Quiz";
import { Agenda } from "./views/Agenda";
import { Historico } from "./views/Historico";

/** Abas de navegação do app, na ordem em que aparecem. */
type Aba =
  | "importar"
  | "resumo"
  | "flashcards"
  | "exercicios"
  | "mapa"
  | "quiz"
  | "agenda"
  | "historico";

/** Rótulos (em português) e ícone de cada aba. */
const ABAS: readonly { id: Aba; rotulo: string; icone: string }[] = [
  { id: "importar", rotulo: "Importar", icone: "📄" },
  { id: "resumo", rotulo: "Resumo", icone: "📝" },
  { id: "flashcards", rotulo: "Flashcards", icone: "🃏" },
  { id: "exercicios", rotulo: "Exercícios", icone: "✏️" },
  { id: "mapa", rotulo: "Mapa mental", icone: "🗺️" },
  { id: "quiz", rotulo: "Quiz", icone: "❓" },
  { id: "agenda", rotulo: "Agenda", icone: "📅" },
  { id: "historico", rotulo: "Histórico", icone: "🗂️" },
];

/**
 * Casca principal do app. Orquestra o fluxo: importar um arquivo cria um
 * documento salvo; os artefatos gerados (resumo/flashcards/exercícios) são
 * persistidos nesse documento e reaparecem ao reabri-lo pelo Histórico, mesmo
 * após fechar e reabrir o app.
 */
export function App(): React.JSX.Element {
  const [arquivo, setArquivo] = useState<ArquivoImportado | null>(null);
  const [documento, setDocumento] = useState<DocumentoSalvo | null>(null);
  // Incrementado a cada save para o Histórico recarregar a lista.
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  // Aba atualmente visível. Começa em "Importar", o primeiro passo do fluxo.
  const [abaAtiva, setAbaAtiva] = useState<Aba>("importar");
  // Aviso exibido quando uma operação de persistência falha. O resultado
  // continua visível na tela; apenas não foi salvo em disco. `null` = sem aviso.
  const [avisoPersistencia, setAvisoPersistencia] = useState<string | null>(
    null,
  );

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Chave de remontagem das telas de geração: muda ao reabrir/importar outro
  // documento (id diferente), mas não ao salvar artefatos no mesmo documento,
  // preservando o resultado exibido. Sem documento, uma chave estável.
  const chaveDocumento = documento?.id ?? "sem-documento";

  /**
   * Ao importar um novo arquivo, apenas exibe o texto e reseta o documento
   * ativo. A criação do documento acontece só quando o usuário confirma o
   * caderno (em `aoConfirmarCaderno`).
   */
  function aoImportar(importado: ArquivoImportado | null): void {
    setArquivo(importado);
    setDocumento(null);
  }

  /**
   * Cria o documento salvo com o caderno escolhido na importação e avança para
   * a aba de geração. Só é chamado pelo fluxo de importação (nunca na
   * reabertura, que não passa esta função a `Importar`).
   */
  async function aoConfirmarCaderno(
    arquivo: ArquivoImportado,
    cadernoNome: string,
  ): Promise<void> {
    try {
      const salvo = await getApi().criarDocumento(
        arquivo.nome,
        arquivo.formato,
        arquivo.texto,
        cadernoNome,
        arquivo.caminhoOrigem,
      );
      setDocumento(salvo);
      setVersaoHistorico((v) => v + 1);
      setAvisoPersistencia(null);
      // Com o caderno confirmado, leva o usuário ao próximo passo do fluxo.
      setAbaAtiva("resumo");
    } catch {
      // Falha ao criar o registro não bloqueia a geração: o texto continua
      // disponível nesta sessão, mas sem salvar no histórico. Avisa o usuário.
      setAvisoPersistencia(
        "Não foi possível salvar este documento no histórico. Você pode " +
          "continuar usando o app normalmente, mas os resultados não serão " +
          "guardados ao fechar.",
      );
      // Vai para o resumo mesmo assim: a geração funciona sem persistência.
      setAbaAtiva("resumo");
    }
  }

  /** Reabre um documento salvo do histórico (texto + artefatos). */
  function aoReabrir(salvo: DocumentoSalvo): void {
    setDocumento(salvo);
    setArquivo({
      nome: salvo.nome,
      formato: salvo.formato,
      texto: salvo.texto,
      semTextoExtraivel: false,
      caminhoOrigem: salvo.caminhoOrigem,
      cadernoIdSugerido: salvo.cadernoId,
      cadernoNomeSugerido: salvo.cadernoNome,
    });
    // Mostra o resumo do documento reaberto; o usuário navega pelas abas.
    setAbaAtiva("resumo");
  }

  // Aba efetivamente exibida: se o arquivo ativo ficar sem texto (ex.: erro ao
  // importar limpou o arquivo), uma aba de geração não faz sentido, então
  // caímos de volta para "Importar". Derivado em render — sem efeito/estado
  // extra para corrigir a seleção.
  const ehAbaGeracao =
    abaAtiva === "resumo" ||
    abaAtiva === "flashcards" ||
    abaAtiva === "exercicios" ||
    abaAtiva === "mapa" ||
    abaAtiva === "quiz";
  const abaExibida: Aba = ehAbaGeracao && !temTexto ? "importar" : abaAtiva;

  /**
   * Executa um save de artefato tratando sucesso e falha de forma uniforme:
   * em sucesso atualiza o documento, recarrega o histórico e limpa o aviso;
   * em falha mostra um aviso não-intrusivo (o resultado segue visível na tela,
   * só não foi salvo). `rotulo` identifica o artefato na mensagem.
   */
  async function persistirArtefato(
    rotulo: string,
    operacao: () => Promise<DocumentoSalvo>,
  ): Promise<void> {
    if (documento === null) return;
    try {
      const atualizado = await operacao();
      setDocumento(atualizado);
      setVersaoHistorico((v) => v + 1);
      setAvisoPersistencia(null);
    } catch {
      setAvisoPersistencia(
        `O ${rotulo} foi gerado, mas não foi possível salvá-lo no histórico. ` +
          "Ele continua visível agora, mas pode não estar disponível ao reabrir o app.",
      );
    }
  }

  async function salvarResumo(resumo: ResumoArtefato): Promise<void> {
    if (documento === null) return;
    await persistirArtefato("resumo", () =>
      getApi().salvarResumo(documento.id, {
        ...resumo,
        documentoId: documento.id,
      }),
    );
  }

  async function salvarFlashcards(flashcards: Flashcard[]): Promise<void> {
    if (documento === null) return;
    await persistirArtefato("conjunto de flashcards", () =>
      getApi().salvarFlashcards(documento.id, flashcards),
    );
  }

  async function salvarExercicios(exercicios: Exercicio[]): Promise<void> {
    if (documento === null) return;
    await persistirArtefato("conjunto de exercícios", () =>
      getApi().salvarExercicios(documento.id, exercicios),
    );
  }

  async function salvarMapaMental(mapa: MapaMentalArtefato): Promise<void> {
    if (documento === null) return;
    await persistirArtefato("mapa mental", () =>
      getApi().salvarMapaMental(documento.id, {
        ...mapa,
        documentoId: documento.id,
      }),
    );
  }

  async function salvarQuiz(quiz: QuizArtefato): Promise<void> {
    if (documento === null) return;
    await persistirArtefato("quiz", () =>
      getApi().salvarQuiz(documento.id, {
        ...quiz,
        documentoId: documento.id,
      }),
    );
  }

  // Abas de geração ficam desabilitadas enquanto não há texto importado.
  function abaDesabilitada(id: Aba): boolean {
    const ehGeracao =
      id === "resumo" ||
      id === "flashcards" ||
      id === "exercicios" ||
      id === "mapa" ||
      id === "quiz";
    return ehGeracao && !temTexto;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-titulo">
          <span className="app-logo" aria-hidden="true">
            🎓
          </span>
          <div>
            <h1>{appName}</h1>
            <p className="app-subtitulo">
              Resumos, flashcards e exercícios gerados localmente com IA
            </p>
          </div>
        </div>
        {documento !== null && (
          <p className="app-documento-ativo" title={documento.nome}>
            Documento: <strong>{documento.nome}</strong>
          </p>
        )}
      </header>

      <OllamaStatus />

      {avisoPersistencia !== null && (
        <div className="app-aviso-persistencia" role="alert">
          <span className="app-aviso-icone" aria-hidden="true">
            ⚠️
          </span>
          <span className="app-aviso-texto">{avisoPersistencia}</span>
          <button
            type="button"
            className="app-aviso-fechar"
            onClick={() => setAvisoPersistencia(null)}
            aria-label="Dispensar aviso"
          >
            ✕
          </button>
        </div>
      )}

      <nav className="app-nav" aria-label="Navegação principal">
        {ABAS.map((aba) => (
          <button
            key={aba.id}
            type="button"
            className={`app-nav-item ${abaExibida === aba.id ? "ativo" : ""}`}
            onClick={() => setAbaAtiva(aba.id)}
            disabled={abaDesabilitada(aba.id)}
            aria-current={abaExibida === aba.id ? "page" : undefined}
            title={
              abaDesabilitada(aba.id)
                ? "Importe um arquivo com texto primeiro"
                : undefined
            }
          >
            <span className="app-nav-icone" aria-hidden="true">
              {aba.icone}
            </span>
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <main className="app-conteudo">
        {abaExibida === "importar" && (
          <Importar
            arquivo={arquivo}
            onImportado={aoImportar}
            onLoteImportado={() => setVersaoHistorico((v) => v + 1)}
            {...(documento === null
              ? {
                  onConfirmarCaderno: (a, nome) =>
                    void aoConfirmarCaderno(a, nome),
                }
              : {})}
          />
        )}
        {abaExibida === "resumo" && (
          <Resumo
            key={`resumo-${chaveDocumento}`}
            arquivo={arquivo}
            resumoSalvo={documento?.resumo ?? null}
            onGerado={temTexto ? (r) => void salvarResumo(r) : undefined}
          />
        )}
        {abaExibida === "flashcards" && (
          <Flashcards
            key={`flashcards-${chaveDocumento}`}
            arquivo={arquivo}
            flashcardsSalvos={documento?.flashcards ?? null}
            onGerado={temTexto ? (f) => void salvarFlashcards(f) : undefined}
          />
        )}
        {abaExibida === "exercicios" && (
          <Exercicios
            key={`exercicios-${chaveDocumento}`}
            arquivo={arquivo}
            exerciciosSalvos={documento?.exercicios ?? null}
            onGerado={temTexto ? (e) => void salvarExercicios(e) : undefined}
          />
        )}
        {abaExibida === "mapa" && (
          <MapaMental
            key={`mapa-${chaveDocumento}`}
            arquivo={arquivo}
            mapaMentalSalvo={documento?.mapaMental ?? null}
            onGerado={temTexto ? (m) => void salvarMapaMental(m) : undefined}
          />
        )}
        {abaExibida === "quiz" && (
          <Quiz
            key={`quiz-${chaveDocumento}`}
            arquivo={arquivo}
            quizSalvo={documento?.quiz ?? null}
            onGerado={temTexto ? (q) => void salvarQuiz(q) : undefined}
          />
        )}
        {abaExibida === "agenda" && <Agenda />}
        {abaExibida === "historico" && (
          <Historico
            recarregar={versaoHistorico}
            documentoAtivoId={documento?.id ?? null}
            onReabrir={aoReabrir}
          />
        )}
      </main>
    </div>
  );
}
