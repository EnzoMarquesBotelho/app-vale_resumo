import type { PreloadApi } from "../main/preload";

/**
 * Mensagem exibida quando a ponte `window.api` (exposta pelo preload via
 * contextBridge) não está disponível. Isso indica que o preload não carregou
 * — um erro de ambiente, não de uso. Mostrar a mensagem em vez de deixar os
 * botões "mortos" (que é o que o optional chaining `window.api?.` causava).
 */
export const ERRO_API_INDISPONIVEL =
  "A ponte interna do aplicativo não carregou. Feche e abra o app novamente. " +
  "Se o problema continuar, reinstale o aplicativo.";

/**
 * Retorna a API exposta pelo preload, ou lança um erro claro se ela não
 * existir. Use isto em vez de `window.api?.` para que uma ponte ausente vire
 * um erro visível (capturado pelos `catch` das telas) em vez de uma chamada
 * silenciosa que não faz nada.
 */
export function getApi(): PreloadApi {
  const api = window.api;
  if (!api) {
    throw new Error(ERRO_API_INDISPONIVEL);
  }
  return api;
}
