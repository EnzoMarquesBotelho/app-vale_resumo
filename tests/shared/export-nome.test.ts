import { describe, expect, it } from "vitest";
import { sugerirNomeArquivo } from "@shared/export/nome";
import type { AlvoExportacao } from "@shared/export/types";

function alvoArtefato(nome: string): AlvoExportacao {
  return {
    escopo: "artefato",
    tipo: "resumo",
    documento: { nome },
  };
}

function alvoDocumento(nome: string): AlvoExportacao {
  return { escopo: "documento", documento: { nome } };
}

describe("sugerirNomeArquivo", () => {
  it("usa a extensão por formato", () => {
    expect(sugerirNomeArquivo(alvoDocumento("Aula"), "markdown")).toBe(
      "Aula.md",
    );
    expect(sugerirNomeArquivo(alvoDocumento("Aula"), "pdf")).toBe("Aula.pdf");
  });

  it("acrescenta o sufixo humano por artefato", () => {
    expect(sugerirNomeArquivo(alvoArtefato("Aula"), "markdown")).toBe(
      "Aula - Resumo.md",
    );
    const mapa: AlvoExportacao = {
      escopo: "artefato",
      tipo: "mapaMental",
      documento: { nome: "Aula" },
    };
    expect(sugerirNomeArquivo(mapa, "pdf")).toBe("Aula - Mapa mental.pdf");
  });

  it("remove a extensão conhecida do nome do documento", () => {
    expect(sugerirNomeArquivo(alvoDocumento("Capítulo 1.pdf"), "markdown")).toBe(
      "Capítulo 1.md",
    );
    expect(sugerirNomeArquivo(alvoDocumento("notas.txt"), "pdf")).toBe(
      "notas.pdf",
    );
  });

  it("remove caracteres inválidos do Windows", () => {
    expect(
      sugerirNomeArquivo(alvoDocumento('a/b:c*d?"e'), "markdown"),
    ).toBe("abcde.md");
  });

  it("colapsa nome vazio para 'export'", () => {
    expect(sugerirNomeArquivo(alvoDocumento("   "), "pdf")).toBe("export.pdf");
    expect(sugerirNomeArquivo(alvoArtefato(""), "markdown")).toBe(
      "export - Resumo.md",
    );
  });
});
