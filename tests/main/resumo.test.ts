import { describe, expect, it, vi } from "vitest";
import {
  SemTextoParaResumirError,
  dividirEmChunks,
  gerarResumo,
} from "../../src/main/services/resumo.js";

describe("dividirEmChunks", () => {
  it("devolve lista vazia para texto vazio", () => {
    expect(dividirEmChunks("   ", 100)).toEqual([]);
  });

  it("mantém texto pequeno em um único pedaço", () => {
    const chunks = dividirEmChunks("texto curto", 100);
    expect(chunks).toEqual(["texto curto"]);
  });

  it("divide em pedaços respeitando o limite, cortando em parágrafos", () => {
    const paragrafo = "a".repeat(60);
    const texto = `${paragrafo}\n\n${paragrafo}\n\n${paragrafo}`;
    const chunks = dividirEmChunks(texto, 130);
    // Cada pedaço cabe no limite e nenhum excede.
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(130);
    }
  });

  it("fatia um parágrafo isolado maior que o limite", () => {
    const chunks = dividirEmChunks("x".repeat(250), 100);
    expect(chunks).toEqual(["x".repeat(100), "x".repeat(100), "x".repeat(50)]);
  });
});

describe("gerarResumo", () => {
  it("lança SemTextoParaResumirError quando o texto está vazio", async () => {
    await expect(
      gerarResumo({ texto: "   ", modo: "curto", gerar: vi.fn() }),
    ).rejects.toBeInstanceOf(SemTextoParaResumirError);
  });

  it("texto pequeno: uma única chamada, prompt no modo escolhido", async () => {
    const gerar = vi.fn<(p: string) => Promise<string>>().mockResolvedValue(
      "resumo final",
    );

    const resumo = await gerarResumo({
      texto: "um texto pequeno para resumir",
      modo: "curto",
      gerar,
    });

    expect(resumo).toBe("resumo final");
    expect(gerar).toHaveBeenCalledTimes(1);
    const prompt = gerar.mock.calls[0][0];
    expect(prompt).toContain("um texto pequeno para resumir");
    expect(prompt).toContain("CURTO");
  });

  it("remove espaços em branco da resposta do modelo", async () => {
    const gerar = vi.fn().mockResolvedValue("  \n resumo \n ");
    const resumo = await gerarResumo({ texto: "abc", modo: "curto", gerar });
    expect(resumo).toBe("resumo");
  });

  it("texto grande: resume cada pedaço e combina os parciais (map→reduce)", async () => {
    const paragrafo = "a".repeat(60);
    const texto = `${paragrafo}\n\n${paragrafo}\n\n${paragrafo}`;

    // Mock: cada chamada de map devolve "parcial N"; a de reduce, "final".
    let chamada = 0;
    const gerar = vi.fn<(p: string) => Promise<string>>((prompt) => {
      // O prompt de combinação contém "Parte 1:".
      if (prompt.includes("Parte 1:")) {
        return Promise.resolve("resumo final combinado");
      }
      chamada += 1;
      return Promise.resolve(`parcial ${chamada}`);
    });

    const resumo = await gerarResumo({
      texto,
      modo: "longo",
      gerar,
      tamanhoChunk: 130,
    });

    expect(resumo).toBe("resumo final combinado");
    // 1 chamada por pedaço + 1 de combinação.
    const pedacos = dividirEmChunks(texto, 130);
    expect(gerar).toHaveBeenCalledTimes(pedacos.length + 1);
    // A última chamada é a de combinação, com os parciais numerados.
    const promptCombinacao = gerar.mock.calls.at(-1)?.[0] ?? "";
    expect(promptCombinacao).toContain("Parte 1:");
    expect(promptCombinacao).toContain("parcial 1");
  });

  it("propaga o erro do gerador (ex.: Ollama offline)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      gerarResumo({ texto: "abc", modo: "curto", gerar }),
    ).rejects.toThrow("offline");
  });
});
