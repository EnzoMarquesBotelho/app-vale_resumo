/**
 * Serviço de geração, parsing e validação do mapa mental.
 *
 * Roda no processo main. Espelha o padrão tolerante de `parse.ts`: o modelo
 * devolve uma árvore em JSON (possivelmente "suja"), `extrairBlocoJson` extrai
 * o bloco, uma sanitização recursiva normaliza/valida a árvore (poda
 * profundidade/leque/tamanho, descarta nós sem rótulo, trunca rótulos longos) e
 * atribui ids densos, e há UMA re-tentativa corretiva antes de falhar com
 * mensagem amigável. Textos grandes são primeiro condensados via `gerarResumo`
 * (como no resumo) para não estourar a janela de contexto.
 *
 * A chamada ao modelo é injetável (`gerar`) para os testes mockarem o Ollama.
 */
import {
  MAPA_MAX_FILHOS_POR_NO,
  MAPA_MAX_NOS,
  MAPA_PROFUNDIDADE_MAXIMA,
  MAPA_ROTULO_MAX,
  tamanhoMaximoChunkCaracteres,
} from "@shared/constants";
import {
  montarPromptCorrigirMapaMental,
  montarPromptMapaMental,
} from "@shared/prompts";
import type { MapaMental, NoMapaMental } from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";
import { extrairBlocoJson } from "./parse.js";
import { dividirEmChunks, gerarResumo } from "./resumo.js";
import type { GerarTexto } from "./resumo.js";

/** Erro lançado quando não há texto para gerar o mapa mental. */
export class SemTextoParaMapaMentalError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "SEM_TEXTO_PARA_MAPA_MENTAL" as const;
  constructor() {
    super(
      "Não há texto para gerar o mapa mental. Importe um arquivo com conteúdo.",
    );
    this.name = "SemTextoParaMapaMentalError";
  }
}

/**
 * Erro lançado quando, mesmo após a re-tentativa corretiva, a resposta do
 * modelo não pôde ser interpretada como um mapa mental válido.
 */
export class MapaMentalInvalidoError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "MAPA_MENTAL_INVALIDO" as const;
  constructor() {
    super(
      "A IA não devolveu um mapa mental em um formato válido. Tente gerar novamente.",
    );
    this.name = "MapaMentalInvalidoError";
  }
}

/**
 * Trunca um rótulo em `MAPA_ROTULO_MAX` caracteres com reticência na fronteira
 * de palavra: corta no limite, recua até o último espaço quando houver um
 * dentro do limite, apara e anexa `…`. Para uma única palavra longa (sem
 * espaço), corta em `MAPA_ROTULO_MAX - 1` e anexa `…`. O comprimento final
 * (incluindo o `…`) nunca passa de `MAPA_ROTULO_MAX`.
 */
function truncarRotulo(rotulo: string): string {
  if (rotulo.length <= MAPA_ROTULO_MAX) return rotulo;
  // Deixa espaço para o caractere de reticência.
  const corte = rotulo.slice(0, MAPA_ROTULO_MAX - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte;
  return `${base.trimEnd()}…`;
}

/** Estado da travessia de sanitização (teto global de nós). */
interface ContextoSanitizacao {
  /** Quantos nós já foram aceitos no mapa inteiro. */
  totalNos: number;
  /** Próximo id a atribuir (densos `n0`, `n1`, ...). */
  proximoId: number;
}

/**
 * Sanitiza/valida um candidato a nó recursivamente, atribuindo ids em
 * pré-ordem após a poda. Devolve `null` quando o nó é inválido (sem rótulo
 * string não-vazio) ou quando o teto `MAPA_MAX_NOS` já foi atingido — nesse
 * caso o nó (e sua subárvore) é descartado pelo chamador.
 */
function sanitizarNo(
  candidato: unknown,
  nivel: number,
  ctx: ContextoSanitizacao,
): NoMapaMental | null {
  if (typeof candidato !== "object" || candidato === null) return null;
  if (ctx.totalNos >= MAPA_MAX_NOS) return null;

  const obj = candidato as Record<string, unknown>;
  const rotuloBruto = obj.rotulo;
  if (typeof rotuloBruto !== "string" || rotuloBruto.trim().length === 0) {
    return null;
  }
  const rotulo = truncarRotulo(rotuloBruto.trim());

  // Reserva o id e conta o nó antes de descer (ids em pré-ordem).
  const id = `n${ctx.proximoId}`;
  ctx.proximoId += 1;
  ctx.totalNos += 1;

  const filhos: NoMapaMental[] = [];
  // Poda de profundidade: nós no nível máximo viram folhas.
  if (nivel < MAPA_PROFUNDIDADE_MAXIMA && Array.isArray(obj.filhos)) {
    for (const filhoBruto of obj.filhos) {
      // Poda de leque: no máximo MAPA_MAX_FILHOS_POR_NO filhos válidos.
      if (filhos.length >= MAPA_MAX_FILHOS_POR_NO) break;
      if (ctx.totalNos >= MAPA_MAX_NOS) break;
      const filho = sanitizarNo(filhoBruto, nivel + 1, ctx);
      if (filho !== null) filhos.push(filho);
    }
  }

  return { id, rotulo, filhos };
}

/**
 * Interpreta uma resposta "crua" do modelo como a árvore raiz de um mapa
 * mental. Função pura, sem efeitos — fácil de testar em isolamento.
 *
 * Aceita duas formas na raiz: um objeto `{ "raiz": {...} }` ou um nó solto
 * `{ "rotulo": ..., "filhos": [...] }`. Se o candidato à raiz não for um objeto
 * não-nulo (ex.: `{"raiz": "x"}`, topo em array/string/number/null), devolve
 * `null`. Sanitiza/valida recursivamente e atribui ids; se a raiz não tiver
 * rótulo válido após sanear, devolve `null`.
 *
 * @returns a árvore raiz saneada, ou `null` se nada pôde ser extraído.
 */
export function parseMapaMental(resposta: string): NoMapaMental | null {
  const bloco = extrairBlocoJson(resposta);
  if (bloco === null) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(bloco);
  } catch {
    return null;
  }

  // Normaliza a forma de entrada para o candidato à raiz.
  let candidato: unknown = dados;
  if (
    typeof dados === "object" &&
    dados !== null &&
    !Array.isArray(dados) &&
    "raiz" in (dados as Record<string, unknown>)
  ) {
    candidato = (dados as Record<string, unknown>).raiz;
  }
  if (typeof candidato !== "object" || candidato === null) return null;
  if (Array.isArray(candidato)) return null;

  const ctx: ContextoSanitizacao = { totalNos: 0, proximoId: 0 };
  return sanitizarNo(candidato, 1, ctx);
}

/** Parâmetros para gerar um mapa mental. */
export interface GerarMapaMentalParams {
  /** Texto a usar como base (já extraído do arquivo importado). */
  texto: string;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTexto;
  /**
   * Tamanho máximo de cada pedaço, em caracteres. Default:
   * `tamanhoMaximoChunkCaracteres`. Rege o gate de chunking do mapa E é
   * repassado a `gerarResumo`, para que o mesmo limite valha nas duas etapas.
   */
  tamanhoChunk?: number;
}

/**
 * Gera um mapa mental a partir do `texto`.
 *
 * Fluxo tolerante a falhas (nunca quebra a UI), igual em espírito aos
 * flashcards, com o passo de condensação do resumo quando o texto é grande:
 *  1. texto vazio → `SemTextoParaMapaMentalError`;
 *  2. texto grande (mais de um chunk) → condensa via `gerarResumo(modo: "longo")`
 *     com o mesmo `tamanhoChunk`, e usa o resumo inteiro como base (passo único,
 *     sem re-chunk);
 *  3. 1ª tentativa: pede a árvore e tenta interpretar; se malformada, dispara
 *     UMA re-tentativa corretiva;
 *  4. se ainda falhar → `MapaMentalInvalidoError`.
 *
 * @throws {SemTextoParaMapaMentalError} se o texto estiver vazio.
 * @throws {MapaMentalInvalidoError} se o parsing falhar mesmo após a re-tentativa.
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarMapaMental({
  texto,
  gerar = generatePadrao,
  tamanhoChunk = tamanhoMaximoChunkCaracteres,
}: GerarMapaMentalParams): Promise<MapaMental> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaMapaMentalError();
  }

  // Texto grande: condensa primeiro num resumo coerente e usa-o como base.
  // O mesmo `tamanhoChunk` rege o gate do mapa e o chunking do resumo.
  const base =
    dividirEmChunks(texto, tamanhoChunk).length > 1
      ? await gerarResumo({ texto, modo: "longo", gerar, tamanhoChunk })
      : texto;

  // 1ª tentativa: prompt normal.
  const primeira = await gerar(montarPromptMapaMental(base));
  const raiz = parseMapaMental(primeira);
  if (raiz !== null) {
    return { documentoId: "", raiz, geradoEm: new Date().toISOString() };
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirMapaMental(primeira));
  const corrigida = parseMapaMental(segunda);
  if (corrigida !== null) {
    return {
      documentoId: "",
      raiz: corrigida,
      geradoEm: new Date().toISOString(),
    };
  }

  throw new MapaMentalInvalidoError();
}
