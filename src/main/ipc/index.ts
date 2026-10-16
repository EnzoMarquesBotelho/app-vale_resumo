import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import { defaultModel, extensoesSuportadas } from "@shared/constants";
import type {
  ArquivoImportado,
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  ModoConteudo,
  ModoResumo,
  OllamaStatus,
  Resumo,
  ResumoDocumentoSalvo,
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
  ExerciciosInvalidosError,
  FlashcardsInvalidosError,
  SemTextoParaExerciciosError,
  SemTextoParaFlashcardsError,
  gerarExercicios,
  gerarFlashcards,
} from "../services/parse.js";
import {
  DocumentoNaoEncontradoError,
  carregarDocumento,
  criarDocumento,
  listarDocumentos,
  removerDocumento,
  salvarExercicios,
  salvarFlashcards,
  salvarResumo,
} from "../services/storage.js";

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
 * Converte erros conhecidos da geração de exercícios em mensagens amigáveis.
 * Como nas demais, o texto vai direto para a UI.
 */
function mensagemAmigavelExercicios(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof SemTextoParaExerciciosError) {
    return erro.message;
  }
  if (erro instanceof ExerciciosInvalidosError) {
    return erro.message;
  }
  return "Não foi possível gerar os exercícios. Tente novamente.";
}

/**
 * Converte erros conhecidos da persistência em mensagens amigáveis.
 * Como nas demais, o texto vai direto para a UI.
 */
function mensagemAmigavelPersistencia(erro: unknown): string {
  if (erro instanceof DocumentoNaoEncontradoError) {
    return erro.message;
  }
  return "Não foi possível salvar ou carregar os dados. Tente novamente.";
}

/**
 * Modelo selecionado para as gerações. Começa no default (`llama3.1:8b`) e é
 * ajustável em runtime pelo seletor de modelo na UI. Mantido em memória no
 * processo main; a persistência entre sessões fica para a Task de persistência.
 */
let modeloSelecionado = defaultModel;

/**
 * Indica se o usuário já escolheu um modelo manualmente pelo seletor da UI.
 * Enquanto `false`, o app pode reconciliar automaticamente o default com os
 * modelos realmente instalados (ver `escolherModeloDisponivel`). Depois de uma
 * escolha manual, a preferência do usuário é respeitada e não é sobrescrita.
 */
let modeloEscolhidoManualmente = false;

/**
 * Escolhe um modelo que realmente exista entre os instalados, dado o modelo
 * atualmente desejado. Regras, em ordem de preferência:
 *  1. Se o desejado já está instalado, mantém.
 *  2. Senão, prefere uma variante da mesma família (mesmo prefixo antes do
 *     `:`), ex.: desejado `llama3.1:8b` → casa com `llama3.1:latest`.
 *  3. Senão, usa o primeiro modelo instalado.
 *  4. Se não há nenhum instalado, mantém o desejado (a UI mostra o estado).
 */
export function escolherModeloDisponivel(
  desejado: string,
  instalados: string[],
): string {
  if (instalados.length === 0) return desejado;
  if (instalados.includes(desejado)) return desejado;

  const familia = desejado.split(":")[0];
  const mesmaFamilia = instalados.find((m) => m.split(":")[0] === familia);
  if (mesmaFamilia) return mesmaFamilia;

  return instalados[0];
}

/** Monta o status atual do Ollama consultando disponibilidade e modelos. */
async function obterStatusOllama(): Promise<OllamaStatus> {
  const disponivel = await isOllamaRunning();
  const modelos = disponivel ? await listModels() : [];
  // Reconcilia o default com o que está de fato instalado, a menos que o
  // usuário já tenha feito uma escolha manual. Assim, quando a máquina só tem
  // `llama3.1:latest` e o default é `llama3.1:8b`, o app seleciona a tag que
  // existe em vez de falhar na geração.
  if (!modeloEscolhidoManualmente && modelos.length > 0) {
    modeloSelecionado = escolherModeloDisponivel(modeloSelecionado, modelos);
  }
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
        // A partir de agora é escolha explícita do usuário: não reconciliar.
        modeloEscolhidoManualmente = true;
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

  ipcMain.handle(
    IPC_CHANNELS.gerarExercicios,
    async (
      _event,
      texto: string,
      modo: ModoConteudo,
      quantidade: number,
    ): Promise<Exercicio[]> => {
      try {
        // Usa o modelo atualmente selecionado na UI (não só o default).
        return await gerarExercicios({
          texto,
          modo,
          quantidade,
          gerar: (prompt) => generate({ prompt, model: modeloSelecionado }),
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelExercicios(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.criarDocumento,
    async (
      _event,
      nome: string,
      formato: FormatoArquivo,
      texto: string,
    ): Promise<DocumentoSalvo> => {
      try {
        return await criarDocumento({ nome, formato, texto });
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.salvarResumo,
    async (_event, id: string, resumo: Resumo): Promise<DocumentoSalvo> => {
      try {
        return await salvarResumo(id, resumo);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.salvarFlashcards,
    async (
      _event,
      id: string,
      flashcards: Flashcard[],
    ): Promise<DocumentoSalvo> => {
      try {
        return await salvarFlashcards(id, flashcards);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.salvarExercicios,
    async (
      _event,
      id: string,
      exercicios: Exercicio[],
    ): Promise<DocumentoSalvo> => {
      try {
        return await salvarExercicios(id, exercicios);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listarDocumentos,
    async (): Promise<ResumoDocumentoSalvo[]> => {
      try {
        return await listarDocumentos();
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.carregarDocumento,
    async (_event, id: string): Promise<DocumentoSalvo> => {
      try {
        return await carregarDocumento(id);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.removerDocumento,
    async (_event, id: string): Promise<void> => {
      try {
        await removerDocumento(id);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );
}
