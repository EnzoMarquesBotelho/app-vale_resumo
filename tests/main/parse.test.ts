import { describe, expect, it, vi } from "vitest";
import {
  FlashcardsInvalidosError,
  SemTextoParaFlashcardsError,
  extrairBlocoJson,
  gerarFlashcards,
  parseFlashcards,
} from "../../src/main/services/parse.js";

describe("extrairBlocoJson", () => {
  it("extrai um objeto JSON cercado por texto", () => {
    const bruto = 'Aqui estão: {"flashcards": []} — pronto!';
    expect(extrairBlocoJson(bruto)).toBe('{"flashcards": []}');
  });

  it("extrai o bloco de dentro de uma cerca de código ```json```", () => {
    const bruto = '```json\n{"flashcards": [{"pergunta":"a","resposta":"b"}]}\n```';
    expect(extrairBlocoJson(bruto)).toBe(
      '{"flashcards": [{"pergunta":"a","resposta":"b"}]}',
    );
  });

  it("extrai um array JSON direto", () => {
    const bruto = 'resposta: [{"pergunta":"a","resposta":"b"}]';
    expect(extrairBlocoJson(bruto)).toBe('[{"pergunta":"a","resposta":"b"}]');
  });

  it("ignora chaves dentro de strings ao balancear", () => {
    const bruto = '{"pergunta":"o que é { }?","resposta":"um bloco"}';
    expect(extrairBlocoJson(bruto)).toBe(bruto);
  });

  it("devolve null quando não há bloco JSON", () => {
    expect(extrairBlocoJson("sem json aqui")).toBeNull();
  });

  it("devolve null para JSON truncado (bloco não fechado)", () => {
    expect(extrairBlocoJson('{"flashcards": [')).toBeNull();
  });
});

describe("parseFlashcards (resposta bem-formada)", () => {
  it("interpreta o formato { flashcards: [...] }", () => {
    const resposta =
      '{"flashcards":[{"pergunta":"P1","resposta":"R1"},{"pergunta":"P2","resposta":"R2"}]}';
    expect(parseFlashcards(resposta)).toEqual([
      { pergunta: "P1", resposta: "R1" },
      { pergunta: "P2", resposta: "R2" },
    ]);
  });

  it("interpreta um array direto de flashcards", () => {
    const resposta = '[{"pergunta":"P","resposta":"R"}]';
    expect(parseFlashcards(resposta)).toEqual([{ pergunta: "P", resposta: "R" }]);
  });

  it("interpreta JSON cercado por texto e por ```json```", () => {
    const resposta =
      'Claro! ```json\n{"flashcards":[{"pergunta":"P","resposta":"R"}]}\n``` ok?';
    expect(parseFlashcards(resposta)).toEqual([{ pergunta: "P", resposta: "R" }]);
  });

  it("apara espaços de pergunta/resposta", () => {
    const resposta = '{"flashcards":[{"pergunta":"  P  ","resposta":" R "}]}';
    expect(parseFlashcards(resposta)).toEqual([{ pergunta: "P", resposta: "R" }]);
  });
});

describe("parseFlashcards (resposta malformada)", () => {
  it("devolve null quando não há JSON", () => {
    expect(parseFlashcards("desculpe, não consegui gerar")).toBeNull();
  });

  it("devolve null para JSON sintaticamente inválido", () => {
    expect(parseFlashcards('{"flashcards": [cadê as aspas]}')).toBeNull();
  });

  it("descarta itens sem pergunta ou resposta e mantém os válidos", () => {
    const resposta =
      '{"flashcards":[{"pergunta":"P","resposta":"R"},{"pergunta":"","resposta":"x"},{"foo":"bar"}]}';
    expect(parseFlashcards(resposta)).toEqual([{ pergunta: "P", resposta: "R" }]);
  });

  it("devolve null quando nenhum item é um flashcard válido", () => {
    expect(parseFlashcards('{"flashcards":[{"foo":"bar"}]}')).toBeNull();
  });
});

describe("gerarFlashcards", () => {
  it("lança SemTextoParaFlashcardsError quando o texto está vazio", async () => {
    await expect(
      gerarFlashcards({ texto: "   ", quantidade: 10, gerar: vi.fn() }),
    ).rejects.toBeInstanceOf(SemTextoParaFlashcardsError);
  });

  it("gera flashcards numa única chamada quando o JSON vem bem-formado", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue(
        '{"flashcards":[{"pergunta":"P","resposta":"R"}]}',
      );

    const cards = await gerarFlashcards({ texto: "conteúdo", quantidade: 5, gerar });

    expect(cards).toEqual([{ pergunta: "P", resposta: "R" }]);
    expect(gerar).toHaveBeenCalledTimes(1);
    // O prompt pede exatamente a quantidade escolhida.
    expect(gerar.mock.calls[0][0]).toContain("5 flashcards");
  });

  it("re-tenta com prompt corretivo quando o 1º JSON vem malformado", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce('{"flashcards":[{"pergunta":"P","resposta":"R"}]}');

    const cards = await gerarFlashcards({ texto: "conteúdo", quantidade: 8, gerar });

    expect(cards).toEqual([{ pergunta: "P", resposta: "R" }]);
    expect(gerar).toHaveBeenCalledTimes(2);
    // A 2ª chamada é o prompt corretivo com a resposta anterior.
    expect(gerar.mock.calls[1][0]).toContain("não era um JSON válido");
    expect(gerar.mock.calls[1][0]).toContain("não é json");
  });

  it("lança FlashcardsInvalidosError se o parsing falha mesmo após a re-tentativa", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue("ainda não é json");

    await expect(
      gerarFlashcards({ texto: "conteúdo", quantidade: 10, gerar }),
    ).rejects.toBeInstanceOf(FlashcardsInvalidosError);
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("limita a quantidade de flashcards devolvidos ao máximo pedido", async () => {
    const resposta = JSON.stringify({
      flashcards: Array.from({ length: 10 }, (_, i) => ({
        pergunta: `P${i}`,
        resposta: `R${i}`,
      })),
    });
    const gerar = vi.fn<(p: string) => Promise<string>>().mockResolvedValue(resposta);

    // Quantidade abaixo do mínimo é normalizada para 5.
    const cards = await gerarFlashcards({ texto: "conteúdo", quantidade: 2, gerar });

    expect(cards).toHaveLength(5);
    expect(gerar.mock.calls[0][0]).toContain("5 flashcards");
  });

  it("normaliza quantidade acima do máximo para 100 no prompt", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue('{"flashcards":[{"pergunta":"P","resposta":"R"}]}');

    await gerarFlashcards({ texto: "conteúdo", quantidade: 500, gerar });

    expect(gerar.mock.calls[0][0]).toContain("100 flashcards");
  });

  it("propaga o erro do gerador (ex.: Ollama offline)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      gerarFlashcards({ texto: "conteúdo", quantidade: 10, gerar }),
    ).rejects.toThrow("offline");
  });
});
