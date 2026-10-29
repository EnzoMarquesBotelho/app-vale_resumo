import { describe, expect, it } from "vitest";
import { slugTopico } from "../../src/shared/slug.js";

describe("slug: slugTopico", () => {
  it("remove acentos e normaliza para minúsculas com hífens", () => {
    expect(slugTopico("Integração por Partes")).toBe("integracao-por-partes");
    expect(slugTopico("Limites e Continuidade")).toBe("limites-e-continuidade");
  });

  it("colapsa hífens e apara das pontas", () => {
    expect(slugTopico("  Álgebra --- Linear!!  ")).toBe("algebra-linear");
    expect(slugTopico("***")).toBe("topico");
  });

  it("título vazio (ou só símbolos) vira 'topico'", () => {
    expect(slugTopico("")).toBe("topico");
    expect(slugTopico("   ")).toBe("topico");
    expect(slugTopico("@#$%")).toBe("topico");
  });

  it("é determinística: títulos iguais dão slugs iguais", () => {
    expect(slugTopico("Cálculo I")).toBe(slugTopico("Cálculo I"));
    expect(slugTopico("Função Afim")).toBe("funcao-afim");
  });

  it("não aplica o prefixo 'manual:' (isso é de sanearPlano)", () => {
    expect(slugTopico("Derivadas")).toBe("derivadas");
    expect(slugTopico("Derivadas").startsWith("manual:")).toBe(false);
  });
});
