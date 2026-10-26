# Ollama client with availability detection and model selector

Task 4 adds a local Ollama HTTP client (`ollama.ts`) exposing `isOllamaRunning`, `listModels`, and `generate`, wires two IPC channels (status query and model selection) through the typed preload bridge, and renders an `OllamaStatus` component that shows a connected/offline badge, a model selector defaulting to `llama3.1:8b`, and step-by-step install instructions when Ollama is absent. All traffic targets `http://localhost:11434`, keeping the app fully offline. This pass follows a prior review that approved the code but blocked on missing verification evidence; the current commit records build/lint/test runs and a manual offline reproduction. Watch for: the renderer component still has no automated test (confirmed, carried debt, non-blocking); the in-memory selected model does not persist across sessions (confirmed, explicitly deferred to the persistence task).

**Verdict**: APPROVED

## High-level view

The client isolates all Ollama contact behind three functions in the main process, each failing closed: `isOllamaRunning` and `listModels` swallow network errors and return `false`/`[]`, while `generate` converts a connection failure into a typed `OllamaIndisponivelError` carrying a user-ready message and a stable `code`. This is the core of the absent-Ollama safety: no path lets a rejected `fetch` escape to crash the process.

The IPC layer composes status from those primitives. `obterStatusOllama` queries availability first and only lists models when available, so the offline case never issues a second doomed request. Selected model lives as module-level state in the main process, seeded to the default and updated by the selection channel, which ignores empty/whitespace input so the app can never end up with no model.

The renderer guards every call with optional chaining against the preload API and seeds the selected model into the dropdown even when nothing is downloaded yet. Offline renders the badge plus an ordered instruction list pointing at `ollama pull llama3.1:8b`.

The HTTP boundary is mocked in the service and IPC tests, so no real model is contacted. The renderer component and cross-session persistence are the two known uncovered areas.

<details>
<summary>Issues (2)</summary>

1. **No renderer test for OllamaStatus** — the component is verified only manually; add a test once a renderer test harness exists. Non-blocking, pre-existing debt.
2. **Selected model not persisted** — `modeloSelecionado` is in-memory main-process state and resets on restart; explicitly deferred to the persistence task. Non-blocking.

</details>

<details>
<summary>Details</summary>

### Failing closed on an absent Ollama

The three service functions each contain the failure. `isOllamaRunning` wraps `GET /api/tags` and returns `false` on any thrown error; `listModels` returns `[]` on a non-ok status or a throw; `generate` wraps the `POST /api/generate` call so a connection refusal becomes `OllamaIndisponivelError` rather than a raw network error, and a non-ok response becomes a plain `Error` naming the status. Because `obterStatusOllama` only calls functions that cannot reject, the `ollamaStatus` IPC handler cannot reject either, which is what lets the renderer's `window.api?.ollamaStatus()` resolve safely in every case.

The offline branch is exercised directly by tests: `isOllamaRunning` returns `false` on a rejected fetch, `listModels` returns `[]`, and `generate` rejects with `OllamaIndisponivelError`. The worklog also records a manual run against a dead port (`http://localhost:1`) reproducing the exact `fetch`-rejection branch, observing `disponivel:false`, instructions shown, and `generate` throwing the typed error without the process dying. The stable `code = "OLLAMA_INDISPONIVEL"` gives the UI a text-independent hook for the absent case, which is the right call for a multi-language app.

### HTTP boundary is mocked — no real model in the suite

The service tests stub `fetch` globally (`vi.stubGlobal("fetch", ...)`) and assert on the request URL, method, and JSON body (`model`, `prompt`, `stream:false`), so `generate`'s contract is checked without any model running. The IPC tests mock the `ollama.js` module and `electron`, capturing registered handlers and driving them with fake availability/model values. The IPC suite also asserts that `listModels` is not called when offline, confirming the short-circuit rather than just the output. Default-model behavior is pinned: `generate` with no `model` sends `defaultModel`, and the status handler reports `modeloSelecionado === defaultModel` on first query.

One ordering detail is handled deliberately: the model-selection test that mutates the shared in-memory state is marked as "must run last" because the module loads once and the state persists across tests in the file. That is a real coupling, but it is documented and the test ordering accounts for it.

### Model selection state and the renderer test gap

`opcoesModelo` prepends the selected model to the downloaded list when it is absent, so the default shows in the dropdown before any `ollama pull` — the mechanism that satisfies "default `llama3.1:8b`" even on a fresh install. The selection channel trims input and ignores empty strings, so a blank selection keeps the current model rather than clearing it.

There is no automated test for `OllamaStatus` — the project still has no renderer test harness — so its behavior rests on manual verification. This is pre-existing debt carried from earlier tasks, called out in the worklog, and does not block Task 4's acceptance criteria. Separately, the selected model is in-memory main-process state that resets on restart; persistence is explicitly deferred to the persistence task.

</details>

<details>
<summary>File map</summary>

- `src/main/services/ollama.ts` — new client: `isOllamaRunning`, `listModels`, `generate`, `OllamaIndisponivelError`.
- `src/main/ipc/index.ts` — status + model-selection handlers; in-memory selected model.
- `src/main/preload.ts` — exposes `ollamaStatus` / `ollamaSelecionarModelo` to the renderer.
- `src/shared/ipc.ts` — new channel names and `AppApi` methods.
- `src/shared/types.ts` — `OllamaStatus` type.
- `src/renderer/components/OllamaStatus.tsx` — badge, model selector, offline instructions.
- `src/renderer/App.tsx` — mounts the status component.
- `src/renderer/styles.css` — status/badge/instruction styles.
- `tests/main/ollama.test.ts` — service tests, `fetch` mocked.
- `tests/main/ipc-ollama.test.ts` — IPC tests, service + electron mocked.
- `tasks/worklog-task4.md` — recorded build/lint/test evidence and manual offline repro.

Full diff: `git diff a20fe21 f1dc47b`

</details>
