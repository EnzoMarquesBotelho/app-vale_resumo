/**
 * Serviço da DICA DA IA do dia: transforma o contexto mecânico já calculado
 * (prova + `DicaDoDia`) numa dica curta de estudo via Ollama.
 *
 * Roda no processo main. Espelha `resumo.ts`: monta o prompt
 * (`montarPromptDicaDoDia`) e chama a função de geração injetada — texto livre,
 * SEM `format` (a dica é prosa curta, não estrutura). A chamada ao modelo é
 * injetável para facilitar os testes (Ollama mockado); o handler resolve o
 * modelo via `modeloParaGeracao()` antes de injetar `gerar`.
 */
import { montarPromptDicaDoDia } from "@shared/prompts";
import type { DicaDoDia, Prova } from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";

/**
 * Função que gera texto a partir de um prompt (Ollama por padrão). A dica usa
 * só texto livre, então não há parâmetro `format`.
 */
export type GerarTextoDica = (prompt: string) => Promise<string>;

/** Parâmetros para gerar a dica da IA. */
export interface GerarDicaIaParams {
  /** A prova (título usado na frase). */
  prova: Prova;
  /** A dica mecânica já calculada (dias restantes + cadernos em foco). */
  dica: DicaDoDia;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTextoDica;
}

/**
 * Gera a dica da IA para uma prova a partir do contexto mecânico já calculado.
 *
 * @returns o texto da dica (aparado).
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarDicaIa({
  prova,
  dica,
  gerar = (prompt) => generatePadrao({ prompt }),
}: GerarDicaIaParams): Promise<string> {
  const prompt = montarPromptDicaDoDia(
    prova.titulo,
    dica.diasRestantes,
    dica.cadernosEmFoco,
  );
  const texto = await gerar(prompt);
  return texto.trim();
}
