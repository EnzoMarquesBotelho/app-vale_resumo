import { describe, expect, it } from "vitest";
import {
  montarPromptCombinarResumos,
  montarPromptCorrigirFlashcards,
  montarPromptCorrigirMapaMental,
  montarPromptDicaDoDia,
  montarPromptFlashcards,
  montarPromptMapaMental,
  montarPromptResumo,
  normalizarQuantidade,
} from "@shared/prompts";
import type { CadernoEmFoco } from "@shared/types";

describe("montarPromptResumo", () => {
  it("inclui o texto e instrui modo CURTO", () => {
    const prompt = montarPromptResumo("curto", "conteúdo de teste");
    expect(prompt).toContain("conteúdo de teste");
    expect(prompt).toContain("CURTO");
    expect(prompt).not.toContain("LONGO");
  });

  it("inclui o texto e instrui modo LONGO", () => {
    const prompt = montarPromptResumo("longo", "conteúdo de teste");
    expect(prompt).toContain("conteúdo de teste");
    expect(prompt).toContain("LONGO");
    expect(prompt).not.toContain("CURTO");
  });

  it("pede resposta em português", () => {
    const prompt = montarPromptResumo("curto", "x");
    expect(prompt.toLowerCase()).toContain("português");
  });
});

describe("montarPromptCombinarResumos", () => {
  it("numera e inclui cada resumo parcial", () => {
    const prompt = montarPromptCombinarResumos("longo", [
      "parcial um",
      "parcial dois",
    ]);
    expect(prompt).toContain("Parte 1:");
    expect(prompt).toContain("parcial um");
    expect(prompt).toContain("Parte 2:");
    expect(prompt).toContain("parcial dois");
    expect(prompt).toContain("LONGO");
  });
});

describe("normalizarQuantidade", () => {
  it("mantém valores dentro da faixa 5–100", () => {
    expect(normalizarQuantidade(5)).toBe(5);
    expect(normalizarQuantidade(42)).toBe(42);
    expect(normalizarQuantidade(100)).toBe(100);
  });

  it("eleva ao mínimo valores abaixo de 5", () => {
    expect(normalizarQuantidade(1)).toBe(5);
    expect(normalizarQuantidade(0)).toBe(5);
  });

  it("limita ao máximo valores acima de 100", () => {
    expect(normalizarQuantidade(500)).toBe(100);
  });

  it("arredonda valores não inteiros", () => {
    expect(normalizarQuantidade(7.4)).toBe(7);
    expect(normalizarQuantidade(7.6)).toBe(8);
  });

  it("usa o mínimo para NaN", () => {
    expect(normalizarQuantidade(Number.NaN)).toBe(5);
  });
});

describe("montarPromptFlashcards", () => {
  it("inclui o conteúdo e pede saída em JSON com a quantidade", () => {
    const prompt = montarPromptFlashcards(12, "conteúdo de teste");
    expect(prompt).toContain("conteúdo de teste");
    expect(prompt).toContain("12 flashcards");
    expect(prompt).toContain('{"flashcards"');
    expect(prompt.toLowerCase()).toContain("português");
  });

  it("normaliza a quantidade pedida aos limites (5–100)", () => {
    expect(montarPromptFlashcards(2, "x")).toContain("5 flashcards");
    expect(montarPromptFlashcards(200, "x")).toContain("100 flashcards");
  });
});

describe("montarPromptCorrigirFlashcards", () => {
  it("reapresenta o formato e inclui a resposta anterior", () => {
    const prompt = montarPromptCorrigirFlashcards(10, "resposta ruim");
    expect(prompt).toContain("não era um JSON válido");
    expect(prompt).toContain("10 flashcards");
    expect(prompt).toContain("resposta ruim");
    expect(prompt).toContain('{"flashcards"');
  });
});

describe("montarPromptMapaMental", () => {
  it("inclui o conteúdo e pede o formato JSON aninhado", () => {
    const prompt = montarPromptMapaMental("conteúdo de teste");
    expect(prompt).toContain("conteúdo de teste");
    expect(prompt).toContain('"raiz"');
    expect(prompt).toContain('"filhos"');
    expect(prompt.toLowerCase()).toContain("português");
  });

  it("pede rótulos curtos e limita a profundidade", () => {
    const prompt = montarPromptMapaMental("x");
    expect(prompt.toLowerCase()).toContain("curto");
    expect(prompt).toContain("4 níveis");
  });
});

describe("montarPromptCorrigirMapaMental", () => {
  it("reapresenta o formato e inclui a resposta anterior", () => {
    const prompt = montarPromptCorrigirMapaMental("resposta ruim");
    expect(prompt).toContain("não era um JSON válido");
    expect(prompt).toContain("resposta ruim");
    expect(prompt).toContain('"raiz"');
  });
});

describe("montarPromptDicaDoDia", () => {
  const cadernos: CadernoEmFoco[] = [
    {
      cadernoId: "calculo",
      cadernoNome: "Cálculo",
      totalDocumentos: 3,
      temResumo: true,
      temFlashcards: true,
    },
  ];

  it("inclui título, dias restantes e os cadernos em foco", () => {
    const prompt = montarPromptDicaDoDia("P1 de Cálculo", 5, cadernos);
    expect(prompt).toContain("P1 de Cálculo");
    expect(prompt).toContain("5 dias");
    expect(prompt).toContain("Cálculo");
    expect(prompt).toContain("3 documentos");
    expect(prompt).toContain("resumo e flashcards");
  });

  it("pede resposta curta em português e texto livre (sem JSON)", () => {
    const prompt = montarPromptDicaDoDia("Prova", 2, cadernos);
    expect(prompt.toLowerCase()).toContain("português");
    expect(prompt.toLowerCase()).toContain("curta");
    expect(prompt).not.toContain("JSON");
    expect(prompt).not.toContain('{"');
  });

  it("sem cadernos em foco descreve a ausência sem quebrar", () => {
    const prompt = montarPromptDicaDoDia("Prova", 1, []);
    expect(prompt).toContain("Nenhum caderno");
    expect(prompt).toContain("1 dias");
  });
});
