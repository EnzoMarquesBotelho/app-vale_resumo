import type { AvisoPlano } from "@shared/plano";

/**
 * Formatadores e frases pt-BR compartilhados pelas telas do plano de estudo
 * (prévia e diagnóstico). Puros; ficam fora dos componentes para o fast refresh.
 */

/** Formata minutos como "Xh Ymin" / "Xh" / "Ymin" (pt-BR, compacto). */
export function formatarMinutos(min: number): string {
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas > 0 && resto > 0) return `${horas}h ${resto}min`;
  if (horas > 0) return `${horas}h`;
  return `${resto}min`;
}

/** Formata uma data "YYYY-MM-DD" como "DD/MM/YYYY" (sem fuso). */
export function formatarData(data: string): string {
  const partes = data.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/** Formata um carimbo ISO como "DD/MM/YYYY" (local), tolerante a inválido. */
export function formatarCarimbo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = d.getDate().toString().padStart(2, "0");
  const mes = (d.getMonth() + 1).toString().padStart(2, "0");
  const ano = d.getFullYear().toString().padStart(4, "0");
  return `${dia}/${mes}/${ano}`;
}

/** Frase honesta em pt-BR para cada aviso do plano calculado (§7.4). */
export function fraseAviso(
  aviso: AvisoPlano,
  horasPorDia: number,
  diasPorSemana: number,
): string {
  switch (aviso.tipo) {
    case "prova_passou":
      return "Esta prova já passou — não há mais dias para planejar.";
    case "sem_topicos":
      return "Adicione ao menos um assunto para montar a prévia do plano.";
    case "sem_dias":
      return "Não há dias de estudo entre hoje e a prova. Considere começar antes ou ajustar a data.";
    case "nao_cabe":
      return (
        `Com ${horasPorDia}h/dia e ${diasPorSemana} dias por semana não dá para ` +
        `cobrir tudo com qualidade. Priorizei os assuntos mais críticos; ` +
        `${aviso.topicosForaDoPlano} ficaram de fora — considere mais tempo por ` +
        `dia ou comece antes.`
      );
    default:
      return "";
  }
}
