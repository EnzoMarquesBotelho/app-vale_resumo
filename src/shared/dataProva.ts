/**
 * Data mínima da prova (= amanhã), lógica PURA e compartilhada entre o main
 * (autoridade) e a UI (espelho). Tudo em data-calendário local "YYYY-MM-DD";
 * nunca usa UTC nem lê o relógio (exceto `dataLocalDe`, que recebe um Date).
 */
import { diaParaNumero, numeroParaDia } from "./agenda";

/** Casa estritamente "YYYY-MM-DD" (validação sintática antes da semântica). */
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** `true` se `data` é "YYYY-MM-DD" e uma data real do calendário. */
export function dataValida(data: unknown): data is string {
  if (typeof data !== "string" || !PADRAO_DATA.test(data)) return false;
  try {
    return numeroParaDia(diaParaNumero(data)) === data;
  } catch {
    return false;
  }
}

/** Data-calendário local de um Date (getFullYear/getMonth/getDate; nunca UTC). */
export function dataLocalDe(d: Date): string {
  const ano = d.getFullYear().toString().padStart(4, "0");
  const mes = (d.getMonth() + 1).toString().padStart(2, "0");
  const dia = d.getDate().toString().padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** hoje + 1 dia. Lança se `hoje` for inválido (contrato de `diaParaNumero`). */
export function dataMinimaProva(hoje: string): string {
  return numeroParaDia(diaParaNumero(hoje) + 1);
}

export type ResultadoDataProva =
  | { ok: true }
  | { ok: false; motivo: "formato" | "nao_futura"; mensagem: string };

/** "dd/mm/aaaa" de um "YYYY-MM-DD". */
function formatarBr(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** Frase pronta para data passada/hoje. */
export function mensagemDataMinima(hoje: string): string {
  return `Escolha uma data a partir de amanhã (${formatarBr(dataMinimaProva(hoje))}). Provas só podem ser marcadas em datas futuras.`;
}

/**
 * Ordem de avaliação (fixa):
 *  1. formato inválido ⇒ `formato` (nunca lança, mesmo com `data === dataAtual`);
 *  2. `data === dataAtual` (edição inalterada) ⇒ ok, sem ler `hoje`;
 *  3. `data >= amanhã` ⇒ ok; senão `nao_futura`.
 * `hoje` inválido LANÇA na etapa 3 (erro de programação do chamador).
 */
export function validarDataProva(p: {
  data: string;
  hoje: string;
  dataAtual?: string;
}): ResultadoDataProva {
  if (!dataValida(p.data)) {
    return {
      ok: false,
      motivo: "formato",
      mensagem: "Informe uma data válida (ano-mês-dia).",
    };
  }
  if (p.dataAtual !== undefined && p.data === p.dataAtual) return { ok: true };
  if (p.data >= dataMinimaProva(p.hoje)) return { ok: true };
  return {
    ok: false,
    motivo: "nao_futura",
    mensagem: mensagemDataMinima(p.hoje),
  };
}
