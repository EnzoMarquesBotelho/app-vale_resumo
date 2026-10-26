import { describe, expect, it } from "vitest";
import type { Content, ContentSvg } from "pdfmake/interfaces";
import {
  montarDefinicaoPdfArtefato,
  montarDefinicaoPdfDocumento,
} from "../../src/main/services/pdfDefinicao.js";
import type { DocumentoExportavel } from "@shared/export/types";
import type { MapaMental, Quiz, Resumo } from "@shared/types";

/** Data fixa para tornar o rodapé determinístico. */
const AGORA = new Date("2026-02-03T10:00:00.000Z");

const resumo: Resumo = {
  documentoId: "",
  modo: "curto",
  conteudo: "Resumo.",
  geradoEm: "",
};

const mapa: MapaMental = {
  documentoId: "",
  geradoEm: "",
  raiz: {
    id: "n0",
    rotulo: "Tema",
    filhos: [{ id: "n1", rotulo: "Ramo", filhos: [] }],
  },
};

const quiz: Quiz = {
  documentoId: "",
  modo: "misto",
  geradoEm: "",
  perguntas: [{ tipo: "aberta", enunciado: "Q?", gabarito: "G." }],
};

/** `true` se `no` é um nó de SVG com string começando em `<svg`. */
function ehSvgValido(no: Content): no is ContentSvg {
  return (
    typeof no === "object" &&
    no !== null &&
    "svg" in no &&
    typeof (no as ContentSvg).svg === "string" &&
    (no as ContentSvg).svg.startsWith("<svg")
  );
}

/** Extrai os textos (de nós `{ text }`) do content para asserções de ordem. */
function textos(content: Content[]): string[] {
  return content
    .map((no) =>
      typeof no === "object" && no !== null && "text" in no
        ? String((no as { text: unknown }).text)
        : "",
    )
    .filter((t) => t.length > 0);
}

describe("montarDefinicaoPdfArtefato (CA9)", () => {
  it("content é array com título do documento e o bloco do tipo", () => {
    const doc: DocumentoExportavel = { nome: "Doc", resumo };
    const def = montarDefinicaoPdfArtefato("resumo", doc, AGORA);
    expect(Array.isArray(def.content)).toBe(true);
    const content = def.content as Content[];
    expect(textos(content)).toContain("Doc");
    expect(textos(content)).toContain("Resumo");
  });

  it("para mapaMental há um nó { svg } que começa com <svg", () => {
    const doc: DocumentoExportavel = { nome: "Doc", mapaMental: mapa };
    const def = montarDefinicaoPdfArtefato("mapaMental", doc, AGORA);
    const content = def.content as Content[];
    expect(content.some(ehSvgValido)).toBe(true);
  });
});

describe("montarDefinicaoPdfDocumento (CA10)", () => {
  it("inclui uma seção por artefato presente na ordem canônica", () => {
    const doc: DocumentoExportavel = { nome: "Doc", resumo, quiz };
    const def = montarDefinicaoPdfDocumento(doc, AGORA);
    const ts = textos(def.content as Content[]);
    expect(ts).toContain("Resumo");
    expect(ts).toContain("Quiz");
    expect(ts).not.toContain("Flashcards");
    expect(ts).not.toContain("Mapa mental");
    expect(ts.indexOf("Resumo")).toBeLessThan(ts.indexOf("Quiz"));
  });

  it("documento vazio produz um nó de aviso (sem lançar)", () => {
    const def = montarDefinicaoPdfDocumento({ nome: "Vazio" }, AGORA);
    const ts = textos(def.content as Content[]);
    expect(ts).toContain("Nenhum artefato gerado ainda.");
  });

  it("o rodapé é estável para uma data fixa", () => {
    const def = montarDefinicaoPdfDocumento({ nome: "Doc", resumo }, AGORA);
    expect(typeof def.footer).toBe("function");
    const rodape = (def.footer as (p: number, t: number) => unknown)(1, 2);
    expect(JSON.stringify(rodape)).toContain("Exportado em");
    expect(JSON.stringify(rodape)).toContain(AGORA.toLocaleDateString("pt-BR"));
  });
});
