/**
 * Orquestração fina (no main, SEM IA) do cálculo do plano de estudo: traduz o
 * `PlanoEstudo` persistido numa `Prova` para as entradas da lógica pura
 * `calcularPlano` e devolve o `PlanoCalculado`.
 *
 * A fronteira (design §1.2): o main conhece o relógio e o disco e prepara as
 * entradas; o puro (`@shared/plano`) só faz aritmética. Aqui montamos as datas
 * disponíveis (dias úteis por `diasPorSemana`), ordenamos os tópicos base→novo
 * (reusando `ordenarCronologicamente`) e convertemos cada `NivelDificuldade`
 * para o peso numérico que a matemática consome. Nada persiste.
 */

import { datasEntre, diferencaDias } from "@shared/agenda";
import { ordenarCronologicamente } from "@shared/cronologia";
import { diagnosticoAplicavel } from "@shared/diagnostico";
import { calcularPlano } from "@shared/plano";
import type {
  CalcularPlanoParams,
  PlanoCalculado,
  TopicoDistribuivel,
} from "@shared/plano";
import type {
  NivelDificuldade,
  PlanoEstudo,
  Prova,
  TopicoPlano,
} from "@shared/types";
import { DadosProvaInvalidosError } from "./provas.js";

/**
 * Converte o nível autodeclarado para o peso numérico em [0,1] que a régua e a
 * distribuição consomem: `facil→0`, `media→0.5`, `dificil→1`, `undefined→0.5`
 * (ausente é tratado como "media", conforme o tipo).
 */
export function nivelParaPeso(n?: NivelDificuldade): number {
  switch (n) {
    case "facil":
      return 0;
    case "dificil":
      return 1;
    case "media":
    default:
      return 0.5;
  }
}

/**
 * Ordena os tópicos do plano base→novo (cronologia + ordem manual). Único
 * lugar dessa regra: o cálculo do plano e o diagnóstico usam a mesma ordem.
 */
export function ordenarTopicosDoPlano(plano: PlanoEstudo): TopicoPlano[] {
  // Ordem manual (ids → índice) reconstruída como ReadonlyMap para a cronologia.
  const ordemManual =
    plano.ordemManual !== undefined && plano.ordemManual.length > 0
      ? new Map(plano.ordemManual.map((id, i) => [id, i] as const))
      : undefined;

  return ordenarCronologicamente<TopicoPlano>({
    itens: plano.topicos,
    ...(ordemManual !== undefined ? { ordemManual } : {}),
  });
}

/**
 * Monta as entradas e chama a lógica pura `calcularPlano` para a `prova`,
 * usando o `hoje` injetado. Recalcula sob demanda (nada é persistido).
 *
 * - `prova.plano === undefined` → lança `DadosProvaInvalidosError` (uso inválido
 *   do canal: não há questionário montado).
 * - `diasRestantes <= 0` → retorna cedo `{ dias: [], aviso: prova_passou }`
 *   (sem régua, `mistura` omitida).
 * - caso contrário monta `datasDisponiveis` (dias úteis por `diasPorSemana`),
 *   ordena os tópicos base→novo (com a `ordemManual` reconstruída em
 *   `ReadonlyMap`), converte as dificuldades e delega ao puro.
 */
export function montarPlanoCalculado(prova: Prova, hoje: string): PlanoCalculado {
  const plano = prova.plano;
  if (plano === undefined) {
    throw new DadosProvaInvalidosError(
      "Monte o plano de estudo antes de ver a prévia.",
    );
  }

  const diasRestantes = diferencaDias(prova.data, hoje);
  if (diasRestantes <= 0) {
    return { dias: [], aviso: { tipo: "prova_passou" } };
  }

  // Datas corridas de amanhã até a véspera; filtra dias úteis por âncora
  // explícita `i % 7 < diasPorSemana` (índice 0 = amanhã). Como diasPorSemana é
  // >= 1 (saneado), havendo >= 1 dia corrido há sempre >= 1 dia útil.
  const corridas = datasEntre(hoje, prova.data);
  const datasDisponiveis = corridas.filter((_, i) => i % 7 < plano.diasPorSemana);

  const ordenados = ordenarTopicosDoPlano(plano);

  const topicos: TopicoDistribuivel[] = ordenados.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    novo: t.novo,
    dificuldade: nivelParaPeso(t.dificuldade),
  }));

  const ajuste = diagnosticoAplicavel(plano, prova.diagnostico);
  const params: CalcularPlanoParams = {
    topicos,
    datasDisponiveis,
    horasPorDia: plano.horasPorDia,
    diasRestantes,
    ordinal: plano.ordinal,
    // Diagnóstico só entra se concluído, atual e com efeito (senão: fatia 2).
    ...(ajuste !== undefined ? { diagnostico: ajuste } : {}),
  };
  return calcularPlano(params);
}
