import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { avisoSemTextoExtraivel } from "@shared/constants";
import {
  FormatoNaoSuportadoError,
  detectarFormato,
  extrairTextoPdf,
  importarArquivo,
} from "../../src/main/services/files.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const fixture = (nome: string): string => resolve(fixtures, nome);

describe("detectarFormato", () => {
  it("reconhece .txt, .md e .pdf (case-insensitive)", () => {
    expect(detectarFormato("notas.txt")).toBe("txt");
    expect(detectarFormato("resumo.MD")).toBe("md");
    expect(detectarFormato("Capítulo 1.Pdf")).toBe("pdf");
  });

  it("rejeita formatos não suportados", () => {
    expect(() => detectarFormato("foto.png")).toThrow(FormatoNaoSuportadoError);
    expect(() => detectarFormato("planilha.xlsx")).toThrow(
      FormatoNaoSuportadoError,
    );
    expect(() => detectarFormato("semextensao")).toThrow(
      FormatoNaoSuportadoError,
    );
  });
});

describe("importarArquivo: texto puro", () => {
  it("lê .txt preservando acentuação", async () => {
    const r = await importarArquivo(fixture("amostra.txt"));
    expect(r.formato).toBe("txt");
    expect(r.nome).toBe("amostra.txt");
    expect(r.semTextoExtraivel).toBe(false);
    expect(r.texto).toContain("Fotossíntese");
    expect(r.texto).toContain("ção, ã, é");
  });

  it("lê .md preservando o conteúdo markdown", async () => {
    const r = await importarArquivo(fixture("amostra.md"));
    expect(r.formato).toBe("md");
    expect(r.texto).toContain("# Resumo de História");
    expect(r.texto).toContain("revolução");
  });

  it("trata arquivo vazio sem quebrar (texto vazio)", async () => {
    const r = await importarArquivo(fixture("vazio.txt"));
    expect(r.texto).toBe("");
    expect(r.semTextoExtraivel).toBe(false);
  });

  it("lança erro para formato não suportado", async () => {
    await expect(importarArquivo(fixture("amostra.png"))).rejects.toBeInstanceOf(
      FormatoNaoSuportadoError,
    );
  });
});

describe("importarArquivo: PDF", () => {
  it("extrai o texto de um PDF com conteúdo", async () => {
    const r = await importarArquivo(fixture("com-texto.pdf"));
    expect(r.formato).toBe("pdf");
    expect(r.semTextoExtraivel).toBe(false);
    expect(r.texto).toContain("Resumo de Biologia Celular");
    expect(r.texto).toContain("mitocondria");
  });

  it("marca PDF sem texto extraível (escaneado/vazio)", async () => {
    const r = await importarArquivo(fixture("sem-texto.pdf"));
    expect(r.formato).toBe("pdf");
    expect(r.texto).toBe("");
    expect(r.semTextoExtraivel).toBe(true);
  });
});

describe("extrairTextoPdf", () => {
  it("retorna string vazia quando não há texto", async () => {
    const dados = new Uint8Array(await readFile(fixture("sem-texto.pdf")));
    expect(await extrairTextoPdf(dados)).toBe("");
  });

  it("confirma o aviso usado pela UI", () => {
    // Garante que a constante do aviso continua estável para a UI.
    expect(avisoSemTextoExtraivel).toBe("sem texto extraível");
  });
});
