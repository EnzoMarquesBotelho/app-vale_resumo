import type {
  ArquivoImportado,
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  MapaMental as MapaMentalArtefato,
  Quiz as QuizArtefato,
  Resumo as ResumoArtefato,
} from "@shared/types";
import type { DocumentoExportavel } from "@shared/export/types";
import { Historico } from "./Historico";
import { Importar } from "./Importar";
import { TelaDocumento } from "./TelaDocumento";

/** Visão atual dentro da Biblioteca. */
export type VisaoBiblioteca = "lista" | "importar" | "documento";

/** Props do wrapper da Biblioteca. */
interface BibliotecaProps {
  /** Visão a renderizar. */
  visao: VisaoBiblioteca;
  /** Troca a visão da Biblioteca. */
  onDefinirVisao: (visao: VisaoBiblioteca) => void;

  // Dados compartilhados do documento ativo.
  arquivo: ArquivoImportado | null;
  documento: DocumentoSalvo | null;
  chaveDocumento: string;
  temTexto: boolean;
  docExportavel: DocumentoExportavel | null;
  semArtefatos: boolean;

  // Histórico (visão "lista").
  versaoHistorico: number;
  onReabrir: (documento: DocumentoSalvo) => void;

  // Importação (visão "importar").
  onImportado: (arquivo: ArquivoImportado | null) => void;
  onConfirmarCaderno?: (arquivo: ArquivoImportado, cadernoNome: string) => void;
  onLoteImportado: () => void;

  // Persistência dos artefatos (visão "documento").
  onSalvarResumo: (resumo: ResumoArtefato) => void;
  onSalvarFlashcards: (flashcards: Flashcard[]) => void;
  onSalvarExercicios: (exercicios: Exercicio[]) => void;
  onSalvarMapaMental: (mapa: MapaMentalArtefato) => void;
  onSalvarQuiz: (quiz: QuizArtefato) => void;
}

/**
 * Wrapper fino da Biblioteca: conforme a visão, renderiza o Histórico (lista de
 * cadernos/documentos), a tela de Importar, ou a tela do documento aberto.
 * Reusa as telas existentes sem alterar sua lógica; só escolhe qual exibir e
 * oferece atalhos para iniciar uma importação.
 */
export function Biblioteca({
  visao,
  onDefinirVisao,
  arquivo,
  documento,
  chaveDocumento,
  temTexto,
  docExportavel,
  semArtefatos,
  versaoHistorico,
  onReabrir,
  onImportado,
  onConfirmarCaderno,
  onLoteImportado,
  onSalvarResumo,
  onSalvarFlashcards,
  onSalvarExercicios,
  onSalvarMapaMental,
  onSalvarQuiz,
}: BibliotecaProps): React.JSX.Element {
  return (
    <section className="biblioteca">
      {visao !== "documento" && (
        <header className="biblioteca-header">
          <div className="biblioteca-acoes">
            <button type="button" onClick={() => onDefinirVisao("importar")}>
              Importar arquivo
            </button>
            <button type="button" onClick={() => onDefinirVisao("importar")}>
              Importar pasta
            </button>
          </div>
        </header>
      )}

      {visao === "lista" && (
        <Historico
          recarregar={versaoHistorico}
          documentoAtivoId={documento?.id ?? null}
          onReabrir={onReabrir}
        />
      )}

      {visao === "importar" && (
        <Importar
          arquivo={arquivo}
          onImportado={onImportado}
          onLoteImportado={onLoteImportado}
          {...(onConfirmarCaderno !== undefined
            ? { onConfirmarCaderno }
            : {})}
        />
      )}

      {visao === "documento" && (
        <TelaDocumento
          arquivo={arquivo}
          documento={documento}
          chaveDocumento={chaveDocumento}
          temTexto={temTexto}
          docExportavel={docExportavel}
          semArtefatos={semArtefatos}
          onSalvarResumo={onSalvarResumo}
          onSalvarFlashcards={onSalvarFlashcards}
          onSalvarExercicios={onSalvarExercicios}
          onSalvarMapaMental={onSalvarMapaMental}
          onSalvarQuiz={onSalvarQuiz}
          onVoltar={() => onDefinirVisao("lista")}
        />
      )}
    </section>
  );
}
