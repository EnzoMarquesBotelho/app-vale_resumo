import {
  MENSAGEM_CHECKPOINT_INDISPONIVEL,
  fraseCheckpointIgnorados,
  fraseCheckpointParcial,
  rotuloEstadoCheckpoint,
  rotuloPreparandoCheckpoint,
} from "@shared/checkpoints";
import type { CheckpointVisao } from "@shared/checkpoints";
import type { CheckpointGerado } from "@shared/types";
import { ListaExercicios } from "../components/ListaExercicios";
import type { EstadoCheckpoints } from "./useCheckpoints";

/** "2026-06-06" para "06/06". */
function ddmm(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * Peças de UI dos checkpoints dentro da linha do tempo. O estado e as ações
 * vivem no hook `useCheckpoints` (arquivo próprio, por causa do fast refresh).
 */

/**
 * Bloco de controles dos checkpoints dentro da linha do tempo: preferência
 * (lembrar × automático), avisos e o destaque do candidato do lembrete.
 */
export function CheckpointsControles({
  provaId,
  cp,
}: {
  provaId: string;
  cp: EstadoCheckpoints;
}): React.JSX.Element | null {
  const { visao } = cp;
  if (visao === null || visao.itens.length === 0) return null;
  return (
    <div className="linha-checkpoints-controles">
      <fieldset className="plano-fieldset" disabled={cp.trocando}>
        <legend>Quando preparar as listas dos checkpoints</legend>
        <label className="plano-radio">
          <input
            type="radio"
            name={`cp-pref-${provaId}`}
            checked={visao.preferencia === "lembrete"}
            onChange={() => void cp.trocarPreferencia("lembrete")}
          />
          Lembrar-me
        </label>
        <label className="plano-radio">
          <input
            type="radio"
            name={`cp-pref-${provaId}`}
            checked={visao.preferencia === "automatico"}
            onChange={() => void cp.trocarPreferencia("automatico")}
          />
          Preparar automaticamente
        </label>
        <span className="app-meta">
          {visao.preferencia === "automatico"
            ? "Ao abrir esta prova, preparo a lista do checkpoint mais recente que já chegou."
            : "Só preparo uma lista quando você pedir."}
        </span>
      </fieldset>

      {cp.erroPreferencia !== null && (
        <p className="agenda-erro" role="alert">
          {cp.erroPreferencia}
        </p>
      )}

      {visao.bloco === "desatualizado" && (
        <p className="app-meta" role="status">
          O plano mudou depois que preparei estas listas; elas não valem mais.
          Gerar uma lista nova descarta as antigas.
        </p>
      )}

      {cp.candidato !== undefined && cp.fraseLembrete.length > 0 && (
        <div className="agenda-dica">
          <p className="agenda-dica-mecanica">{cp.fraseLembrete}</p>
          <div className="plano-acoes">
            <BotaoGerarCheckpoint cp={cp} item={cp.candidato} rotulo="Gerar lista" />
          </div>
        </div>
      )}
    </div>
  );
}

function BotaoGerarCheckpoint({
  cp,
  item,
  rotulo,
}: {
  cp: EstadoCheckpoints;
  item: CheckpointVisao;
  rotulo: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => void cp.gerar(item.id, true)}
      disabled={cp.ocupado}
    >
      {cp.erros[item.id] !== undefined ? "Tentar de novo" : rotulo}
    </button>
  );
}

/** Texto "Cobre: …" de um checkpoint (usa a lista gerada quando existe). */
function cobre(item: CheckpointVisao, gerado: CheckpointGerado | undefined): string {
  if (gerado !== undefined) {
    return gerado.topicos.map((t) => t.titulo).join(", ");
  }
  return item.topicos
    .map((t) => (t.manual ? `${t.titulo} (sem material)` : t.titulo))
    .join(", ");
}

/**
 * Corpo de um checkpoint na linha do tempo: estado, "Cobre: …", ações e a
 * lista aberta. Não renderiza o `<li>` (quem chama decide o contêiner).
 */
export function CheckpointLinha({
  cp,
  item,
}: {
  cp: EstadoCheckpoints;
  item: CheckpointVisao;
}): React.JSX.Element | null {
  const { visao } = cp;
  if (visao === null) return null;
  const gerado = cp.geradoDe(item.id);
  const preparando = cp.gerandoId === item.id || visao.emGeracao === item.id;
  const erro = cp.erros[item.id];
  const aberta =
    cp.aberto === item.id &&
    gerado !== undefined &&
    (item.estado === "pronto" || item.estado === "feito");
  const avisoParcial =
    gerado !== undefined
      ? fraseCheckpointParcial(gerado.exercicios.length, gerado.pedido)
      : null;
  const avisoIgnorados =
    gerado !== undefined ? fraseCheckpointIgnorados(gerado.ignorados) : null;
  return (
    <>
      <div className="checkpoint-corpo">
        <strong>
          Checkpoint · a {item.diasAntes} dias da prova ·{" "}
          {rotuloEstadoCheckpoint(item.estado)}
        </strong>
        <span className="app-meta">Cobre: {cobre(item, gerado)}</span>
        {preparando && (
          <span className="app-meta" role="status" aria-live="polite">
            {rotuloPreparandoCheckpoint()}
          </span>
        )}
        {item.estado === "futuro" && (
          <span className="app-meta">Disponível em {ddmm(item.data)}</span>
        )}
        {item.estado === "indisponivel" && (
          <span className="app-meta">{MENSAGEM_CHECKPOINT_INDISPONIVEL}</span>
        )}
        {erro !== undefined && (
          <span className="agenda-erro" role="alert">
            {erro}
          </span>
        )}
      </div>
      <div className="plano-acoes">
        {(item.estado === "devido" || item.estado === "atrasado") && (
          <BotaoGerarCheckpoint cp={cp} item={item} rotulo="Gerar lista" />
        )}
        {item.estado === "pronto" && (
          <>
            <button
              type="button"
              onClick={() => cp.setAberto(aberta ? null : item.id)}
            >
              {aberta ? "Fechar lista" : "Abrir lista"}
            </button>
            <BotaoGerarCheckpoint cp={cp} item={item} rotulo="Gerar outra lista" />
          </>
        )}
        {item.estado === "feito" && (
          <button
            type="button"
            onClick={() => cp.setAberto(aberta ? null : item.id)}
          >
            {aberta ? "Fechar lista" : "Abrir lista"}
          </button>
        )}
      </div>
      {aberta && gerado !== undefined && (
        <div className="checkpoint-lista-aberta">
          {avisoParcial !== null && (
            <p className="app-meta" role="status">
              {avisoParcial}
            </p>
          )}
          {avisoIgnorados !== null && <p className="app-meta">{avisoIgnorados}</p>}
          <ListaExercicios
            key={`${item.id}:${gerado.geradoEm}`}
            exercicios={gerado.exercicios}
          />
          {item.estado === "pronto" && (
            <div className="plano-acoes">
              <button
                type="button"
                onClick={() => void cp.concluir(item.id)}
                disabled={cp.concluindo !== null}
              >
                {cp.concluindo === item.id ? "Salvando…" : "Marcar como concluída"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
