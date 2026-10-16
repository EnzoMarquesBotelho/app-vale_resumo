# Implementation Plan — Fix false "O Ollama não está rodando" on generation

Fixes the misleading offline error shown when a long generation (e.g. Quiz/Exercícios with Quantity=100) fails by timeout or dropped connection even though Ollama is reachable. Scope is two source files (`src/main/services/ollama.ts`, `src/main/ipc/index.ts`) plus tests. Baseline before starting: 389 tests passing, build + lint clean (confirmed).

## Design decisions (made here, grounded in the code I read)

- **New error type `GeracaoFalhouError` with stable `code = "GERACAO_FALHOU"`.** Mirrors the existing `OllamaIndisponivelError` shape (a class with a readonly `code` literal) so the IPC mappers can branch on `instanceof` exactly like they already do. Chosen over reusing a generic `Error` because the mappers must tell "really offline" from "generation failed" without string-matching.
- **Connection-refused classification by inspecting the thrown fetch error.** Node/Electron's `fetch` (undici) throws a `TypeError` with a `cause` whose `code` is `ECONNREFUSED` / `ENOTFOUND` / `ECONNRESET` etc. when it truly cannot connect. I classify a *connect-time refusal* (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`) as genuinely offline → `OllamaIndisponivelError`. Everything else thrown by the fetch (including a mid-stream `ECONNRESET`/socket drop and the AbortController timeout) → `GeracaoFalhouError`. Rationale: a refusal at connect means nothing is listening; a drop *after* connecting means Ollama was reachable but the long generation broke. The error-code inspection is defensive (reads `error.cause.code` and `error.name`), so a shape we don't recognize falls back to `GeracaoFalhouError` — the honest, non-blaming message — which is the safer default for this bug.
- **Explicit timeout via `AbortController`.** Node's native `fetch` has no default total-response timeout, so a stuck non-streaming generation can hang indefinitely and then surface as a confusing drop. I add a generous explicit timeout suited to long local generations and map the abort to `GeracaoFalhouError` (never offline). Default **300000 ms (5 min)**, exposed as a new exported constant `OLLAMA_GENERATE_TIMEOUT_MS` in `src/shared/constants.ts` so it is tunable and testable. The timer is always cleared in a `finally`.
- **Non-ok HTTP stays a generic `Error`** with the status (unchanged behavior), so the existing `/status 404/` test keeps passing and the mappers keep hitting their generic fallback for it.
- **High-quantity UX = honest message only (minimum bar).** The new `GeracaoFalhouError` message already tells the user to reduce the quantity or use a lighter model. Internal batching/chunking is OUT OF SCOPE per the task; leave a roadmap note in the worklog. No new dependency, pt-BR UI text, English identifiers.

## Key implementation note for the IPC tests

`tests/main/ipc-*.test.ts` mock `../../src/main/services/ollama.js` and re-declare the error classes inside the mock factory. Because `src/main/ipc/index.ts` imports the error classes from that same (mocked) module, `instanceof` in the mappers compares against the mocked classes — so every IPC test that exercises a mapper branch MUST add `GeracaoFalhouError` to its `vi.mock` factory (same shape: `class GeracaoFalhouError extends Error { readonly code = "GERACAO_FALHOU"; }`). The unit tests in `tests/main/ollama.test.ts` use the real module and real classes.

---

- [ ] 1. Add the generation timeout constant.
      Add `export const OLLAMA_GENERATE_TIMEOUT_MS = 300_000;` to `src/shared/constants.ts` with a pt-BR doc comment explaining it is the total timeout for a non-streaming generation and that hitting it maps to "generation failed", not "offline".
      Files: `src/main/../shared/constants.ts` (path `src/shared/constants.ts`)
      Verify: `npm run build` (runs `tsc --noEmit` + electron-vite build) completes clean.

- [ ] 2. In `ollama.ts`, add the `GeracaoFalhouError` class and a private helper that classifies a thrown fetch error.
      Add `export class GeracaoFalhouError extends Error` with `readonly code = "GERACAO_FALHOU" as const`, `name = "GeracaoFalhouError"`, and message exactly: `"A geração falhou ou demorou demais. Tente novamente, reduza a quantidade, ou use um modelo mais leve."`. Add a non-exported helper `function ehRecusaDeConexao(erro: unknown): boolean` that returns true when the error (or its `cause`) has `code` in `{ "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN" }` — read defensively via optional chaining on `(erro as { code?; cause?: { code? } })`. Keep `OllamaIndisponivelError` unchanged.
      Files: `src/main/services/ollama.ts`
      Verify: `npm run build` clean (no runtime behavior change yet).

- [ ] 2. (same item, continued) Rewrite `generate()` to use the AbortController timeout and the new classification.
      Create an `AbortController`, start a `setTimeout(() => controller.abort(), OLLAMA_GENERATE_TIMEOUT_MS)`, pass `signal: controller.signal` to the `fetch` init, and `clearTimeout` in a `finally`. In the `catch`: if `ehRecusaDeConexao(erro)` → throw `OllamaIndisponivelError`; otherwise (abort/timeout, `ECONNRESET`, mid-stream drop, or any unrecognized fetch failure) → throw `GeracaoFalhouError`. Leave the non-ok branch (`if (!res.ok) throw new Error(...status...)`) exactly as is. Update the JSDoc `@throws` on `generate` to document both error types. Import `OLLAMA_GENERATE_TIMEOUT_MS` from `@shared/constants`.
      Files: `src/main/services/ollama.ts`
      Verify: `npm run build` clean.

- [ ] 3. Extend the unit tests for `generate()` in `tests/main/ollama.test.ts`.
      Import `GeracaoFalhouError`. Add cases: (a) connection refused — mock `fetch` to reject with an error whose `cause = { code: "ECONNREFUSED" }` (and one bare `{ code: "ECONNREFUSED" }`) → `rejects.toBeInstanceOf(OllamaIndisponivelError)`; keep/adjust the existing "ECONNREFUSED string message" test to still land on offline; (b) mid-generation drop — reject with `cause = { code: "ECONNRESET" }` → `rejects.toBeInstanceOf(GeracaoFalhouError)`; (c) timeout/abort — mock `fetch` to reject with a `DOMException`/`{ name: "AbortError" }` → `rejects.toBeInstanceOf(GeracaoFalhouError)`; (d) assert the happy-path still passes `init.signal` is defined (AbortController wired); (e) keep the non-ok `/status 404/` test. Use fake fetch mocks only — no real model, no Facul folder.
      Files: `tests/main/ollama.test.ts`
      Verify: `npx vitest run tests/main/ollama.test.ts` — all cases pass.

- [ ] 4. Map `GeracaoFalhouError` to the honest message in every generation mapper in `ipc/index.ts`.
      Import `GeracaoFalhouError` from `../services/ollama.js`. In `mensagemAmigavelResumo`, `mensagemAmigavelFlashcards`, `mensagemAmigavelExercicios`, `mensagemAmigavelMapaMental`, `mensagemAmigavelQuiz`, and `mensagemAmigavelDica`, add `if (erro instanceof GeracaoFalhouError) return erro.message;` placed BEFORE the generic fallback (and alongside the existing `OllamaIndisponivelError` branch, which stays mapped only to the real-offline message). Do not touch `mensagemAmigavel` (file import), `mensagemAmigavelPasta`, `mensagemAmigavelPersistencia`, or `mensagemAmigavelProva`.
      Files: `src/main/ipc/index.ts`
      Verify: `npm run build` clean.

- [ ] 5. Add IPC mapper tests proving each error maps to the right pt-BR message (quiz + exercícios at minimum).
      In `tests/main/ipc-quiz.test.ts` and `tests/main/ipc-exercicios.test.ts`, extend the `vi.mock("../../src/main/services/ollama.js", ...)` factory to also export `GeracaoFalhouError` (class extending `Error` with `readonly code = "GERACAO_FALHOU"` and a `message` set to the honest pt-BR sentence). Add tests: (a) `generate.mockRejectedValue(new GeracaoFalhouError(...))` → the IPC call `rejects.toThrow(/demorou demais|reduza a quantidade/)`; (b) `generate.mockRejectedValue(new OllamaIndisponivelError())` → `rejects.toThrow(/Ollama não está rodando/)`. Note the mocked class instances must be the ones the handler sees — construct them from the mock's exported classes (import them in the test or throw via a `generate` mock that returns a rejected instance of the mock class). Keep the existing generic-failure test.
      Files: `tests/main/ipc-quiz.test.ts`, `tests/main/ipc-exercicios.test.ts`
      Verify: `npx vitest run tests/main/ipc-quiz.test.ts tests/main/ipc-exercicios.test.ts` — new and existing cases pass.

- [ ] 6. (Optional, low-risk) Re-validate `isOllamaRunning()` right before a generation in the quiz/exercícios handlers.
      Only if it stays trivial: in `gerarQuiz`/`gerarExercicios` handlers, you MAY call `isOllamaRunning()` first and throw `OllamaIndisponivelError` when false, so a genuine offline state is reported as offline before the long generation starts; a reachable-but-slow generation then can only surface as `GeracaoFalhouError`. If this complicates existing tests, SKIP it and note in the worklog — the error reclassification in items 2/4 already fixes the reported bug.
      Files: `src/main/ipc/index.ts`
      Verify: `npm test` — full suite still green (no test regressions from the extra check).

- [ ] 7. Full regression + lint, and worklog note.
      Run the whole suite and lint; confirm no regression against the 389 baseline (new tests increase the count — that is expected and acceptable). Add a short roadmap note (in the worklog / task notes, not a new committed doc unless the loop's convention requires it) that internal batching/chunking for very high quantities is deferred and out of scope.
      Files: (none in src beyond above)
      Verify: `npm test` passes with 389 + new tests all green; `npm run lint` reports no errors; `npm run build` clean.

## Verification commands (project's real commands)

- Build (type-check + bundle): `npm run build`
- Lint: `npm run lint`
- Full test suite: `npm test`  (vitest run)
- Focused: `npx vitest run tests/main/ollama.test.ts tests/main/ipc-quiz.test.ts tests/main/ipc-exercicios.test.ts`

Expected outcome: all previously-passing tests still pass (389 baseline), the new unit + IPC tests pass, build and lint are clean. Tests use mocked `fetch` / mocked ollama module only — no real model, no access to `C:\Users\enzom\OneDrive\Desktop\Facul`.

## Gaps / assumptions

- Exact undici error `code` values on a mid-stream drop can vary (`ECONNRESET`, `UND_ERR_SOCKET`, `other side closed`). The classifier treats ONLY connect-refusal codes as offline and everything else as generation-failed, so any unrecognized drop defaults to the honest non-blaming message — the safe side for this bug.
- Timeout default 5 min is an assumption for "generous for long local generations"; it is a single named constant, trivial to tune if the user wants a different value.
