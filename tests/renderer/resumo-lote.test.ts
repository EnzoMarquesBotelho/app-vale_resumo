import { describe, expect, it } from "vitest";
import type { ResultadoImportacaoPasta } from "@shared/types";
import { PASTA_MAX_ARQUIVOS_LOTE } from "@shared/constants";
import { resumoLoteTexto } from "../../src/renderer/views/resumoLote";

/** Base com tudo zerado; cada teste sobrescreve o que precisa. */
function resultado(
  parcial: Partial<ResultadoImportacaoPasta>,
): ResultadoImportacaoPasta {
  return {
    importados: 0,
    ignoradosPorFormato: 0,
    ignoradosPorDuplicata: 0,
    falhas: 0,
    cadernosTocados: [],
    limiteExcedido: null,
    ...parcial,
  };
}

describe("resumoLoteTexto", () => {
  it("1) teto de arquivos: só a mensagem de limite", () => {
    const texto = resumoLoteTexto(
      resultado({ limiteExcedido: "arquivos", ignoradosPorFormato: 2 }),
    );
    expect(texto).toContain(`mais de ${PASTA_MAX_ARQUIVOS_LOTE} arquivos`);
    expect(texto).toContain("Nada foi importado");
    // Não concatena a frase base.
    expect(texto).not.toContain("ignorado(s) por formato");
  });

  it("2) só duplicatas: frase natural, sem 'em 0 cadernos'", () => {
    const texto = resumoLoteTexto(
      resultado({ importados: 0, ignoradosPorDuplicata: 3 }),
    );
    expect(texto).toBe("Nenhum arquivo novo: 3 já importado(s) antes.");
    expect(texto).not.toContain("cadernos");
  });

  it("2b) só duplicatas com sufixos de formato e profundidade", () => {
    const texto = resumoLoteTexto(
      resultado({
        importados: 0,
        ignoradosPorDuplicata: 1,
        ignoradosPorFormato: 2,
        limiteExcedido: "profundidade",
      }),
    );
    expect(texto).toContain("Nenhum arquivo novo: 1 já importado(s) antes.");
    expect(texto).toContain("; 2 ignorado(s) por formato");
    expect(texto).toContain("subpastas muito profundas");
  });

  it("3) caso geral: frase base com plural correto", () => {
    const texto = resumoLoteTexto(
      resultado({ importados: 3, cadernosTocados: ["A", "B"] }),
    );
    expect(texto).toBe("3 arquivos importados em 2 cadernos");
  });

  it("3b) singular de arquivo e caderno", () => {
    const texto = resumoLoteTexto(
      resultado({ importados: 1, cadernosTocados: ["A"] }),
    );
    expect(texto).toBe("1 arquivo importado em 1 caderno");
  });

  it("3c) caso geral com todos os sufixos, profundidade por último", () => {
    const texto = resumoLoteTexto(
      resultado({
        importados: 2,
        cadernosTocados: ["A"],
        ignoradosPorFormato: 1,
        ignoradosPorDuplicata: 4,
        falhas: 1,
        limiteExcedido: "profundidade",
      }),
    );
    expect(texto).toBe(
      "2 arquivos importados em 1 caderno; 1 ignorado(s) por formato; " +
        "4 já importado(s) antes; 1 com erro de leitura" +
        " (algumas subpastas muito profundas foram ignoradas)",
    );
  });
});
