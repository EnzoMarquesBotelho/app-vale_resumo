import { describe, expect, it, vi } from "vitest";
import {
  ExerciciosInvalidosError,
  SemTextoParaExerciciosError,
  gerarExercicios,
  parseExercicios,
} from "../../src/main/services/parse.js";

describe("parseExercicios (resposta bem-formada)", () => {
  it("interpreta o formato { exercicios: [...] } e anexa o modo", () => {
    const resposta =
      '{"exercicios":[{"enunciado":"E1","resposta":"R1"},{"enunciado":"E2","resposta":"R2"}]}';
    expect(parseExercicios(resposta, "teorica")).toEqual([
      { enunciado: "E1", resposta: "R1", modo: "teorica" },
      { enunciado: "E2", resposta: "R2", modo: "teorica" },
    ]);
  });

  it("interpreta um array direto de exercícios", () => {
    const resposta = '[{"enunciado":"E","resposta":"R"}]';
    expect(parseExercicios(resposta, "pratica")).toEqual([
      { enunciado: "E", resposta: "R", modo: "pratica" },
    ]);
  });

  it("interpreta JSON cercado por texto e por ```json```", () => {
    const resposta =
      'Claro! ```json\n{"exercicios":[{"enunciado":"E","resposta":"R"}]}\n``` ok?';
    expect(parseExercicios(resposta, "mista")).toEqual([
      { enunciado: "E", resposta: "R", modo: "mista" },
    ]);
  });

  it("apara espaços de enunciado/resposta", () => {
    const resposta =
      '{"exercicios":[{"enunciado":"  E  ","resposta":" R "}]}';
    expect(parseExercicios(resposta, "teorica")).toEqual([
      { enunciado: "E", resposta: "R", modo: "teorica" },
    ]);
  });
});

describe("parseExercicios (resposta malformada)", () => {
  it("devolve null quando não há JSON", () => {
    expect(parseExercicios("desculpe, não consegui gerar", "mista")).toBeNull();
  });

  it("devolve null para JSON sintaticamente inválido", () => {
    expect(
      parseExercicios('{"exercicios": [cadê as aspas]}', "mista"),
    ).toBeNull();
  });

  it("descarta itens sem enunciado ou resposta e mantém os válidos", () => {
    const resposta =
      '{"exercicios":[{"enunciado":"E","resposta":"R"},{"enunciado":"","resposta":"x"},{"foo":"bar"}]}';
    expect(parseExercicios(resposta, "pratica")).toEqual([
      { enunciado: "E", resposta: "R", modo: "pratica" },
    ]);
  });

  it("devolve null quando nenhum item é um exercício válido", () => {
    expect(parseExercicios('{"exercicios":[{"foo":"bar"}]}', "mista")).toBeNull();
  });
});

describe("gerarExercicios (modos e limites 5–100)", () => {
  it("lança SemTextoParaExerciciosError quando o texto está vazio", async () => {
    await expect(
      gerarExercicios({
        texto: "   ",
        modo: "mista",
        quantidade: 10,
        gerar: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SemTextoParaExerciciosError);
  });

  it.each(["teorica", "pratica", "mista"] as const)(
    "gera exercícios no modo %s numa única chamada quando o JSON vem bem-formado",
    async (modo) => {
      const gerar = vi
        .fn<(p: string) => Promise<string>>()
        .mockResolvedValue('{"exercicios":[{"enunciado":"E","resposta":"R"}]}');

      const lista = await gerarExercicios({
        texto: "conteúdo",
        modo,
        quantidade: 5,
        gerar,
      });

      expect(lista).toEqual([{ enunciado: "E", resposta: "R", modo }]);
      expect(gerar).toHaveBeenCalledTimes(1);
      expect(gerar.mock.calls[0][0]).toContain("5 exercícios");
    },
  );

  it("instrui o prompt de acordo com o modo escolhido", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue('{"exercicios":[{"enunciado":"E","resposta":"R"}]}');

    await gerarExercicios({
      texto: "conteúdo",
      modo: "teorica",
      quantidade: 5,
      gerar,
    });
    expect(gerar.mock.calls[0][0]).toContain("PURAMENTE TEÓRICOS");

    gerar.mockClear();
    await gerarExercicios({
      texto: "conteúdo",
      modo: "pratica",
      quantidade: 5,
      gerar,
    });
    expect(gerar.mock.calls[0][0]).toContain("PURAMENTE PRÁTICOS");

    gerar.mockClear();
    await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 5,
      gerar,
    });
    expect(gerar.mock.calls[0][0]).toContain("MISTA");
  });

  it("re-tenta com prompt corretivo quando o 1º JSON vem malformado", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(
        '{"exercicios":[{"enunciado":"E","resposta":"R"}]}',
      );

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 8,
      gerar,
    });

    expect(lista).toEqual([{ enunciado: "E", resposta: "R", modo: "mista" }]);
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(gerar.mock.calls[1][0]).toContain("não era um JSON válido");
    expect(gerar.mock.calls[1][0]).toContain("não é json");
  });

  it("lança ExerciciosInvalidosError se o parsing falha mesmo após a re-tentativa", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue("ainda não é json");

    await expect(
      gerarExercicios({
        texto: "conteúdo",
        modo: "mista",
        quantidade: 10,
        gerar,
      }),
    ).rejects.toBeInstanceOf(ExerciciosInvalidosError);
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("normaliza quantidade abaixo do mínimo para 5 e limita a lista devolvida", async () => {
    const resposta = JSON.stringify({
      exercicios: Array.from({ length: 10 }, (_, i) => ({
        enunciado: `E${i}`,
        resposta: `R${i}`,
      })),
    });
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue(resposta);

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 2,
      gerar,
    });

    expect(lista).toHaveLength(5);
    expect(gerar.mock.calls[0][0]).toContain("5 exercícios");
  });

  it("normaliza quantidade acima do máximo para 100 no prompt", async () => {
    const gerar = vi
      .fn<(p: string) => Promise<string>>()
      .mockResolvedValue('{"exercicios":[{"enunciado":"E","resposta":"R"}]}');

    await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 500,
      gerar,
    });

    expect(gerar.mock.calls[0][0]).toContain("100 exercícios");
  });

  it("propaga o erro do gerador (ex.: Ollama offline)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      gerarExercicios({
        texto: "conteúdo",
        modo: "mista",
        quantidade: 10,
        gerar,
      }),
    ).rejects.toThrow("offline");
  });
});
