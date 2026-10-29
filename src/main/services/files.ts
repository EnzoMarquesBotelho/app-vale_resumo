/**
 * Serviço de arquivos: lê `.txt`/`.md` e extrai texto de `.pdf`.
 *
 * Roda no processo main (acesso a disco). Funções puras sempre que possível;
 * o único efeito colateral é ler o arquivo informado por caminho.
 *
 * MVP: apenas `.txt`, `.md` e `.pdf` são suportados. PDFs sem texto extraível
 * (ex.: escaneados) retornam `semTextoExtraivel: true`.
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extensoesSuportadas, tamanhoMaximoArquivoBytes } from "@shared/constants";
import { derivarCadernoDeCaminho } from "@shared/notebooks";
import { parsearDataPdf } from "@shared/pdfDate";
import type { ArquivoImportado, FormatoArquivo } from "@shared/types";

/** Erro lançado quando o formato do arquivo não é suportado no MVP. */
export class FormatoNaoSuportadoError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "FORMATO_NAO_SUPORTADO" as const;
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

/** Erro lançado quando o arquivo excede o tamanho máximo permitido no MVP. */
export class ArquivoMuitoGrandeError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "ARQUIVO_MUITO_GRANDE" as const;
  constructor(public readonly tamanhoBytes: number) {
    const limiteMb = Math.round(tamanhoMaximoArquivoBytes / (1024 * 1024));
    const atualMb = (tamanhoBytes / (1024 * 1024)).toFixed(1);
    super(
      `Arquivo muito grande (${atualMb} MB). ` +
        `O limite atual é de ${limiteMb} MB.`,
    );
    this.name = "ArquivoMuitoGrandeError";
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

/**
 * Abre um PDF UMA vez via `pdfjs-dist`, extrai o texto (concatenando as
 * páginas) e tenta ler a data interna dos metadados (Info dictionary:
 * `CreationDate`, com fallback `ModDate`). A leitura de metadados é
 * best-effort: qualquer falha ao obter/parsear vira `dataInterna` ausente, sem
 * derrubar a extração de texto.
 */
export async function extrairPdf(
  dados: Uint8Array,
): Promise<{ texto: string; dataInterna?: string }> {
  const task = getDocument({
    data: dados,
    // Segurança/estabilidade em ambiente Node/Electron sem DOM:
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;

    // Data interna (best-effort): nunca derruba a extração de texto.
    let dataInterna: string | undefined;
    try {
      const { info } = await doc.getMetadata();
      // `getMetadata()` tipa `info` como `object` (não indexável) sob TS
      // estrito; o cast é obrigatório para acessar as chaves do dicionário.
      const infoRec = (info ?? {}) as Record<string, unknown>;
      dataInterna = parsearDataPdf(infoRec.CreationDate ?? infoRec.ModDate);
    } catch {
      dataInterna = undefined;
    }

    const paginas: string[] = [];
    for (let numero = 1; numero <= doc.numPages; numero += 1) {
      const pagina = await doc.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const textoPagina = conteudo.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      paginas.push(textoPagina);
    }
    return { texto: paginas.join("\n").trim(), dataInterna };
  } finally {
    await task.destroy();
  }
}

/**
 * Extrai apenas o texto de um PDF. Wrapper fino sobre `extrairPdf`, mantido
 * para os consumidores que só precisam do texto (e para o teste existente).
 */
export async function extrairTextoPdf(dados: Uint8Array): Promise<string> {
  const { texto } = await extrairPdf(dados);
  return texto;
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

  // Sugestão de caderno derivada da pasta-mãe (palpite literal, editável na UI).
  const { cadernoId: cadernoIdSugerido, cadernoNome: cadernoNomeSugerido } =
    derivarCadernoDeCaminho(caminho);

  // Guarda de tamanho: evita carregar arquivos enormes inteiros na memória.
  // Reaproveita o `stat` (sem segunda syscall) para também capturar o `mtime`,
  // fallback universal da data do arquivo.
  const { size, mtime } = await stat(caminho);
  if (size > tamanhoMaximoArquivoBytes) {
    throw new ArquivoMuitoGrandeError(size);
  }
  const dataMtime = Number.isNaN(mtime.getTime())
    ? undefined
    : mtime.toISOString();

  if (formato === "pdf") {
    const buffer = await readFile(caminho);
    const { texto, dataInterna } = await extrairPdf(new Uint8Array(buffer));
    const semTextoExtraivel = texto.length === 0;
    // Hierarquia: data interna do PDF, senão o mtime do disco.
    const dataArquivo = dataInterna ?? dataMtime;
    return {
      nome,
      formato,
      texto,
      semTextoExtraivel,
      caminhoOrigem: caminho,
      // Spread condicional: nunca grava `dataArquivo: undefined`.
      ...(dataArquivo !== undefined ? { dataArquivo } : {}),
      cadernoIdSugerido,
      cadernoNomeSugerido,
    };
  }

  // .txt e .md: texto puro em UTF-8. Sem metadado interno de data confiável →
  // usa direto o mtime do disco.
  const texto = (await readFile(caminho, "utf-8")).trim();
  return {
    nome,
    formato,
    texto,
    semTextoExtraivel: false,
    caminhoOrigem: caminho,
    ...(dataMtime !== undefined ? { dataArquivo: dataMtime } : {}),
    cadernoIdSugerido,
    cadernoNomeSugerido,
  };
}
