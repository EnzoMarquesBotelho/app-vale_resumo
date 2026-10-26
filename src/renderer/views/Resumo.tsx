import { useState } from "react";
import type {
  ArquivoImportado,
  ModoResumo,
  Resumo as ResumoArtefato,
} from "@shared/types";
import { getApi } from "../api";
import { ExportarControles } from "../components/ExportarControles";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * da tela de importação.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao gerar o resumo.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao gerar o resumo.";
}

/** Props da tela de resumo. */
interface ResumoProps {
  /** Arquivo importado cujo texto será resumido (ou `null` se nenhum). */
  arquivo: ArquivoImportado | null;
  /**
   * Resumo já salvo deste documento, para reabrir resultados anteriores.
   * `null`/ausente quando ainda não há resumo salvo.
   */
  resumoSalvo?: ResumoArtefato | null;
  /**
   * Chamado quando um novo resumo é gerado, para o App persistir o artefato.
   */
  onGerado?: (resumo: ResumoArtefato) => void;
  /** Nome do documento ativo, usado para nomear o arquivo exportado. */
  nomeDocumento?: string;
}

/** Rótulos em português para cada modo de resumo. */
const ROTULOS_MODO: Record<ModoResumo, string> = {
  curto: "Curto (essencial)",
  longo: "Longo (detalhado)",
};

/**
 * Tela de resumo: o usuário escolhe o modo (curto/longo) e gera um resumo do
 * texto importado via IA local. Mostra o resumo ou uma mensagem de erro clara.
 */
export function Resumo({
  arquivo,
  resumoSalvo,
  onGerado,
  nomeDocumento,
}: ResumoProps): React.JSX.Element {
  // Estado inicializado a partir do que está salvo. O App remonta esta tela
  // (via `key` por documento) ao reabrir/importar outro, então a inicialização
  // reflete o documento ativo sem precisar sincronizar via efeito.
  const [modo, setModo] = useState<ModoResumo>(resumoSalvo?.modo ?? "curto");
  const [resumo, setResumo] = useState<string | null>(
    resumoSalvo?.conteudo ?? null,
  );
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  async function gerar(): Promise<void> {
    if (!temTexto) return;
    setErro(null);
    setResumo(null);
    setGerando(true);
    try {
      const resultado = await getApi().gerarResumo(arquivo.texto, modo);
      setResumo(resultado ?? null);
      if (resultado != null && onGerado) {
        onGerado({
          documentoId: "",
          modo,
          conteudo: resultado,
          geradoEm: new Date().toISOString(),
        });
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <section className="resumo">
      <header className="resumo-header">
        <h2>Resumo</h2>
        {!temTexto ? (
          <p className="app-meta">
            Importe um arquivo com texto para gerar um resumo.
          </p>
        ) : (
          <div className="resumo-controles">
            <label className="resumo-modo">
              Modo
              <select
                value={modo}
                onChange={(e) => setModo(e.target.value as ModoResumo)}
                disabled={gerando}
              >
                {(Object.keys(ROTULOS_MODO) as ModoResumo[]).map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULOS_MODO[valor]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando}
            >
              {gerando ? "Gerando…" : "Gerar resumo"}
            </button>
          </div>
        )}
      </header>

      {erro !== null && (
        <p className="resumo-erro" role="alert">
          {erro}
        </p>
      )}

      {resumo !== null && (
        <article className="resumo-resultado">
          <ExportarControles
            alvo={{
              escopo: "artefato",
              tipo: "resumo",
              documento: {
                nome: nomeDocumento ?? arquivo?.nome ?? "Documento",
                resumo: {
                  documentoId: "",
                  modo,
                  conteudo: resumo,
                  geradoEm: resumoSalvo?.geradoEm ?? "",
                },
              },
            }}
          />
          <pre className="resumo-texto">{resumo}</pre>
        </article>
      )}
    </section>
  );
}
