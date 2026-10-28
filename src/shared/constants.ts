/** Constantes compartilhadas entre o processo main e o renderer. */

export const appName = "Desenrola";

/** URL base da API HTTP local do Ollama. */
export const ollamaBaseUrl = "http://localhost:11434";

/** Modelo padrão usado para as gerações (configurável nas opções). */
export const defaultModel = "llama3.1:8b";

/**
 * Tempo máximo total (em ms) de uma geração sem streaming no Ollama local.
 * O `fetch` nativo do processo main não impõe um timeout total, então uma
 * geração travada ficaria pendurada indefinidamente. Usamos um AbortController
 * com este teto generoso (gerações locais longas são normais). Atingir este
 * tempo é mapeado como "a geração falhou/demorou demais" — NÃO como "Ollama
 * offline", porque o Ollama estava acessível e apenas não concluiu a tempo.
 */
export const OLLAMA_GENERATE_TIMEOUT_MS = 300_000;

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

/**
 * Profundidade máxima de subpastas na varredura de uma pasta importada. A
 * pasta escolhida tem profundidade 0; descemos para uma subpasta só se a
 * profundidade dela for <= este teto. Logo, com o teto 10, a 1ª subpasta de
 * profundidade 11 é a primeira podada.
 */
export const PASTA_PROFUNDIDADE_MAXIMA = 10;
/** Máximo de arquivos suportados aceitos em um único lote de importação. */
export const PASTA_MAX_ARQUIVOS_LOTE = 500;

/** Mínimo de alternativas em uma pergunta de múltipla escolha (poda defensiva). */
export const QUIZ_ALTERNATIVAS_MINIMO = 2;
/** Máximo de alternativas em uma pergunta de múltipla escolha (poda defensiva). */
export const QUIZ_ALTERNATIVAS_MAXIMO = 6;

/**
 * Comprimento máximo (em caracteres) do comentário de uma avaliação por IA;
 * truncado com reticência na fronteira de palavra no serviço (`avaliacao.ts`),
 * espelhando a poda defensiva de `MAPA_ROTULO_MAX`. Defende a UI contra
 * comentários gigantes que o modelo às vezes devolve.
 */
export const AVALIACAO_COMENTARIO_MAX = 600;

/** Intervalos padrão de repetição espaçada: dias antes da prova. */
export const INTERVALOS_REVISAO_PADRAO = [7, 3, 1] as const;
/** Teto defensivo de intervalos distintos aceitos por prova. */
export const INTERVALOS_MAX = 10;
/** Maior "dias antes" aceito (defesa contra valores absurdos). */
export const DIAS_ANTES_MAX = 365;
