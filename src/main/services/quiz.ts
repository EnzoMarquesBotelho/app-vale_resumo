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
  GERACAO_EVITAR_MAX,
  GERACAO_EVITAR_MAXLEN,
  GERACAO_LOTE_LIMIAR,
  GERACAO_LOTE_SEM_PROGRESSO_MAX,
  GERACAO_LOTE_TAMANHO,
  GERACAO_LOTE_TETO_MARGEM_ABS,
  QUIZ_ALTERNATIVAS_MAXIMO,
  QUIZ_ALTERNATIVAS_MINIMO,
  tamanhoMaximoChunkCaracteres,
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
   * `tamanhoMaximoChunkCaracteres`. Rege a CONDENSAÇÃO de texto grande do quiz
   * (caracteres) E é repassado a `gerarResumo`. É INDEPENDENTE do gate de lotes
   * por quantidade (`GERACAO_LOTE_LIMIAR`) — não confundir os dois.
   */
  tamanhoChunk?: number;
  /**
   * Callback OPCIONAL de progresso (default no-op). Chamado com `(prontos,
   * total)` a cada passo — o serviço é agnóstico ao artefato; quem anexa
   * `artefato`/`geracaoId` é o handler IPC.
   */
  aoProgresso?: AoProgresso;
}

/**
 * Pede UM lote de perguntas ao modelo e interpreta a resposta, com a mesma
 * re-tentativa corretiva única do caminho curto. Devolve `null` se o lote não
 * produziu nenhuma pergunta válida (mesmo após a corretiva). Erros de infra do
 * `gerar` (Ollama offline/geração falhou) propagam para o laço.
 */
async function gerarLotePerguntas(
  gerar: GerarTexto,
  modo: ModoQuiz,
  tamanho: number,
  base: string,
  evitar: string[],
): Promise<PerguntaQuiz[] | null> {
  const primeira = await gerar(
    montarPromptQuiz(modo, tamanho, base, evitar),
    "json",
  );
  const perguntas = parseQuiz(primeira, modo);
  if (perguntas !== null) return perguntas;

  const segunda = await gerar(
    montarPromptCorrigirQuiz(modo, tamanho, primeira),
    "json",
  );
  return parseQuiz(segunda, modo);
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
  aoProgresso = () => {},
}: GerarQuizParams): Promise<Quiz> {
  if (texto.trim().length === 0) {
    throw new SemTextoParaQuizError();
  }
  const n = normalizarQuantidade(quantidade);

  // Texto grande: condensa primeiro num resumo coerente e usa-o como base.
  // Feito UMA vez, antes do laço — o `base` condensado é reusado em todos os
  // lotes. Independente do gate de lotes por quantidade.
  const base =
    dividirEmChunks(texto, tamanhoChunk).length > 1
      ? await gerarResumo({ texto, modo: "longo", gerar, tamanhoChunk })
      : texto;

  /** Monta o `Quiz` final a partir das perguntas acumuladas (fatiadas em n). */
  const montar = (perguntas: PerguntaQuiz[]): Quiz => ({
    documentoId: "",
    modo,
    perguntas: perguntas.slice(0, n),
    geradoEm: new Date().toISOString(),
  });

  // Caminho curto (n ≤ limiar): uma chamada + corretiva, como hoje. Emite o
  // progresso UMA vez, imediatamente antes do retorno (ponto único).
  if (!deveParticionar(n, GERACAO_LOTE_LIMIAR)) {
    const unico = await gerarLotePerguntas(gerar, modo, n, base, []);
    if (unico === null) throw new QuizInvalidoError();
    const resultado = unico.slice(0, n);
    aoProgresso(resultado.length, n);
    return montar(resultado);
  }

  // Chunking (n > limiar): laço SEQUENCIAL acumulando com dedup. Pede lotes
  // extras — enquanto o modelo ainda produz novos e até um teto absoluto de
  // segurança — para repor o que a dedup descartou. Para por estagnação (K
  // lotes consecutivos sem item novo) antes de queimar tempo num modelo travado.
  const lotes = particionarQuantidade(n, GERACAO_LOTE_TAMANHO);
  const tetoAbsoluto = lotes.length + GERACAO_LOTE_TETO_MARGEM_ABS;
  let itens: PerguntaQuiz[] = [];
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
      itens.map((p) => p.enunciado),
      GERACAO_EVITAR_MAX,
      GERACAO_EVITAR_MAXLEN,
    );
    tentativas += 1;

    let lote: PerguntaQuiz[] | null;
    try {
      lote = await gerarLotePerguntas(gerar, modo, tamanhoLote, base, evitar);
    } catch (erro) {
      // Erro de infra: com algo acumulado, entrega o parcial (sem re-tentar);
      // sem nada acumulado, propaga o erro tipado (offline vs falha). Sai ANTES
      // de tocar `semProgresso` — falha de infra nunca conta como estagnação.
      if (itens.length > 0) break;
      throw erro;
    }

    // Caminho de SUCESSO do await — o único que mexe em `semProgresso`.
    if (lote !== null) {
      const acumulo = acumularComDedup(itens, chavesVistas, lote, n, (p) =>
        chaveDedup(p.enunciado),
      );
      itens = acumulo.itens;
      chavesVistas = acumulo.chavesVistas;
      semProgresso = acumulo.aceitos > 0 ? 0 : semProgresso + 1;
    } else {
      semProgresso += 1; // lote sem itens válidos também é "sem progresso"
    }
    aoProgresso(itens.length, n);
  }

  if (itens.length === 0) throw new QuizInvalidoError();
  return montar(itens);
}
