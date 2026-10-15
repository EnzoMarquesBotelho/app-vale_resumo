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

/** Limites de quantidade para flashcards e exercícios (inclusivos). */
export const QUANTIDADE_MINIMA = 5;
export const QUANTIDADE_MAXIMA = 100;
