/**
 * Serviço de geração, parsing e validação do quiz interativo.
 *
 * Roda no processo main. Espelha o padrão tolerante de `parse.ts`: o modelo
 * devolve uma lista de perguntas em JSON (possivelmente "suja"),
 * `extrairBlocoJson` extrai o bloco, uma sanitização por pergunta
 * normaliza/valida cada item (poda alternativas além do teto, exige o mínimo e
 * exatamente uma correta na múltipla escolha, exige gabarito na aberta,
 * descarta itens inválidos e filtra por modo) e há UMA re-tentativa corretiva
 * (como flashcards/exercícios — NÃO as duas do `mapa.ts`) antes de falhar com
 * mensagem amigável. Textos grandes são primeiro condensados via `gerarResumo`
 * (como no mapa) para não estourar a janela de contexto.
 *
 * A chamada ao modelo é injetável (`gerar`) para os testes mockarem o Ollama.
 */
import {
  QUIZ_ALTERNATIVAS_MAXIMO,
  QUIZ_ALTERNATIVAS_MINIMO,
  tamanhoMaximoChunkCaracteres,
} from "@shared/constants";
import {
  montarPromptCorrigirQuiz,
  montarPromptQuiz,
  normalizarQuantidade,
} from "@shared/prompts";
import type {
  AlternativaQuiz,
  ModoQuiz,
  PerguntaQuiz,
  Quiz,
} from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";
import { extrairBlocoJson } from "./parse.js";
import { dividirEmChunks, gerarResumo } from "./resumo.js";
import type { GerarTexto } from "./resumo.js";

/** Erro lançado quando não há texto para gerar o quiz. */
export class SemTextoParaQuizError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "SEM_TEXTO_PARA_QUIZ" as const;
  constructor() {
    super(
      "Não há texto para gerar o quiz. Importe um arquivo com conteúdo.",
    );
    this.name = "SemTextoParaQuizError";
  }
}

/**
 * Erro lançado quando, mesmo após a re-tentativa corretiva, a resposta do
 * modelo não pôde ser interpretada como um quiz válido.
 */
export class QuizInvalidoError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "QUIZ_INVALIDO" as const;
  constructor() {
    super(
      "A IA não devolveu um quiz em um formato válido. Tente gerar novamente. " +
        "Para melhores resultados, use um modelo de texto (ex.: llama3.1, qwen2.5, gemma2) " +
        "e evite modelos de visão ou de embedding (moondream, minicpm-v, nomic-embed-text).",
    );
    this.name = "QuizInvalidoError";
  }
}

/**
 * Sanitiza/valida um candidato a alternativa de múltipla escolha. Devolve `null`
 * quando o `texto` não é uma string não-vazia (após trim); `correta` não-boolean
 * vira `false` (defensivo).
 */
function sanitizarAlternativa(candidato: unknown): AlternativaQuiz | null {
  if (typeof candidato !== "object" || candidato === null) return null;
  const obj = candidato as Record<string, unknown>;
  if (typeof obj.texto !== "string" || obj.texto.trim().length === 0) {
    return null;
  }
  return {
    texto: obj.texto.trim(),
    correta: obj.correta === true,
  };
}

/**
 * Sanitiza/valida um candidato a pergunta. Devolve `null` quando o item é
 * inválido (sem enunciado, `tipo` fora de "multipla"/"aberta", múltipla sem o
 * mínimo de alternativas ou sem exatamente uma correta, aberta sem gabarito).
 */
function sanitizarPergunta(candidato: unknown): PerguntaQuiz | null {
  if (typeof candidato !== "object" || candidato === null) return null;
  const obj = candidato as Record<string, unknown>;

  if (
    typeof obj.enunciado !== "string" ||
    obj.enunciado.trim().length === 0
  ) {
    return null;
  }
  const enunciado = obj.enunciado.trim();

  if (obj.tipo === "multipla") {
    if (!Array.isArray(obj.alternativas)) return null;
    const alternativas: AlternativaQuiz[] = [];
    for (const bruta of obj.alternativas) {
      // Poda de leque: no máximo QUIZ_ALTERNATIVAS_MAXIMO alternativas válidas.
      if (alternativas.length >= QUIZ_ALTERNATIVAS_MAXIMO) break;
      const alt = sanitizarAlternativa(bruta);
      if (alt !== null) alternativas.push(alt);
    }
    if (alternativas.length < QUIZ_ALTERNATIVAS_MINIMO) return null;
    // Exatamente uma correta: zero ou mais de uma descarta a pergunta.
    const corretas = alternativas.filter((a) => a.correta).length;
    if (corretas !== 1) return null;
    return { tipo: "multipla", enunciado, alternativas };
  }

  if (obj.tipo === "aberta") {
    if (typeof obj.gabarito !== "string" || obj.gabarito.trim().length === 0) {
      return null;
    }
    return { tipo: "aberta", enunciado, gabarito: obj.gabarito.trim() };
  }

  return null;
}

/** `true` se a pergunta é compatível com o `modo` pedido. */
function perguntaNoModo(pergunta: PerguntaQuiz, modo: ModoQuiz): boolean {
  if (modo === "misto") return true;
  return pergunta.tipo === modo;
}

/**
 * Interpreta uma resposta "crua" do modelo como uma lista de perguntas do quiz
 * no `modo` indicado. Função pura, sem efeitos — fácil de testar em isolamento.
 *
 * Aceita duas formas: um objeto `{ "perguntas": [...] }` ou um array direto
 * `[...]`. Extrai o bloco JSON, faz o parse e sanitiza/valida cada item; itens
 * inválidos são descartados e as strings são aparadas (trim). Em seguida filtra
 * por modo (multipla/aberta/misto).
 *
 * @returns a lista de perguntas válidas, ou `null` se nada pôde ser extraído.
 */
export function parseQuiz(
  resposta: string,
  modo: ModoQuiz,
): PerguntaQuiz[] | null {
  const bloco = extrairBlocoJson(resposta);
  if (bloco === null) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(bloco);
  } catch {
    return null;
  }

  // Normaliza para o array de candidatos, aceitando as duas formas.
  let candidatos: unknown;
  if (Array.isArray(dados)) {
    candidatos = dados;
  } else if (typeof dados === "object" && dados !== null) {
    candidatos = (dados as Record<string, unknown>).perguntas;
  }
  if (!Array.isArray(candidatos)) return null;

  const perguntas: PerguntaQuiz[] = [];
  for (const bruta of candidatos) {
    const pergunta = sanitizarPergunta(bruta);
    if (pergunta !== null && perguntaNoModo(pergunta, modo)) {
      perguntas.push(pergunta);
    }
  }

  return perguntas.length > 0 ? perguntas : null;
}

/** Parâmetros para gerar um quiz. */
export interface GerarQuizParams {
  /** Texto a usar como base (já extraído do arquivo importado). */
  texto: string;
  /** Modo do quiz: múltipla escolha, abertas ou misto. */
  modo: ModoQuiz;
  /** Quantidade desejada de perguntas (normalizada aos limites 5–100). */
  quantidade: number;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTexto;
  /**
   * Tamanho máximo de cada pedaço, em caracteres. Default:
   * `tamanhoMaximoChunkCaracteres`. Rege o gate de chunking do quiz E é
   * repassado a `gerarResumo`, para que o mesmo limite valha nas duas etapas.
   */
  tamanhoChunk?: number;
}

/**
 * Gera um quiz a partir do `texto`, no `modo` escolhido, pedindo `quantidade`
 * perguntas ao modelo.
 *
 * Fluxo tolerante a falhas (nunca quebra a UI), igual em espírito aos
 * exercícios, com o passo de condensação do resumo quando o texto é grande:
 *  1. texto vazio → `SemTextoParaQuizError`;
 *  2. texto grande (mais de um chunk) → condensa via `gerarResumo(modo: "longo")`
 *     com o mesmo `tamanhoChunk`, e usa o resumo inteiro como base;
 *  3. 1ª tentativa: pede o quiz em JSON e tenta interpretar; se malformado,
 *     dispara UMA re-tentativa corretiva (NÃO as duas do `mapa.ts`);
 *  4. se ainda falhar → `QuizInvalidoError`.
 *
 * A `quantidade` é normalizada aos limites do MVP (5–100). Sem piso rígido:
 * devolve menos de N se o modelo deu menos (como os irmãos).
 *
 * @throws {SemTextoParaQuizError} se o texto estiver vazio.
 * @throws {QuizInvalidoError} se o parsing falhar mesmo após a re-tentativa.
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarQuiz({
  texto,
  modo,
  quantidade,
  gerar = generatePadrao,
  tamanhoChunk = tamanhoMaximoChunkCaracteres,
}: GerarQuizParams): Promise<Quiz> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaQuizError();
  }
  const n = normalizarQuantidade(quantidade);

  // Texto grande: condensa primeiro num resumo coerente e usa-o como base.
  // O mesmo `tamanhoChunk` rege o gate do quiz e o chunking do resumo.
  const base =
    dividirEmChunks(texto, tamanhoChunk).length > 1
      ? await gerarResumo({ texto, modo: "longo", gerar, tamanhoChunk })
      : texto;

  // 1ª tentativa: prompt normal (JSON nativo do Ollama via format: "json").
  const primeira = await gerar(montarPromptQuiz(modo, n, base), "json");
  const perguntas = parseQuiz(primeira, modo);
  if (perguntas !== null) {
    return {
      documentoId: "",
      modo,
      perguntas: perguntas.slice(0, n),
      geradoEm: new Date().toISOString(),
    };
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirQuiz(modo, n, primeira), "json");
  const corrigidas = parseQuiz(segunda, modo);
  if (corrigidas !== null) {
    return {
      documentoId: "",
      modo,
      perguntas: corrigidas.slice(0, n),
      geradoEm: new Date().toISOString(),
    };
  }

  throw new QuizInvalidoError();
}
