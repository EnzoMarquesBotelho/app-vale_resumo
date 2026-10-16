import { describe, expect, it } from "vitest";
import { calcularLayout } from "@shared/mapaLayout";
import type { NoMapaMental } from "@shared/types";

/** Monta uma árvore de exemplo: raiz com dois ramos, o primeiro com dois netos. */
function arvoreExemplo(): NoMapaMental {
  return {
    id: "n0",
    rotulo: "Raiz",
    filhos: [
      {
        id: "n1",
        rotulo: "Ramo A",
        filhos: [
          { id: "n2", rotulo: "Neto A1", filhos: [] },
          { id: "n3", rotulo: "Neto A2", filhos: [] },
        ],
      },
      { id: "n4", rotulo: "Ramo B", filhos: [] },
    ],
  };
}

/** Todos os ids expandidos (árvore inteira visível). */
function todosExpandidos(no: NoMapaMental, acc = new Set<string>()): Set<string> {
  acc.add(no.id);
  for (const f of no.filhos) todosExpandidos(f, acc);
  return acc;
}

describe("calcularLayout", () => {
  it("posiciona a raiz à esquerda e os níveis em colunas crescentes", () => {
    const raiz = arvoreExemplo();
    const layout = calcularLayout(raiz, todosExpandidos(raiz));

    const porId = new Map(layout.nos.map((n) => [n.id, n]));
    const n0 = porId.get("n0");
    const n1 = porId.get("n1");
    const n2 = porId.get("n2");

    expect(n0?.nivel).toBe(1);
    expect(n1?.nivel).toBe(2);
    expect(n2?.nivel).toBe(3);
    // Colunas crescem para a direita por nível.
    expect(n0!.x).toBeLessThan(n1!.x);
    expect(n1!.x).toBeLessThan(n2!.x);
  });

  it("não sobrepõe o y das folhas visíveis", () => {
    const raiz = arvoreExemplo();
    const layout = calcularLayout(raiz, todosExpandidos(raiz));
    // Folhas desta árvore: n2, n3, n4.
    const folhasY = ["n2", "n3", "n4"].map(
      (id) => layout.nos.find((n) => n.id === id)!.y,
    );
    expect(new Set(folhasY).size).toBe(folhasY.length);
  });

  it("centraliza um nó interno entre seus filhos visíveis", () => {
    const raiz = arvoreExemplo();
    const layout = calcularLayout(raiz, todosExpandidos(raiz));
    const n1 = layout.nos.find((n) => n.id === "n1")!;
    const n2 = layout.nos.find((n) => n.id === "n2")!;
    const n3 = layout.nos.find((n) => n.id === "n3")!;
    expect(n1.y).toBeCloseTo((n2.y + n3.y) / 2);
  });

  it("remove do layout os filhos de um nó colapsado", () => {
    const raiz = arvoreExemplo();
    // Expande tudo menos o Ramo A (n1): seus netos saem do layout.
    const expandidos = todosExpandidos(raiz);
    expandidos.delete("n1");
    const layout = calcularLayout(raiz, expandidos);

    const ids = layout.nos.map((n) => n.id);
    expect(ids).toContain("n1");
    expect(ids).not.toContain("n2");
    expect(ids).not.toContain("n3");
    // n1 é desenhado mas sinaliza subárvore oculta.
    const n1 = layout.nos.find((n) => n.id === "n1")!;
    expect(n1.temFilhosOcultos).toBe(true);
    // Nenhuma aresta aponta para os filhos ocultos.
    const paraOcultos = layout.arestas.filter(
      (a) => a.para === "n2" || a.para === "n3",
    );
    expect(paraOcultos).toHaveLength(0);
  });

  it("funciona para uma árvore de um único nó", () => {
    const raiz: NoMapaMental = { id: "n0", rotulo: "Só", filhos: [] };
    const layout = calcularLayout(raiz, new Set(["n0"]));
    expect(layout.nos).toHaveLength(1);
    expect(layout.arestas).toHaveLength(0);
    expect(layout.nos[0].nivel).toBe(1);
  });
});
