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
  }

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

  return (
    <main className="app-shell">
      <h1>{appName}</h1>
      <OllamaStatus />
      <Importar arquivo={arquivo} onImportado={(a) => void aoImportar(a)} />
      <Resumo
        key={`resumo-${chaveDocumento}`}
        arquivo={arquivo}
        resumoSalvo={documento?.resumo ?? null}
        onGerado={temTexto ? (r) => void salvarResumo(r) : undefined}
      />
      <Flashcards
        key={`flashcards-${chaveDocumento}`}
        arquivo={arquivo}
        flashcardsSalvos={documento?.flashcards ?? null}
        onGerado={temTexto ? (f) => void salvarFlashcards(f) : undefined}
      />
      <Exercicios
        key={`exercicios-${chaveDocumento}`}
        arquivo={arquivo}
        exerciciosSalvos={documento?.exercicios ?? null}
        onGerado={temTexto ? (e) => void salvarExercicios(e) : undefined}
      />
      <Historico
        recarregar={versaoHistorico}
        documentoAtivoId={documento?.id ?? null}
        onReabrir={aoReabrir}
      />
    </main>
  );
}
