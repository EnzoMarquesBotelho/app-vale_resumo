import type { EffectiveTheme } from "@shared/theme";

/**
 * Aplica o tema efetivo no documento, escrevendo `data-theme` no elemento raiz
 * (`<html>`). O CSS seleciona os tokens de cor por esse atributo. Função única
 * de aplicação, para não espalhar manipulação de DOM pelo renderer.
 */
export function aplicarTema(efetivo: EffectiveTheme): void {
  document.documentElement.setAttribute("data-theme", efetivo);
}
