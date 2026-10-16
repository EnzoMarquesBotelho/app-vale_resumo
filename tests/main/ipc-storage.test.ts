import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { DocumentoSalvo } from "@shared/types";

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
}));

// Serviço de storage mockado: o teste de IPC só valida o fiação (wiring),
// não o acesso a disco (coberto em storage.test.ts).
const criarDocumento = vi.fn();
const carregarDocumento = vi.fn();
const listarDocumentos = vi.fn();
const salvarResumo = vi.fn();
const salvarFlashcards = vi.fn();
const salvarExercicios = vi.fn();
const removerDocumento = vi.fn();

vi.mock("../../src/main/services/storage.js", () => ({
  DocumentoNaoEncontradoError: class DocumentoNaoEncontradoError extends Error {
    readonly code = "DOCUMENTO_NAO_ENCONTRADO" as const;
    constructor() {
      super("Documento não encontrado. Ele pode ter sido removido.");
    }
  },
  criarDocumento: (...args: unknown[]) => criarDocumento(...args),
  carregarDocumento: (...args: unknown[]) => carregarDocumento(...args),
  listarDocumentos: (...args: unknown[]) => listarDocumentos(...args),
  salvarResumo: (...args: unknown[]) => salvarResumo(...args),
  salvarFlashcards: (...args: unknown[]) => salvarFlashcards(...args),
  salvarExercicios: (...args: unknown[]) => salvarExercicios(...args),
  removerDocumento: (...args: unknown[]) => removerDocumento(...args),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const documento: DocumentoSalvo = {
  id: "abc",
  nome: "a.txt",
  formato: "txt",
  texto: "conteúdo",
  importadoEm: "2026-01-01T00:00:00.000Z",
  atualizadoEm: "2026-01-01T00:00:00.000Z",
};

describe("IPC: persistência", () => {
  beforeEach(() => {
    registered.clear();
    criarDocumento.mockReset();
    carregarDocumento.mockReset();
    listarDocumentos.mockReset();
    salvarResumo.mockReset();
    salvarFlashcards.mockReset();
    salvarExercicios.mockReset();
    removerDocumento.mockReset();
    registerIpcHandlers();
  });

  it("registra todos os canais de persistência", () => {
    expect(registered.has(IPC_CHANNELS.criarDocumento)).toBe(true);
    expect(registered.has(IPC_CHANNELS.carregarDocumento)).toBe(true);
    expect(registered.has(IPC_CHANNELS.listarDocumentos)).toBe(true);
    expect(registered.has(IPC_CHANNELS.salvarResumo)).toBe(true);
    expect(registered.has(IPC_CHANNELS.salvarFlashcards)).toBe(true);
    expect(registered.has(IPC_CHANNELS.salvarExercicios)).toBe(true);
    expect(registered.has(IPC_CHANNELS.removerDocumento)).toBe(true);
  });

  it("criarDocumento repassa nome/formato/texto ao serviço", async () => {
    criarDocumento.mockResolvedValue(documento);
    const resultado = await chamar(
      IPC_CHANNELS.criarDocumento,
      "a.txt",
      "txt",
      "conteúdo",
    );
    expect(resultado).toEqual(documento);
    expect(criarDocumento).toHaveBeenCalledWith({
      nome: "a.txt",
      formato: "txt",
      texto: "conteúdo",
    });
  });

  it("carregarDocumento devolve o documento do serviço", async () => {
    carregarDocumento.mockResolvedValue(documento);
    const resultado = await chamar(IPC_CHANNELS.carregarDocumento, "abc");
    expect(resultado).toEqual(documento);
    expect(carregarDocumento).toHaveBeenCalledWith("abc");
  });

  it("listarDocumentos devolve a lista do serviço", async () => {
    listarDocumentos.mockResolvedValue([]);
    const resultado = await chamar(IPC_CHANNELS.listarDocumentos);
    expect(resultado).toEqual([]);
  });

  it("converte falha de persistência em mensagem amigável", async () => {
    salvarResumo.mockRejectedValue(new Error("disco cheio"));
    await expect(
      chamar(IPC_CHANNELS.salvarResumo, "abc", {}),
    ).rejects.toThrow(/Não foi possível salvar ou carregar os dados/);
  });

  it("removerDocumento chama o serviço com o id", async () => {
    removerDocumento.mockResolvedValue(undefined);
    await chamar(IPC_CHANNELS.removerDocumento, "abc");
    expect(removerDocumento).toHaveBeenCalledWith("abc");
  });
});
