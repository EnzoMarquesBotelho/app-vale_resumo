/**
 * Contrato de IPC tipado compartilhado entre main e renderer.
 *
 * Centraliza os nomes dos canais e a assinatura da API exposta ao renderer
 * via `contextBridge`. Main e renderer importam daqui para não divergirem.
 */

/** Nomes dos canais de IPC. */
export const IPC_CHANNELS = {
  /** Canal de teste: renderer→main→renderer. */
  ping: "app:ping",
} as const;

/**
 * API tipada exposta ao renderer em `window.api`.
 * Cada método corresponde a um handler registrado no processo main.
 */
export interface AppApi {
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  /**
   * Canal de teste do IPC. Envia uma mensagem ao main e recebe uma resposta.
   * @param mensagem texto enviado ao processo main
   * @returns resposta ("pong: <mensagem>") produzida no main
   */
  ping: (mensagem: string) => Promise<string>;
}
