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
const generate = vi.fn<(p: { prompt: string; model?: string }) => Promise<string>>();
vi.mock("../../src/main/services/ollama.js", () => ({
  OllamaIndisponivelError: class OllamaIndisponivelError extends Error {
    readonly code = "OLLAMA_INDISPONIVEL" as const;
  },
  generate: (params: { prompt: string; model?: string }) => generate(params),
  isOllamaRunning: vi.fn(),
  listModels: vi.fn(),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import type { ModoResumo } from "@shared/types";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

describe("IPC: gerar resumo", () => {
  beforeEach(() => {
    registered.clear();
    generate.mockReset();
    registerIpcHandlers();
  });

  it("registra o canal de gerar resumo", () => {
    expect(registered.has(IPC_CHANNELS.gerarResumo)).toBe(true);
  });

  it("gera o resumo chamando o Ollama (mockado) e devolve o texto", async () => {
    generate.mockResolvedValue("resumo gerado");

    const resumo = await chamar(
      IPC_CHANNELS.gerarResumo,
      "texto para resumir",
      "curto" satisfies ModoResumo,
    );

    expect(resumo).toBe("resumo gerado");
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params.prompt).toContain("texto para resumir");
    expect(params.model).toBe("llama3.1:8b");
  });

  it("converte falha em mensagem amigável", async () => {
    generate.mockRejectedValue(new Error("falha interna"));

    await expect(
      chamar(IPC_CHANNELS.gerarResumo, "abc", "curto"),
    ).rejects.toThrow(/Não foi possível gerar o resumo/);
  });
});
