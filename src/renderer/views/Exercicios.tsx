import { useState } from "react";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "@shared/types";
import type { ArquivoImportado, Exercicio, ModoConteudo } from "@shared/types";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao gerar os exercícios.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao gerar os exercícios.";
}

/** Props da tela de exercícios. */
interface ExerciciosProps {
  /** Arquivo importado cujo texto será usado (ou `null` se nenhum). */
  arquivo: ArquivoImportado | null;
}

/** Quantidade inicial sugerida de exercícios. */
const QUANTIDADE_PADRAO = 10;

/** Rótulo em português para cada modo de lista de exercícios. */
const ROTULO_MODO: Record<ModoConteudo, string> = {
  teorica: "Teórica",
  pratica: "Prática",
  mista: "Mista",
};

/**
 * Tela de exercícios: o usuário escolhe o modo (teórica/prática/mista) e
 * quantos exercícios gerar (5–100), e gera a partir do texto importado via IA
 * local. A lista é exibida de forma legível, com enunciado e gabarito.
 */
export function Exercicios({ arquivo }: ExerciciosProps): React.JSX.Element {
  const [modo, setModo] = useState<ModoConteudo>("mista");
  const [quantidade, setQuantidade] = useState<number>(QUANTIDADE_PADRAO);
  const [exercicios, setExercicios] = useState<Exercicio[] | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Mantém a quantidade dentro dos limites do MVP (5–100).
  const quantidadeValida =
    quantidade >= QUANTIDADE_MINIMA && quantidade <= QUANTIDADE_MAXIMA;

  async function gerar(): Promise<void> {
    if (!temTexto || !quantidadeValida) return;
    setErro(null);
    setExercicios(null);
    setGerando(true);
    try {
      const resultado = await window.api?.gerarExercicios(
        arquivo.texto,
        modo,
        quantidade,
      );
      setExercicios(resultado ?? null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <section className="exercicios">
      <header className="exercicios-header">
        <h2>Exercícios</h2>
        {!temTexto ? (
          <p className="app-meta">
            Importe um arquivo com texto para gerar exercícios.
          </p>
        ) : (
          <div className="exercicios-controles">
            <label className="exercicios-modo">
              Tipo
              <select
                value={modo}
                onChange={(e) => setModo(e.target.value as ModoConteudo)}
                disabled={gerando}
              >
                <option value="teorica">Teórica</option>
                <option value="pratica">Prática</option>
                <option value="mista">Mista</option>
              </select>
            </label>
            <label className="exercicios-quantidade">
              Quantidade
              <input
                type="number"
                min={QUANTIDADE_MINIMA}
                max={QUANTIDADE_MAXIMA}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                disabled={gerando}
              />
            </label>
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando || !quantidadeValida}
            >
              {gerando ? "Gerando…" : "Gerar exercícios"}
            </button>
            {!quantidadeValida && (
              <span className="app-meta">
                Escolha entre {QUANTIDADE_MINIMA} e {QUANTIDADE_MAXIMA}.
              </span>
            )}
          </div>
        )}
      </header>

      {erro !== null && (
        <p className="exercicios-erro" role="alert">
          {erro}
        </p>
      )}

      {exercicios !== null && (
        <div className="exercicios-resultado">
          <p className="exercicios-contador" aria-live="polite">
            {exercicios.length}{" "}
            {exercicios.length === 1 ? "exercício" : "exercícios"} ·{" "}
            {ROTULO_MODO[modo]}
          </p>
          <ol className="exercicios-lista">
            {exercicios.map((exercicio, indice) => (
              <li key={indice} className="exercicio-item">
                <p className="exercicio-enunciado">{exercicio.enunciado}</p>
                <details className="exercicio-resposta">
                  <summary>Ver resposta</summary>
                  <p>{exercicio.resposta}</p>
                </details>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
