import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { PlanoEstudo, Prova } from "@shared/types";

/** Captura os handlers registrados via ipcMain.handle para inspeção. */
const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => {
      registered.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => "/tmp") },
  BrowserWindow: { fromWebContents: () => undefined },
}));

// Serviço de provas mockado: o teste valida a fiação do handler e a conversão
// de erro em mensagem amigável (persistência é coberta em provas.test.ts).
const carregarProva = vi.fn();
const salvarDiagnostico = vi.fn();
const registrarRespostasDiagnostico = vi.fn();
vi.mock("../../src/main/services/provas.js", () => ({
  ProvaNaoEncontradaError: class ProvaNaoEncontradaError extends Error {
    readonly code = "PROVA_NAO_ENCONTRADA" as const;
    constructor() {
      super("Prova não encontrada. Ela pode ter sido removida.");
      this.name = "ProvaNaoEncontradaError";
    }
  },
  DadosProvaInvalidosError: class DadosProvaInvalidosError extends Error {
    readonly code = "DADOS_PROVA_INVALIDOS" as const;
    constructor(message: string) {
      super(message);
      this.name = "DadosProvaInvalidosError";
    }
  },
  hojeLocal: () => "2026-03-10",
  carregarProva: (...args: unknown[]) => carregarProva(...args),
  salvarDiagnostico: (...args: unknown[]) => salvarDiagnostico(...args),
  registrarRespostasDiagnostico: (...args: unknown[]) =>
    registrarRespostasDiagnostico(...args),
}));

const carregarDocumento = vi.fn();
vi.mock("../../src/main/services/storage.js", () => ({
  DocumentoNaoEncontradoError: class DocumentoNaoEncontradoError extends Error {},
  carregarDocumento: (...args: unknown[]) => carregarDocumento(...args),
  criarDocumento: vi.fn(),
  listarCadernos: vi.fn(),
  listarDocumentos: vi.fn(),
  removerDocumento: vi.fn(),
  salvarExercicios: vi.fn(),
  salvarFlashcards: vi.fn(),
  salvarMapaMental: vi.fn(),
  salvarQuiz: vi.fn(),
  salvarResumo: vi.fn(),
}));

// Ollama SEMPRE mockado.
const generate = vi.fn();
const listModels = vi.fn();
vi.mock("../../src/main/services/ollama.js", () => ({
  OllamaIndisponivelError: class OllamaIndisponivelError extends Error {
    readonly code = "OLLAMA_INDISPONIVEL" as const;
    constructor() {
      super("O Ollama não está rodando. Inicie o Ollama e tente novamente.");
      this.name = "OllamaIndisponivelError";
    }
  },
  GeracaoFalhouError: class GeracaoFalhouError extends Error {
    readonly code = "GERACAO_FALHOU" as const;
    constructor() {
      super(
        "A geração falhou ou demorou demais. Tente novamente, reduza a " +
          "quantidade, ou use um modelo mais leve.",
      );
      this.name = "GeracaoFalhouError";
    }
  },
  generate: (...args: unknown[]) => generate(...args),
  isOllamaRunning: vi.fn(async () => true),
  listModels: (...args: unknown[]) => listModels(...args),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";
import {
  GeracaoFalhouError,
  OllamaIndisponivelError,
} from "../../src/main/services/ollama.js";

const evento = { sender: {} } as unknown as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const plano: PlanoEstudo = {
  ordinal: "segunda",
  horasPorDia: 2,
  diasPorSemana: 5,
  topicos: [
    { id: "b1", titulo: "B1", novo: false },
    { id: "b2", titulo: "B2", novo: false },
    { id: "n1", titulo: "N1", novo: true },
  ],
  checkpoint: "lembrete",
  atualizadoEm: "2026-03-01T00:00:00.000Z",
};

function provaDe(p?: PlanoEstudo): Prova {
  return {
    id: "p1",
    titulo: "Prova",
    data: "2026-03-30",
    vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" },
    intervalos: [7, 3, 1],
    sessoes: [],
    criadoEm: "2026-03-01T00:00:00.000Z",
    atualizadoEm: "2026-03-01T00:00:00.000Z",
    ...(p !== undefined ? { plano: p } : {}),
  };
}

const quizJson = JSON.stringify({
  perguntas: Array.from({ length: 5 }, (_, i) => ({
    tipo: "multipla",
    enunciado: `Pergunta ${i}?`,
    alternativas: [
      { texto: "certa", correta: true },
      { texto: "errada", correta: false },
    ],
  })),
});

beforeEach(() => {
  registered.clear();
  for (const m of [
    carregarProva,
    salvarDiagnostico,
    registrarRespostasDiagnostico,
    carregarDocumento,
    generate,
    listModels,
  ]) {
    m.mockReset();
  }
  listModels.mockResolvedValue([]);
  carregarDocumento.mockImplementation(async (id: string) => ({
    texto: `texto do documento ${id}`,
  }));
  salvarDiagnostico.mockImplementation(
    async (_id: string, diagnostico: unknown) => ({
      ...provaDe(plano),
      diagnostico,
    }),
  );
  registerIpcHandlers();
});

describe("IPC gerarDiagnostico", () => {
  it("registra os dois canais", () => {
    expect(registered.has(IPC_CHANNELS.gerarDiagnostico)).toBe(true);
    expect(registered.has(IPC_CHANNELS.responderDiagnostico)).toBe(true);
  });

  it("gera, persiste e devolve a prova com o diagnóstico pendente", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    generate.mockResolvedValue(quizJson);
    const prova = (await chamar(IPC_CHANNELS.gerarDiagnostico, "p1")) as Prova;
    expect(prova.diagnostico?.perguntas).toHaveLength(9);
    expect(salvarDiagnostico).toHaveBeenCalledTimes(1);
    expect(salvarDiagnostico.mock.calls[0][0]).toBe("p1");
    // Geração estruturada: sempre format "json".
    for (const [params] of generate.mock.calls) {
      expect((params as { format?: string }).format).toBe("json");
    }
  });

  it("prova sem plano ⇒ mensagem própria e a IA não é chamada", async () => {
    carregarProva.mockResolvedValue(provaDe());
    await expect(chamar(IPC_CHANNELS.gerarDiagnostico, "p1")).rejects.toThrow(
      "Monte o plano de estudo antes de fazer o diagnóstico.",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("tópicos que falham ao carregar viram sem texto ⇒ indisponível, sem derrubar", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    carregarDocumento.mockRejectedValue(new Error("EACCES"));
    await expect(chamar(IPC_CHANNELS.gerarDiagnostico, "p1")).rejects.toThrow(
      "ao menos um assunto de base com material importado",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("falha de geração sai com a frase do diagnóstico, nunca 'offline'", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    generate.mockRejectedValue(new GeracaoFalhouError());
    const erro = (await chamar(IPC_CHANNELS.gerarDiagnostico, "p1").catch(
      (e: unknown) => e,
    )) as Error;
    expect(erro.message).toBe(
      "A geração das perguntas falhou ou demorou demais. Tente novamente ou use um modelo mais leve.",
    );
    expect(erro.message).not.toMatch(/offline|quantidade/i);
  });

  it("Ollama offline mantém a mensagem de offline", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    generate.mockRejectedValue(new OllamaIndisponivelError());
    await expect(chamar(IPC_CHANNELS.gerarDiagnostico, "p1")).rejects.toThrow(
      "O Ollama não está rodando",
    );
  });

  it("guarda de concorrência: 2ª chamada é recusada e a guarda é liberada no finally", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    let liberar: (v: string) => void = () => {};
    generate.mockImplementationOnce(
      () => new Promise<string>((resolve) => (liberar = resolve)),
    );
    generate.mockResolvedValue(quizJson);

    const primeira = chamar(IPC_CHANNELS.gerarDiagnostico, "p1");
    // Dá a chance de a 1ª chamada chegar até o `generate` pendente.
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    await expect(chamar(IPC_CHANNELS.gerarDiagnostico, "p1")).rejects.toThrow(
      "Já estou preparando o diagnóstico desta prova.",
    );

    liberar(quizJson);
    await primeira;

    // Liberada: uma nova geração é aceita.
    await expect(
      chamar(IPC_CHANNELS.gerarDiagnostico, "p1"),
    ).resolves.toBeDefined();
  });

  it("a guarda também é liberada quando a geração falha", async () => {
    carregarProva.mockResolvedValue(provaDe(plano));
    generate.mockRejectedValueOnce(new GeracaoFalhouError());
    await expect(chamar(IPC_CHANNELS.gerarDiagnostico, "p1")).rejects.toThrow();
    generate.mockResolvedValue(quizJson);
    await expect(
      chamar(IPC_CHANNELS.gerarDiagnostico, "p1"),
    ).resolves.toBeDefined();
  });
});

describe("IPC responderDiagnostico", () => {
  it("delega ao serviço com as escolhas e devolve a prova", async () => {
    const retorno = provaDe(plano);
    registrarRespostasDiagnostico.mockResolvedValue(retorno);
    const r = await chamar(IPC_CHANNELS.responderDiagnostico, "p1", [0, -1, 1]);
    expect(r).toBe(retorno);
    expect(registrarRespostasDiagnostico.mock.calls[0][0]).toBe("p1");
    expect(registrarRespostasDiagnostico.mock.calls[0][1]).toEqual([0, -1, 1]);
  });

  it("erro do serviço vira a mensagem amigável", async () => {
    registrarRespostasDiagnostico.mockRejectedValue(
      new (
        await import("../../src/main/services/provas.js")
      ).DadosProvaInvalidosError("Responda todas as perguntas para ver o resultado."),
    );
    await expect(
      chamar(IPC_CHANNELS.responderDiagnostico, "p1", [0]),
    ).rejects.toThrow("Responda todas as perguntas para ver o resultado.");
  });
});
