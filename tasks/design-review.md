# Design review — Fatia "Botão de atualização" (auto-update via `electron-updater`)

Documento revisado: `tasks/design-botao-update.md` (iteração 2, responde a
`tasks/design-review.json` com 2 HIGH, 4 MEDIUM, 4 NIT).
Revisor: subagente de revisão de design, contexto limpo, reivindicações
conferidas contra o código real do worktree `c:\Dev\.worktrees\update`.

---

## Veredito

**APPROVED.**

Zero findings HIGH ou MEDIUM. Os 8 pontos do checklist de revisão estão
decididos em termos testáveis, e as reivindicações estruturais do design foram
verificadas contra o código-fonte (não aceitas de palavra). Os findings abaixo
são todos **NIT** — refinamentos opcionais que não bloqueiam a implementação.

A baseline foi medida de verdade: `npm test` em `0f05bdc` (tag `v0.1.1`) →
**476 testes, 41 arquivos, verde** — exatamente o que o design afirma. `git log`
confirma o HEAD `0f05bdc`.

---

## Findings

### 1. [NIT] Comentário do mock em `ipc/index.ts` diz "{ ipcMain, dialog }", mas o mock real é "{ ipcMain }"

O design (§1, §5.5) ancora a decisão #1/#2 no bloco defensivo
`try { if (nativeTheme && BrowserWindow) … } catch {}` de `ipc/index.ts`. Isso
está correto e verificado. Porém o comentário daquele bloco no código afirma que
os mocks "expõem apenas `{ ipcMain, dialog }`", enquanto `tests/main/ipc.test.ts`
hoje mocka `electron` como **`{ ipcMain }`** apenas (sem `dialog`). Não é um
problema do design — e não afeta a corretude, porque `dialog`/`BrowserWindow` só
são tocados **dentro de handlers/ramos guardados**, nunca no momento do
`registerIpcHandlers()`. Mas o design cita esse comentário como se fosse fiel.

Correção: ao implementar, não repetir a imprecisão. Se algum texto novo
descrever o mock de `ipc.test.ts`, dizer "`{ ipcMain }`" (o que o arquivo
realmente tem). Nada a mudar no design em si.

### 2. [NIT] `StatusAtualizacao` consome o hook internamente — diverge do padrão "hook no topo" do tema

Verifiquei o padrão real: `useTema()` é chamado em **`App.tsx`** (topo) e o
estado desce por props até `Sidebar` → `SeletorTema` (ambos controlados, sem
hook próprio). O design (§5.8) propõe que `StatusAtualizacao` chame
`useUpdater()` **internamente**, mantendo a assinatura de `Sidebar` intacta.
Isso é legítimo (hook em componente-folha é padrão React comum) e a justificativa
— não alterar `SidebarProps` — é boa. Só não é "o mesmo molde do tema" no ponto
de onde o hook vive; o design em §1/§5.8 sugere paralelismo total com o tema no
renderer, o que não é exato.

Correção (opcional): na §5.8, trocar qualquer sugestão de "espelha o wiring do
tema no renderer" por uma nota de que o hook do updater vive no
**componente-folha** (não no `App`), diferente do tema, de propósito, para não
mexer na `Sidebar`. É só clareza; a decisão em si é aceitável.

### 3. [NIT] `verificarNoBoot` + `verificarAtualizacao` do mount disparam duas checagens quase simultâneas

O design assume isso e declara inofensivo (§5.8, §6.4 "Nota de corrida"):
`checkForUpdates` repetido é idempotente e o last-write-wins resolve. Verdadeiro
sob o contrato do `autoUpdater`. O único efeito observável é um possível
`modoSilencioso = false` posto pela checagem manual logo após a do boot, tornando
visível um `error` que o boot teria silenciado — o próprio design reconhece e
aceita isso como correto (o usuário "pediu" a checagem via mount). Registro
apenas para que a implementação não trate a corrida como bug.

Correção (opcional): nenhuma mudança exigida. Se quiser suprimir a dupla
chamada, o hook poderia **não** chamar `verificarAtualizacao()` no mount quando o
estado inicial empurrado por `conectarUpdater` já for suficiente — mas isso
reintroduz a necessidade de um estado inicial coerente em dev, então a escolha
atual (chamar no mount) é defensável. Manter como está.

### 4. [NIT] Nomes de campo `UpdateInfo.version` / `ProgressInfo.percent` não verificáveis do repo

O design já marca isto honestamente (§2, §2.1): o pacote não está instalado, os
nomes seguem a tipagem pública do `electron-updater` 6.x, as funções puras
recebem objetos estruturais (`{ version }` / `{ percent }`) montados à mão nos
testes, e o `tsc --noEmit` do gate (§2.1) acusa divergência em tempo de
compilação. O risco está contido na borda (`updater.ts`). Não é um buraco do
design; é uma incerteza explicitamente assumida e mitigada.

Correção (opcional): nenhuma. A instrução "confirmar contra o `.d.ts` instalado,
não chutar" já está no design e deve ser seguida no passo de implementação.

---

## Verified Assumptions (conferidas contra o código)

1. **Padrão de preload espelhado (`aoAlterarTema`)** — `src/main/preload.ts`
   assina com `ipcRenderer.on(IPC_CHANNELS.tema.alterado, handler)` guardando a
   MESMA referência e devolve `() => ipcRenderer.removeListener(…, handler)`.
   O design (§5.6) copia isto fielmente para `aoAtualizarStatus`. **Correto.**

2. **Bloco defensivo `try { if (nativeTheme && BrowserWindow) … } catch {}`** —
   existe exatamente em `src/main/ipc/index.ts` (wiring de `nativeTheme.on
   ("updated", …)`), com fan-out `for (const janela of
   BrowserWindow.getAllWindows())`. O design (§1, §5.5) ancora o finding #1 nesse
   bloco e propõe espelhá-lo. **Correto.**

3. **`ipc.test.ts` roda hoje com mock `electron = { ipcMain }` e passa** — medido:
   2 testes verdes. `registerIpcHandlers()` não lança sob esse mock porque o
   ramo `nativeTheme && BrowserWindow` fica `undefined` e não executa. Isso
   sustenta a viabilidade de #1 (o novo wiring no mesmo try/catch também não
   quebrará). **Correto.**

4. **Grupo aninhado `IPC_CHANNELS.tema`** existe em `src/shared/ipc.ts` com o
   comentário de que ninguém itera `IPC_CHANNELS`. O design (§5.3) adiciona
   `atualizacao` no mesmo molde aninhado. **Correto e seguro.**

5. **Boot em `src/main/index.ts`** — há `app.whenReady().then(async () => { await
   migrarCadernos(); registerIpcHandlers(); createWindow(); … })`. O design (§5.7)
   insere `void import("./services/updater.js").then(svc =>
   svc.verificarNoBoot())` após `createWindow()`, dentro desse callback.
   **Correto** (o callback é `async` e já existe).

6. **`window-all-closed` → `app.quit()` em não-darwin** confirma o risco de
   `webContents` destruído entre boot e eventos assíncronos que motiva a guarda
   `isDestroyed()` (§5.4, #6). **Correto.**

7. **Alias de módulos** — tanto `electron.vite.config.ts` quanto
   `vitest.config.ts` definem SOMENTE `@shared` (não há `@main`/`@renderer`).
   O design (§8) afirma isso e conclui que os testes do serviço do main importam
   por caminho relativo (`../../src/main/services/updater.js`), como `ipc.test.ts`
   já faz. **Correto.** O serviço poder importar `@shared/ipc` e `@shared/updater`
   também é válido.

8. **`externalizeDepsPlugin()`** está aplicado em `main` e `preload` no
   `electron.vite.config.ts`, externalizando `dependencies`. Sustenta a decisão
   de pôr `electron-updater` em `dependencies` e o gate §2.1 (require externo no
   bundle + presença no asar). **Correto.**

9. **Bloco `publish` do `electron-builder.yml`** — provider `github`, owner
   **`EnzoMarquesBotelho`**, repo **`app-vale_resumo`**, `releaseType: release`,
   com comentário explícito "NÃO remova este bloco". O design (§2.1 passo 4, §10)
   manda preservá-lo intacto. **Correto e preservado.**

10. **Baseline 476 testes / 41 arquivos** — medido via `npm test`: `Tests 476
    passed (476)`, `Test Files 41 passed (41)`. HEAD `0f05bdc` tag `v0.1.1` via
    `git log`. **Correto.**

11. **`vitest.config.ts`**: env `node`, include `tests/**/*.test.ts`. O design
    (§8) afirma isto e conclui que não cria `.test.tsx` para o componente/hook
    (verificação manual de UI). **Consistente com a config.**

12. **Stack e versões** — `package.json` confirma Electron `44.7.2`,
    `electron-builder 26.15.3`, React `19.3.1`, TypeScript `5.9.3`, Vitest
    `3.2.7`, e `dependencies` atuais (`pdfjs-dist`, `pdfmake`) sem
    `electron-updater` ainda. Coerente com "uma única dependência nova" (§2).

13. **Nenhum arquivo `updater.*` existe** no worktree — confirma que todos os
    arquivos de §5.1 são criações novas, sem colisão.

14. **Mapa evento→estado** (§5.4/§6.1) cobre os 6 eventos exigidos
    (`checking-for-update`, `update-available`, `update-not-available`,
    `download-progress`, `update-downloaded`, `error`) com destino explícito e
    isolado em funções puras no `shared`. **Completo e testável.**

---

## Unverified / Wrong Assumptions

1. **`UpdateInfo.version: string` e `ProgressInfo.percent: number`** —
   **NÃO verificável do repo** (pacote `electron-updater` ainda não instalado).
   O design assume os nomes de campo da API 6.x. Mitigado por: funções puras
   recebem objetos estruturais nos testes + `tsc --noEmit` no gate §2.1 acusa
   divergência. Risco baixo, explicitamente reconhecido (ver NIT #4). A
   implementação DEVE confirmar contra o `.d.ts` instalado.

2. **Shape do import CJS `electron-updater` (`default.autoUpdater` + named
   `autoUpdater`)** — **NÃO verificável do repo**. O design (§5.4) usa
   `import electronUpdater from "electron-updater"; const { autoUpdater } =
   electronUpdater;` e o mock de teste espelha
   `{ default: { autoUpdater }, autoUpdater }`. É o padrão conhecido do pacote
   (CJS com default), mas só o pacote instalado confirma. Mitigado pelo gate de
   build §2.1 (o `tsc`/build falha se o import não resolver).

3. **`electron-updater@6.8.12` existir no registro e empacotar no asar** —
   **NÃO verificável do repo**. O design trata o número como pin-alvo e
   transforma a validação no gate bloqueante §2.1 (asar + require externo),
   com fallback documentado para a última `6.x` que passe no gate. Abordagem
   correta: a incerteza está isolada e tem um portão que falha a fatia se não
   casar.

4. **Comportamento de carga do `electron-updater` real sob um stub de `electron`
   sem `app`** — **NÃO verificável do repo** (o design só afirma que "poderia
   lançar"). Isso é precisamente o motivo da decisão de import preguiçoso (§5.9);
   a decisão não depende de saber se lança ou não, apenas evita o `module-eval`
   no caminho de `ipc.test.ts`. A solução é robusta a essa incerteza.

---

## Cobertura do checklist de revisão solicitado

- autoUpdater no MAIN, `autoDownload=false`, `quitAndInstall` só no "Reiniciar":
  **decidido e testável** (§5.4 `garantirAssinatura` zera `autoDownload`; §6.4/§6.5
  tabela de `baixar` por estado e `reiniciar` só em `ready`; casos em §8.2).
- Checagem automática no boot + manual "Verificar"; checagem só notifica:
  **decidido** (FR1–FR3, §5.7 boot, §5.8 botão, `autoDownload=false`).
- Guard `app.isPackaged`: dev nunca toca o `autoUpdater`, estado
  `dev-unavailable`, nada lança, boot só empacotado, falha de rede no boot
  silenciosa: **decidido e testável** (FR6/FR7, §5.4 guard, §6.4 `verificarNoBoot`
  + `modoSilencioso`, casos em §8.2).
- Contrato IPC concreto (canais + payloads de `verificar/baixar/reiniciar` e o
  canal de push `atualizacao:status`), localizado em `src/shared/ipc.ts`,
  `src/main/ipc/index.ts`, `src/main/preload.ts`, espelhando `tema:alterado` com
  `removeListener`: **decidido** (§5.3, §5.5, §5.6). Shapes de payload tipados
  por `UpdaterStatus`.
- Mapeamento evento→estado isolado como lógica pura testável: **decidido**
  (§6.1 em `src/shared/updater.ts`, sem Electron; testes §8.1).
- Estados de UI idle/checking/available(vX)/downloading(%)/ready/error/
  dev-unavailable + placement no `sidebar-rodape`, textos pt-BR: **decidido**
  (§4 tipo discriminado, §5.8 render por estado, NFR3).
- `electron-updater` pin exato em `dependencies` (runtime) + bloco `publish`
  (owner/repo) preservado: **decidido** (§2, §2.1; publish verificado no YAML).
- Plano de testes com `autoUpdater` mockado (mapping, guard isPackaged,
  `autoDownload=false`, `quitAndInstall` só em restart), sem rede, 476
  preservados, fluxo real em checklist manual: **decidido** (§8, §9).
- Nada fora de escopo (sem code signing, canais, rollback, changelog):
  **respeitado** (§3 "Fora de escopo", §10).

Todos os 8 pontos resolvidos sem ambiguidade bloqueante.
