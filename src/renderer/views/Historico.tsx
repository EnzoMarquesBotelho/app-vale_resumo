import { useEffect, useState } from "react";
import type {
  DocumentoSalvo,
  ResumoCaderno,
  ResumoDocumentoSalvo,
} from "@shared/types";
import { getApi } from "../api";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao carregar o histórico.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao carregar o histórico.";
}

/** Formata uma data ISO 8601 em algo legível em português. */
function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Props da tela de histórico. */
interface HistoricoProps {
  /**
   * Sinal para recarregar a lista (ex.: muda quando um artefato é salvo).
   * Qualquer mudança de valor dispara um novo carregamento do nível atual.
   */
  recarregar: number;
  /** Id do documento atualmente aberto, para destacá-lo na lista. */
  documentoAtivoId: string | null;
  /** Chamado ao reabrir um documento salvo (carregado completo). */
  onReabrir: (documento: DocumentoSalvo) => void;
}

/** Rótulo curto dos artefatos presentes em um documento salvo. */
function etiquetas(resumo: ResumoDocumentoSalvo): string {
  const partes: string[] = [];
  if (resumo.temResumo) partes.push("Resumo");
  if (resumo.temFlashcards) partes.push("Flashcards");
  if (resumo.temExercicios) partes.push("Exercícios");
  return partes.length > 0 ? partes.join(" · ") : "Sem artefatos ainda";
}

/** Pluraliza a contagem de documentos de um caderno. */
function rotuloDocumentos(total: number): string {
  return total === 1 ? "1 documento" : `${total} documentos`;
}

/**
 * Tela de histórico em dois níveis: primeiro lista os cadernos (um por
 * matéria), e ao abrir um caderno lista os documentos daquele caderno com as
 * ações de reabrir/remover. Os dados persistem entre sessões, então o
 * histórico reaparece após fechar e reabrir o app.
 */
export function Historico({
  recarregar,
  documentoAtivoId,
  onReabrir,
}: HistoricoProps): React.JSX.Element {
  // `null` = nível 1 (lista de cadernos); um id = nível 2 (documentos do
  // caderno aberto).
  const [cadernoAberto, setCadernoAberto] = useState<string | null>(null);
  const [cadernos, setCadernos] = useState<ResumoCaderno[]>([]);
  const [itens, setItens] = useState<ResumoDocumentoSalvo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega o nível atual do disco: cadernos (nível 1) ou documentos do
  // caderno aberto (nível 2). Usado pelo efeito (ao montar, ao mudar de nível
  // e quando `recarregar` muda) e pelos botões.
  async function carregar(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      if (cadernoAberto === null) {
        const lista = await getApi().listarCadernos();
        setCadernos(lista);
      } else {
        const lista = await getApi().listarDocumentos(cadernoAberto);
        setItens(lista);
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        if (cadernoAberto === null) {
          const lista = await getApi().listarCadernos();
          if (ativo) setCadernos(lista);
        } else {
          const lista = await getApi().listarDocumentos(cadernoAberto);
          if (ativo) setItens(lista);
        }
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      }
    })();
    return () => {
      ativo = false;
    };
  }, [recarregar, cadernoAberto]);

  async function reabrir(id: string): Promise<void> {
    setErro(null);
    try {
      const documento = await getApi().carregarDocumento(id);
      onReabrir(documento);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function remover(id: string): Promise<void> {
    setErro(null);
    try {
      await getApi().removerDocumento(id);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <section className="historico">
      <header className="historico-header">
        {cadernoAberto === null ? (
          <h2>Histórico</h2>
        ) : (
          <button
            type="button"
            className="historico-voltar"
            onClick={() => {
              setErro(null);
              setCadernoAberto(null);
            }}
          >
            ← Cadernos
          </button>
        )}
        <button type="button" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

      {erro !== null && (
        <p className="historico-erro" role="alert">
          {erro}
        </p>
      )}

      {cadernoAberto === null ? (
        cadernos.length === 0 ? (
          <p className="app-meta">
            Nenhum documento salvo ainda. Importe um arquivo e gere resumo,
            flashcards ou exercícios para que fiquem salvos aqui.
          </p>
        ) : (
          <ul className="historico-lista">
            {cadernos.map((caderno) => (
              <li key={caderno.cadernoId} className="historico-item">
                <div className="historico-info">
                  <span className="historico-nome">{caderno.cadernoNome}</span>
                  <span className="app-meta">
                    {rotuloDocumentos(caderno.totalDocumentos)}
                  </span>
                  <span className="app-meta">
                    Atualizado em {formatarData(caderno.atualizadoEm)}
                  </span>
                </div>
                <div className="historico-acoes">
                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setCadernoAberto(caderno.cadernoId);
                    }}
                  >
                    Abrir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : itens.length === 0 ? (
        <p className="app-meta">
          Este caderno não tem documentos. Ele pode ter ficado vazio após uma
          remoção; volte para a lista de cadernos.
        </p>
      ) : (
        <ul className="historico-lista">
          {itens.map((item) => (
            <li
              key={item.id}
              className={`historico-item ${
                item.id === documentoAtivoId ? "ativo" : ""
              }`}
            >
              <div className="historico-info">
                <span className="historico-nome">{item.nome}</span>
                <span className="app-meta">{etiquetas(item)}</span>
                <span className="app-meta">
                  Atualizado em {formatarData(item.atualizadoEm)}
                </span>
              </div>
              <div className="historico-acoes">
                <button type="button" onClick={() => void reabrir(item.id)}>
                  Reabrir
                </button>
                <button
                  type="button"
                  className="historico-remover"
                  onClick={() => void remover(item.id)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
