# Exercise generation (theoretical/practical/mixed, 5–100) for the study app

Task 7 adds the "generate exercises" vertical slice: a mode-aware prompt (teórica/prática/mista), a tolerant JSON parser that reuses the Task 6 machinery, a typed IPC channel `exercicios:gerar`, and a readable list UI with per-item collapsible answers. The design mirrors flashcards almost one-to-one, which is exactly what the task asked for ("reusa parser/estrutura"). All three modes are implemented and tested, the 5–100 clamp is centralized in `normalizarQuantidade` and exercised end to end, and the shared `extrairBlocoJson` extractor is reused rather than duplicated. The prior review's one blocking concern — missing recorded build/lint/test evidence — is now resolved: commit `57fea50` adds `worklog-task7.md` with build/lint/test output (exit 0, 105 tests) and a real three-mode run against the Facul folder (read-only). Watch for: nothing blocking; the previously-flagged clamp-vs-block asymmetry is now a documented, intentional convention.

**Verdict**: APPROVED

## High-level view

The slice is architecturally clean and faithful to the plan. `parseExercicios` reuses the same `extrairBlocoJson` balancer that flashcards use, accepts both the `{ "exercicios": [...] }` and bare-array shapes, trims fields, drops invalid items, and attaches the `modo` from the generation argument rather than trusting the model to echo it. `gerarExercicios` follows the identical one-retry-then-fail flow as `gerarFlashcards`, normalizes quantity to 5–100, and slices to N.

The three modes are real behavior, not cosmetic: `INSTRUCOES_EXERCICIOS` injects distinct instructions per mode and tests assert the prompt contains "PURAMENTE TEÓRICOS" / "PURAMENTE PRÁTICOS" / "MISTA". The 5–100 bounds are enforced in one place (`normalizarQuantidade`) and covered by both unit and prompt-level tests: quantity 2 → prompt asks for 5 and the returned list is capped at 5; quantity 500 → prompt asks for 100.

The verification evidence that the prior pass gated on now exists. `worklog-task7.md` records `npm run build`, `npm run lint`, and `npm test` (all exit 0, 12 files / 105 tests) and a real three-mode generation against a PDF from the Facul folder, done read-only via a temporary test harness that was removed afterward. That closes the only blocking finding from the previous review.

The Task 6 review's non-blocking note — pick one convention for the clamp-vs-block asymmetry when Task 7 reused `normalizarQuantidade` — is now settled and documented. The decision: the service (`normalizarQuantidade`) is the source of truth and always clamps to 5–100; the UI is early feedback only (blocks the button and warns while out of range). A comment in `Exercicios.tsx` records this, so the asymmetry is intentional rather than accidental.

<details>
<summary>Issues (0)</summary>

No blocking or outstanding issues. Both findings from the prior pass are resolved:

1. ~~Missing recorded verification evidence~~ — **resolved** by `worklog-task7.md` (commit `57fea50`): build/lint/test output plus a real three-mode run against the Facul folder, read-only.
2. ~~Clamp-vs-block asymmetry~~ — **resolved**: service-clamps-always is now the documented convention, with a comment in `Exercicios.tsx`; no user-visible behavior changed.

</details>

<details>
<summary>Details</summary>

### Parser reuse — shared extractor, no duplication

`parseExercicios` is a near-exact structural twin of `parseFlashcards`, and critically it calls the same `extrairBlocoJson` rather than re-implementing the brace/bracket balancer. The only domain differences are the field names (`enunciado`/`resposta` vs `pergunta`/`resposta`) and the object wrapper key (`exercicios` vs `flashcards`). Both the `{ "exercicios": [...] }` object form and a bare `[...]` array are accepted, fields are trimmed, and items missing either field are dropped. The `modo` is attached from the function argument — the model is never trusted to classify its own output — which is asserted in `parseExercicios` tests across all three modes.

### Three modes are distinct behavior

`INSTRUCOES_EXERCICIOS` maps each `ModoConteudo` to a different instruction block: teórica forbids calculations and practical problems, prática forbids purely conceptual questions, mista asks for a balance. `montarPromptExercicios` injects that block before the quantity/JSON-format instructions. The suite asserts the generated prompt contains the mode-specific marker for each of the three modes, and `gerarExercicios` is parametrized over `["teorica","pratica","mista"]` to confirm the happy path for each. The manual run in the worklog shows all three producing coherent, content-relevant lists against a real PDF.

### 5–100 enforcement is centralized and tested

Quantity is clamped by `normalizarQuantidade` (shared with flashcards): rounds non-integers, raises sub-5 to 5, caps above-100 at 100, maps NaN to 5. `gerarExercicios` normalizes before building the prompt and slices the parsed list to N. Tests cover the sub-minimum case (quantidade 2 → prompt asks for 5, returned list capped at 5) and the above-maximum case (500 → prompt asks for 100). The UI uses the same `QUANTIDADE_MINIMA`/`QUANTIDADE_MAXIMA` constants for its input bounds and the enable/disable gate.

### Error handling mirrors the established pattern

`gerarExercicios` throws `SemTextoParaExerciciosError` on empty text, retries once with a corrective prompt on malformed JSON, and throws `ExerciciosInvalidosError` if the retry also fails. The IPC handler maps each known error (Ollama offline, empty text, invalid output) to a user-ready Portuguese phrase and falls back to a generic message otherwise. The IPC tests confirm the channel is registered, the happy path returns the list with the mode, the retry path works, and both the persistent-invalid and generic-failure cases surface friendly messages.

### Verification evidence now recorded

The task contract gates on reviewing the coder's recorded build/lint/test evidence and rejecting if it is missing. The prior pass rejected on exactly this: commit `4bdd940` ticked the `todo.md` boxes but left no worklog. Commit `57fea50` fixes it. `worklog-task7.md` captures `npm run build`, `npm run lint`, and `npm test` all at exit 0 (12 files, 105 tests, with the two Task 7 suites broken out: `exercicios.test.ts` 18, `ipc-exercicios.test.ts` 5), and documents a real three-mode generation against `Analise de Algoritimos/Pratica/Pr_atica1prblemascomputacionais.pdf` (5824 chars) with 5 requested → 5 received in each mode. The manual check used a temporary non-mocked harness that was removed afterward, keeping the committed suite 100% Ollama-mocked; the Facul folder was treated read-only per the rule in `todo.md`. A narrow spot-check of `exercicios.test.ts` confirms the limit and mode assertions match the worklog's claims. Per the contract I did not re-run the full suite; the recorded evidence plus the spot-check satisfy the gate.

</details>

<details>
<summary>File map</summary>

- `src/shared/types.ts` — `Exercicio`, `ModoConteudo`, 5–100 constants (already present from Task 2).
- `src/shared/prompts.ts` — adds `INSTRUCOES_EXERCICIOS`, `montarPromptExercicios`, `montarPromptCorrigirExercicios`.
- `src/shared/ipc.ts` — adds `gerarExercicios` channel + typed `AppApi.gerarExercicios`.
- `src/main/services/parse.ts` — adds `parseExercicios`, `gerarExercicios`, and the two exercise error classes; reuses `extrairBlocoJson`.
- `src/main/ipc/index.ts` — registers `exercicios:gerar` handler + friendly-error mapper.
- `src/main/preload.ts` — exposes `gerarExercicios` on `window.api`.
- `src/renderer/views/Exercicios.tsx` — mode selector, quantity input (5–100), readable `<ol>` with collapsible answers; comment documenting the clamp-vs-block convention.
- `src/renderer/App.tsx`, `src/renderer/styles.css` — wires in the Exercícios view and its styles.
- `tests/main/exercicios.test.ts` — parser + service: three modes, limits, retry, errors (18 tests).
- `tests/main/ipc-exercicios.test.ts` — channel registration, happy path, retry, friendly errors (5 tests).
- `tasks/worklog-task7.md` — recorded build/lint/test evidence + three-mode manual run (commit `57fea50`).
- `tasks/todo.md` — Task 7 checkboxes ticked.

Full diff: `git diff 6f1a24d..4bdd940` (feature) and `git show 57fea50` (evidence + convention comment).

</details>
