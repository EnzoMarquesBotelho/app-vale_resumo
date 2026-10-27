# Revisão — Fatia: Botão de atualização (auto-update via GitHub)

Branch: `feat/botao-update`. Worktree: `c:\Dev\.worktrees\update`.
Base: `master`. Diff: 18 arquivos, +2720/−11 (código de app + testes + docs da fatia).

Veredito: **APPROVED** — nenhum bloqueador encontrado.

## Evidência de verificação (lida do worklog, não re-rodada)

Worklog `tasks/worklog-botao-update.md` §2 registra, a partir de
`c:\Dev\.worktrees\update`:

- `npm run build` (= `tsc --noEmit && electron-vite build`): sem erros (exit 0).
- `npm run lint` (= `eslint .`): sem erros/avisos (exit 0).
- `npm test` (= `vitest run`): **514 passed (44 arquivos)** = 476 preservados + 38 novos
  (`tests/shared/updater.test.ts` 22, `tests/main/updater.test.ts` 12,
  `tests/main/ipc-atualizacao.test.ts` 4). `tests/main/ipc.test.ts` segue verde sem edição.
- Gate de empacotamento (§1): `electron-updater@6.8.12` externalizado (require externo
  no bundle do main) e presente em `release/win-unpacked/resources/app.asar`.
- Checklist de verificação MANUAL presente (§3): instalar NSIS v0.1.1, publicar v0.1.2,
  observar available→download→restart, teste offline, teste em dev.

A evidência exigida está completa; nenhum spot-check adicional foi necessário.

## Checagem dos critérios de bloqueio

1. **autoUpdater em MAIN / autoDownload=false / quitAndInstall só no Restart** — OK.
   Serviço em `src/main/services/updater.ts`. `garantirAssinatura` faz
   `autoUpdater.autoDownload = false`. `quitAndInstall` é chamado em um único ponto
   (`reiniciarParaAtualizar`, linha 202), duplamente guardado por
   `if (!app.isPackaged) return;` e `if (ultimoStatus.tipo !== "ready") return;`.
   Só é alcançável pelo handler `atualizacao:reiniciar`, acionado pelo botão
   "Reiniciar para atualizar".

2. **Guard `app.isPackaged` / `dev-unavailable` neutro / boot só empacotado / rede silenciosa** — OK.
   Toda ação exportada começa com `if (!app.isPackaged) return/STATUS_DEV`;
   `garantirAssinatura` só roda no caminho empacotado (em dev o `autoUpdater` nunca
   é tocado — confirmado pelos testes). `verificarNoBoot` é no-op em dev. Falha de rede
   no boot é silenciosa: erro síncrono engolido no `catch` de `verificarAtualizacao(true)`,
   erro assíncrono silenciado pela flag `modoSilencioso` no handler `error` (volta a `idle`
   sem empurrar). Estado neutro `STATUS_DEV = { tipo: "dev-unavailable" }` sem lançar.

3. **Contrato IPC consistente + removeListener** — OK.
   `src/shared/ipc.ts` (grupo `atualizacao` + 4 métodos em `AppApi`),
   `src/main/ipc/index.ts` (3 handlers via dynamic `import()`), `src/main/preload.ts`
   (3 `invoke` + `aoAtualizarStatus`) casam. `aoAtualizarStatus` espelha `aoAlterarTema`:
   handler de referência estável, `ipcRenderer.on(...)` e cancelador com
   `ipcRenderer.removeListener(IPC_CHANNELS.atualizacao.status, handler)`.

4. **Renderer via `getApi()` / estados / progresso / botões / pt-BR / tokens** — OK.
   `useUpdater.ts` usa `getApi()` (nunca `window.api?.`). `StatusAtualizacao.tsx` cobre
   idle/not-available, dev-unavailable, checking, available(`rotuloDisponivel`),
   downloading(`<progress>` + %), ready, error. Botões Verificar/Baixar/Reiniciar/Tentar
   novamente, `type="button"`, textos pt-BR. `role="status"`/`aria-live="polite"` envolve
   só o nó de texto; botões fora. CSS usa apenas tokens (`--cor-*`, `--raio-sm`,
   `--transicao`) definidos em claro e escuro (verificado em `styles.css`).

5. **electron-updater pinado exato / dependência de runtime / publish intacto** — OK.
   `package.json`: `"electron-updater": "6.8.12"` em `dependencies`, sem range.
   `git diff master...feat/botao-update -- electron-builder.yml` vazio (bloco `publish`
   owner `EnzoMarquesBotelho`/repo `app-vale_resumo` intacto).

6. **Testes unitários (mapping, guard, autoDownload=false, quitAndInstall-só-ready) / sem rede ou Facul / 476 preservados / build+lint limpos** — OK.
   `tests/shared/updater.test.ts` cobre cada `map*`, clamp, normalização, rótulo e
   mensagem de erro. `tests/main/updater.test.ts` cobre guard em dev, autoDownload=false,
   idempotência, os 6 eventos, baixar por estado, quitAndInstall só em ready, boot
   silencioso (sync+async), erro manual visível e webContents destruído — tudo com
   `electron`/`electron-updater` mockados, sem rede nem disco. 476 preservados (514 total).

7. **Trabalho fora de escopo** — OK. Nada de assinatura de código, canais, rollback ou
   changelog in-app.

8. **Worklog com checklist manual** — OK (§3 do worklog).

## Observações (não bloqueiam)

- Working tree do worktree tem modificações apenas em `tasks/design-review.json` e
  `tasks/design-review.md` — artefatos de revisão anterior, não os três docs proibidos
  (`PROGRESSO.md`/`todo.md`/`README.md`), que seguem intocados.
- Nota técnica do worklog (acesso preguiçoso ao getter `autoUpdater` via
  `obterAutoUpdater()` guardado por `isPackaged`) é consistente com o código e evita
  instanciar o updater só por importar o serviço, preservando `ipc.test.ts` verde.

Conclusão: a fatia atende aos requisitos aprovados sem introduzir falhas alcançáveis de
correção, segurança ou dados. **APPROVED.**
