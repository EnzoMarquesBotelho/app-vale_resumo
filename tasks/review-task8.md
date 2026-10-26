# Local JSON persistence for documents and their artifacts (Task 8)

Task 8 adds a `storage.ts` service that saves each imported document and its generated artifacts (summary, flashcards, exercises) as a single `<id>.json` file under `userData/documentos`, wires seven new IPC channels through a friendly-error funnel, and adds a History screen that lists saved documents and reopens them with their artifacts intact. The approach is deliberately simple: no external DB, one file per document, an injectable `baseDir` so tests run against a temp directory without Electron. Both acceptance criteria are met in substance and backed by recorded evidence: a round-trip (`criarDocumento` → save artifact → `carregarDocumento`) returns equal data, and per-document isolation is tested directly. A `worklog-task8.md` now records `npm run build` / `npm run lint` / `npm test` output plus the manual close/reopen check, matching the convention set by Tasks 3–7.

Watch for:
- **Silent persistence failures** (confirmed): `App.tsx` swallows every create/save error in empty `catch {}` blocks. Fail-open is defensible for a personal tool but a permanently unwritable `userData` would look like "History never fills up" with no explanation. Non-blocking.

**Verdict**: APPROVED

## High-level view

The persistence design keeps everything in one place per document. A document is a JSON file named by a generated UUID; artifact saves (`salvarResumo`/`salvarFlashcards`/`salvarExercicios`) load the file, splice in the artifact, and rewrite it, so a document always carries its own artifacts and nothing leaks between documents. Reads tolerate a missing directory (empty list) and skip corrupted files during listing rather than failing the whole History view.

The IPC layer exposes seven channels and funnels every persistence error through one friendly-message translator, surfacing `DocumentoNaoEncontrado` as its own message and everything else as a generic save/load failure, so no internal error text reaches the UI. The renderer treats persistence as best-effort: if `criarDocumento` or an artifact save fails, generation still works, the session just isn't persisted — a fail-open choice that is silent by design.

Evidence is now in place. `worklog-task8.md` records the full build/lint/test run (125 tests, all passing) and the manual close/reopen verification, resolving the blocking finding from the prior review pass. A narrow spot-check of the two Task 8 suites (20 tests) reproduces the recorded counts exactly.

<details>
<summary>Issues (1)</summary>

1. **Silent persistence failures** — `App.tsx` swallows every create/save error with empty `catch {}` blocks, so a user whose disk is full or whose `userData` is unwritable gets no indication their work isn't being saved. Non-blocking for a personal MVP; worth a small visible hint ("não foi possível salvar") on repeated failure, deferred to Task 9 or a user decision.

</details>

<details>
<summary>Details</summary>

### One file per document, splice-and-rewrite for artifacts

Each document is a self-contained JSON record (`DocumentoSalvo`): text plus optional `resumo`/`flashcards`/`exercicios`. Artifact saves are read-modify-write — `salvarResumo` loads the document, spreads a new `resumo` in, and rewrites via `salvarDocumento`, which re-stamps `atualizadoEm`. Because the whole record is rewritten each time and keyed by its own UUID filename, artifacts can't bleed across documents. The test `cada documento guarda seus próprios artefatos (sem vazar entre eles)` asserts exactly this: a resumo on doc1 and flashcards on doc2 stay separate, with the untouched slots `undefined`.

`criarDocumento` returns the record produced by `salvarDocumento` rather than the in-memory object, so the returned `atualizadoEm` matches what's on disk — the round-trip test's `expect(carregado).toEqual(criado)` depends on that detail and passes.

### Resilient reads

`listarDocumentos` treats a missing directory as "no documents" and, during listing, skips any file that fails to parse instead of throwing — a single corrupted JSON won't blank the History screen. `carregarDocumento` distinguishes `ENOENT` (→ typed `DocumentoNaoEncontradoError`) from other IO errors, which propagate. `removerDocumento` uses `rm(..., { force: true })` so deleting an absent id is a no-op, avoiding a delete/refresh race in the UI.

### IPC surface and error funnel

Seven channels (`documento:criar`, `salvar-resumo`, `salvar-flashcards`, `salvar-exercicios`, `listar`, `carregar`, `remover`) are added to the typed contract in `shared/ipc.ts` and registered in `main/ipc/index.ts`, each wrapped so errors route through `mensagemAmigavelPersistencia`. That helper returns the typed not-found message when applicable and a generic "Não foi possível salvar ou carregar os dados" otherwise, so no internal error text reaches the UI. `ipc-storage.test.ts` verifies all seven channels register, that args pass through, and that a thrown service error becomes the friendly message.

### Renderer wiring and the fail-open persistence choice

`App.tsx` orchestrates the flow: importing text creates a saved document; each generation's `onGerado` persists the artifact into that document and bumps a `versaoHistorico` counter so History reloads. Reopening from History (`aoReabrir`) restores both the text and the artifacts, and the per-view remount key (`chaveDocumento`) changes only when the document id changes, preserving a displayed result across saves to the same document.

The persistence calls sit in `try { ... } catch {}` with empty bodies — if creating or saving fails, generation still proceeds but nothing is persisted and the user is never told. For a local personal app this fail-open stance is defensible, but a silent permanent failure (unwritable `userData`, full disk) would look like "History just never fills up" with no explanation. A minimal visible hint on repeated save failure would close that gap. The worklog records that this was left as-is deliberately, since adding a visible warning changes user-facing behavior and belongs to Task 9 or a user decision. Non-blocking.

### Test coverage and recorded evidence

`storage.test.ts` (14 tests) covers create/load round-trip, unique ids, per-document artifact isolation, `atualizadoEm` advancing on save, light-listing flags (`temResumo`/`temFlashcards`/`temExercicios`), newest-first ordering, the cross-session reopen scenario, delete-and-vanish, no-op delete, and overwrite. `ipc-storage.test.ts` (6 tests) covers channel registration, argument pass-through, and error translation. Together they exercise both acceptance criteria directly. The suites use a temp `baseDir` and mock the `electron` module, so they never touch the real user directory.

`worklog-task8.md` records `npm run build` (exit 0), `npm run lint` (exit 0), and `npm test` (exit 0, 125 tests across 14 files), plus the manual close/reopen check against the UI. A narrow spot-check running only the two Task 8 suites reproduced 20 passing tests (storage 14, ipc-storage 6), matching the recorded counts.

Not tested: the corrupted-file skip path in `listarDocumentos` has no dedicated test, and the renderer's silent-catch behavior is untested (no DOM harness in this project). Neither is blocking.

</details>

<details>
<summary>File map</summary>

- `src/main/services/storage.ts` — new persistence service (create/save/load/list/remove, artifact savers, injectable `baseDir`).
- `src/shared/types.ts` — adds `DocumentoSalvo`, `ResumoDocumentoSalvo`.
- `src/shared/ipc.ts` — seven new channel names + `AppApi` methods.
- `src/main/ipc/index.ts` — registers the seven persistence handlers; `mensagemAmigavelPersistencia` error funnel.
- `src/main/preload.ts` — exposes the new API methods to the renderer.
- `src/renderer/views/Historico.tsx` — new History screen (list, reopen, remove).
- `src/renderer/App.tsx` — orchestration: create-on-import, save-on-generate, reopen-from-history.
- `src/renderer/views/{Resumo,Flashcards,Exercicios,Importar}.tsx` — accept saved artifacts and `onGerado` callbacks.
- `src/renderer/styles.css` — History styles.
- `tests/main/storage.test.ts`, `tests/main/ipc-storage.test.ts` — round-trip, isolation, listing, IPC wiring.
- `tasks/worklog-task8.md` — recorded build/lint/test evidence + manual close/reopen check.
- `tasks/todo.md` — Task 8 boxes checked.

Full diff: `git show aec1c92` (code) and `git show 1c4d9a6` (worklog).

</details>
