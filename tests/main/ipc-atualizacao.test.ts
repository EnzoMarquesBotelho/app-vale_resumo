import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

/**
 * Testes dos handlers IPC do updater. Molde de `ipc.test.ts` (captura
 * `ipcMain.handle` num Map), com `electron-updater` MOCKADO e um `electron`
 * mock que inclui `app.isPackaged` controlável e `BrowserWindow` (para o
 * wiring do push entrar no ramo guardado). Os handlers resolvem o serviço por
 * dynamic import(), então o mock de `electron-updater` é usado.
 */

let packaged = true;
const send = vi.fn();

const autoUpdater = {
  autoDownload: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};

const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();

vi.mock("electron-updater", () => ({
  default: { autoUpdater },
  autoUpdater,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => {
      registered.set(channel, handler);
    },
  },
  app: {
    get isPackaged() {
      return packaged;
    },
  },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send, isDestroyed: () => false } }],
  },
}));

import { IPC_CHANNELS } from "@shared/ipc";

/** Invoca um handler registrado pelo canal. */
async function invocar(canal: string): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler não registrado: ${canal}`);
  return handler({} as IpcMainInvokeEvent);
}

beforeEach(async () => {
  packaged = true;
  registered.clear();
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdates.mockReset();
  autoUpdater.downloadUpdate.mockReset();
  autoUpdater.quitAndInstall.mockReset();
  autoUpdater.on.mockReset();
  vi.resetModules();
  const { registerIpcHandlers } = await import("../../src/main/ipc/index.js");
  registerIpcHandlers();
});

describe("IPC updater: registro dos canais", () => {
  it("registra verificar/baixar/reiniciar", () => {
    expect(registered.has(IPC_CHANNELS.atualizacao.verificar)).toBe(true);
    expect(registered.has(IPC_CHANNELS.atualizacao.baixar)).toBe(true);
    expect(registered.has(IPC_CHANNELS.atualizacao.reiniciar)).toBe(true);
  });
});

describe("IPC updater: comportamento dos handlers", () => {
  it("verificar em dev resolve dev-unavailable", async () => {
    packaged = false;
    const estado = await invocar(IPC_CHANNELS.atualizacao.verificar);
    expect(estado).toEqual({ tipo: "dev-unavailable" });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("verificar empacotado resolve checking e dispara checkForUpdates", async () => {
    packaged = true;
    const estado = await invocar(IPC_CHANNELS.atualizacao.verificar);
    expect(estado).toEqual({ tipo: "checking" });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("reiniciar chama o serviço (no-op fora de ready)", async () => {
    packaged = true;
    // Sem estado ready → quitAndInstall não é chamado, mas o handler resolve.
    await expect(
      invocar(IPC_CHANNELS.atualizacao.reiniciar),
    ).resolves.toBeUndefined();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
