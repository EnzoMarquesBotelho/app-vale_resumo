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

/**
 * A partir de quantos itens a geração de quiz/exercícios passa a ser feita em
 * lotes (chunking). Igual ou abaixo deste limiar, o comportamento é o de hoje
 * (uma única chamada ao Ollama). Acima, liga o chunking. O gate é `total >
 * GERACAO_LOTE_LIMIAR`, então 21 é o menor caso particionado (com lote 15).
 */
export const GERACAO_LOTE_LIMIAR = 20;
/** Tamanho (itens) de cada lote quando a geração é particionada. */
export const GERACAO_LOTE_TAMANHO = 15;
/**
 * Quantos enunciados já aceitos entram no bloco "evitar" do próximo lote (os
 * mais recentes). Limita o custo de prompt extra por lote.
 */
export const GERACAO_EVITAR_MAX = 30;
/** Comprimento máximo (caracteres) de cada enunciado no bloco "evitar". */
export const GERACAO_EVITAR_MAXLEN = 120;
/**
 * Quantos lotes CONSECUTIVOS sem nenhum item novo aceito (`aceitos === 0`) o
 * laço tolera antes de desistir e devolver o parcial. Distingue o modelo que
 * ainda produz (o contador zera a cada lote produtivo, o laço persiste rumo ao
 * total) do modelo travado repetindo tudo (para após K lotes vazios seguidos,
 * sem queimar tempo). Um único lote vazio pode ser azar; três vazios seguidos
 * indicam convergência real.
 */
export const GERACAO_LOTE_SEM_PROGRESSO_MAX = 3;
/**
 * Margem do TETO ABSOLUTO de tentativas, além do número de lotes da partição.
 * Rede de segurança de terminação para a hipótese degenerada de alternar
 * "1 aceito / 0 aceito" indefinidamente (a parada por estagnação dispararia
 * antes na prática). O teto NÃO é uma constante: é computado no serviço como
 * `lotes.length + GERACAO_LOTE_TETO_MARGEM_ABS` (depende de `lotes.length`,
 * que é runtime). Garante que o laço SEMPRE termina.
 */
export const GERACAO_LOTE_TETO_MARGEM_ABS = 6;

/** Intervalos padrão de repetição espaçada: dias antes da prova. */
export const INTERVALOS_REVISAO_PADRAO = [7, 3, 1] as const;
/** Teto defensivo de intervalos distintos aceitos por prova. */
export const INTERVALOS_MAX = 10;
/** Maior "dias antes" aceito (defesa contra valores absurdos). */
export const DIAS_ANTES_MAX = 365;

/**
 * Horizonte (em dias) a partir do qual a prova é "longe" para a régua base/novo
 * (`plano.ts`). Um mês é o horizonte típico de preparação de prova de
 * faculdade: acima disso, `prox` satura em 0 e a base atinge o teto.
 */
export const HORIZONTE_DIAS = 30;
/**
 * Fração MÍNIMA de esforço dedicada à base, atingida quando a prova está em
 * cima da hora (`prox=1`): os "alguns toques na base" que o intent pede mesmo
 * com foco no novo. Em [0,1].
 */
export const PISO_BASE = 0.15;
/**
 * Fração MÁXIMA de esforço dedicada à base, atingida quando a prova está longe
 * (`prox=0`): o foco PESADO — nunca total — na base. Fica abaixo de 1 de
 * propósito, para o conteúdo novo nunca zerar quando ele existe. Em [0,1].
 */
export const TETO_BASE = 0.8;
/**
 * Peso do ajuste por dificuldade da base na régua: quanto da folga entre a
 * base bruta e `TETO_BASE` a dificuldade máxima (1) fecha. 0.5 = metade da
 * folga quando a base é toda difícil. Em [0,1].
 */
export const PESO_DIFICULDADE = 0.5;
/**
 * Duração mínima (em minutos) de um bloco de estudo na distribuição por dias
 * (`plano.ts`). Um tópico cujo alvo cai abaixo disto é adiado (não comprimido),
 * e nenhum bloco é criado abaixo deste piso.
 */
export const MINUTOS_BLOCO_MIN = 15;

// --- Diagnóstico do plano de estudo (fatia 3) --------------------------------

/** Máximo de tópicos amostrados por camada (base / novo) no diagnóstico. */
export const DIAG_TOPICOS_POR_CAMADA = 3;
/** Perguntas mantidas por tópico no diagnóstico. */
export const DIAG_PERGUNTAS_POR_TOPICO = 3;
/**
 * Quantidade pedida a `gerarQuiz` por tópico (igual a `QUANTIDADE_MINIMA`, o
 * menor pedido aceito por `normalizarQuantidade`); sobras são descartadas.
 */
export const DIAG_PEDIDO_POR_TOPICO = 5;
/** Corte (em caracteres) do texto-base de cada tópico: evita condensação. */
export const DIAG_TEXTO_MAX = tamanhoMaximoChunkCaracteres;
/** Mínimo de respostas numa camada para ela contar como "medida". */
export const MIN_RESPOSTAS_CAMADA = 3;
/** Numerador do limiar de acerto (3/5 = 60%), comparado por inteiros. */
export const LIMIAR_ACERTO_NUM = 3;
/** Denominador do limiar de acerto (3/5 = 60%), comparado por inteiros. */
export const LIMIAR_ACERTO_DEN = 5;
/** Limiar de acerto em ponto flutuante: só para a intensidade, nunca decisão. */
export const LIMIAR_ACERTO_DIAGNOSTICO = LIMIAR_ACERTO_NUM / LIMIAR_ACERTO_DEN;
/**
 * Peso do diagnóstico na régua base/novo: quanto da folga até o teto (ou até o
 * piso) a intensidade máxima (1) fecha. Em [0,1].
 */
export const PESO_DIAGNOSTICO = 0.5;
/**
 * Amostra de referência (3 tópicos × 3 perguntas) para encolher a intensidade:
 * `min(1, total / DIAG_AMOSTRA_REFERENCIA)`. Amostra pequena reduz a CONFIANÇA.
 */
export const DIAG_AMOSTRA_REFERENCIA =
  DIAG_PERGUNTAS_POR_TOPICO * DIAG_TOPICOS_POR_CAMADA;
// --- Checkpoints pré-prova (fatia 4) ------------------------------------------

/** Quantos dias antes da prova caem os checkpoints (ids `d28`, `d14`, `d7`, `d3`). */
export const CHECKPOINT_DIAS_ANTES = [28, 14, 7, 3] as const;
/** Exercícios pedidos por checkpoint (fixo, não configurável). */
export const CHECKPOINT_QUANTIDADE = 8;
/** Modo dos exercícios do checkpoint. */
export const CHECKPOINT_MODO = "mista" as const;
/** Máximo de assuntos usados no texto-base de uma lista. */
export const CHECKPOINT_TOPICOS_MAX = 6;
/** Teto (em caracteres) do texto-base de uma lista. */
export const CHECKPOINT_TEXTO_MAX = tamanhoMaximoChunkCaracteres;
/** Mínimo de exercícios para a lista valer. */
export const CHECKPOINT_MINIMO_EXERCICIOS = 3;