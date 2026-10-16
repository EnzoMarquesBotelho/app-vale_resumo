import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import { defaultModel, extensoesSuportadas } from "@shared/constants";
import { montarCaderno } from "@shared/notebooks";
import type {
  ArquivoImportado,
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  MapaMental,
  ModoConteudo,
  ModoResumo,
  NoMapaMental,
  OllamaStatus,
  Resumo,
  ResumoCaderno,
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
  MapaMentalInvalidoError,
  SemTextoParaMapaMentalError,
  gerarMapaMental,
} from "../services/mapa.js";
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
  listarCadernos,
  listarDocumentos,
  removerDocumento,
  salvarExercicios,
  salvarFlashcards,
  salvarMapaMental,
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
 * Converte erros conhecidos da geração do mapa mental em mensagens amigáveis.
 * Como nas demais, o texto vai direto para a UI.
 */
function mensagemAmigavelMapaMental(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof SemTextoParaMapaMentalError) {
    return erro.message;
  }
  if (erro instanceof MapaMentalInvalidoError) {
    return erro.message;
  }
  return "Não foi possível gerar o mapa mental. Tente novamente.";
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
 * Resolve, no momento da geração, um modelo que realmente exista no Ollama.
 * É a última linha de defesa contra "model not found": mesmo que o modelo
 * selecionado na UI (ou o default) não esteja instalado, consultamos a lista
 * atual de modelos e reconciliamos para uma variante compatível. Se não der
 * para listar (ex.: Ollama offline), devolvemos o selecionado e deixamos a
 * geração falhar com a mensagem amigável de Ollama indisponível.
 */
async function modeloParaGeracao(): Promise<string> {
  let instalados: string[];
  try {
    const lista = await listModels();
    instalados = Array.isArray(lista) ? lista : [];
  } catch {
    instalados = [];
  }
  if (instalados.length === 0) return modeloSelecionado;
  const resolvido = escolherModeloDisponivel(modeloSelecionado, instalados);
  // Se o usuário não escolheu manualmente, alinhamos o estado exibido também.
  if (!modeloEscolhidoManualmente) {
    modeloSelecionado = resolvido;
  }
  return resolvido;
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
        // Um filtro combinado (todos os formatos de uma vez) + um por tipo +
        // "Todos os arquivos". No Windows, filtros separados evitam o caso em
        // que o usuário não enxerga os .txt/.md porque o filtro ativo some com
        // eles; "Todos os arquivos" é a saída de emergência.
        filters: [
          { name: "Arquivos de estudo (.txt, .md, .pdf)", extensions: [...extensoesSuportadas] },
          { name: "Texto (.txt)", extensions: ["txt"] },
          { name: "Markdown (.md)", extensions: ["md"] },
          { name: "PDF (.pdf)", extensions: ["pdf"] },
          { name: "Todos os arquivos", extensions: ["*"] },
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
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        return await gerarResumo({
          texto,
          modo,
          gerar: (prompt) => generate({ prompt, model }),
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
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        return await gerarFlashcards({
          texto,
          quantidade,
          gerar: (prompt) => generate({ prompt, model }),
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
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        return await gerarExercicios({
          texto,
          modo,
          quantidade,
          gerar: (prompt) => generate({ prompt, model }),
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelExercicios(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.gerarMapaMental,
    async (_event, texto: string): Promise<NoMapaMental> => {
      try {
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        const mapa = await gerarMapaMental({
          texto,
          gerar: (prompt) => generate({ prompt, model }),
        });
        return mapa.raiz;
      } catch (erro) {
        throw new Error(mensagemAmigavelMapaMental(erro));
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
      cadernoNome: string,
      caminhoOrigem?: string,
    ): Promise<DocumentoSalvo> => {
      try {
        // O id do caderno é derivado server-side a partir da grafia escolhida.
        const { cadernoId, cadernoNome: nomeMontado } =
          montarCaderno(cadernoNome);
        return await criarDocumento({
          nome,
          formato,
          texto,
          cadernoId,
          cadernoNome: nomeMontado,
          caminhoOrigem,
        });
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
    IPC_CHANNELS.salvarMapaMental,
    async (
      _event,
      id: string,
      mapa: MapaMental,
    ): Promise<DocumentoSalvo> => {
      try {
        return await salvarMapaMental(id, mapa);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listarDocumentos,
    async (_event, cadernoId?: string): Promise<ResumoDocumentoSalvo[]> => {
      try {
        return await listarDocumentos(cadernoId);
      } catch (erro) {
        throw new Error(mensagemAmigavelPersistencia(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listarCadernos,
    async (): Promise<ResumoCaderno[]> => {
      try {
        return await listarCadernos();
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
