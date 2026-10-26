import type { ThemePreference } from "@shared/theme";

/** Props do seletor de tema. */
interface SeletorTemaProps {
  /** Preferência de tema atualmente selecionada. */
  preferencia: ThemePreference;
  /** Chamado quando o usuário escolhe uma preferência diferente. */
  onDefinir: (preferencia: ThemePreference) => void;
}

/** Opções do seletor, com rótulos em português e valores do domínio. */
const OPCOES: readonly { valor: ThemePreference; rotulo: string }[] = [
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
  { valor: "automatico", rotulo: "Automático" },
];

/**
 * Seletor de tema como radiogroup acessível: três opções (Claro/Escuro/
 * Automático) navegáveis por teclado, com foco visível. Sem lógica de negócio;
 * apenas reporta a escolha via `onDefinir`.
 */
export function SeletorTema({
  preferencia,
  onDefinir,
}: SeletorTemaProps): React.JSX.Element {
  return (
    <div className="seletor-tema" role="radiogroup" aria-label="Tema">
      {OPCOES.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          role="radio"
          aria-checked={preferencia === opcao.valor}
          className={`seletor-tema-opcao ${
            preferencia === opcao.valor ? "ativo" : ""
          }`}
          onClick={() => onDefinir(opcao.valor)}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  );
}
