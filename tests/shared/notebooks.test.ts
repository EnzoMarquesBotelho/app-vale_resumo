import { describe, expect, it } from "vitest";
import {
  CADERNO_GERAL_ID,
  CADERNO_GERAL_NOME,
  CADERNO_NOME_MAX,
  SEPARADOR_CADERNO,
  derivarCadernoComposto,
  derivarCadernoDeCaminho,
  derivarNomeExibicaoCaderno,
  montarCaderno,
  normalizarNomeCaderno,
} from "@shared/notebooks";

describe("normalizarNomeCaderno", () => {
  it("remove acentos", () => {
    expect(normalizarNomeCaderno("Cálculo")).toBe("calculo");
    expect(normalizarNomeCaderno("Programação")).toBe("programacao");
    expect(normalizarNomeCaderno("Inglês")).toBe("ingles");
  });

  it("apara espaços e baixa a caixa", () => {
    expect(normalizarNomeCaderno("  Álgebra Linear  ")).toBe("algebra-linear");
    expect(normalizarNomeCaderno("FÍSICA")).toBe("fisica");
  });

  it("troca símbolos por hífens e remove das pontas", () => {
    expect(normalizarNomeCaderno("C++")).toBe("c");
    expect(normalizarNomeCaderno("Cálculo I/II")).toBe("calculo-i-ii");
  });

  it("cai no caderno padrão quando vazio ou só símbolos", () => {
    expect(normalizarNomeCaderno("+++")).toBe(CADERNO_GERAL_ID);
    expect(normalizarNomeCaderno("")).toBe(CADERNO_GERAL_ID);
    expect(normalizarNomeCaderno("   ")).toBe(CADERNO_GERAL_ID);
  });
});

describe("derivarNomeExibicaoCaderno", () => {
  it("preserva acentos e caixa, só aparando", () => {
    expect(derivarNomeExibicaoCaderno("  Cálculo  ")).toBe("Cálculo");
  });

  it("vira o nome padrão quando vazio após o trim", () => {
    expect(derivarNomeExibicaoCaderno("")).toBe(CADERNO_GERAL_NOME);
    expect(derivarNomeExibicaoCaderno("   ")).toBe(CADERNO_GERAL_NOME);
  });

  it("trunca em CADERNO_NOME_MAX", () => {
    const bruto = "a".repeat(CADERNO_NOME_MAX + 1);
    expect(derivarNomeExibicaoCaderno(bruto)).toHaveLength(CADERNO_NOME_MAX);
  });
});

describe("montarCaderno", () => {
  it("produz par coerente id↔nome", () => {
    expect(montarCaderno("Cálculo")).toEqual({
      cadernoId: "calculo",
      cadernoNome: "Cálculo",
    });
  });

  it("cai no caderno padrão quando só símbolos", () => {
    expect(montarCaderno("+++")).toEqual({
      cadernoId: CADERNO_GERAL_ID,
      cadernoNome: CADERNO_GERAL_NOME,
    });
  });

  it("trunca o nome de exibição em CADERNO_NOME_MAX", () => {
    const bruto = "x".repeat(CADERNO_NOME_MAX + 1);
    const { cadernoId, cadernoNome } = montarCaderno(bruto);
    expect(cadernoNome).toHaveLength(CADERNO_NOME_MAX);
    expect(cadernoId).toBe("x".repeat(CADERNO_NOME_MAX + 1));
  });
});

describe("derivarCadernoDeCaminho", () => {
  it("usa a pasta-mãe como caderno", () => {
    expect(
      derivarCadernoDeCaminho("C:\\Users\\x\\Facul\\Cálculo\\aula1.pdf"),
    ).toEqual({ cadernoId: "calculo", cadernoNome: "Cálculo" });
  });

  it("trata separadores / e \\ de forma equivalente", () => {
    expect(derivarCadernoDeCaminho("/home/x/Facul/Cálculo/aula1.pdf")).toEqual({
      cadernoId: "calculo",
      cadernoNome: "Cálculo",
    });
  });

  it("cai no padrão quando não há pasta-mãe utilizável", () => {
    expect(derivarCadernoDeCaminho("aula1.pdf")).toEqual({
      cadernoId: CADERNO_GERAL_ID,
      cadernoNome: CADERNO_GERAL_NOME,
    });
    expect(derivarCadernoDeCaminho("C:\\x.pdf")).toEqual({
      cadernoId: CADERNO_GERAL_ID,
      cadernoNome: CADERNO_GERAL_NOME,
    });
  });

  it("deriva literalmente de um caminho UNC", () => {
    expect(
      derivarCadernoDeCaminho("\\\\server\\share\\arquivo.pdf"),
    ).toEqual({ cadernoId: "share", cadernoNome: "share" });
  });

  it("deriva literalmente de uma subpasta técnica", () => {
    expect(derivarCadernoDeCaminho("..\\_extracted_text\\x.txt").cadernoId).toBe(
      "extracted-text",
    );
  });
});

describe("SEPARADOR_CADERNO", () => {
  it("é o travessão com espaços usado nos cadernos compostos", () => {
    expect(SEPARADOR_CADERNO).toBe(" — ");
  });
});

describe("derivarCadernoComposto", () => {
  it("arquivo direto na pasta escolhida usa o nome da pasta", () => {
    expect(derivarCadernoComposto("Facul", "nota.txt")).toEqual({
      cadernoId: "facul",
      cadernoNome: "Facul",
    });
  });

  it("um nível de subpasta vira o nome da subpasta", () => {
    expect(derivarCadernoComposto("Facul", "Teórica\\x.pdf")).toEqual({
      cadernoId: "teorica",
      cadernoNome: "Teórica",
    });
  });

  it("vários níveis juntam as subpastas com ' — '", () => {
    expect(derivarCadernoComposto("Facul", "Cálculo\\Teórica\\x.pdf")).toEqual({
      cadernoId: "calculo-teorica",
      cadernoNome: "Cálculo — Teórica",
    });
  });

  it("aceita separador '/' de forma equivalente", () => {
    expect(derivarCadernoComposto("Facul", "Cálculo/Teórica/x.pdf")).toEqual({
      cadernoId: "calculo-teorica",
      cadernoNome: "Cálculo — Teórica",
    });
  });

  it("preserva acentos e espaços no nome, slugifica o id", () => {
    expect(
      derivarCadernoComposto("Facul", "Álgebra Linear\\Prática\\lista.md"),
    ).toEqual({
      cadernoId: "algebra-linear-pratica",
      cadernoNome: "Álgebra Linear — Prática",
    });
  });

  it("colisão cruzada entre matérias resolve em ids distintos", () => {
    const calculo = derivarCadernoComposto("Facul", "Cálculo\\Teórica\\a.pdf");
    const fisica = derivarCadernoComposto("Facul", "Física\\Teórica\\b.pdf");
    expect(calculo.cadernoId).toBe("calculo-teorica");
    expect(fisica.cadernoId).toBe("fisica-teorica");
    expect(calculo.cadernoId).not.toBe(fisica.cadernoId);
  });

  it("nome de pasta vazio (raiz saneada) cai no caderno padrão", () => {
    expect(derivarCadernoComposto("", "nota.txt")).toEqual({
      cadernoId: CADERNO_GERAL_ID,
      cadernoNome: CADERNO_GERAL_NOME,
    });
  });
});
