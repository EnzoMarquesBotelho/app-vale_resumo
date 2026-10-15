import { useState } from "react";
import { appName } from "@shared/constants";

/** Tela placeholder exibida durante o scaffolding do projeto. */
export function App(): React.JSX.Element {
  const electronVersion = window.api?.versions.electron ?? "indisponível";
  const [respostaPing, setRespostaPing] = useState<string | null>(null);

  async function testarPing(): Promise<void> {
    const resposta = await window.api?.ping("renderer");
    setRespostaPing(resposta ?? "API indisponível");
  }

  return (
    <main className="app-shell">
      <h1>{appName}</h1>
      <p>
        Projeto inicial pronto. As telas de importação, resumo, flashcards e
        exercícios serão adicionadas nas próximas etapas.
      </p>
      <p className="app-meta">Electron: {electronVersion}</p>
      <button type="button" onClick={() => void testarPing()}>
        Testar comunicação (ping)
      </button>
      {respostaPing !== null && (
        <p className="app-meta">Resposta do main: {respostaPing}</p>
      )}
    </main>
  );
}
