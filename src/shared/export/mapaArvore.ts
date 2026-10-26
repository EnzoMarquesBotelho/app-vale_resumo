/**
 * Achatamento puro da árvore do mapa mental em uma lista com profundidade.
 *
 * É a fonte única consumida tanto pelo Markdown (lista aninhada por
 * indentação) quanto pelo PDF (lista `ul` aninhada de apoio), para que as duas
 * representações partam dos mesmos itens determinísticos sem compartilhar
 * formato de saída. Sem Node/Electron: puro e testável no vitest `node`.
 */
import type { MapaMental, NoMapaMental } from "../types";

/** Um nó da árvore achatado, com a profundidade (0 = raiz). */
export interface ItemMapa {
  /** Profundidade na árvore de domínio: 0 na raiz, +1 por descida. */
  nivel: number;
  /** Rótulo exibido do nó (já saneado/truncado na geração). */
  rotulo: string;
}

/**
 * Achata a árvore de `mapa` em itens `{ nivel, rotulo }` em pré-ordem (DFS):
 * a raiz primeiro (nível 0), depois cada filho na ordem, recursivamente. Uma
 * raiz sem filhos vira um único item.
 */
export function itensMapa(mapa: MapaMental): ItemMapa[] {
  const itens: ItemMapa[] = [];

  function visitar(no: NoMapaMental, nivel: number): void {
    itens.push({ nivel, rotulo: no.rotulo });
    for (const filho of no.filhos) {
      visitar(filho, nivel + 1);
    }
  }

  visitar(mapa.raiz, 0);
  return itens;
}
