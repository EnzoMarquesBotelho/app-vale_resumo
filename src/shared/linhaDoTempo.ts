/**
 * Linha do tempo única da prova: estudo + revisão + checkpoint por data.
 * Visão DERIVADA (nunca persistida). Lógica PURA: não muta entradas, não lê o
 * relógio, nunca lança. Fusão revisão×checkpoint só na MESMA data.
 */
import type { CheckpointVisao } from "./checkpoints";
import type { BlocoEstudo, PlanoCalculado } from "./plano";
import type { SessaoRevisao } from "./types";

export type TipoItemLinha = "estudo" | "revisao" | "checkpoint";
export type SituacaoItem = "passado" | "hoje" | "futuro";

interface ItemBase {
  /**
   * `e:<data>`, `r:<sessao.id>`, `c:<checkpoint.id>`. Determinística por
   * render; NÃO estável entre salvamentos (ids de sessão são posicionais). Só
   * serve de `key` do React; não indexar estado de UI por ela.
   */
  chave: string;
  data: string;
  situacao: SituacaoItem;
}
export interface ItemEstudo extends ItemBase {
  tipo: "estudo";
  blocos: BlocoEstudo[];
  minutosTotal: number;
}
export interface ItemRevisao extends ItemBase {
  tipo: "revisao";
  sessao: SessaoRevisao;
}
export interface ItemCheckpoint extends ItemBase {
  tipo: "checkpoint";
  checkpoint: CheckpointVisao;
  /** Sessões persistidas na MESMA data (fusão). Ordem de entrada. */
  revisoes: SessaoRevisao[];
}
export type ItemLinha = ItemEstudo | ItemRevisao | ItemCheckpoint;

export interface EntradaLinhaDoTempo {
  sessoes: readonly SessaoRevisao[];
  plano: PlanoCalculado | undefined;
  checkpoints: readonly CheckpointVisao[] | undefined;
  hoje: string;
}

const RANK: Record<TipoItemLinha, number> = {
  checkpoint: 0,
  revisao: 1,
  estudo: 2,
};

function situacaoDe(data: string, hoje: string): SituacaoItem {
  if (data < hoje) return "passado";
  if (data === hoje) return "hoje";
  return "futuro";
}

export function montarLinhaDoTempo(e: EntradaLinhaDoTempo): ItemLinha[] {
  const itens: ItemLinha[] = [];

  // Cada sessão funde em no máximo UM checkpoint (o primeiro da data), para
  // nunca duplicar uma sessão se dois checkpoints caírem no mesmo dia.
  const datasUsadas = new Set<string>();
  for (const cp of e.checkpoints ?? []) {
    const revisoes = datasUsadas.has(cp.data)
      ? []
      : e.sessoes.filter((s) => s.data === cp.data);
    datasUsadas.add(cp.data);
    itens.push({
      tipo: "checkpoint",
      chave: `c:${cp.id}`,
      data: cp.data,
      situacao: situacaoDe(cp.data, e.hoje),
      checkpoint: cp,
      revisoes,
    });
  }

  // Sessões na data de algum checkpoint já foram fundidas acima.
  const datasCp = new Set((e.checkpoints ?? []).map((cp) => cp.data));
  for (const s of e.sessoes) {
    if (datasCp.has(s.data)) continue;
    itens.push({
      tipo: "revisao",
      chave: `r:${s.id}`,
      data: s.data,
      situacao: situacaoDe(s.data, e.hoje),
      sessao: s,
    });
  }

  for (const dia of e.plano?.dias ?? []) {
    if (dia.blocos.length === 0) continue;
    itens.push({
      tipo: "estudo",
      chave: `e:${dia.data}`,
      data: dia.data,
      situacao: situacaoDe(dia.data, e.hoje),
      blocos: dia.blocos,
      minutosTotal: dia.blocos.reduce((soma, b) => soma + b.minutos, 0),
    });
  }

  // Array.prototype.sort é estável: empates mantêm a ordem de entrada.
  return itens.sort((a, b) =>
    a.data < b.data
      ? -1
      : a.data > b.data
        ? 1
        : RANK[a.tipo] - RANK[b.tipo],
  );
}
