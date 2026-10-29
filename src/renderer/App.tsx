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
import { Sidebar, type Secao } from "./components/Sidebar";
import { artefatosPresentes } from "@shared/export/markdown";
import type { DocumentoExportavel } from "@shared/export/types";
import { getApi } from "./api";
import { useTema } from "./useTema";
import { Agenda } from "./views/Agenda";
import { Biblioteca, type VisaoBiblioteca } from "./views/Biblioteca";

/**
 * Casca principal do app. A navegação acontece por uma barra lateral com duas
 * seções (Biblioteca e Agenda). Dentro da Biblioteca, uma visão (`lista`,
 * `importar` ou `documento`) decide o que exibir. Importar um arquivo cria um
 * documento salvo; os artefatos gerados são persistidos nesse documento e
 * reaparecem ao reabri-lo, mesmo após fechar e reabrir o app.
 */
export function App(): React.JSX.Element {
  const tema = useTema();

  const [arquivo, setArquivo] = useState<ArquivoImportado | null>(null);
  const [documento, setDocumento] = useState<DocumentoSalvo | null>(null);
  // Incrementado a cada save para o Histórico recarregar a lista.
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  // Seção da barra lateral. Começa na Biblioteca, o ponto de entrada do fluxo.
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("biblioteca");
  // Visão dentro da Biblioteca. Começa na lista (Histórico de cadernos).
  const [visaoBiblioteca, setVisaoBiblioteca] =
    useState<VisaoBiblioteca>("lista");
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
    setVisaoBiblioteca("importar");
  }

  /**
   * Cria o documento salvo com o caderno escolhido na importação e abre a tela
   * do documento. Só é chamado pelo fluxo de importação (nunca na reabertura,
   * que não passa esta função a `Importar`).
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
        arquivo.dataArquivo,
      );
      setDocumento(salvo);
      setVersaoHistorico((v) => v + 1);
      setAvisoPersistencia(null);
      // Com o caderno confirmado, abre a tela do documento.
      setVisaoBiblioteca("documento");
    } catch {
      // Falha ao criar o registro não bloqueia a geração: o texto continua
      // disponível nesta sessão, mas sem salvar no histórico. Avisa o usuário.
      setAvisoPersistencia(
        "Não foi possível salvar este documento no histórico. Você pode " +
          "continuar usando o app normalmente, mas os resultados não serão " +
          "guardados ao fechar.",
      );
      // Abre a tela do documento mesmo assim: a geração funciona sem persistência.
      setVisaoBiblioteca("documento");
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
    // Abre a tela do documento reaberto na Biblioteca.
    setSecaoAtiva("biblioteca");
    setVisaoBiblioteca("documento");
  }

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

  // Documento exportável montado a partir do documento ativo: só inclui as
  // chaves dos artefatos presentes (spread condicional). `null` sem documento.
  const docExportavel: DocumentoExportavel | null =
    documento !== null
      ? {
          nome: documento.nome,
          ...(documento.resumo !== undefined
            ? { resumo: documento.resumo }
            : {}),
          ...(documento.flashcards !== undefined
            ? { flashcards: documento.flashcards }
            : {}),
          ...(documento.exercicios !== undefined
            ? { exercicios: documento.exercicios }
            : {}),
          ...(documento.mapaMental !== undefined
            ? { mapaMental: documento.mapaMental }
            : {}),
          ...(documento.quiz !== undefined ? { quiz: documento.quiz } : {}),
        }
      : null;
  const semArtefatos =
    docExportavel !== null && artefatosPresentes(docExportavel).length === 0;

  return (
    <div className="app-shell">
      <Sidebar
        secaoAtiva={secaoAtiva}
        onSelecionarSecao={setSecaoAtiva}
        preferenciaTema={tema.preferencia}
        onDefinirTema={(p) => void tema.definir(p)}
      />

      <div className="app-principal">
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

        <main className="app-conteudo">
          {secaoAtiva === "biblioteca" ? (
            <Biblioteca
              visao={visaoBiblioteca}
              onDefinirVisao={setVisaoBiblioteca}
              arquivo={arquivo}
              documento={documento}
              chaveDocumento={chaveDocumento}
              temTexto={temTexto}
              docExportavel={docExportavel}
              semArtefatos={semArtefatos}
              versaoHistorico={versaoHistorico}
              onReabrir={aoReabrir}
              onImportado={aoImportar}
              onLoteImportado={() => setVersaoHistorico((v) => v + 1)}
              {...(documento === null
                ? {
                    onConfirmarCaderno: (a, nome) =>
                      void aoConfirmarCaderno(a, nome),
                  }
                : {})}
              onSalvarResumo={(r) => void salvarResumo(r)}
              onSalvarFlashcards={(f) => void salvarFlashcards(f)}
              onSalvarExercicios={(e) => void salvarExercicios(e)}
              onSalvarMapaMental={(m) => void salvarMapaMental(m)}
              onSalvarQuiz={(q) => void salvarQuiz(q)}
            />
          ) : (
            <Agenda />
          )}
        </main>
      </div>
    </div>
  );
}
