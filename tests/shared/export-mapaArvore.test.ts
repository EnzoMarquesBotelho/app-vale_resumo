import { describe, expect, it } from "vitest";
import { itensMapa } from "@shared/export/mapaArvore";
import type { MapaMental, NoMapaMental } from "@shared/types";

function mapa(raiz: NoMapaMental): MapaMental {
  return { documentoId: "", raiz, geradoEm: "2026-01-01T00:00:00.000Z" };
}

describe("itensMapa", () => {
  it("achata em pré-ordem com nível 0 na raiz e +1 por descida", () => {
    const arvore = mapa({
      id: "n0",
      rotulo: "Tema",
      filhos: [
        {
          id: "n1",
          rotulo: "Ramo A",
          filhos: [{ id: "n2", rotulo: "Folha A1", filhos: [] }],
        },
        { id: "n3", rotulo: "Ramo B", filhos: [] },
      ],
    });

    expect(itensMapa(arvore)).toEqual([
      { nivel: 0, rotulo: "Tema" },
      { nivel: 1, rotulo: "Ramo A" },
      { nivel: 2, rotulo: "Folha A1" },
      { nivel: 1, rotulo: "Ramo B" },
    ]);
  });

  it("uma raiz sem filhos vira um único item de nível 0", () => {
    const arvore = mapa({ id: "n0", rotulo: "Só a raiz", filhos: [] });
    expect(itensMapa(arvore)).toEqual([{ nivel: 0, rotulo: "Só a raiz" }]);
  });
});
