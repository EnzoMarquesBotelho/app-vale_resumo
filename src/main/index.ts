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
    title: "App de Estudos com IA Local",
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
