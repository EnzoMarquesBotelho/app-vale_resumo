/**
 * Lógica pura de agendamento de provas (contagem regressiva, repetição
 * espaçada e dica mecânica do dia), compartilhada entre main e renderer.
 *
 * Sem dependências de Node/Electron/disco/IA: só funções totais que recebem o
 * "hoje" como parâmetro (nunca lêem o relógio real), para serem testáveis com
 * datas fixas. Importa APENAS tipos (`import type`) de `./types` e as
 * constantes de `./constants`; esses módulos nunca importam daqui (evita ciclo).
 */

import {
  DIAS_ANTES_MAX,
  INTERVALOS_MAX,
  INTERVALOS_REVISAO_PADRAO,
} from "./constants";
import type {
  CadernoEmFoco,
  DicaDoDia,
  Prova,
  SessaoRevisao,
} from "./types";

// --- Aritmética de dias pura (datas "YYYY-MM-DD") -------------------------

/** Milissegundos em um dia (24h), base da aritmética em UTC midnight. */
const MS_POR_DIA = 86_400_000;

/** Casa "YYYY-MM-DD" com valores de ano/mês/dia válidos (round-trip exato). */
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte "YYYY-MM-DD" em dias desde a época (UTC midnight). Função pura.
 * Valida por round-trip: datas inexistentes (ex.: "2026-02-30") ou mal
 * formatadas lançam `Error`, porque `Date.UTC` normalizaria silenciosamente.
 */
export function diaParaNumero(data: string): number {
  const m = PADRAO_DATA.exec(data);
  if (m === null) {
    throw new Error(`Data inválida: ${data}`);
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  // Round-trip: se o componente não bate, a data não existe no calendário.
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    throw new Error(`Data inválida: ${data}`);
  }
  return ms / MS_POR_DIA;
}

/** Converte dias-desde-a-época (UTC midnight) de volta para "YYYY-MM-DD". */
export function numeroParaDia(n: number): string {
  const d = new Date(n * MS_POR_DIA);
  const ano = d.getUTCFullYear().toString().padStart(4, "0");
  const mes = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dia = d.getUTCDate().toString().padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** `a` − `b` em dias inteiros (ambos em "YYYY-MM-DD"). Imune a DST/fuso. */
export function diferencaDias(a: string, b: string): number {
  return diaParaNumero(a) - diaParaNumero(b);
}

// --- Intervalos (parsing + saneamento) ------------------------------------

/**
 * Converte a string digitada pelo usuário (inteiros separados por vírgula
 * e/ou espaço, ex.: "7, 3 1") em `number[]`. Tokens não numéricos são
 * descartados; NÃO lança. O resultado AINDA passa por `normalizarIntervalos`
 * (quem decide default/limites). "7, três" → [7]; "" ou "abc" → [].
 */
export function parsearIntervalos(bruto: string): number[] {
  return bruto
    .split(/[\s,]+/)
    .filter((t) => t !== "")
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n));
}

/**
 * Sanea os intervalos antes de gerar a agenda: arredonda, descarta `<= 0` e
 * `> DIAS_ANTES_MAX`, deduplica, ordena DECRESCENTE (mais longe primeiro),
 * corta em `INTERVALOS_MAX`. Vazio após sanear → `INTERVALOS_REVISAO_PADRAO`.
 */
export function normalizarIntervalos(intervalos: number[]): number[] {
  const limpos = intervalos
    .map((n) => Math.round(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= DIAS_ANTES_MAX);
  const distintos = Array.from(new Set(limpos));
  distintos.sort((a, b) => b - a);
  const cortados = distintos.slice(0, INTERVALOS_MAX);
  return cortados.length === 0 ? [...INTERVALOS_REVISAO_PADRAO] : cortados;
}

// --- Contagem regressiva --------------------------------------------------

/** Dias restantes de `hoje` até `dataProva` (0 = hoje; negativo = passou). */
export function diasRestantes(dataProva: string, hoje: string): number {
  return diferencaDias(dataProva, hoje);
}

/** Classifica a prova para destaque na UI, a partir de `diasRestantes`. */
export function estadoProva(
  dias: number,
): "hoje" | "amanha" | "futura" | "passada" {
  if (dias < 0) return "passada";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanha";
  return "futura";
}

// --- Geração automática da agenda -----------------------------------------

export interface GerarAgendaParams {
  /** Data da prova "YYYY-MM-DD". */
  dataProva: string;
  /** Intervalos ("dias antes"), ex.: [7, 3, 1]. */
  intervalos: number[];
  /** Data de hoje (data-calendário local), injetada. */
  hoje: string;
}

/**
 * Gera as sessões SUGERIDAS (todas `manual: false`) por repetição espaçada,
 * contando de trás para frente a partir de `dataProva`. Função pura e total.
 * - Para cada `d` saneado: data = dataProva − d dias.
 * - Descarta datas anteriores a `hoje` (comparação lexicográfica "YYYY-MM-DD");
 *   data exatamente em `hoje` é MANTIDA.
 * - `dataProva <= hoje` → agenda vazia (não é erro).
 * - Deduplica datas iguais mantendo o MENOR `diasAntes`.
 * - Ordena por data crescente e atribui ids `s0..sN`.
 */
export function gerarAgenda(params: GerarAgendaParams): SessaoRevisao[] {
  const { dataProva, hoje } = params;
  if (diferencaDias(dataProva, hoje) <= 0) {
    return [];
  }
  const intervalos = normalizarIntervalos(params.intervalos);
  const numProva = diaParaNumero(dataProva);

  // Dedup por data mantendo o menor diasAntes (o mais próximo da prova).
  const porData = new Map<string, number>();
  for (const d of intervalos) {
    const data = numeroParaDia(numProva - d);
    if (data < hoje) continue; // nunca no passado (data exatamente hoje fica)
    const atual = porData.get(data);
    if (atual === undefined || d < atual) {
      porData.set(data, d);
    }
  }

  const datasOrdenadas = Array.from(porData.keys()).sort();
  return datasOrdenadas.map((data, i) => ({
    id: `s${i}`,
    data,
    diasAntes: porData.get(data) as number,
    manual: false,
  }));
}

// --- Recompute-vs-preserve ------------------------------------------------

export interface RecomputarAgendaParams {
  /** Nova data da prova (pode ter mudado) "YYYY-MM-DD". */
  dataProva: string;
  /** Intervalos atuais da prova. */
  intervalos: number[];
  /** Data de hoje "YYYY-MM-DD". */
  hoje: string;
  /** O que está salvo (sugeridas + manuais). */
  sessoesAtuais: SessaoRevisao[];
}

/**
 * Recomputa a agenda sem apagar edições manuais:
 * 1. Descarta as sugeridas (`manual === false`) e regera via `gerarAgenda`.
 * 2. Preserva as manuais (`manual === true`) cuja data não caia no passado.
 * 3. Colisão de data: a manual vence (a sugerida nova é descartada).
 * 4. Une, ordena por data e reatribui ids `s0..sN`.
 * As sessões geradas nascem `manual: false`; as manuais preservam `manual` e
 * `concluida`, com `diasAntes` recalculado em relação à nova data.
 */
export function recomputarAgenda(
  p: RecomputarAgendaParams,
): SessaoRevisao[] {
  const { dataProva, intervalos, hoje, sessoesAtuais } = p;

  const manuaisPreservadas = sessoesAtuais
    .filter((s) => s.manual && s.data >= hoje)
    .map((s) => ({
      ...s,
      diasAntes: diferencaDias(dataProva, s.data),
    }));
  const datasManuais = new Set(manuaisPreservadas.map((s) => s.data));

  const sugeridas = gerarAgenda({ dataProva, intervalos, hoje }).filter(
    (s) => !datasManuais.has(s.data),
  );

  const unidas = [...manuaisPreservadas, ...sugeridas];
  unidas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return unidas.map((s, i) => ({ ...s, id: `s${i}` }));
}

// --- Dica mecânica do dia -------------------------------------------------

export interface CalcularDicaParams {
  /** A prova (com suas sessões). */
  prova: Prova;
  /** Data de hoje "YYYY-MM-DD". */
  hoje: string;
  /**
   * Cadernos existentes com o estado do material. CONTRATO DE ORDEM: chega
   * SEMPRE ordenado por `cadernoId` ascendente (o handler é o dono da ordem).
   * A rotação indexa por essa ordem.
   */
  cadernosDisponiveis: CadernoEmFoco[];
}

/** Monta o sufixo de artefatos de um caderno em foco (nenhum/resumo/flashcards). */
function sufixoArtefatos(c: CadernoEmFoco): string {
  if (c.temResumo && c.temFlashcards) return "; tem resumo e flashcards";
  if (c.temResumo) return "; tem resumo";
  if (c.temFlashcards) return "; tem flashcards";
  return "";
}

/** "N documento" / "N documentos" (singular/plural). */
function frasesDocumentos(total: number): string {
  return total === 1 ? "1 documento" : `${total} documentos`;
}

/** Descreve um caderno em foco: «nome» (N documento(s)[; tem ...]). */
function descreverCaderno(c: CadernoEmFoco): string {
  return `«${c.cadernoNome}» (${frasesDocumentos(c.totalDocumentos)}${sufixoArtefatos(
    c,
  )})`;
}

/**
 * Calcula a dica MECÂNICA do dia (sem IA). Determinística: dadas a prova, o
 * `hoje` e os cadernos (ordenados por `cadernoId`), devolve `DicaDoDia` com a
 * frase pronta em português. Regras: prova passada → "já passou"; sem revisão
 * hoje → orienta o próximo passo; vínculo caderno → cita o caderno-alvo;
 * abrangente+rotação → um caderno pelo índice do dia; abrangente+intercalado →
 * todos; sem cadernos → guia a importar.
 */
export function calcularDicaDoDia(p: CalcularDicaParams): DicaDoDia {
  const { prova, hoje, cadernosDisponiveis } = p;
  const dias = diasRestantes(prova.data, hoje);

  if (dias < 0) {
    return {
      provaId: prova.id,
      diasRestantes: dias,
      temRevisaoHoje: false,
      cadernosEmFoco: [],
      mensagem: "Esta prova já passou.",
    };
  }

  const sessoesOrdenadas = [...prova.sessoes].sort((a, b) =>
    a.data < b.data ? -1 : a.data > b.data ? 1 : 0,
  );
  const indiceHoje = sessoesOrdenadas.findIndex((s) => s.data === hoje);
  const temRevisaoHoje = indiceHoje >= 0;

  if (!temRevisaoHoje) {
    return {
      provaId: prova.id,
      diasRestantes: dias,
      temRevisaoHoje: false,
      cadernosEmFoco: [],
      mensagem: `Nenhuma revisão agendada para hoje. Faltam ${dias} dias para «${prova.titulo}».`,
    };
  }

  // Há revisão hoje: determinar o(s) caderno(s) em foco pelo vínculo.
  const semCadernos = cadernosDisponiveis.length === 0;

  if (prova.vinculo.tipo === "caderno") {
    const alvo = cadernosDisponiveis.find(
      (c) => c.cadernoId === (prova.vinculo as { cadernoId: string }).cadernoId,
    );
    if (alvo === undefined) {
      return dicaSemFoco(prova, dias);
    }
    return {
      provaId: prova.id,
      diasRestantes: dias,
      temRevisaoHoje: true,
      cadernosEmFoco: [alvo],
      mensagem: `Faltam ${dias} dias para «${prova.titulo}». Hoje: revise ${descreverCaderno(
        alvo,
      )}.`,
    };
  }

  // Abrangente.
  if (semCadernos) {
    return dicaSemFoco(prova, dias);
  }

  if (prova.vinculo.modoDistribuicao === "rotacao") {
    const alvo =
      cadernosDisponiveis[indiceHoje % cadernosDisponiveis.length];
    return {
      provaId: prova.id,
      diasRestantes: dias,
      temRevisaoHoje: true,
      cadernosEmFoco: [alvo],
      mensagem: `Faltam ${dias} dias para «${prova.titulo}». Hoje: revise ${descreverCaderno(
        alvo,
      )}.`,
    };
  }

  // Intercalado: um pouco de cada caderno.
  const lista = cadernosDisponiveis
    .map((c) => `«${c.cadernoNome}» (${frasesDocumentos(c.totalDocumentos)})`)
    .join(", ");
  return {
    provaId: prova.id,
    diasRestantes: dias,
    temRevisaoHoje: true,
    cadernosEmFoco: cadernosDisponiveis,
    mensagem: `Faltam ${dias} dias para «${prova.titulo}». Hoje revise um pouco de cada matéria: ${lista}.`,
  };
}

/**
 * Dica quando há revisão hoje mas não há material (abrangente sem cadernos, ou
 * caderno-alvo inexistente): guia o usuário a importar, sem inventar foco.
 */
function dicaSemFoco(prova: Prova, dias: number): DicaDoDia {
  return {
    provaId: prova.id,
    diasRestantes: dias,
    temRevisaoHoje: true,
    cadernosEmFoco: [],
    mensagem:
      "Você ainda não importou material. Importe seus arquivos de estudo (aba Importar) para a agenda saber o que revisar.",
  };
}
