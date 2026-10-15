# Task List: App de Estudos com IA Local (MVP)

> Plano: `tasks/plan.md`. Spec: `SPEC.md`.
> Comandos de verificação: `npm test`, `npm run build`, `npm run lint`, `npm run dev`.

> **Pasta de material real para testes manuais/de aceitação:**
> `C:\Users\enzom\OneDrive\Desktop\Facul` — contém PDFs/arquivos reais de faculdade,
> organizados por matéria. Usar como fonte para validar o app importando conteúdo de verdade
> (dos testes básicos até casos "usuário burro": arquivo vazio, PDF escaneado sem texto,
> arquivo muito grande, formato não suportado, nome com acentos/espaços).
> REGRA: **somente leitura** — nunca modificar, mover ou apagar nada dessa pasta.
> Os testes automatizados (unit/integração) continuam em `tests/` com arquivos de amostra
> próprios do projeto; a pasta Facul é para verificação manual/de aceitação de cada fatia.

## Fase 1: Fundação

### Task 1: Scaffolding do projeto
**Description:** Criar a base Electron + Vite + React + TypeScript com lint e Vitest configurados,
e janela do app abrindo com uma tela placeholder.

**Acceptance criteria:**
- [x] `npm run dev` abre uma janela Electron com uma tela React placeholder.
- [x] `npm run build` conclui sem erros; `npm run lint` roda; `npm test` roda (mesmo que com 1 teste trivial).
- [x] `contextIsolation: true` e `nodeIntegration: false` configurados.

**Verification:**
- [x] Build: `npm run build`
- [x] Testes: `npm test`
- [x] Manual: janela abre em Windows com `npm run dev`

**Dependencies:** None
**Files likely touched:** `package.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/renderer/App.tsx`, `tsconfig.json`, `.eslintrc`
**Estimated scope:** M

### Task 2: Tipos compartilhados e IPC tipado
**Description:** Definir tipos em `shared/types.ts` (Documento, Resumo, Flashcard, Exercicio, modos)
e um esqueleto de IPC tipado (preload + canais) para o renderer chamar o main com segurança.

**Acceptance criteria:**
- [x] Tipos de domínio definidos e exportados.
- [x] Preload expõe uma API tipada ao renderer via `contextBridge`.
- [x] Um canal de teste (ex.: `ping`) funciona renderer→main→renderer.

**Verification:**
- [x] Build: `npm run build`
- [x] Manual: chamada `ping` retorna no renderer

**Dependencies:** Task 1
**Files likely touched:** `src/shared/types.ts`, `src/main/preload.ts`, `src/main/ipc/index.ts`, `src/renderer/state/`
**Estimated scope:** S

### Checkpoint: Fundação
- [x] `npm run build`, `npm run lint`, `npm test` passam
- [x] App abre e o IPC de teste funciona
- [ ] Revisar com o usuário antes de prosseguir

## Fase 2: Núcleo

### Task 3: Importar arquivo e ver texto (fatia vertical)
**Description:** Serviço `files.ts` para ler `.txt`/`.md` e extrair texto de `.pdf` (`pdfjs-dist`);
IPC de importação; UI para escolher arquivo e exibir o texto extraído. PDF sem texto → aviso.

**Acceptance criteria:**
- [x] Importar `.txt`, `.md` e `.pdf` exibe o texto extraído.
- [x] PDF escaneado/sem texto mostra "sem texto extraível".

**Verification:**
- [x] Testes: `npm test` (unit de `files.ts` com arquivos de amostra)
- [x] Manual: importar os 3 formatos

**Dependencies:** Task 2
**Files likely touched:** `src/main/services/files.ts`, `src/main/ipc/`, `src/renderer/views/Importar.tsx`, `tests/files.test.ts`
**Estimated scope:** M

### Task 4: Cliente Ollama + detecção de disponibilidade
**Description:** Serviço `ollama.ts` (`isOllamaRunning`, `generate`) e UI que detecta Ollama
ausente/offline, mostrando instruções claras. Seletor de modelo (default `llama3.1:8b`).

**Acceptance criteria:**
- [x] App detecta se o Ollama está rodando e exibe status.
- [x] Ollama ausente → mensagem com instruções, sem crash.
- [x] Modelo configurável, default `llama3.1:8b`.

**Verification:**
- [x] Testes: `npm test` (ollama mockado)
- [x] Manual: com Ollama parado, ver mensagem de instrução

**Dependencies:** Task 2
**Files likely touched:** `src/main/services/ollama.ts`, `src/main/ipc/`, `src/renderer/components/OllamaStatus.tsx`, `tests/ollama.test.ts`
**Estimated scope:** M

### Task 5: Gerar resumo (fatia vertical)
**Description:** Prompt de resumo com modos curto/longo; chunking para textos grandes; IPC;
UI para escolher modo e ver o resumo.

**Acceptance criteria:**
- [x] Gera resumo nos modos curto e longo a partir do texto importado.
- [x] Textos grandes são divididos em pedaços e resumidos sem estourar o contexto.

**Verification:**
- [x] Testes: `npm test` (fluxo texto→prompt→resposta mockada→resumo)
- [x] Manual: gerar resumo curto e longo de um PDF real

**Dependencies:** Task 3, Task 4
**Files likely touched:** `src/shared/prompts.ts`, `src/main/ipc/`, `src/renderer/views/Resumo.tsx`, `tests/resumo.test.ts`
**Estimated scope:** M

### Task 6: Gerar flashcards (fatia vertical)
**Description:** Prompt que pede flashcards em JSON; parser tolerante + validação de schema;
quantidade escolhível (5–100); UI navegável (virar carta).

**Acceptance criteria:**
- [ ] Gera N flashcards (N escolhido pelo usuário, 5–100) estruturados pergunta/resposta.
- [ ] JSON malformado é tratado (parser tolerante / re-tentativa), sem quebrar a UI.
- [ ] UI permite navegar e virar os cards.

**Verification:**
- [ ] Testes: `npm test` (parsing de respostas boas e malformadas)
- [ ] Manual: gerar e navegar flashcards

**Dependencies:** Task 5
**Files likely touched:** `src/shared/prompts.ts`, `src/main/services/parse.ts`, `src/renderer/views/Flashcards.tsx`, `tests/flashcards.test.ts`
**Estimated scope:** M

### Task 7: Gerar exercícios (fatia vertical)
**Description:** Prompt de exercícios nos modos teórica/prática/mista; quantidade 5–100; parsing
estruturado; UI de lista.

**Acceptance criteria:**
- [ ] Gera lista de exercícios nos três modos (teórica/prática/mista).
- [ ] Quantidade entre 5 e 100 respeitada.
- [ ] Lista exibida de forma legível.

**Verification:**
- [ ] Testes: `npm test` (parsing + limites 5–100)
- [ ] Manual: gerar nos três modos

**Dependencies:** Task 6 (reusa parser/estrutura)
**Files likely touched:** `src/shared/prompts.ts`, `src/main/services/parse.ts`, `src/renderer/views/Exercicios.tsx`, `tests/exercicios.test.ts`
**Estimated scope:** M

### Checkpoint: Núcleo
- [ ] Fluxo completo funciona offline: importar → resumo + flashcards + exercícios
- [ ] `npm test` e `npm run lint` passam
- [ ] Revisar com o usuário

## Fase 3: Persistência e acabamento

### Task 8: Persistência local
**Description:** Serviço `storage.ts` para salvar/carregar documentos e seus artefatos em JSON
no `userData`; UI para reabrir resultados anteriores.

**Acceptance criteria:**
- [ ] Resultados gerados persistem e reabrem após fechar/reabrir o app.
- [ ] Cada documento guarda seus próprios resumo/flashcards/exercícios.

**Verification:**
- [ ] Testes: `npm test` (salvar/carregar round-trip)
- [ ] Manual: fechar e reabrir mantém os dados

**Dependencies:** Task 5, 6, 7
**Files likely touched:** `src/main/services/storage.ts`, `src/main/ipc/`, `src/renderer/views/Historico.tsx`, `tests/storage.test.ts`
**Estimated scope:** M

### Task 9: Aparência e empacotamento
**Description:** Aplicar um visual agradável e consistente; README passo a passo para iniciante;
configurar `npm run package` para gerar um executável.

**Acceptance criteria:**
- [ ] UI consistente e agradável nas telas principais.
- [ ] README explica instalar Node, Ollama, `ollama pull`, `npm install`, `npm run dev`.
- [ ] `npm run package` gera um executável distribuível para Windows.

**Verification:**
- [ ] Build: `npm run build` e `npm run package`
- [ ] Manual: executável abre e funciona

**Dependencies:** Task 8
**Files likely touched:** `src/renderer/` (estilos), `README.md`, `package.json` (config de empacotamento)
**Estimated scope:** M

### Checkpoint: MVP completo
- [ ] Todos os critérios de sucesso da SPEC.md atendidos
- [ ] App roda offline, trata Ollama ausente, persiste dados
- [ ] Pronto para revisão final
