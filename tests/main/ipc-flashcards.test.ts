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
import type { Flashcard } from "@shared/types";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

describe("IPC: gerar flashcards", () => {
  beforeEach(() => {
    registered.clear();
    generate.mockReset();
    registerIpcHandlers();
  });

  it("registra o canal de gerar flashcards", () => {
    expect(registered.has(IPC_CHANNELS.gerarFlashcards)).toBe(true);
  });

  it("gera flashcards chamando o Ollama (mockado) e devolve a lista", async () => {
    generate.mockResolvedValue(
      '{"flashcards":[{"pergunta":"P","resposta":"R"}]}',
    );

    const cards = (await chamar(
      IPC_CHANNELS.gerarFlashcards,
      "texto base",
      5,
    )) as Flashcard[];

    expect(cards).toEqual([{ pergunta: "P", resposta: "R" }]);
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params.prompt).toContain("texto base");
    expect(params.model).toBe("llama3.1:8b");
    // A geração estruturada força JSON nativo do Ollama.
    expect(params.format).toBe("json");
  });

  it("re-tenta quando o 1º JSON vem malformado, sem quebrar", async () => {
    generate
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce('{"flashcards":[{"pergunta":"P","resposta":"R"}]}');

    const cards = (await chamar(
      IPC_CHANNELS.gerarFlashcards,
      "texto base",
      10,
    )) as Flashcard[];

    expect(cards).toEqual([{ pergunta: "P", resposta: "R" }]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("converte JSON inválido persistente em mensagem amigável", async () => {
    generate.mockResolvedValue("nunca é json");

    await expect(
      chamar(IPC_CHANNELS.gerarFlashcards, "texto base", 10),
    ).rejects.toThrow(/formato válido/);
  });

  it("converte falha genérica em mensagem amigável", async () => {
    generate.mockRejectedValue(new Error("falha interna"));

    await expect(
      chamar(IPC_CHANNELS.gerarFlashcards, "texto base", 10),
    ).rejects.toThrow(/Não foi possível gerar os flashcards/);
  });
});
