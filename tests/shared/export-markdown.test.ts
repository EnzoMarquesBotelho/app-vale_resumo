import { describe, expect, it } from "vitest";
import {
  artefatosPresentes,
  gerarMarkdownDocumento,
  gerarMarkdownExercicios,
  gerarMarkdownFlashcards,
  gerarMarkdownMapaMental,
  gerarMarkdownQuiz,
  gerarMarkdownResumo,
} from "@shared/export/markdown";
import type { DocumentoExportavel } from "@shared/export/types";
import type {
  Exercicio,
  Flashcard,
  MapaMental,
  Quiz,
  Resumo,
} from "@shared/types";

const resumoCurto: Resumo = {
  documentoId: "",
  modo: "curto",
  conteudo: "Conteúdo do resumo.",
  geradoEm: "",
};

const flashcards: Flashcard[] = [
  { pergunta: "P1?", resposta: "R1." },
  { pergunta: "P2?", resposta: "R2." },
];

const mapa: MapaMental = {
  documentoId: "",
  geradoEm: "",
  raiz: {
    id: "n0",
    rotulo: "Tema",
    filhos: [
      {
        id: "n1",
        rotulo: "Ramo",
        filhos: [{ id: "n2", rotulo: "Folha", filhos: [] }],
      },
    ],
  },
};

const quiz: Quiz = {
  documentoId: "",
  modo: "misto",
  geradoEm: "",
  perguntas: [
    {
      tipo: "multipla",
      enunciado: "Quanto é 2+2?",
      alternativas: [
        { texto: "3", correta: false },
        { texto: "4", correta: true },
      ],
    },
    { tipo: "aberta", enunciado: "Defina X.", gabarito: "X é isso." },
  ],
};

describe("gerarMarkdownResumo (CA2)", () => {
  it("inclui título, linha de modo e conteúdo — modo curto", () => {
    const md = gerarMarkdownResumo(resumoCurto);
    expect(md).toContain("## Resumo");
    expect(md).toContain("*Modo: curto*");
    expect(md).toContain("Conteúdo do resumo.");
    expect(md.endsWith("\n")).toBe(false);
  });

  it("mostra o modo longo quando é esse o modo", () => {
    const md = gerarMarkdownResumo({ ...resumoCurto, modo: "longo" });
    expect(md).toContain("*Modo: longo*");
  });

  it("é determinístico para a mesma entrada", () => {
    expect(gerarMarkdownResumo(resumoCurto)).toBe(
      gerarMarkdownResumo(resumoCurto),
    );
  });
});

describe("gerarMarkdownFlashcards (CA3)", () => {
  it("numera base-1 com pergunta e resposta por card", () => {
    const md = gerarMarkdownFlashcards(flashcards);
    expect(md).toContain("## Flashcards");
    expect(md).toContain("### 1. P1?");
    expect(md).toContain("R1.");
    expect(md).toContain("### 2. P2?");
    expect(md.indexOf("### 1.")).toBeLessThan(md.indexOf("### 2."));
  });
});

describe("gerarMarkdownExercicios (CA4)", () => {
  it("mostra o modo em itálico quando homogêneo", () => {
    const ex: Exercicio[] = [
      { enunciado: "E1", resposta: "G1", modo: "teorica" },
      { enunciado: "E2", resposta: "G2", modo: "teorica" },
    ];
    const md = gerarMarkdownExercicios(ex);
    expect(md).toContain("## Exercícios");
    expect(md).toContain("*Modo: teórica*");
    expect(md).toContain("### 1. E1");
    expect(md).toContain("**Resposta:** G1");
    expect(md).not.toContain("(teórica)");
  });

  it("usa sufixo por item quando os modos são mistos", () => {
    const ex: Exercicio[] = [
      { enunciado: "E1", resposta: "G1", modo: "teorica" },
      { enunciado: "E2", resposta: "G2", modo: "pratica" },
    ];
    const md = gerarMarkdownExercicios(ex);
    expect(md).not.toContain("*Modo:");
    expect(md).toContain("### 1. (teórica) E1");
    expect(md).toContain("### 2. (prática) E2");
  });
});

describe("gerarMarkdownMapaMental (CA5)", () => {
  it("produz lista aninhada com indentação por nível", () => {
    const md = gerarMarkdownMapaMental(mapa);
    const linhas = md.split("\n");
    expect(linhas[0]).toBe("## Mapa mental");
    expect(linhas).toContain("- Tema");
    expect(linhas).toContain("  - Ramo");
    expect(linhas).toContain("    - Folha");
  });
});

describe("gerarMarkdownQuiz (CA6)", () => {
  it("marca a correta com checkbox e mostra o gabarito das abertas", () => {
    const md = gerarMarkdownQuiz(quiz);
    expect(md).toContain("## Quiz");
    expect(md).toContain("### 1. Quanto é 2+2?");
    expect(md).toContain("- [ ] 3");
    expect(md).toContain("- [x] 4");
    expect(md).toContain("### 2. Defina X.");
    expect(md).toContain("**Gabarito:** X é isso.");
  });
});

describe("gerarMarkdownDocumento (CA7, CA8)", () => {
  it("concatena só os artefatos presentes na ordem canônica", () => {
    const doc: DocumentoExportavel = {
      nome: "Meu documento",
      resumo: resumoCurto,
      quiz,
    };
    const md = gerarMarkdownDocumento(doc);
    expect(md.startsWith("# Meu documento")).toBe(true);
    expect(md).toContain("## Resumo");
    expect(md).toContain("## Quiz");
    expect(md).not.toContain("## Flashcards");
    expect(md).not.toContain("## Mapa mental");
    // Ordem canônica: resumo antes do quiz.
    expect(md.indexOf("## Resumo")).toBeLessThan(md.indexOf("## Quiz"));
  });

  it("documento sem artefatos produz cabeçalho + aviso, sem lançar", () => {
    const md = gerarMarkdownDocumento({ nome: "Vazio" });
    expect(md).toBe("# Vazio\n\n_Nenhum artefato gerado ainda._");
  });
});

describe("artefatosPresentes — paridade com storage.ts", () => {
  it("usa length > 0 para flashcards/exercícios e !== undefined para o resto", () => {
    const doc: DocumentoExportavel = {
      nome: "D",
      resumo: resumoCurto,
      flashcards: [],
      exercicios: [],
      mapaMental: mapa,
      quiz,
    };
    // flashcards/exercícios vazios contam como ausentes (length 0).
    expect(artefatosPresentes(doc)).toEqual(["resumo", "mapaMental", "quiz"]);
  });

  it("devolve os tipos na ordem canônica", () => {
    const doc: DocumentoExportavel = {
      nome: "D",
      quiz,
      flashcards,
      resumo: resumoCurto,
    };
    expect(artefatosPresentes(doc)).toEqual(["resumo", "flashcards", "quiz"]);
  });
});
