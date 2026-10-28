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

  it("normaliza quantidade acima do máximo para 100 (clamp do total entregue)", async () => {
    // 500 → clamp 100 (>limiar → chunking). Cada chamada devolve itens únicos
    // por lote (prefixo = índice da chamada), então a dedup não reduz o total.
    let chamada = 0;
    const gerar = vi.fn<(p: string) => Promise<string>>().mockImplementation(() => {
      const prefixo = `C${chamada++}`;
      return Promise.resolve(
        JSON.stringify({
          exercicios: Array.from({ length: 15 }, (_, i) => ({
            enunciado: `${prefixo}-${i}`,
            resposta: `R-${i}`,
          })),
        }),
      );
    });

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 500,
      gerar,
    });

    // Nunca excede 100 (normalizarQuantidade + slice(0, n)).
    expect(lista).toHaveLength(100);
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

/** JSON de um lote com `n` exercícios distintos a partir de um prefixo. */
function loteEx(prefixo: string, n: number): string {
  return JSON.stringify({
    exercicios: Array.from({ length: n }, (_, i) => ({
      enunciado: `${prefixo}-${i}`,
      resposta: `R${prefixo}-${i}`,
    })),
  });
}

describe("gerarExercicios (geração em lotes)", () => {
  it("caminho curto (n=20): UMA chamada e UM progresso (len, 20)", async () => {
    const gerar = vi.fn().mockResolvedValue(loteEx("A", 20));
    const aoProgresso = vi.fn();

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 20,
      gerar,
      aoProgresso,
    });

    expect(lista).toHaveLength(20);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(aoProgresso).toHaveBeenCalledTimes(1);
    expect(aoProgresso).toHaveBeenCalledWith(20, 20);
    // O serviço é agnóstico ao artefato: só (prontos, total).
    expect(aoProgresso.mock.calls[0]).toHaveLength(2);
  });

  it("chunking (n=21): ≥2 chamadas e acúmulo até N na ordem de chegada", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteEx("A", 15))
      .mockResolvedValueOnce(loteEx("B", 6));
    const aoProgresso = vi.fn();

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 21,
      gerar,
      aoProgresso,
    });

    expect(lista).toHaveLength(21);
    expect(gerar.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(lista[0].enunciado).toBe("A-0");
    expect(lista[20].enunciado).toBe("B-5");
    // Progresso crescente terminando em 21.
    const prontos = aoProgresso.mock.calls.map((c) => c[0]);
    expect(prontos[prontos.length - 1]).toBe(21);
  });

  it("dedup: enunciados repetidos entre lotes são descartados e pede extras", async () => {
    // 1º lote: A-0..A-14 (15). 2º lote repete A-0..A-5 (dedup → 0 novos).
    // 3º lote: C-0..C-5 (6 novos) → completa 21.
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteEx("A", 15))
      .mockResolvedValueOnce(loteEx("A", 6))
      .mockResolvedValueOnce(loteEx("C", 6));

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 21,
      gerar,
    });

    expect(lista).toHaveLength(21);
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("parcial por infra: falha no 3º lote devolve o acumulado SEM lançar", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteEx("A", 15))
      .mockResolvedValueOnce(loteEx("B", 15))
      .mockRejectedValueOnce(new Error("falhou"));

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 40,
      gerar,
    });

    // Os dois primeiros lotes acumularam 30; o 3º falhou → parcial.
    expect(lista).toHaveLength(30);
  });

  it("parcial por teto: modelo repete tudo após o 1º lote (gerar chamado = teto)", async () => {
    // 1º lote válido (15), todos os seguintes repetem A → aceitos=0 por lote.
    // n=40 → lotes = [15,15,10] (3) + margem 3 = teto 6.
    const gerar = vi.fn().mockResolvedValue(loteEx("A", 15));

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 40,
      gerar,
    });

    expect(lista).toHaveLength(15);
    expect(gerar).toHaveBeenCalledTimes(6);
  });

  it("offline no 1º lote (prontos=0): PROPAGA o erro tipado", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("Ollama offline"));

    await expect(
      gerarExercicios({
        texto: "conteúdo",
        modo: "mista",
        quantidade: 30,
        gerar,
      }),
    ).rejects.toThrow("Ollama offline");
  });

  it("todos inválidos com prontos=0: lança ExerciciosInvalidosError", async () => {
    const gerar = vi.fn().mockResolvedValue("nunca é json");

    await expect(
      gerarExercicios({
        texto: "conteúdo",
        modo: "mista",
        quantidade: 30,
        gerar,
      }),
    ).rejects.toBeInstanceOf(ExerciciosInvalidosError);
  });

  it("corretiva por lote: JSON sujo depois válido dentro de um lote", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(loteEx("A", 15))
      .mockResolvedValueOnce(loteEx("B", 15));

    const lista = await gerarExercicios({
      texto: "conteúdo",
      modo: "mista",
      quantidade: 30,
      gerar,
    });

    expect(lista).toHaveLength(30);
  });
});
