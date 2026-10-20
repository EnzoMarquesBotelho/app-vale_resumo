/**
 * Templates de prompt para as gerações de IA.
 *
 * Compartilhado entre main e renderer (o main monta o prompt e chama o
 * Ollama). Textos de prompt em português — a saída da IA é para o usuário.
 * Nomes de identificadores em inglês, conforme o estilo do projeto.
 */

import {
  MAPA_PROFUNDIDADE_MAXIMA,
  QUIZ_ALTERNATIVAS_MAXIMO,
  QUIZ_ALTERNATIVAS_MINIMO,
} from "./constants";
import type { CadernoEmFoco, ModoConteudo, ModoQuiz, ModoResumo } from "./types";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "./types";

/** Instrução de tamanho/profundidade por modo de resumo. */
const INSTRUCOES_RESUMO: Record<ModoResumo, string> = {
  curto:
    "Faça um resumo CURTO e essencial: apenas as ideias centrais, em poucos " +
    "parágrafos ou tópicos. Vá direto ao ponto, sem repetir o texto original.",
  longo:
    "Faça um resumo LONGO e detalhado: cubra os principais conceitos, " +
    "definições, exemplos e relações entre as ideias, de forma organizada " +
    "(use seções ou tópicos quando ajudar na clareza).",
};

/**
 * Monta o prompt para resumir um trecho de texto no modo escolhido.
 * Usado tanto para textos pequenos (uma chamada) quanto para cada pedaço
 * (chunk) de um texto grande.
 */
export function montarPromptResumo(modo: ModoResumo, texto: string): string {
  return [
    "Você é um assistente de estudos. Resuma o conteúdo abaixo em português.",
    INSTRUCOES_RESUMO[modo],
    "Responda apenas com o resumo, sem comentários sobre a tarefa.",
    "",
    "Conteúdo:",
    texto,
  ].join("\n");
}

/**
 * Monta o prompt que combina resumos parciais (de cada pedaço) num resumo
 * final coerente, respeitando o modo escolhido. Usado na segunda etapa da
 * sumarização de textos grandes (map→reduce).
 */
export function montarPromptCombinarResumos(
  modo: ModoResumo,
  resumosParciais: string[],
): string {
  const partes = resumosParciais
    .map((parcial, indice) => `Parte ${indice + 1}:\n${parcial}`)
    .join("\n\n");
  return [
    "Você é um assistente de estudos. Abaixo estão resumos parciais de partes " +
      "diferentes de um mesmo material, na ordem em que aparecem.",
    "Combine-os em um único resumo coerente em português, sem repetir ideias.",
    INSTRUCOES_RESUMO[modo],
    "Responda apenas com o resumo final, sem comentários sobre a tarefa.",
    "",
    partes,
  ].join("\n");
}

/**
 * Garante que a quantidade de flashcards fique dentro dos limites do MVP
 * (`QUANTIDADE_MINIMA`–`QUANTIDADE_MAXIMA`). Valores fora da faixa são
 * ajustados para a borda mais próxima; valores não inteiros são arredondados.
 * Centraliza a regra para prompt e serviço usarem o mesmo valor.
 */
export function normalizarQuantidade(quantidade: number): number {
  const inteiro = Math.round(quantidade);
  if (Number.isNaN(inteiro)) return QUANTIDADE_MINIMA;
  if (inteiro < QUANTIDADE_MINIMA) return QUANTIDADE_MINIMA;
  if (inteiro > QUANTIDADE_MAXIMA) return QUANTIDADE_MAXIMA;
  return inteiro;
}

/**
 * Monta o prompt que pede `quantidade` flashcards (pares pergunta/resposta) em
 * JSON a partir do conteúdo. A saída estruturada permite que a UI monte os
 * cards; o parser (`parse.ts`) é tolerante caso o modelo adicione texto ao
 * redor do JSON. A `quantidade` é normalizada aos limites do MVP (5–100).
 */
export function montarPromptFlashcards(
  quantidade: number,
  texto: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "Você é um assistente de estudos. Crie flashcards (pares pergunta/resposta) " +
      "em português a partir do conteúdo abaixo.",
    `Gere exatamente ${n} flashcards cobrindo os pontos mais importantes do conteúdo.`,
    "Cada flashcard deve ter uma pergunta objetiva e uma resposta correta e concisa.",
    "Responda APENAS com um JSON válido, sem comentários nem texto fora do JSON, " +
      "no formato:",
    '{"flashcards": [{"pergunta": "...", "resposta": "..."}]}',
    "",
    "Conteúdo:",
    texto,
  ].join("\n");
}

/**
 * Monta o prompt corretivo usado quando o modelo devolve um JSON malformado.
 * Reapresenta o formato esperado e a resposta anterior, pedindo somente o JSON
 * corrigido. Usado pela re-tentativa única em `parse.ts`/serviço de flashcards.
 */
export function montarPromptCorrigirFlashcards(
  quantidade: number,
  respostaAnterior: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "A resposta anterior não era um JSON válido no formato pedido.",
    `Corrija e responda APENAS com um JSON válido com ${n} flashcards, sem ` +
      "nenhum texto fora do JSON, no formato:",
    '{"flashcards": [{"pergunta": "...", "resposta": "..."}]}',
    "",
    "Resposta anterior a corrigir:",
    respostaAnterior,
  ].join("\n");
}

/**
 * Formato aninhado (sem ids) do mapa mental pedido ao modelo. O main atribui os
 * ids após validar — o modelo é ruim em manter ids únicos, então o prompt só
 * pede rótulos + filhos. Reusado no prompt normal e no corretivo.
 */
const FORMATO_MAPA_MENTAL =
  '{"raiz": {"rotulo": "Tema central", "filhos": ' +
  '[{"rotulo": "Ramo", "filhos": []}]}}';

/**
 * Monta o prompt que pede um mapa mental (árvore tema → ramos → sub-ramos) em
 * JSON aninhado a partir do conteúdo. A saída estruturada permite que a UI
 * desenhe a árvore; o parser (`mapa.ts`) é tolerante caso o modelo adicione
 * texto ao redor do JSON. Pede rótulos curtos e profundidade de até
 * `MAPA_PROFUNDIDADE_MAXIMA` níveis, sem ids (o main os atribui).
 */
export function montarPromptMapaMental(texto: string): string {
  return [
    "Você é um assistente de estudos. Crie um mapa mental hierárquico em " +
      "português a partir do conteúdo abaixo.",
    "O mapa é uma árvore: um tema central na raiz, ramos (subtemas) e " +
      "sub-ramos (detalhes).",
    "Use rótulos CURTOS (poucas palavras), não frases longas nem parágrafos.",
    `Use no máximo ${MAPA_PROFUNDIDADE_MAXIMA} níveis de profundidade ` +
      "(a raiz é o nível 1).",
    "Responda APENAS com um JSON válido, sem ids, sem comentários nem texto " +
      "fora do JSON, no formato:",
    FORMATO_MAPA_MENTAL,
    "",
    "Conteúdo:",
    texto,
  ].join("\n");
}

/**
 * Monta o prompt corretivo usado quando o modelo devolve um JSON malformado
 * para o mapa mental. Reapresenta o formato esperado e a resposta anterior,
 * pedindo somente o JSON corrigido. Usado pela re-tentativa única em `mapa.ts`.
 */
export function montarPromptCorrigirMapaMental(
  respostaAnterior: string,
): string {
  return [
    "A resposta anterior não era um JSON válido no formato pedido.",
    "Corrija e responda APENAS com um JSON válido do mapa mental, sem ids e " +
      "sem nenhum texto fora do JSON, no formato:",
    FORMATO_MAPA_MENTAL,
    "",
    "Resposta anterior a corrigir:",
    respostaAnterior,
  ].join("\n");
}

/**
 * Descreve um caderno em foco para o prompt da dica: nome, contagem de
 * documentos e os artefatos disponíveis (resumo/flashcards). Texto curto, em
 * português, para o modelo saber do que o usuário dispõe para estudar.
 */
function descreverCadernoParaDica(c: CadernoEmFoco): string {
  const docs = c.totalDocumentos === 1 ? "1 documento" : `${c.totalDocumentos} documentos`;
  const artefatos: string[] = [];
  if (c.temResumo) artefatos.push("resumo");
  if (c.temFlashcards) artefatos.push("flashcards");
  const sufixo = artefatos.length > 0 ? `; tem ${artefatos.join(" e ")}` : "";
  return `«${c.cadernoNome}» (${docs}${sufixo})`;
}

/**
 * Monta o prompt da DICA DA IA do dia para uma prova (design §5.4), no estilo
 * de `montarPromptResumo`: recebe o contexto mecânico já calculado — título da
 * prova, dias restantes e os cadernos em foco de hoje — e pede uma dica CURTA
 * de estudo em português. Saída em TEXTO LIVRE (sem JSON, sem `format`), como o
 * resumo: a dica é prosa curta, não estrutura.
 */
export function montarPromptDicaDoDia(
  titulo: string,
  diasRestantes: number,
  cadernosEmFoco: CadernoEmFoco[],
): string {
  const foco =
    cadernosEmFoco.length === 0
      ? "Nenhum caderno de material em foco para hoje."
      : `Cadernos em foco hoje: ${cadernosEmFoco
          .map((c) => descreverCadernoParaDica(c))
          .join(", ")}.`;
  return [
    "Você é um assistente de estudos. Dê uma dica CURTA e prática de estudo " +
      "em português para o aluno aproveitar o dia de revisão.",
    `Prova: «${titulo}». Faltam ${diasRestantes} dias.`,
    foco,
    "Responda em poucas frases, em texto corrido (sem listas longas e sem " +
      "comentários sobre a tarefa).",
  ].join("\n");
}

/** Instrução de natureza por modo de lista de exercícios. */
const INSTRUCOES_EXERCICIOS: Record<ModoConteudo, string> = {
  teorica:
    "Gere exercícios PURAMENTE TEÓRICOS: perguntas conceituais, de definição, " +
    "explicação e compreensão, sem cálculos nem resolução de problemas práticos.",
  pratica:
    "Gere exercícios PURAMENTE PRÁTICOS: problemas para resolver, aplicações, " +
    "cálculos ou situações concretas, evitando perguntas apenas conceituais.",
  mista:
    "Gere uma lista MISTA: combine exercícios teóricos (conceituais) e práticos " +
    "(aplicação/resolução), equilibrando os dois tipos.",
};

/**
 * Monta o prompt que pede `quantidade` exercícios (enunciado + resposta) em
 * JSON a partir do conteúdo, no `modo` escolhido (teórica/prática/mista). A
 * saída estruturada permite que a UI monte a lista; o parser (`parse.ts`) é
 * tolerante caso o modelo adicione texto ao redor do JSON. A `quantidade` é
 * normalizada aos limites do MVP (5–100).
 */
export function montarPromptExercicios(
  modo: ModoConteudo,
  quantidade: number,
  texto: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "Você é um assistente de estudos. Crie uma lista de exercícios em português " +
      "a partir do conteúdo abaixo.",
    INSTRUCOES_EXERCICIOS[modo],
    `Gere exatamente ${n} exercícios cobrindo os pontos mais importantes do conteúdo.`,
    "Cada exercício deve ter um enunciado claro e uma resposta/gabarito correto e conciso.",
    "Responda APENAS com um JSON válido, sem comentários nem texto fora do JSON, " +
      "no formato:",
    '{"exercicios": [{"enunciado": "...", "resposta": "..."}]}',
    "",
    "Conteúdo:",
    texto,
  ].join("\n");
}

/**
 * Monta o prompt corretivo usado quando o modelo devolve um JSON malformado
 * para a lista de exercícios. Reapresenta o formato esperado e a resposta
 * anterior, pedindo somente o JSON corrigido. Usado pela re-tentativa única.
 */
export function montarPromptCorrigirExercicios(
  quantidade: number,
  respostaAnterior: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "A resposta anterior não era um JSON válido no formato pedido.",
    `Corrija e responda APENAS com um JSON válido com ${n} exercícios, sem ` +
      "nenhum texto fora do JSON, no formato:",
    '{"exercicios": [{"enunciado": "...", "resposta": "..."}]}',
    "",
    "Resposta anterior a corrigir:",
    respostaAnterior,
  ].join("\n");
}

/** Instrução de natureza das perguntas por modo de quiz. */
const INSTRUCOES_QUIZ: Record<ModoQuiz, string> = {
  multipla:
    "Gere APENAS perguntas OBJETIVAS (de múltipla escolha): cada uma com " +
    "alternativas e exatamente uma correta.",
  aberta:
    "Gere APENAS perguntas ABERTAS (discursivas): cada uma com um gabarito " +
    "esperado, sem alternativas.",
  misto:
    "Gere um quiz MISTO: combine perguntas objetivas (múltipla escolha) e " +
    "abertas (discursivas), equilibrando os dois tipos.",
};

/**
 * Formato (JSON) do quiz pedido ao modelo: uma lista de perguntas em que cada
 * item é de `tipo` "multipla" (com `alternativas`, uma `correta: true`) ou
 * "aberta" (com `gabarito`). Reusado no prompt normal e no corretivo.
 */
const FORMATO_QUIZ =
  '{"perguntas": [' +
  '{"tipo": "multipla", "enunciado": "...", "alternativas": ' +
  '[{"texto": "...", "correta": true}, {"texto": "...", "correta": false}]}, ' +
  '{"tipo": "aberta", "enunciado": "...", "gabarito": "..."}]}';

/**
 * Monta o prompt que pede um quiz com `quantidade` perguntas em JSON a partir
 * do conteúdo, no `modo` escolhido (multipla/aberta/misto). A saída estruturada
 * permite que a UI monte o quiz interativo; o parser (`quiz.ts`) é tolerante
 * caso o modelo adicione texto ao redor do JSON. A `quantidade` é normalizada
 * aos limites do MVP (5–100).
 */
export function montarPromptQuiz(
  modo: ModoQuiz,
  quantidade: number,
  texto: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "Você é um assistente de estudos. Crie um quiz em português a partir do " +
      "conteúdo abaixo.",
    INSTRUCOES_QUIZ[modo],
    `Gere exatamente ${n} perguntas cobrindo os pontos mais importantes do conteúdo.`,
    `Cada pergunta de múltipla escolha deve ter entre ${QUIZ_ALTERNATIVAS_MINIMO} e ` +
      `${QUIZ_ALTERNATIVAS_MAXIMO} alternativas, com exatamente uma marcada como ` +
      '"correta": true.',
    "Cada pergunta aberta deve ter um gabarito correto e conciso.",
    "Responda APENAS com um JSON válido, sem comentários nem texto fora do JSON, " +
      "no formato:",
    FORMATO_QUIZ,
    "",
    "Conteúdo:",
    texto,
  ].join("\n");
}

/**
 * Monta o prompt corretivo usado quando o modelo devolve um JSON malformado
 * para o quiz. Reapresenta o formato esperado e a resposta anterior, pedindo
 * somente o JSON corrigido. Usado pela re-tentativa única em `quiz.ts`.
 */
export function montarPromptCorrigirQuiz(
  modo: ModoQuiz,
  quantidade: number,
  respostaAnterior: string,
): string {
  const n = normalizarQuantidade(quantidade);
  return [
    "A resposta anterior não era um JSON válido no formato pedido.",
    INSTRUCOES_QUIZ[modo],
    `Corrija e responda APENAS com um JSON válido com ${n} perguntas, sem ` +
      "nenhum texto fora do JSON, no formato:",
    FORMATO_QUIZ,
    "",
    "Resposta anterior a corrigir:",
    respostaAnterior,
  ].join("\n");
}

/**
 * Formato (JSON) da avaliação pedida ao modelo: um único objeto com o veredito
 * (um dos três níveis) e um comentário curto. Reusado no prompt normal e no
 * corretivo. Um único prompt serve exercícios e perguntas abertas do quiz.
 */
const FORMATO_AVALIACAO =
  '{"veredito": "correto|parcial|incorreto", "comentario": "..."}';

/**
 * Monta o prompt que pede a correção de UMA resposta de aluno em JSON, dado o
 * enunciado, o gabarito esperado e a resposta dada. Define o papel de corretor
 * e os três níveis de veredito explicitamente; pede um comentário curto (1–2
 * frases em português). A saída estruturada permite que a UI mostre o selo e o
 * comentário; o parser (`avaliacao.ts`) é tolerante caso o modelo adicione
 * texto ao redor do JSON. Um único prompt serve exercícios e quiz.
 */
export function montarPromptAvaliacao(
  enunciado: string,
  gabarito: string,
  resposta: string,
): string {
  return [
    "Você é um corretor de estudos. Avalie em português a resposta do aluno " +
      "comparando-a com o gabarito, e classifique em um dos três níveis:",
    '- "correto": a resposta está certa e cobre o que o gabarito pede;',
    '- "parcial": a resposta está parcialmente certa (incompleta ou com ' +
      "imprecisões);",
    '- "incorreto": a resposta está errada ou não responde ao que foi pedido.',
    "Escreva um comentário CURTO (1 a 2 frases em português) justificando o " +
      "veredito.",
    "Responda APENAS com um JSON válido, sem comentários nem texto fora do " +
      "JSON, no formato:",
    FORMATO_AVALIACAO,
    "",
    `Enunciado: ${enunciado}`,
    `Gabarito: ${gabarito}`,
    `Resposta do aluno: ${resposta}`,
  ].join("\n");
}

/**
 * Monta o prompt corretivo usado quando o modelo devolve um JSON malformado
 * para a avaliação. Reapresenta o formato esperado e a resposta anterior,
 * pedindo somente o JSON corrigido. Usado pela re-tentativa única em
 * `avaliacao.ts`.
 */
export function montarPromptCorrigirAvaliacao(respostaAnterior: string): string {
  return [
    "A resposta anterior não era um JSON válido no formato pedido.",
    "Corrija e responda APENAS com um JSON válido da avaliação, sem nenhum " +
      "texto fora do JSON, no formato:",
    FORMATO_AVALIACAO,
    "",
    "Resposta anterior a corrigir:",
    respostaAnterior,
  ].join("\n");
}
