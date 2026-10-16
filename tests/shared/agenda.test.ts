import { describe, expect, it } from "vitest";
import { INTERVALOS_REVISAO_PADRAO } from "@shared/constants";
import {
  calcularDicaDoDia,
  diaParaNumero,
  diasRestantes,
  diferencaDias,
  estadoProva,
  gerarAgenda,
  normalizarIntervalos,
  numeroParaDia,
  parsearIntervalos,
  recomputarAgenda,
} from "@shared/agenda";
import type {
  CadernoEmFoco,
  Prova,
  SessaoRevisao,
  VinculoProva,
} from "@shared/types";

/** Helper: monta uma prova mínima para os testes de dica. */
function provaDe(
  partes: Partial<Prova> & { data: string; vinculo: VinculoProva },
): Prova {
  return {
    id: partes.id ?? "p1",
    titulo: partes.titulo ?? "Prova",
    data: partes.data,
    vinculo: partes.vinculo,
    intervalos: partes.intervalos ?? [7, 3, 1],
    sessoes: partes.sessoes ?? [],
    criadoEm: partes.criadoEm ?? "2026-01-01T00:00:00.000Z",
    atualizadoEm: partes.atualizadoEm ?? "2026-01-01T00:00:00.000Z",
  };
}

/** Helper: monta um CadernoEmFoco. */
function caderno(
  cadernoId: string,
  cadernoNome: string,
  total = 1,
  temResumo = false,
  temFlashcards = false,
): CadernoEmFoco {
  return { cadernoId, cadernoNome, totalDocumentos: total, temResumo, temFlashcards };
}

describe("aritmética de dias", () => {
  it("faz round-trip de datas", () => {
    expect(numeroParaDia(diaParaNumero("2026-03-10"))).toBe("2026-03-10");
    expect(numeroParaDia(diaParaNumero("2026-10-25"))).toBe("2026-10-25");
    expect(numeroParaDia(diaParaNumero("2000-01-01"))).toBe("2000-01-01");
  });

  it("calcula diferença exata atravessando o DST de março", () => {
    // No Brasil/EUA, viradas de horário de verão caem em março/outubro.
    expect(diferencaDias("2026-03-15", "2026-03-08")).toBe(7);
  });

  it("calcula diferença exata atravessando o DST de outubro", () => {
    expect(diferencaDias("2026-10-25", "2026-10-18")).toBe(7);
  });

  it("rejeita datas inexistentes pela round-trip de validação", () => {
    expect(() => diaParaNumero("2026-02-30")).toThrow();
    expect(() => diaParaNumero("2026-13-01")).toThrow();
    expect(() => diaParaNumero("2026-00-10")).toThrow();
  });
});

describe("parsearIntervalos", () => {
  it("separa por vírgula e/ou espaço", () => {
    expect(parsearIntervalos("7, 3 1")).toEqual([7, 3, 1]);
    expect(parsearIntervalos("  10  20 ")).toEqual([10, 20]);
  });

  it("descarta tokens não numéricos sem lançar", () => {
    expect(parsearIntervalos("7, três")).toEqual([7]);
  });

  it("string vazia ou sem números vira []", () => {
    expect(parsearIntervalos("")).toEqual([]);
    expect(parsearIntervalos("abc")).toEqual([]);
  });
});

describe("normalizarIntervalos", () => {
  it("arredonda, descarta <=0 e >DIAS_ANTES_MAX, dedup, ordena desc", () => {
    expect(normalizarIntervalos([3, 7, 1, 7, 0, -5, 400, 3.4])).toEqual([
      7, 3, 1,
    ]);
  });

  it("corta em INTERVALOS_MAX", () => {
    const muitos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(normalizarIntervalos(muitos)).toHaveLength(10);
  });

  it("vazio após sanear cai no default", () => {
    expect(normalizarIntervalos([])).toEqual([...INTERVALOS_REVISAO_PADRAO]);
    expect(normalizarIntervalos([0, -1, 999999])).toEqual([
      ...INTERVALOS_REVISAO_PADRAO,
    ]);
  });
});

describe("gerarAgenda", () => {
  it("prova em hoje+10 com [7,3,1] → 3 sessões corretas", () => {
    const sessoes = gerarAgenda({
      dataProva: "2026-03-11",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
    });
    expect(sessoes).toEqual([
      { id: "s0", data: "2026-03-04", diasAntes: 7, manual: false },
      { id: "s1", data: "2026-03-08", diasAntes: 3, manual: false },
      { id: "s2", data: "2026-03-10", diasAntes: 1, manual: false },
    ]);
  });

  it("prova em hoje+1 → só a sessão de 1 dia antes (= hoje)", () => {
    const sessoes = gerarAgenda({
      dataProva: "2026-03-02",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
    });
    expect(sessoes).toEqual([
      { id: "s0", data: "2026-03-01", diasAntes: 1, manual: false },
    ]);
  });

  it("mantém sessão exatamente em hoje", () => {
    const sessoes = gerarAgenda({
      dataProva: "2026-03-08",
      intervalos: [7],
      hoje: "2026-03-01",
    });
    expect(sessoes).toEqual([
      { id: "s0", data: "2026-03-01", diasAntes: 7, manual: false },
    ]);
  });

  it("deduplica datas iguais mantendo o menor diasAntes", () => {
    // 3.5 arredonda para 4; junto com 4 cai na mesma data.
    const sessoes = gerarAgenda({
      dataProva: "2026-03-20",
      intervalos: [4, 3.5, 1],
      hoje: "2026-03-01",
    });
    const dia16 = sessoes.find((s) => s.data === "2026-03-16");
    expect(dia16?.diasAntes).toBe(4);
    expect(sessoes.filter((s) => s.data === "2026-03-16")).toHaveLength(1);
  });

  it("dataProva <= hoje → []", () => {
    expect(
      gerarAgenda({ dataProva: "2026-03-01", intervalos: [7, 3, 1], hoje: "2026-03-01" }),
    ).toEqual([]);
    expect(
      gerarAgenda({ dataProva: "2026-02-20", intervalos: [7, 3, 1], hoje: "2026-03-01" }),
    ).toEqual([]);
  });
});

describe("diasRestantes / estadoProva", () => {
  it("hoje → 0 / 'hoje'", () => {
    expect(diasRestantes("2026-03-01", "2026-03-01")).toBe(0);
    expect(estadoProva(0)).toBe("hoje");
  });

  it("amanhã → 1 / 'amanha'", () => {
    expect(diasRestantes("2026-03-02", "2026-03-01")).toBe(1);
    expect(estadoProva(1)).toBe("amanha");
  });

  it("ontem → -1 / 'passada'", () => {
    expect(diasRestantes("2026-02-28", "2026-03-01")).toBe(-1);
    expect(estadoProva(-1)).toBe("passada");
  });

  it("daqui a 5 dias → 'futura'", () => {
    expect(diasRestantes("2026-03-06", "2026-03-01")).toBe(5);
    expect(estadoProva(5)).toBe("futura");
  });
});

describe("recomputarAgenda", () => {
  it("mudar a data re-ancora as sugeridas e mantém manuais futuras", () => {
    const atuais: SessaoRevisao[] = [
      { id: "s0", data: "2026-03-04", diasAntes: 7, manual: false },
      { id: "s1", data: "2026-03-09", diasAntes: 2, manual: true },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-21",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    // A manual de 2026-03-09 sobrevive; as sugeridas re-ancoram em 21.
    expect(novas.some((s) => s.data === "2026-03-09" && s.manual)).toBe(true);
    expect(novas.some((s) => s.data === "2026-03-14" && !s.manual)).toBe(true);
    expect(novas.some((s) => s.data === "2026-03-18" && !s.manual)).toBe(true);
    expect(novas.some((s) => s.data === "2026-03-20" && !s.manual)).toBe(true);
    // A sugerida antiga de 2026-03-04 foi descartada e regerada.
    expect(novas.some((s) => s.data === "2026-03-04")).toBe(false);
  });

  it("manual vence colisão de data sem duplicar o dia", () => {
    const atuais: SessaoRevisao[] = [
      { id: "s0", data: "2026-03-14", diasAntes: 0, manual: true },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-21",
      intervalos: [7], // 21 − 7 = 14, colide com a manual
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    const em14 = novas.filter((s) => s.data === "2026-03-14");
    expect(em14).toHaveLength(1);
    expect(em14[0].manual).toBe(true);
  });

  it("manual no passado é descartada", () => {
    const atuais: SessaoRevisao[] = [
      { id: "s0", data: "2026-02-20", diasAntes: 9, manual: true },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-21",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    expect(novas.some((s) => s.data === "2026-02-20")).toBe(false);
  });

  it("reatribui ids em ordem de data", () => {
    const atuais: SessaoRevisao[] = [
      { id: "x", data: "2026-03-09", diasAntes: 2, manual: true },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-11",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    expect(novas.map((s) => s.id)).toEqual(novas.map((_, i) => `s${i}`));
    const datas = novas.map((s) => s.data);
    expect([...datas].sort()).toEqual(datas);
  });

  it("concluir uma sugerida (manual:false) → recomputar substitui as não-tocadas", () => {
    const atuais: SessaoRevisao[] = [
      { id: "s0", data: "2026-03-04", diasAntes: 7, manual: false, concluida: true },
      { id: "s1", data: "2026-03-08", diasAntes: 3, manual: false },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-11",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    // A sugerida concluída é substituída pela regeração (nada preserva concluida de sugeridas).
    expect(novas.every((s) => s.manual === false)).toBe(true);
    expect(novas.some((s) => s.concluida)).toBe(false);
    expect(novas.map((s) => s.data)).toEqual([
      "2026-03-04",
      "2026-03-08",
      "2026-03-10",
    ]);
  });

  it("mover (manual:true) → recomputar mantém", () => {
    const atuais: SessaoRevisao[] = [
      { id: "s0", data: "2026-03-05", diasAntes: 6, manual: true },
    ];
    const novas = recomputarAgenda({
      dataProva: "2026-03-11",
      intervalos: [7, 3, 1],
      hoje: "2026-03-01",
      sessoesAtuais: atuais,
    });
    const movida = novas.find((s) => s.data === "2026-03-05");
    expect(movida?.manual).toBe(true);
    // diasAntes recalculado em relação à data da prova (11 − 5 = 6).
    expect(movida?.diasAntes).toBe(6);
  });
});

describe("calcularDicaDoDia", () => {
  const vinculoCaderno: VinculoProva = {
    tipo: "caderno",
    cadernoId: "calculo",
    cadernoNome: "Cálculo",
  };

  it("vínculo caderno cita totalDocumentos e artefatos", () => {
    const prova = provaDe({
      data: "2026-03-11",
      vinculo: vinculoCaderno,
      sessoes: [{ id: "s0", data: "2026-03-01", diasAntes: 10, manual: false }],
    });
    const dica = calcularDicaDoDia({
      prova,
      hoje: "2026-03-01",
      cadernosDisponiveis: [caderno("calculo", "Cálculo", 3, true, true)],
    });
    expect(dica.temRevisaoHoje).toBe(true);
    expect(dica.cadernosEmFoco).toHaveLength(1);
    expect(dica.mensagem).toContain("3 documentos");
    expect(dica.mensagem).toContain("tem resumo e flashcards");
    expect(dica.mensagem).toContain("Cálculo");
  });

  it("abrangente + rotação avança por 3 datas consecutivas N=2 → c0,c1,c0", () => {
    const vinculo: VinculoProva = { tipo: "abrangente", modoDistribuicao: "rotacao" };
    const cadernos = [caderno("a", "A"), caderno("b", "B")];
    const sessoes: SessaoRevisao[] = [
      { id: "s0", data: "2026-03-01", diasAntes: 3, manual: false },
      { id: "s1", data: "2026-03-02", diasAntes: 2, manual: false },
      { id: "s2", data: "2026-03-03", diasAntes: 1, manual: false },
    ];
    const foco = (hoje: string) =>
      calcularDicaDoDia({
        prova: provaDe({ data: "2026-03-04", vinculo, sessoes }),
        hoje,
        cadernosDisponiveis: cadernos,
      }).cadernosEmFoco[0]?.cadernoId;
    expect(foco("2026-03-01")).toBe("a");
    expect(foco("2026-03-02")).toBe("b");
    expect(foco("2026-03-03")).toBe("a");
  });

  it("entrada embaralhada vs ordenada → mesmo resultado (ordem já estável)", () => {
    const vinculo: VinculoProva = { tipo: "abrangente", modoDistribuicao: "rotacao" };
    const sessoes: SessaoRevisao[] = [
      { id: "s2", data: "2026-03-03", diasAntes: 1, manual: false },
      { id: "s0", data: "2026-03-01", diasAntes: 3, manual: false },
      { id: "s1", data: "2026-03-02", diasAntes: 2, manual: false },
    ];
    const cadernos = [caderno("a", "A"), caderno("b", "B")];
    const dica = calcularDicaDoDia({
      prova: provaDe({ data: "2026-03-04", vinculo, sessoes }),
      hoje: "2026-03-02",
      cadernosDisponiveis: cadernos,
    });
    // Índice de 2026-03-02 nas sessões ORDENADAS = 1 → cadernos[1 % 2] = "b".
    expect(dica.cadernosEmFoco[0].cadernoId).toBe("b");
  });

  it("intercalado = todos os cadernos com contagens", () => {
    const vinculo: VinculoProva = { tipo: "abrangente", modoDistribuicao: "intercalado" };
    const dica = calcularDicaDoDia({
      prova: provaDe({
        data: "2026-03-11",
        vinculo,
        sessoes: [{ id: "s0", data: "2026-03-01", diasAntes: 10, manual: false }],
      }),
      hoje: "2026-03-01",
      cadernosDisponiveis: [caderno("a", "A", 2), caderno("b", "B", 5)],
    });
    expect(dica.cadernosEmFoco).toHaveLength(2);
    expect(dica.mensagem).toContain("2 documentos");
    expect(dica.mensagem).toContain("5 documentos");
    expect(dica.mensagem).toContain("um pouco de cada");
  });

  it("abrangente sem cadernos → guia a importar, cadernosEmFoco:[]", () => {
    const vinculo: VinculoProva = { tipo: "abrangente", modoDistribuicao: "rotacao" };
    const dica = calcularDicaDoDia({
      prova: provaDe({
        data: "2026-03-11",
        vinculo,
        sessoes: [{ id: "s0", data: "2026-03-01", diasAntes: 10, manual: false }],
      }),
      hoje: "2026-03-01",
      cadernosDisponiveis: [],
    });
    expect(dica.cadernosEmFoco).toEqual([]);
    expect(dica.temRevisaoHoje).toBe(true);
    expect(dica.mensagem).toContain("Importe");
  });

  it("prova passada → 'já passou'", () => {
    const dica = calcularDicaDoDia({
      prova: provaDe({ data: "2026-02-28", vinculo: vinculoCaderno }),
      hoje: "2026-03-01",
      cadernosDisponiveis: [caderno("calculo", "Cálculo")],
    });
    expect(dica.mensagem).toBe("Esta prova já passou.");
    expect(dica.cadernosEmFoco).toEqual([]);
    expect(dica.diasRestantes).toBe(-1);
  });

  it("sem revisão hoje → orienta próximo passo", () => {
    const dica = calcularDicaDoDia({
      prova: provaDe({
        titulo: "P1",
        data: "2026-03-11",
        vinculo: vinculoCaderno,
        sessoes: [{ id: "s0", data: "2026-03-05", diasAntes: 6, manual: false }],
      }),
      hoje: "2026-03-01",
      cadernosDisponiveis: [caderno("calculo", "Cálculo")],
    });
    expect(dica.temRevisaoHoje).toBe(false);
    expect(dica.cadernosEmFoco).toEqual([]);
    expect(dica.mensagem).toContain("Nenhuma revisão agendada para hoje");
    expect(dica.mensagem).toContain("P1");
  });
});

describe("montagem da frase a partir do estado do material", () => {
  const base = (temResumo: boolean, temFlashcards: boolean, total = 1) =>
    calcularDicaDoDia({
      prova: provaDe({
        data: "2026-03-11",
        vinculo: { tipo: "caderno", cadernoId: "c", cadernoNome: "Mat" },
        sessoes: [{ id: "s0", data: "2026-03-01", diasAntes: 10, manual: false }],
      }),
      hoje: "2026-03-01",
      cadernosDisponiveis: [caderno("c", "Mat", total, temResumo, temFlashcards)],
    }).mensagem;

  it("só resumo", () => {
    const m = base(true, false);
    expect(m).toContain("tem resumo");
    expect(m).not.toContain("flashcards");
  });

  it("só flashcards", () => {
    const m = base(false, true);
    expect(m).toContain("tem flashcards");
    expect(m).not.toContain("tem resumo");
  });

  it("ambos", () => {
    expect(base(true, true)).toContain("tem resumo e flashcards");
  });

  it("nenhum → sem sufixo de artefatos", () => {
    const m = base(false, false);
    expect(m).not.toContain("tem resumo");
    expect(m).not.toContain("tem flashcards");
  });

  it("singular vs plural de documento(s)", () => {
    expect(base(false, false, 1)).toContain("1 documento");
    expect(base(false, false, 1)).not.toContain("1 documentos");
    expect(base(false, false, 2)).toContain("2 documentos");
  });
});
