import { useEffect, useState } from "react";
import {
  ehTopicoManual,
  estadoDiagnostico,
  fraseDiagnosticoParcial,
  fraseResultadoDiagnostico,
  fraseTopicosIgnorados,
  resultadoDoDiagnostico,
  rotuloProgressoDiagnostico,
} from "@shared/diagnostico";
import type { PlanoCalculado } from "@shared/plano";
import type { DiagnosticoPlano, Prova } from "@shared/types";
import { getApi } from "../api";
import { PlanoPrevia } from "./PlanoPrevia";
import { formatarCarimbo } from "./planoFormat";

/**
 * Card do diagnóstico do plano de estudo: um quiz curto de múltipla escolha
 * (gerado pela IA local) que mostra de onde vem a dificuldade do aluno e, se
 * for o caso, ajusta a divisão base/novo do plano. A IA só gera as perguntas;
 * correção e veredito são mecânicos (`@shared/diagnostico`). Fala com o main
 * APENAS via `getApi()`. Opcional: sem diagnóstico o plano segue o normal.
 */

/** Extrai uma frase amigável do erro vindo do IPC. */
function mensagemDeErro(e: unknown): string {
  const padrao = "Não foi possível concluir o diagnóstico. Tente novamente.";
  if (!(e instanceof Error) || e.message.length === 0) return padrao;
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : padrao;
}

export interface DiagnosticoProps {
  /** Prova selecionada (já com `plano`). */
  prova: Prova;
  /** Chamado com a prova atualizada após gerar ou responder. */
  aoAtualizar: (prova: Prova) => void;
}

interface PerguntasProps {
  diagnostico: DiagnosticoPlano;
  enviando: boolean;
  aoEnviar: (escolhas: number[]) => void;
}

/**
 * Formulário das perguntas. Montado com `key={geradoEm}`: um diagnóstico novo
 * remonta o componente e as respostas em andamento começam vazias.
 */
function Perguntas({
  diagnostico,
  enviando,
  aoEnviar,
}: PerguntasProps): React.JSX.Element {
  // `null` = ainda sem resposta; `-1` = "Não sei" (conta como erro).
  const [escolhas, setEscolhas] = useState<Array<number | null>>(() =>
    diagnostico.perguntas.map(() => null),
  );
  const todasRespondidas = escolhas.every((e) => e !== null);

  function escolher(pergunta: number, valor: number): void {
    setEscolhas((atuais) => atuais.map((v, k) => (k === pergunta ? valor : v)));
  }

  return (
    <form
      className="plano-topicos"
      onSubmit={(e) => {
        e.preventDefault();
        if (todasRespondidas) aoEnviar(escolhas as number[]);
      }}
    >
      {diagnostico.perguntas.map((p, i) => (
        <fieldset key={i} className="plano-fieldset">
          <legend>
            {i + 1}. {p.enunciado}
          </legend>
          {p.alternativas.map((a, alt) => (
            <label key={alt} className="plano-radio">
              <input
                type="radio"
                name={`diag-${i}`}
                checked={escolhas[i] === alt}
                onChange={() => escolher(i, alt)}
              />
              {a.texto}
            </label>
          ))}
          <label className="plano-radio">
            <input
              type="radio"
              name={`diag-${i}`}
              checked={escolhas[i] === -1}
              onChange={() => escolher(i, -1)}
            />
            Não sei
          </label>
        </fieldset>
      ))}
      <div className="plano-acoes">
        <button type="submit" disabled={enviando || !todasRespondidas}>
          {enviando ? "Calculando…" : "Ver resultado"}
        </button>
      </div>
    </form>
  );
}

export function Diagnostico({
  prova,
  aoAtualizar,
}: DiagnosticoProps): React.JSX.Element | null {
  const plano = prova.plano;
  const diagnostico = prova.diagnostico;
  const estado = estadoDiagnostico(plano, diagnostico);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Plano calculado (já ajustado) para a versão atual da prova. Guardamos a
  // `chave` junto: resultado de outra versão é ignorado (sem setState síncrono
  // dentro do efeito).
  const [calc, setCalc] = useState<{
    chave: string;
    plano: PlanoCalculado | null;
    erro: string | null;
  } | null>(null);
  const chaveCalc = `${prova.id}|${prova.atualizadoEm}`;
  const calcAtual = estado === "concluido" && calc?.chave === chaveCalc ? calc : null;
  const calculado = calcAtual?.plano ?? null;
  const erroPlano = calcAtual?.erro ?? null;

  // Diagnóstico concluído: pede o plano já ajustado (calculado sob demanda).
  useEffect(() => {
    if (estado !== "concluido") return;
    let ativo = true;
    void (async () => {
      try {
        const c = await getApi().calcularPlano(prova.id);
        if (ativo) setCalc({ chave: chaveCalc, plano: c, erro: null });
      } catch (e) {
        if (ativo) {
          setCalc({ chave: chaveCalc, plano: null, erro: mensagemDeErro(e) });
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [estado, prova.id, chaveCalc]);

  if (plano === undefined) return null;

  const temNovoNoPlano = plano.topicos.some((t) => t.novo);
  const temBaseComMaterial = plano.topicos.some(
    (t) => !t.novo && !ehTopicoManual(t.id),
  );
  const manuais = plano.topicos.filter((t) => ehTopicoManual(t.id)).length;

  async function gerar(): Promise<void> {
    setErro(null);
    setConfirmando(false);
    setProgresso(null);
    setGerando(true);
    // Assina o progresso ANTES do await; filtra pelo artefato "diagnostico".
    const cancelar = getApi().aoProgressoGeracao((p) => {
      if (p.artefato === "diagnostico") {
        setProgresso(rotuloProgressoDiagnostico(p));
      }
    });
    try {
      const atualizada = await getApi().gerarDiagnostico(prova.id);
      aoAtualizar(atualizada);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      cancelar();
      setProgresso(null);
      setGerando(false);
    }
  }

  async function enviarRespostas(escolhas: number[]): Promise<void> {
    setErro(null);
    setEnviando(true);
    try {
      const atualizada = await getApi().responderDiagnostico(
        prova.id,
        escolhas,
      );
      aoAtualizar(atualizada);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const textoBotaoGerar = gerando
    ? (progresso ?? "Preparando as perguntas…")
    : "Fazer diagnóstico";

  const titulos = new Map(plano.topicos.map((t) => [t.id, t.titulo] as const));
  const resultado =
    estado === "concluido" && diagnostico !== undefined
      ? resultadoDoDiagnostico(diagnostico)
      : undefined;
  const avisoParcial =
    diagnostico !== undefined
      ? fraseDiagnosticoParcial(diagnostico.perguntas.length, diagnostico.pedido)
      : null;
  const avisoIgnorados =
    diagnostico !== undefined ? fraseTopicosIgnorados(diagnostico.ignorados) : null;

  const refazer = (
    <div className="plano-acoes">
      {confirmando ? (
        <>
          <span className="app-meta">
            Isso substitui o diagnóstico atual. Continuar?
          </span>
          <button type="button" onClick={() => void gerar()} disabled={gerando}>
            Sim, refazer
          </button>
          <button type="button" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (estado === "concluido") setConfirmando(true);
            else void gerar();
          }}
          disabled={gerando}
        >
          {gerando ? (progresso ?? "Preparando as perguntas…") : "Refazer diagnóstico"}
        </button>
      )}
    </div>
  );

  return (
    <section className="plano-form" aria-label="Diagnóstico do plano de estudo">
      <h3>Diagnóstico rápido</h3>

      {gerando && (
        <p className="app-meta" role="status" aria-live="polite">
          {progresso ?? "Preparando as perguntas…"} Isso pode levar alguns
          minutos.
        </p>
      )}

      {erro !== null && (
        <p className="agenda-erro" role="alert">
          {erro}
        </p>
      )}

      {estado === "nenhum" && (
        <>
          <p>
            {temNovoNoPlano
              ? "Quer um plano mais certeiro? Faça um diagnóstico rápido (até 18 perguntas de múltipla escolha)."
              : "Descubra onde estão suas dificuldades. Faça um diagnóstico rápido (até 18 perguntas de múltipla escolha). Ele mostra os pontos fracos, mas não muda a distribuição do plano."}
          </p>
          {manuais > 0 && (
            <p className="app-meta">
              {manuais === 1
                ? "1 assunto digitado à mão fica de fora, porque não tem material importado."
                : `${manuais} assuntos digitados à mão ficam de fora, porque não têm material importado.`}
            </p>
          )}
          {!temBaseComMaterial && (
            <p className="app-meta" id="diag-motivo">
              O diagnóstico precisa de ao menos um assunto de base com material
              importado. O plano continua valendo com a dificuldade que você
              informou.
            </p>
          )}
          <div className="plano-acoes">
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando || !temBaseComMaterial}
              aria-describedby={!temBaseComMaterial ? "diag-motivo" : undefined}
            >
              {textoBotaoGerar}
            </button>
          </div>
        </>
      )}

      {estado === "desatualizado" && (
        <>
          <p>
            Você mudou os assuntos desde o diagnóstico; o plano voltou ao
            cálculo normal. Refaça para ajustar.
          </p>
          {refazer}
        </>
      )}

      {estado === "pendente" && diagnostico !== undefined && (
        <>
          <p className="app-meta">
            Responda com calma. Se não souber, marque “Não sei”: conta como erro,
            e tudo bem.
          </p>
          {avisoParcial !== null && <p className="app-meta">{avisoParcial}</p>}
          {avisoIgnorados !== null && <p className="app-meta">{avisoIgnorados}</p>}
          <Perguntas
            key={diagnostico.geradoEm}
            diagnostico={diagnostico}
            enviando={enviando}
            aoEnviar={(e) => void enviarRespostas(e)}
          />
          {refazer}
        </>
      )}

      {estado === "concluido" && diagnostico !== undefined && (
        <>
          {resultado !== undefined && calculado !== null && (
            <p>
              {fraseResultadoDiagnostico(resultado, titulos, {
                novoPlanejado: temNovoNoPlano,
                efeitoNoPlano: calculado.diagnosticoAplicado !== undefined,
                planoDistribuido: calculado.mistura !== undefined,
              })}
            </p>
          )}
          <p className="app-meta">
            Isto é uma orientação de estudo, não uma previsão da prova.
          </p>
          <p className="app-meta">
            Feito em {formatarCarimbo(diagnostico.concluidoEm ?? diagnostico.geradoEm)}.
          </p>
          {avisoParcial !== null && <p className="app-meta">{avisoParcial}</p>}
          {avisoIgnorados !== null && <p className="app-meta">{avisoIgnorados}</p>}
          {erroPlano !== null && (
            <p className="agenda-erro" role="alert">
              {erroPlano}
            </p>
          )}
          {calculado !== null && (
            <PlanoPrevia
              previa={calculado}
              horasPorDia={plano.horasPorDia}
              diasPorSemana={plano.diasPorSemana}
              montadoEm={plano.atualizadoEm}
              ajustadoPeloDiagnostico={calculado.diagnosticoAplicado !== undefined}
            />
          )}
          {refazer}
        </>
      )}
    </section>
  );
}
