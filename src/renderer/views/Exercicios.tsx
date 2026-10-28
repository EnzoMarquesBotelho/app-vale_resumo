import { useState } from "react";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "@shared/types";
import { rotuloProgresso } from "@shared/geracaoLotes";
import type {
  ArquivoImportado,
  AvaliacaoResposta,
  EntradaAvaliacao,
  Exercicio,
  ModoConteudo,
} from "@shared/types";
import { getApi } from "../api";
import { ExportarControles } from "../components/ExportarControles";

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
  /**
   * Exercícios já salvos deste documento, para reabrir resultados anteriores.
   * `null`/ausente quando ainda não há exercícios salvos.
   */
  exerciciosSalvos?: Exercicio[] | null;
  /** Chamado quando novos exercícios são gerados, para o App persistir. */
  onGerado?: (exercicios: Exercicio[]) => void;
  /** Nome do documento ativo, usado para nomear o arquivo exportado. */
  nomeDocumento?: string;
}

/** Quantidade inicial sugerida de exercícios. */
const QUANTIDADE_PADRAO = 10;

/** Rótulo em português para cada modo de lista de exercícios. */
const ROTULO_MODO: Record<ModoConteudo, string> = {
  teorica: "Teórica",
  pratica: "Prática",
  mista: "Mista",
};

/** Rótulo em português para cada veredito exibido no selo. */
const ROTULO_VEREDITO: Record<AvaliacaoResposta["veredito"], string> = {
  correto: "Correto",
  parcial: "Parcial",
  incorreto: "Incorreto",
  nao_avaliado: "Não avaliado",
};

/** Monta o vetor de respostas vazias para a lista de exercícios dada. */
function respostasVaziasEx(exercicios: Exercicio[]): string[] {
  return exercicios.map(() => "");
}

/** Monta o vetor de avaliações vazias (ainda sem correção) para `n` itens. */
function avaliacoesVazias(n: number): (AvaliacaoResposta | null)[] {
  return Array.from({ length: n }, () => null);
}

/**
 * Tela de exercícios: o usuário escolhe o modo (teórica/prática/mista) e
 * quantos exercícios gerar (5–100), e gera a partir do texto importado via IA
 * local. A lista é exibida de forma legível, com enunciado e gabarito.
 */
export function Exercicios({
  arquivo,
  exerciciosSalvos,
  onGerado,
  nomeDocumento,
}: ExerciciosProps): React.JSX.Element {
  // Estado inicializado a partir do que está salvo. O App remonta esta tela
  // (via `key` por documento) ao reabrir/importar outro, então a inicialização
  // reflete o documento ativo sem precisar sincronizar via efeito.
  const [modo, setModo] = useState<ModoConteudo>(
    exerciciosSalvos?.[0]?.modo ?? "mista",
  );
  const [quantidade, setQuantidade] = useState<number>(QUANTIDADE_PADRAO);
  const [exercicios, setExercicios] = useState<Exercicio[] | null>(
    exerciciosSalvos ?? null,
  );
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Tentativa efêmera (em memória): respostas digitadas e avaliações por IA,
  // alinhadas por índice à lista de exercícios. Nada disso persiste no
  // DocumentoSalvo; remontar a view (via `key`) zera tudo.
  const [respostas, setRespostas] = useState<string[]>(
    exerciciosSalvos ? respostasVaziasEx(exerciciosSalvos) : [],
  );
  const [avaliacoes, setAvaliacoes] = useState<(AvaliacaoResposta | null)[]>(
    exerciciosSalvos ? avaliacoesVazias(exerciciosSalvos.length) : [],
  );
  const [avaliando, setAvaliando] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState<string | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Convenção dos limites 5–100 (decisão herdada da revisão da Task 6):
  // o serviço (`normalizarQuantidade`) é a fonte da verdade e sempre faz
  // clamp — essa é a garantia. A UI apenas antecipa o feedback, bloqueando o
  // botão e avisando enquanto o valor está fora da faixa, para o usuário não
  // ter a impressão de que o número digitado foi ignorado. As duas camadas são
  // intencionais e consistentes (nunca sai pedido fora de 5–100).
  const quantidadeValida =
    quantidade >= QUANTIDADE_MINIMA && quantidade <= QUANTIDADE_MAXIMA;

  async function gerar(): Promise<void> {
    if (!temTexto || !quantidadeValida) return;
    setErro(null);
    setExercicios(null);
    setRespostas([]);
    setAvaliacoes([]);
    setErroAvaliacao(null);
    setProgresso(null);
    setGerando(true);
    // Assina o progresso em lotes ANTES do await; filtra por "exercicios".
    const cancelar = getApi().aoProgressoGeracao((p) => {
      if (p.artefato === "exercicios") setProgresso(rotuloProgresso(p));
    });
    try {
      const resultado = await getApi().gerarExercicios(
        arquivo.texto,
        modo,
        quantidade,
      );
      setExercicios(resultado ?? null);
      if (resultado != null) {
        setRespostas(respostasVaziasEx(resultado));
        setAvaliacoes(avaliacoesVazias(resultado.length));
        if (onGerado) {
          onGerado(resultado);
        }
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      cancelar();
      setProgresso(null);
      setGerando(false);
    }
  }

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
    if (exercicios === null || avaliando || todasVazias) return;
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
              {gerando ? (progresso ?? "Gerando…") : "Gerar exercícios"}
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
          <ExportarControles
            alvo={{
              escopo: "artefato",
              tipo: "exercicios",
              documento: {
                nome: nomeDocumento ?? arquivo?.nome ?? "Documento",
                exercicios,
              },
            }}
          />
          <p className="exercicios-contador" aria-live="polite">
            {exercicios.length}{" "}
            {exercicios.length === 1 ? "exercício" : "exercícios"} ·{" "}
            {ROTULO_MODO[modo]}
          </p>
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
                      <p className="avaliacao-comentario">
                        {avaliacao.comentario}
                      </p>
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
        </div>
      )}
    </section>
  );
}
