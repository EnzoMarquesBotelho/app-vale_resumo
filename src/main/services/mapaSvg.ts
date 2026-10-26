/**
 * Serialização PURA da árvore do mapa mental em uma string SVG autônoma.
 *
 * Reusa `calcularLayout` de `@shared/mapaLayout` — a MESMA lógica de
 * posicionamento da view — e os símbolos de dimensão/aresta extraídos para o
 * módulo compartilhado, para o PDF refletir o mesmo layout da tela. Determinística
 * e sem efeitos: não importa pdfmake. Vive em `main` por colocalização com o
 * serviço de export, mas é pura e testável no vitest `node`.
 *
 * Para a exportação, a árvore é SEMPRE expandida por inteiro (um documento
 * estático mostra o mapa completo, não o estado de expand/collapse da sessão).
 */
import {
  MARGEM,
  NO_ALTURA,
  NO_LARGURA,
  calcularLayout,
  caminhoAresta,
} from "@shared/mapaLayout";
import type { NoPosicionado } from "@shared/mapaLayout";
import type { MapaMental, NoMapaMental } from "@shared/types";

/** Cores inline por nível (paleta clara, coerente com a marca). */
interface CoresNo {
  fundo: string;
  borda: string;
  texto: string;
}

/** Paleta clara do nó por nível (1 = raiz). Página branca, não o tema escuro. */
function coresNivel(nivel: number): CoresNo {
  if (nivel === 1) return { fundo: "#6366f1", borda: "#6366f1", texto: "#ffffff" };
  if (nivel === 2) return { fundo: "#eef2ff", borda: "#4f46e5", texto: "#1f2937" };
  return { fundo: "#ffffff", borda: "#c7d2fe", texto: "#1f2937" };
}

/** Coleta todos os ids da árvore por travessia (para expandir tudo). */
function todosOsIds(raiz: NoMapaMental): Set<string> {
  const ids = new Set<string>();
  const pilha: NoMapaMental[] = [raiz];
  while (pilha.length > 0) {
    const no = pilha.pop()!;
    ids.add(no.id);
    pilha.push(...no.filhos);
  }
  return ids;
}

/** Escapa um texto para uso seguro como conteúdo/atributo XML do SVG. */
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Gera uma string SVG autônoma do mapa `mapa`, com o mesmo viewBox e offset da
 * view: uma `<path>` por aresta e, por nó, um grupo transladado com um `<rect>`
 * e um `<text>` centralizado. Os rótulos são escapados para XML (único ponto de
 * escape da fatia — um `&` cru quebraria o SVG).
 */
export function gerarSvgMapaMental(mapa: MapaMental): string {
  const expandidos = todosOsIds(mapa.raiz);
  const layout = calcularLayout(mapa.raiz, expandidos);
  const posPorId = new Map<string, NoPosicionado>();
  for (const no of layout.nos) posPorId.set(no.id, no);

  const larguraVb = layout.largura + NO_LARGURA + MARGEM * 2;
  const alturaVb = layout.alturaConteudo + MARGEM * 2;

  const arestas = layout.arestas
    .map((aresta) => {
      const pai = posPorId.get(aresta.de);
      const filho = posPorId.get(aresta.para);
      if (!pai || !filho) return "";
      return `<path d="${caminhoAresta(pai, filho)}" fill="none" stroke="#c7d2fe" stroke-width="1.5" />`;
    })
    .filter((linha) => linha.length > 0);

  const nos = layout.nos.map((no) => {
    const cores = coresNivel(no.nivel);
    const x = -NO_LARGURA / 2;
    const y = -NO_ALTURA / 2;
    return [
      `<g transform="translate(${no.x}, ${no.y})">`,
      `<rect x="${x}" y="${y}" width="${NO_LARGURA}" height="${NO_ALTURA}" rx="10" fill="${cores.fundo}" stroke="${cores.borda}" stroke-width="1.5" />`,
      `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Roboto, sans-serif" font-size="13" fill="${cores.texto}">${escaparXml(no.rotulo)}</text>`,
      `</g>`,
    ].join("");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larguraVb} ${alturaVb}">`,
    `<g transform="translate(${MARGEM + NO_LARGURA / 2}, ${MARGEM})">`,
    ...arestas,
    ...nos,
    `</g>`,
    `</svg>`,
  ].join("");
}
