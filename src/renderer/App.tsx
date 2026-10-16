import { useState } from "react";
import { appName } from "@shared/constants";
import type {
  ArquivoImportado,
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  Resumo as ResumoArtefato,
} from "@shared/types";
import { OllamaStatus } from "./components/OllamaStatus";
import { Importar } from "./views/Importar";
import { Resumo } from "./views/Resumo";
import { Flashcards } from "./views/Flashcards";
import { Exercicios } from "./views/Exercicios";
import { Historico } from "./views/Historico";

/** Abas de navegação do app, na ordem em que aparecem. */
type Aba = "importar" | "resumo" | "flashcards" | "exercicios" | "historico";

/** Rótulos (em português) e ícone de cada aba. */
const ABAS: readonly { id: Aba; rotulo: string; icone: string }[] = [
  { id: "importar", rotulo: "Importar", icone: "📄" },
  { id: "resumo", rotulo: "Resumo", icone: "📝" },
  { id: "flashcards", rotulo: "Flashcards", icone: "🃏" },
  { id: "exercicios", rotulo: "Exercícios", icone: "✏️" },
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

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Chave de remontagem das telas de geração: muda ao reabrir/importar outro
  // documento (id diferente), mas não ao salvar artefatos no mesmo documento,
  // preservando o resultado exibido. Sem documento, uma chave estável.
  const chaveDocumento = documento?.id ?? "sem-documento";

  /** Ao importar um novo arquivo, cria o documento salvo correspondente. */
  async function aoImportar(importado: ArquivoImportado | null): Promise<void> {
    setArquivo(importado);
    setDocumento(null);
    if (
      importado === null ||
      importado.semTextoExtraivel ||
      importado.texto.length === 0
    ) {
      return;
    }
    try {
      const salvo = await window.api?.criarDocumento(
        importado.nome,
        importado.formato,
        importado.texto,
      );
      if (salvo) {
        setDocumento(salvo);
        setVersaoHistorico((v) => v + 1);
        // Com texto importado, leva o usuário ao próximo passo do fluxo.
        setAbaAtiva("resumo");
      }
    } catch {
      // Falha ao criar o registro não bloqueia a geração; sem persistência
      // nesta sessão. O erro de IPC já é tratado onde for relevante.
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
    abaAtiva === "exercicios";
  const abaExibida: Aba = ehAbaGeracao && !temTexto ? "importar" : abaAtiva;

  async function salvarResumo(resumo: ResumoArtefato): Promise<void> {
    if (documento === null) return;
    try {
      const atualizado = await window.api?.salvarResumo(documento.id, {
        ...resumo,
        documentoId: documento.id,
      });
      if (atualizado) {
        setDocumento(atualizado);
        setVersaoHistorico((v) => v + 1);
      }
    } catch {
      // Geração já exibida ao usuário; falha de persistência é silenciosa aqui.
    }
  }

  async function salvarFlashcards(flashcards: Flashcard[]): Promise<void> {
    if (documento === null) return;
    try {
      const atualizado = await window.api?.salvarFlashcards(
        documento.id,
        flashcards,
      );
      if (atualizado) {
        setDocumento(atualizado);
        setVersaoHistorico((v) => v + 1);
      }
    } catch {
      // idem
    }
  }

  async function salvarExercicios(exercicios: Exercicio[]): Promise<void> {
    if (documento === null) return;
    try {
      const atualizado = await window.api?.salvarExercicios(
        documento.id,
        exercicios,
      );
      if (atualizado) {
        setDocumento(atualizado);
        setVersaoHistorico((v) => v + 1);
      }
    } catch {
      // idem
    }
  }

  // Abas de geração ficam desabilitadas enquanto não há texto importado.
  function abaDesabilitada(id: Aba): boolean {
    const ehGeracao =
      id === "resumo" || id === "flashcards" || id === "exercicios";
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
          <Importar arquivo={arquivo} onImportado={(a) => void aoImportar(a)} />
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
