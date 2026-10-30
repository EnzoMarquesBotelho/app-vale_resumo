import { describe, expect, it } from "vitest";
import {
  dataLocalDe,
  dataMinimaProva,
  mensagemDataMinima,
  validarDataProva,
} from "@shared/dataProva";
import { assinaturaPlano, estadoDiagnostico } from "@shared/diagnostico";
import {
  nomeProva,
  tituloAposDigitar,
  tituloAposMudanca,
} from "@shared/nomeProva";
import {
  aplicarOrdinalAoPlano,
  ordinalDeTipo,
  tipoDescartaNovos,
  vinculoAposEscolherTipo,
} from "@shared/tipoProva";
import type { DiagnosticoPlano, PlanoEstudo } from "@shared/types";

describe("nomeProva", () => {
  it.each([
    [{ cadernoNome: "Cálculo", tipo: "primeira" }, "Cálculo — 1ª prova"],
    [{ cadernoNome: "Cálculo", tipo: "segunda" }, "Cálculo — 2ª prova"],
    [{ cadernoNome: "Cálculo", tipo: "final" }, "Cálculo — Prova final"],
    [{ cadernoNome: "Cálculo", tipo: "enem" }, "Cálculo — ENEM"],
    [{ tipo: "enem" }, "ENEM"],
    [{ tipo: "enade" }, "ENADE"],
    [{ cadernoNome: "Cálculo" }, "Cálculo"],
    [{ cadernoNome: "  Física  ", tipo: "segunda" }, "Física — 2ª prova"],
    [{}, ""],
    [{ cadernoNome: "   " }, ""],
    [{ cadernoNome: null, tipo: null }, ""],
  ] as const)("%j => %s", (entrada, esperado) => {
    expect(nomeProva(entrada)).toBe(esperado);
  });

  it("limita a 200 caracteres", () => {
    expect(
      nomeProva({ cadernoNome: "x".repeat(250), tipo: "final" }).length,
    ).toBeLessThanOrEqual(200);
  });

  it("não sobrescreve título digitado pelo aluno", () => {
    const digitado = tituloAposDigitar("Minha P1", "criar");
    expect(digitado.editado).toBe(true);
    const depois = tituloAposMudanca(digitado, { cadernoNome: "X", tipo: "final" });
    expect(depois).toBe(digitado);
  });

  it("criar: campo vazio retoma o automático; editar: vazio segue do usuário", () => {
    expect(tituloAposDigitar("", "criar").editado).toBe(false);
    expect(tituloAposDigitar("", "editar").editado).toBe(true);
    const auto = tituloAposMudanca(
      { titulo: "", editado: false },
      { cadernoNome: "Cálculo", tipo: "segunda" },
    );
    expect(auto).toEqual({ titulo: "Cálculo — 2ª prova", editado: false });
  });
});

describe("dataProva", () => {
  const HOJE = "2026-10-30";
  it.each([
    ["2026-10-31", "2026-10-30", undefined, true],
    ["2026-10-30", "2026-10-30", undefined, false],
    ["2026-10-29", "2026-10-30", undefined, false],
    ["2026-11-30", "2026-10-30", undefined, true],
    ["2027-01-01", "2026-12-31", undefined, true],
    ["2026-12-31", "2026-12-31", undefined, false],
    ["2028-02-29", "2028-02-28", undefined, true],
    ["2026-03-01", "2026-02-28", undefined, true],
    ["2026-03-01", HOJE, "2026-03-01", true],
    ["2026-03-05", HOJE, "2026-03-01", false],
    ["2026-10-30", HOJE, "2026-03-01", false],
    ["2026-11-15", HOJE, "2026-03-01", true],
  ])("%s com hoje=%s dataAtual=%s => ok=%s", (data, hoje, dataAtual, ok) => {
    expect(validarDataProva({ data, hoje, dataAtual }).ok).toBe(ok);
  });

  it("formato inválido nunca lança, mesmo igual à dataAtual", () => {
    for (const data of ["2026-02-30", ""]) {
      const r = validarDataProva({ data, hoje: HOJE, dataAtual: data });
      expect(r).toMatchObject({ ok: false, motivo: "formato" });
    }
  });

  it("hoje inválido: lança só na etapa 3", () => {
    expect(
      validarDataProva({ data: "2026-03-01", hoje: "x", dataAtual: "2026-03-01" }).ok,
    ).toBe(true);
    expect(() => validarDataProva({ data: "2026-03-01", hoje: "x" })).toThrow();
  });

  it("mensagem em pt-BR cita amanhã", () => {
    expect(mensagemDataMinima(HOJE)).toContain("31/10/2026");
    expect(dataMinimaProva(HOJE)).toBe("2026-10-31");
  });

  it("dataLocalDe usa o calendário local (virada do dia)", () => {
    expect(dataLocalDe(new Date(2026, 9, 30, 23, 59))).toBe("2026-10-30");
    expect(dataLocalDe(new Date(2026, 9, 31, 0, 1))).toBe("2026-10-31");
  });
});

describe("tipoProva", () => {
  const plano = (ordinal: PlanoEstudo["ordinal"], novo: boolean): PlanoEstudo => ({
    ordinal,
    horasPorDia: 2,
    diasPorSemana: 5,
    topicos: [
      { id: "a", titulo: "A", novo: false },
      { id: "b", titulo: "B", novo },
    ],
    checkpoint: "lembrete",
    atualizadoEm: "2026-03-01T00:00:00.000Z",
  });

  it("ENEM e ENADE contam como primeira", () => {
    expect(ordinalDeTipo("enem")).toBe("primeira");
    expect(ordinalDeTipo("enade")).toBe("primeira");
    expect(ordinalDeTipo("primeira")).toBe("primeira");
    expect(ordinalDeTipo("segunda")).toBe("segunda");
    expect(ordinalDeTipo("final")).toBe("final");
  });

  it("aplicarOrdinalAoPlano: força novo=false, mesma referência, não toca atualizadoEm", () => {
    const p = plano("segunda", true);
    const nova = aplicarOrdinalAoPlano(p, "primeira");
    expect(nova.topicos.every((t) => !t.novo)).toBe(true);
    expect(nova.atualizadoEm).toBe(p.atualizadoEm);
    expect(aplicarOrdinalAoPlano(p, "segunda")).toBe(p);
  });

  it("trocar o ordinal invalida o diagnóstico", () => {
    const p = plano("segunda", true);
    const d: DiagnosticoPlano = {
      assinatura: assinaturaPlano(p),
      geradoEm: "2026-03-01T00:00:00.000Z",
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "?",
          alternativas: [
            { texto: "A", correta: true },
            { texto: "B", correta: false },
          ],
          topicoId: "a",
          camada: "base",
        },
      ],
      pedido: 1,
      ignorados: [],
      respostas: [0],
      concluidoEm: "2026-03-02T00:00:00.000Z",
    };
    expect(estadoDiagnostico(p, d)).toBe("concluido");
    expect(estadoDiagnostico(aplicarOrdinalAoPlano(p, "final"), d)).toBe(
      "desatualizado",
    );
  });

  it("tipoDescartaNovos", () => {
    expect(tipoDescartaNovos(plano("segunda", true), "primeira")).toBe(true);
    expect(tipoDescartaNovos(plano("segunda", true), "enem")).toBe(true);
    expect(tipoDescartaNovos(plano("final", true), "enade")).toBe(true);
    expect(tipoDescartaNovos(plano("segunda", false), "enem")).toBe(false);
    expect(tipoDescartaNovos(undefined, "enem")).toBe(false);
    expect(tipoDescartaNovos(plano("primeira", true), "enem")).toBe(false);
    expect(tipoDescartaNovos(plano("segunda", true), "final")).toBe(false);
  });

  it("vinculoAposEscolherTipo", () => {
    const f = (
      tipoVinculo: "caderno" | "abrangente",
      cadernoNome: string,
      tocado: boolean,
    ) => ({ tipoVinculo, cadernoNome, tocado });
    expect(vinculoAposEscolherTipo(f("caderno", "", false), "enem")).toBe("abrangente");
    expect(vinculoAposEscolherTipo(f("caderno", "", false), "enade")).toBe("abrangente");
    expect(vinculoAposEscolherTipo(f("caderno", "Cálculo", true), "enem")).toBe("caderno");
    expect(vinculoAposEscolherTipo(f("caderno", "Cálculo", false), "enade")).toBe("caderno");
    expect(vinculoAposEscolherTipo(f("caderno", "", true), "enem")).toBe("caderno");
    expect(vinculoAposEscolherTipo(f("abrangente", "", true), "primeira")).toBe("abrangente");
    expect(vinculoAposEscolherTipo(f("abrangente", "", false), "segunda")).toBe("abrangente");
    expect(vinculoAposEscolherTipo(f("caderno", "", false), "primeira")).toBe("caderno");
    expect(vinculoAposEscolherTipo(f("caderno", "", false), "")).toBe("caderno");
  });
});
