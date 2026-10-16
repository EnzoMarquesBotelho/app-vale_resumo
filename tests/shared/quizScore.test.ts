import { describe, expect, it } from "vitest";
import {
  calcularPontuacao,
  type RespostaUsuarioPura,
} from "@shared/quizScore";
import type { PerguntaQuiz } from "@shared/types";

/** Uma pergunta de múltipla escolha com a correta no índice dado. */
function multipla(enunciado: string, corretaIndice: number): PerguntaQuiz {
  return {
    tipo: "multipla",
    enunciado,
    alternativas: [
      { texto: "A", correta: corretaIndice === 0 },
      { texto: "B", correta: corretaIndice === 1 },
      { texto: "C", correta: corretaIndice === 2 },
    ],
  };
}

/** Uma pergunta aberta com o gabarito dado. */
function aberta(enunciado: string): PerguntaQuiz {
  return { tipo: "aberta", enunciado, gabarito: "gabarito" };
}

describe("calcularPontuacao", () => {
  it("conta acertos só das perguntas objetivas", () => {
    const perguntas: PerguntaQuiz[] = [multipla("p1", 1), multipla("p2", 0)];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "multipla", escolhidaIndice: 1 },
      { tipo: "multipla", escolhidaIndice: 0 },
    ];
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao).toEqual({ acertos: 2, totalObjetivas: 2, totalAbertas: 0 });
  });

  it("não soma quando não há resposta nem quando a escolha é errada", () => {
    const perguntas: PerguntaQuiz[] = [multipla("p1", 1), multipla("p2", 0)];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "multipla", escolhidaIndice: null },
      { tipo: "multipla", escolhidaIndice: 2 },
    ];
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao.acertos).toBe(0);
    expect(pontuacao.totalObjetivas).toBe(2);
  });

  it("índice fora dos limites não soma e não lança", () => {
    const perguntas: PerguntaQuiz[] = [multipla("p1", 1)];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "multipla", escolhidaIndice: 99 },
    ];
    expect(() => calcularPontuacao(perguntas, respostas)).not.toThrow();
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao.acertos).toBe(0);
    expect(pontuacao.totalObjetivas).toBe(1);
  });

  it("abertas contam só em totalAbertas (nunca em acertos)", () => {
    const perguntas: PerguntaQuiz[] = [aberta("p1"), aberta("p2")];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "aberta", texto: "resposta um" },
      { tipo: "aberta", texto: "resposta dois" },
    ];
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao).toEqual({
      acertos: 0,
      totalObjetivas: 0,
      totalAbertas: 2,
    });
  });

  it("quiz só de abertas tem totalObjetivas zero", () => {
    const perguntas: PerguntaQuiz[] = [aberta("p1")];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "aberta", texto: "resposta" },
    ];
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao.totalObjetivas).toBe(0);
    expect(pontuacao.totalAbertas).toBe(1);
  });

  it("quiz misto conta certo as objetivas e separa as abertas", () => {
    const perguntas: PerguntaQuiz[] = [
      multipla("p1", 2),
      aberta("p2"),
      multipla("p3", 0),
    ];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "multipla", escolhidaIndice: 2 },
      { tipo: "aberta", texto: "resposta" },
      { tipo: "multipla", escolhidaIndice: 1 },
    ];
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao).toEqual({
      acertos: 1,
      totalObjetivas: 2,
      totalAbertas: 1,
    });
  });

  it("discrepância de tipo entre pergunta e resposta não acerta nem lança", () => {
    const perguntas: PerguntaQuiz[] = [multipla("p1", 0)];
    const respostas: RespostaUsuarioPura[] = [
      { tipo: "aberta", texto: "errado de tipo" },
    ];
    expect(() => calcularPontuacao(perguntas, respostas)).not.toThrow();
    const pontuacao = calcularPontuacao(perguntas, respostas);
    expect(pontuacao.acertos).toBe(0);
    expect(pontuacao.totalObjetivas).toBe(1);
  });
});
