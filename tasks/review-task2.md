# Shared domain types and typed IPC skeleton (Task 2)

This slice adds the shared contract the rest of the app will build on: domain types in `src/shared/types.ts` (`Documento`, `Resumo`, `Flashcard`, `Exercicio`, the `FormatoArquivo`/`ModoResumo`/`ModoConteudo` unions, and the 5–100 quantity bounds), plus a typed IPC skeleton. The IPC contract lives in a new `src/shared/ipc.ts` (channel names + the `AppApi` interface), the main process registers a single `app:ping` handler via `registerIpcHandlers()`, the preload builds a typed `AppApi` object and exposes it over `contextBridge`, and the renderer gets a button that exercises the `ping` round-trip. The design keeps `ipcRenderer` confined to the preload and routes the renderer through `window.api` only, which is exactly the trust boundary the spec mandates.

Watch for: the commit body and task record carry no build/lint output — only the todo.md checkboxes were flipped to `[x]` (confirmed). I spot-ran the one new test file and both IPC tests pass (confirmed), and the type wiring is internally consistent, but the recorded `npm run build` / `npm run lint` evidence the task asks for is absent (confirmed).

**Verdict**: APPROVED

## High-level view

The IPC contract is centralized the right way. `src/shared/ipc.ts` owns both the channel name (`IPC_CHANNELS.ping`) and the `AppApi` interface, and all three layers import from it: the main handler keys off `IPC_CHANNELS.ping`, the preload types its exposed object as `AppApi` and invokes the same constant, and the renderer's `window.api` resolves to `AppApi` through `PreloadApi`. A drift between caller and handler would surface as a type error rather than a silent runtime miss.

The trust boundary is preserved. `ipcRenderer` is imported only in the preload; the renderer never sees it. The exposed surface grew from version strings to version strings plus one `invoke`-backed method, and nothing node-level leaks across the bridge. The `app:` channel prefix is a sensible namespacing convention for the channels to come. This holds the spec's "renderer↔main só por canais IPC tipados" rule.

The domain types match the spec's vocabulary and the MVP scope — formats limited to `txt`/`md`/`pdf`, resumo modes `curto`/`longo`, content modes `teorica`/`pratica`/`mista`, and the 5–100 bounds as exported constants. Identifiers are in English and doc comments in Portuguese, per the code-style rule. These types are declaration-only right now; nothing constructs or validates them yet, so the first real consumer (Task 3) is where their shape gets exercised.

The gap is evidential, not structural. The task's verification list asks for a recorded `npm run build` and the checkpoint asks for build/lint/test, but the commit message is a single subject line with no body and there is no task report capturing that output. The code itself type-checks by inspection and the new tests pass under a spot-run, so this is a missing-paper-trail finding, not a defect.

<details>
<summary>Issues (2)</summary>

1. **Missing recorded build/lint evidence** — the commit body and task record contain no `npm run build` / `npm run lint` output; only todo.md checkboxes were marked done. A spot-run of the new IPC test passes and the types are consistent by inspection, but the build/lint runs the task calls for aren't recorded. Capture that output in the task record (or re-run and paste it) to close the paper trail.
2. **Ping handler has no input validation** — `app:ping` trusts `mensagem` is a string and interpolates it directly. Harmless for a test channel, but it's the template later real handlers will copy; validate/narrow inputs when the first non-trivial channel lands.

</details>

<details>
<summary>Details</summary>

## Single source of truth for the IPC contract

`src/shared/ipc.ts` holds `IPC_CHANNELS` (currently just `ping: "app:ping"`) and the `AppApi` interface, and every layer dereferences those same symbols:

```
shared/ipc.ts ── IPC_CHANNELS.ping, AppApi
   │
   ├── main/ipc/index.ts   ipcMain.handle(IPC_CHANNELS.ping, …)
   ├── main/preload.ts     const api: AppApi = { …, ping: (m) => ipcRenderer.invoke(IPC_CHANNELS.ping, m) }
   └── renderer (window.api: PreloadApi = AppApi)   window.api?.ping("renderer")
```

Because the preload object is annotated `AppApi` and the renderer's `window.api` is typed `PreloadApi` (re-exported as `AppApi`), a rename or signature change in one place forces a compile error in the others instead of a silent channel mismatch.

## Domain types vs. spec vocabulary

The unions and interfaces line up with the spec and SPEC success criteria: `FormatoArquivo` is exactly the MVP's `txt`/`md`/`pdf`; `ModoResumo` is `curto`/`longo`; `ModoConteudo` is `teorica`/`pratica`/`mista`; `QUANTIDADE_MINIMA`/`QUANTIDADE_MAXIMA` encode the 5–100 range as shared constants rather than magic numbers. `Resumo` and `Exercicio` carry a `modo`, and `Resumo`/`Documento` carry ISO-8601 timestamps, which fits the later persistence task. One thing to keep an eye on as these get consumed: there is no runtime validator for the string unions or the quantity bounds yet — the constants are declared but nothing enforces them. That's expected for a types-only slice and belongs to the tasks that parse Ollama output (6/7), not here.

## Test coverage

`tests/main/ipc.test.ts` mocks the `electron` module, captures handlers registered through `ipcMain.handle` into a map, calls `registerIpcHandlers()`, then asserts the `ping` channel is registered and that the handler returns `pong: <mensagem>`. A spot-run of this file passed (2/2), exercising the real handler logic without needing an Electron runtime.

Not tested: the preload-side wrapper and the renderer round-trip are not covered by an automated test — the renderer path is only verified manually via the button, as the task's "Manual: chamada `ping` retorna no renderer" line indicates.

</details>

<details>
<summary>File map</summary>

- `src/shared/types.ts` — new; domain types (`Documento`, `Resumo`, `Flashcard`, `Exercicio`), mode/format unions, 5–100 constants
- `src/shared/ipc.ts` — new; `IPC_CHANNELS` and `AppApi` contract shared by main/preload/renderer
- `src/main/ipc/index.ts` — new; `registerIpcHandlers()` with the `app:ping` handler
- `src/main/index.ts` — calls `registerIpcHandlers()` on `app.whenReady()`
- `src/main/preload.ts` — exposes typed `AppApi` (adds `ping`), re-exports `PreloadApi = AppApi`
- `src/renderer/App.tsx` — adds a button that calls `window.api.ping` and shows the response
- `tests/main/ipc.test.ts` — new; mocks `electron`, asserts ping handler registration and reply
- `tasks/todo.md` — Task 2 + Fundação checkpoint boxes flipped to done

Full diff: `git show 9b28ff0`

</details>
