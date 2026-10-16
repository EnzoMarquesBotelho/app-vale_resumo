import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DocumentoSalvo } from "@shared/types";

// `storage.ts` importa `app` do Electron só para o diretório default. Nos
// testes passamos um `baseDir` temporário, então `app.getPath` não é chamado;
// mesmo assim o import precisa resolver, por isso mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  carregarDocumento,
  migrarCadernos,
} from "../../src/main/services/storage.js";

/**
 * Documento "legado" cru: pode não ter `cadernoId`/`cadernoNome` (campos novos),
 * exatamente como os JSONs salvos por versões anteriores do app.
 */
type DocumentoLegado = Omit<
  DocumentoSalvo,
  "cadernoId" | "cadernoNome" | "caminhoOrigem"
> & {
  cadernoId?: string;
  cadernoNome?: string;
  caminhoOrigem?: string;
};

let baseDir: string;

/** Caminho da subpasta de documentos dentro do baseDir de teste. */
function dirDocumentos(): string {
  return join(baseDir, "documentos");
}

/** Escreve um JSON cru de documento diretamente no diretório de documentos. */
async function escreverCru(
  documento: DocumentoLegado | Record<string, unknown>,
  id?: string,
): Promise<void> {
  await mkdir(dirDocumentos(), { recursive: true });
  const nome = id ?? (documento as { id: string }).id;
  await writeFile(
    join(dirDocumentos(), `${nome}.json`),
    JSON.stringify(documento, null, 2),
    "utf-8",
  );
}

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-migracao-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("migrarCadernos: colocação", () => {
  it("legado sem caminhoOrigem vai para o caderno Geral", async () => {
    await escreverCru({
      id: "sem-origem",
      nome: "a.txt",
      formato: "txt",
      texto: "conteúdo",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    });

    await migrarCadernos(baseDir);

    const doc = await carregarDocumento("sem-origem", baseDir);
    expect(doc.cadernoId).toBe("geral");
    expect(doc.cadernoNome).toBe("Geral");
  });

  it("legado com caminhoOrigem usa a pasta-mãe", async () => {
    await escreverCru({
      id: "com-origem",
      nome: "aula.pdf",
      formato: "pdf",
      texto: "conteúdo",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
      caminhoOrigem: "C:\\Users\\x\\Facul\\Cálculo\\aula.pdf",
    });

    await migrarCadernos(baseDir);

    const doc = await carregarDocumento("com-origem", baseDir);
    expect(doc.cadernoId).toBe("calculo");
    expect(doc.cadernoNome).toBe("Cálculo");
  });
});

describe("migrarCadernos: idempotência", () => {
  it("rodar duas vezes não altera atualizadoEm, cadernoId nem a contagem de arquivos", async () => {
    await escreverCru({
      id: "doc1",
      nome: "a.txt",
      formato: "txt",
      texto: "conteúdo",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
      caminhoOrigem: "C:\\Users\\x\\Facul\\Física\\a.txt",
    });

    await migrarCadernos(baseDir);
    const primeiro = await carregarDocumento("doc1", baseDir);
    const arquivos1 = (await readdir(dirDocumentos())).sort();

    await migrarCadernos(baseDir);
    const segundo = await carregarDocumento("doc1", baseDir);
    const arquivos2 = (await readdir(dirDocumentos())).sort();

    expect(segundo.atualizadoEm).toBe(primeiro.atualizadoEm);
    expect(segundo.cadernoId).toBe(primeiro.cadernoId);
    expect(segundo.cadernoNome).toBe(primeiro.cadernoNome);
    expect(arquivos2).toEqual(arquivos1);
  });

  it("não recarimba documentos que já têm cadernoId", async () => {
    await escreverCru({
      id: "ja-tem",
      nome: "a.txt",
      formato: "txt",
      texto: "conteúdo",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
      cadernoId: "biologia",
      cadernoNome: "Biologia",
    });

    await migrarCadernos(baseDir);

    const doc = await carregarDocumento("ja-tem", baseDir);
    expect(doc.cadernoId).toBe("biologia");
    expect(doc.cadernoNome).toBe("Biologia");
    expect(doc.atualizadoEm).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("migrarCadernos: preservação", () => {
  it("preserva texto, artefatos e datas (não recarimba)", async () => {
    const legado = {
      id: "completo",
      nome: "aula.md",
      formato: "md" as const,
      texto: "texto da aula",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-02T00:00:00.000Z",
      caminhoOrigem: "C:\\Users\\x\\Facul\\Química\\aula.md",
      resumo: {
        documentoId: "completo",
        modo: "curto" as const,
        conteudo: "Resumo.",
        geradoEm: "2026-01-02T00:00:00.000Z",
      },
      flashcards: [{ pergunta: "P?", resposta: "R." }],
      exercicios: [
        { enunciado: "E?", resposta: "R.", modo: "teorica" as const },
      ],
    };
    await escreverCru(legado);

    await migrarCadernos(baseDir);

    const doc = await carregarDocumento("completo", baseDir);
    expect(doc.texto).toBe(legado.texto);
    expect(doc.importadoEm).toBe(legado.importadoEm);
    expect(doc.atualizadoEm).toBe(legado.atualizadoEm);
    expect(doc.resumo).toEqual(legado.resumo);
    expect(doc.flashcards).toEqual(legado.flashcards);
    expect(doc.exercicios).toEqual(legado.exercicios);
    expect(doc.cadernoId).toBe("quimica");
    expect(doc.cadernoNome).toBe("Química");
  });
});

describe("migrarCadernos: tolerância a falhas", () => {
  it("pula arquivo corrompido e migra os válidos", async () => {
    await mkdir(dirDocumentos(), { recursive: true });
    await writeFile(
      join(dirDocumentos(), "corrompido.json"),
      "{ isto não é json válido",
      "utf-8",
    );
    await escreverCru({
      id: "valido",
      nome: "a.txt",
      formato: "txt",
      texto: "conteúdo",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    });

    await expect(migrarCadernos(baseDir)).resolves.toBeUndefined();

    const doc = await carregarDocumento("valido", baseDir);
    expect(doc.cadernoId).toBe("geral");
    // O corrompido continua intacto (não foi reescrito).
    const cru = await readFile(
      join(dirDocumentos(), "corrompido.json"),
      "utf-8",
    );
    expect(cru).toBe("{ isto não é json válido");
  });

  it("diretório ausente é no-op (não lança)", async () => {
    await expect(migrarCadernos(baseDir)).resolves.toBeUndefined();
  });
});
