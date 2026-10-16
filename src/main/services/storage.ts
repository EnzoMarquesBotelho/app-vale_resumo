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
import { readdir, readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CADERNO_GERAL_ID,
  CADERNO_GERAL_NOME,
  derivarCadernoDeCaminho,
  montarCaderno,
  normalizarNomeCaderno,
} from "@shared/notebooks";
import type {
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  Resumo,
  ResumoCaderno,
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
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Caminho de origem no disco, quando conhecido (best-effort). */
  caminhoOrigem?: string;
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
    cadernoId: novo.cadernoId,
    cadernoNome: novo.cadernoNome,
    // Spread condicional: nunca grava `caminhoOrigem: undefined`. Documento sem
    // origem simplesmente não tem a chave (em memória e em disco batem).
    ...(novo.caminhoOrigem !== undefined
      ? { caminhoOrigem: novo.caminhoOrigem }
      : {}),
  };
  // Devolve o registro efetivamente gravado (com `atualizadoEm` já carimbado
  // por salvarDocumento), para bater com o que carregarDocumento lê do disco.
  return salvarDocumento(documento, baseDir);
}

/**
 * Grava o documento cru em disco como JSON, de forma atômica, SEM recarimbar
 * `atualizadoEm`/`importadoEm`. Escreve em `<id>.json.tmp` e renomeia para
 * `<id>.json` (rename é atômico no mesmo volume), evitando um arquivo
 * meio-escrito se o processo morrer no meio. Usado pela migração, que precisa
 * preservar as datas originais.
 */
async function escreverDocumento(
  documento: DocumentoSalvo,
  baseDir?: string,
): Promise<void> {
  await garantirDiretorio(baseDir);
  const destino = caminhoDocumento(documento.id, baseDir);
  const temporario = `${destino}.tmp`;
  await writeFile(temporario, JSON.stringify(documento, null, 2), "utf-8");
  await rename(temporario, destino);
}

/**
 * Salva (cria ou sobrescreve) um documento completo em disco como JSON.
 * Atualiza `atualizadoEm` para a hora atual antes de gravar. Escrita atômica
 * (`.tmp` + `rename`) para não deixar um arquivo meio-escrito.
 */
export async function salvarDocumento(
  documento: DocumentoSalvo,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const registro: DocumentoSalvo = {
    ...documento,
    atualizadoEm: new Date().toISOString(),
  };
  await escreverDocumento(registro, baseDir);
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
 * Id de caderno efetivo de um documento na leitura: `cadernoId` aparado, ou o
 * caderno padrão (`geral`) quando ausente/vazio/só-espaços. Regra única de
 * fallback, aplicada igual em `listarDocumentos` e `listarCadernos` — nunca
 * reescreve o arquivo, só interpreta na leitura.
 */
function cadernoIdEfetivo(documento: DocumentoSalvo): string {
  return documento.cadernoId?.trim() || CADERNO_GERAL_ID;
}

/**
 * Nome de caderno efetivo correspondente ao id efetivo: quando o id cai no
 * fallback (`geral`) e não há `cadernoNome` significativo, usa o nome padrão
 * (`Geral`); senão, o `cadernoNome` aparado do documento (ou o padrão).
 */
function cadernoNomeEfetivo(documento: DocumentoSalvo): string {
  const idEfetivo = cadernoIdEfetivo(documento);
  if (idEfetivo === CADERNO_GERAL_ID && !documento.cadernoNome?.trim()) {
    return CADERNO_GERAL_NOME;
  }
  return documento.cadernoNome?.trim() || CADERNO_GERAL_NOME;
}

/**
 * Carrega todos os documentos válidos do diretório, de forma tolerante: pula
 * arquivos corrompidos e trata o diretório ausente como "nenhum documento".
 * Ignora `.json.tmp` órfãos (filtra por `.endsWith(".json")`).
 */
async function carregarTodos(baseDir?: string): Promise<DocumentoSalvo[]> {
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

  const documentos: DocumentoSalvo[] = [];
  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".json")) continue;
    const id = arquivo.slice(0, -".json".length);
    // Pula arquivos corrompidos em vez de derrubar a listagem inteira.
    try {
      documentos.push(await carregarDocumento(id, baseDir));
    } catch {
      continue;
    }
  }
  return documentos;
}

/**
 * Lista os documentos salvos como resumos leves (sem o texto/artefatos
 * inteiros), ordenados do mais recente para o mais antigo (`atualizadoEm`).
 * Diretório ausente conta como "nenhum documento" (lista vazia).
 *
 * Sem `cadernoId`, devolve todos. Com `cadernoId`, filtra pelo id efetivo
 * (o filtro é normalizado defensivamente); um `cadernoId` desconhecido
 * devolve lista vazia. Cada item inclui o `cadernoId`/`cadernoNome` efetivos.
 */
export async function listarDocumentos(
  cadernoId?: string,
  baseDir?: string,
): Promise<ResumoDocumentoSalvo[]> {
  const documentos = await carregarTodos(baseDir);
  const filtroId =
    cadernoId !== undefined ? normalizarNomeCaderno(cadernoId) : undefined;

  const resumos: ResumoDocumentoSalvo[] = [];
  for (const documento of documentos) {
    const idEfetivo = cadernoIdEfetivo(documento);
    if (filtroId !== undefined && idEfetivo !== filtroId) continue;
    resumos.push({
      id: documento.id,
      nome: documento.nome,
      formato: documento.formato,
      importadoEm: documento.importadoEm,
      atualizadoEm: documento.atualizadoEm,
      cadernoId: idEfetivo,
      cadernoNome: cadernoNomeEfetivo(documento),
      temResumo: documento.resumo !== undefined,
      temFlashcards:
        documento.flashcards !== undefined && documento.flashcards.length > 0,
      temExercicios:
        documento.exercicios !== undefined &&
        documento.exercicios.length > 0,
    });
  }

  resumos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return resumos;
}

/**
 * Lista os cadernos agregados a partir dos documentos salvos, do mais recente
 * para o mais antigo (`atualizadoEm` desc). Agrupa pelo id de caderno efetivo;
 * por grupo, `totalDocumentos` é a contagem e o `cadernoNome`/`atualizadoEm`
 * vêm do documento "representante" (maior `atualizadoEm`, desempate pelo `id`
 * lexicograficamente menor). Leitura tolerante; diretório ausente → `[]`.
 */
export async function listarCadernos(
  baseDir?: string,
): Promise<ResumoCaderno[]> {
  const documentos = await carregarTodos(baseDir);

  const grupos = new Map<
    string,
    { representante: DocumentoSalvo; total: number }
  >();
  for (const documento of documentos) {
    const idEfetivo = cadernoIdEfetivo(documento);
    const grupo = grupos.get(idEfetivo);
    if (grupo === undefined) {
      grupos.set(idEfetivo, { representante: documento, total: 1 });
      continue;
    }
    grupo.total += 1;
    // Representante = maior `atualizadoEm`; empate → `id` lexicográfico menor.
    const atual = grupo.representante;
    const cmp = documento.atualizadoEm.localeCompare(atual.atualizadoEm);
    if (cmp > 0 || (cmp === 0 && documento.id.localeCompare(atual.id) < 0)) {
      grupo.representante = documento;
    }
  }

  const cadernos: ResumoCaderno[] = [];
  for (const [idEfetivo, { representante, total }] of grupos) {
    cadernos.push({
      cadernoId: idEfetivo,
      cadernoNome: cadernoNomeEfetivo(representante),
      totalDocumentos: total,
      atualizadoEm: representante.atualizadoEm,
    });
  }

  cadernos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return cadernos;
}

/**
 * Migração idempotente (roda no boot): para cada documento sem `cadernoId`
 * preenchido, deriva o caderno (pela `caminhoOrigem`, quando houver pasta-mãe
 * válida; senão `Geral`) e grava de volta via `escreverDocumento` — sem
 * recarimbar datas e preservando todo o resto. Documentos que já têm caderno
 * são pulados (idempotência). É best-effort e NUNCA propaga erro: falha por
 * documento é logada e pulada; diretório ausente é no-op.
 */
export async function migrarCadernos(baseDir?: string): Promise<void> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorioDocumentos(baseDir));
  } catch {
    // Diretório ausente (ou ilegível) → nada a migrar.
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".json")) continue;
    if (arquivo.endsWith(".json.tmp")) continue;
    const id = arquivo.slice(0, -".json".length);
    try {
      const documento = await carregarDocumento(id, baseDir);
      // Idempotência: já tem caderno → nada a fazer.
      if (documento.cadernoId?.trim()) continue;

      const { cadernoId, cadernoNome } = documento.caminhoOrigem
        ? derivarCadernoDeCaminho(documento.caminhoOrigem)
        : montarCaderno("");

      await escreverDocumento({ ...documento, cadernoId, cadernoNome }, baseDir);
    } catch (erro) {
      // Documento corrompido/ilegível ou falha de escrita: loga e segue.
      console.warn(`migrarCadernos: pulando "${arquivo}":`, erro);
      continue;
    }
  }
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
