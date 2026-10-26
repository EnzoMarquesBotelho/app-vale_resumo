import { useState } from "react";
import type {
  AlvoExportacao,
  FormatoExportacao,
} from "@shared/export/types";
import { getApi } from "../api";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das telas de geração.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao exportar.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao exportar.";
}

/** Props dos controles de exportação. */
interface ExportarControlesProps {
  /** Alvo já montado (um artefato específico ou o documento inteiro). */
  alvo: AlvoExportacao;
  /** Desabilita ambos os botões (ex.: documento sem artefatos). */
  desabilitado?: boolean;
  /** Dica exibida (via `title`) quando desabilitado, orientando o usuário. */
  dicaDesabilitado?: string;
}

/**
 * Dois botões ("Exportar Markdown" / "Exportar PDF") que exportam o `alvo`
 * chamando o main via `getApi()`. Trata feedback localmente: sucesso mostra um
 * aviso discreto (`role="status"`), cancelar é um no-op silencioso, e erro
 * mostra uma mensagem amigável (`role="alert"`). Reutilizado por cada view de
 * artefato e pelo controle de documento inteiro.
 */
export function ExportarControles({
  alvo,
  desabilitado,
  dicaDesabilitado,
}: ExportarControlesProps): React.JSX.Element {
  const [exportando, setExportando] = useState<FormatoExportacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar(formato: FormatoExportacao): Promise<void> {
    if (desabilitado || exportando !== null) return;
    setAviso(null);
    setErro(null);
    setExportando(formato);
    try {
      const api = getApi();
      const resultado =
        formato === "markdown"
          ? await api.exportarMarkdown(alvo)
          : await api.exportarPdf(alvo);
      if (resultado.status === "salvo") {
        setAviso("Exportado.");
      }
      // "cancelado": no-op silencioso (sem aviso).
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setExportando(null);
    }
  }

  const bloqueado = desabilitado === true || exportando !== null;

  return (
    <div className="exportar-controles">
      <button
        type="button"
        className="secundario"
        onClick={() => void exportar("markdown")}
        disabled={bloqueado}
        title={desabilitado ? dicaDesabilitado : undefined}
      >
        {exportando === "markdown" ? "Exportando…" : "Exportar Markdown"}
      </button>
      <button
        type="button"
        className="secundario"
        onClick={() => void exportar("pdf")}
        disabled={bloqueado}
        title={desabilitado ? dicaDesabilitado : undefined}
      >
        {exportando === "pdf" ? "Exportando…" : "Exportar PDF"}
      </button>
      {aviso !== null && (
        <span className="exportar-aviso" role="status">
          {aviso}
        </span>
      )}
      {erro !== null && (
        <span className="exportar-erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}
