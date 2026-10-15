import { useEffect, useState } from "react";
import { defaultModel } from "@shared/constants";
import type { OllamaStatus as OllamaStatusDados } from "@shared/types";

/**
 * Instruções passo a passo exibidas quando o Ollama está ausente/offline.
 * Mantidas como dados para a UI apenas renderizar a lista.
 */
const INSTRUCOES: readonly string[] = [
  "Baixe e instale o Ollama em https://ollama.com/download",
  "Abra o aplicativo Ollama (ele roda em segundo plano).",
  `No terminal, baixe um modelo: ollama pull ${defaultModel}`,
  "Deixe o Ollama aberto e clique em “Verificar novamente” abaixo.",
];

/**
 * Mostra o status do Ollama (rodando ou não) e permite escolher o modelo.
 * Quando o Ollama está ausente/offline, exibe instruções passo a passo e
 * nunca quebra a UI — a consulta de status nunca rejeita.
 */
export function OllamaStatus(): React.JSX.Element {
  const [status, setStatus] = useState<OllamaStatusDados | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function verificar(): Promise<void> {
    setVerificando(true);
    try {
      const resultado = await window.api?.ollamaStatus();
      if (resultado) {
        setStatus(resultado);
      }
    } finally {
      setVerificando(false);
    }
  }

  // Consulta o status uma vez ao montar. O estado só é atualizado após a
  // chamada assíncrona resolver (não de forma síncrona dentro do efeito).
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const resultado = await window.api?.ollamaStatus();
      if (ativo && resultado) {
        setStatus(resultado);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function selecionarModelo(modelo: string): Promise<void> {
    const resultado = await window.api?.ollamaSelecionarModelo(modelo);
    if (resultado) {
      setStatus(resultado);
    }
  }

  const disponivel = status?.disponivel ?? false;
  const modeloSelecionado = status?.modeloSelecionado ?? defaultModel;
  // Garante que o modelo selecionado apareça na lista mesmo que ainda não
  // esteja baixado (ex.: default antes do primeiro `ollama pull`).
  const modelos = status?.modelos ?? [];
  const opcoesModelo = modelos.includes(modeloSelecionado)
    ? modelos
    : [modeloSelecionado, ...modelos];

  return (
    <section className="ollama-status">
      <header className="ollama-status-header">
        <span
          className={`ollama-badge ${disponivel ? "ok" : "offline"}`}
          role="status"
        >
          {disponivel ? "Ollama conectado" : "Ollama não detectado"}
        </span>
        <button
          type="button"
          onClick={() => void verificar()}
          disabled={verificando}
        >
          {verificando ? "Verificando…" : "Verificar novamente"}
        </button>
      </header>

      <label className="ollama-modelo">
        Modelo
        <select
          value={modeloSelecionado}
          onChange={(e) => void selecionarModelo(e.target.value)}
        >
          {opcoesModelo.map((modelo) => (
            <option key={modelo} value={modelo}>
              {modelo}
            </option>
          ))}
        </select>
      </label>

      {!disponivel && (
        <div className="ollama-instrucoes">
          <p>
            Para gerar resumos, flashcards e exercícios, o Ollama precisa estar
            rodando localmente. Siga os passos:
          </p>
          <ol>
            {INSTRUCOES.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
