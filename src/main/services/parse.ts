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
  GERACAO_EVITAR_MAX,
  GERACAO_EVITAR_MAXLEN,
  GERACAO_LOTE_LIMIAR,
  GERACAO_LOTE_SEM_PROGRESSO_MAX,
  GERACAO_LOTE_TAMANHO,
  GERACAO_LOTE_TETO_MARGEM_ABS,
} from "@shared/constants";
import {
  acumularComDedup,
  chaveDedup,
  deveContinuarLotes,
  deveParticionar,
  enunciadosParaEvitar,
  particionarQuantidade,
} from "@shared/geracaoLotes";
import type { AoProgresso } from "@shared/geracaoLotes";
import {
  montarPromptCorrigirExercicios,
  montarPromptCorrigirFlashcards,
  montarPromptExercicios,
  montarPromptFlashcards,
  normalizarQuantidade,
} from "@shared/prompts";
import type { Exercicio, Flashcard, ModoConteudo } from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";

/**
 * Função que gera texto a partir de um prompt (Ollama por padrão).
 *
 * O 2º parâmetro `format` é opcional: as gerações estruturadas passam `"json"`
 * para forçar JSON nativo do Ollama. Mesma assinatura de `resumo.ts`.
 */
export type GerarTexto = (
  prompt: string,
  format?: "json" | Record<string, unknown>,
) => Promise<string>;

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
      "A IA não devolveu flashcards em um formato válido. Tente gerar novamente. " +
        "Para melhores resultados, use um modelo de texto (ex.: llama3.1, qwen2.5, gemma2) " +
        "e evite modelos de visão ou de embedding (moondream, minicpm-v, nomic-embed-text).",
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

  // 1ª tentativa: prompt normal (JSON nativo do Ollama via format: "json").
  const primeira = await gerar(montarPromptFlashcards(n, texto), "json");
  const flashcards = parseFlashcards(primeira);
  if (flashcards !== null) {
    return flashcards.slice(0, n);
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirFlashcards(n, primeira), "json");
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
      "A IA não devolveu exercícios em um formato válido. Tente gerar novamente. " +
        "Para melhores resultados, use um modelo de texto (ex.: llama3.1, qwen2.5, gemma2) " +
        "e evite modelos de visão ou de embedding (moondream, minicpm-v, nomic-embed-text).",
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
  /**
   * Callback OPCIONAL de progresso (default no-op). Chamado com `(prontos,
   * total)` a cada passo — o serviço é agnóstico ao artefato; quem anexa
   * `artefato`/`geracaoId` é o handler IPC.
   */
  aoProgresso?: AoProgresso;
}

/**
 * Pede UM lote de exercícios ao modelo e interpreta a resposta, com a mesma
 * re-tentativa corretiva única do caminho curto. Devolve `null` se o lote não
 * produziu nenhum exercício válido (mesmo após a corretiva). Erros de infra do
 * `gerar` (Ollama offline/geração falhou) propagam para o laço.
 */
async function gerarLoteExercicios(
  gerar: GerarTexto,
  modo: ModoConteudo,
  tamanho: number,
  texto: string,
  evitar: string[],
): Promise<Exercicio[] | null> {
  const primeira = await gerar(
    montarPromptExercicios(modo, tamanho, texto, evitar),
    "json",
  );
  const exercicios = parseExercicios(primeira, modo);
  if (exercicios !== null) return exercicios;

  const segunda = await gerar(
    montarPromptCorrigirExercicios(tamanho, primeira),
    "json",
  );
  return parseExercicios(segunda, modo);
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
  aoProgresso = () => {},
}: GerarExerciciosParams): Promise<Exercicio[]> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaExerciciosError();
  }
  const n = normalizarQuantidade(quantidade);

  // Caminho curto (n ≤ limiar): uma chamada + corretiva, como hoje. Emite o
  // progresso UMA vez, imediatamente antes do retorno (ponto único).
  if (!deveParticionar(n, GERACAO_LOTE_LIMIAR)) {
    const unico = await gerarLoteExercicios(gerar, modo, n, texto, []);
    if (unico === null) throw new ExerciciosInvalidosError();
    const resultado = unico.slice(0, n);
    aoProgresso(resultado.length, n);
    return resultado;
  }

  // Chunking (n > limiar): laço SEQUENCIAL acumulando com dedup. Pede lotes
  // extras — enquanto o modelo ainda produz novos e até um teto absoluto de
  // segurança — para repor o que a dedup descartou. Para por estagnação (K
  // lotes consecutivos sem item novo) antes de queimar tempo num modelo travado.
  const lotes = particionarQuantidade(n, GERACAO_LOTE_TAMANHO);
  const tetoAbsoluto = lotes.length + GERACAO_LOTE_TETO_MARGEM_ABS;
  let itens: Exercicio[] = [];
  let chavesVistas = new Set<string>();
  let tentativas = 0;
  let semProgresso = 0;

  while (
    deveContinuarLotes({
      prontos: itens.length,
      alvo: n,
      tentativas,
      semProgresso,
      semProgressoMax: GERACAO_LOTE_SEM_PROGRESSO_MAX,
      tetoAbsoluto,
    })
  ) {
    const tamanhoLote = Math.max(
      1,
      tentativas < lotes.length
        ? lotes[tentativas]
        : Math.min(GERACAO_LOTE_TAMANHO, n - itens.length),
    );
    // INVARIANTE: `evitar` é derivado de `itens` NO ESTADO ANTERIOR a este lote
    // — calculado ANTES de pedir/acumular, pois `itens` é reatribuído abaixo (no
    // caminho de sucesso). Reflete os enunciados aceitos até o lote anterior.
    const evitar = enunciadosParaEvitar(
      itens.map((e) => e.enunciado),
      GERACAO_EVITAR_MAX,
      GERACAO_EVITAR_MAXLEN,
    );
    tentativas += 1;

    let lote: Exercicio[] | null;
    try {
      lote = await gerarLoteExercicios(gerar, modo, tamanhoLote, texto, evitar);
    } catch (erro) {
      // Erro de infra: com algo acumulado, entrega o parcial (sem re-tentar);
      // sem nada acumulado, propaga o erro tipado (offline vs falha). Sai ANTES
      // de tocar `semProgresso` — falha de infra nunca conta como estagnação.
      if (itens.length > 0) break;
      throw erro;
    }

    // Caminho de SUCESSO do await — o único que mexe em `semProgresso`.
    if (lote !== null) {
      const acumulo = acumularComDedup(itens, chavesVistas, lote, n, (e) =>
        chaveDedup(e.enunciado),
      );
      itens = acumulo.itens;
      chavesVistas = acumulo.chavesVistas;
      semProgresso = acumulo.aceitos > 0 ? 0 : semProgresso + 1;
    } else {
      semProgresso += 1; // lote sem itens válidos também é "sem progresso"
    }
    aoProgresso(itens.length, n);
  }

  if (itens.length === 0) throw new ExerciciosInvalidosError();
  return itens.slice(0, n);
}
