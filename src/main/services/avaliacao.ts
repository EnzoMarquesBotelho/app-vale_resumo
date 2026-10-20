/**
 * Serviço de correção por IA de respostas (exercícios e perguntas abertas do
 * quiz).
 *
 * Roda no processo main. Espelha o padrão tolerante de `parse.ts`/`quiz.ts`: o
 * modelo devolve um objeto com o veredito e um comentário em JSON
 * (possivelmente "sujo"), `extrairBlocoJson` extrai o bloco, `parseAvaliacao`
 * normaliza/valida o veredito (só os três níveis do contrato) e poda o
 * comentário, e há UMA re-tentativa corretiva antes de desistir. Um veredito
 * inválido NÃO é exceção: vira o resultado seguro `"nao_avaliado"` por item.
 * Apenas erros de infra (`OllamaIndisponivelError`/`GeracaoFalhouError`) são
 * propagados.
 *
 * A chamada ao modelo é injetável (`gerar`) para os testes mockarem o Ollama.
 */
import { AVALIACAO_COMENTARIO_MAX } from "@shared/constants";
import {
  montarPromptAvaliacao,
  montarPromptCorrigirAvaliacao,
} from "@shared/prompts";
import type {
  AvaliacaoResposta,
  EntradaAvaliacao,
  Veredito,
} from "@shared/types";
import { generate as generatePadrao } from "./ollama.js";
import { extrairBlocoJson } from "./parse.js";
import type { GerarTexto } from "./parse.js";

/**
 * Comentário padrão por nível, usado quando o modelo devolve um veredito válido
 * mas sem comentário aproveitável (ausente/vazio/não-string). Mantém a UI com
 * um texto em português mesmo quando a IA só mandou o veredito.
 */
const COMENTARIO_PADRAO: Record<Veredito, string> = {
  correto: "Resposta correta.",
  parcial: "Resposta parcialmente correta.",
  incorreto: "Resposta incorreta.",
};

/** Comentário do estado seguro quando a resposta do aluno está vazia. */
const COMENTARIO_RESPOSTA_VAZIA =
  "Você não respondeu a esta questão.";

/**
 * Comentário do estado seguro quando a IA não conseguiu avaliar a resposta
 * (JSON inválido mesmo após a re-tentativa corretiva).
 */
const COMENTARIO_NAO_AVALIADO =
  "Não foi possível avaliar esta resposta automaticamente.";

/** Conjunto dos vereditos válidos do contrato (os três níveis). */
const VEREDITOS_VALIDOS = new Set<Veredito>([
  "correto",
  "parcial",
  "incorreto",
]);

/**
 * Trunca um comentário em `AVALIACAO_COMENTARIO_MAX` caracteres com reticência
 * na fronteira de palavra: corta no limite, recua até o último espaço quando
 * houver um dentro do limite, apara e anexa `…`. Para uma única palavra longa
 * (sem espaço), corta em `AVALIACAO_COMENTARIO_MAX - 1` e anexa `…`. O
 * comprimento final (incluindo o `…`) nunca passa de `AVALIACAO_COMENTARIO_MAX`
 * (mesma regra de `truncarRotulo` no mapa).
 */
function truncarComentario(comentario: string): string {
  if (comentario.length <= AVALIACAO_COMENTARIO_MAX) return comentario;
  // Deixa espaço para o caractere de reticência.
  const corte = comentario.slice(0, AVALIACAO_COMENTARIO_MAX - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte;
  return `${base.trimEnd()}…`;
}

/**
 * Interpreta uma resposta "crua" do modelo como uma avaliação. Função pura,
 * sem efeitos — fácil de testar em isolamento.
 *
 * Fluxo: extrai o bloco JSON (→ `null` se ausente), faz o parse (→ `null` se
 * malformado), exige que o topo seja um objeto não-nulo (array/string/number/
 * null → `null`), aceita o `veredito` só se, após `trim().toLowerCase()`,
 * pertencer a {correto,parcial,incorreto} (qualquer outro valor, inclusive
 * `"nao_avaliado"` vindo do modelo, número ou ausente → `null`), e normaliza o
 * `comentario`: string → `trim()`; ausente/vazio/não-string → o padrão do nível;
 * por fim trunca em `AVALIACAO_COMENTARIO_MAX` na fronteira de palavra.
 *
 * @returns a avaliação saneada, ou `null` se nada pôde ser extraído.
 */
export function parseAvaliacao(resposta: string): AvaliacaoResposta | null {
  const bloco = extrairBlocoJson(resposta);
  if (bloco === null) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(bloco);
  } catch {
    return null;
  }

  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) {
    return null;
  }
  const obj = dados as Record<string, unknown>;

  if (typeof obj.veredito !== "string") return null;
  const normalizado = obj.veredito.trim().toLowerCase();
  if (!VEREDITOS_VALIDOS.has(normalizado as Veredito)) return null;
  const veredito = normalizado as Veredito;

  const comentarioBruto =
    typeof obj.comentario === "string" ? obj.comentario.trim() : "";
  const comentario =
    comentarioBruto.length > 0
      ? truncarComentario(comentarioBruto)
      : COMENTARIO_PADRAO[veredito];

  return { veredito, comentario };
}

/**
 * Avalia UMA resposta de aluno.
 *
 * Fluxo tolerante a falhas (nunca quebra a UI):
 *  1. resposta vazia (trim vazio) → `{ veredito: "nao_avaliado", comentario:
 *     COMENTARIO_RESPOSTA_VAZIA }` SEM chamar o modelo;
 *  2. 1ª tentativa: pede a avaliação em JSON e tenta interpretar;
 *  3. se malformada, dispara UMA re-tentativa corretiva;
 *  4. se ainda falhar → `{ veredito: "nao_avaliado", comentario:
 *     COMENTARIO_NAO_AVALIADO }` (NÃO lança por veredito inválido).
 *
 * Erros de infra do Ollama são propagados.
 *
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 * @throws {GeracaoFalhouError} (propagado) se a geração falhar/estourar tempo.
 */
export async function avaliarUma(
  entrada: EntradaAvaliacao,
  gerar: GerarTexto = generatePadrao,
): Promise<AvaliacaoResposta> {
  if (entrada.resposta.trim().length === 0) {
    return { veredito: "nao_avaliado", comentario: COMENTARIO_RESPOSTA_VAZIA };
  }

  // 1ª tentativa: prompt normal (JSON nativo do Ollama via format: "json").
  const primeira = await gerar(
    montarPromptAvaliacao(entrada.enunciado, entrada.gabarito, entrada.resposta),
    "json",
  );
  const avaliacao = parseAvaliacao(primeira);
  if (avaliacao !== null) {
    return avaliacao;
  }

  // 2ª tentativa (corretiva): reapresenta o formato e a resposta anterior.
  const segunda = await gerar(montarPromptCorrigirAvaliacao(primeira), "json");
  const corrigida = parseAvaliacao(segunda);
  if (corrigida !== null) {
    return corrigida;
  }

  return { veredito: "nao_avaliado", comentario: COMENTARIO_NAO_AVALIADO };
}

/** Resultado de avaliar um lote de respostas (alinhado por índice à entrada). */
export interface ResultadoAvaliacaoLote {
  /** Avaliações na MESMA ordem das entradas recebidas. */
  avaliacoes: AvaliacaoResposta[];
}

/**
 * Avalia um lote de respostas, uma a uma, de forma SEQUENCIAL e preservando a
 * ordem (cada avaliação alinhada por índice à sua entrada). Respostas vazias
 * viram `"nao_avaliado"` sem chamar o modelo (ver `avaliarUma`); lote vazio
 * devolve `{ avaliacoes: [] }` sem chamar o modelo. Um erro de infra do 1º item
 * que falhar é propagado imediatamente (aborta o lote); vereditos inválidos
 * nunca lançam.
 *
 * @throws {OllamaIndisponivelError} (propagado) se o Ollama estiver offline.
 * @throws {GeracaoFalhouError} (propagado) se a geração falhar/estourar tempo.
 */
export async function avaliarLote(
  entradas: EntradaAvaliacao[],
  gerar: GerarTexto = generatePadrao,
): Promise<ResultadoAvaliacaoLote> {
  const avaliacoes: AvaliacaoResposta[] = [];
  for (const entrada of entradas) {
    avaliacoes.push(await avaliarUma(entrada, gerar));
  }
  return { avaliacoes };
}
