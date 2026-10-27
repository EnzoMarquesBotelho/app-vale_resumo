# Design técnico — Fatia: Botão de atualização (auto-update via GitHub)

> Fatia pós-MVP. Updater in-app sobre as releases públicas do GitHub, usando
> `electron-updater`. Fonte da verdade: `tasks/roadmap-botao-update.md` (decisões
> confirmadas 2026-10-26) e `tasks/worklog-deploy-github.md` (deploy já feito:
> release pública `v0.1.1` com `latest.yml`). Decisões já confirmadas pelo
> usuário NÃO são re-litigadas aqui — este documento só as refina em detalhe
> implementável.
>
> Branch: `feat/botao-update`. Worktree: `c:\Dev\.worktrees\update`.
> Baseline (medida, não de memória): **476 testes passando, 41 arquivos**
> (`npm test` em `0f05bdc`, tag `v0.1.1`). Build e lint limpos.
> Stack travada: Electron 44 + React 19 + TypeScript 5.9 (strict) + Vite via
> electron-vite 6, IPC tipada por `contextBridge`, persistência JSON em
> `app.getPath('userData')`, Vitest 3 com mocks.
>
> **Esta é uma revisão (iteração 2).** Responde a `tasks/design-review.json`
> (verdict `CHANGES_REQUESTED`: 2 HIGH, 4 MEDIUM, 4 NIT). As decisões que
> endereçam cada finding estão embutidas nas seções (marcadas como
> `[resolve #N]`) e consolidadas em §11 "Respostas à revisão".

---

## 1. Visão geral

O app ganha um updater in-app: ao abrir (apenas no app instalado) ele checa em
segundo plano se há uma versão mais nova publicada no GitHub Releases; se houver,
avisa de forma discreta. Um botão **"Verificar atualizações"** permite forçar a
checagem a qualquer momento. A checagem **só avisa** — o download é decisão do
usuário. Ao aceitar, o app baixa a nova versão em segundo plano com **barra de
progresso**; concluído o download, oferece **"Reiniciar para atualizar"**, que
fecha e reabre já na versão nova (`quitAndInstall`).

O motor é o `autoUpdater` de `electron-updater`, rodando **no processo main**,
com `autoDownload = false`. O renderer nunca fala com o `autoUpdater`: ele
dispara três ações por IPC (`invoke`: verificar / baixar / reiniciar) e recebe
atualizações de estado por **um único canal de push main→renderer**
(`webContents.send`). Esse push **segue o mesmo molde do tema**
(`tema:alterado` + `aoAlterarTema` no preload, com `removeListener` casando a
mesma referência de handler). Uma diferença consciente: o wiring de tema faz
_fan-out_ para **todas** as janelas (`for (const janela of
BrowserWindow.getAllWindows())`), enquanto esta fatia, por o app abrir uma única
janela, empurra para `getAllWindows()[0]` apenas; se um dia houver várias
janelas, troca-se o `getWebContents` por um laço (anotado em §7). Ou seja, o
molde do _preload_/`removeListener` é idêntico; o _fan-out_ do main é
deliberadamente de uma janela por ora. **[resolve #7]** Veja §5.

A realidade técnica central (auto-update só funciona no app empacotado NSIS,
nunca em `npm run dev` nem `win-unpacked`) é tratada por um **guard único**
(`app.isPackaged`): em dev, nada toca o `autoUpdater`; o estado reportado é
`dev-unavailable` ("atualizações disponíveis apenas no app instalado"), sem
lançar erro. Falha de rede na checagem automática do boot é **silenciosa**.

Esta fatia reaproveita padrões já estabelecidos no código, citados ao longo do
documento:

- **Push main→renderer:** `src/main/ipc/index.ts` (handler `tema.definir` e o
  wiring de `nativeTheme.on("updated", …)` que faz
  `janela.webContents.send(IPC_CHANNELS.tema.alterado, estado)` dentro de um
  `try { if (nativeTheme && BrowserWindow) … } catch {}` **defensivo**). O
  comentário desse bloco é explícito: nos mocks ESM de electron dos testes,
  "só TOCAR no named export ausente já lança", por isso o acesso a
  `BrowserWindow`/`nativeTheme` fica protegido. Esta fatia copia **esse guard
  defensivo**, não só o shape feliz (§5.5, **[resolve #1]**).
- **Preload espelhado por `aoAlterarTema`:** `src/main/preload.ts` assina com
  `ipcRenderer.on` guardando a MESMA referência de handler e devolve um
  cancelador que chama `ipcRenderer.removeListener` com essa referência.
- **Contrato IPC tipado:** `src/shared/ipc.ts` (`IPC_CHANNELS` + `AppApi`).
- **Domínio puro compartilhado e testável:** `src/shared/theme.ts`
  (`resolveEffectiveTheme`, `ehThemePreference`) — modelo para a lógica pura
  `evento→estado` desta fatia.
- **Hook de assinatura no renderer:** `src/renderer/useTema.ts` (lê o estado no
  mount, assina mudanças, cancela no cleanup via `getApi()`) — modelo para o
  hook do updater.
- **Componente discreto no rodapé da sidebar:** `src/renderer/components/Sidebar.tsx`
  já tem `sidebar-rodape` com o `SeletorTema`; é onde o controle de atualização
  entra.
- **Mock de electron em teste:** `tests/main/ipc.test.ts` (captura de
  `ipcMain.handle` em um `Map`, mock de electron com **apenas** `{ ipcMain }`)
  — molde dos testes de handler, e a razão de dois cuidados abaixo (§5.5/§5.9).

---

## 2. Stack e dependência nova (travada)

Nenhuma mudança de stack. Uma única dependência nova, **aprovada**:

- **`electron-updater`**, **fixada em `6.8.12`** (exata, sem `^`/`~`), em
  **`dependencies`** (runtime do main), **não** em `devDependencies`. Motivo:
  o `autoUpdater` roda em runtime no processo main do app empacotado; o
  electron-builder empacota o que está em `dependencies` dentro do asar, e o
  `externalizeDepsPlugin()` do `electron.vite.config.ts` externaliza
  justamente as `dependencies` (não as embute no bundle Vite), deixando o
  electron-builder resolvê-las no pacote. Pôr em `devDependencies` quebraria o
  app empacotado (módulo ausente em runtime).
- **Compatibilidade:** `electron-updater 6.x` é o par do `electron-builder 26.x`
  (já presente, `26.15.3`) e do Electron 44. O número exato `6.8.12` é a versão
  que a implementação deve fixar; ele **não é verificável a partir do repo** e
  não precisa ser — a garantia real é o pin exato **mais** o passo bloqueante de
  verificação de empacotamento em §2.1 (que falha a fatia se o módulo não casar
  com o builder). Se na hora do `npm install` a `6.8.12` não existir ou não
  empacotar, a implementação fixa a última `6.x` que passe no gate de §2.1 e
  registra o número real no worklog. **[resolve #8]**
- **Tipos de payload do `electron-updater` (`UpdateInfo.version: string`,
  `ProgressInfo.percent: number`):** usados só na borda (§5.4), passados às
  funções puras como objetos estruturais `{ version }` / `{ percent }`. Os nomes
  de campo seguem a tipagem pública do `electron-updater` 6.x, mas **não foram
  verificados contra o pacote instalado** (ainda não instalado). O risco é baixo
  porque as puras recebem objetos montados à mão nos testes; o acoplamento real
  é só em `updater.ts`, e o `tsc --noEmit` do `npm run build` (§2.1) acusa, em
  tempo de compilação, qualquer divergência de nome de campo. A implementação
  não deve "chutar" os tipos: deve confirmá-los contra o `.d.ts` do pacote
  recém-instalado. **[resolve #8 — nota de tipos]**
- **Sem `@types/…`:** `electron-updater` já publica seus próprios tipos; não é
  preciso pacote de tipos à parte.

### 2.1 Passo bloqueante e inicial da implementação (gate de empacotamento)

Antes de escrever lógica, a implementação DEVE, como primeiro passo, e este é um
**gate que bloqueia a fatia** (se qualquer sub-passo falhar, a fatia não avança
até resolver — não é checklist informativo):

1. `npm install --save-exact electron-updater@6.8.12` (grava em `dependencies`
   com versão exata) e confirmar no `package.json` que ficou em `dependencies`
   e sem range.
2. Rodar `npm run build` (que é `tsc --noEmit && electron-vite build`) e
   confirmar que: (a) o import do `electron-updater` no main compila sob strict;
   (b) ele é **externalizado**, não embutido — procurar `electron-updater` como
   `require(...)` externo em `out/main/index.js` (ou no chunk do serviço), e
   **não** como código inline do pacote. Se aparecer embutido, o
   `externalizeDepsPlugin` não pegou e o gate falha.
3. Rodar `npm run package` uma vez e confirmar que o módulo `electron-updater`
   aparece dentro de `release/win-unpacked/resources/app.asar`. Este é o fato
   que valida a decisão de dependência. Colar o resultado (presença/ausência) no
   worklog da fatia. **Se o módulo não estiver no asar, o gate falha.**
4. Confirmar que o bloco `publish:` do `electron-builder.yml` **permanece
   intacto** (provider github, owner `EnzoMarquesBotelho`, repo
   `app-vale_resumo`, `releaseType: release`) — é dele que o `autoUpdater` lê o
   feed em runtime. **NÃO** alterar nem remover esse bloco.

O `autoUpdater` descobre o feed automaticamente a partir do `app-update.yml`
que o electron-builder gera no pacote (derivado do bloco `publish`), e compara
a versão instalada com o `latest.yml` da release. Nenhuma configuração de feed
em código é necessária nem desejada.

---

## 3. Requisitos (resumo verificável)

Funcionais:

- **FR1** — No app instalado, checagem automática silenciosa no boot (quando
  `app.isPackaged`). Em dev, não checa.
- **FR2** — Botão manual "Verificar atualizações" dispara a checagem sob
  demanda.
- **FR3** — A checagem só NOTIFICA; nunca baixa nem instala sozinha
  (`autoDownload = false`).
- **FR4** — Com uma versão disponível e o usuário optando por atualizar, o
  download roda em segundo plano com barra de progresso (%).
- **FR5** — Concluído o download, o app oferece "Reiniciar para atualizar";
  o clique chama `quitAndInstall` (fecha e reabre na nova versão).
- **FR6** — Em dev / não-empacotado, o estado é `dev-unavailable` com texto
  "atualizações disponíveis apenas no app instalado"; nenhuma chamada ao
  `autoUpdater` acontece.
- **FR7** — Falha de rede/erro na checagem **automática do boot** é silenciosa
  (não incomoda quem abriu offline); erro em **ação manual** vira estado `error`
  com mensagem amigável. Isso vale tanto para o erro **síncrono** do disparo
  quanto para o que chega **depois, pelo evento `error`** do `autoUpdater`
  (§6.4, **[resolve #4]**).
- **FR8** — O controle é discreto quando não há update e visível quando há.

Não-funcionais:

- **NFR1** — 100% sobre as releases do próprio GitHub; nenhuma outra rede.
- **NFR2** — Nada de `nodeIntegration` solto; toda conversa renderer↔main por
  IPC tipado (mantém a fronteira existente).
- **NFR3** — Textos de UI em pt-BR; identificadores em inglês.
- **NFR4** — Os 476 testes atuais continuam passando; os novos testes não
  tocam a rede nem a pasta do usuário (`C:\Users\enzom\OneDrive\Desktop\Facul`).
  Em particular, **`tests/main/ipc.test.ts` continua verde**: a nova fiação não
  pode fazer `registerIpcHandlers()` lançar nem forçar o `module-eval` do
  `electron-updater` nesse arquivo (§5.5/§5.9, **[resolve #1][resolve #2]**).

Fora de escopo (não desenhar): assinatura de código / SmartScreen, canais
beta/stable, rollback, changelog in-app.

---

## 4. Modelo de estados da UI (fonte única da verdade)

Um tipo discriminado em `src/shared/updater.ts` (domínio puro, sem Electron)
descreve o estado que o main empurra e o renderer renderiza:

```ts
// src/shared/updater.ts
export type UpdaterStatus =
  | { tipo: "idle" }                                   // ocioso, nada a fazer
  | { tipo: "dev-unavailable" }                        // não empacotado
  | { tipo: "checking" }                               // verificando
  | { tipo: "available"; versao: string }              // há nova versão X
  | { tipo: "not-available" }                          // já está atualizado
  | { tipo: "downloading"; percent: number }           // baixando (0–100)
  | { tipo: "ready"; versao: string }                  // baixado, pronto p/ reiniciar
  | { tipo: "error"; mensagem: string };               // falha (frase pt-BR)
```

Regras do modelo:

- `percent` é inteiro clampado em `0..100` (ver §6.1).
- `available.versao` e `ready.versao` são a string de versão vinda do
  `UpdateInfo.version` do `autoUpdater` (ex.: `"0.1.2"`), sem o `v`. Quando
  ausente/vazia, vira `"desconhecida"` e a UI omite o número (§5.8, §6.1).
- `error.mensagem` é uma frase pronta em pt-BR (ver §6.3), nunca um detalhe
  interno.
- O estado inicial é `idle` no app empacotado e `dev-unavailable` em dev
  (o main resolve isso já no `register`, ver §5.4).

### 4.1 Regra de ordenação estado ↔ renderer (last-write-wins) **[resolve #3]**

O renderer **sempre renderiza o último `UpdaterStatus` recebido**, seja ele um
push (`atualizacao:status`) ou o retorno de um `invoke`
(`verificarAtualizacao`/`baixarAtualizacao`). **Não há** máquina de estados
monotônica nem guarda cliente contra "regressão" de estado: um `checking` que
chega logo depois de um `idle` simplesmente sobrescreve, e um eventual flicker
transitório `checking → idle` (ou `checking → not-available`) é **aceitável**.

Consequências desta escolha, que removem a ambiguidade apontada na revisão:

- `conectarUpdater` emite o `ultimoStatus` corrente **exatamente uma vez** ao
  conectar (§5.4). O hook (§5.8) assina o push **e** chama
  `verificarAtualizacao()` no mount; se o push inicial e o retorno do `verificar`
  chegarem em ordens diferentes, tudo bem — vence quem chegar por último, e
  ambos convergem para o estado real assim que os eventos do `autoUpdater`
  resolvem.
- Não há necessidade de carimbo de tempo, número de sequência ou comparação de
  "quão avançado" é um estado. A simplicidade é intencional: o `autoUpdater` é a
  fonte da verdade e seus eventos são a palavra final.

---

## 5. Arquitetura e contrato IPC

### 5.1 Arquivos a criar

- `src/shared/updater.ts` — tipos puros (`UpdaterStatus`) **e** a lógica pura
  de mapeamento/erro (§6). Sem dependência de Electron.
- `src/main/services/updater.ts` — serviço do main que envolve o `autoUpdater`:
  configura (`autoDownload = false`, logger), assina os 6 eventos, converte
  cada um para `UpdaterStatus` (via a função pura) e empurra ao renderer; expõe
  `verificar()`, `baixar()`, `reiniciar()`, `verificarNoBoot()`,
  `conectarUpdater()`, `statusAtual()`. Guardado por `app.isPackaged`.

### 5.2 Arquivos a modificar

- `src/shared/ipc.ts` — novos canais em `IPC_CHANNELS` e novos métodos em
  `AppApi`.
- `src/main/ipc/index.ts` — registrar 3 handlers `invoke` e ligar o push do
  serviço de updater à janela. O serviço de updater é importado de forma
  **preguiçosa** (dynamic `import()`), ver §5.9 — por isso o topo de
  `index.ts` **não** ganha `import … from "../services/updater.js"`.
- `src/main/preload.ts` — 3 métodos `invoke` + 1 assinatura de push
  (`aoAtualizarStatus`) espelhando `aoAlterarTema`.
- `src/main/index.ts` — disparar a checagem automática do boot (só quando
  empacotado) depois de criar a janela, **dentro** do
  `app.whenReady().then(async () => { … })` existente (ver §5.7).
- `src/renderer/components/Sidebar.tsx` — montar o novo componente de status no
  `sidebar-rodape`.
- `src/renderer/styles.css` — estilos do controle e da barra de progresso.

Arquivos a criar no renderer:

- `src/renderer/useUpdater.ts` — hook que lê/assina o estado (molde:
  `useTema.ts`).
- `src/renderer/components/StatusAtualizacao.tsx` — o controle discreto.

### 5.3 Canais IPC (em `src/shared/ipc.ts`)

Seguindo o precedente do grupo aninhado `tema` (seguro porque ninguém itera
`IPC_CHANNELS`), adiciona-se um grupo `atualizacao`:

```ts
// dentro de IPC_CHANNELS, ao lado de `tema`
atualizacao: {
  /** Renderer pede uma verificação (manual) e/ou o estado atual. */
  verificar: "atualizacao:verificar",
  /** Renderer pede para iniciar o download da versão disponível. */
  baixar: "atualizacao:baixar",
  /** Renderer pede para reiniciar e instalar (quitAndInstall). */
  reiniciar: "atualizacao:reiniciar",
  /** Main empurra o UpdaterStatus ao renderer (push). */
  status: "atualizacao:status",
},
```

Métodos em `AppApi`:

```ts
/**
 * Dispara uma verificação de atualização (ação manual do botão) e resolve com
 * o estado resultante imediato. No app não-empacotado resolve `dev-unavailable`
 * sem tocar o autoUpdater. Nunca rejeita: falhas viram estado `error` pelo push
 * e um `UpdaterStatus` coerente no retorno.
 */
verificarAtualizacao: () => Promise<UpdaterStatus>;
/**
 * Inicia o download da versão disponível (autoDownload está desligado). No-op
 * seguro (resolve o estado atual) se não houver update disponível ou em dev.
 * O progresso chega pelo push; o retorno é o estado imediato ('downloading' ou
 * o estado atual). Comportamento por estado em §6.4.
 */
baixarAtualizacao: () => Promise<UpdaterStatus>;
/**
 * Reinicia e instala a atualização já baixada (quitAndInstall). Só tem efeito
 * no estado 'ready' e no app empacotado; caso contrário é no-op. Resolve antes
 * de o app fechar.
 */
reiniciarParaAtualizar: () => Promise<void>;
/**
 * Assina as mudanças de estado do updater vindas do main (checking /
 * available / downloading / ready / not-available / error / dev-unavailable).
 * Devolve um cancelador que remove o ouvinte — espelha `aoAlterarTema`.
 */
aoAtualizarStatus: (ouvinte: (estado: UpdaterStatus) => void) => () => void;
```

Decisão: **`verificar` e `baixar` devolvem o `UpdaterStatus` imediato** (além do
push) para que o botão possa refletir `checking`/`downloading` sem esperar o
primeiro evento, e para que o teste de handler possa afirmar o retorno sem
depender do push. `reiniciar` devolve `void` (o app fecha). A regra de
ordenação quando push e retorno competem está em §4.1 (last-write-wins).

### 5.4 Serviço do main — `src/main/services/updater.ts`

Responsável único por falar com o `autoUpdater`. Estrutura:

```ts
import { app, type WebContents } from "electron";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import { IPC_CHANNELS } from "@shared/ipc";
import {
  mapCheckingToStatus, mapAvailableToStatus, mapNotAvailableToStatus,
  mapProgressToStatus, mapDownloadedToStatus, mapErrorToStatus, STATUS_DEV,
} from "@shared/updater";
import type { UpdaterStatus } from "@shared/updater";

// electron-updater é CJS: o autoUpdater é um named no objeto default.
const { autoUpdater } = electronUpdater;

let ultimoStatus: UpdaterStatus = { tipo: "idle" };
let getWC: (() => WebContents | undefined) | null = null;
let assinado = false;
// FR7: quando a checagem foi disparada pelo boot, um `error` assíncrono do
// autoUpdater NÃO deve ser empurrado ao renderer. O flag é consultado DENTRO
// do handler de `error` e limpo no primeiro evento terminal.
let modoSilencioso = false;

/** Define o alvo do push e emite o estado atual UMA vez (§4.1). */
export function conectarUpdater(getWebContents: () => WebContents | undefined): void {
  getWC = getWebContents;
  empurrar(ultimoStatus); // emite o estado corrente uma única vez ao conectar
}

/** Empurra ao renderer com guarda de webContents destruído (§5.5, #6). */
function empurrar(status: UpdaterStatus): void {
  ultimoStatus = status;
  const wc = getWC?.();
  // Entre o boot e os eventos assíncronos a janela pode ter fechado
  // (window-all-closed → app.quit em não-darwin). `.send` num webContents
  // destruído lança — por isso a guarda.
  if (wc && !wc.isDestroyed()) {
    wc.send(IPC_CHANNELS.atualizacao.status, status);
  }
}

/** Idempotente: configura autoUpdater e assina os 6 eventos uma única vez. */
function garantirAssinatura(): void {
  if (assinado) return;
  assinado = true;
  autoUpdater.autoDownload = false;
  autoUpdater.on("checking-for-update", () => empurrar(mapCheckingToStatus()));
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    modoSilencioso = false; // há update: a partir daqui erros são visíveis
    empurrar(mapAvailableToStatus(info));
  });
  autoUpdater.on("update-not-available", () => {
    modoSilencioso = false;
    empurrar(mapNotAvailableToStatus());
  });
  autoUpdater.on("download-progress", (p: ProgressInfo) =>
    empurrar(mapProgressToStatus(p)));
  autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
    empurrar(mapDownloadedToStatus(info)));
  autoUpdater.on("error", (err: unknown) => {
    // #4: erro assíncrono. Se veio de uma checagem silenciosa (boot),
    // NÃO empurra `error`: zera para `idle` e some. Senão, mostra o erro.
    if (modoSilencioso) {
      modoSilencioso = false;
      ultimoStatus = { tipo: "idle" }; // atualiza estado sem empurrar
      return;
    }
    empurrar(mapErrorToStatus(err));
  });
}

export function statusAtual(): UpdaterStatus { return ultimoStatus; }

export async function verificarAtualizacao(): Promise<UpdaterStatus> { /* §6.4 */ }
export async function baixarAtualizacao(): Promise<UpdaterStatus> { /* §6.4 */ }
export async function reiniciarParaAtualizar(): Promise<void> { /* §6.4 */ }

/** Dispara a checagem silenciosa do boot; engole erros síncronos e silencia os assíncronos. */
export async function verificarNoBoot(): Promise<void> { /* §6.4 */ }
```

Mapa evento→ação (assinatura única, dentro de `garantirAssinatura`):

| evento do `autoUpdater` | função pura chamada            | `UpdaterStatus` empurrado        |
|-------------------------|--------------------------------|----------------------------------|
| `checking-for-update`   | `mapCheckingToStatus()`        | `{ tipo: "checking" }`           |
| `update-available`      | `mapAvailableToStatus(info)`   | `{ tipo: "available", versao }`  |
| `update-not-available`  | `mapNotAvailableToStatus()`    | `{ tipo: "not-available" }`      |
| `download-progress`     | `mapProgressToStatus(progress)`| `{ tipo: "downloading", percent }`|
| `update-downloaded`     | `mapDownloadedToStatus(info)`  | `{ tipo: "ready", versao }`      |
| `error`                 | `mapErrorToStatus(err)`        | `{ tipo: "error", mensagem }` (ou nada, se `modoSilencioso`) |

O serviço só guarda `ultimoStatus`, chama `empurrar(...)` e nunca contém lógica
de **forma** de estado — tudo que decide o shape está nas funções puras do
`shared` (testável sem o `autoUpdater`). A única lógica imperativa que o serviço
possui é: (a) o guard `app.isPackaged`, (b) o `modoSilencioso` para FR7, e (c) a
guarda de `webContents` destruído.

**Guard `app.isPackaged`:** todas as funções exportadas de ação começam com
`if (!app.isPackaged) return/resolve STATUS_DEV` (ou no-op). `garantirAssinatura`
só é chamada dentro desse caminho empacotado — em dev o `autoUpdater` jamais é
tocado (nem `autoDownload`, nem `on`, nem `checkForUpdates`). `conectarUpdater`
pode rodar em qualquer modo (só guarda o getter e emite o `ultimoStatus`, que em
dev será `dev-unavailable` ou `idle` — ver §5.5: o wiring o chama só quando há
`BrowserWindow`).

### 5.5 Handlers IPC e wiring do push — `src/main/ipc/index.ts`

Três handlers `invoke`, no mesmo estilo dos demais. Como o serviço de updater é
importado **preguiçosamente** (§5.9), cada handler resolve o módulo com um
`await import(...)`:

```ts
ipcMain.handle(IPC_CHANNELS.atualizacao.verificar, async (): Promise<UpdaterStatus> => {
  const svc = await import("../services/updater.js");
  return svc.verificarAtualizacao();
});
ipcMain.handle(IPC_CHANNELS.atualizacao.baixar, async (): Promise<UpdaterStatus> => {
  const svc = await import("../services/updater.js");
  return svc.baixarAtualizacao();
});
ipcMain.handle(IPC_CHANNELS.atualizacao.reiniciar, async (): Promise<void> => {
  const svc = await import("../services/updater.js");
  return svc.reiniciarParaAtualizar();
});
```

Push ao renderer: dentro de `registerIpcHandlers`, ligar o serviço à janela
**com o MESMO guard defensivo do wiring de `nativeTheme`** já presente no arquivo
(`try { if (nativeTheme && BrowserWindow) … } catch {}`). Sob o mock de
`tests/main/ipc.test.ts` — que expõe apenas `{ ipcMain }` — tocar em
`BrowserWindow` lança; sem a guarda, `registerIpcHandlers()` (chamado no
`beforeEach` daquele arquivo) quebraria **todos** os testes dele, violando a
NFR4. Por isso: **[resolve #1]**

```ts
// Espelha EXATAMENTE o try/catch defensivo do bloco nativeTheme acima.
try {
  if (BrowserWindow) {
    // import preguiçoso: não força o module-eval de electron-updater no
    // caminho de quem só registra handlers sob o mock { ipcMain } (#2).
    void import("../services/updater.js").then((svc) => {
      svc.conectarUpdater(() => BrowserWindow.getAllWindows()[0]?.webContents);
    });
  }
} catch {
  // Ambiente de teste sem BrowserWindow: push desligado, handlers seguem
  // registrados. ipc.test.ts continua verde.
}
```

Pontos-chave desta fiação:

- `conectarUpdater` **só guarda o getter e emite o estado corrente uma vez**;
  ele **não** lê `BrowserWindow`/`webContents` no momento da chamada (a leitura é
  preguiçosa, dentro do `empurrar`, cada vez que há um push). Assim, mesmo que o
  wiring rode, nada estoura por `webContents` ainda não existir. **[resolve #1]**
- O `empurrar` do serviço faz `getWC()?.send(IPC_CHANNELS.atualizacao.status,
  status)` **com guarda de `isDestroyed()`** (§5.4) — espírito idêntico ao
  `janela.webContents.send(IPC_CHANNELS.tema.alterado, estado)`, mas robusto ao
  timing novo da checagem de boot (a janela pode fechar entre o disparo e os
  eventos). **[resolve #6]**

### 5.6 Preload — `src/main/preload.ts`

Três `invoke` + uma assinatura de push que espelha **exatamente**
`aoAlterarTema` (mesma técnica de wrapper com referência estável para o
`removeListener` casar):

```ts
verificarAtualizacao: () => ipcRenderer.invoke(IPC_CHANNELS.atualizacao.verificar),
baixarAtualizacao: () => ipcRenderer.invoke(IPC_CHANNELS.atualizacao.baixar),
reiniciarParaAtualizar: () => ipcRenderer.invoke(IPC_CHANNELS.atualizacao.reiniciar),
aoAtualizarStatus: (ouvinte) => {
  const handler = (_evento: IpcRendererEvent, estado: UpdaterStatus): void =>
    ouvinte(estado);
  ipcRenderer.on(IPC_CHANNELS.atualizacao.status, handler);
  return () =>
    ipcRenderer.removeListener(IPC_CHANNELS.atualizacao.status, handler);
},
```

### 5.7 Boot — `src/main/index.ts`

**Dentro** do callback `app.whenReady().then(async () => { … })` já existente
(que hoje faz `await migrarCadernos(); registerIpcHandlers(); createWindow();`),
após `createWindow()`, disparar a checagem silenciosa do boot (best-effort, não
bloqueia a abertura). O serviço é importado de forma preguiçosa, coerente com
§5.9:

```ts
await migrarCadernos();
registerIpcHandlers();
createWindow();
void import("./services/updater.js").then((svc) => svc.verificarNoBoot());
// verificarNoBoot é no-op em dev e silencioso em erro de rede (FR7).
```

Não inserir no topo do módulo — a chamada precisa do app pronto e da janela já
criada. O `void import(...)` evita puxar `electron-updater` para o grafo de
módulos de quem só importa `registerIpcHandlers` (mesma razão de §5.9).

### 5.8 Renderer — hook e componente

`src/renderer/useUpdater.ts` (molde: `useTema.ts`):

```ts
export interface UsoUpdater {
  status: UpdaterStatus;
  verificar: () => void;
  baixar: () => void;
  reiniciar: () => void;
}
export function useUpdater(): UsoUpdater {
  const [status, setStatus] = useState<UpdaterStatus>({ tipo: "idle" });
  useEffect(() => {
    let ativo = true;
    const cancelar = getApi().aoAtualizarStatus((novo) => {
      if (ativo) setStatus(novo); // last-write-wins (§4.1): sem guarda monotônica
    });
    // estado inicial: uma verificação leve (resolve dev-unavailable em dev,
    // idle/checking no empacotado) para o controle refletir a realidade.
    void getApi().verificarAtualizacao().then((s) => { if (ativo) setStatus(s); });
    return () => { ativo = false; cancelar(); };
  }, []);
  // verificar/baixar atualizam o estado imediato com o retorno do invoke,
  // além de receberem o push depois (last-write-wins).
  // …
}
```

Decisão: o hook chama `verificarAtualizacao()` no mount para popular o estado
inicial coerente (em dev vira `dev-unavailable`; no empacotado dispara a
checagem manual — inofensiva e idempotente junto à do boot). A ordenação entre
esse retorno e o push inicial de `conectarUpdater` segue §4.1 (vence o último).
Toda conversa com o main passa por `getApi()` — nunca `window.api?.` (regra do
projeto, ver `api.ts`).

`src/renderer/components/StatusAtualizacao.tsx` — controle discreto no rodapé da
sidebar. Renderização por estado:

- `idle` / `not-available` → linha discreta "App atualizado" + botão pequeno
  "Verificar atualizações".
- `dev-unavailable` → texto neutro "Atualizações disponíveis apenas no app
  instalado" (sem botão de ação; a UI não tenta nada em dev).
- `checking` → "Verificando atualizações…" (botão desabilitado).
- `available` → destaque visível + botão "Baixar atualização". O rótulo é
  **"Nova versão {versao} disponível"**, **exceto** quando
  `versao === "desconhecida"` (versão ausente no payload): aí o rótulo cai para
  **"Nova versão disponível"** (sem número). Essa condição de render fica num
  helper puro de rótulo (`rotuloDisponivel(versao)`) para ser trivialmente
  testável. **[resolve #9]**
- `downloading` → barra de progresso + "Baixando… {percent}%".
- `ready` → "Atualização pronta" + botão "Reiniciar para atualizar".
- `error` → mensagem amigável (`status.mensagem`) + botão "Tentar novamente"
  (re-dispara `verificar`).

Acessibilidade **[resolve #10]**: a **região viva** (`role="status"` +
`aria-live="polite"`) envolve **apenas o nó de texto** (a frase de status / o
rótulo de progresso "Baixando… {percent}%"). Os **botões** ("Verificar",
"Baixar", "Reiniciar", "Tentar novamente") ficam **fora** da subárvore
`aria-live`, para não serem re-anunciados nem terem o foco interrompido por
leitores de tela ao trocarem de estado. A `<progress max={100} value={percent}>`
nativa recebe `aria-label` próprio; seu rótulo textual visível ("Baixando…
{percent}%") é o conteúdo da região viva. Botões `type="button"`, foco visível e
rótulos pt-BR — mesmo padrão acessível do `SeletorTema`.

`Sidebar.tsx` monta `<StatusAtualizacao />` dentro de `sidebar-rodape`, acima do
`SeletorTema`. O componente usa `useUpdater()` internamente, então a `Sidebar`
não ganha novas props (mantém a assinatura atual intacta).

### 5.9 Isolamento do `electron-updater` sob os mocks de teste **[resolve #2]**

`tests/main/ipc.test.ts` mocka `electron` com **apenas** `{ ipcMain }` e **não**
mocka `electron-updater`. Se `src/main/ipc/index.ts` importasse o serviço de
updater no topo (`import … from "../services/updater.js"`), e o serviço
importasse `electron-updater` no topo, então importar `registerIpcHandlers`
nesse teste **forçaria o `module-eval` do `electron-updater` real** contra um
`electron` stub (sem `app`), cujo efeito colateral de carga não é verificável a
partir do repo e poderia lançar — quebrando a baseline de 476.

**Decisão (opção b da revisão):** `src/main/ipc/index.ts` e `src/main/index.ts`
importam o serviço de updater **preguiçosamente**, via dynamic `import()` dentro
do handler/wiring/boot (ver §5.5 e §5.7), **nunca** no topo do módulo. Assim:

- Quem apenas chama `registerIpcHandlers()` (como `ipc.test.ts`) **não** dispara
  o `module-eval` de `electron-updater`: o `import("../services/updater.js")` só
  roda quando um handler é de fato invocado ou quando o wiring entra no ramo
  `if (BrowserWindow)` — e em `ipc.test.ts` não há `BrowserWindow`, então o
  wiring nem tenta importar.
- Os testes que **exercem** o serviço (`tests/main/updater.test.ts`,
  `tests/main/ipc-atualizacao.test.ts`) fornecem seus próprios
  `vi.mock("electron-updater", …)` e um `vi.mock("electron", …)` com `app`
  (isPackaged controlável) e `BrowserWindow`, de modo que o dynamic import
  resolve o módulo **mockado**, nunca o real.

Rejeitada a opção (a) (adicionar `vi.mock("electron-updater")` e estender o mock
de `electron` em `ipc.test.ts`) porque ela acopla um teste pré-existente e
não-relacionado ao updater a mocks desta fatia; a opção (b) mantém `ipc.test.ts`
intocado e localiza todo o conhecimento do `electron-updater` nos testes da
fatia. Regressão a afirmar em §8: `ipc.test.ts` continua verde sem qualquer
edição.

---

## 6. Lógica pura e regras (testável sem Electron)

Tudo em `src/shared/updater.ts`. Essas funções não importam Electron nem
`electron-updater` (recebem dados simples), espelhando como `theme.ts` isola a
regra pura.

### 6.1 Mapeamento evento→estado

```ts
export const STATUS_DEV: UpdaterStatus = { tipo: "dev-unavailable" };

export function mapCheckingToStatus(): UpdaterStatus { return { tipo: "checking" }; }
export function mapNotAvailableToStatus(): UpdaterStatus { return { tipo: "not-available" }; }

export function mapAvailableToStatus(info: { version: string }): UpdaterStatus {
  return { tipo: "available", versao: normalizarVersao(info.version) };
}
export function mapDownloadedToStatus(info: { version: string }): UpdaterStatus {
  return { tipo: "ready", versao: normalizarVersao(info.version) };
}
export function mapProgressToStatus(p: { percent: number }): UpdaterStatus {
  return { tipo: "downloading", percent: clampPercent(p.percent) };
}
export function mapErrorToStatus(err: unknown): UpdaterStatus {
  return { tipo: "error", mensagem: mensagemErroUpdater(err) };
}

/** Helper de rótulo da UI para `available` (#9), puro e testável. */
export function rotuloDisponivel(versao: string): string {
  return versao === "desconhecida"
    ? "Nova versão disponível"
    : `Nova versão ${versao} disponível`;
}
```

Regras de saneamento (puras):

- `clampPercent(x)`: `Math.round(x)` depois limitado a `0..100`; `NaN`/ausente
  vira `0`. Garante que a barra nunca receba valor inválido.
- `normalizarVersao(v)`: remove um prefixo `v` se vier, faz `trim`; string
  vazia/ausente vira `"desconhecida"`. O helper `rotuloDisponivel` garante que,
  nesse caso, a UI mostre "Nova versão disponível" sem número — a linha que a
  revisão pediu que fosse explícita no render (§5.8). **[resolve #9]**

### 6.2 Comparação de versão

**Decisão:** o updater NÃO compara versões por conta própria. O `autoUpdater`
do electron-updater já decide "há atualização?" comparando a versão instalada
com o `latest.yml` e só então emite `update-available` vs `update-not-available`.
Reimplementar semver seria duplicar (e arriscar divergir de) essa decisão.
Portanto não há função de version-compare nesta fatia; `normalizarVersao` é o
único tratamento de versão, e é puro e testado. (Registrado explicitamente para
não deixar "compare X ou Y" ao implementador: **não comparar**, confiar no
`autoUpdater`.)

### 6.3 Mensagem de erro amigável

`mensagemErroUpdater(err)` (pura) devolve pt-BR pronto para a UI, nunca o
detalhe cru:

- Sem conexão / falha de rede (`err` com `code` de rede ou mensagem contendo
  `net::`/`ENOTFOUND`/`ETIMEDOUT`) → "Não foi possível verificar atualizações
  agora. Verifique sua conexão e tente novamente."
- Qualquer outro → "Não foi possível concluir a atualização. Tente novamente
  mais tarde."

A classificação é por inspeção defensiva do `err` (string/code), sem lançar.

### 6.4 Comportamento das ações (no serviço, usando as puras acima)

- `verificarAtualizacao()`:
  - `!app.isPackaged` → retorna `STATUS_DEV` (não toca `autoUpdater`).
  - empacotado → `garantirAssinatura()`, define `ultimoStatus = { tipo:
    "checking" }` (e empurra `checking`), chama `autoUpdater.checkForUpdates()`
    (sem `await` bloqueante da UI; os eventos trazem o desfecho) e retorna
    `{ tipo: "checking" }`. **Como é a checagem manual, `modoSilencioso` é
    posto em `false`** (erros devem aparecer). Erro **síncrono** do disparo é
    capturado e vira `error` (via `mapErrorToStatus`) tanto no retorno quanto no
    push.
- `baixarAtualizacao()` — comportamento por estado inicial (**[resolve #5]**,
  elimina o "handle appropriately"):

  | estado atual (`ultimoStatus.tipo`) | ação                                   | retorno                         |
  |-----------------------------------|----------------------------------------|---------------------------------|
  | `available`                       | `autoUpdater.downloadUpdate()`         | `{ tipo: "downloading", percent: 0 }` |
  | `downloading`                     | no-op (download já em curso; evita 2º clique / double-click) | `ultimoStatus` (o `downloading` atual) |
  | `ready`                           | no-op (já baixado)                     | `ultimoStatus` (`ready`)        |
  | qualquer outro (`idle`/`checking`/`not-available`/`error`) | no-op | `ultimoStatus` |
  | `!app.isPackaged` (antes de tudo) | no-op, não toca `autoUpdater`          | `STATUS_DEV`                    |

  O download real só começa a partir de `available`; `downloadUpdate` é chamado
  **uma única vez** por ciclo. O progresso real chega por `download-progress`.
- `reiniciarParaAtualizar()`:
  - `!app.isPackaged` ou estado ≠ `ready` → no-op (resolve).
  - estado `ready` e empacotado → `autoUpdater.quitAndInstall()`.
- `verificarNoBoot()` **[resolve #4]**:
  - `!app.isPackaged` → no-op silencioso.
  - empacotado → `garantirAssinatura()`; **põe `modoSilencioso = true`**; então
    `try { await verificarAtualizacao() } catch { /* erro síncrono engolido */ }`.
    O `modoSilencioso` cobre o **erro assíncrono**: se a falha de rede chegar
    pelo evento `error` do `autoUpdater`, o handler (§5.4) vê `modoSilencioso`,
    **não empurra `error`**, zera para `idle` e limpa o flag. Nos eventos
    terminais de sucesso (`update-available`/`update-not-available`) o flag
    também é limpo, para que uma verificação manual posterior volte a mostrar
    erros. Diferença-chave, agora decidida (não mais "ou"): **um único mecanismo
    — a flag `modoSilencioso` — cobre tanto o caminho síncrono quanto o
    assíncrono**; não há `try/catch` capaz de capturar o evento `error` tardio,
    por isso o `try/catch` sozinho foi descartado.

  Nota de corrida: `verificarNoBoot` e a `verificarAtualizacao` do mount do hook
  podem rodar quase juntas. Se a manual roda **depois**, ela põe `modoSilencioso
  = false` e um erro passa a ser visível — comportamento correto (o usuário
  pediu). Se um `error` de boot chega **antes** de qualquer ação manual, fica
  silencioso. Isso é consistente com FR7 e com a regra last-write-wins (§4.1).

### 6.5 Invariantes e dono de cada regra

| Invariante | Dono | Por quê |
|-----------|------|---------|
| Download nunca começa sozinho | serviço main (`autoDownload = false` + `baixar` só em `available`, §6.4) | ponto único que fala com `autoUpdater` |
| `quitAndInstall` só no clique "Reiniciar" | serviço main (`reiniciar` só em `ready`) | garante que nenhuma outra transição instala |
| Nada acontece em dev | serviço main (`app.isPackaged` guard) + `shared` (`STATUS_DEV`) | guard no ponto de contato; estado neutro no domínio |
| `percent` ∈ 0..100 | `shared` (`clampPercent`) | saneamento puro, testável |
| Mensagem de erro é pt-BR amigável | `shared` (`mensagemErroUpdater`) | separa classificação de I/O |
| Erro de boot é silencioso; erro manual é visível | serviço main (flag `modoSilencioso`, §6.4) | única peça que distingue origem da checagem (FR7) |
| Push nunca atinge `webContents` destruído | serviço main (guarda `isDestroyed` em `empurrar`, §5.4) | timing novo do boot; theme nunca enfrentou |
| Renderer mostra o último estado recebido | renderer (`useUpdater`, sem guarda monotônica, §4.1) | ordenação simples e previsível |

---

## 7. Casos de borda

- **Abrir offline (empacotado):** checagem do boot falha → silêncio (via
  `modoSilencioso`, tanto no erro síncrono quanto no evento `error`); o controle
  fica `idle`/"App atualizado" (não mostra erro). Verificação manual depois,
  ainda offline → `error` com a mensagem de conexão.
- **Clicar "Verificar" várias vezes:** `garantirAssinatura` é idempotente
  (assina só uma vez); `checkForUpdates` repetido é inofensivo. O estado
  converge pelo último evento (§4.1).
- **Clicar "Baixar" duas vezes (double-click):** o segundo clique encontra
  `ultimoStatus = downloading` → no-op, retorna o `downloading` atual;
  `downloadUpdate` não é chamado de novo (§6.4). **[resolve #5]**
- **Janela fecha durante o boot/checagem:** se um evento assíncrono chega depois
  de a janela ter fechado, `empurrar` detecta `wc.isDestroyed()` e **não** envia
  (sem crash). **[resolve #6]**
- **Fechar o app durante o download:** sem tratamento especial — o download é do
  `autoUpdater`; ao reabrir, nova checagem recomeça. (Retomar download parcial
  não é requisito.)
- **`download-progress` com `percent` ausente/`NaN`:** `clampPercent` → `0`.
- **`update-available` sem `version`:** `normalizarVersao` → `"desconhecida"`;
  `rotuloDisponivel` → "Nova versão disponível" (sem número). **[resolve #9]**
- **Duas janelas:** o projeto abre uma janela; o push mira `getAllWindows()[0]`
  (fan-out de uma janela, diferente do laço do tema — §1). Se um dia houver
  várias, trocar o `getWebContents` por um laço sobre todas as janelas (como faz
  o wiring de tema) — anotado, não implementado agora. **[resolve #7]**
- **Dev (`npm run dev`) e `win-unpacked`:** `app.isPackaged === false` →
  `dev-unavailable` em todas as ações; `autoUpdater` nunca tocado.

---

## 8. Plano de testes

Framework: Vitest 3, arquivos `.ts` em `tests/` (o `vitest.config` inclui só
`tests/**/*.test.ts`, env `node`, alias `@shared`; **não** há `@main`/`@renderer`,
então os testes do serviço importam por caminho relativo
`../../src/main/services/updater.js`, como `ipc.test.ts` já faz).
**Nenhum teste toca a rede, o `autoUpdater` real nem a pasta
`C:\Users\enzom\OneDrive\Desktop\Facul`.**

### 8.1 Testes unitários do domínio puro — `tests/shared/updater.test.ts`

Sem mocks (funções puras). Cobre:

- Cada `map*ToStatus` produz o `UpdaterStatus` correto (checking, available com
  versão normalizada, not-available, downloading com percent, ready, error com
  mensagem pt-BR).
- `clampPercent`: `50.6 → 51`; `-5 → 0`; `150 → 100`; `NaN → 0`;
  `undefined → 0`.
- `normalizarVersao`: `"v0.1.2" → "0.1.2"`; `"0.1.2" → "0.1.2"`;
  `"" → "desconhecida"`; `"  1.0.0 " → "1.0.0"`.
- `rotuloDisponivel`: `"0.1.2" → "Nova versão 0.1.2 disponível"`;
  `"desconhecida" → "Nova versão disponível"` (sem número). **[cobre #9]**
- `mensagemErroUpdater`: erro de rede → frase de conexão; erro genérico →
  frase genérica; nunca devolve o detalhe cru.
- `STATUS_DEV` é `{ tipo: "dev-unavailable" }`.

### 8.2 Testes do serviço do main — `tests/main/updater.test.ts`

`electron-updater` e `electron` são **mockados**. O mock do `autoUpdater`
expõe `vi.fn()` para `checkForUpdates`, `downloadUpdate`, `quitAndInstall`,
`on` (captura os listeners num `Map`, para o teste disparar eventos à mão) e a
propriedade `autoDownload`. O mock de `electron` expõe `app` com `isPackaged`
**controlável por teste** e `BrowserWindow` cujo `webContents` tem
`send` **e** `isDestroyed` (este último exigido pela nova guarda — §5.4/#6).

Mock de referência (estende o molde de `tests/main/ipc.test.ts`):

```ts
let packaged = true; // cada teste ajusta
let destruido = false; // para o caso de webContents destruído (#6)
const listeners = new Map<string, (...a: unknown[]) => void>();
const send = vi.fn();
const autoUpdater = {
  autoDownload: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => { listeners.set(ev, cb); }),
};
vi.mock("electron-updater", () => ({ default: { autoUpdater }, autoUpdater }));
vi.mock("electron", () => ({
  app: { get isPackaged() { return packaged; } },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send, isDestroyed: () => destruido } }],
  },
}));
```

Casos cobertos:

- **Guard em dev:** com `packaged = false`, `verificarAtualizacao()` resolve
  `dev-unavailable` e **nunca** chama `autoUpdater.checkForUpdates` nem toca
  `autoUpdater.on` (`expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()`,
  `expect(autoUpdater.on).not.toHaveBeenCalled()`).
  `baixar`/`reiniciar`/`verificarNoBoot` idem (no-op, sem tocar o autoUpdater).
- **`autoDownload` é desligado:** no caminho empacotado, após
  `garantirAssinatura`, `autoUpdater.autoDownload === false`.
- **Assinatura dos 6 eventos:** `conectarUpdater(() =>
  BrowserWindow.getAllWindows()[0].webContents)`, disparar cada listener
  capturado e afirmar que `send` recebeu o `UpdaterStatus` esperado (ex.:
  `update-available` com `{ version: "0.1.2" }` → `{ tipo: "available", versao:
  "0.1.2" }`; `download-progress` com `{ percent: 42.7 }` → `{ tipo:
  "downloading", percent: 43 }`).
- **`baixar` por estado (#5):** levar o serviço a `available` (disparando o
  listener `update-available`), então `baixar()` chama `downloadUpdate` **uma**
  vez e retorna `downloading`; com `ultimoStatus` em `downloading` um segundo
  `baixar()` **não** chama `downloadUpdate` de novo (no-op); em `idle`/
  `not-available`/`error`, `baixar()` não chama `downloadUpdate`.
- **`quitAndInstall` só em `ready` (#)**: `reiniciar()` após o listener
  `update-downloaded` chama `quitAndInstall` **uma** vez; em qualquer outro
  estado **não** chama.
- **Boot silencioso — erro síncrono (#4):** `verificarNoBoot()` empacotado com
  `checkForUpdates` lançando → resolve sem empurrar `error` (asserção: nenhum
  `send` com `tipo: "error"`).
- **Boot silencioso — erro assíncrono (#4):** chamar `verificarNoBoot()`, depois
  disparar o listener `error` à mão → **nenhum** `send` com `tipo: "error"`
  (o `modoSilencioso` engoliu); e o estado volta a `idle`.
- **Erro manual é visível:** `verificarAtualizacao()` (manual) e então disparar
  o listener `error` → `send` recebe `{ tipo: "error", … }`.
- **Guarda de webContents destruído (#6):** com `destruido = true`, disparar
  qualquer listener → `send` **não** é chamado (sem crash).
- **Idempotência da assinatura:** chamar `verificarAtualizacao()` duas vezes
  registra os listeners só uma vez (contagem de `autoUpdater.on` por evento = 1).

### 8.3 Testes dos handlers IPC — `tests/main/ipc-atualizacao.test.ts`

Molde de `tests/main/ipc.test.ts` (captura `ipcMain.handle` num `Map`), com
`electron-updater` mockado e um `electron` mock que inclui **`app.isPackaged`
controlável e `BrowserWindow`** (para o wiring entrar no ramo guardado). Como os
handlers importam o serviço via dynamic `import()` (§5.5/§5.9), o mock de
`electron-updater` é resolvido ali. Afirma:

- Os três canais (`atualizacao.verificar/baixar/reiniciar`) são registrados.
- `verificar` em dev (`isPackaged=false`) resolve `dev-unavailable` pelo handler.
- `verificar` empacotado resolve `checking`.
- `reiniciar` chama o serviço (que em `ready` chamaria `quitAndInstall`).

### 8.3.1 Regressão de baseline — `tests/main/ipc.test.ts` intocado **[resolve #1][resolve #2]**

Asserção explícita da fatia (não um teste novo, mas um critério de aceite):
**`tests/main/ipc.test.ts` continua passando SEM nenhuma edição.** Isso só é
verdade porque (a) o wiring do updater em `registerIpcHandlers` está dentro do
mesmo `try { if (BrowserWindow) … } catch {}` defensivo do bloco `nativeTheme`
— sob o mock `{ ipcMain }` daquele arquivo, `BrowserWindow` é `undefined`, o
ramo não executa e o registro **não lança** (#1); e (b) o serviço de updater é
importado por dynamic `import()` apenas dentro de handlers/wiring, de modo que
`registerIpcHandlers()` **não força o `module-eval` de `electron-updater`** no
arquivo que não o mocka (#2). A implementação deve rodar `npx vitest run
tests/main/ipc.test.ts` e confirmar verde antes de seguir.

### 8.4 O que NÃO é testado automaticamente

- O fluxo real download→instalação→reabertura: exige app empacotado + duas
  versões reais e rede ao GitHub. Fica como **checklist manual** (§9).
- O componente React `StatusAtualizacao` e o hook `useUpdater`: verificação
  manual na UI (consistente com o projeto, que deixa componentes de UI em
  verificação manual). Os testes `.ts` cobrem a lógica; não se cria `.test.tsx`.

### 8.5 Baseline

Após a fatia: `npm test` deve continuar verde com os **476 testes atuais** mais
os novos arquivos (`tests/shared/updater.test.ts`, `tests/main/updater.test.ts`,
`tests/main/ipc-atualizacao.test.ts`). A implementação registra a nova contagem
real nos docs (número medido, não estimado).

---

## 9. Checklist manual (fluxo real — só o usuário consegue validar)

Precisa do app empacotado e de duas versões publicadas no GitHub Releases.

1. Garantir que a release `v0.1.1` está publicada com `.exe` + `latest.yml`
   (já está, conforme `worklog-deploy-github.md`).
2. Instalar a `v0.1.1` pelo instalador NSIS (`release/*.exe`) — app instalado,
   não `win-unpacked`.
3. Publicar uma `v0.1.2` seguindo o "Processo de release correto" do worklog
   (bump do `package.json` → commit → tag `v0.1.2` casando com a versão →
   push master + tag → workflow cria a release com `latest.yml`).
4. Abrir a `v0.1.1` instalada e observar, no rodapé da sidebar, o aviso
   discreto de **"Nova versão 0.1.2 disponível"** (checagem automática do boot),
   ou clicar **"Verificar atualizações"** para forçar.
5. Clicar **"Baixar atualização"** e ver a **barra de progresso** avançar.
6. Ao concluir, clicar **"Reiniciar para atualizar"** e confirmar que o app
   fecha e reabre já na `v0.1.2`.
7. Teste negativo offline: abrir sem internet → sem aviso de erro; clicar
   "Verificar" → mensagem amigável de conexão.
8. Teste em dev: `npm run dev` mostra "Atualizações disponíveis apenas no app
   instalado"; nenhum erro no console vindo do `autoUpdater`.

> Observação de ambiente: no Windows sem assinatura de código pode aparecer o
> SmartScreen na 1ª execução do instalador — **fora do escopo** desta fatia.

---

## 10. Resumo das decisões travadas (não reabrir)

- Dependência: `electron-updater@6.8.12` exata em `dependencies`; gate de
  empacotamento no asar como passo inicial bloqueante (§2.1). Bloco `publish`
  do `electron-builder.yml` **intacto**.
- `autoUpdater` no main, `autoDownload = false`; `quitAndInstall` só no clique
  "Reiniciar"; tudo guardado por `app.isPackaged`.
- Push main→renderer por `atualizacao:status` espelhando `tema:alterado`
  (wrapper + `removeListener` no preload); fan-out de uma janela por ora.
- Wiring do push em `registerIpcHandlers` sob o **mesmo `try/catch` defensivo**
  do bloco `nativeTheme`; serviço importado por **dynamic `import()`** (nunca no
  topo) para não quebrar `ipc.test.ts`.
- Modelo de estado e toda lógica de forma/erro/saneamento em
  `src/shared/updater.ts` (puro, testável). Sem version-compare próprio (confiar
  no `autoUpdater`). Ordenação renderer = last-write-wins.
- FR7 implementado por flag `modoSilencioso` (cobre erro síncrono e o evento
  `error` assíncrono); push com guarda de `webContents` destruído.
- Controle discreto no `sidebar-rodape`, acima do `SeletorTema`; visível só
  quando há update; região `aria-live` restrita ao texto, botões fora dela.
- Testes com `autoUpdater` mockado; fluxo real por checklist manual; sem rede
  nem a pasta Facul nos testes; 476 testes preservados e `ipc.test.ts` intocado.

---

## 11. Respostas à revisão (`tasks/design-review.json`)

Verdict recebido: **CHANGES_REQUESTED** (2 HIGH, 4 MEDIUM, 4 NIT). Cada finding
abaixo foi **endereçado** (nenhum foi ignorado nem adiado); as mudanças são
coerentes com os requisitos originais (FR1–FR8, NFR1–NFR4) e com as decisões
travadas que não podem ser reabertas.

- **#1 [HIGH] — `conectarUpdater` quebraria `ipc.test.ts`.** Endereçado em §5.5 e
  §8.3.1: o wiring entra no **mesmo `try { if (BrowserWindow) … } catch {}`
  defensivo** do bloco `nativeTheme`; sob o mock `{ ipcMain }` o ramo não roda e
  o registro não lança. `conectarUpdater` **só guarda o getter e emite o estado
  uma vez**, sem ler `BrowserWindow`/`webContents` na chamada (leitura preguiçosa
  dentro de `empurrar`). Asserção de regressão adicionada (§8.3.1).

- **#2 [HIGH] — handlers puxariam `electron-updater` para `ipc.test.ts`.**
  Endereçado em §5.9 (decisão explícita: **opção b**): `src/main/ipc/index.ts` e
  `src/main/index.ts` importam o serviço por **dynamic `import()`** dentro do
  handler/wiring/boot, nunca no topo, então `registerIpcHandlers()` não força o
  `module-eval` do `electron-updater`. Os testes que exercem o serviço fornecem
  seu próprio `vi.mock("electron-updater")`. `ipc.test.ts` fica intocado
  (§8.3.1). Rejeição da opção (a) justificada.

- **#3 [MEDIUM] — ordenação push vs retorno indefinida.** Endereçado em §4.1:
  regra explícita **last-write-wins**, sem guarda monotônica no cliente; flicker
  transitório aceitável; `conectarUpdater` emite o estado corrente **uma vez** no
  connect. Refletido no `useUpdater` (§5.8).

- **#4 [MEDIUM] — caminho silencioso do boot era um "ou" e não cobria o evento
  `error` assíncrono.** Endereçado em §5.4 e §6.4: mecanismo **único e decidido**
  — flag `modoSilencioso` posta em `verificarNoBoot`, consultada **dentro do
  handler de `error`** (silencia e zera para `idle`), limpa nos eventos
  terminais. Caso de teste assíncrono adicionado (§8.2).

- **#5 [MEDIUM] — comportamento de `baixar` por estado indefinido.** Endereçado
  em §6.4 com **tabela por estado** (`available` → download; `downloading`/
  `ready` → no-op; demais → no-op; dev → `STATUS_DEV`). Casos de teste por estado
  em §8.2.

- **#6 [MEDIUM] — push podia atingir `webContents` destruído.** Endereçado em
  §5.4: `empurrar` guarda com `if (wc && !wc.isDestroyed())`; o mock de §8.2
  ganhou `isDestroyed`, e há caso de teste com `destruido = true`.

- **#7 [NIT] — "exatamente no mesmo molde" exagerava a equivalência com o tema.**
  Endereçado em §1: texto suavizado — o molde do preload/`removeListener` é
  idêntico, mas o fan-out do main é de **uma janela** por ora (laço depois, §7).

- **#8 [NIT] — `6.8.12` não é verificável do repo.** Endereçado em §2/§2.1: o
  número permanece como pin-alvo, explicitamente marcado como não-verificável do
  repo, com o **gate de empacotamento (§2.1) tratado como bloqueante** (asar +
  require externo). Nota de tipos de payload acrescentada (confirmar contra o
  `.d.ts` instalado; `tsc` acusa divergência).

- **#9 [NIT] — rótulo `available` ficava estranho com versão "desconhecida".**
  Endereçado em §5.8 e §6.1: helper puro `rotuloDisponivel(versao)` que, para
  `"desconhecida"`, devolve "Nova versão disponível" sem número; teste em §8.1.

- **#10 [NIT] — `aria-live` envolvia os botões.** Endereçado em §5.8: a região
  `role="status"`/`aria-live="polite"` cobre **apenas o nó de texto**; os botões
  ficam fora da subárvore viva.
