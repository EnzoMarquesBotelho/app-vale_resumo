/**
 * Domínio puro do updater in-app, compartilhado entre main e renderer. Casa
 * única do tipo de estado (`UpdaterStatus`) e de toda a lógica de forma /
 * saneamento / mensagem de erro. Sem dependências de Electron nem de
 * `electron-updater`: as funções recebem objetos estruturais simples
 * (`{ version }` / `{ percent }`), espelhando como `theme.ts` isola a regra
 * pura para ser testável e reusável nos dois processos.
 */

/**
 * Estado que o main empurra ao renderer e o renderer renderiza. Tipo
 * discriminado por `tipo`:
 * - `idle`: ocioso, nada a fazer.
 * - `dev-unavailable`: app não empacotado (dev / win-unpacked); updater inativo.
 * - `checking`: verificando se há nova versão.
 * - `available`: há uma nova versão `versao` disponível para baixar.
 * - `not-available`: já está na versão mais recente.
 * - `downloading`: baixando (progresso inteiro `percent`, 0–100).
 * - `ready`: baixado, pronto para reiniciar e instalar a versão `versao`.
 * - `error`: falhou; `mensagem` é uma frase pronta em pt-BR.
 */
export type UpdaterStatus =
  | { tipo: "idle" }
  | { tipo: "dev-unavailable" }
  | { tipo: "checking" }
  | { tipo: "available"; versao: string }
  | { tipo: "not-available" }
  | { tipo: "downloading"; percent: number }
  | { tipo: "ready"; versao: string }
  | { tipo: "error"; mensagem: string };

/** Estado neutro do app não-empacotado (dev / win-unpacked). */
export const STATUS_DEV: UpdaterStatus = { tipo: "dev-unavailable" };

/**
 * Arredonda e limita o progresso a `0..100`. Valor ausente/`NaN` vira `0`,
 * garantindo que a barra nunca receba um valor inválido.
 */
export function clampPercent(x: number | undefined | null): number {
  if (typeof x !== "number" || Number.isNaN(x)) return 0;
  const arredondado = Math.round(x);
  if (arredondado < 0) return 0;
  if (arredondado > 100) return 100;
  return arredondado;
}

/**
 * Normaliza a string de versão vinda do `UpdateInfo.version`: remove um prefixo
 * `v`, faz `trim`; string vazia/ausente vira `"desconhecida"` (a UI então omite
 * o número — ver `rotuloDisponivel`).
 */
export function normalizarVersao(versao: string | undefined | null): string {
  if (typeof versao !== "string") return "desconhecida";
  const limpa = versao.trim().replace(/^v/i, "").trim();
  return limpa.length > 0 ? limpa : "desconhecida";
}

/**
 * Mensagem amigável em pt-BR para um erro do updater. Nunca devolve o detalhe
 * cru: classifica defensivamente (string/`code`) entre falha de rede e erro
 * genérico, sem lançar.
 */
export function mensagemErroUpdater(err: unknown): string {
  const generica =
    "Não foi possível concluir a atualização. Tente novamente mais tarde.";
  const rede =
    "Não foi possível verificar atualizações agora. Verifique sua conexão e tente novamente.";

  let texto = "";
  let code = "";
  if (typeof err === "string") {
    texto = err;
  } else if (err && typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown };
    if (typeof obj.message === "string") texto = obj.message;
    if (typeof obj.code === "string") code = obj.code;
  }

  const alvo = `${code} ${texto}`.toLowerCase();
  const sinaisRede = [
    "net::",
    "enotfound",
    "etimedout",
    "econnrefused",
    "econnreset",
    "eai_again",
    "enetunreach",
    "getaddrinfo",
  ];
  if (sinaisRede.some((sinal) => alvo.includes(sinal))) {
    return rede;
  }
  return generica;
}

/** Mapeia `checking-for-update` → estado `checking`. */
export function mapCheckingToStatus(): UpdaterStatus {
  return { tipo: "checking" };
}

/** Mapeia `update-not-available` → estado `not-available`. */
export function mapNotAvailableToStatus(): UpdaterStatus {
  return { tipo: "not-available" };
}

/** Mapeia `update-available` → estado `available` com a versão normalizada. */
export function mapAvailableToStatus(info: { version: string }): UpdaterStatus {
  return { tipo: "available", versao: normalizarVersao(info.version) };
}

/** Mapeia `update-downloaded` → estado `ready` com a versão normalizada. */
export function mapDownloadedToStatus(info: {
  version: string;
}): UpdaterStatus {
  return { tipo: "ready", versao: normalizarVersao(info.version) };
}

/** Mapeia `download-progress` → estado `downloading` com o percent saneado. */
export function mapProgressToStatus(p: { percent: number }): UpdaterStatus {
  return { tipo: "downloading", percent: clampPercent(p.percent) };
}

/** Mapeia o evento `error` → estado `error` com a mensagem amigável. */
export function mapErrorToStatus(err: unknown): UpdaterStatus {
  return { tipo: "error", mensagem: mensagemErroUpdater(err) };
}

/**
 * Rótulo da UI para o estado `available`. Com uma versão conhecida, cita o
 * número; quando a versão é `"desconhecida"` (ausente no payload), cai para
 * "Nova versão disponível" sem número.
 */
export function rotuloDisponivel(versao: string): string {
  return versao === "desconhecida"
    ? "Nova versão disponível"
    : `Nova versão ${versao} disponível`;
}
