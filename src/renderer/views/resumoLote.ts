import { PASTA_MAX_ARQUIVOS_LOTE } from "@shared/constants";
import type { ResultadoImportacaoPasta } from "@shared/types";

/** Pluraliza uma palavra pela contagem (pt-BR simples). */
function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * Monta a frase pt-BR do resumo de um lote de importação de pasta. Função pura
 * (sem render), testável isoladamente. A ordem de precedência é explícita, por
 * early returns:
 *  1. parada por teto de arquivos → só a mensagem de limite;
 *  2. nenhum arquivo novo (só duplicatas) → frase natural;
 *  3. caso geral → frase base + sufixos (profundidade sempre por último).
 */
export function resumoLoteTexto(r: ResultadoImportacaoPasta): string {
  // 1. Parada por teto de arquivos (nada foi importado).
  if (r.limiteExcedido === "arquivos") {
    return (
      `A pasta tem mais de ${PASTA_MAX_ARQUIVOS_LOTE} arquivos suportados. ` +
      "Nada foi importado. Escolha uma subpasta menor."
    );
  }

  const sufixoProfundidade =
    r.limiteExcedido === "profundidade"
      ? " (algumas subpastas muito profundas foram ignoradas)"
      : "";

  // 2. Nenhum arquivo novo: só duplicatas.
  if (r.importados === 0 && r.ignoradosPorDuplicata > 0) {
    const base = `Nenhum arquivo novo: ${r.ignoradosPorDuplicata} já importado(s) antes.`;
    const sufixoFormato =
      r.ignoradosPorFormato > 0
        ? `; ${r.ignoradosPorFormato} ignorado(s) por formato`
        : "";
    const sufixoFalhas =
      r.falhas > 0 ? `; ${r.falhas} com erro de leitura` : "";
    return `${base}${sufixoFormato}${sufixoFalhas}${sufixoProfundidade}`;
  }

  // 3. Caso geral: frase base + sufixos.
  const n = r.cadernosTocados.length;
  let texto =
    `${r.importados} ${plural(r.importados, "arquivo", "arquivos")} ` +
    `${plural(r.importados, "importado", "importados")} em ` +
    `${n} ${plural(n, "caderno", "cadernos")}`;
  if (r.ignoradosPorFormato > 0) {
    texto += `; ${r.ignoradosPorFormato} ignorado(s) por formato`;
  }
  if (r.ignoradosPorDuplicata > 0) {
    texto += `; ${r.ignoradosPorDuplicata} já importado(s) antes`;
  }
  if (r.falhas > 0) {
    texto += `; ${r.falhas} com erro de leitura`;
  }
  return `${texto}${sufixoProfundidade}`;
}
