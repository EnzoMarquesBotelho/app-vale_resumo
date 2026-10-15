import { useState } from "react";
import { appName } from "@shared/constants";
import type { ArquivoImportado } from "@shared/types";
import { OllamaStatus } from "./components/OllamaStatus";
import { Importar } from "./views/Importar";
import { Resumo } from "./views/Resumo";

/** Casca principal do app. No MVP, importa um arquivo e gera o resumo. */
export function App(): React.JSX.Element {
  const [arquivo, setArquivo] = useState<ArquivoImportado | null>(null);

  return (
    <main className="app-shell">
      <h1>{appName}</h1>
      <OllamaStatus />
      <Importar onImportado={setArquivo} />
      <Resumo arquivo={arquivo} />
    </main>
  );
}
