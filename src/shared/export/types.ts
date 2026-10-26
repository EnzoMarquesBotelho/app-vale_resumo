/**
 * Tipos de opções da exportação, compartilhados entre o main e o renderer via
 * o contrato de IPC. A exportação é 100% local/determinística e não usa o
 * Ollama; os DADOS necessários viajam no próprio alvo (ver design §4.2).
 *
 * Identificadores em inglês; textos de UI/geração em português.
 */
import type {
  Exercicio,
  Flashcard,
  MapaMental,
  Quiz,
  Resumo,
} from "../types";

/** Formato de arquivo de exportação. */
export type FormatoExportacao = "markdown" | "pdf";

/** Identifica qual artefato de um documento exportar isoladamente. */
export type TipoArtefato =
  | "resumo"
  | "flashcards"
  | "exercicios"
  | "mapaMental"
  | "quiz";

/**
 * Subconjunto de `DocumentoSalvo` suficiente para exportar: nome e os artefatos
 * opcionais. Declarado à parte (em vez de reusar `DocumentoSalvo` cru) para
 * deixar explícito que a exportação só depende destes campos e não de
 * datas/ids de persistência. O renderer monta isto a partir do `DocumentoSalvo`
 * (ou do artefato em memória) ativo.
 */
export interface DocumentoExportavel {
  /** Nome do documento (fonte única do nome usado em título/arquivo). */
  nome: string;
  /** Resumo gerado, se houver. */
  resumo?: Resumo;
  /** Flashcards gerados, se houver. */
  flashcards?: Flashcard[];
  /** Exercícios gerados, se houver. */
  exercicios?: Exercicio[];
  /** Mapa mental gerado, se houver. */
  mapaMental?: MapaMental;
  /** Quiz gerado, se houver. */
  quiz?: Quiz;
}

/**
 * Alvo de uma exportação: um artefato específico de um documento, ou o
 * documento inteiro (todos os artefatos presentes). União discriminada por
 * `escopo`. Em ambos os casos o nome vem só de `documento.nome` (fonte única).
 */
export type AlvoExportacao =
  | {
      /** Exporta um único artefato do documento. */
      escopo: "artefato";
      /** Qual artefato de `documento` exportar. */
      tipo: TipoArtefato;
      /** O documento; o serviço lê só o artefato de `tipo`. */
      documento: DocumentoExportavel;
    }
  | {
      /** Exporta o documento inteiro (todos os artefatos presentes). */
      escopo: "documento";
      /** O documento com os artefatos a concatenar. */
      documento: DocumentoExportavel;
    };

/** Resultado de uma exportação, devolvido ao renderer pelo IPC. */
export type ResultadoExportacao =
  | { status: "salvo"; caminho: string }
  | { status: "cancelado" };
