# Flashcard generation with tolerant JSON parser and navigable flip-card UI (Task 6) — v2

This is a re-review after the coder remediated the single blocking finding from the prior pass. The slice adds the "generate flashcards" vertical: a prompt that asks the local model for `{"flashcards":[{pergunta,resposta}]}`, a tolerant parser (`parse.ts`) that extracts the JSON block from a noisy response, validates each card, and runs one corrective retry before giving up, plus a navigable flip-card UI (`Flashcards.tsx`) wired through a new `flashcards:gerar` IPC channel. Quantity is user-chosen and normalized to the MVP range 5–100 in one shared helper (`normalizarQuantidade`). Known-error cases (empty text, Ollama offline, unparseable response) surface as friendly messages rather than crashing the UI.

Watch for: nothing blocking. The prior pass rejected solely on missing recorded verification evidence; that is now resolved by `worklog-task6.md` (commit `6f1a24d`), which records exit-0 `npm run build` / `npm run lint` / `npm test` (10 files, 82 tests) and a real-PDF manual run against the Facul folder (confirmed by reading the worklog). Two previously-noted non-blocking items remain and are explicitly deferred in the worklog: silent under-delivery when the model returns fewer than N cards (confirmed), and the clamp-vs-block asymmetry between service and UI (confirmed).

**Verdict**: APPROVED

## High-level view

The blocking gap is closed. The earlier review rejected because the task scopes the review to the diff *plus the coder's recorded build/lint/test evidence* and no such record existed. `worklog-task6.md` now supplies it: recorded exit-0 build/lint/test with a test-count breakdown that matches the actual test files, plus a read-only manual run on a real course PDF (6 requested, 6 received) with the Facul folder left untouched.

The parser remains the heart of the slice and reads as correct. `extrairBlocoJson` balances braces/brackets while tracking string state and escapes, so braces inside question text don't fool it and a truncated block returns `null` instead of a partial parse. `parseFlashcards` accepts both the documented `{flashcards:[...]}` object and a bare array, discards items lacking a non-empty pergunta/resposta, trims survivors, and returns `null` only when nothing usable remains. The failure path is one corrective retry in `gerarFlashcards`, then a typed `FlashcardsInvalidosError` the IPC layer turns into a friendly sentence.

The 5–100 rule lives in `normalizarQuantidade` and is applied at the prompt builders, the service, and the renderer input, with clamp direction, rounding, and NaN→minimum unit-tested. Two residual items stay non-blocking: the service clamps while the UI blocks (different intents for odd input, harmless today), and under-delivery of cards passes silently. Both are documented in the worklog as deferred to Task 7/9, which is a reasonable disposition for a product-visible choice outside this slice.

<details>
<summary>Issues (2)</summary>

1. **Fewer-than-requested cards pass silently** — `gerarFlashcards` returns however many valid cards parse (sliced to at most N) with no lower bound; a model returning 3 cards for a request of 20 yields 3 with no notice. Non-blocking; deferred to the finishing phase per the worklog. Consider surfacing the real count in Task 9's UI pass.
2. **Clamp-vs-block asymmetry** — the renderer blocks generation while quantity is out of range, but the service clamps rather than rejects, so the two layers encode different intents for odd input. Harmless today; pick one convention when Task 7 reuses `normalizarQuantidade` for exercises.

</details>

<details>
<summary>Details</summary>

## Verification evidence (resolved)

The prior pass's only blocking finding was the absence of recorded verification evidence: no `worklog-task6.md`, no evidence body on commit `ea57572`, only `todo.md` checkboxes flipped. Commit `6f1a24d` adds `worklog-task6.md`, which records `npm run build`, `npm run lint`, and `npm test` all at exit 0, with a per-file test breakdown (10 files / 82 tests). That breakdown is consistent with the test files actually present — `tests/main/parse.test.ts` (parser good/malformed, retry, give-up, limit), `tests/main/ipc-flashcards.test.ts` (channel, happy path, retry→success, persistent failure→friendly error), and `tests/shared/prompts.test.ts` (normalizarQuantidade, prompt builders). The worklog also records a read-only manual run through the real import→generate→Ollama path on `Analise de Algoritimos/Pratica/Pr_atica1prblemascomputacionais.pdf` (6 requested, 6 received, cards coherent with the PDF), noting the temporary test harness was removed and the Facul folder was not modified. Per the review contract I did not re-run the suites; I spot-checked the recorded evidence against the production code and the test files, and they correspond.

## Tolerant parsing and malformed-JSON handling

`extrairBlocoJson` scans for the first `{` or `[`, then balances depth while honoring string state and backslash escapes, so a brace inside `"o que é { }?"` is ignored during balancing — there's a dedicated test for exactly that. A block that never closes (truncated model output) returns `null`, which routes to the corrective retry rather than handing downstream a half-object. Code-fenced ```json blocks and surrounding chatter are handled because the scanner only cares about the first balanced block.

`parseFlashcards` layers schema validation on top: it accepts both the documented `{flashcards:[...]}` object and a bare top-level array, runs each candidate through `ehFlashcard` (object with non-empty trimmed `pergunta` and `resposta`), and trims the survivors. A list of `[valid, {pergunta:""}, {foo:"bar"}]` yields just the one valid card; only an entirely unusable result collapses to `null`. The malformed-response test group exercises empty-string, missing-field, invalid-syntax, and no-JSON cases — matching the acceptance criterion "JSON malformado é tratado, sem quebrar a UI".

The retry is bounded to one attempt: `gerarFlashcards` tries the normal prompt, and on `null` issues `montarPromptCorrigirFlashcards` (which re-states the format and echoes the prior bad response), parsing again; a second failure throws `FlashcardsInvalidosError`. The tests confirm both the recovery path and the give-up path, including that the corrective prompt carries the previous response forward.

## 5–100 enforcement

`normalizarQuantidade` rounds, maps NaN→`QUANTIDADE_MINIMA`, and clamps to [5,100]. Every entry point funnels through it — the prompt builders normalize before writing the count, and `gerarFlashcards` normalizes `n` before `slice(0, n)`. The renderer independently bounds its number input and disables the generate button out of range. Rounding (7.4→7, 7.6→8), NaN, and boundary overruns (2→5, 500→100) are asserted. The one asymmetry — UI blocks, service clamps — is a consistency note for Task 7, not a correctness bug.

## Fewer-than-requested cards

`slice(0, n)` caps the result at N but there is no floor. A model that returns 3 valid cards for a request of 50 yields 3 with no signal. This is model-behavior reality rather than a parser bug (the prompt says "exatamente N"), so it's non-blocking; the worklog records the decision to leave user-visible count/warning to the finishing phase.

## IPC and UI wiring

`flashcards:gerar` routes through `gerarFlashcards` with a `gerar` closure bound to the live `modeloSelecionado`, so generation uses whatever model the Task 4 selector chose rather than always the default. `mensagemAmigavelFlashcards` maps `OllamaIndisponivelError`, `SemTextoParaFlashcardsError`, and `FlashcardsInvalidosError` to ready sentences and everything else to a generic fallback. The IPC test confirms channel registration, the happy path (default model passed), retry-then-succeed, persistent-failure→friendly-message, and generic-failure.

The view owns `indice`/`virado` state, flips on card click, navigates with wraparound, and resets the flip on each move; it has a live-region counter and aria labels, and gates generation on both extractable text and a valid quantity. No renderer-level DOM test exists (jsdom still not wired, as the Task 1 review predicted), so the flip-card UI criterion rests on the now-recorded manual run.

## Test coverage

Unit coverage for the service and prompt layers is thorough: `extrairBlocoJson` (fenced, surrounded, bare array, braces-in-strings, no-JSON, truncated), `parseFlashcards` (both shapes, trimming, partial-garbage filtering, invalid-syntax, all-invalid), `gerarFlashcards` (empty-text throw, single-call success, retry success, give-up throw, max-cap slice, over-max normalization, generator-error propagation), the prompt builders, and the IPC handler end to end with a mocked Ollama.

Not tested: any renderer behavior (flip, wraparound, quantity guard) — no DOM seam, so the UI criterion rests on the manual run recorded in the worklog.

</details>

<details>
<summary>File map</summary>

- `src/main/services/parse.ts` — `extrairBlocoJson`, `parseFlashcards`, `gerarFlashcards`, and the two typed error classes
- `src/shared/prompts.ts` — `normalizarQuantidade`, `montarPromptFlashcards`, `montarPromptCorrigirFlashcards`
- `src/main/ipc/index.ts` — `flashcards:gerar` handler + `mensagemAmigavelFlashcards`
- `src/shared/ipc.ts` — `gerarFlashcards` channel + `AppApi` method
- `src/main/preload.ts` — exposes `gerarFlashcards` on `window.api`
- `src/renderer/views/Flashcards.tsx` — navigable flip-card view with quantity control
- `src/renderer/App.tsx` / `src/renderer/styles.css` — mount the Flashcards view + styling
- `tests/main/parse.test.ts`, `tests/main/ipc-flashcards.test.ts`, `tests/shared/prompts.test.ts` — coverage described above
- `tasks/todo.md` — Task 6 checkboxes flipped
- `tasks/worklog-task6.md` — recorded build/lint/test evidence + real-PDF manual run (commit `6f1a24d`)

Full diff: `git show ea57572` (code) and `git show 6f1a24d` (worklog)
</details>
