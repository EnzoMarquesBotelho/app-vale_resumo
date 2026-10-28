import { describe, expect, it } from "vitest";
import {
  acumularComDedup,
  chaveDedup,
  deveParticionar,
  enunciadosParaEvitar,
  particionarQuantidade,
  rotuloProgresso,
} from "@shared/geracaoLotes";

describe("particionarQuantidade", () => {
  it("divide 100 em lotes de 15 (último leva o resto)", () => {
    expect(particionarQuantidade(100, 15)).toEqual([15, 15, 15, 15, 15, 15, 10]);
  });

  it("divide 30 em dois lotes cheios", () => {
    expect(particionarQuantidade(30, 15)).toEqual([15, 15]);
  });

  it("divide 21 (menor caso particionado do gate) em 15 + 6", () => {
    expect(particionarQuantidade(21, 15)).toEqual([15, 6]);
  });

  it("faz um único lote quando total == tamanho", () => {
    expect(particionarQuantidade(15, 15)).toEqual([15]);
  });

  it("faz um único lote menor quando total < tamanho", () => {
    expect(particionarQuantidade(10, 15)).toEqual([10]);
  });

  it("devolve [] para total <= 0", () => {
    expect(particionarQuantidade(0, 15)).toEqual([]);
    expect(particionarQuantidade(-5, 15)).toEqual([]);
  });

  it("clampa tamanho < 1 para 1 (array de uns)", () => {
    const lotes = particionarQuantidade(100, 0);
    expect(lotes).toHaveLength(100);
    expect(lotes.every((x) => x === 1)).toBe(true);
    expect(lotes.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("deveParticionar", () => {
  it("é false no limiar exato", () => {
    expect(deveParticionar(20, 20)).toBe(false);
  });

  it("é true logo acima do limiar", () => {
    expect(deveParticionar(21, 20)).toBe(true);
  });

  it("é false bem abaixo do limiar", () => {
    expect(deveParticionar(5, 20)).toBe(false);
  });
});

describe("chaveDedup", () => {
  it("iguala acentos, caixa e pontuação final", () => {
    expect(chaveDedup("O que é fotossíntese?")).toBe(
      chaveDedup("o que e fotossintese"),
    );
  });

  it("iguala espaços de borda e internos e pontuação de borda", () => {
    expect(chaveDedup("  Defina   mitose.  ")).toBe(chaveDedup("Defina mitose"));
  });

  it("produz chaves diferentes para enunciados distintos", () => {
    expect(chaveDedup("Explique a célula")).not.toBe(
      chaveDedup("Explique o núcleo"),
    );
  });

  it("mapeia string vazia para vazio", () => {
    expect(chaveDedup("")).toBe("");
  });

  it("mapeia só pontuação/espaço para vazio", () => {
    expect(chaveDedup("  ...??  ")).toBe("");
  });
});

describe("acumularComDedup", () => {
  it("acumula itens distintos contando os aceitos", () => {
    const novos = [{ e: "a" }, { e: "b" }, { e: "c" }];
    const r = acumularComDedup([], new Set<string>(), novos, 10, (i) => i.e);
    expect(r.itens).toHaveLength(3);
    expect(r.aceitos).toBe(3);
    expect(r.chavesVistas.size).toBe(3);
  });

  it("descarta chave já vista no acumulado", () => {
    const acumulado = [{ e: "a" }];
    const chaves = new Set(["a"]);
    const r = acumularComDedup(acumulado, chaves, [{ e: "a" }, { e: "b" }], 10, (i) => i.e);
    expect(r.itens.map((i) => i.e)).toEqual(["a", "b"]);
    expect(r.aceitos).toBe(1);
  });

  it("corta no alvo e não acumula além de N", () => {
    const acumulado = Array.from({ length: 9 }, (_, i) => ({ e: `k${i}` }));
    const chaves = new Set(acumulado.map((i) => i.e));
    const r = acumularComDedup(
      acumulado,
      chaves,
      [{ e: "x" }, { e: "y" }, { e: "z" }],
      10,
      (i) => i.e,
    );
    expect(r.itens).toHaveLength(10);
    expect(r.aceitos).toBe(1);
    expect(r.itens[9].e).toBe("x");
  });

  it("descarta item de chave vazia", () => {
    const r = acumularComDedup([], new Set<string>(), [{ e: "   " }], 10, (i) =>
      chaveDedup(i.e),
    );
    expect(r.itens).toHaveLength(0);
    expect(r.aceitos).toBe(0);
  });

  it("descarta a 2ª duplicata no mesmo lote", () => {
    const r = acumularComDedup([], new Set<string>(), [{ e: "a" }, { e: "a" }], 10, (i) => i.e);
    expect(r.itens).toHaveLength(1);
    expect(r.aceitos).toBe(1);
  });

  it("não muta a entrada (imutável)", () => {
    const acumulado = [{ e: "a" }];
    const chaves = new Set(["a"]);
    const r = acumularComDedup(acumulado, chaves, [{ e: "b" }], 10, (i) => i.e);
    expect(acumulado).toHaveLength(1);
    expect(chaves.size).toBe(1);
    expect(r.itens).not.toBe(acumulado);
    expect(r.chavesVistas).not.toBe(chaves);
  });
});

describe("enunciadosParaEvitar", () => {
  it("devolve os últimos `max` enunciados", () => {
    const enunciados = Array.from({ length: 40 }, (_, i) => `E${i}`);
    const resultado = enunciadosParaEvitar(enunciados, 30, 120);
    expect(resultado).toHaveLength(30);
    expect(resultado[0]).toBe("E10");
    expect(resultado[29]).toBe("E39");
  });

  it("trunca cada enunciado a `maxLen` caracteres", () => {
    const longo = "x".repeat(500);
    const resultado = enunciadosParaEvitar([longo], 30, 120);
    expect(resultado[0]).toHaveLength(120);
  });

  it("devolve [] para lista vazia", () => {
    expect(enunciadosParaEvitar([], 30, 120)).toEqual([]);
  });
});

describe("rotuloProgresso", () => {
  it('formata "Gerando X de N…"', () => {
    expect(
      rotuloProgresso({
        geracaoId: "id",
        artefato: "quiz",
        prontos: 30,
        total: 100,
      }),
    ).toBe("Gerando 30 de 100…");
  });
});
