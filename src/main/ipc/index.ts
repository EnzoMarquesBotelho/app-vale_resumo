import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import { extensoesSuportadas } from "@shared/constants";
import type { ArquivoImportado } from "@shared/types";
import { importarArquivo } from "../services/files.js";

/**
 * Registra todos os handlers de IPC do processo main.
 * Chamado uma única vez quando o app fica pronto.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.ping,
    (_event, mensagem: string): string => `pong: ${mensagem}`,
  );

  ipcMain.handle(
    IPC_CHANNELS.importarArquivo,
    async (): Promise<ArquivoImportado | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Importar arquivo de estudo",
        properties: ["openFile"],
        filters: [
          {
            name: "Arquivos de estudo",
            extensions: [...extensoesSuportadas],
          },
        ],
      });

      if (canceled || filePaths.length === 0) {
        return null;
      }

      return importarArquivo(filePaths[0]);
    },
  );
}
