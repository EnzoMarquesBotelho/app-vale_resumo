import { useState } from "react";
import { avisoSemTextoExtraivel } from "@shared/constants";
import type { ArquivoImportado } from "@shared/types";

/**
 * Extrai uma frase amigável do erro vindo do IPC. O Electron encapsula o erro
 * do handler com um prefixo técnico (ex.: "Error occurred in handler for
 * 'arquivo:importar': Error: ..."); aqui removemos esse ruído e mostramos
 * apenas a mensagem pronta para o usuário.
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao importar o arquivo.";
  }
  // Pega o texto após o último "Error: " adicionado pelo encapsulamento do IPC.
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao importar o arquivo.";
}

/**
 * Tela de importação: o usuário escolhe um arquivo (.txt/.md/.pdf) e vê o
 * texto extraído. PDFs sem texto extraível exibem o aviso correspondente.
 */
export function Importar(): React.JSX.Element {
  const [arquivo, setArquivo] = useState<ArquivoImportado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolherArquivo(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      const resultado = await window.api?.importarArquivo();
      // `null` = usuário cancelou a seleção: mantém o estado anterior.
      if (resultado) {
        setArquivo(resultado);
      }
    } catch (e) {
      setArquivo(null);
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="importar">
      <header className="importar-header">
        <h2>Importar arquivo</h2>
        <p className="app-meta">Formatos suportados: .txt, .md, .pdf</p>
        <button
          type="button"
          onClick={() => void escolherArquivo()}
          disabled={carregando}
        >
          {carregando ? "Importando…" : "Escolher arquivo"}
        </button>
      </header>

      {erro !== null && (
        <p className="importar-erro" role="alert">
          {erro}
        </p>
      )}

      {arquivo !== null && (
        <article className="importar-resultado">
          <h3>{arquivo.nome}</h3>
          {arquivo.semTextoExtraivel ? (
            <p className="importar-aviso" role="status">
              {avisoSemTextoExtraivel}
            </p>
          ) : (
            <pre className="importar-texto">{arquivo.texto}</pre>
          )}
        </article>
      )}
    </section>
  );
}
