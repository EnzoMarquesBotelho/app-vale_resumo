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

// Ollama HTTP mockado via mock do módulo de serviço (sem modelo real).
const isOllamaRunning = vi.fn<() => Promise<boolean>>();
const listModels = vi.fn<() => Promise<string[]>>();
vi.mock("../../src/main/services/ollama.js", () => ({
  isOllamaRunning: () => isOllamaRunning(),
  listModels: () => listModels(),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { defaultModel } from "@shared/constants";
import type { OllamaStatus } from "@shared/types";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<OllamaStatus> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return handler(evento, ...args) as Promise<OllamaStatus>;
}

describe("IPC: status do Ollama", () => {
  beforeEach(() => {
    registered.clear();
    isOllamaRunning.mockReset();
    listModels.mockReset();
    registerIpcHandlers();
  });

  it("registra os canais de status e seleção de modelo", () => {
    expect(registered.has(IPC_CHANNELS.ollamaStatus)).toBe(true);
    expect(registered.has(IPC_CHANNELS.ollamaSelecionarModelo)).toBe(true);
  });

  it("reporta disponível com modelos e o default selecionado", async () => {
    isOllamaRunning.mockResolvedValue(true);
    listModels.mockResolvedValue(["llama3.1:8b", "qwen2.5:7b"]);

    const status = await chamar(IPC_CHANNELS.ollamaStatus);

    expect(status.disponivel).toBe(true);
    expect(status.modelos).toEqual(["llama3.1:8b", "qwen2.5:7b"]);
    expect(status.modeloSelecionado).toBe(defaultModel);
  });

  it("reporta indisponível e lista de modelos vazia quando offline, sem consultar modelos", async () => {
    isOllamaRunning.mockResolvedValue(false);

    const status = await chamar(IPC_CHANNELS.ollamaStatus);

    expect(status.disponivel).toBe(false);
    expect(status.modelos).toEqual([]);
    expect(listModels).not.toHaveBeenCalled();
  });

  it("ignora modelo vazio e mantém o atual", async () => {
    isOllamaRunning.mockResolvedValue(false);

    const status = await chamar(IPC_CHANNELS.ollamaSelecionarModelo, "   ");
    expect(status.modeloSelecionado).toBe(defaultModel);
  });

  // Deve ser o último: muta o estado em memória do modelo selecionado, que é
  // compartilhado entre os testes deste arquivo (módulo carregado uma vez).
  it("troca o modelo selecionado e mantém a escolha", async () => {
    isOllamaRunning.mockResolvedValue(true);
    listModels.mockResolvedValue(["llama3.1:8b", "qwen2.5:7b"]);

    const status = await chamar(
      IPC_CHANNELS.ollamaSelecionarModelo,
      "qwen2.5:7b",
    );
    expect(status.modeloSelecionado).toBe("qwen2.5:7b");

    const depois = await chamar(IPC_CHANNELS.ollamaStatus);
    expect(depois.modeloSelecionado).toBe("qwen2.5:7b");
  });
});
