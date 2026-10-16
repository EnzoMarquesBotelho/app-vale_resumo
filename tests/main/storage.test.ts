import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Exercicio, Flashcard, Resumo } from "@shared/types";

// `storage.ts` importa `app` do Electron só para o diretório default. Nos
// testes passamos um `baseDir` temporário, então `app.getPath` não é chamado;
// mesmo assim o import precisa resolver, por isso mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  DocumentoNaoEncontradoError,
  carregarDocumento,
  criarDocumento,
  listarDocumentos,
  removerDocumento,
  salvarDocumento,
  salvarExercicios,
  salvarFlashcards,
  salvarResumo,
} from "../../src/main/services/storage.js";

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-storage-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const resumoExemplo: Resumo = {
  documentoId: "",
  modo: "curto",
  conteudo: "Um resumo curto do conteúdo.",
  geradoEm: new Date().toISOString(),
};

const flashcardsExemplo: Flashcard[] = [
  { pergunta: "O que é X?", resposta: "X é Y." },
  { pergunta: "Quanto é 2+2?", resposta: "4." },
];

const exerciciosExemplo: Exercicio[] = [
  { enunciado: "Explique X.", resposta: "X é...", modo: "teorica" },
  { enunciado: "Calcule Y.", resposta: "Y = ...", modo: "teorica" },
];

describe("storage: criar e carregar documento", () => {
  it("cria um documento e o carrega de volta igual (round-trip)", async () => {
    const criado = await criarDocumento(
      { nome: "Capítulo 1.txt", formato: "txt", texto: "conteúdo de estudo" },
      baseDir,
    );

    const carregado = await carregarDocumento(criado.id, baseDir);

    expect(carregado).toEqual(criado);
    expect(carregado.nome).toBe("Capítulo 1.txt");
    expect(carregado.texto).toBe("conteúdo de estudo");
    expect(carregado.resumo).toBeUndefined();
    expect(carregado.flashcards).toBeUndefined();
    expect(carregado.exercicios).toBeUndefined();
  });

  it("lança DocumentoNaoEncontradoError para um id inexistente", async () => {
    await expect(
      carregarDocumento("nao-existe", baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it("gera ids únicos para documentos diferentes", async () => {
    const a = await criarDocumento(
      { nome: "a.txt", formato: "txt", texto: "a" },
      baseDir,
    );
    const b = await criarDocumento(
      { nome: "b.txt", formato: "txt", texto: "b" },
      baseDir,
    );
    expect(a.id).not.toBe(b.id);
  });
});

describe("storage: salvar artefatos por documento (round-trip)", () => {
  it("persiste resumo, flashcards e exercícios no mesmo documento", async () => {
    const criado = await criarDocumento(
      { nome: "Aula.md", formato: "md", texto: "texto da aula" },
      baseDir,
    );

    await salvarResumo(criado.id, resumoExemplo, baseDir);
    await salvarFlashcards(criado.id, flashcardsExemplo, baseDir);
    await salvarExercicios(criado.id, exerciciosExemplo, baseDir);

    const carregado = await carregarDocumento(criado.id, baseDir);

    expect(carregado.resumo).toEqual(resumoExemplo);
    expect(carregado.flashcards).toEqual(flashcardsExemplo);
    expect(carregado.exercicios).toEqual(exerciciosExemplo);
    // Texto e metadados originais permanecem.
    expect(carregado.texto).toBe("texto da aula");
    expect(carregado.importadoEm).toBe(criado.importadoEm);
  });

  it("cada documento guarda seus próprios artefatos (sem vazar entre eles)", async () => {
    const doc1 = await criarDocumento(
      { nome: "um.txt", formato: "txt", texto: "um" },
      baseDir,
    );
    const doc2 = await criarDocumento(
      { nome: "dois.txt", formato: "txt", texto: "dois" },
      baseDir,
    );

    await salvarResumo(doc1.id, resumoExemplo, baseDir);
    await salvarFlashcards(doc2.id, flashcardsExemplo, baseDir);

    const carregado1 = await carregarDocumento(doc1.id, baseDir);
    const carregado2 = await carregarDocumento(doc2.id, baseDir);

    expect(carregado1.resumo).toEqual(resumoExemplo);
    expect(carregado1.flashcards).toBeUndefined();
    expect(carregado2.flashcards).toEqual(flashcardsExemplo);
    expect(carregado2.resumo).toBeUndefined();
  });

  it("salvarResumo lança para um documento inexistente", async () => {
    await expect(
      salvarResumo("nao-existe", resumoExemplo, baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it("atualizadoEm muda ao salvar um artefato", async () => {
    const criado = await criarDocumento(
      { nome: "a.txt", formato: "txt", texto: "a" },
      baseDir,
    );
    // Garante uma marca de tempo diferente da criação.
    await new Promise((r) => setTimeout(r, 5));
    const atualizado = await salvarResumo(criado.id, resumoExemplo, baseDir);
    expect(atualizado.atualizadoEm >= criado.atualizadoEm).toBe(true);
  });
});

describe("storage: listar documentos", () => {
  it("devolve lista vazia quando não há nada salvo", async () => {
    expect(await listarDocumentos(baseDir)).toEqual([]);
  });

  it("lista resumos leves com as flags de artefatos presentes", async () => {
    const criado = await criarDocumento(
      { nome: "Resumos.pdf", formato: "pdf", texto: "pdf" },
      baseDir,
    );
    await salvarResumo(criado.id, resumoExemplo, baseDir);

    const lista = await listarDocumentos(baseDir);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: criado.id,
      nome: "Resumos.pdf",
      formato: "pdf",
      temResumo: true,
      temFlashcards: false,
      temExercicios: false,
    });
  });

  it("ordena do mais recente para o mais antigo (atualizadoEm desc)", async () => {
    const antigo = await criarDocumento(
      { nome: "antigo.txt", formato: "txt", texto: "a" },
      baseDir,
    );
    await new Promise((r) => setTimeout(r, 5));
    const recente = await criarDocumento(
      { nome: "recente.txt", formato: "txt", texto: "r" },
      baseDir,
    );

    const lista = await listarDocumentos(baseDir);
    expect(lista.map((d) => d.id)).toEqual([recente.id, antigo.id]);
  });
});

describe("storage: persistência entre 'sessões'", () => {
  it("resultados salvos reabrem após recarregar do disco", async () => {
    // Simula fechar o app: salvamos e descartamos a referência em memória.
    const criado = await criarDocumento(
      { nome: "sessao.txt", formato: "txt", texto: "conteúdo" },
      baseDir,
    );
    await salvarFlashcards(criado.id, flashcardsExemplo, baseDir);

    // Simula reabrir: carregamos do zero, só pelo id, do mesmo diretório.
    const reaberto = await carregarDocumento(criado.id, baseDir);
    expect(reaberto.flashcards).toEqual(flashcardsExemplo);

    const lista = await listarDocumentos(baseDir);
    expect(lista.some((d) => d.id === criado.id && d.temFlashcards)).toBe(true);
  });
});

describe("storage: remover documento", () => {
  it("remove um documento salvo e some da listagem", async () => {
    const criado = await criarDocumento(
      { nome: "apagar.txt", formato: "txt", texto: "x" },
      baseDir,
    );
    await removerDocumento(criado.id, baseDir);

    await expect(
      carregarDocumento(criado.id, baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
    expect(await listarDocumentos(baseDir)).toEqual([]);
  });

  it("remover um id inexistente não lança (no-op)", async () => {
    await expect(
      removerDocumento("nao-existe", baseDir),
    ).resolves.toBeUndefined();
  });

  it("salvarDocumento sobrescreve um documento existente", async () => {
    const criado = await criarDocumento(
      { nome: "a.txt", formato: "txt", texto: "a" },
      baseDir,
    );
    const atualizado = await salvarDocumento(
      { ...criado, texto: "texto novo" },
      baseDir,
    );
    expect(atualizado.texto).toBe("texto novo");
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.texto).toBe("texto novo");
  });
});
