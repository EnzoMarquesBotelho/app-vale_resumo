import { rotuloDisponivel } from "@shared/updater";
import { useUpdater } from "../useUpdater";

/**
 * Controle discreto de atualização no rodapé da sidebar. Renderiza por estado
 * (idle/not-available/checking/available/downloading/ready/error/
 * dev-unavailable) com os textos em pt-BR.
 *
 * Acessibilidade: a região viva (`role="status"` / `aria-live="polite"`)
 * envolve APENAS o nó de texto; os botões ficam fora dela, para não serem
 * re-anunciados nem terem o foco interrompido por leitores de tela ao trocar
 * de estado. O hook `useUpdater` é usado aqui (componente-folha) de propósito,
 * para não alterar as props da `Sidebar`.
 */
export function StatusAtualizacao(): React.JSX.Element {
  const { status, verificar, baixar, reiniciar } = useUpdater();

  // Texto da região viva + (opcionalmente) os botões fora dela, por estado.
  let texto: string;
  let botao: React.JSX.Element | null = null;

  switch (status.tipo) {
    case "dev-unavailable":
      texto = "Atualizações disponíveis apenas no app instalado";
      break;
    case "checking":
      texto = "Verificando atualizações…";
      botao = (
        <button type="button" className="atualizacao-botao" disabled>
          Verificar atualizações
        </button>
      );
      break;
    case "available":
      texto = rotuloDisponivel(status.versao);
      botao = (
        <button type="button" className="atualizacao-botao" onClick={baixar}>
          Baixar atualização
        </button>
      );
      break;
    case "downloading":
      texto = `Baixando… ${status.percent}%`;
      break;
    case "ready":
      texto = "Atualização pronta";
      botao = (
        <button type="button" className="atualizacao-botao" onClick={reiniciar}>
          Reiniciar para atualizar
        </button>
      );
      break;
    case "error":
      texto = status.mensagem;
      botao = (
        <button type="button" className="atualizacao-botao" onClick={verificar}>
          Tentar novamente
        </button>
      );
      break;
    case "idle":
    case "not-available":
    default:
      texto = "App atualizado";
      botao = (
        <button type="button" className="atualizacao-botao" onClick={verificar}>
          Verificar atualizações
        </button>
      );
      break;
  }

  return (
    <div className="atualizacao">
      <div className="atualizacao-texto" role="status" aria-live="polite">
        {status.tipo === "downloading" ? (
          <>
            <progress
              className="atualizacao-progresso"
              max={100}
              value={status.percent}
              aria-label="Progresso do download da atualização"
            />
            <span className="atualizacao-rotulo">{texto}</span>
          </>
        ) : (
          texto
        )}
      </div>
      {botao}
    </div>
  );
}
