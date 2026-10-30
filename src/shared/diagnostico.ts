/**
 * Lógica PURA do diagnóstico do plano de estudo (fatia 3).
 *
 * A IA só GERA as perguntas (múltipla escolha). Tudo aqui é mecânico e
 * determinístico: escolher os tópicos, corrigir, classificar (lacuna na base vs
 * dificuldade no conteúdo novo), decidir se o diagnóstico vale para o plano e
 * montar os textos da UI. Sem Node/Electron/disco/IA: importa só `./constants`,
 * `./quizScore` e TIPOS de `./plano`/`./types`/`./geracaoLotes`.
 */

import {
  DIAG_AMOSTRA_REFERENCIA,
  DIAG_TOPICOS_POR_CAMADA,
  LIMIAR_ACERTO_DEN,
  LIMIAR_ACERTO_DIAGNOSTICO,
  LIMIAR_ACERTO_NUM,
  MIN_RESPOSTAS_CAMADA,
} from "./constants";
import type { ProgressoGeracao } from "./geracaoLotes";
import type { AjusteDiagnostico } from "./plano";
import { calcularPontuacao } from "./quizScore";
import type {
  CamadaDiagnostico,
  DiagnosticoPlano,
  OrdinalProva,
  PerguntaDiagnostico,
  TopicoIgnorado,
  TopicoPlano,
} from "./types";

// --- Tipos -------------------------------------------------------------------

export type VereditoDiagnostico =
  | "lacuna_base"
  | "dificuldade_novo"
  | "sem_dificuldade"
  | "inconclusivo";

export interface RespostaDiagnostico {
  topicoId: string;
  camada: CamadaDiagnostico;
  acertou: boolean;
}

export interface ResumoCamada {
  acertos: number;
  total: number;
  /** acertos/total; 0 quando total=0. */
  taxa: number;
  /** total >= MIN_RESPOSTAS_CAMADA. */
  medida: boolean;
}

export interface ResultadoDiagnostico {
  veredito: VereditoDiagnostico;
  base: ResumoCamada;
  novo: ResumoCamada;
  /** 0 salvo em lacuna_base/dificuldade_novo; em [0,1]. */
  intensidade: number;
  /** Ids de tópicos fracos da camada decisiva (ordem da 1ª aparição). */
  topicosFracos: string[];
}

export type EstadoDiagnostico =
  | "nenhum"
  | "pendente"
  | "concluido"
  | "desatualizado";

export interface PlanoDiagnostico {
  base: TopicoPlano[];
  novo: TopicoPlano[];
  ignorados: TopicoIgnorado[];
  /** `true` quando não há nenhum tópico de base elegível. */
  indisponivel: boolean;
}

// --- Contratos pequenos --------------------------------------------------------

/** `true` para tópico digitado à mão (id com prefixo `manual:`). */
export function ehTopicoManual(id: string): boolean {
  return id.startsWith("manual:");
}

/**
 * Assinatura do conjunto de perguntas possíveis do plano: ordinal + pares
 * `[id, novo]` dos tópicos NÃO manuais, ordenados por code unit. Independe da
 * ordem dos tópicos e de horas/dias/dificuldade.
 */
export function assinaturaPlano(p: {
  ordinal: OrdinalProva;
  topicos: TopicoPlano[];
}): string {
  const pares = p.topicos
    .filter((t) => !ehTopicoManual(t.id))
    .map((t): [string, number] => [t.id, t.novo ? 1 : 0])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify([p.ordinal, pares]);
}

/** Amostra espaçada e determinística (inclui o primeiro e o último). */
export function selecionarTopicosDiagnostico<T extends { id: string }>(
  ordenados: T[],
  max: number,
): T[] {
  if (max < 1) return [];
  const n = ordenados.length;
  if (n <= max) return ordenados.slice();
  if (max === 1) return [ordenados[0]];
  const escolhidos: T[] = [];
  for (let i = 0; i < max; i++) {
    escolhidos.push(ordenados[Math.round((i * (n - 1)) / (max - 1))]);
  }
  return escolhidos;
}

/**
 * Escolhe os tópicos do diagnóstico: manual e sem texto ficam de fora (com
 * motivo); os elegíveis são amostrados por camada.
 */
export function planejarDiagnostico(
  ordenados: TopicoPlano[],
  comTexto: ReadonlySet<string>,
): PlanoDiagnostico {
  const ignorados: TopicoIgnorado[] = [];
  const base: TopicoPlano[] = [];
  const novo: TopicoPlano[] = [];
  for (const t of ordenados) {
    if (ehTopicoManual(t.id)) {
      ignorados.push({ id: t.id, titulo: t.titulo, motivo: "manual" });
    } else if (!comTexto.has(t.id)) {
      ignorados.push({ id: t.id, titulo: t.titulo, motivo: "sem_texto" });
    } else if (t.novo) {
      novo.push(t);
    } else {
      base.push(t);
    }
  }
  const baseSel = selecionarTopicosDiagnostico(base, DIAG_TOPICOS_POR_CAMADA);
  return {
    base: baseSel,
    novo: selecionarTopicosDiagnostico(novo, DIAG_TOPICOS_POR_CAMADA),
    ignorados,
    indisponivel: baseSel.length === 0,
  };
}

/** Corrige as perguntas; `-1` ("Não sei"), fora de faixa ou ausente = erro. */
export function pontuarDiagnostico(
  perguntas: PerguntaDiagnostico[],
  escolhas: number[],
): RespostaDiagnostico[] {
  return perguntas.map((p, i) => {
    const e = escolhas[i];
    const escolhidaIndice = typeof e === "number" && e >= 0 ? e : null;
    const acertou =
      calcularPontuacao([p], [{ tipo: "multipla", escolhidaIndice }])
        .acertos === 1;
    return { topicoId: p.topicoId, camada: p.camada, acertou };
  });
}

// --- Classificação -------------------------------------------------------------

/** Abaixo do limiar 3/5, por inteiros (nunca por ponto flutuante). */
function abaixoDoLimiar(c: { acertos: number; total: number }): boolean {
  return c.total > 0 && c.acertos * LIMIAR_ACERTO_DEN < c.total * LIMIAR_ACERTO_NUM;
}

function resumir(acertos: number, total: number): ResumoCamada {
  return {
    acertos,
    total,
    taxa: total > 0 ? acertos / total : 0,
    medida: total >= MIN_RESPOSTAS_CAMADA,
  };
}

/** Intensidade em [0,1]: distância do limiar, encolhida pela amostra. */
function intensidadeDe(c: ResumoCamada): number {
  const L = LIMIAR_ACERTO_DIAGNOSTICO;
  const fator = Math.min(1, c.total / DIAG_AMOSTRA_REFERENCIA);
  const bruta = ((L - c.taxa) / L) * fator;
  return Math.min(1, Math.max(0, bruta));
}

/** Tópicos da camada com desempenho abaixo do limiar (ordem da 1ª aparição). */
function topicosFracosDa(
  respostas: RespostaDiagnostico[],
  camada: CamadaDiagnostico,
): string[] {
  const porTopico = new Map<string, { acertos: number; total: number }>();
  for (const r of respostas) {
    if (r.camada !== camada) continue;
    const atual = porTopico.get(r.topicoId) ?? { acertos: 0, total: 0 };
    atual.total += 1;
    if (r.acertou) atual.acertos += 1;
    porTopico.set(r.topicoId, atual);
  }
  return [...porTopico.entries()]
    .filter(([, c]) => abaixoDoLimiar(c))
    .map(([id]) => id);
}

/** Classifica o desempenho. Total e determinística: nunca lança. */
export function classificarDiagnostico(
  respostas: RespostaDiagnostico[],
): ResultadoDiagnostico {
  const cont = {
    base: { acertos: 0, total: 0 },
    novo: { acertos: 0, total: 0 },
  };
  for (const r of respostas) {
    const c = cont[r.camada];
    if (c === undefined) continue;
    c.total += 1;
    if (r.acertou) c.acertos += 1;
  }
  const base = resumir(cont.base.acertos, cont.base.total);
  const novo = resumir(cont.novo.acertos, cont.novo.total);
  const neutro = (v: VereditoDiagnostico): ResultadoDiagnostico => ({
    veredito: v,
    base,
    novo,
    intensidade: 0,
    topicosFracos: [],
  });

  if (!base.medida) return neutro("inconclusivo");
  if (abaixoDoLimiar(base)) {
    return {
      veredito: "lacuna_base",
      base,
      novo,
      intensidade: intensidadeDe(base),
      topicosFracos: topicosFracosDa(respostas, "base"),
    };
  }
  if (novo.medida && abaixoDoLimiar(novo)) {
    return {
      veredito: "dificuldade_novo",
      base,
      novo,
      intensidade: intensidadeDe(novo),
      topicosFracos: topicosFracosDa(respostas, "novo"),
    };
  }
  return neutro("sem_dificuldade");
}

// --- Estado e aplicabilidade ---------------------------------------------------

type PlanoParaAssinar = { ordinal: OrdinalProva; topicos: TopicoPlano[] };

export function estadoDiagnostico(
  plano: PlanoParaAssinar | undefined,
  d: DiagnosticoPlano | undefined,
): EstadoDiagnostico {
  if (plano === undefined || d === undefined) return "nenhum";
  if (d.assinatura !== assinaturaPlano(plano)) return "desatualizado";
  if (d.respostas === undefined || d.respostas.length !== d.perguntas.length) {
    return "pendente";
  }
  return "concluido";
}

/** `undefined` se pendente (sem respostas completas). */
export function resultadoDoDiagnostico(
  d: DiagnosticoPlano,
): ResultadoDiagnostico | undefined {
  if (d.respostas === undefined || d.respostas.length !== d.perguntas.length) {
    return undefined;
  }
  return classificarDiagnostico(pontuarDiagnostico(d.perguntas, d.respostas));
}

/** O ajuste da régua, só se o diagnóstico está concluído, atual e com efeito. */
export function diagnosticoAplicavel(
  plano: PlanoParaAssinar | undefined,
  d: DiagnosticoPlano | undefined,
): AjusteDiagnostico | undefined {
  if (estadoDiagnostico(plano, d) !== "concluido" || d === undefined) {
    return undefined;
  }
  const r = resultadoDoDiagnostico(d);
  if (r === undefined) return undefined;
  if (
    (r.veredito === "lacuna_base" || r.veredito === "dificuldade_novo") &&
    r.intensidade > 0
  ) {
    return { veredito: r.veredito, intensidade: r.intensidade };
  }
  return undefined;
}

// --- Textos para a UI ----------------------------------------------------------

export interface ContextoFrase {
  /** `plano.topicos.some(t => t.novo)`. */
  novoPlanejado: boolean;
  /** `PlanoCalculado.diagnosticoAplicado !== undefined`. */
  efeitoNoPlano: boolean;
  /** `PlanoCalculado.mistura !== undefined` (a régua chegou a rodar). */
  planoDistribuido: boolean;
}

/** Junta títulos: `A`, `A e B`, `A, B e C`, `A, B, C e mais N`. */
export function juntarTitulos(titulos: string[]): string {
  const n = titulos.length;
  if (n === 1) return titulos[0];
  if (n === 2) return `${titulos[0]} e ${titulos[1]}`;
  if (n === 3) return `${titulos[0]}, ${titulos[1]} e ${titulos[2]}`;
  return `${titulos[0]}, ${titulos[1]}, ${titulos[2]} e mais ${n - 3}`;
}

function clausulaFracos(
  fracos: string[],
  titulos: ReadonlyMap<string, string>,
): string {
  const lista = fracos
    .map((id) => titulos.get(id))
    .filter((t): t is string => t !== undefined && t.trim().length > 0);
  return lista.length === 0
    ? ""
    : `; os pontos mais fracos: ${juntarTitulos(lista)}`;
}

export function fraseResultadoDiagnostico(
  r: ResultadoDiagnostico,
  titulos: ReadonlyMap<string, string>,
  ctx: ContextoFrase,
): string {
  const semDias = !ctx.efeitoNoPlano && !ctx.planoDistribuido;
  const semDiasFrase = " Ainda não há dias de estudo no plano para ajustar.";
  switch (r.veredito) {
    case "lacuna_base": {
      const inicio =
        `Sua dificuldade parece estar na base. Você acertou ${r.base.acertos} ` +
        `de ${r.base.total} perguntas dos conteúdos anteriores` +
        `${clausulaFracos(r.topicosFracos, titulos)}.`;
      if (semDias) return inicio + semDiasFrase;
      if (ctx.efeitoNoPlano) {
        return `${inicio} Por isso o plano dá mais tempo à base antes do conteúdo novo.`;
      }
      return ctx.novoPlanejado
        ? `${inicio} O plano já dá o máximo de foco à base que a distância da prova permite.`
        : `${inicio} Como todo o conteúdo do plano é base, não há conteúdo novo para reequilibrar.`;
    }
    case "dificuldade_novo": {
      const inicio =
        `A base está firme (${r.base.acertos} de ${r.base.total}). ` +
        `A dificuldade parece estar no conteúdo novo ` +
        `(${r.novo.acertos} de ${r.novo.total})` +
        `${clausulaFracos(r.topicosFracos, titulos)}.`;
      if (semDias) return inicio + semDiasFrase;
      return ctx.efeitoNoPlano
        ? `${inicio} O plano reservou mais tempo para ele.`
        : `${inicio} O plano já dá o máximo de foco possível ao conteúdo novo.`;
    }
    case "sem_dificuldade":
      return (
        "Você foi bem nas perguntas. O plano continua como estava." +
        (ctx.novoPlanejado && !r.novo.medida
          ? " Não deu para medir o conteúdo novo."
          : "")
      );
    case "inconclusivo":
    default:
      return (
        "Não deu para tirar uma conclusão (poucas perguntas sobre a base). " +
        "O plano continua como estava."
      );
  }
}

/** Aviso de geração parcial; `null` se veio tudo (ou nada foi pedido). */
export function fraseDiagnosticoParcial(
  entregue: number,
  pedido: number,
): string | null {
  if (pedido <= 0 || entregue >= pedido) return null;
  return (
    `Montei ${entregue} de ${pedido} perguntas. O resultado vale, mas é ` +
    "menos preciso. Você pode refazer o diagnóstico depois."
  );
}

/** Aviso dos tópicos que ficaram de fora; `null` se nenhum. */
export function fraseTopicosIgnorados(ig: TopicoIgnorado[]): string | null {
  if (ig.length === 0) return null;
  const nomear = (t: TopicoIgnorado): string =>
    t.titulo.trim().length === 0 ? "(sem título)" : t.titulo;
  const semMaterial = ig
    .filter((t) => t.motivo === "manual" || t.motivo === "sem_texto")
    .map(nomear);
  const naoGerou = ig.filter((t) => t.motivo === "nao_gerou").map(nomear);
  const partes: string[] = [];
  if (semMaterial.length > 0) {
    partes.push(
      `Ficaram de fora, por não terem material importado: ${juntarTitulos(semMaterial)}.`,
    );
  }
  if (naoGerou.length > 0) {
    partes.push(
      `Não consegui montar perguntas sobre: ${juntarTitulos(naoGerou)}.`,
    );
  }
  return partes.length === 0 ? null : partes.join(" ");
}

/** Rótulo do progresso (prontos/total contam TÓPICOS, não perguntas). */
export function rotuloProgressoDiagnostico(p: ProgressoGeracao): string {
  return p.total > 0
    ? `Preparando as perguntas: assunto ${p.prontos} de ${p.total}…`
    : "Preparando as perguntas…";
}
