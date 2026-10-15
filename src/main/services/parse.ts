/**
 * Serviço de parsing de respostas estruturadas da IA.
 *
 * Roda no processo main. Modelos locais costumam embrulhar o JSON pedido em
 * texto extra (ex.: "Aqui estão seus flashcards:" + bloco ```json ... ```),
 * ou devolver JSON levemente malformado. Para que a UI nunca quebre, este
 * módulo:
 *  1. extrai o bloco JSON de uma resposta "suja" (tolerante);
 *  2. valida o resultado contra o schema esperado (flashcards);
 *  3. quando o parsing falha, dispara UMA re-tentativa com prompt corretivo.
 *
 * A chamada ao modelo é injetável para facilitar os testes (Ollama mockado).
 */
import {
  montarPromptCorrigirExercicios,
  montarPromptCorrigirFlashcards,
  montarPromptExercicios,
  montarPromptFlashcards,
  normalizarQuantidade,
} from "@shared/prompts";
import type { Exercicio, Flashcard, ModoConteudo } from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";

/** Função que gera texto a partir de um prompt (Ollama por padrão). */
export type GerarTexto = (prompt: string) => Promise<string>;

/** Erro lançado quando não há texto para gerar flashcards. */
export class SemTextoParaFlashcardsError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "SEM_TEXTO_PARA_FLASHCARDS" as const;
  constructor() {
    super(
      "Não há texto para gerar flashcards. Importe um arquivo com conteúdo.",
    );
    this.name = "SemTextoParaFlashcardsError";
  }
}

/**
 * Erro lançado quando, mesmo após a re-tentativa corretiva, a resposta do
 * modelo não pôde ser interpretada como flashcards válidos.
 */
export class FlashcardsInvalidosError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "FLASHCARDS_INVALIDOS" as const;
  constructor() {
    super(
      "A IA não devolveu flashcards em um formato válido. Tente gerar novamente.",
    );
    this.name = "FlashcardsInvalidosError";
  }
}

/**
 * Extrai o primeiro bloco JSON (objeto `{...}` ou array `[...]`) de um texto
 * possivelmente "sujo" com comentários ao redor, cercas de código ```json```,
 * etc. Faz um balanceamento de chaves/colchetes ignorando o que está dentro de
 * strings para achar onde o bloco começa e termina.
 *
 * @returns a substring do bloco JSON, ou `null` se nenhum bloco for encontrado.
 */
export function extrairBlocoJson(texto: string): string | null {
  if (typeof texto !== "string") return null;

  // Procura o primeiro caractere de abertura de objeto ou array.
  let inicio = -1;
  let aberturaChar = "";
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "{" || c === "[") {
      inicio = i;
      aberturaChar = c;
      break;
    }
  }
  if (inicio === -1) return null;

  const fechamentoChar = aberturaChar === "{" ? "}" : "]";
  let profundidade = 0;
  let dentroDeString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeString) {
      if (escapado) {
        escapado = false;
      } else if (c === "\\") {
        escapado = true;
      } else if (c === '"') {
        dentroDeString = false;
      }
      continue;
    }

    if (c === '"') {
      dentroDeString = true;
    } else if (c === aberturaChar) {
      profundidade += 1;
    } else if (c === fechamentoChar) {
      profundidade -= 1;
      if (profundidade === 0) {
        return texto.slice(inicio, i + 1);
      }
    }
  }

  // Bloco não fechado (JSON truncado): não dá para interpretar com segurança.
  return null;
}

/** `true` se o valor é um flashcard válido (pergunta e resposta não vazias). */
function ehFlashcard(valor: unknown): valor is Flashcard {
  if (typeof valor !== "object" || valor === null) return false;
  const obj = valor as Record<string, unknown>;
  return (
    typeof obj.pergunta === "string" &&
    obj.pergunta.trim().length > 0 &&
    typeof obj.resposta === "string" &&
    obj.resposta.trim().length > 0
  );
}

/**
 * Interpreta uma resposta "crua" do modelo como uma lista de flashcards.
 *
 * Aceita duas formas: um objeto `{ "flashcards": [...] }` ou um array direto
 * `[...]`. Extrai o bloco JSON, faz o parse e valida cada item; itens inválidos
 * são descartados e as strings são aparadas (trim).
 *
 * @returns a lista de flashcards válidos, ou `null` se nada pôde ser extraído
 *   (JSON ausente/inválido ou sem nenhum flashcard aproveitável).
 */
export function parseFlashcards(resposta: string): Flashcard[] | null {
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
    candidatos = (dados as Record<string, unknown>).flashcards;
  }
  if (!Array.isArray(candidatos)) return null;

  const flashcards = candidatos.filter(ehFlashcard).map((f) => ({
    pergunta: f.pergunta.trim(),
    resposta: f.resposta.trim(),
  }));

  return flashcards.length > 0 ? flashcards : null;
}

/** Parâmetros para gerar flashcards. */
export interface GerarFlashcardsParams {
  /** Texto a usar como base (já extraído do arquivo importado). */
  texto: string;
  /** Quantidade desejada de flashcards (normalizada aos limites 5–100). */
  quantidade: number;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTexto;
}

/**
 * Gera flashcards a partir do `texto`, pedindo `quantidade` cards ao modelo.
 *
 * Fluxo tolerante a falhas (nunca quebra a UI):
 *  1. pede os flashcards em JSON e tenta interpretar a resposta;
 *  2. se o JSON vier malformado, dispara UMA re-tentativa com prompt corretivo;
 *  3. se ainda assim falhar, lança `FlashcardsInvalidosError` (mensagem clara).
 *
 * A `quantidade` é normalizada aos limites do MVP (5–100).
 *
 * @throws {SemTextoParaFlashcardsError} se o texto estiver vazio.
 * @throws {FlashcardsInvalidosError} se o parsing falhar mesmo após a re-tentativa.
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarFlashcards({
  texto,
  quantidade,
  gerar = generatePadrao,
}: GerarFlashcardsParams): Promise<Flashcard[]> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaFlashcardsError();
  }
  const n = normalizarQuantidade(quantidade);

  // 1ª tentativa: prompt normal.
  const primeira = await gerar(montarPromptFlashcards(n, texto));
  const flashcards = parseFlashcards(primeira);
  if (flashcards !== null) {
    return flashcards.slice(0, n);
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirFlashcards(n, primeira));
  const corrigidos = parseFlashcards(segunda);
  if (corrigidos !== null) {
    return corrigidos.slice(0, n);
  }

  throw new FlashcardsInvalidosError();
}

/** Erro lançado quando não há texto para gerar exercícios. */
export class SemTextoParaExerciciosError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "SEM_TEXTO_PARA_EXERCICIOS" as const;
  constructor() {
    super(
      "Não há texto para gerar exercícios. Importe um arquivo com conteúdo.",
    );
    this.name = "SemTextoParaExerciciosError";
  }
}

/**
 * Erro lançado quando, mesmo após a re-tentativa corretiva, a resposta do
 * modelo não pôde ser interpretada como exercícios válidos.
 */
export class ExerciciosInvalidosError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "EXERCICIOS_INVALIDOS" as const;
  constructor() {
    super(
      "A IA não devolveu exercícios em um formato válido. Tente gerar novamente.",
    );
    this.name = "ExerciciosInvalidosError";
  }
}

/**
 * `true` se o valor tem enunciado e resposta não vazios. O `modo` do exercício
 * é definido pela geração (não vem do modelo), então não é validado aqui.
 */
function ehExercicioBruto(
  valor: unknown,
): valor is { enunciado: string; resposta: string } {
  if (typeof valor !== "object" || valor === null) return false;
  const obj = valor as Record<string, unknown>;
  return (
    typeof obj.enunciado === "string" &&
    obj.enunciado.trim().length > 0 &&
    typeof obj.resposta === "string" &&
    obj.resposta.trim().length > 0
  );
}

/**
 * Interpreta uma resposta "crua" do modelo como uma lista de exercícios no
 * `modo` indicado. Reusa `extrairBlocoJson` (o mesmo parser dos flashcards).
 *
 * Aceita duas formas: um objeto `{ "exercicios": [...] }` ou um array direto
 * `[...]`. Extrai o bloco JSON, faz o parse e valida cada item; itens inválidos
 * são descartados e as strings são aparadas (trim). O `modo` é anexado a cada
 * exercício a partir do argumento (não é lido da resposta do modelo).
 *
 * @returns a lista de exercícios válidos, ou `null` se nada pôde ser extraído.
 */
export function parseExercicios(
  resposta: string,
  modo: ModoConteudo,
): Exercicio[] | null {
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
    candidatos = (dados as Record<string, unknown>).exercicios;
  }
  if (!Array.isArray(candidatos)) return null;

  const exercicios = candidatos.filter(ehExercicioBruto).map((e) => ({
    enunciado: e.enunciado.trim(),
    resposta: e.resposta.trim(),
    modo,
  }));

  return exercicios.length > 0 ? exercicios : null;
}

/** Parâmetros para gerar uma lista de exercícios. */
export interface GerarExerciciosParams {
  /** Texto a usar como base (já extraído do arquivo importado). */
  texto: string;
  /** Natureza da lista: teórica, prática ou mista. */
  modo: ModoConteudo;
  /** Quantidade desejada de exercícios (normalizada aos limites 5–100). */
  quantidade: number;
  /**
   * Gerador de texto a usar. Default: o cliente Ollama (`generate`).
   * Injetável nos testes para mockar a resposta do modelo.
   */
  gerar?: GerarTexto;
}

/**
 * Gera uma lista de exercícios a partir do `texto`, no `modo` escolhido,
 * pedindo `quantidade` exercícios ao modelo.
 *
 * Fluxo tolerante a falhas (nunca quebra a UI), igual ao dos flashcards:
 *  1. pede os exercícios em JSON e tenta interpretar a resposta;
 *  2. se o JSON vier malformado, dispara UMA re-tentativa com prompt corretivo;
 *  3. se ainda assim falhar, lança `ExerciciosInvalidosError` (mensagem clara).
 *
 * A `quantidade` é normalizada aos limites do MVP (5–100).
 *
 * @throws {SemTextoParaExerciciosError} se o texto estiver vazio.
 * @throws {ExerciciosInvalidosError} se o parsing falhar mesmo após a re-tentativa.
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 */
export async function gerarExercicios({
  texto,
  modo,
  quantidade,
  gerar = generatePadrao,
}: GerarExerciciosParams): Promise<Exercicio[]> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaExerciciosError();
  }
  const n = normalizarQuantidade(quantidade);

  // 1ª tentativa: prompt normal.
  const primeira = await gerar(montarPromptExercicios(modo, n, texto));
  const exercicios = parseExercicios(primeira, modo);
  if (exercicios !== null) {
    return exercicios.slice(0, n);
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirExercicios(n, primeira));
  const corrigidos = parseExercicios(segunda, modo);
  if (corrigidos !== null) {
    return corrigidos.slice(0, n);
  }

  throw new ExerciciosInvalidosError();
}
