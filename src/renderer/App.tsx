import { appName } from "@shared/constants";
import { Importar } from "./views/Importar";

/** Casca principal do app. No MVP, exibe a tela de importação de arquivos. */
export function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <h1>{appName}</h1>
      <Importar />
    </main>
  );
}
