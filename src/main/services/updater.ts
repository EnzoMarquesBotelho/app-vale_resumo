/**
 * Serviço do processo main que envolve o `autoUpdater` do `electron-updater`.
 * Responsável ÚNICO por falar com o `autoUpdater`: configura
 * `autoDownload = false`, assina os 6 eventos, converte cada um em
 * `UpdaterStatus` (via as funções puras de `@shared/updater`) e empurra ao
 * renderer por `webContents.send`. Toda ação é guardada por `app.isPackaged`:
 * em dev / win-unpacked o `autoUpdater` jamais é tocado e o estado reportado é
 * `dev-unavailable`.
 */

import { app, type WebContents } from "electron";
import electronUpdater from "electron-updater";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { IPC_CHANNELS } from "@shared/ipc";
import {
  STATUS_DEV,
  mapAvailableToStatus,
  mapCheckingToStatus,
  mapDownloadedToStatus,
  mapErrorToStatus,
  mapNotAvailableToStatus,
  mapProgressToStatus,
  type UpdaterStatus,
} from "@shared/updater";

/**
 * `electron-updater` é CJS e expõe `autoUpdater` como um GETTER PREGUIÇOSO no
 * objeto default: ao ser lido, instancia o updater (que acessa
 * `app.getVersion()`). Por isso NÃO destruturamos no topo do módulo — ler o
 * getter ali instanciaria o updater só por importar o serviço (ex.: o wiring
 * de push em ipc/index.ts importa este módulo sempre que há `BrowserWindow`,
 * inclusive em testes que não mockam `electron-updater`). Acessamos o getter
 * apenas DENTRO do caminho empacotado (guardado por `app.isPackaged`), em
 * `obterAutoUpdater()`.
 */
function obterAutoUpdater(): AppUpdater {
  return electronUpdater.autoUpdater;
}

/** Último estado conhecido; serve de retorno imediato e de push ao conectar. */
let ultimoStatus: UpdaterStatus = { tipo: "idle" };
/** Getter do webContents alvo do push; definido por `conectarUpdater`. */
let getWC: (() => WebContents | undefined) | null = null;
/** Garante que os 6 eventos são assinados uma única vez (idempotência). */
let assinado = false;
/**
 * FR7: quando a checagem foi disparada pelo boot, um `error` (síncrono OU
 * assíncrono, via evento) NÃO deve virar estado visível. A flag é consultada
 * dentro do handler de `error` e limpa no primeiro evento terminal.
 */
let modoSilencioso = false;

/**
 * Define o alvo do push e emite o estado corrente UMA vez (§4.1,
 * last-write-wins). Só guarda o getter e empurra; não lê `BrowserWindow` nem
 * `webContents` aqui (a leitura é preguiçosa, dentro de `empurrar`).
 */
export function conectarUpdater(
  getWebContents: () => WebContents | undefined,
): void {
  getWC = getWebContents;
  empurrar(ultimoStatus);
}

/** Estado atual (sem efeitos). */
export function statusAtual(): UpdaterStatus {
  return ultimoStatus;
}

/**
 * Empurra ao renderer, guardando o estado. Entre o boot e os eventos
 * assíncronos a janela pode ter fechado; `.send` num webContents destruído
 * lança, por isso a guarda `isDestroyed()`.
 */
function empurrar(status: UpdaterStatus): void {
  ultimoStatus = status;
  // O getter pode falhar em ambientes de teste cujo mock de electron não tem
  // `BrowserWindow.getAllWindows` (o wiring de push roda sempre que
  // `BrowserWindow` é truthy). Degradar para no-op aqui mantém o estado
  // atualizado sem quebrar quem só registra handlers — mesmo espírito
  // defensivo do bloco nativeTheme em ipc/index.ts.
  let wc: WebContents | undefined;
  try {
    wc = getWC?.();
  } catch {
    return;
  }
  if (wc && !wc.isDestroyed()) {
    wc.send(IPC_CHANNELS.atualizacao.status, status);
  }
}

/**
 * Idempotente: configura `autoDownload = false` e assina os 6 eventos uma
 * única vez. Chamada só no caminho empacotado — em dev o `autoUpdater` nunca é
 * tocado.
 */
function garantirAssinatura(): void {
  if (assinado) return;
  assinado = true;
  const autoUpdater = obterAutoUpdater();
  autoUpdater.autoDownload = false;
  autoUpdater.on("checking-for-update", () => {
    empurrar(mapCheckingToStatus());
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    // Há update: a partir daqui erros devem ser visíveis.
    modoSilencioso = false;
    empurrar(mapAvailableToStatus(info));
  });
  autoUpdater.on("update-not-available", () => {
    modoSilencioso = false;
    empurrar(mapNotAvailableToStatus());
  });
  autoUpdater.on("download-progress", (p: ProgressInfo) => {
    empurrar(mapProgressToStatus(p));
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    empurrar(mapDownloadedToStatus(info));
  });
  autoUpdater.on("error", (err: unknown) => {
    // FR7 (erro assíncrono): se veio de uma checagem silenciosa (boot), NÃO
    // empurra `error`; zera para `idle` e some. Senão, mostra o erro.
    if (modoSilencioso) {
      modoSilencioso = false;
      ultimoStatus = { tipo: "idle" };
      return;
    }
    empurrar(mapErrorToStatus(err));
  });
}

/**
 * Verificação de atualização. No app não-empacotado resolve `STATUS_DEV` sem
 * tocar o `autoUpdater`. No empacotado assina os eventos, empurra `checking`,
 * dispara `checkForUpdates()` (o desfecho chega pelos eventos) e retorna
 * `checking`.
 *
 * `silencioso` distingue a origem (FR7): a verificação MANUAL (`false`, padrão)
 * zera `modoSilencioso` para que erros apareçam; a do BOOT (`true`) liga a
 * flag para silenciar tanto o erro síncrono quanto o evento `error` assíncrono.
 * Erro síncrono do disparo, quando NÃO silencioso, vira `error` no push e no
 * retorno; quando silencioso, é engolido e o estado permanece `checking`.
 */
export async function verificarAtualizacao(
  silencioso = false,
): Promise<UpdaterStatus> {
  if (!app.isPackaged) {
    return STATUS_DEV;
  }
  garantirAssinatura();
  modoSilencioso = silencioso;
  empurrar(mapCheckingToStatus());
  try {
    void obterAutoUpdater().checkForUpdates();
  } catch (err) {
    if (silencioso) {
      // Boot offline: engole o erro síncrono e não incomoda.
      modoSilencioso = false;
      return ultimoStatus;
    }
    const estado = mapErrorToStatus(err);
    empurrar(estado);
    return estado;
  }
  return ultimoStatus;
}

/**
 * Inicia o download da versão disponível (autoDownload está desligado). O
 * comportamento depende do estado atual (§6.4): só a partir de `available` o
 * download começa (uma única vez); `downloading`/`ready`/demais são no-op.
 * Em dev resolve `STATUS_DEV` sem tocar o `autoUpdater`.
 */
export async function baixarAtualizacao(): Promise<UpdaterStatus> {
  if (!app.isPackaged) {
    return STATUS_DEV;
  }
  garantirAssinatura();
  if (ultimoStatus.tipo === "available") {
    try {
      void obterAutoUpdater().downloadUpdate();
    } catch (err) {
      const estado = mapErrorToStatus(err);
      empurrar(estado);
      return estado;
    }
    empurrar(mapProgressToStatus({ percent: 0 }));
    return ultimoStatus;
  }
  // downloading / ready / idle / checking / not-available / error → no-op.
  return ultimoStatus;
}

/**
 * Reinicia e instala a atualização já baixada (`quitAndInstall`). Só tem efeito
 * no estado `ready` e no app empacotado; caso contrário é no-op.
 */
export async function reiniciarParaAtualizar(): Promise<void> {
  if (!app.isPackaged) return;
  if (ultimoStatus.tipo !== "ready") return;
  obterAutoUpdater().quitAndInstall();
}

/**
 * Checagem silenciosa do boot (FR1/FR7). No-op em dev. No empacotado assina os
 * eventos, liga `modoSilencioso` e dispara a verificação; o erro síncrono é
 * engolido no `catch` e o assíncrono é silenciado pela flag no handler de
 * `error`.
 */
export async function verificarNoBoot(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    await verificarAtualizacao(true);
  } catch {
    // Defesa extra: qualquer erro síncrono residual é engolido (boot offline
    // não incomoda). `verificarAtualizacao(true)` já trata o caso normal.
  }
}
