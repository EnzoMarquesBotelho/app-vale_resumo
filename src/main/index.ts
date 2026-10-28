import { resolve } from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc/index.js";
import { migrarCadernos } from "./services/storage.js";

const isDev = !app.isPackaged;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    title: "Desenrola",
    // Ícone da janela/barra de tarefas. Em produção o electron-builder embute o
    // ícone no .exe; aqui garantimos também em dev. `resources/` fica fora de
    // `out/`, então sobe dois níveis a partir de out/main.
    icon: resolve(__dirname, "../../resources/icons/icon-256.png"),
    webPreferences: {
      preload: resolve(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on("ready-to-show", () => {
    window.show();
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(resolve(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  // Migra documentos legados para o modelo de cadernos ANTES de registrar os
  // handlers de IPC e abrir a janela. É best-effort e nunca lança, então não
  // impede o app de abrir.
  await migrarCadernos();
  registerIpcHandlers();
  createWindow();

  // Checagem silenciosa do boot (FR1/FR7). Import preguiçoso (coerente com o
  // wiring do updater em ipc/index.ts); no-op em dev e silencioso em erro de
  // rede. Best-effort: não bloqueia a abertura da janela.
  void import("./services/updater.js").then((svc) => svc.verificarNoBoot());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
