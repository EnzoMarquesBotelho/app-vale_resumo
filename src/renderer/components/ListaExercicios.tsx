import { useState } from "react";
import type {
  AvaliacaoResposta,
  EntradaAvaliacao,
  Exercicio,
} from "@shared/types";
import { getApi } from "../api";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler.
 */
function mensagemDeErro(e: unknown): string {
  const padrao = "Falha ao gerar os exercícios.";
  if (!(e instanceof Error) || e.message.length === 0) return padrao;
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : padrao;
}

/** Rótulo em português para cada veredito exibido no selo. */
const ROTULO_VEREDITO: Record<AvaliacaoResposta["veredito"], string> = {
  correto: "Correto",
  parcial: "Parcial",
  incorreto: "Incorreto",
  nao_avaliado: "Não avaliado",
};

/** Monta o vetor de avaliações vazias (ainda sem correção) para `n` itens. */
function avaliacoesVazias(n: number): (AvaliacaoResposta | null)[] {
  return Array.from({ length: n }, () => null);
}

export interface ListaExerciciosProps {
  exercicios: Exercicio[];
}

/**
 * Lista de exercícios para responder e corrigir: enunciado, resposta digitada,
 * "Ver resposta" e "Corrigir com IA" (`avaliarRespostas`). A tentativa é
 * efêmera (só em memória): respostas e correções alinhadas por índice à lista,
 * iniciadas por inicializador de `useState`. Quem monta deve usar `key` que
 * mude quando a lista mudar, para zerar a tentativa.
 */
export function ListaExercicios({
  exercicios,
}: ListaExerciciosProps): React.JSX.Element {
  const [respostas, setRespostas] = useState<string[]>(() =>
    exercicios.map(() => ""),
  );
  const [avaliacoes, setAvaliacoes] = useState<(AvaliacaoResposta | null)[]>(
    () => avaliacoesVazias(exercicios.length),
  );
  const [avaliando, setAvaliando] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState<string | null>(null);

  /** Registra o texto digitado na resposta de um exercício. */
  function responder(indice: number, texto: string): void {
    setRespostas((atual) =>
      atual.map((resposta, i) => (i === indice ? texto : resposta)),
    );
  }

  // Sem resposta digitada em lugar nenhum, não há o que corrigir.
  const todasVazias = respostas.every((r) => r.trim().length === 0);

  /**
   * Corrige TODAS as respostas de uma vez pela IA (os exercícios são sempre
   * avaliados por IA — não há autoavaliação aqui). Monta uma entrada por
   * exercício alinhada por índice e repassa ao main via `getApi()`. Uma falha
   * de infraestrutura vira uma mensagem amigável; as respostas digitadas ficam
   * intactas para o usuário tentar de novo.
   */
  async function corrigir(): Promise<void> {
    if (avaliando || todasVazias) return;
    setErroAvaliacao(null);
    setAvaliando(true);
    try {
      const entradas: EntradaAvaliacao[] = exercicios.map((ex, i) => ({
        enunciado: ex.enunciado,
        gabarito: ex.resposta,
        resposta: respostas[i] ?? "",
      }));
      const resultado = await getApi().avaliarRespostas(entradas);
      setAvaliacoes(resultado);
    } catch (e) {
      setErroAvaliacao(mensagemDeErro(e));
    } finally {
      setAvaliando(false);
    }
  }

  return (
    <>
      <ol className="exercicios-lista">
        {exercicios.map((exercicio, indice) => {
          const avaliacao = avaliacoes[indice] ?? null;
          return (
            <li key={indice} className="exercicio-item">
              <p className="exercicio-enunciado">{exercicio.enunciado}</p>
              <label className="exercicio-aberta">
                <span className="exercicio-aberta-rotulo">Sua resposta</span>
                <textarea
                  value={respostas[indice] ?? ""}
                  onChange={(e) => responder(indice, e.target.value)}
                  disabled={avaliando}
                  rows={3}
                />
              </label>
              <details className="exercicio-resposta">
                <summary>Ver resposta</summary>
                <p>{exercicio.resposta}</p>
              </details>
              {avaliacao !== null && (
                <>
                  <span
                    className={`avaliacao-selo avaliacao-selo-${avaliacao.veredito}`}
                  >
                    {ROTULO_VEREDITO[avaliacao.veredito]}
                  </span>
                  <p className="avaliacao-comentario">{avaliacao.comentario}</p>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <div className="exercicios-acoes">
        <button
          type="button"
          onClick={() => void corrigir()}
          disabled={avaliando || todasVazias}
        >
          {avaliando ? "Avaliando…" : "Corrigir com IA"}
        </button>
        <span className="app-meta" aria-live="polite">
          {avaliando
            ? "Avaliando suas respostas com a IA local…"
            : "As respostas dos exercícios são sempre corrigidas pela IA."}
        </span>
      </div>
      {erroAvaliacao !== null && (
        <p className="exercicios-erro" role="alert">
          {erroAvaliacao}
        </p>
      )}
    </>
  );
}
