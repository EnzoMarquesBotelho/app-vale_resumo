# AGENTS.md — Guia para agentes e colaboradores

Este arquivo orienta qualquer agente de IA (Claude, etc.) ou colaborador que
trabalhe neste repositório. Leia antes de alterar código.

## O que é o projeto

**Desenrola** — um aplicativo de **desktop**, **100% local e offline**, que
transforma material de estudo (`.txt`, `.md`, `.pdf`) em resumos, flashcards,
exercícios, mapas mentais e quizzes usando uma IA que roda na máquina do usuário
(**Ollama**). Também organiza as matérias em cadernos, tem agenda de revisão/
provas, exportação (Markdown/PDF) e auto-update via GitHub.

- Nenhum conteúdo é enviado à internet (exceto a verificação de atualização, que
  fala só com as releases do próprio GitHub).
- Documentação de produto: `README.md` (voltada ao usuário, pt-BR).
- Estado e histórico do projeto: `tasks/PROGRESSO.md` (visão geral) e
  `tasks/todo.md` (checklist). Cada fatia tem um `tasks/roadmap-*.md` com as
  decisões confirmadas.

## Stack

- **Electron + React + TypeScript**, bundle com **Vite** (via `electron-vite`).
- IPC tipado via `contextBridge` no preload. O renderer NUNCA acessa
  `ipcRenderer` direto — só `window.api`, através do helper `getApi()` em
  `src/renderer/api.ts` (lança erro visível se a ponte faltar).
- IA local via **Ollama** (API HTTP em `http://localhost:11434`): `/api/tags`
  (status/modelos), `/api/generate` (geração, `stream:false`).
- Persistência: arquivos JSON em `app.getPath('userData')`. Sem banco externo.
- Testes: **Vitest**, com a chamada HTTP do Ollama **mockada** (sem modelo real
  no CI).
- Auto-update: `electron-updater` lendo as releases do GitHub.

## Estrutura

```
src/main/        processo principal (janela, IPC, serviços, acesso a disco/rede)
  ipc/index.ts   handlers de IPC
  services/      ollama, files, storage, parse, resumo, mapa, quiz, avaliacao,
                 provas, dica, export, updater, pdfDefinicao, themeStorage
  preload.ts     ponte contextBridge (window.api)
src/renderer/    UI React (sidebar + tela de documento com os artefatos)
  api.ts         getApi() — único ponto de acesso ao main
  views/         Importar, Resumo, Flashcards, Exercicios, MapaMental, Quiz,
                 Agenda, Historico/Biblioteca
  styles.css     tokens de tema (claro/escuro via data-theme)
src/shared/      tipos e lógica PURA compartilhada (types, ipc, prompts,
                 notebooks, agenda, theme, updater, quizScore, export/)
tests/           espelha src/; fixtures próprias em tests/
tasks/           PROGRESSO.md, todo.md, roadmap-*.md, worklogs
```

## Comandos

```
npm install      instala dependências
npm run dev      abre o app (dev)
npm run build    tsc --noEmit + electron-vite build
npm run lint     eslint .
npm test         vitest run
npm run package  gera o instalador Windows (NSIS) localmente, sem publicar
```

Antes de considerar qualquer tarefa concluída: **`npm run build`, `npm run lint`
e `npm test` devem passar**. Baseline atual: **1015 testes**.

## Convenções OBRIGATÓRIAS (seguidas desde o início do projeto)

1. **Idioma:** textos de UI e conteúdo gerado em **português (Brasil)**;
   identificadores de código em **inglês**.
2. **Sem dependência nova sem justificar.** O projeto evita deps novas. As
   exceções conscientes até aqui: `pdfmake` (exportação PDF) e
   `electron-updater` (auto-update), ambas pinadas em versão exata. Se precisar
   de uma nova, pinar a versão e justificar.
3. **Renderer fala com o main só via `getApi()`** — nunca `window.api?.` com
   optional chaining silencioso (mascara falhas).
4. **Geração estruturada de IA** (flashcards, exercícios, mapa, quiz, avaliação)
   usa `format: "json"` no Ollama + parser tolerante (`extrairBlocoJson` /
   padrão de `parse.ts`) + validação de schema + re-tentativa corretiva. Resolve
   o modelo via `modeloParaGeracao()` (nunca manda um modelo não instalado).
   Resumo é texto livre (sem `format`).
5. **Erros do Ollama** são classificados: recusa de conexão → "Ollama offline";
   abort/timeout/falha após conectar → mensagem honesta ("a geração falhou ou
   demorou demais; reduza a quantidade"); nunca dizer "offline" para uma geração
   que simplesmente falhou.
6. **Lógica pura em `src/shared/`** sempre que possível (sem Electron/disco/IA),
   para ser testável. Ex.: `agenda.ts`, `theme.ts`, `updater.ts`, `notebooks.ts`,
   `quizScore.ts`, `export/`.
7. **Persistência** com escrita atômica (`.tmp` + rename) e leitura tolerante
   (arquivo corrompido/ausente não derruba o app), como em `storage.ts`.

## DADOS REAIS DO USUÁRIO — somente leitura

A pasta `C:\Users\enzom\OneDrive\Desktop\Facul` contém material real de
faculdade do usuário. Pode ser usada como fonte **somente leitura** para
verificação manual/aceitação. **NUNCA** modificar, mover, renomear ou apagar
nada ali. Testes automatizados **não** dependem dessa pasta — usam fixtures em
`tests/` e `tmpdir`.

## Fluxo de trabalho (git / worktrees / docs)

- **Branch base:** `master`. O repositório remoto é
  `github.com/EnzoMarquesBotelho/app-vale_resumo`.
- Fatias maiores são desenvolvidas em **git worktrees** isolados
  (`.worktrees/<nome>`, branch `feat/<nome>`), com merge **fast-forward** na
  master ao final. `.worktrees/` e `out/` são ignorados por git E pelo ESLint
  (não lintar/commitar worktrees).
- **Não commitar** segredos, `node_modules/`, `out/`, `release/`, nem o
  `*.code-workspace` local.
- **Ao FINAL de qualquer mudança entregue**, atualizar os três documentos
  (regra em `.kiro/steering/manter-docs-atualizados.md`): `tasks/PROGRESSO.md`,
  `tasks/todo.md` e `README.md` — consistentes com o estado real da master
  (conferir `git log` e a contagem de testes de verdade, não de memória).

## Release / versionamento

Processo correto (ver `tasks/worklog-deploy-github.md`):
1. Bumpar a versão em `package.json`.
2. Commitar.
3. Criar uma tag git que **CASA** com a versão (ex.: `v0.1.2` para
   `package.json` 0.1.2) — a versão é bumpada ANTES de taguear.
4. `git push origin master` e depois `git push origin <tag>`.

O GitHub Actions (`.github/workflows/release.yml`) então builda com
`electron-builder --publish never` e cria **uma** Release via
`softprops/action-gh-release`, anexando `.exe` + `.blockmap` + `latest.yml`.
Não deixar o electron-builder publicar (isso duplicava releases).

## Verificação honesta

- Prefira verificar de verdade (rodar build/lint/testes; para lógica pura, testar
  com entradas fixas). Diga o que verificou e o que NÃO conseguiu verificar.
- Auto-update só funciona no app **instalado** (não em `npm run dev`); o fluxo
  real de baixar→reiniciar exige duas versões instaláveis.
- Limitações conhecidas do modelo local: `llama3.1` tende ao binário e usa pouco
  o veredito "parcial" da correção por IA; quantidades grandes (ex.: 100) são
  lentas/instáveis — o app orienta reduzir.
