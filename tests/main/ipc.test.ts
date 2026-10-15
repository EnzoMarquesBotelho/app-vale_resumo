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
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

describe("IPC: canal de teste ping", () => {
  beforeEach(() => {
    registered.clear();
    registerIpcHandlers();
  });

  it("registra o handler no canal de ping", () => {
    expect(registered.has(IPC_CHANNELS.ping)).toBe(true);
  });

  it("responde com pong incluindo a mensagem recebida", () => {
    const handler = registered.get(IPC_CHANNELS.ping);
    expect(handler).toBeDefined();
    const resposta = handler?.({} as IpcMainInvokeEvent, "renderer");
    expect(resposta).toBe("pong: renderer");
  });
});
