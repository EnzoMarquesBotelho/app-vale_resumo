import { describe, expect, it } from "vitest";
import {
  montarPromptCombinarResumos,
  montarPromptResumo,
} from "@shared/prompts";

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
