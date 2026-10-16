/**
 * Templates de prompt para as gerações de IA.
 *
 * Compartilhado entre main e renderer (o main monta o prompt e chama o
 * Ollama). Textos de prompt em português — a saída da IA é para o usuário.
 * Nomes de identificadores em inglês, conforme o estilo do projeto.
 */

import { MAPA_PROFUNDIDADE_MAXIMA } from "./constants";
import type { ModoConteudo, ModoResumo } from "./types";
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
