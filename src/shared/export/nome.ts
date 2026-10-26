/**
 * Derivação PURA do nome de arquivo sugerido para o save dialog.
 *
 * Mora na camada shared (não em `export.ts`, que importa `electron`) para ser
 * testável sem mockar o Electron. Puro e determinístico.
 */
import type { AlvoExportacao, FormatoExportacao, TipoArtefato } from "./types";

/** Sufixo humano (pt-BR) por tipo de artefato no nome do arquivo. */
const SUFIXO_ARTEFATO: Record<TipoArtefato, string> = {
  resumo: "Resumo",
  flashcards: "Flashcards",
  exercicios: "Exercícios",
  mapaMental: "Mapa mental",
  quiz: "Quiz",
};

/** Extensão de arquivo por formato de exportação. */
const EXTENSAO: Record<FormatoExportacao, string> = {
  markdown: "md",
  pdf: "pdf",
};

/** Remove a extensão conhecida (.txt/.md/.pdf) do nome, se presente. */
function removerExtensaoConhecida(nome: string): string {
  return nome.replace(/\.(txt|md|pdf)$/i, "");
}

/**
 * Remove caracteres inválidos de nome de arquivo no Windows (`< > : " / \ | ? *`)
 * e espaços nas bordas; colapsa para "export" se o resultado ficar vazio.
 */
function sanitizarNome(nome: string): string {
  const limpo = removerExtensaoConhecida(nome)
    .replace(/[<>:"/\\|?*]/g, "")
    .trim();
  return limpo.length > 0 ? limpo : "export";
}

/**
 * Nome de arquivo sugerido: `"<doc> - <artefato>.<ext>"` para um artefato, ou
 * `"<doc>.<ext>"` para o documento inteiro. O nome vem só de
 * `alvo.documento.nome` (fonte única). Sanitiza removendo a extensão conhecida
 * do documento e os caracteres inválidos do Windows; vazio → `"export"`.
 */
export function sugerirNomeArquivo(
  alvo: AlvoExportacao,
  formato: FormatoExportacao,
): string {
  const base = sanitizarNome(alvo.documento.nome);
  const ext = EXTENSAO[formato];
  if (alvo.escopo === "artefato") {
    return `${base} - ${SUFIXO_ARTEFATO[alvo.tipo]}.${ext}`;
  }
  return `${base}.${ext}`;
}
