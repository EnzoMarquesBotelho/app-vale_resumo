/**
 * Camada de EFEITO da exportação: o único módulo que carrega pdfmake em
 * runtime. Instancia o `PdfPrinter` preguiçosamente (nunca em module scope),
 * renderiza o PDF a partir do document-definition puro de `pdfDefinicao.ts`, e
 * grava o arquivo via `dialog.showSaveDialog` + escrita atômica (`.tmp` +
 * `rename`). Nunca grava sem o usuário escolher o destino; o default do diálogo
 * é a pasta Documentos (nunca a pasta Facul). 100% local: não usa o Ollama.
 */
import { app, dialog } from "electron";
import type { BrowserWindow, SaveDialogOptions } from "electron";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import PdfPrinter from "pdfmake";
// O default import do vfs é tipado por @types/pdfmake@0.2.11 sob
// esModuleInterop (o `tsc --noEmit` resolve sem erro), então não é preciso um
// `declare module` adicional. O default export em runtime é o dicionário base64.
import vfs from "pdfmake/build/vfs_fonts.js";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import {
  gerarMarkdownDocumento,
  gerarMarkdownExercicios,
  gerarMarkdownFlashcards,
  gerarMarkdownMapaMental,
  gerarMarkdownQuiz,
  gerarMarkdownResumo,
} from "@shared/export/markdown";
import { sugerirNomeArquivo } from "@shared/export/nome";
import type {
  AlvoExportacao,
  FormatoExportacao,
  ResultadoExportacao,
  TipoArtefato,
} from "@shared/export/types";
import {
  montarDefinicaoPdfArtefato,
  montarDefinicaoPdfDocumento,
} from "./pdfDefinicao.js";

/**
 * Erro de exportação no padrão do projeto. A `message` é uma frase pronta para
 * o usuário (o handler a repassa à UI).
 */
export class ExportacaoFalhouError extends Error {
  readonly code = "EXPORTACAO_FALHOU" as const;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ExportacaoFalhouError";
  }
}

/** Monta o dicionário de fontes Roboto a partir do vfs base64 embarcado. */
function fontesRoboto(): TFontDictionary {
  const buf = (nome: string): Buffer => Buffer.from(vfs[nome], "base64");
  return {
    Roboto: {
      normal: buf("Roboto-Regular.ttf"),
      bold: buf("Roboto-Medium.ttf"),
      italics: buf("Roboto-Italic.ttf"),
      bolditalics: buf("Roboto-MediumItalic.ttf"),
    },
  };
}

/** Singleton preguiçoso do printer (nunca instanciado em module scope). */
let printerSingleton: PdfPrinter | null = null;
function obterPrinter(): PdfPrinter {
  printerSingleton ??= new PdfPrinter(fontesRoboto());
  return printerSingleton;
}

/**
 * Renderiza o document-definition num Buffer de PDF. É o único ponto que toca
 * a stack do pdfmake. Exportado para o teste de handler poder mocká-lo (sem
 * renderizar o binário real).
 */
export function renderizarPdf(def: TDocumentDefinitions): Promise<Buffer> {
  const doc = obterPrinter().createPdfKitDocument(def);
  return new Promise<Buffer>((resolve, reject) => {
    const partes: Buffer[] = [];
    doc.on("data", (c: Buffer) => partes.push(c));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * Diretório padrão sugerido para o save dialog. Nunca a pasta Facul: usa a
 * pasta Documentos do usuário, com fallback para a home se indisponível.
 */
export function diretorioPadraoExport(): string {
  try {
    return app.getPath("documents");
  } catch {
    return app.getPath("home");
  }
}

/** Filtros do save dialog por formato. */
function filtrosDialogo(formato: FormatoExportacao): SaveDialogOptions["filters"] {
  return formato === "markdown"
    ? [{ name: "Markdown", extensions: ["md"] }]
    : [{ name: "PDF", extensions: ["pdf"] }];
}

/** Gera o conteúdo Markdown do alvo (artefato único ou documento inteiro). */
function markdownDoAlvo(alvo: AlvoExportacao): string {
  if (alvo.escopo === "documento") {
    return gerarMarkdownDocumento(alvo.documento);
  }
  return markdownDoArtefato(alvo.tipo, alvo.documento);
}

/** Gera o Markdown de um único artefato presente no documento. */
function markdownDoArtefato(
  tipo: TipoArtefato,
  doc: AlvoExportacao["documento"],
): string {
  switch (tipo) {
    case "resumo":
      return gerarMarkdownResumo(doc.resumo!);
    case "flashcards":
      return gerarMarkdownFlashcards(doc.flashcards!);
    case "exercicios":
      return gerarMarkdownExercicios(doc.exercicios!);
    case "mapaMental":
      return gerarMarkdownMapaMental(doc.mapaMental!);
    case "quiz":
      return gerarMarkdownQuiz(doc.quiz!);
  }
}

/** Monta o document-definition do PDF do alvo. */
function definicaoPdfDoAlvo(alvo: AlvoExportacao): TDocumentDefinitions {
  if (alvo.escopo === "documento") {
    return montarDefinicaoPdfDocumento(alvo.documento);
  }
  return montarDefinicaoPdfArtefato(alvo.tipo, alvo.documento);
}

/**
 * Abre o save dialog com o nome sugerido e grava `conteudo` de forma atômica
 * (`.tmp` + `rename`) no destino escolhido. Cancelar não grava nada. Falha de
 * gravação vira `ExportacaoFalhouError` com uma frase amigável.
 */
async function salvarComDialogo(
  alvo: AlvoExportacao,
  formato: FormatoExportacao,
  conteudo: Buffer | string,
  janela?: BrowserWindow,
): Promise<ResultadoExportacao> {
  const nome = sugerirNomeArquivo(alvo, formato);
  const opcoes: SaveDialogOptions = {
    title: "Exportar",
    defaultPath: join(diretorioPadraoExport(), nome),
    filters: filtrosDialogo(formato),
  };

  const { canceled, filePath } = janela
    ? await dialog.showSaveDialog(janela, opcoes)
    : await dialog.showSaveDialog(opcoes);

  if (canceled || filePath === undefined || filePath.length === 0) {
    return { status: "cancelado" };
  }

  try {
    const temporario = `${filePath}.tmp`;
    await writeFile(temporario, conteudo);
    await rename(temporario, filePath);
    return { status: "salvo", caminho: filePath };
  } catch {
    throw new ExportacaoFalhouError(
      "Não foi possível gravar o arquivo no destino escolhido. Tente outro local.",
    );
  }
}

/** Exporta o `alvo` para Markdown, abrindo o save dialog. */
export async function exportarMarkdown(
  alvo: AlvoExportacao,
  janela?: BrowserWindow,
): Promise<ResultadoExportacao> {
  const conteudo = markdownDoAlvo(alvo);
  return salvarComDialogo(alvo, "markdown", conteudo, janela);
}

/** Exporta o `alvo` para PDF (via pdfmake), abrindo o save dialog. */
export async function exportarPdf(
  alvo: AlvoExportacao,
  janela?: BrowserWindow,
): Promise<ResultadoExportacao> {
  const buffer = await renderizarPdf(definicaoPdfDoAlvo(alvo));
  return salvarComDialogo(alvo, "pdf", buffer, janela);
}
