import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

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
}));

// Ollama mockado no nível do serviço: `generate` não chama modelo real.
// `listModels` devolve uma lista para exercitar a resolução via modeloParaGeracao.
const generate =
  vi.fn<
    (p: {
      prompt: string;
      model?: string;
      format?: "json" | Record<string, unknown>;
    }) => Promise<string>
  >();
const listModels = vi.fn<() => Promise<string[]>>();
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
  generate: (params: {
    prompt: string;
    model?: string;
    format?: "json" | Record<string, unknown>;
  }) => generate(params),
  isOllamaRunning: vi.fn(),
  listModels: () => listModels(),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import type { PerguntaQuiz } from "@shared/types";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";
import {
  GeracaoFalhouError,
  OllamaIndisponivelError,
} from "../../src/main/services/ollama.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const quizValido = JSON.stringify({
  perguntas: [
    {
      tipo: "multipla",
      enunciado: "Quanto é 2+2?",
      alternativas: [
        { texto: "3", correta: false },
        { texto: "4", correta: true },
      ],
    },
  ],
});

describe("IPC: gerar quiz", () => {
  beforeEach(() => {
    registered.clear();
    generate.mockReset();
    listModels.mockReset();
    listModels.mockResolvedValue([]);
    registerIpcHandlers();
  });

  it("registra o canal de gerar quiz", () => {
    expect(registered.has(IPC_CHANNELS.gerarQuiz)).toBe(true);
  });

  it("gera o quiz chamando o Ollama (mockado) e devolve as perguntas", async () => {
    generate.mockResolvedValue(quizValido);

    const perguntas = (await chamar(
      IPC_CHANNELS.gerarQuiz,
      "texto base",
      "multipla",
      5,
    )) as PerguntaQuiz[];

    expect(perguntas).toHaveLength(1);
    expect(perguntas[0].tipo).toBe("multipla");
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params.prompt).toContain("texto base");
    // Sem modelo instalado, cai no default (modeloParaGeracao → selecionado).
    expect(params.model).toBe("llama3.1:8b");
    // A geração estruturada força JSON nativo do Ollama.
    expect(params.format).toBe("json");
  });

  it("resolve o modelo via modeloParaGeracao (reconcilia a família instalada)", async () => {
    // O default `llama3.1:8b` não está instalado, mas há `llama3.1:latest`.
    listModels.mockResolvedValue(["llama3.1:latest"]);
    generate.mockResolvedValue(quizValido);

    await chamar(IPC_CHANNELS.gerarQuiz, "texto base", "multipla", 5);

    const params = generate.mock.calls[0][0];
    expect(params.model).toBe("llama3.1:latest");
  });

  it("re-tenta quando o 1º JSON vem malformado, sem quebrar", async () => {
    generate.mockResolvedValueOnce("não é json").mockResolvedValueOnce(quizValido);

    const perguntas = (await chamar(
      IPC_CHANNELS.gerarQuiz,
      "texto base",
      "multipla",
      5,
    )) as PerguntaQuiz[];

    expect(perguntas).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("converte JSON inválido persistente em mensagem amigável", async () => {
    generate.mockResolvedValue("nunca é json");

    await expect(
      chamar(IPC_CHANNELS.gerarQuiz, "texto base", "misto", 10),
    ).rejects.toThrow(/formato válido/);
  });

  it("converte falha genérica em mensagem amigável", async () => {
    generate.mockRejectedValue(new Error("falha interna"));

    await expect(
      chamar(IPC_CHANNELS.gerarQuiz, "texto base", "misto", 10),
    ).rejects.toThrow(/Não foi possível gerar o quiz/);
  });

  it("mapeia GeracaoFalhouError para a mensagem honesta (não 'offline')", async () => {
    generate.mockRejectedValue(new GeracaoFalhouError());

    await expect(
      chamar(IPC_CHANNELS.gerarQuiz, "texto base", "misto", 100),
    ).rejects.toThrow(/demorou demais|reduza a quantidade/);
  });

  it("mapeia OllamaIndisponivelError para a mensagem de offline", async () => {
    generate.mockRejectedValue(new OllamaIndisponivelError());

    await expect(
      chamar(IPC_CHANNELS.gerarQuiz, "texto base", "misto", 10),
    ).rejects.toThrow(/Ollama não está rodando/);
  });
});
