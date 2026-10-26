# Gerar resumo (modos curto/longo) com chunking map→reduce

Task 5 adds a vertical slice that turns the imported text into an AI summary. A `resumo.ts` service runs in the main process, splits large text into paragraph-aware chunks, and summarizes with a single call for small inputs or a map→reduce for large ones. The chosen mode (curto/longo) flows from a `<select>` in `Resumo.tsx` through the typed `resumo:gerar` IPC channel into the prompt builder, and the service reuses the Task 4 model selector so generations hit whatever model the user picked. Known-error cases (empty text, Ollama offline) surface as friendly, user-ready messages. Evidence of build/lint/test and a real-PDF manual run is recorded in `worklog-task5.md`.

Watch for: single-pass reduce can pressure the context window on very large documents (confirmed, non-blocking — author documented it as a deliberate MVP limit); build/lint/test results are self-reported exit codes, not re-run here (per review scope).

**Verdict**: APPROVED

## High-level view

The design is a clean map→reduce. `dividirEmChunks` cuts on paragraph boundaries up to a 12000-char ceiling and falls back to hard slicing for a single oversized paragraph, so no chunk can exceed the limit. Small text takes the single-call path; large text summarizes each chunk then combines the partials. The combine step is single-pass by design, which the author flagged in the service header as a known MVP limit — acceptable for typical faculty material, worth revisiting for very large PDFs.

Both modes are wired end to end. The renderer's mode select feeds `gerarResumo(texto, modo)` across preload → IPC → service → `montarPromptResumo`, and the mode string drives distinct `curto`/`longo` instruction blocks. The manual PDF run confirmed the long summary came out ~3x the short one from the same source, matching the intent.

Error handling is fail-closed and user-facing: empty text raises a coded `SemTextoParaResumirError`, Ollama-offline propagates, and the IPC layer maps both (plus a generic fallback) to ready-to-display Portuguese sentences. The model selector from Task 4 is threaded in rather than hardcoding the default.

Test coverage hits the chunking edge cases, the single-call and map→reduce paths, error propagation, both prompt modes, and the IPC channel contract. The map→reduce path is exercised via a reduced `tamanhoChunk`; the real-PDF input fit in one chunk, so the production large-text path was validated by unit tests rather than the manual run.

<details>
<summary>Issues (1)</summary>

1. **Single-pass reduce under extreme input** — the combine step concatenates all partial summaries into one prompt, which can pressure the context window for documents with dozens of chunks. Documented as a deliberate MVP limit; a hierarchical reduce is the follow-up if a very large PDF appears. Non-blocking.

</details>

<details>
<summary>Details</summary>

### Chunking: paragraph-aware with a hard-slice floor

`dividirEmChunks` trims, short-circuits empty input to `[]` and sub-limit input to a single chunk, then packs paragraphs (split on blank lines) into chunks without crossing `tamanhoChunk`. A paragraph larger than the limit on its own is flushed and hard-sliced into max-size blocks, so the invariant "no chunk exceeds the limit" holds even for pathological input (a wall of text with no paragraph breaks). The unit tests lock this down: the oversized-paragraph case asserts the exact `[100, 100, 50]` split, and the multi-paragraph case asserts every chunk stays `<= 130`. The 12000-char ceiling is centralized in `constants.ts` with a comment tying it to a ~8k-token window.

### Both modes wired through to the prompt

`ModoResumo` ("curto" | "longo") originates in the `Resumo.tsx` select, is passed to `window.api.gerarResumo(texto, modo)`, crosses the `resumo:gerar` channel, and lands in `montarPromptResumo`, which selects a distinct instruction block per mode. `prompts.test.ts` asserts the curto prompt contains "CURTO" and not "LONGO" and vice versa, so the modes can't silently collapse to the same prompt. The manual run (short 824 chars vs long 2414 chars from the same 5217-char PDF) confirms the mode reaches the model and changes output.

### map→reduce for large text, single-pass combine

Small text (one chunk) is one `gerar` call. Large text maps each chunk through `montarPromptResumo`, collects the partials, then calls `montarPromptCombinarResumos`, which numbers the partials ("Parte 1:", "Parte 2:", …) and asks for a single coherent summary in the same mode. The combine is single-pass: all partials go into one prompt. The service header documents this as an intentional MVP limit and notes a hierarchical reduce is deferred — a reasonable call, and the only standing concern. The map→reduce path is covered by `resumo.test.ts` with a reduced `tamanhoChunk`, asserting `chunks + 1` calls and that the final call carries the numbered partials.

### Error posture: coded errors mapped to user-ready messages

`gerarResumo` throws `SemTextoParaResumirError` (with a stable `code`) on empty text; an offline Ollama propagates out of the injected `gerar`. The IPC handler's `mensagemAmigavelResumo` maps `OllamaIndisponivelError` and `SemTextoParaResumirError` to their own messages and everything else to a generic "Não foi possível gerar o resumo. Tente novamente.", so no internal detail leaks to the UI. `Resumo.tsx` strips the Electron "Error: " wrapper before display. The handler also threads `modeloSelecionado` into `generate`, so generations respect the Task 4 selector instead of the hardcoded default — `ipc-resumo.test.ts` asserts `params.model === "llama3.1:8b"` (the default in the test's fresh state) and that failures surface the friendly message.

### Test coverage and the gap

Covered: chunking edge cases (empty, single, multi-paragraph bound, oversized paragraph), single-call path with mode in the prompt, response trimming, map→reduce call count and partial numbering, error propagation, both prompt modes, and the IPC channel (registration, happy path with model assertion, friendly-error mapping). The suite keeps Ollama mocked/injected throughout, so it never contacts a model.

Not tested by the manual run: the production large-text path. The real PDF (5217 chars) fit in a single chunk, so the manual run only exercised the single-call path; the map→reduce path rests on unit tests with a shrunken `tamanhoChunk`. Acceptable for the MVP contract (the criterion is satisfied by the unit tests), but a real multi-chunk document hasn't been run end to end against a live model.

Build/lint/test evidence is self-reported in `worklog-task5.md` as exit-0 runs (build, lint, 48 tests across 8 files). Per the review scope the suites were not re-run here; the recorded evidence is present and specific (per-file test counts), satisfying the "evidence must exist" requirement.

</details>

<details>
<summary>File map</summary>

- `src/main/services/resumo.ts` — new summary service: `dividirEmChunks`, `gerarResumo`, `SemTextoParaResumirError`.
- `src/shared/prompts.ts` — `montarPromptResumo` (per-mode instructions) and `montarPromptCombinarResumos` (reduce step).
- `src/shared/constants.ts` — `tamanhoMaximoChunkCaracteres` (12000) chunk ceiling.
- `src/main/ipc/index.ts` — `resumo:gerar` handler, friendly-error mapping, model-selector threading.
- `src/shared/ipc.ts` — channel name + `gerarResumo` on the typed API.
- `src/main/preload.ts` — `gerarResumo` exposed on `window.api`.
- `src/renderer/views/Resumo.tsx` — new view: mode select, generate button, result/error display.
- `src/renderer/App.tsx` / `src/renderer/views/Importar.tsx` / `src/renderer/styles.css` — wire the imported file into the Resumo view + styling.
- `tests/main/resumo.test.ts`, `tests/shared/prompts.test.ts`, `tests/main/ipc-resumo.test.ts` — coverage described above.
- `tasks/todo.md`, `tasks/worklog-task5.md` — Task 5 checkboxes flipped and verification evidence recorded.

Full diff: `git diff f1dc47b..HEAD`

</details>
