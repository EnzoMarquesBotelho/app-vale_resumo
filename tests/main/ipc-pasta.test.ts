import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { ResultadoImportacaoPasta } from "@shared/types";

/** Captura os handlers registrados via ipcMain.handle para inspeção. */
const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();

const showOpenDialog = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => {
      registered.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
  app: { getPath: vi.fn(() => "/tmp") },
}));

// Serviço de pasta mockado: o teste de IPC valida só o wiring (dialog →
// serviço → resultado), não a varredura real (coberta em pasta.test.ts).
const importarPasta = vi.fn();
vi.mock("../../src/main/services/pasta.js", () => ({
  importarPasta: (...args: unknown[]) => importarPasta(...args),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const resultado: ResultadoImportacaoPasta = {
  importados: 3,
  ignoradosPorFormato: 1,
  ignoradosPorDuplicata: 0,
  falhas: 0,
  cadernosTocados: ["Cálculo — Teórica", "Física"],
  limiteExcedido: null,
};

describe("IPC: importar pasta", () => {
  beforeEach(() => {
    registered.clear();
    showOpenDialog.mockReset();
    importarPasta.mockReset();
    registerIpcHandlers();
  });

  it("registra o canal de importar pasta", () => {
    expect(registered.has(IPC_CHANNELS.importarPasta)).toBe(true);
  });

  it("devolve null quando o usuário cancela", async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const r = await chamar(IPC_CHANNELS.importarPasta);
    expect(r).toBeNull();
    expect(importarPasta).not.toHaveBeenCalled();
  });

  it("devolve null quando não há pasta selecionada", async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
    const r = await chamar(IPC_CHANNELS.importarPasta);
    expect(r).toBeNull();
    expect(importarPasta).not.toHaveBeenCalled();
  });

  it("abre o seletor em modo diretório e repassa o resultado do serviço", async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["C:\\Users\\x\\Facul"],
    });
    importarPasta.mockResolvedValue(resultado);

    const r = await chamar(IPC_CHANNELS.importarPasta);
    expect(r).toEqual(resultado);
    expect(importarPasta).toHaveBeenCalledWith("C:\\Users\\x\\Facul");
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ["openDirectory"] }),
    );
  });

  it("converte erro inesperado do serviço em mensagem amigável genérica", async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["C:\\Users\\x\\Facul"],
    });
    importarPasta.mockRejectedValue(new Error("raiz ilegível"));

    await expect(chamar(IPC_CHANNELS.importarPasta)).rejects.toThrow(
      /Não foi possível importar a pasta/,
    );
  });
});
