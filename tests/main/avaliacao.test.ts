import { describe, expect, it, vi } from "vitest";
import { AVALIACAO_COMENTARIO_MAX } from "@shared/constants";
import type { EntradaAvaliacao } from "@shared/types";
import {
  avaliarLote,
  avaliarUma,
  parseAvaliacao,
} from "../../src/main/services/avaliacao.js";
import {
  GeracaoFalhouError,
  OllamaIndisponivelError,
} from "../../src/main/services/ollama.js";

/** Entrada de avaliação com uma resposta não-vazia (caminho que chama o modelo). */
const entrada: EntradaAvaliacao = {
  enunciado: "O que é fotossíntese?",
  gabarito: "Processo que converte luz em energia química.",
  resposta: "É quando a planta faz comida com a luz do sol.",
};

describe("parseAvaliacao (resposta bem-formada)", () => {
  it("interpreta um veredito correto com comentário", () => {
    const resposta = JSON.stringify({
      veredito: "correto",
      comentario: "Muito bem, resposta completa.",
    });
    expect(parseAvaliacao(resposta)).toEqual({
      veredito: "correto",
      comentario: "Muito bem, resposta completa.",
    });
  });

  it("interpreta o nível parcial", () => {
    const resposta = JSON.stringify({
      veredito: "parcial",
      comentario: "Faltou detalhar.",
    });
    expect(parseAvaliacao(resposta)?.veredito).toBe("parcial");
  });

  it("interpreta o nível incorreto", () => {
    const resposta = JSON.stringify({
      veredito: "incorreto",
      comentario: "Não é isso.",
    });
    expect(parseAvaliacao(resposta)?.veredito).toBe("incorreto");
  });

  it("normaliza veredito em maiúsculas e com espaços", () => {
    const resposta = JSON.stringify({
      veredito: "  CORRETO  ",
      comentario: "ok",
    });
    expect(parseAvaliacao(resposta)?.veredito).toBe("correto");
  });

  it("apara o comentário", () => {
    const resposta = JSON.stringify({
      veredito: "correto",
      comentario: "  com espaços  ",
    });
    expect(parseAvaliacao(resposta)?.comentario).toBe("com espaços");
  });

  it("usa um comentário padrão por nível quando ausente", () => {
    const correto = parseAvaliacao(JSON.stringify({ veredito: "correto" }));
    const parcial = parseAvaliacao(JSON.stringify({ veredito: "parcial" }));
    const incorreto = parseAvaliacao(
      JSON.stringify({ veredito: "incorreto" }),
    );
    expect(correto?.comentario.length).toBeGreaterThan(0);
    expect(parcial?.comentario.length).toBeGreaterThan(0);
    expect(incorreto?.comentario.length).toBeGreaterThan(0);
    // Os padrões dos três níveis são distintos entre si.
    expect(correto?.comentario).not.toBe(parcial?.comentario);
    expect(parcial?.comentario).not.toBe(incorreto?.comentario);
  });

  it("usa o padrão quando o comentário é vazio ou não-string", () => {
    const vazio = parseAvaliacao(
      JSON.stringify({ veredito: "parcial", comentario: "   " }),
    );
    const naoString = parseAvaliacao(
      JSON.stringify({ veredito: "parcial", comentario: 42 }),
    );
    expect(vazio?.comentario.length).toBeGreaterThan(0);
    expect(naoString?.comentario.length).toBeGreaterThan(0);
  });

  it("aproveita JSON cercado por ```json``` e texto ao redor", () => {
    const resposta = `Claro! \`\`\`json\n${JSON.stringify({
      veredito: "correto",
      comentario: "ok",
    })}\n\`\`\` pronto`;
    expect(parseAvaliacao(resposta)?.veredito).toBe("correto");
  });

  it("trunca um comentário gigante em AVALIACAO_COMENTARIO_MAX na fronteira de palavra", () => {
    const palavra = "palavra ";
    const comentario = palavra.repeat(200); // bem acima do limite
    const resposta = JSON.stringify({ veredito: "incorreto", comentario });
    const avaliacao = parseAvaliacao(resposta);
    expect(avaliacao).not.toBeNull();
    const texto = avaliacao?.comentario ?? "";
    expect(texto.length).toBeLessThanOrEqual(AVALIACAO_COMENTARIO_MAX);
    expect(texto.endsWith("…")).toBe(true);
    // Fronteira de palavra: nada de "palavr" cortado no fim antes do "…".
    expect(texto).toMatch(/palavra…$/);
  });
});

describe("parseAvaliacao (rejeições)", () => {
  it("devolve null quando não há JSON", () => {
    expect(parseAvaliacao("desculpe, não consegui avaliar")).toBeNull();
  });

  it("devolve null para JSON sintaticamente inválido", () => {
    expect(parseAvaliacao('{"veredito": cadê as aspas}')).toBeNull();
  });

  it("devolve null para JSON truncado (bloco não fechado)", () => {
    expect(parseAvaliacao('{"veredito":"correto",')).toBeNull();
  });

  it("devolve null quando o topo é array", () => {
    expect(parseAvaliacao(JSON.stringify([{ veredito: "correto" }]))).toBeNull();
  });

  it("devolve null quando o topo é string/number/null", () => {
    expect(parseAvaliacao('"correto"')).toBeNull();
    expect(parseAvaliacao("42")).toBeNull();
    expect(parseAvaliacao("null")).toBeNull();
  });

  it("devolve null para veredito fora do enum", () => {
    expect(
      parseAvaliacao(JSON.stringify({ veredito: "talvez", comentario: "x" })),
    ).toBeNull();
  });

  it('rejeita "nao_avaliado" vindo do modelo', () => {
    expect(
      parseAvaliacao(
        JSON.stringify({ veredito: "nao_avaliado", comentario: "x" }),
      ),
    ).toBeNull();
  });

  it("devolve null para veredito ausente ou não-string", () => {
    expect(parseAvaliacao(JSON.stringify({ comentario: "x" }))).toBeNull();
    expect(
      parseAvaliacao(JSON.stringify({ veredito: 1, comentario: "x" })),
    ).toBeNull();
  });
});

describe("avaliarUma", () => {
  const avaliacaoValida = JSON.stringify({
    veredito: "correto",
    comentario: "Resposta boa.",
  });

  it("não chama o gerador quando a resposta está vazia", async () => {
    const gerar = vi.fn();
    const avaliacao = await avaliarUma(
      { enunciado: "E", gabarito: "G", resposta: "   " },
      gerar,
    );
    expect(avaliacao.veredito).toBe("nao_avaliado");
    expect(avaliacao.comentario.length).toBeGreaterThan(0);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("avalia em uma única chamada passando format:'json'", async () => {
    const gerar = vi.fn().mockResolvedValue(avaliacaoValida);
    const avaliacao = await avaliarUma(entrada, gerar);
    expect(avaliacao.veredito).toBe("correto");
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(gerar.mock.calls[0][1]).toBe("json");
  });

  it("re-tenta UMA vez quando a 1ª resposta é malformada (2 chamadas)", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(avaliacaoValida);
    const avaliacao = await avaliarUma(entrada, gerar);
    expect(avaliacao.veredito).toBe("correto");
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(gerar.mock.calls[0][1]).toBe("json");
    expect(gerar.mock.calls[1][1]).toBe("json");
  });

  it("devolve nao_avaliado após falha persistente, sem lançar (só UMA re-tentativa)", async () => {
    const gerar = vi.fn().mockResolvedValue("nunca é json");
    const avaliacao = await avaliarUma(entrada, gerar);
    expect(avaliacao.veredito).toBe("nao_avaliado");
    expect(avaliacao.comentario.length).toBeGreaterThan(0);
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("propaga OllamaIndisponivelError", async () => {
    const gerar = vi.fn().mockRejectedValue(new OllamaIndisponivelError());
    await expect(avaliarUma(entrada, gerar)).rejects.toBeInstanceOf(
      OllamaIndisponivelError,
    );
  });

  it("propaga GeracaoFalhouError", async () => {
    const gerar = vi.fn().mockRejectedValue(new GeracaoFalhouError());
    await expect(avaliarUma(entrada, gerar)).rejects.toBeInstanceOf(
      GeracaoFalhouError,
    );
  });
});

describe("avaliarLote", () => {
  it("devolve { avaliacoes: [] } sem chamar o modelo para lote vazio", async () => {
    const gerar = vi.fn();
    const resultado = await avaliarLote([], gerar);
    expect(resultado.avaliacoes).toEqual([]);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("preserva a ordem alinhada por índice", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ veredito: "correto", comentario: "1" }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ veredito: "incorreto", comentario: "2" }),
      );
    const entradas: EntradaAvaliacao[] = [
      { enunciado: "E1", gabarito: "G1", resposta: "R1" },
      { enunciado: "E2", gabarito: "G2", resposta: "R2" },
    ];
    const { avaliacoes } = await avaliarLote(entradas, gerar);
    expect(avaliacoes.map((a) => a.veredito)).toEqual([
      "correto",
      "incorreto",
    ]);
  });

  it("vazias viram nao_avaliado sem chamada; mistura de válidos/inválidos/vazios", async () => {
    const gerar = vi
      .fn()
      // 1º item (não-vazio): válido
      .mockResolvedValueOnce(
        JSON.stringify({ veredito: "parcial", comentario: "quase" }),
      )
      // 2º item (não-vazio): malformado nas DUAS chamadas → nao_avaliado
      .mockResolvedValueOnce("lixo")
      .mockResolvedValueOnce("ainda lixo");
    const entradas: EntradaAvaliacao[] = [
      { enunciado: "E1", gabarito: "G1", resposta: "R1" },
      { enunciado: "E2", gabarito: "G2", resposta: "R2" },
      { enunciado: "E3", gabarito: "G3", resposta: "   " },
    ];
    const { avaliacoes } = await avaliarLote(entradas, gerar);
    expect(avaliacoes.map((a) => a.veredito)).toEqual([
      "parcial",
      "nao_avaliado",
      "nao_avaliado",
    ]);
    // 1 chamada (1º) + 2 chamadas (2º, re-tentativa) + 0 (3º vazio) = 3.
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("aborta propagando OllamaIndisponivelError no 1º item de infra", async () => {
    const gerar = vi.fn().mockRejectedValue(new OllamaIndisponivelError());
    const entradas: EntradaAvaliacao[] = [
      { enunciado: "E1", gabarito: "G1", resposta: "R1" },
      { enunciado: "E2", gabarito: "G2", resposta: "R2" },
    ];
    await expect(avaliarLote(entradas, gerar)).rejects.toBeInstanceOf(
      OllamaIndisponivelError,
    );
    // Abortou no 1º item: não seguiu para o 2º.
    expect(gerar).toHaveBeenCalledTimes(1);
  });
});
