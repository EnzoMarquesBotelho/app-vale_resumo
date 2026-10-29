import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `storage.ts` (importado por `pasta.ts`) usa `app` do Electron só para o
// diretório default; nos testes passamos um `baseDir` temporário, mas o import
// precisa resolver, então mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  importarPasta,
  nomePastaParaCaderno,
  varrerPasta,
} from "../../src/main/services/pasta.js";
import { listarDocumentos } from "../../src/main/services/storage.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const fixture = (nome: string): string => resolve(fixtures, nome);

let raiz: string;
let baseDir: string;

/** Escreve um arquivo de texto em `raiz/segmentos`. */
async function arquivoTexto(conteudo: string, ...segmentos: string[]): Promise<string> {
  const caminho = join(raiz, ...segmentos);
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, conteudo, "utf-8");
  return caminho;
}

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "app-estudos-pasta-raiz-"));
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-pasta-base-"));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
  await rm(baseDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("nomePastaParaCaderno", () => {
  it("usa o basename da pasta escolhida", () => {
    expect(nomePastaParaCaderno("C:\\Users\\x\\Facul")).toBe("Facul");
    expect(nomePastaParaCaderno("/home/x/Facul")).toBe("Facul");
  });

  it("ignora barra final", () => {
    expect(nomePastaParaCaderno("C:\\Users\\x\\Facul\\")).toBe("Facul");
    expect(nomePastaParaCaderno("/home/x/Facul/")).toBe("Facul");
  });

  it("raiz de drive Windows (C:\\) vira string vazia", () => {
    expect(nomePastaParaCaderno("C:\\")).toBe("");
  });

  it("raiz POSIX (/) vira string vazia", () => {
    expect(nomePastaParaCaderno("/")).toBe("");
  });
});

describe("varrerPasta: filtro e ordem", () => {
  it("coleta só .txt/.md/.pdf e conta os demais em ignoradosPorFormato", async () => {
    await arquivoTexto("a", "a.txt");
    await arquivoTexto("b", "b.md");
    await copyFile(fixture("com-texto.pdf"), join(raiz, "c.pdf"));
    await arquivoTexto("doc", "d.docx");
    await arquivoTexto("x", "e.png");

    const r = await varrerPasta(raiz);
    expect(r.arquivos.map((a) => a.caminhoRelativo)).toEqual([
      "a.txt",
      "b.md",
      "c.pdf",
    ]);
    expect(r.ignoradosPorFormato).toBe(2);
    expect(r.profundidadePodada).toBe(false);
  });

  it("varre subpastas e devolve caminhos relativos", async () => {
    await arquivoTexto("a", "Cálculo", "Teórica", "x.txt");
    await arquivoTexto("b", "Física", "y.md");

    const r = await varrerPasta(raiz);
    const relativos = r.arquivos.map((a) => a.caminhoRelativo).sort();
    expect(relativos).toEqual([
      join("Cálculo", "Teórica", "x.txt"),
      join("Física", "y.md"),
    ]);
  });
});

describe("varrerPasta: poda de profundidade", () => {
  it("poda subpastas além do teto e sinaliza", async () => {
    // n0 (raiz) / n1 / n2 / n3
    await arquivoTexto("raiz", "r.txt");
    await arquivoTexto("n1", "n1", "a.txt");
    await arquivoTexto("n2", "n1", "n2", "b.txt");
    await arquivoTexto("n3", "n1", "n2", "n3", "c.txt");

    const r = await varrerPasta(raiz, { profundidadeMaxima: 2 });
    const relativos = r.arquivos.map((a) => a.caminhoRelativo);
    expect(relativos).toContain("r.txt");
    expect(relativos).toContain(join("n1", "a.txt"));
    expect(relativos).toContain(join("n1", "n2", "b.txt"));
    // c.txt está na profundidade 3 (> 2): podado.
    expect(relativos).not.toContain(join("n1", "n2", "n3", "c.txt"));
    expect(r.profundidadePodada).toBe(true);
  });

  it("teto folgado não poda nada", async () => {
    await arquivoTexto("a", "n1", "n2", "a.txt");
    const r = await varrerPasta(raiz, { profundidadeMaxima: 10 });
    expect(r.profundidadePodada).toBe(false);
    expect(r.arquivos).toHaveLength(1);
  });
});

describe("importarPasta: round-trip e cadernos", () => {
  it("importa em lote, deriva cadernos compostos e persiste", async () => {
    await arquivoTexto("nota", "nota.txt"); // caderno = nome da pasta escolhida
    await arquivoTexto("teo", "Cálculo", "Teórica", "x.txt");
    await arquivoTexto("pra", "Cálculo", "Prática", "y.md");
    await arquivoTexto("outro", "Física", "z.txt");

    const r = await importarPasta(raiz, baseDir);
    expect(r.importados).toBe(4);
    expect(r.ignoradosPorFormato).toBe(0);
    expect(r.ignoradosPorDuplicata).toBe(0);
    expect(r.falhas).toBe(0);
    expect(r.limiteExcedido).toBeNull();

    // O nome da pasta escolhida é o basename de `raiz` (um mkdtemp).
    const nomeRaiz = nomePastaParaCaderno(raiz);

    const docs = await listarDocumentos(undefined, baseDir);
    const porNome = new Map(docs.map((d) => [d.nome, d]));
    expect(porNome.get("nota.txt")?.cadernoNome).toBe(nomeRaiz);
    expect(porNome.get("x.txt")?.cadernoNome).toBe("Cálculo — Teórica");
    expect(porNome.get("x.txt")?.cadernoId).toBe("calculo-teorica");
    expect(porNome.get("y.md")?.cadernoNome).toBe("Cálculo — Prática");
    expect(porNome.get("z.txt")?.cadernoNome).toBe("Física");

    // cadernosTocados é distinto e ordenado.
    expect(r.cadernosTocados).toEqual(
      [...r.cadernosTocados].sort((a, b) => a.localeCompare(b)),
    );
    expect(new Set(r.cadernosTocados).size).toBe(r.cadernosTocados.length);
  });

  it("preenche dataArquivo de cada documento pela mesma hierarquia", async () => {
    const txt = await arquivoTexto("nota", "nota.txt");
    await copyFile(fixture("com-data.pdf"), join(raiz, "com-data.pdf"));

    const r = await importarPasta(raiz, baseDir);
    expect(r.importados).toBe(2);

    const docs = await listarDocumentos(undefined, baseDir);
    const porNome = new Map(docs.map((d) => [d.nome, d]));

    // PDF com metadado interno → CreationDate convertida (13:30 UTC).
    expect(porNome.get("com-data.pdf")?.dataArquivo).toBe(
      "2023-01-15T13:30:00.000Z",
    );
    // .txt → mtime do disco em ISO.
    const esperadoTxt = (await stat(txt)).mtime.toISOString();
    expect(porNome.get("nota.txt")?.dataArquivo).toBe(esperadoTxt);
  });

  it("reimportar a mesma pasta pula tudo por duplicata", async () => {
    await arquivoTexto("a", "a.txt");
    await arquivoTexto("b", "Sub", "b.txt");

    const primeiro = await importarPasta(raiz, baseDir);
    expect(primeiro.importados).toBe(2);

    const segundo = await importarPasta(raiz, baseDir);
    expect(segundo.importados).toBe(0);
    expect(segundo.ignoradosPorDuplicata).toBe(2);
    expect(segundo.cadernosTocados).toEqual([]);

    // Não duplicou documentos em disco.
    const docs = await listarDocumentos(undefined, baseDir);
    expect(docs).toHaveLength(2);
  });

  it("PDF sem texto é importado (conta em importados, texto vazio)", async () => {
    await copyFile(fixture("sem-texto.pdf"), join(raiz, "escaneado.pdf"));
    const r = await importarPasta(raiz, baseDir);
    expect(r.importados).toBe(1);
    expect(r.falhas).toBe(0);

    const docs = await listarDocumentos(undefined, baseDir);
    expect(docs).toHaveLength(1);
    expect(docs[0].nome).toBe("escaneado.pdf");
    expect(docs[0].temResumo).toBe(false);
  });
});

describe("importarPasta: guarda de quantidade (parada segura)", () => {
  it("excede o teto de arquivos: nada é criado", async () => {
    await arquivoTexto("a", "a.txt");
    await arquivoTexto("b", "b.txt");
    await arquivoTexto("c", "c.txt");

    const r = await importarPasta(raiz, baseDir, { maxArquivosLote: 2 });
    expect(r.limiteExcedido).toBe("arquivos");
    expect(r.importados).toBe(0);
    expect(r.cadernosTocados).toEqual([]);

    // Nenhum documento criado.
    const docs = await listarDocumentos(undefined, baseDir);
    expect(docs).toEqual([]);
  });
});

describe("importarPasta: profundidade sinalizada no resultado", () => {
  it("sinaliza limiteExcedido 'profundidade' quando poda", async () => {
    await arquivoTexto("a", "a.txt");
    await arquivoTexto("fundo", "n1", "n2", "n3", "b.txt");
    const r = await importarPasta(raiz, baseDir, { profundidadeMaxima: 1 });
    expect(r.limiteExcedido).toBe("profundidade");
    // a.txt (raiz) e n1 estão dentro do teto; b.txt no fundo foi podado.
    const docs = await listarDocumentos(undefined, baseDir);
    expect(docs.map((d) => d.nome)).toEqual(["a.txt"]);
  });
});


