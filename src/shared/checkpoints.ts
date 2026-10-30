/**
 * Lógica PURA dos checkpoints pré-prova (fatia 4 do plano de estudo guiado).
 *
 * Decide QUANDO caem os checkpoints, QUAIS assuntos cada um cobre e em QUE
 * ESTADO cada um está. Sem Node/Electron/disco/IA e sem relógio: `hoje` e
 * `dataBase` entram sempre por parâmetro. A IA só gera os exercícios (no main).
 *
 * Datas inválidas fazem `diaParaNumero` lançar `Error` (contrato de
 * `agenda.ts`); o main só passa datas já validadas.
 */

import { diaParaNumero, diferencaDias, numeroParaDia } from "./agenda";
import {
  CHECKPOINT_DIAS_ANTES,
  CHECKPOINT_TOPICOS_MAX,
} from "./constants";
import {
  assinaturaPlano,
  ehTopicoManual,
  juntarTitulos,
  selecionarTopicosDiagnostico,
} from "./diagnostico";
import type { PlanoCalculado } from "./plano";
import type {
  CheckpointsPlano,
  OrdinalProva,
  PreferenciaCheckpoint,
  TopicoCheckpointIgnorado,
  TopicoPlano,
} from "./types";

// --- Tipos -------------------------------------------------------------------

export type EstadoCheckpoint =
  | "futuro"
  | "devido"
  | "atrasado"
  | "pronto"
  | "feito"
  | "indisponivel";

export type EstadoBlocoCheckpoints = "nenhum" | "atual" | "desatualizado";

export type MotivoSemCheckpoints =
  | "prova_encerrada"
  | "sem_topicos"
  | "sem_dias"
  | "curto_demais";

export interface TopicoJanela {
  id: string;
  titulo: string;
  manual: boolean;
}

export interface CheckpointPlanejado {
  /** "d14". */
  id: string;
  diasAntes: number;
  /** "YYYY-MM-DD" = dataProva - diasAntes. */
  data: string;
  /** >= 1, ordem cronológica do último bloco. */
  topicos: TopicoJanela[];
}

export interface PlanejamentoCheckpoints {
  checkpoints: CheckpointPlanejado[];
  /** Presente SOMENTE se `checkpoints` é vazio. */
  motivoVazio?: MotivoSemCheckpoints;
}

export interface CheckpointVisao extends CheckpointPlanejado {
  estado: EstadoCheckpoint;
}

/** O que o IPC `calcularCheckpoints` devolve ao renderer. */
export interface VisaoCheckpoints {
  hoje: string;
  /** Dias até a prova (negativo = já passou). */
  diasRestantes: number;
  preferencia: PreferenciaCheckpoint;
  bloco: EstadoBlocoCheckpoints;
  itens: CheckpointVisao[];
  motivoVazio?: MotivoSemCheckpoints;
  /** Checkpoint sendo gerado AGORA no main, se houver. */
  emGeracao?: string;
}

type PlanoParaAssinar = { ordinal: OrdinalProva; topicos: TopicoPlano[] };

// --- Planejamento ------------------------------------------------------------

function vazio(motivo: MotivoSemCheckpoints): PlanejamentoCheckpoints {
  return { checkpoints: [], motivoVazio: motivo };
}

/**
 * Planeja os pontos (a 28/14/7/3 dias da prova) e os assuntos de cada janela
 * `(dataAnterior, data]` sobre o plano de referência. Total e determinística.
 */
export function planejarCheckpoints(p: {
  planoReferencia: PlanoCalculado;
  dataProva: string;
  dataBase: string;
  hoje: string;
}): PlanejamentoCheckpoints {
  const numProva = diaParaNumero(p.dataProva);
  const numBase = diaParaNumero(p.dataBase); // valida o formato (lança)

  if (diferencaDias(p.dataProva, p.hoje) <= 0) return vazio("prova_encerrada");

  const aviso = p.planoReferencia.aviso;
  if (aviso?.tipo === "sem_topicos") return vazio("sem_topicos");
  if (aviso?.tipo === "sem_dias" || aviso?.tipo === "prova_passou") {
    return vazio("sem_dias");
  }
  if (p.planoReferencia.dias.length === 0) return vazio("sem_dias");

  // Pontos válidos: estritamente depois da dataBase (e antes da prova).
  const pontos: Array<{ diasAntes: number; num: number }> = [];
  for (const d of CHECKPOINT_DIAS_ANTES) {
    const num = numProva - d;
    if (num - numBase >= 1 && num < numProva) pontos.push({ diasAntes: d, num });
  }

  // Último bloco de cada tópico: (data, ordem de aparição).
  const ultimo = new Map<
    string,
    { titulo: string; num: number; ordem: number }
  >();
  let ordem = 0;
  for (const dia of p.planoReferencia.dias) {
    const num = diaParaNumero(dia.data);
    for (const b of dia.blocos) {
      ultimo.set(b.topicoId, { titulo: b.titulo, num, ordem: ordem++ });
    }
  }

  const checkpoints: CheckpointPlanejado[] = [];
  let anterior = Number.NEGATIVE_INFINITY;
  for (const ponto of pontos) {
    const naJanela = [...ultimo.entries()]
      .filter(([, u]) => u.num > anterior && u.num <= ponto.num)
      .sort((a, b) => a[1].num - b[1].num || a[1].ordem - b[1].ordem);
    anterior = ponto.num;
    if (naJanela.length === 0) continue;
    checkpoints.push({
      id: `d${ponto.diasAntes}`,
      diasAntes: ponto.diasAntes,
      data: numeroParaDia(ponto.num),
      topicos: naJanela.map(([id, u]) => ({
        id,
        titulo: u.titulo,
        manual: ehTopicoManual(id),
      })),
    });
  }

  return checkpoints.length === 0 ? vazio("curto_demais") : { checkpoints };
}

// --- Estados -----------------------------------------------------------------

/** `nenhum` sem bloco/plano; `desatualizado` se a assinatura mudou; senão `atual`. */
export function estadoBlocoCheckpoints(
  plano: PlanoParaAssinar | undefined,
  bloco: CheckpointsPlano | undefined,
): EstadoBlocoCheckpoints {
  if (bloco === undefined || plano === undefined) return "nenhum";
  return bloco.assinatura === assinaturaPlano(plano) ? "atual" : "desatualizado";
}

/** Resolve o estado de cada ponto planejado (ver tabela de regras do design). */
export function resolverEstadosCheckpoints(p: {
  planejados: CheckpointPlanejado[];
  bloco: CheckpointsPlano | undefined;
  plano: PlanoParaAssinar | undefined;
  hoje: string;
}): { bloco: EstadoBlocoCheckpoints; itens: CheckpointVisao[] } {
  const estadoBloco = estadoBlocoCheckpoints(p.plano, p.bloco);
  const gerados = new Map(
    (estadoBloco === "atual" && p.bloco !== undefined ? p.bloco.itens : []).map(
      (i) => [i.id, i] as const,
    ),
  );
  const itens = p.planejados.map((c): CheckpointVisao => {
    const gerado = gerados.get(c.id);
    let estado: EstadoCheckpoint;
    if (gerado !== undefined && gerado.concluidoEm !== undefined) {
      estado = "feito";
    } else if (gerado !== undefined) {
      estado = "pronto";
    } else if (!c.topicos.some((t) => !t.manual)) {
      estado = "indisponivel";
    } else {
      const dif = diferencaDias(c.data, p.hoje);
      estado = dif > 0 ? "futuro" : dif === 0 ? "devido" : "atrasado";
    }
    return { ...c, estado };
  });
  return { bloco: estadoBloco, itens };
}

// --- Modo automático -----------------------------------------------------------

/**
 * Escolhe o checkpoint a gerar sozinho: o candidato é o de maior data `<= hoje`
 * entre os não `indisponivel` (tenha ou não lista); só devolve o id se ele está
 * `devido`/`atrasado`. Nunca cai para um item mais antigo.
 */
export function escolherCheckpointAutomatico(p: {
  itens: CheckpointVisao[];
  hoje: string;
  preferencia: PreferenciaCheckpoint;
  bloco: EstadoBlocoCheckpoints;
  emGeracao: string | undefined;
  tentados: ReadonlySet<string>;
}): string | undefined {
  if (p.preferencia !== "automatico") return undefined;
  if (p.bloco === "desatualizado") return undefined;
  if (p.emGeracao !== undefined) return undefined;

  let candidato: CheckpointVisao | undefined;
  for (const i of p.itens) {
    if (i.estado === "indisponivel") continue;
    if (diferencaDias(i.data, p.hoje) > 0) continue;
    if (candidato === undefined || i.data > candidato.data) candidato = i;
  }
  if (candidato === undefined) return undefined;
  if (candidato.estado !== "devido" && candidato.estado !== "atrasado") {
    return undefined;
  }
  return p.tentados.has(candidato.id) ? undefined : candidato.id;
}

/** Ids de checkpoint (sem prefixo) já tentados para a prova `provaId`. */
export function tentadosDaProva(
  global: ReadonlySet<string>,
  provaId: string,
): Set<string> {
  const prefixo = `${provaId}:`;
  const saida = new Set<string>();
  for (const chave of global) {
    if (chave.startsWith(prefixo)) saida.add(chave.slice(prefixo.length));
  }
  return saida;
}

// --- Texto-base ----------------------------------------------------------------

export interface PlanoTextoCheckpoint {
  selecionados: TopicoJanela[];
  ignorados: TopicoCheckpointIgnorado[];
  indisponivel: boolean;
}

/** Separa manual / sem texto / fora da amostra e escolhe até 6 assuntos. */
export function planejarTextoCheckpoint(
  topicos: TopicoJanela[],
  comTexto: ReadonlySet<string>,
): PlanoTextoCheckpoint {
  const elegiveis = topicos.filter((t) => !t.manual && comTexto.has(t.id));
  const selecionados = selecionarTopicosDiagnostico(
    elegiveis,
    CHECKPOINT_TOPICOS_MAX,
  );
  const escolhidos = new Set(selecionados.map((t) => t.id));
  const ignorados: TopicoCheckpointIgnorado[] = [];
  for (const t of topicos) {
    if (t.manual) {
      ignorados.push({ id: t.id, titulo: t.titulo, motivo: "manual" });
    } else if (!comTexto.has(t.id)) {
      ignorados.push({ id: t.id, titulo: t.titulo, motivo: "sem_texto" });
    } else if (!escolhidos.has(t.id)) {
      ignorados.push({ id: t.id, titulo: t.titulo, motivo: "fora_da_amostra" });
    }
  }
  return { selecionados, ignorados, indisponivel: selecionados.length === 0 };
}

/**
 * Monta o texto-base em seções `## Título` com orçamento igual por seção.
 * Invariante: `length <= max`. Seção sem trecho é omitida; `[]` ⇒ `""`.
 */
export function montarTextoBaseCheckpoint(
  secoes: Array<{ titulo: string; texto: string }>,
  max: number,
): string {
  const n = secoes.length;
  if (n === 0 || max <= 0) return "";
  const orcamento = Math.floor((max - 2 * (n - 1)) / n);
  const partes: string[] = [];
  for (const s of secoes) {
    const cabecalho = `## ${s.titulo.trim()}\n`;
    const trecho = s.texto
      .trim()
      .slice(0, Math.max(0, orcamento - cabecalho.length));
    if (trecho.length === 0) continue;
    partes.push(cabecalho + trecho);
  }
  return partes.join("\n\n").slice(0, max);
}

// --- Textos para a UI (pt-BR) -----------------------------------------------------

/** Ausente ou inválido ⇒ "lembrete". */
export function preferenciaEfetiva(
  plano: { checkpoint?: unknown } | undefined,
): PreferenciaCheckpoint {
  return plano?.checkpoint === "automatico" ? "automatico" : "lembrete";
}

/** Frase do lembrete; `""` se o ponto só tem assuntos digitados à mão. */
export function fraseLembreteCheckpoint(
  item: Pick<CheckpointPlanejado, "topicos">,
  diasRestantes: number,
): string {
  const titulos = item.topicos
    .filter((t) => !t.manual)
    .map((t) => t.titulo.trim())
    .filter((t) => t.length > 0);
  if (titulos.length === 0) return "";
  const quando =
    diasRestantes === 1 ? "Falta 1 dia" : `Faltam ${diasRestantes} dias`;
  return `${quando} para a prova. Que tal uma lista de exercícios sobre ${juntarTitulos(titulos)}?`;
}

export function rotuloEstadoCheckpoint(estado: EstadoCheckpoint): string {
  switch (estado) {
    case "futuro":
      return "Em breve";
    case "devido":
      return "Hoje";
    case "atrasado":
      return "Atrasado";
    case "pronto":
      return "Lista pronta";
    case "feito":
      return "Concluído";
    case "indisponivel":
    default:
      return "Sem material";
  }
}

/** Aviso de lista menor que o previsto; `null` se veio tudo. */
export function fraseCheckpointParcial(
  entregue: number,
  pedido: number,
): string | null {
  if (entregue >= pedido) return null;
  return (
    `Montei ${entregue} de ${pedido} exercícios. A lista vale, mas é menor ` +
    "que o previsto. Você pode gerar outra."
  );
}

/** Aviso dos assuntos que ficaram de fora; `null` se nenhum. */
export function fraseCheckpointIgnorados(
  ig: TopicoCheckpointIgnorado[],
): string | null {
  if (ig.length === 0) return null;
  const nomear = (t: TopicoCheckpointIgnorado): string =>
    t.titulo.trim().length === 0 ? "(sem título)" : t.titulo.trim();
  const semMaterial = ig
    .filter((t) => t.motivo === "manual" || t.motivo === "sem_texto")
    .map(nomear);
  const foraAmostra = ig
    .filter((t) => t.motivo === "fora_da_amostra")
    .map(nomear);
  const partes: string[] = [];
  if (semMaterial.length > 0) {
    partes.push(
      `Ficaram de fora, por não terem material importado: ${juntarTitulos(semMaterial)}.`,
    );
  }
  if (foraAmostra.length > 0) {
    partes.push(
      `Ficaram de fora desta lista (limite de assuntos): ${juntarTitulos(foraAmostra)}.`,
    );
  }
  return partes.length === 0 ? null : partes.join(" ");
}

/** Rótulo estável (sem contagem) enquanto a lista é preparada. */
export function rotuloPreparandoCheckpoint(): string {
  return "Preparando a lista de exercícios… isso pode levar alguns minutos.";
}

export function fraseSemCheckpoints(motivo: MotivoSemCheckpoints): string | null {
  return motivo === "curto_demais"
    ? "O plano é curto demais para ter checkpoints."
    : null;
}

/** Mensagem de "sem material" (mesma no main e na UI). */
export const MENSAGEM_CHECKPOINT_INDISPONIVEL =
  "Esta lista precisa de ao menos um assunto com material importado. " +
  "Os assuntos digitados à mão não têm texto para eu criar exercícios.";
