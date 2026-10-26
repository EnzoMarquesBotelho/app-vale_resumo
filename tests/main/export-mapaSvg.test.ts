import { describe, expect, it } from "vitest";
import { gerarSvgMapaMental } from "../../src/main/services/mapaSvg.js";
import type { MapaMental, NoMapaMental } from "@shared/types";

function mapa(raiz: NoMapaMental): MapaMental {
  return { documentoId: "", raiz, geradoEm: "" };
}

/** Conta ocorrências de `<text` na string SVG (um por nó). */
function contarTextos(svg: string): number {
  return (svg.match(/<text/g) ?? []).length;
}

describe("gerarSvgMapaMental", () => {
  it("é um SVG autônomo com xmlns e viewBox", () => {
    const svg = gerarSvgMapaMental(
      mapa({ id: "n0", rotulo: "Tema", filhos: [] }),
    );
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("viewBox=");
  });

  it("escapa os rótulos para XML", () => {
    const svg = gerarSvgMapaMental(
      mapa({ id: "n0", rotulo: 'A & B < C "D"', filhos: [] }),
    );
    expect(svg).toContain("A &amp; B &lt; C &quot;D&quot;");
    expect(svg).not.toContain("A & B < C");
  });

  it("tem um <text> por nó da árvore inteira (inclui raiz sem filhos)", () => {
    const soRaiz = gerarSvgMapaMental(
      mapa({ id: "n0", rotulo: "Só raiz", filhos: [] }),
    );
    expect(contarTextos(soRaiz)).toBe(1);

    const arvore = gerarSvgMapaMental(
      mapa({
        id: "n0",
        rotulo: "Tema",
        filhos: [
          {
            id: "n1",
            rotulo: "Ramo",
            filhos: [{ id: "n2", rotulo: "Folha", filhos: [] }],
          },
          { id: "n3", rotulo: "Outro", filhos: [] },
        ],
      }),
    );
    // 4 nós no total.
    expect(contarTextos(arvore)).toBe(4);
  });
});
