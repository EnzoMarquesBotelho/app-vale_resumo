import { contextBridge } from "electron";

/**
 * Minimal, safe API exposed to the renderer during scaffolding.
 * The full typed IPC surface is added in a later task.
 */
const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
} as const;

contextBridge.exposeInMainWorld("api", api);

export type PreloadApi = typeof api;
