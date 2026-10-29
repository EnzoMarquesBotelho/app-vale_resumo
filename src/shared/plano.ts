/**
 * Lógica PURA do plano de estudo guiado: a régua base/novo (proporção de
 * esforço) e a distribuição dos tópicos pelos dias disponíveis.
 *
 * Sem Node/Electron/disco/IA (padrão de `agenda.ts`/`cronologia.ts`): só
 * aritmética total e determinística sobre o que recebe. Recebe `diasRestantes`
 * e `datasDisponiveis` por parâmetro — NUNCA lê o relógio nem reaplica
 * `diasPorSemana`. Todo empate termina em `id.localeCompare`. Importa apenas
 * constantes (`./constants`) e tipos (`import type ./types`).
 */

import {
  HORIZONTE_DIAS,
  MINUTOS_BLOCO_MIN,
  PESO_DIFICULDADE,
  PISO_BASE,
  TETO_BASE,
} from "./constants";
import type { OrdinalProva } from "./types";

// --- Régua base/novo (§6) --------------------------------------------------

/** Entrada da régua base/novo (tudo já saneado pelo chamador). */
export interface MisturaBaseNovoParams {
  /** Dias de hoje até a prova (0 = hoje; negativo = já passou). */
  diasRestantes: number;
  /** Quantos tópicos de BASE existem (>= 0). */
  totalBase: number;
  /** Quantos tópicos NOVOS existem (>= 0). */
  totalNovo: number;
  /**
   * Peso médio de dificuldade da BASE, em [0,1] (0 = tudo fácil, 1 = tudo
   * difícil). Derivado pelo chamador via `nivelParaPeso`. Base vazia → 0.
   */
  dificuldadeBase: number;
}

/** Saída: proporção de ESFORÇO (tempo/dias) dedicada a base vs novo. */
export interface MisturaBaseNovo {
  /** Fração do esforço para a base, em [0,1]. */
  fracaoBase: number;
  /** Fração do esforço para o novo, em [0,1]. `fracaoBase + fracaoNovo === 1`. */
  fracaoNovo: number;
}

/** Limita `x` ao intervalo [min, max]. */
function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/** Arredonda a 4 casas decimais (estabiliza a soma exata da mistura). */
function arredondar4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/**
 * Régua base/novo: proporção CONTÍNUA e determinística de esforço entre base e
 * novo, função monótona do tempo restante e da dificuldade da base (§6.2).
 *
 * Degenerações por ausência de um lado são checadas PRIMEIRO. Fora delas,
 * `fracaoBase ∈ [PISO_BASE, TETO_BASE]` — o novo nunca zera e a base nunca toma
 * tudo (prova longe → foco pesado, não total, na base; prova hoje → alguns
 * toques na base). `fracaoNovo` é derivado (`1 - fracaoBase`), nunca arredondado
 * de forma independente, garantindo soma exata.
 */
export function calcularMisturaBaseNovo(
  p: MisturaBaseNovoParams,
): MisturaBaseNovo {
  // Passo 0 — degenerações por ausência de um lado (encerram a função).
  if (p.totalBase === 0 && p.totalNovo === 0) {
    return { fracaoBase: 0, fracaoNovo: 0 };
  }
  if (p.totalNovo === 0) {
    return { fracaoBase: 1, fracaoNovo: 0 };
  }
  if (p.totalBase === 0) {
    return { fracaoBase: 0, fracaoNovo: 1 };
  }

  // Passo 1 — proximidade normalizada: 0 = prova distante, 1 = prova hoje.
  const prox = 1 - clamp(p.diasRestantes, 0, HORIZONTE_DIAS) / HORIZONTE_DIAS;

  // Passo 2 — base bruta pela proximidade, ENTRE piso e teto.
  const baseBruta = PISO_BASE + (TETO_BASE - PISO_BASE) * (1 - prox);

  // Passo 3 — ajuste por dificuldade da base (fecha parte da folga até o teto).
  const dificuldade = clamp(p.dificuldadeBase, 0, 1);
  const baseAjustada =
    baseBruta + PESO_DIFICULDADE * dificuldade * (TETO_BASE - baseBruta);

  // Passo 4 — resultado (novo derivado para soma exata).
  const fracaoBase = arredondar4(baseAjustada);
  return { fracaoBase, fracaoNovo: arredondar4(1 - fracaoBase) };
}

// --- Distribuição por dias (§7) -------------------------------------------

/** Um tópico já pronto para distribuir (ordenado base→novo pelo chamador). */
export interface TopicoDistribuivel {
  id: string;
  titulo: string;
  novo: boolean;
  /** Peso de dificuldade em [0,1] (facil=0, media=0.5, dificil=1). */
  dificuldade: number;
}

export interface CalcularPlanoParams {
  /** Tópicos já ordenados base→novo pelo chamador (via cronologia.ts). */
  topicos: TopicoDistribuivel[];
  /**
   * Datas de estudo "YYYY-MM-DD" JÁ FILTRADAS por dias úteis, crescentes, de
   * amanhã até a véspera da prova. O serviço main as monta; o puro NÃO reaplica
   * `diasPorSemana`. Vazio → aviso `sem_dias`.
   */
  datasDisponiveis: string[];
  /** Horas de estudo por dia (saneado 1–24). Capacidade de cada dia. */
  horasPorDia: number;
  /** Dias de hoje até a prova (tempo de CALENDÁRIO), para a régua. */
  diasRestantes: number;
  /** Ordinal (define, com `topicos[].novo`, a partição base/novo). */
  ordinal: OrdinalProva;
}

/** Um bloco de estudo de um tópico, em um dia. */
export interface BlocoEstudo {
  topicoId: string;
  titulo: string;
  novo: boolean;
  /** Minutos sugeridos para o bloco (inteiro >= MINUTOS_BLOCO_MIN). */
  minutos: number;
}

/** Um dia do plano: a data e os blocos de estudo daquele dia. */
export interface DiaPlano {
  /** Data "YYYY-MM-DD". */
  data: string;
  /** Blocos do dia, em ordem (base antes de novo; depois por prioridade). */
  blocos: BlocoEstudo[];
}

export type AvisoPlano =
  | { tipo: "prova_passou" }
  | { tipo: "sem_topicos" }
  | { tipo: "sem_dias" }
  | { tipo: "nao_cabe"; topicosForaDoPlano: number };

export interface PlanoCalculado {
  /** Dias de estudo, do mais próximo de hoje até a véspera da prova. */
  dias: DiaPlano[];
  /**
   * Mistura base/novo usada (da régua). Presente SOMENTE quando há um plano de
   * verdade (`aviso` ausente OU `aviso.tipo === "nao_cabe"`); omitida em
   * `prova_passou`/`sem_topicos`/`sem_dias` (§7.1.1).
   */
  mistura?: MisturaBaseNovo;
  /** Aviso honesto; ausente = tudo coube e há o que planejar. */
  aviso?: AvisoPlano;
}

/** Estado interno de um tópico durante a distribuição. */
interface TopicoCamada {
  topico: TopicoDistribuivel;
  /** Peso dentro da camada (1 + dificuldade). */
  peso: number;
  /** Alvo fracionário de minutos (antes de arredondar). */
  alvo: number;
  /** Minutos inteiros finais do tópico (após largest-remainder). */
  minutos: number;
  /** Prioridade `(1 + dificuldade) * fracaoDaCamada`. */
  prioridade: number;
}

/**
 * Converte os `alvo` fracionários da camada em inteiros cuja soma é EXATAMENTE
 * `orcamento` (método do maior resto — largest-remainder). Empate do resíduo:
 * maior prioridade, depois `id.localeCompare`. Não garante o piso de 15 (isso é
 * reconciliado por quem chama); garante só a soma exata.
 */
function distribuirLargestRemainder(
  itens: TopicoCamada[],
  orcamento: number,
): void {
  if (itens.length === 0) return;
  let somaPisos = 0;
  for (const it of itens) {
    it.minutos = Math.floor(it.alvo);
    somaPisos += it.minutos;
  }
  let resto = orcamento - somaPisos;
  // Ordena por parte fracionária desc, depois prioridade desc, depois id.
  const porResiduo = itens.slice().sort((a, b) => {
    const fa = a.alvo - Math.floor(a.alvo);
    const fb = b.alvo - Math.floor(b.alvo);
    if (fb !== fa) return fb - fa;
    if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade;
    return a.topico.id.localeCompare(b.topico.id);
  });
  for (let i = 0; i < porResiduo.length && resto > 0; i++) {
    porResiduo[i].minutos += 1;
    resto -= 1;
  }
}

/**
 * Resolve uma camada (base ou novo): a partir dos tópicos e do orçamento de
 * minutos, remove (adia) os que não cabem com qualidade (alvo < 15) do menor
 * prioridade para cima, repartindo o orçamento por peso, e devolve os tópicos
 * que ficaram com `minutos >= 15` (soma exata = orçamento efetivo repartido
 * entre eles) mais quantos foram removidos.
 */
function resolverCamada(
  topicos: TopicoDistribuivel[],
  orcamento: number,
  fracaoDaCamada: number,
): { mantidos: TopicoCamada[]; removidos: number } {
  // Estado inicial de todos os tópicos da camada.
  let itens: TopicoCamada[] = topicos.map((topico) => {
    const peso = 1 + topico.dificuldade;
    return {
      topico,
      peso,
      alvo: 0,
      minutos: 0,
      prioridade: peso * fracaoDaCamada,
    };
  });
  let removidos = 0;

  // Laço de reconciliação: reparte por peso; remove os com alvo < 15 (menor
  // prioridade primeiro); re-verifica o piso após o largest-remainder. Cada
  // volta remove >= 1 tópico e nunca o reintroduz → termina em <= nº de tópicos.
  for (;;) {
    if (itens.length === 0) {
      return { mantidos: [], removidos };
    }
    const somaPesos = itens.reduce((s, it) => s + it.peso, 0);
    for (const it of itens) {
      it.alvo = (orcamento * it.peso) / somaPesos;
    }

    // Passo 4 — algum alvo < 15? Remove o de MENOR prioridade e repete.
    const abaixo = itens.filter((it) => it.alvo < MINUTOS_BLOCO_MIN);
    if (abaixo.length > 0) {
      const alvoRemover = menorPrioridade(itens);
      itens = itens.filter((it) => it !== alvoRemover);
      removidos += 1;
      continue;
    }

    // Passo 5 — inteiros com soma exata = orçamento (largest-remainder).
    distribuirLargestRemainder(itens, orcamento);

    // Re-verifica o piso: floor pode derrubar um alvo em [15,16) para 14.
    const abaixoInteiro = itens.filter((it) => it.minutos < MINUTOS_BLOCO_MIN);
    if (abaixoInteiro.length > 0) {
      const alvoRemover = menorPrioridade(itens);
      itens = itens.filter((it) => it !== alvoRemover);
      removidos += 1;
      continue;
    }

    return { mantidos: itens, removidos };
  }
}

/** O tópico de MENOR prioridade (desempate por maior `id.localeCompare`). */
function menorPrioridade(itens: TopicoCamada[]): TopicoCamada {
  return itens.reduce((menor, it) => {
    if (it.prioridade < menor.prioridade) return it;
    if (it.prioridade > menor.prioridade) return menor;
    // Empate: remove o de id "maior" (localeCompare), mantendo o menor id.
    return it.topico.id.localeCompare(menor.topico.id) > 0 ? it : menor;
  });
}

/**
 * Distribui os tópicos (já ordenados base→novo) pelos dias disponíveis,
 * repartindo o tempo por uma régua base/novo e priorizando o difícil, sendo
 * HONESTO quando não cabe (§7.3/§7.4). Determinística, total, sem relógio.
 */
export function calcularPlano(p: CalcularPlanoParams): PlanoCalculado {
  // Guardas ANTES da régua (mistura omitida — §7.1.1).
  if (p.topicos.length === 0) {
    return { dias: [], aviso: { tipo: "sem_topicos" } };
  }
  if (p.datasDisponiveis.length === 0) {
    return { dias: [], aviso: { tipo: "sem_dias" } };
  }

  const base = p.topicos.filter((t) => !t.novo);
  const novo = p.topicos.filter((t) => t.novo);

  const dificuldadeBase =
    base.length > 0
      ? base.reduce((s, t) => s + t.dificuldade, 0) / base.length
      : 0;

  // Passo 1 — régua.
  const mistura = calcularMisturaBaseNovo({
    diasRestantes: p.diasRestantes,
    totalBase: base.length,
    totalNovo: novo.length,
    dificuldadeBase,
  });

  const D = p.datasDisponiveis.length;
  const capacidadeDia = p.horasPorDia * 60;
  const capacidadeTotal = D * capacidadeDia;

  // Passo 2 — orçamento por camada (soma exata = capacidadeTotal).
  const orcBase = Math.round(capacidadeTotal * mistura.fracaoBase);
  const orcNovo = capacidadeTotal - orcBase;

  // Passos 3–5 — alvo por peso, piso de 15 e inteiros reconciliados por camada.
  const camadaBase = resolverCamada(base, orcBase, mistura.fracaoBase);
  const camadaNovo = resolverCamada(novo, orcNovo, mistura.fracaoNovo);

  let removidos = camadaBase.removidos + camadaNovo.removidos;

  // Passo 7 — ordem de preenchimento: base antes de novo, e dentro de cada
  // camada a ORDEM RECEBIDA (já base→novo via cronologia, honrando a
  // ordemManual). A prioridade é só critério de REMOÇÃO (passo 4/6), não de
  // reordenação do preenchimento. `resolverCamada` já preserva a ordem recebida
  // dos mantidos.
  const sequencia = [...camadaBase.mantidos, ...camadaNovo.mantidos];

  // Passo 7 — sequential-fill por tópico com cursor de dia que só avança.
  const dias: DiaPlano[] = p.datasDisponiveis.map((data) => ({
    data,
    blocos: [],
  }));
  const usadoNoDia: number[] = dias.map(() => 0);
  let cursor = 0;

  for (const it of sequencia) {
    let restante = it.minutos;
    while (restante >= MINUTOS_BLOCO_MIN && cursor < dias.length) {
      const folga = capacidadeDia - usadoNoDia[cursor];
      if (folga < MINUTOS_BLOCO_MIN) {
        cursor += 1;
        continue;
      }
      let aColocar: number;
      if (restante <= folga) {
        aColocar = restante; // cabe tudo (bloco final do tópico).
      } else {
        // Não cabe tudo neste dia. Escolhe `aColocar <= folga` de modo que nem
        // o bloco atual nem o resíduo (próximo bloco) fiquem abaixo de 15.
        const residuo = restante - folga;
        if (residuo >= MINUTOS_BLOCO_MIN) {
          aColocar = folga; // resíduo válido sozinho.
        } else if (restante - MINUTOS_BLOCO_MIN >= MINUTOS_BLOCO_MIN) {
          aColocar = restante - MINUTOS_BLOCO_MIN; // deixa exatos 15 p/ o fim.
        } else {
          // `restante` (15–29) não cabe inteiro aqui e não dá para dividir sem
          // criar um bloco < 15: avança para um dia que o comporte inteiro.
          cursor += 1;
          continue;
        }
      }
      dias[cursor].blocos.push({
        topicoId: it.topico.id,
        titulo: it.topico.titulo,
        novo: it.topico.novo,
        minutos: aColocar,
      });
      usadoNoDia[cursor] += aColocar;
      restante -= aColocar;
    }
    // Resíduo >= 15 após esgotar os dias → o tópico não coube inteiro.
    if (restante >= MINUTOS_BLOCO_MIN) {
      removidos += 1;
    }
  }

  const resultado: PlanoCalculado = { dias, mistura };
  if (removidos > 0) {
    resultado.aviso = { tipo: "nao_cabe", topicosForaDoPlano: removidos };
  }
  return resultado;
}
