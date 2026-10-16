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
const generate =
  vi.fn<
    (p: {
      prompt: string;
      model?: string;
      format?: "json" | Record<string, unknown>;
    }) => Promise<string>
  >();
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
  listModels: vi.fn(),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import type { Exercicio } from "@shared/types";
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

describe("IPC: gerar exercícios", () => {
  beforeEach(() => {
    registered.clear();
    generate.mockReset();
    registerIpcHandlers();
  });

  it("registra o canal de gerar exercícios", () => {
    expect(registered.has(IPC_CHANNELS.gerarExercicios)).toBe(true);
  });

  it("gera exercícios chamando o Ollama (mockado) e devolve a lista com o modo", async () => {
    generate.mockResolvedValue(
      '{"exercicios":[{"enunciado":"E","resposta":"R"}]}',
    );

    const lista = (await chamar(
      IPC_CHANNELS.gerarExercicios,
      "texto base",
      "teorica",
      5,
    )) as Exercicio[];

    expect(lista).toEqual([
      { enunciado: "E", resposta: "R", modo: "teorica" },
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params.prompt).toContain("texto base");
    expect(params.prompt).toContain("PURAMENTE TEÓRICOS");
    expect(params.model).toBe("llama3.1:8b");
    // A geração estruturada força JSON nativo do Ollama.
    expect(params.format).toBe("json");
  });

  it("re-tenta quando o 1º JSON vem malformado, sem quebrar", async () => {
    generate
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(
        '{"exercicios":[{"enunciado":"E","resposta":"R"}]}',
      );

    const lista = (await chamar(
      IPC_CHANNELS.gerarExercicios,
      "texto base",
      "mista",
      10,
    )) as Exercicio[];

    expect(lista).toEqual([{ enunciado: "E", resposta: "R", modo: "mista" }]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("converte JSON inválido persistente em mensagem amigável", async () => {
    generate.mockResolvedValue("nunca é json");

    await expect(
      chamar(IPC_CHANNELS.gerarExercicios, "texto base", "mista", 10),
    ).rejects.toThrow(/formato válido/);
  });

  it("converte falha genérica em mensagem amigável", async () => {
    generate.mockRejectedValue(new Error("falha interna"));

    await expect(
      chamar(IPC_CHANNELS.gerarExercicios, "texto base", "mista", 10),
    ).rejects.toThrow(/Não foi possível gerar os exercícios/);
  });

  it("mapeia GeracaoFalhouError para a mensagem honesta (não 'offline')", async () => {
    generate.mockRejectedValue(new GeracaoFalhouError());

    await expect(
      chamar(IPC_CHANNELS.gerarExercicios, "texto base", "mista", 100),
    ).rejects.toThrow(/demorou demais|reduza a quantidade/);
  });

  it("mapeia OllamaIndisponivelError para a mensagem de offline", async () => {
    generate.mockRejectedValue(new OllamaIndisponivelError());

    await expect(
      chamar(IPC_CHANNELS.gerarExercicios, "texto base", "mista", 10),
    ).rejects.toThrow(/Ollama não está rodando/);
  });
});
