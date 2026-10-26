import type { ThemePreference } from "@shared/theme";
import { SeletorTema } from "./SeletorTema";

/** Seção de navegação principal. */
export type Secao = "biblioteca" | "agenda";

/** Props da barra lateral de navegação. */
interface SidebarProps {
  /** Seção atualmente ativa. */
  secaoAtiva: Secao;
  /** Chamado ao selecionar uma seção. */
  onSelecionarSecao: (secao: Secao) => void;
  /** Preferência de tema atual, repassada ao SeletorTema. */
  preferenciaTema: ThemePreference;
  /** Define a preferência de tema. */
  onDefinirTema: (preferencia: ThemePreference) => void;
}

/** Itens de navegação da barra lateral, com rótulos em português e ícone. */
const SECOES: readonly { id: Secao; rotulo: string; icone: string }[] = [
  { id: "biblioteca", rotulo: "Biblioteca", icone: "📚" },
  { id: "agenda", rotulo: "Agenda", icone: "📅" },
];

/**
 * Barra lateral esquerda: navegação principal (Biblioteca/Agenda) com o item
 * ativo destacado (`aria-current="page"`) e o seletor de tema no rodapé.
 */
export function Sidebar({
  secaoAtiva,
  onSelecionarSecao,
  preferenciaTema,
  onDefinirTema,
}: SidebarProps): React.JSX.Element {
  return (
    <nav className="sidebar" aria-label="Navegação principal">
      <ul className="sidebar-secoes">
        {SECOES.map((secao) => (
          <li key={secao.id}>
            <button
              type="button"
              className={`sidebar-item ${
                secaoAtiva === secao.id ? "ativo" : ""
              }`}
              onClick={() => onSelecionarSecao(secao.id)}
              aria-current={secaoAtiva === secao.id ? "page" : undefined}
            >
              <span className="sidebar-icone" aria-hidden="true">
                {secao.icone}
              </span>
              {secao.rotulo}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-rodape">
        <SeletorTema preferencia={preferenciaTema} onDefinir={onDefinirTema} />
      </div>
    </nav>
  );
}
