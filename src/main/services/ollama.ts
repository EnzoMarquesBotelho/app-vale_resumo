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
import { defaultModel, ollamaBaseUrl } from "@shared/constants";

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
 * @throws {OllamaIndisponivelError} se o Ollama estiver ausente/offline.
 * @throws {Error} se o Ollama responder com status de erro.
 */
export async function generate({
  prompt,
  model = defaultModel,
  format,
}: GenerateParams): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `format` só entra no corpo quando definido: sem ele, o corpo é idêntico
      // ao anterior (texto livre), preservando compat retroativa.
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        ...(format !== undefined ? { format } : {}),
      }),
    });
  } catch {
    // Falha de rede = Ollama não está rodando.
    throw new OllamaIndisponivelError();
  }
  if (!res.ok) {
    throw new Error(`O Ollama respondeu com erro (status ${res.status}).`);
  }
  const data = (await res.json()) as GenerateResponse;
  return data.response;
}
