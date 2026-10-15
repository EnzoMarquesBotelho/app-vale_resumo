import { dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import { extensoesSuportadas } from "@shared/constants";
import type { ArquivoImportado } from "@shared/types";
import {
  ArquivoMuitoGrandeError,
  FormatoNaoSuportadoError,
  importarArquivo,
} from "../services/files.js";

/**
 * Converte erros conhecidos da importação em mensagens amigáveis ao usuário.
 * O `message` resultante é exibido diretamente na UI (via rejeição do IPC),
 * então precisa ser uma frase pronta para um usuário iniciante — nunca um
 * detalhe interno. Casos inesperados viram uma mensagem genérica.
 */
function mensagemAmigavel(erro: unknown): string {
  if (erro instanceof FormatoNaoSuportadoError) {
    const lista = extensoesSuportadas.map((e) => `.${e}`).join(", ");
    return `Esse tipo de arquivo ainda não é suportado. Escolha um arquivo ${lista}.`;
  }
  if (erro instanceof ArquivoMuitoGrandeError) {
    return erro.message;
  }
  return "Não foi possível importar o arquivo. Tente novamente.";
}

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

      try {
        return await importarArquivo(filePaths[0]);
      } catch (erro) {
        // Rejeita com uma frase pronta para o usuário em vez de um detalhe interno.
        throw new Error(mensagemAmigavel(erro));
      }
    },
  );
}
