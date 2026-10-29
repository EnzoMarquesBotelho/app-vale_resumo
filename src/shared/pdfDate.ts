/**
 * Parsing puro e tolerante da data interna de um PDF (Info dictionary).
 *
 * Lógica compartilhada sem Node/Electron/IA: converte a string de data no
 * formato PDF (`D:YYYYMMDDHHmmSSOHH'mm'`, com partes opcionais) em um instante
 * ISO 8601 canônico em UTC, ou `undefined` quando não é possível. Nunca lança —
 * qualquer entrada inválida vira `undefined`, para a camada de captura cair no
 * fallback (mtime) sem derrubar a importação.
 */

/**
 * Converte uma string de data do Info dictionary de um PDF em um instante
 * ISO 8601 canônico (`new Date(ms).toISOString()`), ou `undefined`.
 *
 * - Entrada não-string ou vazia → `undefined`.
 * - Prefixo `D:` opcional.
 * - Exige ao menos ano+mês+dia; mês/dia ausentes assumem `01`; hora/min/seg
 *   ausentes assumem `00`.
 * - Offset de fuso aplicado quando presente (`Z` ou `±HH'mm'`); sem fuso,
 *   interpreta como UTC (determinístico, não usa o fuso da máquina). No caso
 *   degenerado `Z` + dígitos de offset, o `Z` vence (offset 0).
 * - Validação por round-trip: reconstrói os componentes a partir do `Date`
 *   resultante; data inexistente (mês 13, dia 32, ...) → `undefined`.
 *
 * Pura e total: nunca lança.
 */
export function parsearDataPdf(bruto: unknown): string | undefined {
  if (typeof bruto !== "string") return undefined;
  const texto = bruto.trim();
  if (texto === "") return undefined;

  const m =
    /^D?:?\s*(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?/.exec(
      texto,
    );
  if (m === null) return undefined;

  const ano = Number(m[1]);
  const mes = m[2] !== undefined ? Number(m[2]) : 1;
  const dia = m[3] !== undefined ? Number(m[3]) : 1;
  const hora = m[4] !== undefined ? Number(m[4]) : 0;
  const minuto = m[5] !== undefined ? Number(m[5]) : 0;
  const segundo = m[6] !== undefined ? Number(m[6]) : 0;

  // Offset de fuso. `Z` → UTC (ignora dígitos de offset degenerados); `+`/`-`
  // aplicam os dígitos de hora/minuto; ausente → UTC.
  const sinal = m[7];
  let offsetMinutos = 0;
  if (sinal === "+" || sinal === "-") {
    const offHora = m[8] !== undefined ? Number(m[8]) : 0;
    const offMinuto = m[9] !== undefined ? Number(m[9]) : 0;
    offsetMinutos = (offHora * 60 + offMinuto) * (sinal === "-" ? -1 : 1);
  }

  // Monta o instante em UTC e desconta o offset (um fuso -03:00 significa que a
  // hora local está 3h atrás de UTC, logo o instante UTC é +3h).
  const ms = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo) - offsetMinutos * 60_000;
  const data = new Date(ms);
  if (Number.isNaN(data.getTime())) return undefined;

  // Validação round-trip: os componentes da data, expressos no mesmo fuso de
  // entrada, precisam bater com o que foi lido (rejeita mês 13, dia 32, etc.).
  const noFuso = new Date(ms + offsetMinutos * 60_000);
  if (
    noFuso.getUTCFullYear() !== ano ||
    noFuso.getUTCMonth() !== mes - 1 ||
    noFuso.getUTCDate() !== dia ||
    noFuso.getUTCHours() !== hora ||
    noFuso.getUTCMinutes() !== minuto ||
    noFuso.getUTCSeconds() !== segundo
  ) {
    return undefined;
  }

  return data.toISOString();
}
