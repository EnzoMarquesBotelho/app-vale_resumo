/**
 * Tipos de domínio compartilhados entre o processo main e o renderer.
 * Nomes de identificadores em inglês; textos de UI/geração em português.
 */

/** Formatos de arquivo suportados para importação no MVP. */
export type FormatoArquivo = "txt" | "md" | "pdf";

/** Modos de geração de resumo. */
export type ModoResumo = "curto" | "longo";

/** Modos de geração de listas de exercícios e flashcards. */
export type ModoConteudo = "teorica" | "pratica" | "mista";

/**
 * Documento importado pelo usuário com o texto já extraído.
 * Serve de base para gerar resumo, flashcards e exercícios.
 */
export interface Documento {
  /** Identificador único do documento. */
  id: string;
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. */
  texto: string;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Caminho de origem no disco, quando conhecido (best-effort). */
  caminhoOrigem?: string;
}

/** Resumo gerado a partir de um documento. */
export interface Resumo {
  /** Documento de origem. */
  documentoId: string;
  /** Modo usado para gerar o resumo. */
  modo: ModoResumo;
  /** Texto do resumo. */
  conteudo: string;
  /** Data de geração em formato ISO 8601. */
  geradoEm: string;
}

/** Par pergunta/resposta extraído do conteúdo. */
export interface Flashcard {
  /** Pergunta (frente do card). */
  pergunta: string;
  /** Resposta (verso do card). */
  resposta: string;
}

/** Um exercício gerado a partir do conteúdo. */
export interface Exercicio {
  /** Enunciado do exercício. */
  enunciado: string;
  /** Resposta esperada ou gabarito. */
  resposta: string;
  /** Natureza do exercício. */
  modo: ModoConteudo;
}

/**
 * Resultado de importar e extrair o texto de um arquivo.
 * Produzido pelo serviço `files.ts` e devolvido ao renderer via IPC.
 */
export interface ArquivoImportado {
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. Vazio quando não há texto extraível. */
  texto: string;
  /**
   * `true` quando o arquivo (ex.: PDF escaneado) não tem texto extraível.
   * Nesse caso a UI exibe o aviso "sem texto extraível".
   */
  semTextoExtraivel: boolean;
  /** Caminho de origem no disco, quando conhecido (fluxo de import). */
  caminhoOrigem?: string;
  /** Id do caderno sugerido a partir da pasta-mãe (fluxo de import). */
  cadernoIdSugerido?: string;
  /** Nome do caderno sugerido a partir da pasta-mãe (fluxo de import). */
  cadernoNomeSugerido?: string;
}

/**
 * Documento persistido em disco com todos os seus artefatos gerados.
 *
 * É o registro completo salvo em JSON no `userData`: o texto importado mais o
 * resumo, os flashcards e os exercícios gerados a partir dele. Cada documento
 * guarda seus próprios artefatos; artefatos ainda não gerados ficam ausentes
 * (`undefined`). Serve de base para a tela de Histórico reabrir resultados.
 */
export interface DocumentoSalvo {
  /** Identificador único do documento (nome do arquivo JSON em disco). */
  id: string;
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. */
  texto: string;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Data da última atualização (nova geração salva) em ISO 8601. */
  atualizadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Caminho de origem no disco, quando conhecido (best-effort). */
  caminhoOrigem?: string;
  /** Resumo gerado, se houver. */
  resumo?: Resumo;
  /** Flashcards gerados, se houver. */
  flashcards?: Flashcard[];
  /** Exercícios gerados, se houver. */
  exercicios?: Exercicio[];
}

/**
 * Resumo de um documento salvo para listagem no Histórico, sem carregar o
 * texto e os artefatos inteiros. Mantém a lista leve mesmo com muitos itens.
 */
export interface ResumoDocumentoSalvo {
  /** Identificador único do documento. */
  id: string;
  /** Nome do arquivo original. */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Data da última atualização em ISO 8601. */
  atualizadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** `true` se o documento tem um resumo salvo. */
  temResumo: boolean;
  /** `true` se o documento tem flashcards salvos. */
  temFlashcards: boolean;
  /** `true` se o documento tem exercícios salvos. */
  temExercicios: boolean;
}

/** Um caderno agregado para a tela de Histórico (derivado dos documentos). */
export interface ResumoCaderno {
  /** Id normalizado do caderno. */
  cadernoId: string;
  /** Nome de exibição (grafia do documento mais recente do caderno). */
  cadernoNome: string;
  /** Quantos documentos pertencem a este caderno. */
  totalDocumentos: number;
  /** `atualizadoEm` (ISO) do documento mais recente, para ordenar os cadernos. */
  atualizadoEm: string;
}

/** Limites de quantidade para flashcards e exercícios (inclusivos). */
export const QUANTIDADE_MINIMA = 5;
export const QUANTIDADE_MAXIMA = 100;

/**
 * Estado de disponibilidade do Ollama, consultado pela UI para mostrar o
 * status e, quando offline, as instruções de instalação/inicialização.
 */
export interface OllamaStatus {
  /** `true` quando o Ollama está acessível localmente. */
  disponivel: boolean;
  /** Modelos baixados localmente (vazio se offline ou nenhum baixado). */
  modelos: string[];
  /** Modelo atualmente selecionado para as gerações. */
  modeloSelecionado: string;
}
