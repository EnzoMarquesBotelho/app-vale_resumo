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
