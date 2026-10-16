/**
 * Cliente da API HTTP local do Ollama.
 *
 * Roda no processo main. Expõe duas operações:
 *  - `isOllamaRunning`: checa se o Ollama está acessível localmente.
 *  - `generate`: pede uma geração ao modelo (sem streaming).
 *
 * Toda comunicação é com `http://localhost:11434` (ver `ollamaBaseUrl`), ou
 * seja, 100% local/offline — nenhuma chamada à internet. Quando o Ollama não
 * está rodando, as funções falham de forma controlada (nunca derrubam o app):
 * `isOllamaRunning` retorna `false` e `generate` lança um erro com mensagem
 * amigável.
 */
import {
  OLLAMA_GENERATE_TIMEOUT_MS,
  defaultModel,
  ollamaBaseUrl,
} from "@shared/constants";

/** Parâmetros para uma geração do Ollama. */
export interface GenerateParams {
  /** Prompt enviado ao modelo. */
  prompt: string;
  /** Modelo a usar. Default: `defaultModel` (`llama3.1:8b`). */
  model?: string;
  /**
   * Formato de saída nativo do Ollama. Quando presente (`"json"` ou um
   * JSON-schema), instrui o modelo a devolver JSON — usado nas gerações
   * estruturadas (mapa mental, flashcards, exercícios). Quando ausente, a
   * geração permanece em texto livre (ex.: resumo), mantendo compat retroativa.
   */
  format?: "json" | Record<string, unknown>;
}

/**
 * Erro lançado quando a geração falha porque o Ollama está ausente/offline.
 * A `message` é uma frase pronta para o usuário iniciante.
 */
export class OllamaIndisponivelError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "OLLAMA_INDISPONIVEL" as const;
  constructor() {
    super(
      "O Ollama não está rodando. Inicie o Ollama e tente novamente. " +
        "Veja as instruções na tela de status.",
    );
    this.name = "OllamaIndisponivelError";
  }
}

/**
 * Erro lançado quando o Ollama ESTAVA acessível mas a geração em si falhou:
 * conexão caiu no meio, estourou o timeout (abort) ou outra falha de fetch que
 * não é uma recusa de conexão. É DIFERENTE de `OllamaIndisponivelError`: aqui
 * NÃO afirmamos que o Ollama está desligado — a mensagem é honesta e orienta o
 * usuário a tentar de novo com menos itens ou um modelo mais leve.
 */
export class GeracaoFalhouError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "GERACAO_FALHOU" as const;
  constructor() {
    super(
      "A geração falhou ou demorou demais. Tente novamente, reduza a " +
        "quantidade, ou use um modelo mais leve.",
    );
    this.name = "GeracaoFalhouError";
  }
}

/**
 * Classifica um erro lançado pelo `fetch` como "recusa de conexão" (Ollama
 * realmente offline) versus qualquer outra falha. O `fetch` do Node/undici
 * lança um `TypeError` cujo `cause.code` é `ECONNREFUSED`/`ENOTFOUND`/
 * `EAI_AGAIN` quando NÃO há nada escutando na porta. Lemos de forma defensiva
 * tanto o `code` direto quanto o de `cause`; qualquer formato não reconhecido
 * (inclusive quedas no meio da geração como `ECONNRESET` e o abort do timeout)
 * NÃO é tratado como recusa — cai no caminho honesto de "a geração falhou".
 */
function ehRecusaDeConexao(erro: unknown): boolean {
  const codigosRecusa = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);
  const e = erro as { code?: unknown; cause?: { code?: unknown } };
  const codeDireto = typeof e?.code === "string" ? e.code : undefined;
  const codeCausa =
    typeof e?.cause?.code === "string" ? e.cause.code : undefined;
  return (
    (codeDireto !== undefined && codigosRecusa.has(codeDireto)) ||
    (codeCausa !== undefined && codigosRecusa.has(codeCausa))
  );
}

/**
 * Retorna `true` se o Ollama está acessível localmente.
 * Consulta `GET /api/tags`; qualquer falha de rede é tratada como "offline".
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Formato (parcial) da resposta de `GET /api/tags`. */
interface TagsResponse {
  models?: { name: string }[];
}

/**
 * Lista os modelos disponíveis localmente no Ollama (nomes como
 * `llama3.1:8b`). Retorna lista vazia se o Ollama estiver offline ou não
 * houver modelos baixados.
 */
export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${ollamaBaseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as TagsResponse;
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/** Formato (parcial) da resposta de `POST /api/generate` com `stream:false`. */
interface GenerateResponse {
  response: string;
}

/**
 * Pede uma geração ao modelo via `POST /api/generate` (sem streaming).
 *
 * Impõe um timeout total via `AbortController` (ver `OLLAMA_GENERATE_TIMEOUT_MS`)
 * porque o `fetch` nativo não tem teto de resposta. A classificação do erro
 * separa "Ollama offline" de "a geração falhou":
 *  - recusa de conexão (nada escutando) → `OllamaIndisponivelError`;
 *  - abort/timeout, queda no meio ou qualquer outra falha de fetch →
 *    `GeracaoFalhouError` (NÃO afirmamos que o Ollama está desligado).
 *
 * @throws {OllamaIndisponivelError} se o Ollama estiver ausente/offline (recusa).
 * @throws {GeracaoFalhouError} se, já conectado, a geração falhar/estourar tempo.
 * @throws {Error} se o Ollama responder com status de erro (HTTP não-ok).
 */
export async function generate({
  prompt,
  model = defaultModel,
  format,
}: GenerateParams): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    OLLAMA_GENERATE_TIMEOUT_MS,
  );
  let res: Response;
  try {
    res = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      // `format` só entra no corpo quando definido: sem ele, o corpo é idêntico
      // ao anterior (texto livre), preservando compat retroativa.
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        ...(format !== undefined ? { format } : {}),
      }),
    });
  } catch (erro) {
    // Só uma recusa de conexão significa "Ollama não está rodando". Abort por
    // timeout, queda no meio ou falha desconhecida = a geração falhou.
    if (ehRecusaDeConexao(erro)) {
      throw new OllamaIndisponivelError();
    }
    throw new GeracaoFalhouError();
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`O Ollama respondeu com erro (status ${res.status}).`);
  }
  const data = (await res.json()) as GenerateResponse;
  return data.response;
}
