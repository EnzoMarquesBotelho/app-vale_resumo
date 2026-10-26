# Electron + Vite + React + TypeScript scaffold (Task 1)

The scaffold stands up the project foundation for the local offline study app: an `electron-vite` build with three entry points (main, preload, renderer), React 19 + strict TypeScript, ESLint 9 flat config, and Vitest. The main process opens a hardened `BrowserWindow` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) that loads a Portuguese placeholder screen, and the preload exposes a minimal versions-only API over `contextBridge`. All six npm scripts the spec calls for are present and dependency versions are pinned exactly. The coder recorded that `npm run build`, `npm run lint`, `npm test` (3 passing), and `npm run dev` all succeeded in `c:\Dev`.

Watch for: react/react-dom sit in `devDependencies` (confirmed) — harmless now, but relevant to the `electron-builder` packaging step in Task 9.

**Verdict**: APPROVED

## High-level view

The window is configured correctly for the security posture the spec mandates. `contextIsolation`, `nodeIntegration: false`, and `sandbox: true` are all set, the renderer talks to main only through a `contextBridge`-exposed API, and the renderer HTML ships a restrictive CSP. This is exactly the trust boundary the spec's "never enable nodeIntegration without contextIsolation" rule demands.

The build is split cleanly: `electron-vite` handles the three-target bundle while a project-reference tsconfig (`node` + `web`) gives strict typechecking per environment, and `tsc --noEmit` gates the build before bundling. Preload is forced to CJS as `preload.js`, which matches the main process's `../preload/preload.js` load path.

Dependency hygiene is good — every version is pinned — with one classification wrinkle: `react` and `react-dom` are under `devDependencies`. For a Vite-bundled renderer this does not break anything today, but it is the kind of thing that surprises people at packaging time, so it is worth settling before Task 9.

Test setup is honest about its current scope: one trivial unit test over shared constants, running in a `node` vitest environment. `jsdom` is installed but not yet wired, which is fine for a scaffold but will need attention once renderer components get tested.

<details>
<summary>Issues (2)</summary>

1. **React in devDependencies** — `react`/`react-dom` are dev-only; verify this holds up when `electron-builder` packages the app in Task 9, or move them to `dependencies` to be safe.
2. **jsdom installed but unused** — vitest runs in `node` environment; the DOM test seam isn't wired yet. Not needed for Task 1, but renderer-component tests (Task 6+) will require it.

</details>

<details>
<summary>Details</summary>

## Window security posture

The renderer reaches the main-process world only through `window.api`, exposed in `preload.ts` via `contextBridge.exposeInMainWorld`, and that surface is currently read-only version strings — no `ipcRenderer` or node primitives leak through. The renderer `index.html` adds a Content-Security-Policy restricting `default-src`/`script-src` to `'self'`; `style-src` allows `'unsafe-inline'` (confirmed), which is a pragmatic concession for bundled styles and acceptable at this stage.

## Test scope

`tests/shared/constants.test.ts` asserts the three shared constants (app name, Ollama base URL, default model `llama3.1:8b`), which doubles as a sanity check that the `@shared` alias resolves under Vitest. The vitest config runs in `environment: "node"`. `jsdom` is in devDependencies but not referenced by any config yet (confirmed) — there is no renderer/DOM test seam. That is appropriate for a scaffold whose only logic is constants, but the flashcards/exercises UI tests in later tasks will need the jsdom environment wired in.

Not tested: no main-process or preload behavior is exercised (expected — there is almost none yet), and `npm run package` is not covered by any automated check.

</details>

<details>
<summary>File map</summary>

- `package.json` — scripts (dev/build/preview/package/lint/test), pinned deps
- `electron.vite.config.ts` — three-target build, `@shared` alias, CJS preload
- `src/main/index.ts` — hardened BrowserWindow, dev/prod load, lifecycle
- `src/main/preload.ts` — minimal contextBridge API (versions only)
- `src/renderer/{index.html,main.tsx,App.tsx,styles.css,env.d.ts}` — React placeholder + CSP + typed window.api
- `src/shared/constants.ts` — app name, Ollama URL, default model
- `tsconfig*.json` — project refs, strict node/web configs
- `eslint.config.js` — flat config, per-area globals, react-hooks/refresh
- `vitest.config.ts` + `tests/shared/constants.test.ts` — node env, trivial unit test

Full diff: `git show 995c0b8`

</details>
