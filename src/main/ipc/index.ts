import { BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import {
  THEME_PREFERENCE_PADRAO,
  ehThemePreference,
  resolveEffectiveTheme,
  type EstadoTema,
  type ThemePreference,
} from "@shared/theme";
import { defaultModel, extensoesSuportadas } from "@shared/constants";
import { montarCaderno } from "@shared/notebooks";
import { calcularDicaDoDia } from "@shared/agenda";
import type {
  ArquivoImportado,
  AvaliacaoResposta,
  CadernoEmFoco,
  DicaDoDia,
  DocumentoSalvo,
  EntradaAvaliacao,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  MapaMental,
  ModoConteudo,
  ModoQuiz,
  ModoResumo,
  NoMapaMental,
  OllamaStatus,
  PerguntaQuiz,
  Prova,
  Quiz,
  Resumo,
  ResumoCaderno,
  ResumoDocumentoSalvo,
  ResumoProva,
  ResultadoImportacaoPasta,
  SessaoRevisao,
} from "@shared/types";
import {
  ArquivoMuitoGrandeError,
  FormatoNaoSuportadoError,
  importarArquivo,
} from "../services/files.js";
import { importarPasta } from "../services/pasta.js";
import {
  GeracaoFalhouError,
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
  QuizInvalidoError,
  SemTextoParaQuizError,
  gerarQuiz,
} from "../services/quiz.js";
import { avaliarLote } from "../services/avaliacao.js";
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
  salvarQuiz,
  salvarResumo,
} from "../services/storage.js";
import {
  DadosProvaInvalidosError,
  ProvaNaoEncontradaError,
  carregarProva,
  criarProva,
  editarProva,
  hojeLocal,
  listarProvas,
  regerarAgenda,
  removerProva,
  salvarSessoes,
} from "../services/provas.js";
import type { MudancasProva, NovaProva } from "../services/provas.js";
import { gerarDicaIa } from "../services/dica.js";
import {
  carregarPreferenciaTema,
  salvarPreferenciaTema,
} from "../services/themeStorage.js";
import {
  ExportacaoFalhouError,
  exportarMarkdown,
  exportarPdf,
} from "../services/export.js";
import type {
  AlvoExportacao,
  ResultadoExportacao,
} from "@shared/export/types";
import type { UpdaterStatus } from "@shared/updater";

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
 * Mensagem amigável para a importação de pasta. Diferente do fluxo de arquivo
 * único, o fluxo de pasta NÃO tem erros tipados a mapear: formato e tamanho
 * viram contagens no `ResultadoImportacaoPasta`, não exceções. A genérica cobre
 * o único caminho de rejeição (a `readdir` da pasta escolhida/raiz falhar).
 */
function mensagemAmigavelPasta(): string {
  return "Não foi possível importar a pasta. Tente novamente.";
}

/**
 * Converte erros conhecidos da geração de resumo em mensagens amigáveis.
 * Como em `mensagemAmigavel`, o texto vai direto para a UI.
 */
function mensagemAmigavelResumo(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof GeracaoFalhouError) {
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
  if (erro instanceof GeracaoFalhouError) {
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
  if (erro instanceof GeracaoFalhouError) {
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
  if (erro instanceof GeracaoFalhouError) {
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
 * Converte erros conhecidos da geração do quiz em mensagens amigáveis.
 * Como nas demais, o texto vai direto para a UI.
 */
function mensagemAmigavelQuiz(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof GeracaoFalhouError) {
    return erro.message;
  }
  if (erro instanceof SemTextoParaQuizError) {
    return erro.message;
  }
  if (erro instanceof QuizInvalidoError) {
    return erro.message;
  }
  return "Não foi possível gerar o quiz. Tente novamente.";
}

/**
 * Converte erros conhecidos da avaliação por IA em mensagens amigáveis.
 * Só há erros de infra a mapear (`OllamaIndisponivelError`/`GeracaoFalhouError`,
 * devolvendo a `message` tipada); veredito inválido é resultado por-item, não
 * exceção. O restante cai na genérica.
 */
function mensagemAmigavelAvaliacao(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof GeracaoFalhouError) {
    return erro.message;
  }
  return "Não foi possível avaliar as respostas. Tente novamente.";
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
 * Converte erros conhecidos das provas (persistência e dica) em mensagens
 * amigáveis. Prova inexistente e dados inválidos devolvem a `message` tipada
 * (frase pronta); o restante cai na genérica de persistência das provas.
 */
function mensagemAmigavelProva(erro: unknown): string {
  if (erro instanceof ProvaNaoEncontradaError) {
    return erro.message;
  }
  if (erro instanceof DadosProvaInvalidosError) {
    return erro.message;
  }
  return "Não foi possível salvar ou carregar a prova. Tente novamente.";
}

/**
 * Converte erros conhecidos da geração da dica de IA em mensagens amigáveis.
 * Trata `OllamaIndisponivelError` e `ProvaNaoEncontradaError`/
 * `DadosProvaInvalidosError` (devolve a `message` tipada); o restante cai na
 * genérica da dica.
 */
function mensagemAmigavelDica(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) {
    return erro.message;
  }
  if (erro instanceof GeracaoFalhouError) {
    return erro.message;
  }
  if (erro instanceof ProvaNaoEncontradaError) {
    return erro.message;
  }
  if (erro instanceof DadosProvaInvalidosError) {
    return erro.message;
  }
  return "Não foi possível gerar a dica da IA. Tente novamente.";
}

/**
 * Converte erros conhecidos da exportação em mensagens amigáveis.
 * `ExportacaoFalhouError` carrega uma frase pronta; o restante cai na genérica.
 * Cancelar NÃO é erro (o serviço resolve `{ status: "cancelado" }`).
 */
function mensagemAmigavelExportacao(erro: unknown): string {
  if (erro instanceof ExportacaoFalhouError) {
    return erro.message;
  }
  return "Não foi possível exportar o arquivo. Tente novamente.";
}

/** Janela que originou o evento, para ancorar o save dialog (modal). */
function janelaDoEvento(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

/**
 * Monta `CadernoEmFoco[]` ordenado por `cadernoId` ascendente, agregando as
 * flags de artefato (`temResumo`/`temFlashcards`) por caderno a partir de
 * `listarDocumentos()` e o `totalDocumentos` de `listarCadernos()`. A ORDEM
 * estável por `cadernoId` é essencial para a rotação da dica ser determinística
 * (design §5.2/§6.3): `listarCadernos()` ordena por `atualizadoEm` desc, que
 * NÃO serve à rotação; por isso reordenamos aqui, no dono da ordem.
 */
async function cadernosEmFocoDisponiveis(
  baseDir?: string,
): Promise<CadernoEmFoco[]> {
  const cadernos = await listarCadernos(baseDir);
  const docs = await listarDocumentos(undefined, baseDir);
  const porCaderno = new Map<
    string,
    { temResumo: boolean; temFlashcards: boolean }
  >();
  for (const d of docs) {
    const acc = porCaderno.get(d.cadernoId) ?? {
      temResumo: false,
      temFlashcards: false,
    };
    acc.temResumo = acc.temResumo || d.temResumo;
    acc.temFlashcards = acc.temFlashcards || d.temFlashcards;
    porCaderno.set(d.cadernoId, acc);
  }
  return cadernos
    .map((c) => ({
      cadernoId: c.cadernoId,
      cadernoNome: c.cadernoNome,
      totalDocumentos: c.totalDocumentos,
      temResumo: porCaderno.get(c.cadernoId)?.temResumo ?? false,
      temFlashcards: porCaderno.get(c.cadernoId)?.temFlashcards ?? false,
    }))
    .sort((a, b) => a.cadernoId.localeCompare(b.cadernoId));
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
 * Preferência de tema atual, mantida em cache no processo main. Começa no
 * padrão e é sobrescrita pela leitura do disco no boot (uma vez) e pelas
 * chamadas de `tema:definir`.
 */
let preferenciaTema: ThemePreference = THEME_PREFERENCE_PADRAO;

/**
 * Indica se `preferenciaTema` já foi carregada do disco. Enquanto `false`, o
 * handler `tema:obter` lê do disco (uma vez); depois, serve o cache em memória
 * — assim uma gravação que falha não reverte a escolha do usuário sob StrictMode.
 */
let preferenciaCarregada = false;

/**
 * Estado de tema atual: resolve o efetivo contra o sistema via o domínio puro.
 * Usa `nativeTheme.shouldUseDarkColors` quando `nativeTheme` existe (em testes
 * com o mock de electron sem `nativeTheme`, assume sistema claro).
 */
function estadoTemaAtual(): EstadoTema {
  // `nativeTheme` pode ser um named export ausente no mock de electron (tocar
  // nele lança no ESM mockado); o try/catch degrada para "sistema claro".
  let sistemaEscuro = false;
  try {
    sistemaEscuro = nativeTheme?.shouldUseDarkColors ?? false;
  } catch {
    sistemaEscuro = false;
  }
  return {
    preferencia: preferenciaTema,
    efetivo: resolveEffectiveTheme(preferenciaTema, sistemaEscuro),
    sistemaEscuro,
  };
}

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
  // Carrega a preferência de tema do disco uma vez no boot, de forma tolerante
  // (a leitura nunca lança: falha vira o padrão). Não bloqueia o registro dos
  // handlers; `tema:obter` serve o cache assim que a flag resolve.
  void carregarPreferenciaTema()
    .then((preferencia) => {
      preferenciaTema = preferencia;
      preferenciaCarregada = true;
    })
    .catch(() => {
      preferenciaCarregada = true;
    });

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
    IPC_CHANNELS.importarPasta,
    async (): Promise<ResultadoImportacaoPasta | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Importar pasta de estudo",
        properties: ["openDirectory"],
      });

      if (canceled || filePaths.length === 0) {
        return null;
      }

      try {
        return await importarPasta(filePaths[0]);
      } catch {
        throw new Error(mensagemAmigavelPasta());
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
          gerar: (prompt, format) => generate({ prompt, model, format }),
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
          gerar: (prompt, format) => generate({ prompt, model, format }),
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
          gerar: (prompt, format) => generate({ prompt, model, format }),
        });
        return mapa.raiz;
      } catch (erro) {
        throw new Error(mensagemAmigavelMapaMental(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.gerarQuiz,
    async (
      _event,
      texto: string,
      modo: ModoQuiz,
      quantidade: number,
    ): Promise<PerguntaQuiz[]> => {
      try {
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        const quiz = await gerarQuiz({
          texto,
          modo,
          quantidade,
          gerar: (prompt, format) => generate({ prompt, model, format }),
        });
        return quiz.perguntas;
      } catch (erro) {
        throw new Error(mensagemAmigavelQuiz(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.avaliarRespostas,
    async (
      _event,
      entradas: EntradaAvaliacao[],
    ): Promise<AvaliacaoResposta[]> => {
      try {
        // Resolve um modelo que exista agora (evita "model not found").
        const model = await modeloParaGeracao();
        const { avaliacoes } = await avaliarLote(entradas, (prompt, format) =>
          generate({ prompt, model, format }),
        );
        return avaliacoes;
      } catch (erro) {
        throw new Error(mensagemAmigavelAvaliacao(erro));
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
    IPC_CHANNELS.salvarQuiz,
    async (_event, id: string, quiz: Quiz): Promise<DocumentoSalvo> => {
      try {
        return await salvarQuiz(id, quiz);
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

  ipcMain.handle(
    IPC_CHANNELS.criarProva,
    async (_event, dados: NovaProva): Promise<Prova> => {
      try {
        return await criarProva(dados, hojeLocal());
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listarProvas,
    async (): Promise<ResumoProva[]> => {
      try {
        return await listarProvas(hojeLocal());
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.carregarProva,
    async (_event, id: string): Promise<Prova> => {
      try {
        return await carregarProva(id);
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.editarProva,
    async (_event, id: string, mudancas: MudancasProva): Promise<Prova> => {
      try {
        return await editarProva(id, mudancas, hojeLocal());
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.salvarSessoes,
    async (
      _event,
      id: string,
      sessoes: SessaoRevisao[],
    ): Promise<Prova> => {
      try {
        return await salvarSessoes(id, sessoes, hojeLocal());
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.regerarAgenda,
    async (_event, id: string): Promise<Prova> => {
      try {
        return await regerarAgenda(id, hojeLocal());
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.removerProva,
    async (_event, id: string): Promise<void> => {
      try {
        await removerProva(id);
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.dicaDoDia,
    async (_event, id: string): Promise<DicaDoDia> => {
      try {
        const prova = await carregarProva(id);
        const cadernosDisponiveis = await cadernosEmFocoDisponiveis();
        return calcularDicaDoDia({
          prova,
          hoje: hojeLocal(),
          cadernosDisponiveis,
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelProva(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.dicaDaIa,
    async (_event, id: string): Promise<string> => {
      try {
        const prova = await carregarProva(id);
        const cadernosDisponiveis = await cadernosEmFocoDisponiveis();
        const dica = calcularDicaDoDia({
          prova,
          hoje: hojeLocal(),
          cadernosDisponiveis,
        });
        // Resolve um modelo que exista agora (evita "model not found"); NUNCA
        // manda o modelo cru.
        const model = await modeloParaGeracao();
        return await gerarDicaIa({
          prova,
          dica,
          gerar: (prompt) => generate({ prompt, model }),
        });
      } catch (erro) {
        throw new Error(mensagemAmigavelDica(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.exportarMarkdown,
    async (
      event,
      alvo: AlvoExportacao,
    ): Promise<ResultadoExportacao> => {
      try {
        return await exportarMarkdown(alvo, janelaDoEvento(event));
      } catch (erro) {
        throw new Error(mensagemAmigavelExportacao(erro));
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.exportarPdf,
    async (event, alvo: AlvoExportacao): Promise<ResultadoExportacao> => {
      try {
        return await exportarPdf(alvo, janelaDoEvento(event));
      } catch (erro) {
        throw new Error(mensagemAmigavelExportacao(erro));
      }
    },
  );

  // Updater in-app. O serviço é importado de forma PREGUIÇOSA (dynamic
  // import()) dentro de cada handler para não forçar o module-eval de
  // `electron-updater` em quem só chama `registerIpcHandlers()` sob o mock
  // { ipcMain } de ipc.test.ts. Os testes que exercem o serviço fornecem seus
  // próprios vi.mock("electron-updater", …).
  ipcMain.handle(
    IPC_CHANNELS.atualizacao.verificar,
    async (): Promise<UpdaterStatus> => {
      const svc = await import("../services/updater.js");
      return svc.verificarAtualizacao();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.atualizacao.baixar,
    async (): Promise<UpdaterStatus> => {
      const svc = await import("../services/updater.js");
      return svc.baixarAtualizacao();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.atualizacao.reiniciar,
    async (): Promise<void> => {
      const svc = await import("../services/updater.js");
      return svc.reiniciarParaAtualizar();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.tema.obter,
    async (): Promise<EstadoTema> => {
      // Se já carregou no boot, serve o cache (não relê o disco: uma gravação
      // que falhou não deve reverter a escolha sob StrictMode). Só lê do disco
      // se o boot ainda não resolveu.
      if (!preferenciaCarregada) {
        preferenciaTema = await carregarPreferenciaTema();
        preferenciaCarregada = true;
      }
      return estadoTemaAtual();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.tema.definir,
    async (_event, preferencia: unknown): Promise<EstadoTema> => {
      // Valida: preferência inválida cai no padrão em vez de corromper o cache.
      preferenciaTema = ehThemePreference(preferencia)
        ? preferencia
        : THEME_PREFERENCE_PADRAO;
      preferenciaCarregada = true;
      // Persistência best-effort: uma falha ao gravar é logada e NÃO rejeita
      // (FR8.4) — a escolha continua valendo em memória para esta sessão.
      try {
        await salvarPreferenciaTema(preferenciaTema);
      } catch (erro) {
        console.warn(
          "themeStorage: falha ao persistir preferência de tema:",
          erro,
        );
      }
      return estadoTemaAtual();
    },
  );

  // Wiring de nativeTheme DEFENSIVO. Os mocks de electron dos testes de IPC
  // expõem apenas { ipcMain, dialog } (sem `nativeTheme` nem, em geral,
  // `BrowserWindow`); nesses mocks ESM, só TOCAR no named export ausente já
  // lança, então o acesso vai dentro de try/catch e qualquer falha vira no-op.
  // Em runtime real, assina `updated` para avisar os renderers quando o SO
  // alterna claro/escuro.
  try {
    if (nativeTheme && BrowserWindow) {
      // Remove ouvintes antigos antes de assinar, para não acumular entre
      // registros repetidos (ex.: re-execução de registerIpcHandlers).
      nativeTheme.removeAllListeners?.("updated");
      nativeTheme.on("updated", () => {
        const estado = estadoTemaAtual();
        for (const janela of BrowserWindow.getAllWindows()) {
          janela.webContents.send(IPC_CHANNELS.tema.alterado, estado);
        }
      });
    }
  } catch {
    // Ambiente sem nativeTheme/BrowserWindow (ex.: testes): nada a assinar.
  }

  // Wiring do push do updater, sob o MESMO try/catch defensivo do bloco
  // nativeTheme acima. Sob o mock { ipcMain } de ipc.test.ts, `BrowserWindow`
  // é undefined: o ramo não executa, nada é importado e o registro não lança.
  // `conectarUpdater` só guarda o getter e emite o estado corrente uma vez.
  try {
    if (BrowserWindow) {
      void import("../services/updater.js").then((svc) => {
        svc.conectarUpdater(
          () => BrowserWindow.getAllWindows()[0]?.webContents,
        );
      });
    }
  } catch {
    // Ambiente de teste sem BrowserWindow: push desligado, handlers registrados.
  }
}
