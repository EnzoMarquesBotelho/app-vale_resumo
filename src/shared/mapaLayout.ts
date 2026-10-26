/**
 * Layout determinístico da árvore do mapa mental.
 *
 * Lógica pura (sem DOM nem React), compartilhada em `src/shared` para poder ser
 * testada em isolamento (vitest `node`). O componente `MapaMental.tsx` consome
 * `calcularLayout` para desenhar o SVG. Orientação horizontal: a raiz fica à
 * esquerda, os níveis crescem para a direita, uma coluna por nível ("tidy tree"
 * simplificado). Só nós visíveis (filhos de nós expandidos) entram no layout.
 */
import type { NoMapaMental } from "./types";

/** Um nó já posicionado para render. */
export interface NoPosicionado {
  /** Id estável do nó (vem do `NoMapaMental`). */
  id: string;
  /** Rótulo exibido (já saneado/truncado na geração). */
  rotulo: string;
  /** Nível na árvore: 1 = raiz, 2 = ramo, etc. */
  nivel: number;
  /** Coordenada horizontal (coluna por nível). */
  x: number;
  /** Coordenada vertical. */
  y: number;
  /** Ids dos filhos diretos do nó (todos, visíveis ou não). */
  filhosIds: string[];
  /** `true` se o nó tem filhos mas está colapsado (subárvore oculta). */
  temFilhosOcultos: boolean;
}

/** Uma aresta pai→filho entre dois nós visíveis. */
export interface ArestaMapa {
  /** Id do nó pai. */
  de: string;
  /** Id do nó filho. */
  para: string;
}

/** Resultado do layout: nós posicionados, arestas e dimensões do conteúdo. */
export interface LayoutMapa {
  /** Nós visíveis já posicionados (inclui sempre a raiz). */
  nos: NoPosicionado[];
  /** Arestas entre nós visíveis. */
  arestas: ArestaMapa[];
  /** Largura total ocupada pelo conteúdo (para o viewport do SVG). */
  largura: number;
  /** Altura total ocupada pelo conteúdo (para o viewport do SVG). */
  alturaConteudo: number;
}

/** Distância horizontal entre colunas (um passo por nível). */
const LARGURA_COLUNA = 220;
/** Passo vertical entre folhas visíveis consecutivas. */
const ALTURA_LINHA = 64;

/**
 * Dimensões da caixa de um nó e a margem interna do conteúdo no viewBox.
 * Conceitos distintos de `LARGURA_COLUNA`/`ALTURA_LINHA` (passos de layout):
 * estes descrevem o retângulo desenhado e o deslocamento do conteúdo. Usados
 * tanto pela view (`MapaMental.tsx`) quanto pelo SVG do PDF (`mapaSvg.ts`),
 * para as coordenadas serem idênticas.
 */
export const NO_LARGURA = 168;
export const NO_ALTURA = 40;
export const MARGEM = 24;

/**
 * Monta o path SVG (curva de Bézier horizontal) entre o pai e o filho
 * posicionados, saindo da borda direita do pai e chegando na borda esquerda do
 * filho. Compartilhado pela view e pelo SVG do PDF.
 */
export function caminhoAresta(pai: NoPosicionado, filho: NoPosicionado): string {
  const x1 = pai.x + NO_LARGURA / 2;
  const y1 = pai.y;
  const x2 = filho.x - NO_LARGURA / 2;
  const y2 = filho.y;
  const meio = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`;
}

/**
 * Calcula as posições de todos os nós visíveis da árvore `raiz`, dado o
 * conjunto `expandidos` (ids de nós cujos filhos estão visíveis). Um nó cujo id
 * não está em `expandidos` é desenhado, mas seus filhos (e a subárvore) saem do
 * layout — colapsar/expandir reflui o resultado de forma determinística.
 *
 * `x` é função do nível; `y` das folhas é um passo fixo sequencial; `y` de um
 * nó interno é a média dos `y` dos filhos visíveis. A raiz é sempre visível.
 */
export function calcularLayout(
  raiz: NoMapaMental,
  expandidos: Set<string>,
): LayoutMapa {
  const nos: NoPosicionado[] = [];
  const arestas: ArestaMapa[] = [];
  // Contador de folhas visíveis já posicionadas, para o passo vertical.
  let proximaLinha = 0;

  /**
   * Posiciona recursivamente `no` no `nivel` dado e devolve seu `y`. Para uma
   * folha (ou nó colapsado), ocupa a próxima linha livre; para um nó interno
   * expandido, posiciona os filhos primeiro e centraliza no meio deles.
   */
  function posicionar(no: NoMapaMental, nivel: number): number {
    const filhosIds = no.filhos.map((f) => f.id);
    const expandido = expandidos.has(no.id);
    const temFilhos = no.filhos.length > 0;
    const x = (nivel - 1) * LARGURA_COLUNA;

    let y: number;
    if (!temFilhos || !expandido) {
      // Folha ou nó colapsado: ocupa uma linha e para (filhos saem do layout).
      y = proximaLinha * ALTURA_LINHA;
      proximaLinha += 1;
    } else {
      // Nó interno expandido: posiciona os filhos e centraliza entre eles.
      const ysFilhos: number[] = [];
      for (const filho of no.filhos) {
        const yFilho = posicionar(filho, nivel + 1);
        ysFilhos.push(yFilho);
        arestas.push({ de: no.id, para: filho.id });
      }
      y = ysFilhos.reduce((soma, v) => soma + v, 0) / ysFilhos.length;
    }

    nos.push({
      id: no.id,
      rotulo: no.rotulo,
      nivel,
      x,
      y,
      filhosIds,
      temFilhosOcultos: temFilhos && !expandido,
    });
    return y;
  }

  posicionar(raiz, 1);

  const maxNivel = nos.reduce((m, n) => Math.max(m, n.nivel), 1);
  const maxY = nos.reduce((m, n) => Math.max(m, n.y), 0);
  return {
    nos,
    arestas,
    largura: maxNivel * LARGURA_COLUNA,
    alturaConteudo: maxY + ALTURA_LINHA,
  };
}
