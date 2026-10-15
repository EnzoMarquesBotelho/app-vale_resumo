/**
 * Templates de prompt para as gerações de IA.
 *
 * Compartilhado entre main e renderer (o main monta o prompt e chama o
 * Ollama). Textos de prompt em português — a saída da IA é para o usuário.
 * Nomes de identificadores em inglês, conforme o estilo do projeto.
 */

import type { ModoResumo } from "./types";

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
