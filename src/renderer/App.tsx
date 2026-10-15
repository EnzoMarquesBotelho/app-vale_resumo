import { appName } from "@shared/constants";

/** Tela placeholder exibida durante o scaffolding do projeto. */
export function App(): React.JSX.Element {
  const electronVersion = window.api?.versions.electron ?? "indisponível";

  return (
    <main className="app-shell">
      <h1>{appName}</h1>
      <p>
        Projeto inicial pronto. As telas de importação, resumo, flashcards e
        exercícios serão adicionadas nas próximas etapas.
      </p>
      <p className="app-meta">Electron: {electronVersion}</p>
    </main>
  );
}
