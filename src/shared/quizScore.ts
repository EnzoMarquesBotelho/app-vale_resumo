/**
 * Pontuação pura do quiz.
 *
 * Lógica pura (sem DOM nem React), compartilhada em `src/shared` para poder ser
 * testada em isolamento (vitest `node`), mesmo lar de `mapaLayout.ts`. A UI do
 * quiz coleta as respostas do usuário e chama `calcularPontuacao` para o
 * placar das objetivas. As abertas não são pontuadas aqui (a correção delas é
 * por IA): entram só na contagem `totalAbertas`.
 */
import type { PerguntaQuiz } from "@shared/types";

/**
 * Resposta do usuário a uma pergunta, por índice (alinhada à lista de
 * perguntas). Múltipla carrega o índice da alternativa escolhida (ou `null` se
 * não respondeu); aberta carrega o texto digitado.
 */
export type RespostaUsuarioPura =
  | { tipo: "multipla"; escolhidaIndice: number | null }
  | { tipo: "aberta"; texto: string };

/** Placar de um quiz: acertos objetivos e contagem por natureza. */
export interface PontuacaoQuiz {
  /** Quantas perguntas objetivas o usuário acertou. */
  acertos: number;
  /** Total de perguntas objetivas (de múltipla escolha). */
  totalObjetivas: number;
  /** Total de perguntas abertas (não pontuadas aqui). */
  totalAbertas: number;
}

/**
 * Calcula o placar objetivo do quiz, comparando por índice `perguntas[i]` com
 * `respostas[i]`. Uma pergunta de múltipla escolha soma 1 em `totalObjetivas` e
 * só conta acerto quando `escolhidaIndice` aponta uma alternativa com
 * `correta === true`; `null`, índice fora dos limites ou alternativa errada não
 * acertam e NÃO lançam. Uma pergunta aberta só soma em `totalAbertas` (correção
 * por IA, fora daqui). Discrepância de tipo entre pergunta e resposta é tratada
 * como não-acerto defensivo.
 */
export function calcularPontuacao(
  perguntas: PerguntaQuiz[],
  respostas: RespostaUsuarioPura[],
): PontuacaoQuiz {
  let acertos = 0;
  let totalObjetivas = 0;
  let totalAbertas = 0;

  perguntas.forEach((pergunta, indice) => {
    if (pergunta.tipo === "aberta") {
      totalAbertas += 1;
      return;
    }

    totalObjetivas += 1;
    const resposta = respostas[indice];
    // Sem resposta ou discrepância de tipo: não-acerto defensivo.
    if (!resposta || resposta.tipo !== "multipla") return;

    const escolhida = resposta.escolhidaIndice;
    if (escolhida === null) return;
    const alternativa = pergunta.alternativas[escolhida];
    if (alternativa?.correta === true) acertos += 1;
  });

  return { acertos, totalObjetivas, totalAbertas };
}
