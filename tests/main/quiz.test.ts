import { describe, expect, it, vi } from "vitest";
import {
  QUIZ_ALTERNATIVAS_MAXIMO,
  QUIZ_ALTERNATIVAS_MINIMO,
} from "@shared/constants";
import {
  QuizInvalidoError,
  SemTextoParaQuizError,
  gerarQuiz,
  parseQuiz,
} from "../../src/main/services/quiz.js";

/** JSON de uma pergunta de múltipla escolha válida (duas alternativas, uma correta). */
const multiplaValida = {
  tipo: "multipla",
  enunciado: "Quanto é 2+2?",
  alternativas: [
    { texto: "3", correta: false },
    { texto: "4", correta: true },
  ],
};

/** JSON de uma pergunta aberta válida (com gabarito). */
const abertaValida = {
  tipo: "aberta",
  enunciado: "Explique X.",
  gabarito: "X é Y.",
};

describe("parseQuiz (resposta bem-formada)", () => {
  it("interpreta o formato { perguntas: [...] }", () => {
    const resposta = JSON.stringify({ perguntas: [multiplaValida] });
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).not.toBeNull();
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0]).toEqual(multiplaValida);
  });

  it("interpreta um array direto na raiz", () => {
    const resposta = JSON.stringify([multiplaValida, abertaValida]);
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).toHaveLength(2);
  });

  it("interpreta JSON cercado por texto e por ```json```", () => {
    const resposta = `Claro! \`\`\`json\n${JSON.stringify({
      perguntas: [abertaValida],
    })}\n\`\`\` pronto`;
    const perguntas = parseQuiz(resposta, "aberta");
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0].tipo).toBe("aberta");
  });

  it("devolve null para JSON truncado (bloco não fechado)", () => {
    expect(parseQuiz('{"perguntas":[{"tipo":"aberta",', "misto")).toBeNull();
  });

  it("devolve null para JSON sintaticamente inválido", () => {
    expect(parseQuiz('{"perguntas": cadê as aspas}', "misto")).toBeNull();
  });

  it("devolve null quando não há JSON", () => {
    expect(parseQuiz("desculpe, não consegui", "misto")).toBeNull();
  });

  it("devolve null quando só há perguntas inválidas", () => {
    const resposta = JSON.stringify({
      perguntas: [{ tipo: "multipla", enunciado: "" }],
    });
    expect(parseQuiz(resposta, "misto")).toBeNull();
  });
});

describe("parseQuiz (validação por pergunta)", () => {
  it("descarta pergunta sem enunciado", () => {
    const resposta = JSON.stringify({
      perguntas: [{ ...multiplaValida, enunciado: "   " }, abertaValida],
    });
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0].tipo).toBe("aberta");
  });

  it("descarta pergunta com tipo inválido", () => {
    const resposta = JSON.stringify({
      perguntas: [{ tipo: "verdadeiro-falso", enunciado: "E" }, abertaValida],
    });
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0].tipo).toBe("aberta");
  });

  it("descarta múltipla com menos de o mínimo de alternativas", () => {
    const resposta = JSON.stringify({
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "E",
          alternativas: [{ texto: "única", correta: true }],
        },
      ],
    });
    expect(parseQuiz(resposta, "multipla")).toBeNull();
  });

  it("descarta múltipla com zero alternativas corretas", () => {
    const resposta = JSON.stringify({
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "E",
          alternativas: [
            { texto: "a", correta: false },
            { texto: "b", correta: false },
          ],
        },
      ],
    });
    expect(parseQuiz(resposta, "multipla")).toBeNull();
  });

  it("descarta múltipla com duas alternativas corretas", () => {
    const resposta = JSON.stringify({
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "E",
          alternativas: [
            { texto: "a", correta: true },
            { texto: "b", correta: true },
          ],
        },
      ],
    });
    expect(parseQuiz(resposta, "multipla")).toBeNull();
  });

  it("aceita múltipla com exatamente uma correta", () => {
    const resposta = JSON.stringify({ perguntas: [multiplaValida] });
    const perguntas = parseQuiz(resposta, "multipla");
    expect(perguntas).toHaveLength(1);
  });

  it("poda o leque de alternativas além do teto", () => {
    const alternativas = Array.from(
      { length: QUIZ_ALTERNATIVAS_MAXIMO + 4 },
      (_, i) => ({ texto: `alt${i}`, correta: i === 0 }),
    );
    const resposta = JSON.stringify({
      perguntas: [{ tipo: "multipla", enunciado: "E", alternativas }],
    });
    const perguntas = parseQuiz(resposta, "multipla");
    expect(perguntas).toHaveLength(1);
    const p = perguntas?.[0];
    expect(p?.tipo).toBe("multipla");
    if (p?.tipo === "multipla") {
      expect(p.alternativas).toHaveLength(QUIZ_ALTERNATIVAS_MAXIMO);
      // A única correta (índice 0) sobrevive à poda.
      expect(p.alternativas.filter((a) => a.correta)).toHaveLength(1);
    }
    // Sanidade: o teto é maior que o mínimo.
    expect(QUIZ_ALTERNATIVAS_MAXIMO).toBeGreaterThan(QUIZ_ALTERNATIVAS_MINIMO);
  });

  it("descarta aberta sem gabarito", () => {
    const resposta = JSON.stringify({
      perguntas: [{ tipo: "aberta", enunciado: "E", gabarito: "   " }],
    });
    expect(parseQuiz(resposta, "aberta")).toBeNull();
  });

  it("aceita aberta válida", () => {
    const resposta = JSON.stringify({ perguntas: [abertaValida] });
    expect(parseQuiz(resposta, "aberta")).toHaveLength(1);
  });

  it("apara espaços de enunciado, texto das alternativas e gabarito", () => {
    const resposta = JSON.stringify({
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "  E  ",
          alternativas: [
            { texto: "  a  ", correta: true },
            { texto: "  b  ", correta: false },
          ],
        },
        { tipo: "aberta", enunciado: "  P  ", gabarito: "  G  " },
      ],
    });
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).toHaveLength(2);
    const m = perguntas?.[0];
    const a = perguntas?.[1];
    if (m?.tipo === "multipla") {
      expect(m.enunciado).toBe("E");
      expect(m.alternativas[0].texto).toBe("a");
    }
    if (a?.tipo === "aberta") {
      expect(a.enunciado).toBe("P");
      expect(a.gabarito).toBe("G");
    }
  });

  it("trata correta não-boolean como false (defensivo)", () => {
    const resposta = JSON.stringify({
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "E",
          alternativas: [
            { texto: "a", correta: "sim" },
            { texto: "b", correta: true },
          ],
        },
      ],
    });
    const perguntas = parseQuiz(resposta, "multipla");
    expect(perguntas).toHaveLength(1);
    const p = perguntas?.[0];
    if (p?.tipo === "multipla") {
      expect(p.alternativas[0].correta).toBe(false);
      expect(p.alternativas[1].correta).toBe(true);
    }
  });
});

describe("parseQuiz (filtro de modo)", () => {
  const resposta = JSON.stringify({
    perguntas: [multiplaValida, abertaValida],
  });

  it("modo multipla mantém só as objetivas", () => {
    const perguntas = parseQuiz(resposta, "multipla");
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0].tipo).toBe("multipla");
  });

  it("modo aberta mantém só as abertas", () => {
    const perguntas = parseQuiz(resposta, "aberta");
    expect(perguntas).toHaveLength(1);
    expect(perguntas?.[0].tipo).toBe("aberta");
  });

  it("modo misto mantém os dois tipos", () => {
    const perguntas = parseQuiz(resposta, "misto");
    expect(perguntas).toHaveLength(2);
  });
});

describe("gerarQuiz", () => {
  const quizValido = JSON.stringify({ perguntas: [multiplaValida] });

  it("lança SemTextoParaQuizError para texto vazio", async () => {
    await expect(
      gerarQuiz({ texto: "   ", modo: "misto", quantidade: 5 }),
    ).rejects.toBeInstanceOf(SemTextoParaQuizError);
  });

  it("gera o quiz em uma única chamada passando format:'json'", async () => {
    const gerar = vi.fn().mockResolvedValue(quizValido);
    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "multipla",
      quantidade: 5,
      gerar,
    });
    expect(quiz.modo).toBe("multipla");
    expect(quiz.perguntas).toHaveLength(1);
    expect(quiz.documentoId).toBe("");
    expect(typeof quiz.geradoEm).toBe("string");
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(gerar.mock.calls[0][1]).toBe("json");
  });

  it("re-tenta UMA vez quando a 1ª resposta é malformada (2 chamadas)", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(quizValido);
    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "multipla",
      quantidade: 5,
      gerar,
    });
    expect(quiz.perguntas).toHaveLength(1);
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(gerar.mock.calls[0][1]).toBe("json");
    expect(gerar.mock.calls[1][1]).toBe("json");
  });

  it("lança QuizInvalidoError após falha persistente (só UMA re-tentativa)", async () => {
    const gerar = vi.fn().mockResolvedValue("nunca é json");
    await expect(
      gerarQuiz({ texto: "conteúdo", modo: "misto", quantidade: 5, gerar }),
    ).rejects.toBeInstanceOf(QuizInvalidoError);
    // UMA re-tentativa corretiva: 2 chamadas no total (NÃO as 3 do mapa).
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("a mensagem de erro orienta a usar um modelo de texto", () => {
    const mensagem = new QuizInvalidoError().message;
    expect(mensagem).toMatch(/modelo de texto/);
    expect(mensagem).toMatch(/llama3.1/);
    expect(mensagem).toMatch(/moondream/);
  });

  it("propaga o erro do gerador (ex.: Ollama offline)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("ollama offline"));
    await expect(
      gerarQuiz({ texto: "conteúdo", modo: "misto", quantidade: 5, gerar }),
    ).rejects.toThrow("ollama offline");
  });

  it("aplica slice(0, n) quando o modelo devolve mais perguntas que o pedido", async () => {
    const perguntas = Array.from({ length: 8 }, (_, i) => ({
      ...abertaValida,
      enunciado: `P${i}`,
    }));
    const gerar = vi.fn().mockResolvedValue(JSON.stringify({ perguntas }));
    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 5,
      gerar,
    });
    expect(quiz.perguntas).toHaveLength(5);
  });

  it("devolve menos de N quando o modelo deu menos (sem piso)", async () => {
    const perguntas = Array.from({ length: 2 }, (_, i) => ({
      ...abertaValida,
      enunciado: `P${i}`,
    }));
    const gerar = vi.fn().mockResolvedValue(JSON.stringify({ perguntas }));
    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 10,
      gerar,
    });
    expect(quiz.perguntas).toHaveLength(2);
  });

  it("condensa texto grande via resumo antes de gerar o quiz", async () => {
    // tamanhoChunk pequeno força o caminho "grande": o texto vira 3 chunks.
    // Sequência esperada de prompts: 3 (map do resumo) + 1 (reduce) + 1 (quiz).
    const tamanhoChunk = 20;
    const paragrafo = "x".repeat(18);
    const texto = `${paragrafo}\n\n${paragrafo}\n\n${paragrafo}`;
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("parcial 1")
      .mockResolvedValueOnce("parcial 2")
      .mockResolvedValueOnce("parcial 3")
      .mockResolvedValueOnce("resumo combinado")
      .mockResolvedValueOnce(quizValido);

    const quiz = await gerarQuiz({
      texto,
      modo: "multipla",
      quantidade: 5,
      gerar,
      tamanhoChunk,
    });

    expect(quiz.perguntas).toHaveLength(1);
    expect(gerar).toHaveBeenCalledTimes(5);
    // O último prompt (o do quiz) é construído sobre o resumo condensado.
    const promptQuiz = gerar.mock.calls[4][0] as string;
    expect(promptQuiz).toContain("resumo combinado");
  });
});

/** JSON de um lote de `n` perguntas abertas distintas a partir de um prefixo. */
function loteQuiz(prefixo: string, n: number): string {
  return JSON.stringify({
    perguntas: Array.from({ length: n }, (_, i) => ({
      tipo: "aberta",
      enunciado: `${prefixo}-${i}`,
      gabarito: `G${prefixo}-${i}`,
    })),
  });
}

describe("gerarQuiz (geração em lotes)", () => {
  it("caminho curto (n=20): UMA chamada e UM progresso (len, 20)", async () => {
    const gerar = vi.fn().mockResolvedValue(loteQuiz("A", 20));
    const aoProgresso = vi.fn();

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 20,
      gerar,
      aoProgresso,
    });

    expect(quiz.perguntas).toHaveLength(20);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(aoProgresso).toHaveBeenCalledTimes(1);
    expect(aoProgresso).toHaveBeenCalledWith(20, 20);
    expect(aoProgresso.mock.calls[0]).toHaveLength(2);
  });

  it("chunking (n=21): ≥2 chamadas e acúmulo até N na ordem", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("B", 6));
    const aoProgresso = vi.fn();

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 21,
      gerar,
      aoProgresso,
    });

    expect(quiz.perguntas).toHaveLength(21);
    expect(gerar.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(quiz.perguntas[0].enunciado).toBe("A-0");
    expect(quiz.perguntas[20].enunciado).toBe("B-5");
    const prontos = aoProgresso.mock.calls.map((c) => c[0]);
    expect(prontos[prontos.length - 1]).toBe(21);
  });

  it("dedup: perguntas repetidas entre lotes são descartadas e pede extras", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("A", 6))
      .mockResolvedValueOnce(loteQuiz("C", 6));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 21,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(21);
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("parcial por infra: falha no 3º lote devolve o acumulado SEM lançar", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15))
      .mockRejectedValueOnce(new Error("falhou"));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 40,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(30);
  });

  it("parcial por estagnação: modelo repete tudo após o 1º lote (para por K lotes vazios)", async () => {
    // n=40: lote 1 aceita 15; lotes 2,3,4 repetem (semProgresso 1,2,3) → para no
    // 4º por estagnação (GERACAO_LOTE_SEM_PROGRESSO_MAX = 3). Parcial sinalizado
    // pela lista curta (15 < 40). O teto absoluto (3 lotes + 6 = 9) não dispara.
    const gerar = vi.fn().mockResolvedValue(loteQuiz("A", 15));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 40,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(15);
    expect(gerar).toHaveBeenCalledTimes(4);
  });

  it("offline no 1º lote (prontos=0): PROPAGA o erro tipado", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("Ollama offline"));

    await expect(
      gerarQuiz({
        texto: "conteúdo",
        modo: "aberta",
        quantidade: 30,
        gerar,
      }),
    ).rejects.toThrow("Ollama offline");
  });

  it("todos inválidos com prontos=0: lança QuizInvalidoError", async () => {
    const gerar = vi.fn().mockResolvedValue("nunca é json");

    await expect(
      gerarQuiz({
        texto: "conteúdo",
        modo: "aberta",
        quantidade: 30,
        gerar,
      }),
    ).rejects.toBeInstanceOf(QuizInvalidoError);
  });

  it("corretiva por lote: JSON sujo depois válido dentro de um lote", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 30,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(30);
  });

  it("gerou o total (lotes distintos): NÃO corta cedo, entrega N", async () => {
    // n=40 → lotes [15,15,10]; A/B/C distintos → sem dedup, sem estagnação.
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15))
      .mockResolvedValueOnce(loteQuiz("C", 10));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 40,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(40);
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("estagnação com progresso intercalado reseta o contador", async () => {
    // Sequência: aceita / vazio / aceita / vazio / vazio / vazio.
    // n=60 → lotes [15,15,15,15]. semProgresso só atinge 3 na 3ª vazia
    // consecutiva (lotes produtivos o zeram), parando na 6ª chamada.
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15))
      .mockResolvedValueOnce(loteQuiz("B", 15));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 60,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(30);
    expect(gerar).toHaveBeenCalledTimes(6);
  });

  it("lote extra após partição esgotada pede tamanho >= 1 (invariante)", async () => {
    // n=21 → lotes [15,6]. Lote 1 aceita 15; lote 2 repete (vazio); a partição
    // esgota e o 3º lote (extra) pede tamanho = min(15, 21-15) = 6. Espiamos o
    // prompt do 3º lote para confirmar que pediu >= 1 item.
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockResolvedValueOnce(loteQuiz("A", 6))
      .mockResolvedValueOnce(loteQuiz("C", 6));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 21,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(21);
    expect(gerar).toHaveBeenCalledTimes(3);
    // O prompt do 3º lote (extra) pede "6 perguntas" — nunca 0 nem negativo.
    expect(gerar.mock.calls[2][0]).toContain("6 perguntas");
  });

  it("infra falha após progresso: para pelo break, NÃO pela estagnação", async () => {
    // Lote 1 aceita 15; lote 2 lança erro de infra. Deve parar no break (parcial),
    // sem rodar mais lotes de estagnação: exatamente 2 chamadas.
    const gerar = vi
      .fn()
      .mockResolvedValueOnce(loteQuiz("A", 15))
      .mockRejectedValueOnce(new Error("infra falhou"));

    const quiz = await gerarQuiz({
      texto: "conteúdo",
      modo: "aberta",
      quantidade: 40,
      gerar,
    });

    expect(quiz.perguntas).toHaveLength(15);
    expect(gerar).toHaveBeenCalledTimes(2);
  });
});
