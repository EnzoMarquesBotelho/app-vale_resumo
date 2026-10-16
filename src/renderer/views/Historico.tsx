import { useEffect, useState } from "react";
import type { DocumentoSalvo, ResumoDocumentoSalvo } from "@shared/types";

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
   * Qualquer mudança de valor dispara um novo carregamento.
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

/**
 * Tela de histórico: lista os documentos salvos localmente e permite reabrir
 * resultados anteriores (resumo/flashcards/exercícios). Os dados persistem
 * entre sessões, então o histórico reaparece após fechar e reabrir o app.
 */
export function Historico({
  recarregar,
  documentoAtivoId,
  onReabrir,
}: HistoricoProps): React.JSX.Element {
  const [itens, setItens] = useState<ResumoDocumentoSalvo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega a lista do disco. Usado pelo efeito (ao montar e quando `recarregar`
  // muda) e pelos botões. O estado só é atualizado após a chamada assíncrona
  // resolver, com um guarda `ativo` para ignorar respostas após desmontar.
  async function carregar(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      const lista = await window.api?.listarDocumentos();
      setItens(lista ?? []);
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
        const lista = await window.api?.listarDocumentos();
        if (ativo) setItens(lista ?? []);
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      }
    })();
    return () => {
      ativo = false;
    };
  }, [recarregar]);

  async function reabrir(id: string): Promise<void> {
    setErro(null);
    try {
      const documento = await window.api?.carregarDocumento(id);
      if (documento) onReabrir(documento);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function remover(id: string): Promise<void> {
    setErro(null);
    try {
      await window.api?.removerDocumento(id);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <section className="historico">
      <header className="historico-header">
        <h2>Histórico</h2>
        <button type="button" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </header>

      {erro !== null && (
        <p className="historico-erro" role="alert">
          {erro}
        </p>
      )}

      {itens.length === 0 ? (
        <p className="app-meta">
          Nenhum documento salvo ainda. Importe um arquivo e gere resumo,
          flashcards ou exercícios para que fiquem salvos aqui.
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
