import { useEffect, useRef, useState } from "react";
import { dataLocalDe } from "@shared/dataProva";
import { fraseSemCheckpoints } from "@shared/checkpoints";
import { montarLinhaDoTempo } from "@shared/linhaDoTempo";
import type { ItemLinha } from "@shared/linhaDoTempo";
import type { PlanoCalculado } from "@shared/plano";
import type { Prova, SessaoRevisao } from "@shared/types";
import { getApi } from "../api";
import { CheckpointLinha, CheckpointsControles } from "./Checkpoints";
import { useCheckpoints } from "./useCheckpoints";
import { formatarMinutos } from "./planoFormat";

/**
 * Linha do tempo única da prova (com plano): estudo, revisões e checkpoints
 * na mesma lista, por data. O bloco de estudo é só leitura (vem do
 * questionário); revisões mantêm marcar/mover/remover; checkpoints mantêm o
 * ciclo gerar/abrir/concluir. A montagem é lógica pura (`@shared/linhaDoTempo`).
 */

const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** "2026-11-13" ⇒ "13/11 · sexta" (sem fuso). */
function rotuloDia(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${data.slice(8, 10)}/${data.slice(5, 7)} · ${semana}`;
}

function mensagemDeErro(e: unknown): string {
  const padrao = "Não foi possível montar o plano de estudo.";
  if (!(e instanceof Error) || e.message.length === 0) return padrao;
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : padrao;
}

export interface LinhaDoTempoProps {
  prova: Prova;
  /** Prova atualizada após ações dos checkpoints. */
  aoAtualizar: (prova: Prova) => void;
  aoAlternarConcluida: (sessao: SessaoRevisao) => void;
  aoMoverSessao: (sessao: SessaoRevisao, novaData: string) => void;
  aoRemoverSessao: (sessao: SessaoRevisao) => void;
  aoAdicionarSessao: () => void;
  aoRegerar: () => void;
}

export function LinhaDoTempo({
  prova,
  aoAtualizar,
  aoAlternarConcluida,
  aoMoverSessao,
  aoRemoverSessao,
  aoAdicionarSessao,
  aoRegerar,
}: LinhaDoTempoProps): React.JSX.Element {
  const cp = useCheckpoints(prova, aoAtualizar);
  const [plano, setPlano] = useState<PlanoCalculado | null>(null);
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  // Dias de estudo: refeitos quando a prova muda (toda ação recarimba).
  const ativoRef = useRef(true);
  useEffect(() => {
    ativoRef.current = true;
    void (async () => {
      try {
        const p = await getApi().calcularPlano(prova.id);
        if (ativoRef.current) {
          setPlano(p);
          setErroPlano(null);
        }
      } catch (e) {
        if (ativoRef.current) {
          setPlano(null);
          setErroPlano(mensagemDeErro(e));
        }
      }
    })();
    return () => {
      ativoRef.current = false;
    };
  }, [prova.id, prova.atualizadoEm]);

  const hoje = cp.visao?.hoje ?? dataLocalDe(new Date());
  const itens = montarLinhaDoTempo({
    sessoes: prova.sessoes,
    plano: plano ?? undefined,
    checkpoints: cp.visao?.itens,
    hoje,
  });

  // Agrupa por dia mantendo a ordem (já cronológica, regra L5).
  const dias: { data: string; situacao: ItemLinha["situacao"]; itens: ItemLinha[] }[] =
    [];
  for (const item of itens) {
    const ultimo = dias[dias.length - 1];
    if (ultimo !== undefined && ultimo.data === item.data) {
      ultimo.itens.push(item);
    } else {
      dias.push({ data: item.data, situacao: item.situacao, itens: [item] });
    }
  }

  function renderRevisao(sessao: SessaoRevisao): React.JSX.Element {
    const dd = `${sessao.data.slice(8, 10)}/${sessao.data.slice(5, 7)}`;
    return (
      <div
        className={`agenda-sessao ${sessao.concluida === true ? "concluida" : ""}`}
      >
        <label className="agenda-sessao-check">
          <input
            type="checkbox"
            checked={sessao.concluida === true}
            onChange={() => aoAlternarConcluida(sessao)}
            aria-label={`Revisão de ${dd} feita`}
          />
          <span className="app-meta">
            Revisão de {sessao.diasAntes} dia(s) antes
            {sessao.manual ? " · manual" : ""}
          </span>
        </label>
        <input
          type="date"
          value={sessao.data}
          min={hoje}
          max={prova.data}
          aria-label={`Mover revisão de ${dd} para outra data`}
          onChange={(e) => aoMoverSessao(sessao, e.target.value)}
        />
        <button
          type="button"
          className="agenda-remover"
          aria-label={`Remover revisão de ${dd}`}
          onClick={() => aoRemoverSessao(sessao)}
        >
          Remover
        </button>
      </div>
    );
  }

  const fraseVazia =
    cp.visao !== null && cp.visao.itens.length === 0 && cp.visao.motivoVazio
      ? fraseSemCheckpoints(cp.visao.motivoVazio)
      : null;

  return (
    <section className="agenda-sessoes linha-tempo" aria-label="Plano de estudo">
      <div className="agenda-sessoes-header">
        <h4>Plano de estudo</h4>
        <div className="agenda-sessoes-acoes">
          <button type="button" onClick={() => aoAdicionarSessao()}>
            Adicionar revisão
          </button>
          <button type="button" onClick={() => aoRegerar()}>
            Regerar revisões sugeridas
          </button>
        </div>
      </div>
      <p className="app-meta">Estudo, revisões e checkpoints na mesma lista, por data.</p>

      <CheckpointsControles provaId={prova.id} cp={cp} />

      {erroPlano !== null && (
        <p className="agenda-erro" role="alert">
          {erroPlano}
        </p>
      )}
      {cp.erroCarga !== null && (
        <p className="agenda-erro" role="alert">
          {cp.erroCarga}
        </p>
      )}
      {fraseVazia !== null && <p className="app-meta">{fraseVazia}</p>}

      {dias.length === 0 ? (
        <p className="app-meta">
          Nada agendado. Use “Adicionar revisão” ou ajuste o plano.
        </p>
      ) : (
        <ol className="linha-dias">
          {dias.map((dia) => (
            <li key={dia.data} className={`linha-dia ${dia.situacao}`}>
              <h5>
                <time dateTime={dia.data}>{rotuloDia(dia.data)}</time>
                {dia.situacao === "hoje" ? " · Hoje" : ""}
              </h5>
              <ul className="linha-itens">
                {dia.itens.map((item) => (
                  <li key={item.chave} className={`linha-item ${item.tipo}`}>
                    {item.tipo === "estudo" && (
                      <div className="checkpoint-corpo">
                        <strong>
                          Estudo · {formatarMinutos(item.minutosTotal)}
                        </strong>
                        <span className="app-meta">
                          {item.blocos
                            .map((b) => `${b.titulo} (${b.minutos})`)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                    {item.tipo === "revisao" && renderRevisao(item.sessao)}
                    {item.tipo === "checkpoint" && (
                      <>
                        <CheckpointLinha cp={cp} item={item.checkpoint} />
                        {item.revisoes.map((s) => (
                          <div key={s.id}>{renderRevisao(s)}</div>
                        ))}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
