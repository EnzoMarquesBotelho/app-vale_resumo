import { useState } from "react";
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
import { ExportarControles } from "../components/ExportarControles";
import { Resumo } from "./Resumo";
import { Flashcards } from "./Flashcards";
import { Exercicios } from "./Exercicios";
import { MapaMental } from "./MapaMental";
import { Quiz } from "./Quiz";

/** Aba interna da tela do documento. */
type AbaArtefato =
  | "texto"
  | "resumo"
  | "flashcards"
  | "exercicios"
  | "mapa"
  | "quiz";

/** Rótulos (em português) de cada aba interna. */
const ABAS: readonly { id: AbaArtefato; rotulo: string }[] = [
  { id: "texto", rotulo: "Texto" },
  { id: "resumo", rotulo: "Resumo" },
  { id: "flashcards", rotulo: "Flashcards" },
  { id: "exercicios", rotulo: "Exercícios" },
  { id: "mapa", rotulo: "Mapa mental" },
  { id: "quiz", rotulo: "Quiz" },
];

/** Props da tela do documento aberto. */
interface TelaDocumentoProps {
  /** Arquivo ativo (texto importado), repassado às views de artefato. */
  arquivo: ArquivoImportado | null;
  /** Documento salvo ativo (fonte dos artefatos já persistidos). */
  documento: DocumentoSalvo | null;
  /** Chave de remontagem das views (muda ao trocar de documento). */
  chaveDocumento: string;
  /** Se há texto extraível para gerar artefatos. */
  temTexto: boolean;
  /** Documento montado para exportação (ou `null` sem documento). */
  docExportavel: DocumentoExportavel | null;
  /** Se o documento não tem nenhum artefato (desabilita a exportação). */
  semArtefatos: boolean;
  /** Persiste um resumo recém-gerado. */
  onSalvarResumo: (resumo: ResumoArtefato) => void;
  /** Persiste um conjunto de flashcards recém-gerado. */
  onSalvarFlashcards: (flashcards: Flashcard[]) => void;
  /** Persiste um conjunto de exercícios recém-gerado. */
  onSalvarExercicios: (exercicios: Exercicio[]) => void;
  /** Persiste um mapa mental recém-gerado. */
  onSalvarMapaMental: (mapa: MapaMentalArtefato) => void;
  /** Persiste um quiz recém-gerado. */
  onSalvarQuiz: (quiz: QuizArtefato) => void;
  /** Volta para a lista da Biblioteca. */
  onVoltar: () => void;
}

/**
 * Tela do documento aberto: mostra o texto importado e as 5 views de artefato
 * como abas internas, além da exportação do documento inteiro no topo. Reusa
 * as views existentes sem alterar sua lógica; apenas orquestra qual aba exibir.
 */
export function TelaDocumento({
  arquivo,
  documento,
  chaveDocumento,
  temTexto,
  docExportavel,
  semArtefatos,
  onSalvarResumo,
  onSalvarFlashcards,
  onSalvarExercicios,
  onSalvarMapaMental,
  onSalvarQuiz,
  onVoltar,
}: TelaDocumentoProps): React.JSX.Element {
  const [abaArtefato, setAbaArtefato] = useState<AbaArtefato>("texto");

  // Enquanto não há texto, as abas de artefato não fazem sentido: a aba exibida
  // cai para "texto" (espelha o fallback para "importar" do App antigo).
  // Derivado em render, sem efeito.
  const abaEhArtefato = abaArtefato !== "texto";
  const abaExibida: AbaArtefato =
    !temTexto && abaEhArtefato ? "texto" : abaArtefato;

  // Abas de artefato ficam desabilitadas enquanto não há texto importado.
  function abaDesabilitada(id: AbaArtefato): boolean {
    return id !== "texto" && !temTexto;
  }

  return (
    <section className="tela-documento">
      <header className="tela-documento-header">
        <button
          type="button"
          className="tela-documento-voltar"
          onClick={onVoltar}
        >
          ← Biblioteca
        </button>
        {documento !== null && docExportavel !== null && (
          <div className="tela-documento-export">
            <p className="app-documento-ativo" title={documento.nome}>
              Documento: <strong>{documento.nome}</strong>
            </p>
            <ExportarControles
              alvo={{ escopo: "documento", documento: docExportavel }}
              desabilitado={semArtefatos}
              dicaDesabilitado="Gere ao menos um artefato para exportar o documento."
            />
          </div>
        )}
      </header>

      <nav className="tela-documento-abas" aria-label="Seções do documento">
        {ABAS.map((aba) => (
          <button
            key={aba.id}
            type="button"
            className={`tela-documento-aba ${
              abaExibida === aba.id ? "ativo" : ""
            }`}
            onClick={() => setAbaArtefato(aba.id)}
            disabled={abaDesabilitada(aba.id)}
            aria-current={abaExibida === aba.id ? "page" : undefined}
            title={
              abaDesabilitada(aba.id)
                ? "Importe um arquivo com texto primeiro"
                : undefined
            }
          >
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <div className="tela-documento-conteudo">
        {abaExibida === "texto" && (
          <article className="tela-documento-texto">
            {arquivo !== null && <h3>{arquivo.nome}</h3>}
            {arquivo !== null && !arquivo.semTextoExtraivel ? (
              <pre className="importar-texto">{arquivo.texto}</pre>
            ) : (
              <p className="app-meta">Sem texto para exibir.</p>
            )}
          </article>
        )}
        {abaExibida === "resumo" && (
          <Resumo
            key={`resumo-${chaveDocumento}`}
            arquivo={arquivo}
            resumoSalvo={documento?.resumo ?? null}
            onGerado={temTexto ? onSalvarResumo : undefined}
            nomeDocumento={documento?.nome}
          />
        )}
        {abaExibida === "flashcards" && (
          <Flashcards
            key={`flashcards-${chaveDocumento}`}
            arquivo={arquivo}
            flashcardsSalvos={documento?.flashcards ?? null}
            onGerado={temTexto ? onSalvarFlashcards : undefined}
            nomeDocumento={documento?.nome}
          />
        )}
        {abaExibida === "exercicios" && (
          <Exercicios
            key={`exercicios-${chaveDocumento}`}
            arquivo={arquivo}
            exerciciosSalvos={documento?.exercicios ?? null}
            onGerado={temTexto ? onSalvarExercicios : undefined}
            nomeDocumento={documento?.nome}
          />
        )}
        {abaExibida === "mapa" && (
          <MapaMental
            key={`mapa-${chaveDocumento}`}
            arquivo={arquivo}
            mapaMentalSalvo={documento?.mapaMental ?? null}
            onGerado={temTexto ? onSalvarMapaMental : undefined}
            nomeDocumento={documento?.nome}
          />
        )}
        {abaExibida === "quiz" && (
          <Quiz
            key={`quiz-${chaveDocumento}`}
            arquivo={arquivo}
            quizSalvo={documento?.quiz ?? null}
            onGerado={temTexto ? onSalvarQuiz : undefined}
            nomeDocumento={documento?.nome}
          />
        )}
      </div>
    </section>
  );
}
