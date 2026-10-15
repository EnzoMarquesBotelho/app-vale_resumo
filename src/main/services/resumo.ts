/**
 * Serviço de resumo: transforma o texto importado em um resumo via Ollama.
 *
 * Roda no processo main. Para textos grandes, divide o conteúdo em pedaços
 * (chunks) e resume em etapas (map→reduce) para não estourar a janela de
 * contexto do modelo local:
 *  1. map: resume cada pedaço separadamente;
 *  2. reduce: combina os resumos parciais num resumo final coerente.
 *
 * Textos pequenos (um único pedaço) são resumidos em uma só chamada.
 * A chamada ao modelo é injetável para facilitar os testes (Ollama mockado).
 *
 * Limite conhecido (MVP): a etapa reduce é de passo único — concatena todos os
 * resumos parciais num só prompt. Para materiais de faculdade típicos isso é
 * suficiente, mas um texto com dezenas de pedaços pode gerar um prompt de
 * combinação grande o bastante para pressionar a janela de contexto. Um reduce
 * hierárquico (combinar em níveis) fica para quando surgir um PDF muito extenso.
 */
import { tamanhoMaximoChunkCaracteres } from "@shared/constants";
import {
  montarPromptCombinarResumos,
  montarPromptResumo,
} from "@shared/prompts";
import type { ModoResumo } from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";

/** Função que gera texto a partir de um prompt (Ollama por padrão). */
export type GerarTexto = (prompt: string) => Promise<string>;

/** Parâmetros para gerar um resumo. */
export interface GerarResumoParams {
  /** Texto a resumir (já extraído do arquivo importado). */
  texto: string;
  /** Modo do resumo: curto/essencial ou longo/detalhado. */
  modo: ModoResumo;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTexto;
  /**
   * Tamanho máximo de cada pedaço, em caracteres. Default:
   * `tamanhoMaximoChunkCaracteres`. Exposto para facilitar os testes.
   */
  tamanhoChunk?: number;
}

/** Erro lançado quando não há texto para resumir. */
export class SemTextoParaResumirError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "SEM_TEXTO_PARA_RESUMIR" as const;
  constructor() {
    super("Não há texto para resumir. Importe um arquivo com conteúdo.");
    this.name = "SemTextoParaResumirError";
  }
}

/**
 * Divide um texto em pedaços de no máximo `tamanhoChunk` caracteres, tentando
 * cortar em quebras de parágrafo para preservar o sentido. Se um parágrafo for
 * maior que o limite, ele é fatiado em pedaços do tamanho máximo.
 */
export function dividirEmChunks(
  texto: string,
  tamanhoChunk: number,
): string[] {
  const limpo = texto.trim();
  if (limpo.length === 0) return [];
  if (limpo.length <= tamanhoChunk) return [limpo];

  const paragrafos = limpo.split(/\n\s*\n/);
  const chunks: string[] = [];
  let atual = "";

  const empurrar = (): void => {
    const pronto = atual.trim();
    if (pronto.length > 0) chunks.push(pronto);
    atual = "";
  };

  for (const paragrafo of paragrafos) {
    // Parágrafo isolado maior que o limite: fatia em blocos do tamanho máximo.
    if (paragrafo.length > tamanhoChunk) {
      empurrar();
      for (let i = 0; i < paragrafo.length; i += tamanhoChunk) {
        chunks.push(paragrafo.slice(i, i + tamanhoChunk).trim());
      }
      continue;
    }
    // Caberia no pedaço atual? Senão, fecha o atual e começa outro.
    const candidato = atual.length === 0 ? paragrafo : `${atual}\n\n${paragrafo}`;
    if (candidato.length > tamanhoChunk) {
      empurrar();
      atual = paragrafo;
    } else {
      atual = candidato;
    }
  }
  empurrar();

  return chunks;
}

/**
 * Gera um resumo do `texto` no `modo` escolhido.
 *
 * - Texto pequeno: uma única chamada ao modelo.
 * - Texto grande: resume cada pedaço e depois combina os parciais.
 *
 * @throws {SemTextoParaResumirError} se o texto estiver vazio.
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarResumo({
  texto,
  modo,
  gerar = generatePadrao,
  tamanhoChunk = tamanhoMaximoChunkCaracteres,
}: GerarResumoParams): Promise<string> {
  const chunks = dividirEmChunks(texto, tamanhoChunk);
  if (chunks.length === 0) {
    throw new SemTextoParaResumirError();
  }

  // Caso simples: cabe numa única chamada.
  if (chunks.length === 1) {
    const resumo = await gerar(montarPromptResumo(modo, chunks[0]));
    return resumo.trim();
  }

  // map: resume cada pedaço separadamente.
  const parciais: string[] = [];
  for (const chunk of chunks) {
    const parcial = await gerar(montarPromptResumo(modo, chunk));
    parciais.push(parcial.trim());
  }

  // reduce: combina os parciais num resumo final coerente.
  const final = await gerar(montarPromptCombinarResumos(modo, parciais));
  return final.trim();
}
