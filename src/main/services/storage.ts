/**
 * Serviço de persistência local: salva e carrega documentos e seus artefatos
 * gerados (resumo, flashcards, exercícios) como arquivos JSON em disco.
 *
 * Roda no processo main (acesso a disco). Sem banco externo e sem nuvem: cada
 * documento vira um arquivo `<id>.json` dentro de uma pasta no diretório de
 * dados do app (`app.getPath('userData')/documentos`). Isso mantém tudo local,
 * inspecionável e simples, e faz os resultados reabrirem após fechar/reabrir
 * o app.
 *
 * O diretório base é injetável (`baseDir`) para os testes rodarem num diretório
 * temporário, sem depender do Electron. Em produção, o default vem de
 * `app.getPath('userData')`.
 */
import { app } from "electron";
import { readdir, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  Resumo,
  ResumoDocumentoSalvo,
} from "@shared/types";

/** Nome da subpasta, dentro do `userData`, onde os documentos ficam salvos. */
const SUBPASTA_DOCUMENTOS = "documentos";

/** Erro lançado quando um documento solicitado não existe em disco. */
export class DocumentoNaoEncontradoError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "DOCUMENTO_NAO_ENCONTRADO" as const;
  constructor(public readonly id: string) {
    super("Documento não encontrado. Ele pode ter sido removido.");
    this.name = "DocumentoNaoEncontradoError";
  }
}

/**
 * Retorna o diretório onde os documentos são salvos.
 *
 * Default: `app.getPath('userData')/documentos`. Nos testes passa-se um
 * `baseDir` temporário para não tocar no diretório real do usuário.
 */
function diretorioDocumentos(baseDir?: string): string {
  const base = baseDir ?? app.getPath("userData");
  return join(base, SUBPASTA_DOCUMENTOS);
}

/** Caminho do arquivo JSON de um documento pelo seu id. */
function caminhoDocumento(id: string, baseDir?: string): string {
  return join(diretorioDocumentos(baseDir), `${id}.json`);
}

/** Garante que o diretório de documentos existe antes de ler/escrever. */
async function garantirDiretorio(baseDir?: string): Promise<string> {
  const dir = diretorioDocumentos(baseDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Dados para iniciar um novo documento salvo (sem artefatos ainda). */
export interface NovoDocumento {
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. */
  texto: string;
}

/**
 * Cria e salva um novo documento (sem artefatos) e devolve o registro criado.
 * Gera um `id` único e carimba `importadoEm`/`atualizadoEm` com a hora atual.
 */
export async function criarDocumento(
  novo: NovoDocumento,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const agora = new Date().toISOString();
  const documento: DocumentoSalvo = {
    id: randomUUID(),
    nome: novo.nome,
    formato: novo.formato,
    texto: novo.texto,
    importadoEm: agora,
    atualizadoEm: agora,
  };
  // Devolve o registro efetivamente gravado (com `atualizadoEm` já carimbado
  // por salvarDocumento), para bater com o que carregarDocumento lê do disco.
  return salvarDocumento(documento, baseDir);
}

/**
 * Salva (cria ou sobrescreve) um documento completo em disco como JSON.
 * Atualiza `atualizadoEm` para a hora atual antes de gravar.
 */
export async function salvarDocumento(
  documento: DocumentoSalvo,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  await garantirDiretorio(baseDir);
  const registro: DocumentoSalvo = {
    ...documento,
    atualizadoEm: new Date().toISOString(),
  };
  await writeFile(
    caminhoDocumento(documento.id, baseDir),
    JSON.stringify(registro, null, 2),
    "utf-8",
  );
  return registro;
}

/**
 * Carrega um documento completo pelo id.
 * @throws {DocumentoNaoEncontradoError} se o arquivo não existir.
 */
export async function carregarDocumento(
  id: string,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  try {
    const conteudo = await readFile(caminhoDocumento(id, baseDir), "utf-8");
    return JSON.parse(conteudo) as DocumentoSalvo;
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      (erro as { code: unknown }).code === "ENOENT"
    ) {
      throw new DocumentoNaoEncontradoError(id);
    }
    throw erro;
  }
}

/**
 * Lista todos os documentos salvos como resumos leves (sem o texto/artefatos
 * inteiros), ordenados do mais recente para o mais antigo (`atualizadoEm`).
 * Diretório ausente conta como "nenhum documento" (lista vazia).
 */
export async function listarDocumentos(
  baseDir?: string,
): Promise<ResumoDocumentoSalvo[]> {
  const dir = diretorioDocumentos(baseDir);
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      (erro as { code: unknown }).code === "ENOENT"
    ) {
      return [];
    }
    throw erro;
  }

  const resumos: ResumoDocumentoSalvo[] = [];
  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".json")) continue;
    const id = arquivo.slice(0, -".json".length);
    // Pula arquivos corrompidos em vez de derrubar a listagem inteira.
    try {
      const documento = await carregarDocumento(id, baseDir);
      resumos.push({
        id: documento.id,
        nome: documento.nome,
        formato: documento.formato,
        importadoEm: documento.importadoEm,
        atualizadoEm: documento.atualizadoEm,
        temResumo: documento.resumo !== undefined,
        temFlashcards:
          documento.flashcards !== undefined &&
          documento.flashcards.length > 0,
        temExercicios:
          documento.exercicios !== undefined &&
          documento.exercicios.length > 0,
      });
    } catch {
      continue;
    }
  }

  resumos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return resumos;
}

/**
 * Salva o resumo gerado em um documento existente e devolve o registro
 * atualizado.
 * @throws {DocumentoNaoEncontradoError} se o documento não existir.
 */
export async function salvarResumo(
  id: string,
  resumo: Resumo,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const documento = await carregarDocumento(id, baseDir);
  return salvarDocumento({ ...documento, resumo }, baseDir);
}

/**
 * Salva os flashcards gerados em um documento existente e devolve o registro
 * atualizado.
 * @throws {DocumentoNaoEncontradoError} se o documento não existir.
 */
export async function salvarFlashcards(
  id: string,
  flashcards: Flashcard[],
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const documento = await carregarDocumento(id, baseDir);
  return salvarDocumento({ ...documento, flashcards }, baseDir);
}

/**
 * Salva os exercícios gerados em um documento existente e devolve o registro
 * atualizado.
 * @throws {DocumentoNaoEncontradoError} se o documento não existir.
 */
export async function salvarExercicios(
  id: string,
  exercicios: Exercicio[],
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const documento = await carregarDocumento(id, baseDir);
  return salvarDocumento({ ...documento, exercicios }, baseDir);
}

/**
 * Remove um documento salvo pelo id. Remover algo inexistente é um no-op
 * (não lança), para a UI poder apagar sem corrida de estado.
 */
export async function removerDocumento(
  id: string,
  baseDir?: string,
): Promise<void> {
  await rm(caminhoDocumento(id, baseDir), { force: true });
}
