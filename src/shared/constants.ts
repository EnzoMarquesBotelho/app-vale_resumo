/** Constantes compartilhadas entre o processo main e o renderer. */

export const appName = "App de Estudos com IA Local";

/** URL base da API HTTP local do Ollama. */
export const ollamaBaseUrl = "http://localhost:11434";

/** Modelo padrão usado para as gerações (configurável nas opções). */
export const defaultModel = "llama3.1:8b";

/** Extensões de arquivo suportadas para importação no MVP (sem o ponto). */
export const extensoesSuportadas = ["txt", "md", "pdf"] as const;

/**
 * Tamanho máximo (em bytes) de um arquivo importado no MVP.
 * Evita carregar arquivos gigantes inteiros na memória; acima disso a UI
 * mostra um aviso claro em vez de travar. 50 MB cobre PDFs de faculdade.
 */
export const tamanhoMaximoArquivoBytes = 50 * 1024 * 1024;

/** Aviso exibido quando um PDF não tem texto extraível (ex.: escaneado). */
export const avisoSemTextoExtraivel = "sem texto extraível";

/**
 * Tamanho máximo (em caracteres) de cada pedaço (chunk) enviado ao modelo ao
 * resumir textos grandes. Mantém cada chamada dentro de uma janela de contexto
 * confortável para modelos locais (~8k tokens). Textos acima disso são
 * divididos em pedaços e resumidos em etapas (map→reduce).
 */
export const tamanhoMaximoChunkCaracteres = 12000;

/** Profundidade máxima da árvore do mapa mental (raiz = nível 1). */
export const MAPA_PROFUNDIDADE_MAXIMA = 4;
/** Número máximo de nós no mapa inteiro (defesa contra respostas gigantes). */
export const MAPA_MAX_NOS = 200;
/**
 * Comprimento máximo do rótulo de um nó (caracteres); truncado com reticência
 * na fronteira de palavra ao validar (ver `mapa.ts`).
 */
export const MAPA_ROTULO_MAX = 120;
/** Máximo de filhos diretos por nó (poda defensiva de leques enormes). */
export const MAPA_MAX_FILHOS_POR_NO = 12;
