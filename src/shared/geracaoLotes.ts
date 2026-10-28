/**
 * Lógica PURA de geração em lotes (chunks) para quiz e exercícios.
 *
 * Sem Electron, sem disco, sem IA — 100% testável com entradas fixas. Reúne
 * particionar a quantidade, o gate de chunking, a chave de deduplicação, o
 * acúmulo com dedup, a seleção de enunciados a evitar no próximo lote e os
 * tipos de progresso compartilhados entre serviço (main) e renderer.
 *
 * O serviço é AGNÓSTICO ao artefato: só reporta `(prontos, total)` via
 * `AoProgresso`. Quem anexa `artefato`/`geracaoId` (montando `ProgressoGeracao`)
 * é o handler IPC.
 */

/** Qual artefato está sendo gerado em lotes. */
export type ArtefatoLote = "quiz" | "exercicios";

/**
 * Callback de progresso que o SERVIÇO chama. O serviço é AGNÓSTICO ao artefato:
 * só reporta `(prontos, total)`. Quem adapta para o payload do canal (anexando
 * `artefato` e `geracaoId`) é o HANDLER IPC — nunca o serviço.
 */
export type AoProgresso = (prontos: number, total: number) => void;

/** Progresso de uma geração em lotes empurrado main→renderer (payload do canal). */
export interface ProgressoGeracao {
  /** Id da geração — SOMENTE para log/telemetria (não filtra no renderer). */
  geracaoId: string;
  /** Qual artefato está sendo gerado (o renderer filtra por isto). */
  artefato: ArtefatoLote;
  /** Itens já acumulados (após dedup). */
  prontos: number;
  /** Total pedido (N normalizado 5–100). */
  total: number;
}

/** Resultado de um passo de acúmulo com deduplicação (imutável). */
export interface ResultadoAcumulo<T> {
  /** Novo array acumulado (não é o mesmo array de entrada). */
  itens: T[];
  /** Novo conjunto de chaves já vistas (não é o mesmo Set de entrada). */
  chavesVistas: Set<string>;
  /**
   * Quantos itens do lote foram realmente aceitos. Usado SÓ para o progresso
   * (`prontos += aceitos`); NÃO participa do critério de parada do laço. Um
   * lote com `aceitos === 0` ainda conta como `tentativa`.
   */
  aceitos: number;
}

/** Rótulo pt-BR para a UI: "Gerando 30 de 100…". */
export function rotuloProgresso(p: ProgressoGeracao): string {
  return `Gerando ${p.prontos} de ${p.total}…`;
}

/**
 * Divide `total` em lotes de no máximo `tamanho` itens. O último lote leva o
 * resto. Clampa defensivamente: `tamanho < 1` vira 1; `total <= 0` → `[]`.
 * Nunca depende do gate — quem decide se particiona é o chamador (ver
 * `deveParticionar`).
 */
export function particionarQuantidade(total: number, tamanho: number): number[] {
  if (total <= 0) return [];
  const passo = tamanho < 1 ? 1 : Math.floor(tamanho);
  const lotes: number[] = [];
  let restante = Math.floor(total);
  while (restante > 0) {
    const lote = Math.min(passo, restante);
    lotes.push(lote);
    restante -= lote;
  }
  return lotes;
}

/** `true` se `total` passou do `limiar` e a geração deve ir em lotes. */
export function deveParticionar(total: number, limiar: number): boolean {
  return total > limiar;
}

/**
 * Chave de deduplicação de um enunciado: `trim` + lowercase + remoção de
 * acentos (NFD) + colapso de espaços internos + remoção de pontuação de borda.
 * Dois enunciados "iguais o bastante" produzem a mesma chave; `""` → `""`.
 */
export function chaveDedup(enunciado: string): string {
  return enunciado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // colapsa espaços internos
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); // pontuação de borda
}

/**
 * Acumula itens novos num acumulador respeitando a quantidade-alvo e a dedup.
 * Genérico: recebe como extrair a chave de cada item. Função PURA — devolve um
 * novo acumulador + o conjunto de chaves atualizado; não muta a entrada.
 *
 * - itens com chave vazia são descartados;
 * - itens cuja chave já está em `chavesVistas` são descartados (dedup);
 * - para no `alvo` (não acumula além de N), preservando a ordem de chegada.
 */
export function acumularComDedup<T>(
  acumulado: T[],
  chavesVistas: Set<string>,
  novos: T[],
  alvo: number,
  chaveDe: (item: T) => string,
): ResultadoAcumulo<T> {
  const itens = acumulado.slice();
  const chaves = new Set(chavesVistas);
  let aceitos = 0;
  for (const item of novos) {
    if (itens.length >= alvo) break;
    const chave = chaveDe(item);
    if (chave === "") continue;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    itens.push(item);
    aceitos += 1;
  }
  return { itens, chavesVistas: chaves, aceitos };
}

/**
 * Seleciona os enunciados já aceitos para instruir o próximo lote a não
 * repetir: os ÚLTIMOS `max` enunciados, cada um truncado a `maxLen` caracteres.
 * Pura e determinística (preserva a ordem de chegada). Lista vazia → `[]`.
 */
export function enunciadosParaEvitar(
  enunciados: string[],
  max: number,
  maxLen: number,
): string[] {
  const inicio = Math.max(0, enunciados.length - max);
  return enunciados.slice(inicio).map((e) => e.slice(0, maxLen));
}
