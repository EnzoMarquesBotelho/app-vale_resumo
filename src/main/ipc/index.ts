import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import { defaultModel, extensoesSuportadas } from "@shared/constants";
import type {
  ArquivoImportado,
  Flashcard,
  ModoResumo,
  OllamaStatus,
} from "@shared/types";
import {
  ArquivoMuitoGrandeError,
  FormatoNaoSuportadoError,
  importarArquivo,
} from "../services/files.js";
import {
  OllamaIndisponivelError,
  generate,
  isOllamaRunning,
  listModels,
} from "../services/ollama.js";
import { SemTextoParaResumirError, gerarResumo } from "../services/resumo.js";
import {
  FlashcardsInvalidosError,
  SemTextoParaFlashcardsError,
  gerarFlashcards,
} from "../services/parse.js";

/**
 * Converte erros conhecidos da importação em mensagens amigáveis ao usuário.
 * O `message` resultante é exibido diretamente na UI (via rejeição do IPC),
 * então precisa ser uma frase pronta para um usuário iniciante — nunca um
 * detalhe interno. Casos inesperados viram uma mensagem genérica.
 */
function mensagemAmigavel(erro: unknown): string {
  if (erro instanceof FormatoNaoSuportadoError) {
    const lista = extensoesSuportadas.map((e) => `.${e}`).join(", ");
    return `Esse tipo de arquivo ainda não é suportado. Escolha um arquivo ${lista}.`;
  }
  if (erro instanceof ArquivoMuitoGrandeError) {
    return erro.message;
  }
  return "Não foi possível importar o arquivo. Tente novamente.";
}

/**
 * Converte erros conhecidos da geração de resumo em mensagens amigáveis.
 * Como em `mensagemAmigavel`, o texto vai direto para a UI.
 */
function mensagemAmigavelResumo(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof SemTextoParaResumirError) {
    return erro.message;
  }
  return "Não foi possível gerar o resumo. Tente novamente.";
}

/**
 * Converte erros conhecidos da geração de flashcards em mensagens amigáveis.
 * Como nas demais, o texto vai direto para a UI.
 */
function mensagemAmigavelFlashcards(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof SemTextoParaFlashcardsError) {
    return erro.message;
  }
  if (erro instanceof FlashcardsInvalidosError) {
    return erro.message;
  }
  return "Não foi possível gerar os flashcards. Tente novamente.";
}

/**
 * Modelo selecionado para as gerações. Começa no default (`llama3.1:8b`) e é
 * ajustável em runtime pelo seletor de modelo na UI. Mantido em memória no
 * processo main; a persistência entre sessões fica para a Task de persistência.
 */
let modeloSelecionado = defaultModel;

/** Monta o status atual do Ollama consultando disponibilidade e modelos. */
async function obterStatusOllama(): Promise<OllamaStatus> {
  const disponivel = await isOllamaRunning();
  const modelos = disponivel ? await listModels() : [];
  return { disponivel, modelos, modeloSelecionado };
}

/**
 * Registra todos os handlers de IPC do processo main.
 * Chamado uma única vez quando o app fica pronto.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.ping,
    (_event, mensagem: string): string => `pong: ${mensagem}`,
  );

  ipcMain.handle(
    IPC_CHANNELS.ollamaStatus,
    (): Promise<OllamaStatus> => obterStatusOllama(),
  );

  ipcMain.handle(
    IPC_CHANNELS.ollamaSelecionarModelo,
    (_event, modelo: string): Promise<OllamaStatus> => {
      // Ignora valores vazios: mantém o modelo atual em vez de ficar sem modelo.
      if (typeof modelo === "string" && modelo.trim().length > 0) {
        modeloSelecionado = modelo.trim();
      }
      return obterStatusOllama();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.importarArquivo,
    async (): Promise<ArquivoImportado | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Importar arquivo de estudo",
        properties: ["openFile"],
        filters: [
          {
            name: "Arquivos de estudo",
            extensions: [...extensoesSuportadas],
          },
        ],
      });

      if (canceled || filePaths.length === 0) {
        return null;
      }

      try {
        return await importarArquivo(filePaths[0]);
      } catch (erro) {
        // Rejeita com uma frase pronta para o usuário em vez de um detalhe interno.
        throw new Error(mensagemAmigavel(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.gerarResumo,
    async (_event, texto: string, modo: ModoResumo): Promise<string> => {
      try {
        // Usa o modelo atualmente selecionado na UI (não só o default).
        return await gerarResumo({
          texto,
          modo,
          gerar: (prompt) => generate({ prompt, model: modeloSelecionado }),
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelResumo(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.gerarFlashcards,
    async (
      _event,
      texto: string,
      quantidade: number,
    ): Promise<Flashcard[]> => {
      try {
        // Usa o modelo atualmente selecionado na UI (não só o default).
        return await gerarFlashcards({
          texto,
          quantidade,
          gerar: (prompt) => generate({ prompt, model: modeloSelecionado }),
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelFlashcards(erro));
      }
    },
  );
}
