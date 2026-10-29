import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DocumentoSalvo,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  MapaMental,
  Quiz,
  Resumo,
} from "@shared/types";

// `storage.ts` importa `app` do Electron só para o diretório default. Nos
// testes passamos um `baseDir` temporário, então `app.getPath` não é chamado;
// mesmo assim o import precisa resolver, por isso mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  DocumentoNaoEncontradoError,
  caminhosOrigemImportados,
  carregarDocumento,
  criarDocumento,
  listarCadernos,
  listarDocumentos,
  normalizarCaminhoOrigem,
  removerDocumento,
  salvarDocumento,
  salvarExercicios,
  salvarFlashcards,
  salvarMapaMental,
  salvarQuiz,
  salvarResumo,
} from "../../src/main/services/storage.js";
import type { NovoDocumento } from "../../src/main/services/storage.js";

/**
 * Helper local para montar um `NovoDocumento` com caderno padrão (`geral`),
 * mantendo os call-sites existentes enxutos agora que `cadernoId`/`cadernoNome`
 * são obrigatórios. Casos específicos passam o objeto completo.
 */
const novoDoc = (
  nome: string,
  formato: FormatoArquivo,
  texto: string,
): NovoDocumento => ({
  nome,
  formato,
  texto,
  cadernoId: "geral",
  cadernoNome: "Geral",
});

/**
 * Forma de um documento "legado" cru em disco: pode não ter `cadernoId`/
 * `cadernoNome` (campos novos). Usado para exercitar o fallback de leitura e
 * cenários de desempate com datas controladas.
 */
type DocumentoLegado = Omit<
  DocumentoSalvo,
  "cadernoId" | "cadernoNome" | "caminhoOrigem"
> & {
  cadernoId?: string;
  cadernoNome?: string;
  caminhoOrigem?: string;
};

/** Escreve um JSON de documento diretamente no diretório de documentos. */
async function escreverJsonLegado(
  base: string,
  documento: DocumentoLegado,
): Promise<void> {
  const dir = join(base, "documentos");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${documento.id}.json`),
    JSON.stringify(documento, null, 2),
    "utf-8",
  );
}

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

const mapaMentalExemplo: MapaMental = {
  documentoId: "",
  raiz: {
    id: "n0",
    rotulo: "Tema central",
    filhos: [
      { id: "n1", rotulo: "Ramo A", filhos: [] },
      { id: "n2", rotulo: "Ramo B", filhos: [] },
    ],
  },
  geradoEm: new Date().toISOString(),
};

const quizExemplo: Quiz = {
  documentoId: "",
  modo: "misto",
  perguntas: [
    {
      tipo: "multipla",
      enunciado: "Quanto é 2+2?",
      alternativas: [
        { texto: "3", correta: false },
        { texto: "4", correta: true },
      ],
    },
    { tipo: "aberta", enunciado: "Explique X.", gabarito: "X é Y." },
  ],
  geradoEm: new Date().toISOString(),
};

describe("storage: criar e carregar documento", () => {
  it("cria um documento e o carrega de volta igual (round-trip)", async () => {
    const criado = await criarDocumento(
      novoDoc("Capítulo 1.txt", "txt", "conteúdo de estudo"),
      baseDir,
    );

    const carregado = await carregarDocumento(criado.id, baseDir);

    expect(carregado).toEqual(criado);
    expect(carregado.nome).toBe("Capítulo 1.txt");
    expect(carregado.texto).toBe("conteúdo de estudo");
    expect(carregado.cadernoId).toBe("geral");
    expect(carregado.cadernoNome).toBe("Geral");
    expect(carregado.resumo).toBeUndefined();
    expect(carregado.flashcards).toBeUndefined();
    expect(carregado.exercicios).toBeUndefined();
  });

  it("não grava a chave caminhoOrigem quando não há origem", async () => {
    const criado = await criarDocumento(
      novoDoc("sem-origem.txt", "txt", "x"),
      baseDir,
    );
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect("caminhoOrigem" in carregado).toBe(false);
    expect("caminhoOrigem" in criado).toBe(false);
  });

  it("grava caminhoOrigem quando informado (round-trip)", async () => {
    const criado = await criarDocumento(
      {
        nome: "com-origem.pdf",
        formato: "pdf",
        texto: "x",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
        caminhoOrigem: "C:\\Users\\x\\Facul\\Cálculo\\com-origem.pdf",
      },
      baseDir,
    );
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.caminhoOrigem).toBe(
      "C:\\Users\\x\\Facul\\Cálculo\\com-origem.pdf",
    );
    expect(carregado.cadernoId).toBe("calculo");
    expect(carregado.cadernoNome).toBe("Cálculo");
  });

  it("grava dataArquivo quando informada (round-trip)", async () => {
    const criado = await criarDocumento(
      {
        nome: "com-data.pdf",
        formato: "pdf",
        texto: "x",
        cadernoId: "geral",
        cadernoNome: "Geral",
        dataArquivo: "2023-01-15T13:30:00.000Z",
      },
      baseDir,
    );
    expect(criado.dataArquivo).toBe("2023-01-15T13:30:00.000Z");
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.dataArquivo).toBe("2023-01-15T13:30:00.000Z");
  });

  it("não grava a chave dataArquivo quando ausente", async () => {
    const criado = await criarDocumento(
      novoDoc("sem-data.txt", "txt", "x"),
      baseDir,
    );
    expect("dataArquivo" in criado).toBe(false);
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect("dataArquivo" in carregado).toBe(false);
  });

  it("carrega um documento ANTIGO sem dataArquivo sem quebrar (retrocompat)", async () => {
    const agora = new Date().toISOString();
    // JSON de documento gravado antes desta fatia: sem a chave dataArquivo.
    await escreverJsonLegado(baseDir, {
      id: "legado-sem-data",
      nome: "antigo.txt",
      formato: "txt",
      texto: "conteúdo antigo",
      importadoEm: agora,
      atualizadoEm: agora,
      cadernoId: "geral",
      cadernoNome: "Geral",
    });
    const carregado = await carregarDocumento("legado-sem-data", baseDir);
    expect(carregado.dataArquivo).toBeUndefined();
    expect(carregado.nome).toBe("antigo.txt");
    // E a listagem leve também não quebra e reporta data ausente.
    const resumos = await listarDocumentos(undefined, baseDir);
    const resumo = resumos.find((r) => r.id === "legado-sem-data");
    expect(resumo).toBeDefined();
    expect(resumo?.dataArquivo).toBeUndefined();
  });

  it("propaga dataArquivo ao resumo leve de listarDocumentos", async () => {
    await criarDocumento(
      {
        nome: "com-data.pdf",
        formato: "pdf",
        texto: "x",
        cadernoId: "geral",
        cadernoNome: "Geral",
        dataArquivo: "2023-02-20T09:00:00.000Z",
      },
      baseDir,
    );
    const resumos = await listarDocumentos(undefined, baseDir);
    const resumo = resumos.find((r) => r.nome === "com-data.pdf");
    expect(resumo?.dataArquivo).toBe("2023-02-20T09:00:00.000Z");
  });

  it("lança DocumentoNaoEncontradoError para um id inexistente", async () => {
    await expect(
      carregarDocumento("nao-existe", baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it("gera ids únicos para documentos diferentes", async () => {
    const a = await criarDocumento(novoDoc("a.txt", "txt", "a"), baseDir);
    const b = await criarDocumento(novoDoc("b.txt", "txt", "b"), baseDir);
    expect(a.id).not.toBe(b.id);
  });
});

describe("storage: salvar artefatos por documento (round-trip)", () => {
  it("persiste resumo, flashcards e exercícios no mesmo documento", async () => {
    const criado = await criarDocumento(
      novoDoc("Aula.md", "md", "texto da aula"),
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
    const doc1 = await criarDocumento(novoDoc("um.txt", "txt", "um"), baseDir);
    const doc2 = await criarDocumento(
      novoDoc("dois.txt", "txt", "dois"),
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

  it("salvarMapaMental persiste o mapa e carrega de volta igual (round-trip)", async () => {
    const criado = await criarDocumento(
      novoDoc("Mapa.md", "md", "texto base"),
      baseDir,
    );
    await salvarMapaMental(criado.id, mapaMentalExemplo, baseDir);

    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.mapaMental).toEqual(mapaMentalExemplo);
    // Preserva os outros campos e não cria artefatos fantasmas.
    expect(carregado.texto).toBe("texto base");
    expect(carregado.resumo).toBeUndefined();
  });

  it("salvarMapaMental lança para um documento inexistente", async () => {
    await expect(
      salvarMapaMental("nao-existe", mapaMentalExemplo, baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it("salvarQuiz persiste o quiz e carrega de volta igual (round-trip)", async () => {
    const criado = await criarDocumento(
      novoDoc("Quiz.md", "md", "texto base"),
      baseDir,
    );
    await salvarQuiz(criado.id, quizExemplo, baseDir);

    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.quiz).toEqual(quizExemplo);
    // Preserva os outros campos e não cria artefatos fantasmas.
    expect(carregado.texto).toBe("texto base");
    expect(carregado.resumo).toBeUndefined();
  });

  it("salvarQuiz lança para um documento inexistente", async () => {
    await expect(
      salvarQuiz("nao-existe", quizExemplo, baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
  });

  it("atualizadoEm muda ao salvar um artefato", async () => {
    const criado = await criarDocumento(novoDoc("a.txt", "txt", "a"), baseDir);
    // Garante uma marca de tempo diferente da criação.
    await new Promise((r) => setTimeout(r, 5));
    const atualizado = await salvarResumo(criado.id, resumoExemplo, baseDir);
    expect(atualizado.atualizadoEm >= criado.atualizadoEm).toBe(true);
  });
});

describe("storage: listar documentos", () => {
  it("devolve lista vazia quando não há nada salvo", async () => {
    expect(await listarDocumentos(undefined, baseDir)).toEqual([]);
  });

  it("lista resumos leves com as flags de artefatos presentes", async () => {
    const criado = await criarDocumento(
      novoDoc("Resumos.pdf", "pdf", "pdf"),
      baseDir,
    );
    await salvarResumo(criado.id, resumoExemplo, baseDir);

    const lista = await listarDocumentos(undefined, baseDir);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: criado.id,
      nome: "Resumos.pdf",
      formato: "pdf",
      temResumo: true,
      temFlashcards: false,
      temExercicios: false,
      temMapaMental: false,
    });
  });

  it("reporta temMapaMental conforme o mapa estiver salvo ou ausente", async () => {
    const comMapa = await criarDocumento(
      novoDoc("com-mapa.txt", "txt", "x"),
      baseDir,
    );
    await salvarMapaMental(comMapa.id, mapaMentalExemplo, baseDir);
    const semMapa = await criarDocumento(
      novoDoc("sem-mapa.txt", "txt", "y"),
      baseDir,
    );

    const lista = await listarDocumentos(undefined, baseDir);
    const itemCom = lista.find((d) => d.id === comMapa.id);
    const itemSem = lista.find((d) => d.id === semMapa.id);
    expect(itemCom?.temMapaMental).toBe(true);
    expect(itemSem?.temMapaMental).toBe(false);
  });

  it("reporta temQuiz conforme o quiz estiver salvo ou ausente", async () => {
    const comQuiz = await criarDocumento(
      novoDoc("com-quiz.txt", "txt", "x"),
      baseDir,
    );
    await salvarQuiz(comQuiz.id, quizExemplo, baseDir);
    const semQuiz = await criarDocumento(
      novoDoc("sem-quiz.txt", "txt", "y"),
      baseDir,
    );

    const lista = await listarDocumentos(undefined, baseDir);
    const itemCom = lista.find((d) => d.id === comQuiz.id);
    const itemSem = lista.find((d) => d.id === semQuiz.id);
    expect(itemCom?.temQuiz).toBe(true);
    expect(itemSem?.temQuiz).toBe(false);
  });

  it("ordena do mais recente para o mais antigo (atualizadoEm desc)", async () => {
    const antigo = await criarDocumento(
      novoDoc("antigo.txt", "txt", "a"),
      baseDir,
    );
    await new Promise((r) => setTimeout(r, 5));
    const recente = await criarDocumento(
      novoDoc("recente.txt", "txt", "r"),
      baseDir,
    );

    const lista = await listarDocumentos(undefined, baseDir);
    expect(lista.map((d) => d.id)).toEqual([recente.id, antigo.id]);
  });
});

describe("storage: persistência entre 'sessões'", () => {
  it("resultados salvos reabrem após recarregar do disco", async () => {
    // Simula fechar o app: salvamos e descartamos a referência em memória.
    const criado = await criarDocumento(
      novoDoc("sessao.txt", "txt", "conteúdo"),
      baseDir,
    );
    await salvarFlashcards(criado.id, flashcardsExemplo, baseDir);

    // Simula reabrir: carregamos do zero, só pelo id, do mesmo diretório.
    const reaberto = await carregarDocumento(criado.id, baseDir);
    expect(reaberto.flashcards).toEqual(flashcardsExemplo);

    const lista = await listarDocumentos(undefined, baseDir);
    expect(lista.some((d) => d.id === criado.id && d.temFlashcards)).toBe(true);
  });
});

describe("storage: remover documento", () => {
  it("remove um documento salvo e some da listagem", async () => {
    const criado = await criarDocumento(
      novoDoc("apagar.txt", "txt", "x"),
      baseDir,
    );
    await removerDocumento(criado.id, baseDir);

    await expect(
      carregarDocumento(criado.id, baseDir),
    ).rejects.toBeInstanceOf(DocumentoNaoEncontradoError);
    expect(await listarDocumentos(undefined, baseDir)).toEqual([]);
  });

  it("remover um id inexistente não lança (no-op)", async () => {
    await expect(
      removerDocumento("nao-existe", baseDir),
    ).resolves.toBeUndefined();
  });

  it("salvarDocumento sobrescreve um documento existente", async () => {
    const criado = await criarDocumento(novoDoc("a.txt", "txt", "a"), baseDir);
    const atualizado = await salvarDocumento(
      { ...criado, texto: "texto novo" },
      baseDir,
    );
    expect(atualizado.texto).toBe("texto novo");
    const carregado = await carregarDocumento(criado.id, baseDir);
    expect(carregado.texto).toBe("texto novo");
  });
});

describe("storage: listar cadernos", () => {
  it("devolve lista vazia quando o diretório não existe", async () => {
    expect(await listarCadernos(baseDir)).toEqual([]);
  });

  it("agrupa por cadernoId e conta os documentos de cada caderno", async () => {
    await criarDocumento(
      {
        nome: "a.pdf",
        formato: "pdf",
        texto: "a",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
      },
      baseDir,
    );
    await criarDocumento(
      {
        nome: "b.pdf",
        formato: "pdf",
        texto: "b",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
      },
      baseDir,
    );
    await criarDocumento(novoDoc("c.txt", "txt", "c"), baseDir);

    const cadernos = await listarCadernos(baseDir);
    const porId = new Map(cadernos.map((c) => [c.cadernoId, c]));
    expect(porId.get("calculo")?.totalDocumentos).toBe(2);
    expect(porId.get("geral")?.totalDocumentos).toBe(1);
  });

  it("exibe o cadernoNome do documento mais recente do grupo", async () => {
    await criarDocumento(
      {
        nome: "antigo.pdf",
        formato: "pdf",
        texto: "x",
        cadernoId: "calculo",
        cadernoNome: "calculo",
      },
      baseDir,
    );
    await new Promise((r) => setTimeout(r, 5));
    await criarDocumento(
      {
        nome: "recente.pdf",
        formato: "pdf",
        texto: "y",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
      },
      baseDir,
    );

    const cadernos = await listarCadernos(baseDir);
    expect(cadernos).toHaveLength(1);
    expect(cadernos[0].cadernoId).toBe("calculo");
    // Grafia do documento com atualizadoEm maior (o mais recente).
    expect(cadernos[0].cadernoNome).toBe("Cálculo");
  });

  it("desempata atualizadoEm idêntico pelo id lexicográfico menor", async () => {
    const momento = "2026-02-02T00:00:00.000Z";
    // Grava direto no disco dois documentos com o mesmo atualizadoEm e ids
    // controlados, para forçar o empate (escreverDocumento não recarimba).
    const base: Omit<DocumentoLegado, "id" | "cadernoNome"> = {
      nome: "x.pdf",
      formato: "pdf",
      texto: "x",
      importadoEm: momento,
      atualizadoEm: momento,
      cadernoId: "fisica",
    };
    await escreverJsonLegado(baseDir, {
      ...base,
      id: "zzz",
      cadernoNome: "Nome Z",
    });
    await escreverJsonLegado(baseDir, {
      ...base,
      id: "aaa",
      cadernoNome: "Nome A",
    });

    const cadernos = await listarCadernos(baseDir);
    expect(cadernos).toHaveLength(1);
    // id "aaa" < "zzz", então o representante é o de id "aaa".
    expect(cadernos[0].cadernoNome).toBe("Nome A");
  });

  it("ordena os cadernos por atualizadoEm desc", async () => {
    await criarDocumento(
      {
        nome: "a.txt",
        formato: "txt",
        texto: "a",
        cadernoId: "antigo",
        cadernoNome: "Antigo",
      },
      baseDir,
    );
    await new Promise((r) => setTimeout(r, 5));
    await criarDocumento(
      {
        nome: "b.txt",
        formato: "txt",
        texto: "b",
        cadernoId: "novo",
        cadernoNome: "Novo",
      },
      baseDir,
    );

    const cadernos = await listarCadernos(baseDir);
    expect(cadernos.map((c) => c.cadernoId)).toEqual(["novo", "antigo"]);
  });

  it("documento sem cadernoId entra em Geral", async () => {
    await escreverJsonLegado(baseDir, {
      id: "legado",
      nome: "legado.txt",
      formato: "txt",
      texto: "x",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    });

    const cadernos = await listarCadernos(baseDir);
    expect(cadernos).toHaveLength(1);
    expect(cadernos[0].cadernoId).toBe("geral");
    expect(cadernos[0].cadernoNome).toBe("Geral");
    expect(cadernos[0].totalDocumentos).toBe(1);
  });
});

describe("storage: listar documentos por caderno", () => {
  it("sem argumento lista todos e inclui os campos de caderno", async () => {
    await criarDocumento(
      {
        nome: "a.pdf",
        formato: "pdf",
        texto: "a",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
      },
      baseDir,
    );
    await criarDocumento(novoDoc("b.txt", "txt", "b"), baseDir);

    const todos = await listarDocumentos(undefined, baseDir);
    expect(todos).toHaveLength(2);
    for (const item of todos) {
      expect(typeof item.cadernoId).toBe("string");
      expect(typeof item.cadernoNome).toBe("string");
    }
  });

  it("filtra pelo id efetivo do caderno", async () => {
    await criarDocumento(
      {
        nome: "a.pdf",
        formato: "pdf",
        texto: "a",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
      },
      baseDir,
    );
    await criarDocumento(novoDoc("b.txt", "txt", "b"), baseDir);

    const soCalculo = await listarDocumentos("calculo", baseDir);
    expect(soCalculo.map((d) => d.nome)).toEqual(["a.pdf"]);
  });

  it("documento sem cadernoId aparece ao filtrar por 'geral'", async () => {
    await escreverJsonLegado(baseDir, {
      id: "legado",
      nome: "legado.txt",
      formato: "txt",
      texto: "x",
      importadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    });

    const geral = await listarDocumentos("geral", baseDir);
    expect(geral.map((d) => d.nome)).toEqual(["legado.txt"]);
    expect(geral[0].cadernoId).toBe("geral");
    expect(geral[0].cadernoNome).toBe("Geral");
  });

  it("cadernoId desconhecido devolve lista vazia", async () => {
    await criarDocumento(novoDoc("a.txt", "txt", "a"), baseDir);
    expect(await listarDocumentos("inexistente", baseDir)).toEqual([]);
  });
});

describe("normalizarCaminhoOrigem", () => {
  const plataformaOriginal = process.platform;

  function definirPlataforma(valor: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", {
      value: valor,
      configurable: true,
    });
  }

  afterEach(() => {
    definirPlataforma(plataformaOriginal);
  });

  it("no Windows unifica separadores para \\ e baixa a caixa", () => {
    definirPlataforma("win32");
    expect(normalizarCaminhoOrigem("C:/Users/X/Facul/A.txt")).toBe(
      "c:\\users\\x\\facul\\a.txt",
    );
    // Caminhos que diferem só na caixa/separador normalizam igual.
    expect(normalizarCaminhoOrigem("  C:\\Users\\x\\facul\\a.txt  ")).toBe(
      "c:\\users\\x\\facul\\a.txt",
    );
  });

  it("fora do Windows normaliza APENAS com trim (sem converter separador nem caixa)", () => {
    definirPlataforma("linux");
    // "\" é caractere de nome válido em POSIX: NÃO é convertido.
    expect(normalizarCaminhoOrigem("  /home/x/arquivo\\estranho.txt  ")).toBe(
      "/home/x/arquivo\\estranho.txt",
    );
    // Caixa preservada (FS case-sensitive).
    expect(normalizarCaminhoOrigem("/home/X/Facul/A.txt")).toBe(
      "/home/X/Facul/A.txt",
    );
  });
});

describe("caminhosOrigemImportados", () => {
  it("diretório ausente devolve conjunto vazio", async () => {
    const conjunto = await caminhosOrigemImportados(baseDir);
    expect(conjunto.size).toBe(0);
  });

  it("inclui só os documentos com caminhoOrigem (normalizado)", async () => {
    await criarDocumento(
      {
        nome: "a.txt",
        formato: "txt",
        texto: "a",
        cadernoId: "geral",
        cadernoNome: "Geral",
        caminhoOrigem: "/home/x/Facul/a.txt",
      },
      baseDir,
    );
    await criarDocumento(
      {
        nome: "b.txt",
        formato: "txt",
        texto: "b",
        cadernoId: "geral",
        cadernoNome: "Geral",
      },
      baseDir,
    );

    const conjunto = await caminhosOrigemImportados(baseDir);
    expect(conjunto.size).toBe(1);
    expect(conjunto.has(normalizarCaminhoOrigem("/home/x/Facul/a.txt"))).toBe(
      true,
    );
  });
});
