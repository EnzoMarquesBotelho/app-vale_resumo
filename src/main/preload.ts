import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type AppApi } from "@shared/ipc";

/**
 * API tipada exposta ao renderer via `contextBridge`.
 * O renderer nunca acessa `ipcRenderer` diretamente: só os métodos aqui.
 */
const api: AppApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  ping: (mensagem: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.ping, mensagem),
  importarArquivo: () => ipcRenderer.invoke(IPC_CHANNELS.importarArquivo),
  ollamaStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ollamaStatus),
  ollamaSelecionarModelo: (modelo: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ollamaSelecionarModelo, modelo),
  gerarResumo: (texto, modo) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarResumo, texto, modo),
  gerarFlashcards: (texto, quantidade) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarFlashcards, texto, quantidade),
};

contextBridge.exposeInMainWorld("api", api);

export type PreloadApi = AppApi;
