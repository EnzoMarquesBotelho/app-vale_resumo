import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";

/**
 * Testes do serviço do main com `electron-updater` e `electron` MOCKADOS.
 * Nenhum toca a rede, o autoUpdater real ou o disco. O estado do serviço é de
 * módulo (singleton), então cada teste reseta os módulos e re-importa um
 * serviço fresco via `carregarServico()`.
 */

let packaged = true;
let destruido = false;
const listeners = new Map<string, (...args: unknown[]) => void>();
const send = vi.fn();

const autoUpdater = {
  autoDownload: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn((ev: string, cb: (...args: unknown[]) => void) => {
    listeners.set(ev, cb);
  }),
};

vi.mock("electron-updater", () => ({
  default: { autoUpdater },
  autoUpdater,
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return packaged;
    },
  },
  BrowserWindow: {
    getAllWindows: () => [
      { webContents: { send, isDestroyed: () => destruido } },
    ],
  },
}));

type Servico = typeof import("../../src/main/services/updater.js");

/** Reseta os módulos e devolve um serviço com estado zerado. */
async function carregarServico(): Promise<Servico> {
  vi.resetModules();
  return import("../../src/main/services/updater.js");
}

/** Conecta o serviço ao webContents mockado. */
function wc(): WebContents {
  return { send, isDestroyed: () => destruido } as unknown as WebContents;
}

/** Dispara um listener capturado pelo mock do autoUpdater. */
function disparar(evento: string, payload?: unknown): void {
  const cb = listeners.get(evento);
  if (!cb) throw new Error(`listener não registrado: ${evento}`);
  cb(payload);
}

beforeEach(() => {
  packaged = true;
  destruido = false;
  autoUpdater.autoDownload = true;
  listeners.clear();
  send.mockClear();
  autoUpdater.checkForUpdates.mockReset();
  autoUpdater.downloadUpdate.mockReset();
  autoUpdater.quitAndInstall.mockReset();
  autoUpdater.on.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updater service: guard em dev", () => {
  it("verificar em dev resolve dev-unavailable sem tocar o autoUpdater", async () => {
    packaged = false;
    const svc = await carregarServico();
    const estado = await svc.verificarAtualizacao();
    expect(estado).toEqual({ tipo: "dev-unavailable" });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdater.on).not.toHaveBeenCalled();
  });

  it("baixar/reiniciar/verificarNoBoot em dev são no-op", async () => {
    packaged = false;
    const svc = await carregarServico();
    expect(await svc.baixarAtualizacao()).toEqual({ tipo: "dev-unavailable" });
    await svc.reiniciarParaAtualizar();
    await svc.verificarNoBoot();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(autoUpdater.on).not.toHaveBeenCalled();
  });
});

describe("updater service: configuração", () => {
  it("desliga autoDownload após garantir assinatura", async () => {
    const svc = await carregarServico();
    await svc.verificarAtualizacao();
    expect(autoUpdater.autoDownload).toBe(false);
  });

  it("assina cada evento uma única vez (idempotência)", async () => {
    const svc = await carregarServico();
    await svc.verificarAtualizacao();
    await svc.verificarAtualizacao();
    const eventos = [
      "checking-for-update",
      "update-available",
      "update-not-available",
      "download-progress",
      "update-downloaded",
      "error",
    ];
    for (const ev of eventos) {
      const vezes = autoUpdater.on.mock.calls.filter((c) => c[0] === ev).length;
      expect(vezes).toBe(1);
    }
  });
});

describe("updater service: mapeamento dos 6 eventos empurrados", () => {
  it("empurra o UpdaterStatus correto por evento", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();
    send.mockClear();

    disparar("checking-for-update");
    expect(send).toHaveBeenLastCalledWith("atualizacao:status", {
      tipo: "checking",
    });

    disparar("update-available", { version: "0.1.2" });
    expect(send).toHaveBeenLastCalledWith("atualizacao:status", {
      tipo: "available",
      versao: "0.1.2",
    });

    disparar("update-not-available");
    expect(send).toHaveBeenLastCalledWith("atualizacao:status", {
      tipo: "not-available",
    });

    disparar("download-progress", { percent: 42.7 });
    expect(send).toHaveBeenLastCalledWith("atualizacao:status", {
      tipo: "downloading",
      percent: 43,
    });

    disparar("update-downloaded", { version: "0.1.2" });
    expect(send).toHaveBeenLastCalledWith("atualizacao:status", {
      tipo: "ready",
      versao: "0.1.2",
    });
  });
});

describe("updater service: baixar por estado", () => {
  it("available → downloadUpdate uma vez + downloading; 2º clique é no-op", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();
    disparar("update-available", { version: "0.1.2" });

    const estado = await svc.baixarAtualizacao();
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(estado).toEqual({ tipo: "downloading", percent: 0 });

    // Segundo baixar em downloading → não chama de novo.
    const estado2 = await svc.baixarAtualizacao();
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(estado2.tipo).toBe("downloading");
  });

  it("não chama downloadUpdate em idle/not-available/error", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();

    // Estado checking (não available) → no-op.
    await svc.baixarAtualizacao();
    disparar("update-not-available");
    await svc.baixarAtualizacao();
    disparar("error", new Error("boom"));
    await svc.baixarAtualizacao();
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });
});

describe("updater service: reiniciar", () => {
  it("quitAndInstall só em ready", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();

    // Em checking → no-op.
    await svc.reiniciarParaAtualizar();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    disparar("update-downloaded", { version: "0.1.2" });
    await svc.reiniciarParaAtualizar();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe("updater service: FR7 boot silencioso", () => {
  it("erro síncrono no boot não empurra error", async () => {
    autoUpdater.checkForUpdates.mockImplementation(() => {
      throw new Error("net::ERR_INTERNET_DISCONNECTED");
    });
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarNoBoot();
    const empurrouErro = send.mock.calls.some(
      (c) => (c[1] as { tipo?: string })?.tipo === "error",
    );
    expect(empurrouErro).toBe(false);
  });

  it("erro assíncrono no boot não empurra error e volta a idle", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarNoBoot();
    send.mockClear();

    disparar("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
    const empurrouErro = send.mock.calls.some(
      (c) => (c[1] as { tipo?: string })?.tipo === "error",
    );
    expect(empurrouErro).toBe(false);
    expect(svc.statusAtual()).toEqual({ tipo: "idle" });
  });

  it("erro manual é visível", async () => {
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();
    send.mockClear();

    disparar("error", new Error("algo quebrou"));
    const ultimo = send.mock.calls.at(-1);
    expect((ultimo?.[1] as { tipo?: string })?.tipo).toBe("error");
  });
});

describe("updater service: guarda de webContents destruído", () => {
  it("não chama send quando o webContents está destruído", async () => {
    destruido = true;
    const svc = await carregarServico();
    svc.conectarUpdater(() => wc());
    await svc.verificarAtualizacao();
    disparar("checking-for-update");
    expect(send).not.toHaveBeenCalled();
  });
});
