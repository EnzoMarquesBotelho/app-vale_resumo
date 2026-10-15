/**
 * Serviço de arquivos: lê `.txt`/`.md` e extrai texto de `.pdf`.
 *
 * Roda no processo main (acesso a disco). Funções puras sempre que possível;
 * o único efeito colateral é ler o arquivo informado por caminho.
 *
 * MVP: apenas `.txt`, `.md` e `.pdf` são suportados. PDFs sem texto extraível
 * (ex.: escaneados) retornam `semTextoExtraivel: true`.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extensoesSuportadas } from "@shared/constants";
import type { ArquivoImportado, FormatoArquivo } from "@shared/types";

/** Erro lançado quando o formato do arquivo não é suportado no MVP. */
export class FormatoNaoSuportadoError extends Error {
  constructor(public readonly extensao: string) {
    super(
      `Formato não suportado: ".${extensao}". ` +
        `Suportados no momento: ${extensoesSuportadas
          .map((e) => `.${e}`)
          .join(", ")}.`,
    );
    this.name = "FormatoNaoSuportadoError";
  }
}

/** Retorna o formato suportado a partir do caminho, ou lança se não suportado. */
export function detectarFormato(caminho: string): FormatoArquivo {
  const extensao = extname(caminho).replace(/^\./, "").toLowerCase();
  if (!(extensoesSuportadas as readonly string[]).includes(extensao)) {
    throw new FormatoNaoSuportadoError(extensao || "(sem extensão)");
  }
  return extensao as FormatoArquivo;
}

/** Extrai o texto de um PDF usando `pdfjs-dist`, concatenando as páginas. */
export async function extrairTextoPdf(dados: Uint8Array): Promise<string> {
  const task = getDocument({
    data: dados,
    // Segurança/estabilidade em ambiente Node/Electron sem DOM:
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    const paginas: string[] = [];
    for (let numero = 1; numero <= doc.numPages; numero += 1) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const textoPagina = conteudo.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      paginas.push(textoPagina);
    }
    return paginas.join("\n").trim();
  } finally {
    await task.destroy();
  }
}

/**
 * Lê o arquivo em `caminho`, detecta o formato e extrai o texto.
 * @throws {FormatoNaoSuportadoError} se a extensão não for suportada.
 */
export async function importarArquivo(
  caminho: string,
): Promise<ArquivoImportado> {
  const formato = detectarFormato(caminho);
  const nome = basename(caminho);

  if (formato === "pdf") {
    const buffer = await readFile(caminho);
    const texto = await extrairTextoPdf(new Uint8Array(buffer));
    const semTextoExtraivel = texto.length === 0;
    return { nome, formato, texto, semTextoExtraivel };
  }

  // .txt e .md: texto puro em UTF-8.
  const texto = (await readFile(caminho, "utf-8")).trim();
  return { nome, formato, texto, semTextoExtraivel: false };
}
