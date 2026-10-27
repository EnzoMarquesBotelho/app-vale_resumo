# Plano de implementação — Fatia: Botão de atualização (auto-update via GitHub)

> Fonte: `tasks/design-botao-update.md` (APROVADO, iteração 2) e
> `tasks/design-review.md` (verdict APPROVED). Este plano **sequencia** o design
> aprovado; não re-decide arquitetura. Worktree: `c:\Dev\.worktrees\update`,
> branch `feat/botao-update`. Baseline medida agora (não de memória):
> **476 testes, 41 arquivos, verde**; HEAD `0f05bdc`. `npm run build` e
> `npm run lint` limpos na baseline.
>
> Comandos reais do projeto (de `package.json`):
> - build: `npm run build` (= `tsc --noEmit && electron-vite build`)
> - lint: `npm run lint` (= `eslint .`)
> - testes: `npm test` (= `vitest run`); subset: `npx vitest run <caminho>`
> - empacotar: `npm run package` (electron-vite build + electron-builder NSIS)
>
> Rodar todos os comandos a partir de `c:\Dev\.worktrees\update`. Operações git
> com `git -C c:\Dev\.worktrees\update`.
>
> Regra transversal (NFR3): texto de UI em pt-BR; identificadores em inglês.
> Toda conversa renderer↔main passa por `getApi()` (`src/renderer/api.ts`) —
> nunca `window.api?.`.

---

- [ ] 1. **Gate de empacotamento (bloqueante) — adicionar `electron-updater` como dependência de runtime.**
      Rodar `npm install --save-exact electron-updater@6.8.12` a partir de
      `c:\Dev\.worktrees\update`. Confirmar em `package.json` que ficou em
      `dependencies` (NÃO `devDependencies`) e **sem** range (`"6.8.12"`, sem
      `^`/`~`). Se a `6.8.12` não existir no registro, instalar a última `6.x`
      que passe nos sub-passos abaixo e registrar o número real no worklog.
      **NÃO** tocar `electron-builder.yml` — o bloco `publish:` (provider github,
      owner `EnzoMarquesBotelho`, repo `app-vale_resumo`, `releaseType: release`)
      deve permanecer intacto (é dele que o `autoUpdater` lê o feed em runtime).
      Files: `c:\Dev\.worktrees\update\package.json`,
      `c:\Dev\.worktrees\update\package-lock.json`
      Verify: `npm run build` continua verde (o import ainda não existe, então
      só confirma que o install não quebrou o build); `git -C
      c:\Dev\.worktrees\update diff electron-builder.yml` retorna vazio;
      inspecionar `package.json` e confirmar `electron-updater` em `dependencies`
      com versão exata.

- [ ] 2. **Confirmar empacotamento do módulo (fecha o gate do item 1).**
      Rodar `npm run package` uma vez e confirmar que: (a) `electron-updater`
      aparece como `require(...)` externo no bundle do main em
      `out/main/index.js` (ou no chunk do serviço), **não** inline — prova de que
      `externalizeDepsPlugin()` o externalizou; (b) o módulo existe dentro de
      `release/win-unpacked/resources/app.asar`. Registrar presença/ausência +
      o número de versão real no worklog (item 13). **Se o módulo não estiver no
      asar, o gate falha** e a fatia não avança até resolver (fallback: última
      `6.x` que passe).
      Files: nenhum de código (passo de verificação); saída registrada no worklog
      Verify: inspecionar `out/main` pelo `require("electron-updater")` externo;
      listar o conteúdo do asar (`npx asar list
      release/win-unpacked/resources/app.asar` ou equivalente) e confirmar a
      presença de `node_modules/electron-updater`.

- [ ] 3. **Criar o domínio puro `src/shared/updater.ts` (tipos + mapeamento + saneamento + erro).**
      Definir o tipo discriminado `UpdaterStatus` (variantes `idle`,
      `dev-unavailable`, `checking`, `available{versao}`, `not-available`,
      `downloading{percent}`, `ready{versao}`, `error{mensagem}`) exatamente como
      §4 do design. Implementar as puras (sem importar Electron/electron-updater):
      `STATUS_DEV`, `mapCheckingToStatus`, `mapAvailableToStatus({version})`,
      `mapNotAvailableToStatus`, `mapProgressToStatus({percent})`,
      `mapDownloadedToStatus({version})`, `mapErrorToStatus(err)`,
      `rotuloDisponivel(versao)`, e os helpers `clampPercent` (Math.round
      clampado 0..100, NaN/ausente → 0), `normalizarVersao` (remove prefixo `v`,
      trim, vazio → `"desconhecida"`), `mensagemErroUpdater(err)` (rede →
      "Não foi possível verificar atualizações agora. Verifique sua conexão e
      tente novamente."; genérico → "Não foi possível concluir a atualização.
      Tente novamente mais tarde."; classificação defensiva por string/code, sem
      lançar). As assinaturas recebem objetos estruturais (`{ version }` /
      `{ percent }`), não tipos do pacote — espelha como `src/shared/theme.ts`
      isola a regra pura. Sem version-compare próprio (confiar no `autoUpdater`).
      Files: `c:\Dev\.worktrees\update\src\shared\updater.ts`
      Verify: `npx vitest run tests/shared/updater.test.ts` no item 10; aqui,
      `npm run build` compila sob strict.

- [ ] 4. **Criar o serviço do main `src/main/services/updater.ts` (wrapper do `autoUpdater`).**
      Importar `electron-updater` como CJS: `import electronUpdater from
      "electron-updater"; const { autoUpdater } = electronUpdater;` (confirmar o
      shape contra o `.d.ts` instalado — não chutar). Estado de módulo:
      `ultimoStatus`, `getWC`, `assinado`, `modoSilencioso`. Exportar
      `conectarUpdater(getWebContents)` (guarda o getter e chama `empurrar`
      uma vez), `statusAtual()`, `verificarAtualizacao()`, `baixarAtualizacao()`,
      `reiniciarParaAtualizar()`, `verificarNoBoot()`. Internos: `empurrar(status)`
      (grava `ultimoStatus` e, com guarda `wc && !wc.isDestroyed()`, faz
      `wc.send(IPC_CHANNELS.atualizacao.status, status)`), `garantirAssinatura()`
      (idempotente: `autoUpdater.autoDownload = false` + assina os 6 eventos
      mapeando via as puras do item 3; `update-available`/`update-not-available`
      zeram `modoSilencioso`; o handler de `error` consulta `modoSilencioso` e,
      se verdadeiro, zera para `idle` **sem empurrar**, senão empurra
      `mapErrorToStatus`). Guard `app.isPackaged`: toda ação começa com
      `if (!app.isPackaged) return/resolve STATUS_DEV` (ou no-op) e
      `garantirAssinatura` só roda no caminho empacotado — em dev o `autoUpdater`
      nunca é tocado. Comportamento de `verificarAtualizacao`/`baixarAtualizacao`/
      `reiniciarParaAtualizar`/`verificarNoBoot` exatamente conforme as tabelas de
      §6.4 (baixar por estado: `available`→`downloadUpdate` uma vez +
      `downloading{0}`; `downloading`/`ready`/outros→no-op; `verificarNoBoot`
      põe `modoSilencioso=true`, `try{await verificarAtualizacao()}catch{}`;
      `reiniciar` chama `quitAndInstall` só em `ready` empacotado). Importa
      `@shared/ipc` e `@shared/updater`.
      Files: `c:\Dev\.worktrees\update\src\main\services\updater.ts`
      Verify: exercitado pelos testes do item 11; aqui, `npm run build` compila
      sob strict (acusa qualquer divergência de nome de campo do `UpdateInfo`/
      `ProgressInfo`).

- [ ] 5. **Adicionar o grupo `atualizacao` ao contrato IPC em `src/shared/ipc.ts`.**
      Em `IPC_CHANNELS`, ao lado de `tema`, adicionar o grupo aninhado
      `atualizacao` com `verificar: "atualizacao:verificar"`, `baixar:
      "atualizacao:baixar"`, `reiniciar: "atualizacao:reiniciar"`, `status:
      "atualizacao:status"` (seguro aninhar: ninguém itera `IPC_CHANNELS`). Em
      `AppApi`, adicionar `verificarAtualizacao(): Promise<UpdaterStatus>`,
      `baixarAtualizacao(): Promise<UpdaterStatus>`,
      `reiniciarParaAtualizar(): Promise<void>` e
      `aoAtualizarStatus(ouvinte: (estado: UpdaterStatus) => void): () => void`,
      com os JSDoc de §5.3. Importar `UpdaterStatus` de `./updater`.
      Files: `c:\Dev\.worktrees\update\src\shared\ipc.ts`
      Verify: `npm run build` compila (os tipos passam a ser referenciados pelo
      preload e handlers nos itens seguintes).

- [ ] 6. **Registrar os 3 handlers IPC + wiring do push em `src/main/ipc/index.ts`.**
      Dentro de `registerIpcHandlers`, adicionar três `ipcMain.handle` para
      `atualizacao.verificar/baixar/reiniciar`, cada um resolvendo o serviço por
      **dynamic `import()`** (`const svc = await import("../services/updater.js")`)
      e chamando o método correspondente — **nunca** importar o serviço no topo
      do módulo (isola `electron-updater` do `module-eval` em `ipc.test.ts`).
      Adicionar o wiring do push dentro de um `try { if (BrowserWindow) { void
      import("../services/updater.js").then((svc) =>
      svc.conectarUpdater(() => BrowserWindow.getAllWindows()[0]?.webContents));
      } } catch {}` — espelhando **o mesmo `try/catch` defensivo** do bloco
      `nativeTheme` já presente. (Nota: se algum comentário novo descrever o mock
      de `ipc.test.ts`, dizer `{ ipcMain }`, que é o que o arquivo realmente tem —
      não repetir "{ ipcMain, dialog }".) Importar `UpdaterStatus` de
      `@shared/updater` só como tipo.
      Files: `c:\Dev\.worktrees\update\src\main\ipc\index.ts`
      Verify: `npx vitest run tests/main/ipc.test.ts` continua verde **sem
      edição no teste** (critério de aceite de §8.3.1); `npm run build` compila.

- [ ] 7. **Expor os 4 métodos no preload `src/main/preload.ts`.**
      Adicionar ao objeto `api`: `verificarAtualizacao`, `baixarAtualizacao`,
      `reiniciarParaAtualizar` (cada um um `ipcRenderer.invoke` do canal
      correspondente) e `aoAtualizarStatus(ouvinte)` espelhando **exatamente**
      `aoAlterarTema`: wrapper `handler` com referência estável, `ipcRenderer.on
      (IPC_CHANNELS.atualizacao.status, handler)` e cancelador
      `() => ipcRenderer.removeListener(IPC_CHANNELS.atualizacao.status, handler)`.
      Importar `UpdaterStatus` como tipo.
      Files: `c:\Dev\.worktrees\update\src\main\preload.ts`
      Verify: `npm run build` compila (preload usa a cjs build; o `tsc --noEmit`
      valida a conformidade com `AppApi`).

- [ ] 8. **Disparar a checagem silenciosa do boot em `src/main/index.ts`.**
      Dentro do `app.whenReady().then(async () => { … })` existente, **após**
      `createWindow()`, adicionar
      `void import("./services/updater.js").then((svc) => svc.verificarNoBoot());`
      (import preguiçoso, coerente com o item 6; `verificarNoBoot` é no-op em dev
      e silencioso em erro de rede). Não inserir no topo do módulo.
      Files: `c:\Dev\.worktrees\update\src\main\index.ts`
      Verify: `npm run build` compila; a lógica de boot é coberta indiretamente
      pelos testes do serviço (item 11, caso `verificarNoBoot`).

- [ ] 9. **Criar o hook e o componente do renderer, e montá-lo na Sidebar + estilos.**
      Criar `src/renderer/useUpdater.ts` (molde: `src/renderer/useTema.ts`):
      `status` em `useState<UpdaterStatus>({ tipo: "idle" })`; no `useEffect`,
      assinar `getApi().aoAtualizarStatus` (last-write-wins, sem guarda
      monotônica, §4.1), chamar `getApi().verificarAtualizacao()` no mount para
      popular o estado inicial, e cancelar no cleanup; expor
      `verificar`/`baixar`/`reiniciar` que chamam o main por `getApi()` e aplicam
      o retorno imediato ao estado. Criar
      `src/renderer/components/StatusAtualizacao.tsx` renderizando por estado
      (idle/not-available → "App atualizado" + botão "Verificar atualizações";
      dev-unavailable → texto neutro sem botão; checking → "Verificando
      atualizações…" botão desabilitado; available → `rotuloDisponivel(versao)` +
      botão "Baixar atualização"; downloading → `<progress max={100}
      value={percent}>` com `aria-label` + "Baixando… {percent}%"; ready →
      "Atualização pronta" + botão "Reiniciar para atualizar"; error →
      `status.mensagem` + botão "Tentar novamente"). Acessibilidade (§5.8 #10):
      a região `role="status"`/`aria-live="polite"` envolve **apenas o nó de
      texto**; os botões ficam fora dela; botões `type="button"`, rótulos pt-BR.
      O componente usa `useUpdater()` internamente (hook em componente-folha —
      não no `App` —, de propósito, para não alterar `SidebarProps`). Montar
      `<StatusAtualizacao />` em `Sidebar.tsx` dentro de `sidebar-rodape`, acima
      do `<SeletorTema />`. Adicionar estilos em `src/renderer/styles.css` usando
      os tokens de tema existentes (`--cor-*`, válidos em claro e escuro) para o
      controle e a barra de progresso.
      Files: `c:\Dev\.worktrees\update\src\renderer\useUpdater.ts`,
      `c:\Dev\.worktrees\update\src\renderer\components\StatusAtualizacao.tsx`,
      `c:\Dev\.worktrees\update\src\renderer\components\Sidebar.tsx`,
      `c:\Dev\.worktrees\update\src\renderer\styles.css`
      Verify: `npm run build` compila (inclui o renderer); `npm run lint` limpo.
      UI em si fica no checklist manual (item 12).

- [ ] 10. **Testes unitários do domínio puro — `tests/shared/updater.test.ts`.**
      Sem mocks. Cobrir: cada `map*ToStatus` produz o `UpdaterStatus` correto;
      `clampPercent` (`50.6→51`, `-5→0`, `150→100`, `NaN→0`, `undefined→0`);
      `normalizarVersao` (`"v0.1.2"→"0.1.2"`, `"0.1.2"→"0.1.2"`, `""→
      "desconhecida"`, `"  1.0.0 "→"1.0.0"`); `rotuloDisponivel` (`"0.1.2"→"Nova
      versão 0.1.2 disponível"`, `"desconhecida"→"Nova versão disponível"`);
      `mensagemErroUpdater` (rede → frase de conexão; genérico → frase genérica;
      nunca o detalhe cru); `STATUS_DEV === { tipo: "dev-unavailable" }`.
      Files: `c:\Dev\.worktrees\update\tests\shared\updater.test.ts`
      Verify: `npx vitest run tests/shared/updater.test.ts` — todos passam.

- [ ] 11. **Testes do serviço do main — `tests/main/updater.test.ts` (autoUpdater MOCKADO).**
      `vi.mock("electron-updater", () => ({ default: { autoUpdater }, autoUpdater
      }))` e `vi.mock("electron", …)` com `app.isPackaged` controlável e
      `BrowserWindow.getAllWindows()` devolvendo um `webContents` com `send` e
      `isDestroyed` (molde de §8.2). O mock do `autoUpdater` tem `vi.fn()` para
      `checkForUpdates`/`downloadUpdate`/`quitAndInstall`, `on` capturando
      listeners num `Map`, e a prop `autoDownload`. Importar o serviço por
      caminho relativo (`../../src/main/services/updater.js`). Casos: guard em dev
      (`isPackaged=false` → `dev-unavailable`, **nunca** chama `checkForUpdates`
      nem `on`; `baixar`/`reiniciar`/`verificarNoBoot` idem no-op);
      `autoDownload === false` após `garantirAssinatura`; assinatura dos 6 eventos
      (disparar cada listener e afirmar o `send` com o `UpdaterStatus` esperado,
      ex.: available `{version:"0.1.2"}` → `{tipo:"available",versao:"0.1.2"}`,
      progress `{percent:42.7}` → `{tipo:"downloading",percent:43}`); `baixar` por
      estado (available → `downloadUpdate` uma vez + `downloading`; segundo
      `baixar` em `downloading` → no-op; idle/not-available/error → não chama);
      `quitAndInstall` só em `ready`; boot silencioso erro síncrono (checkForUpdates
      lança → nenhum `send` com `tipo:"error"`); boot silencioso erro assíncrono
      (disparar listener `error` após `verificarNoBoot` → nenhum `error`, volta a
      `idle`); erro manual visível; guarda de `webContents` destruído
      (`isDestroyed→true` → `send` não chamado); idempotência da assinatura
      (contagem de `on` por evento = 1).
      Files: `c:\Dev\.worktrees\update\tests\main\updater.test.ts`
      Verify: `npx vitest run tests/main/updater.test.ts` — todos passam, sem
      rede e sem tocar `C:\Users\enzom\OneDrive\Desktop\Facul`.

- [ ] 12. **Testes dos handlers IPC — `tests/main/ipc-atualizacao.test.ts`.**
      Molde de `tests/main/ipc.test.ts` (captura `ipcMain.handle` num `Map`), com
      `electron-updater` mockado e um `electron` mock incluindo `app.isPackaged`
      controlável e `BrowserWindow` (para o wiring entrar no ramo guardado). Os
      handlers resolvem o serviço por dynamic `import()`, então o mock de
      `electron-updater` é usado. Afirmar: os três canais
      (`atualizacao.verificar/baixar/reiniciar`) são registrados; `verificar` em
      dev (`isPackaged=false`) resolve `dev-unavailable`; `verificar` empacotado
      resolve `checking`; `reiniciar` chama o serviço.
      Files: `c:\Dev\.worktrees\update\tests\main\ipc-atualizacao.test.ts`
      Verify: `npx vitest run tests/main/ipc-atualizacao.test.ts` — todos passam;
      `npx vitest run tests/main/ipc.test.ts` continua verde sem edição.

- [ ] 13. **Worklog da fatia: checklist manual + evidência de verificação.**
      Criar `c:\Dev\.worktrees\update\tasks\worklog-botao-update.md` contendo:
      (a) o checklist manual de §9 (instalar NSIS da `v0.1.1`, publicar uma
      `v0.1.2`, observar available→download→restart; teste offline; teste em dev);
      (b) o resultado do gate de empacotamento (itens 1–2: versão real instalada,
      require externo no bundle, presença no asar); (c) a saída real (colada) de
      `npm run build`, `npm run lint` e `npm test` do item 14, com a nova
      contagem de testes medida. **Não** editar `tasks/PROGRESSO.md`,
      `tasks/todo.md` nem `README.md` (fora do escopo desta fatia).
      Files: `c:\Dev\.worktrees\update\tasks\worklog-botao-update.md`
      Verify: o arquivo existe e contém o checklist manual + a evidência dos três
      comandos; nenhum dos três docs proibidos foi modificado (`git -C
      c:\Dev\.worktrees\update status` não lista `tasks/PROGRESSO.md`,
      `tasks/todo.md`, `README.md`).

- [ ] 14. **Verificação final da fatia (tudo verde) + registro no worklog.**
      Rodar, a partir de `c:\Dev\.worktrees\update`: `npm run build`,
      `npm run lint`, `npm test` — os três devem passar. Confirmar que `npm test`
      reporta os **476 testes preservados** mais os novos arquivos
      (`tests/shared/updater.test.ts`, `tests/main/updater.test.ts`,
      `tests/main/ipc-atualizacao.test.ts`) e que `tests/main/ipc.test.ts`
      continua verde sem edição. Limpar artefatos temporários de `npm run package`
      (`release/`) se não forem versionados. Colar a contagem real no worklog
      (item 13).
      Files: nenhum de código (passo de verificação); saída registrada em
      `c:\Dev\.worktrees\update\tasks\worklog-botao-update.md`
      Verify: `npm run build` sem erros; `npm run lint` sem erros; `npm test`
      verde com contagem ≥ 476 + novos testes.

---

## Notas e suposições

- **Versão `6.8.12` não verificável do repo** (pacote ainda não instalado). O
  item 1 a trata como pin-alvo e o item 2 é o gate bloqueante (require externo +
  asar); fallback documentado: última `6.x` que passe no gate, número real no
  worklog. Os nomes de campo `UpdateInfo.version` / `ProgressInfo.percent` devem
  ser confirmados contra o `.d.ts` instalado (o `tsc --noEmit` do item 4 acusa
  divergência) — não chutar.
- **Sem testes `.test.tsx`**: `vitest.config.ts` inclui só `tests/**/*.test.ts`
  (env `node`, alias apenas `@shared`). O componente/hook do renderer ficam em
  verificação manual (item 12 do checklist, item 9 aqui), consistente com o
  projeto. Os testes do serviço do main importam por caminho relativo
  (`../../src/main/services/updater.js`), como `ipc.test.ts` já faz.
- **Ordem por dependência**: 1→2 (gate) antes de qualquer código; 3 (puro) antes
  de 4 (serviço usa as puras); 5 (contrato) antes de 6/7 (handlers/preload o
  referenciam); 8 (boot) depende de 4; 9 (renderer) depende de 5/7; testes
  10–12 depois do código que exercitam; 13–14 fecham a fatia. Cada item deixa o
  worktree buildável.
- **Não reabrir decisões travadas** (§10 do design): `autoDownload=false`,
  `quitAndInstall` só no "Reiniciar", guard `app.isPackaged`, push espelhando
  `tema:alterado`, import preguiçoso do serviço, last-write-wins no renderer,
  flag `modoSilencioso` para FR7, bloco `publish` do `electron-builder.yml`
  intacto. Sem version-compare próprio.
