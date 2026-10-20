import { describe, expect, it } from "vitest";
import {
  montarPromptAvaliacao,
  montarPromptCombinarResumos,
  montarPromptCorrigirAvaliacao,
  montarPromptCorrigirFlashcards,
  montarPromptCorrigirMapaMental,
  montarPromptCorrigirQuiz,
  montarPromptDicaDoDia,
  montarPromptFlashcards,
  montarPromptMapaMental,
  montarPromptQuiz,
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

describe("montarPromptQuiz", () => {
  it("inclui o conteúdo, a quantidade normalizada e o formato JSON", () => {
    const prompt = montarPromptQuiz("misto", 8, "conteúdo de teste");
    expect(prompt).toContain("conteúdo de teste");
    expect(prompt).toContain("8 perguntas");
    expect(prompt).toContain('"perguntas"');
    expect(prompt).toContain('"tipo": "multipla"');
    expect(prompt).toContain('"tipo": "aberta"');
    expect(prompt.toLowerCase()).toContain("português");
  });

  it("instrui o modo múltipla (só objetivas)", () => {
    const prompt = montarPromptQuiz("multipla", 5, "x");
    expect(prompt).toContain("OBJETIVAS");
    expect(prompt).not.toContain("APENAS perguntas ABERTAS");
  });

  it("instrui o modo aberta (só abertas)", () => {
    const prompt = montarPromptQuiz("aberta", 5, "x");
    expect(prompt).toContain("ABERTAS");
    expect(prompt).not.toContain("APENAS perguntas OBJETIVAS");
  });

  it("instrui o modo misto (combinar os dois tipos)", () => {
    const prompt = montarPromptQuiz("misto", 5, "x");
    expect(prompt).toContain("MISTO");
  });

  it("normaliza a quantidade pedida aos limites (5–100)", () => {
    expect(montarPromptQuiz("multipla", 2, "x")).toContain("5 perguntas");
    expect(montarPromptQuiz("multipla", 200, "x")).toContain("100 perguntas");
  });
});

describe("montarPromptCorrigirQuiz", () => {
  it("reapresenta o formato e inclui a resposta anterior", () => {
    const prompt = montarPromptCorrigirQuiz("misto", 10, "resposta ruim");
    expect(prompt).toContain("não era um JSON válido");
    expect(prompt).toContain("10 perguntas");
    expect(prompt).toContain("resposta ruim");
    expect(prompt).toContain('"perguntas"');
  });
});

describe("montarPromptAvaliacao", () => {
  it("inclui enunciado, gabarito e resposta do aluno", () => {
    const prompt = montarPromptAvaliacao(
      "O que é fotossíntese?",
      "Processo que converte luz em energia química.",
      "É quando a planta faz comida.",
    );
    expect(prompt).toContain("O que é fotossíntese?");
    expect(prompt).toContain("Processo que converte luz em energia química.");
    expect(prompt).toContain("É quando a planta faz comida.");
    expect(prompt).toContain("Enunciado:");
    expect(prompt).toContain("Gabarito:");
    expect(prompt).toContain("Resposta do aluno:");
  });

  it("pede o formato JSON com os três níveis de veredito", () => {
    const prompt = montarPromptAvaliacao("e", "g", "r");
    expect(prompt).toContain('"veredito"');
    expect(prompt).toContain('"comentario"');
    expect(prompt).toContain("correto");
    expect(prompt).toContain("parcial");
    expect(prompt).toContain("incorreto");
    expect(prompt.toLowerCase()).toContain("português");
  });
});

describe("montarPromptCorrigirAvaliacao", () => {
  it("reapresenta o formato e inclui a resposta anterior", () => {
    const prompt = montarPromptCorrigirAvaliacao("resposta ruim");
    expect(prompt).toContain("não era um JSON válido");
    expect(prompt).toContain("resposta ruim");
    expect(prompt).toContain('"veredito"');
    expect(prompt).toContain('"comentario"');
  });
});
