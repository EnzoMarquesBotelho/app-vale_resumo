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
  vi.fn<(p: { prompt: string; model?: string }) => Promise<string>>();
const listModels = vi.fn<() => Promise<string[]>>();
vi.mock("../../src/main/services/ollama.js", () => ({
  OllamaIndisponivelError: class OllamaIndisponivelError extends Error {
    readonly code = "OLLAMA_INDISPONIVEL" as const;
  },
  generate: (params: { prompt: string; model?: string }) => generate(params),
  isOllamaRunning: vi.fn(),
  listModels: () => listModels(),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import type { NoMapaMental } from "@shared/types";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const arvoreValida =
  '{"raiz":{"rotulo":"Tema","filhos":[{"rotulo":"Ramo","filhos":[]}]}}';

describe("IPC: gerar mapa mental", () => {
  beforeEach(() => {
    registered.clear();
    generate.mockReset();
    listModels.mockReset();
    listModels.mockResolvedValue([]);
    registerIpcHandlers();
  });

  it("registra o canal de gerar mapa mental", () => {
    expect(registered.has(IPC_CHANNELS.gerarMapaMental)).toBe(true);
  });

  it("gera a árvore chamando o Ollama (mockado) e devolve a raiz", async () => {
    generate.mockResolvedValue(arvoreValida);

    const raiz = (await chamar(
      IPC_CHANNELS.gerarMapaMental,
      "texto base",
    )) as NoMapaMental;

    expect(raiz.rotulo).toBe("Tema");
    expect(raiz.filhos).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
    const params = generate.mock.calls[0][0];
    expect(params.prompt).toContain("texto base");
    // Sem modelo instalado, cai no default (modeloParaGeracao → selecionado).
    expect(params.model).toBe("llama3.1:8b");
  });

  it("resolve o modelo via modeloParaGeracao (reconcilia a família instalada)", async () => {
    // O default `llama3.1:8b` não está instalado, mas há `llama3.1:latest`.
    listModels.mockResolvedValue(["llama3.1:latest"]);
    generate.mockResolvedValue(arvoreValida);

    await chamar(IPC_CHANNELS.gerarMapaMental, "texto base");

    const params = generate.mock.calls[0][0];
    expect(params.model).toBe("llama3.1:latest");
  });

  it("re-tenta quando o 1º JSON vem malformado, sem quebrar", async () => {
    generate
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(arvoreValida);

    const raiz = (await chamar(
      IPC_CHANNELS.gerarMapaMental,
      "texto base",
    )) as NoMapaMental;

    expect(raiz.rotulo).toBe("Tema");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("converte JSON inválido persistente em mensagem amigável", async () => {
    generate.mockResolvedValue("nunca é json");

    await expect(
      chamar(IPC_CHANNELS.gerarMapaMental, "texto base"),
    ).rejects.toThrow(/formato válido/);
  });

  it("converte falha genérica em mensagem amigável", async () => {
    generate.mockRejectedValue(new Error("falha interna"));

    await expect(
      chamar(IPC_CHANNELS.gerarMapaMental, "texto base"),
    ).rejects.toThrow(/Não foi possível gerar o mapa mental/);
  });
});
