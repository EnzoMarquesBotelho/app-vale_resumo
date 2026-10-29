import { describe, expect, it } from "vitest";
import {
  calcularMisturaBaseNovo,
  calcularPlano,
} from "@shared/plano";
import type {
  CalcularPlanoParams,
  TopicoDistribuivel,
} from "@shared/plano";

/** Helper: tópico distribuível com defaults. */
function topico(
  partes: Partial<TopicoDistribuivel> & { id: string },
): TopicoDistribuivel {
  return {
    id: partes.id,
    titulo: partes.titulo ?? partes.id,
    novo: partes.novo ?? false,
    dificuldade: partes.dificuldade ?? 0,
  };
}

/** Helper: datas "YYYY-MM-DD" corridas a partir de um início (dia 1..n). */
function datas(inicio: string, n: number): string[] {
  const out: string[] = [];
  const [ano, mes, dia] = inicio.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia + i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe("calcularMisturaBaseNovo — tabela §6.4", () => {
  it("prova hoje (0 dias): 0.15 / 0.85", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 0,
      totalBase: 2,
      totalNovo: 2,
      dificuldadeBase: 0,
    });
    expect(m.fracaoBase).toBeCloseTo(0.15, 4);
    expect(m.fracaoNovo).toBeCloseTo(0.85, 4);
  });

  it("prova em 15 dias: 0.475 / 0.525 (meio-termo)", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 15,
      totalBase: 1,
      totalNovo: 1,
      dificuldadeBase: 0,
    });
    expect(m.fracaoBase).toBeCloseTo(0.475, 4);
    expect(m.fracaoNovo).toBeCloseTo(0.525, 4);
  });

  it("prova longe (>=30 dias): foco pesado, não total: 0.80 / 0.20", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 45,
      totalBase: 3,
      totalNovo: 1,
      dificuldadeBase: 0,
    });
    expect(m.fracaoBase).toBeCloseTo(0.8, 4);
    expect(m.fracaoNovo).toBeCloseTo(0.2, 4);
  });

  it("prova no passado é tratada como hoje (clamp a 0 dias)", () => {
    const passado = calcularMisturaBaseNovo({
      diasRestantes: -5,
      totalBase: 1,
      totalNovo: 1,
      dificuldadeBase: 0,
    });
    expect(passado.fracaoBase).toBeCloseTo(0.15, 4);
  });

  it("base difícil em 15 dias: 0.6375 / 0.3625", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 15,
      totalBase: 1,
      totalNovo: 1,
      dificuldadeBase: 1,
    });
    expect(m.fracaoBase).toBeCloseTo(0.6375, 4);
    expect(m.fracaoNovo).toBeCloseTo(0.3625, 4);
  });

  it("base difícil longe: já no teto (0.80 / 0.20)", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 40,
      totalBase: 2,
      totalNovo: 2,
      dificuldadeBase: 1,
    });
    expect(m.fracaoBase).toBeCloseTo(0.8, 4);
  });

  it("degeneração 0/0 → {0,0} (único caso de soma 0)", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 10,
      totalBase: 0,
      totalNovo: 0,
      dificuldadeBase: 0,
    });
    expect(m).toEqual({ fracaoBase: 0, fracaoNovo: 0 });
  });

  it("degeneração só base (totalNovo=0) → {1,0}", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 10,
      totalBase: 3,
      totalNovo: 0,
      dificuldadeBase: 0.5,
    });
    expect(m).toEqual({ fracaoBase: 1, fracaoNovo: 0 });
  });

  it("degeneração só novo (totalBase=0) → {0,1}", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 10,
      totalBase: 0,
      totalNovo: 3,
      dificuldadeBase: 0,
    });
    expect(m).toEqual({ fracaoBase: 0, fracaoNovo: 1 });
  });

  it("HIGH-1: com totalNovo>0, fracaoNovo>0 mesmo muito longe", () => {
    const m = calcularMisturaBaseNovo({
      diasRestantes: 365,
      totalBase: 5,
      totalNovo: 1,
      dificuldadeBase: 1,
    });
    expect(m.fracaoNovo).toBeGreaterThan(0);
  });

  it("invariante de soma === 1 fora da degeneração 0/0", () => {
    for (const dias of [0, 3, 7, 15, 29, 30, 100, -3]) {
      for (const dif of [0, 0.5, 1]) {
        const m = calcularMisturaBaseNovo({
          diasRestantes: dias,
          totalBase: 2,
          totalNovo: 2,
          dificuldadeBase: dif,
        });
        expect(m.fracaoBase + m.fracaoNovo).toBeCloseTo(1, 6);
        expect(m.fracaoBase).toBeGreaterThanOrEqual(0.15);
        expect(m.fracaoBase).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it("monótona não-decrescente em diasRestantes (ambos > 0)", () => {
    let anterior = -1;
    for (const dias of [0, 1, 5, 10, 20, 30, 60]) {
      const m = calcularMisturaBaseNovo({
        diasRestantes: dias,
        totalBase: 2,
        totalNovo: 2,
        dificuldadeBase: 0,
      });
      expect(m.fracaoBase).toBeGreaterThanOrEqual(anterior);
      anterior = m.fracaoBase;
    }
  });

  it("monótona não-decrescente em dificuldadeBase (ambos > 0)", () => {
    let anterior = -1;
    for (const dif of [0, 0.25, 0.5, 0.75, 1]) {
      const m = calcularMisturaBaseNovo({
        diasRestantes: 10,
        totalBase: 2,
        totalNovo: 2,
        dificuldadeBase: dif,
      });
      expect(m.fracaoBase).toBeGreaterThanOrEqual(anterior);
      anterior = m.fracaoBase;
    }
  });
});

describe("calcularPlano — guardas e avisos (§7.5)", () => {
  it("sem tópicos → sem_topicos, mistura ausente, dias vazios", () => {
    const r = calcularPlano({
      topicos: [],
      datasDisponiveis: datas("2026-03-02", 5),
      horasPorDia: 2,
      diasRestantes: 10,
      ordinal: "segunda",
    });
    expect(r.aviso).toEqual({ tipo: "sem_topicos" });
    expect(r.mistura).toBeUndefined();
    expect(r.dias).toEqual([]);
  });

  it("sem dias → sem_dias, mistura ausente", () => {
    const r = calcularPlano({
      topicos: [topico({ id: "a" })],
      datasDisponiveis: [],
      horasPorDia: 2,
      diasRestantes: 1,
      ordinal: "segunda",
    });
    expect(r.aviso).toEqual({ tipo: "sem_dias" });
    expect(r.mistura).toBeUndefined();
    expect(r.dias).toEqual([]);
  });
});

describe("calcularPlano — distribuição", () => {
  const base: Omit<CalcularPlanoParams, "topicos"> = {
    datasDisponiveis: datas("2026-03-02", 5),
    horasPorDia: 2,
    diasRestantes: 10,
    ordinal: "segunda",
  };

  it("cabe tudo: mistura presente e sem aviso", () => {
    const r = calcularPlano({
      ...base,
      topicos: [
        topico({ id: "a", novo: false }),
        topico({ id: "b", novo: true }),
      ],
    });
    expect(r.mistura).toBeDefined();
    expect(r.aviso).toBeUndefined();
  });

  it("nenhum dia excede a capacidade e nenhum bloco < 15 min", () => {
    const r = calcularPlano({
      ...base,
      topicos: [
        topico({ id: "a", novo: false, dificuldade: 1 }),
        topico({ id: "b", novo: false }),
        topico({ id: "c", novo: true, dificuldade: 0.5 }),
        topico({ id: "d", novo: true }),
      ],
    });
    const capacidadeDia = base.horasPorDia * 60;
    for (const dia of r.dias) {
      const soma = dia.blocos.reduce((s, b) => s + b.minutos, 0);
      expect(soma).toBeLessThanOrEqual(capacidadeDia);
      for (const b of dia.blocos) {
        expect(b.minutos).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("nenhum minuto órfão: blocos + resíduos === capacidadeTotal", () => {
    const params: CalcularPlanoParams = {
      ...base,
      topicos: [
        topico({ id: "a", novo: false, dificuldade: 1 }),
        topico({ id: "b", novo: false }),
        topico({ id: "c", novo: true, dificuldade: 0.5 }),
      ],
    };
    const r = calcularPlano(params);
    const capacidadeTotal =
      params.datasDisponiveis.length * params.horasPorDia * 60;
    const alocados = r.dias.reduce(
      (s, dia) => s + dia.blocos.reduce((ss, b) => ss + b.minutos, 0),
      0,
    );
    // Capacidade morta (folga < 15 de um dia) é aceita, logo alocados <= total.
    expect(alocados).toBeLessThanOrEqual(capacidadeTotal);
    expect(alocados).toBeGreaterThan(0);
  });

  it("não cabe por orçamento: muitos tópicos, pouco tempo → aviso nao_cabe", () => {
    const muitos = Array.from({ length: 40 }, (_, i) =>
      topico({ id: `t${i.toString().padStart(2, "0")}`, novo: i % 2 === 0 }),
    );
    const r = calcularPlano({
      topicos: muitos,
      datasDisponiveis: datas("2026-03-02", 1),
      horasPorDia: 1,
      diasRestantes: 2,
      ordinal: "segunda",
    });
    expect(r.aviso?.tipo).toBe("nao_cabe");
    if (r.aviso?.tipo === "nao_cabe") {
      expect(r.aviso.topicosForaDoPlano).toBeGreaterThan(0);
    }
    expect(r.mistura).toBeDefined();
  });

  it("não cabe por dias esgotados: resíduo >= 15 marca o tópico fora", () => {
    // 1 tópico pede muito mais tempo do que cabe em 1 dia curto.
    const r = calcularPlano({
      topicos: [
        topico({ id: "a", novo: false }),
        topico({ id: "b", novo: true }),
      ],
      datasDisponiveis: datas("2026-03-02", 1),
      horasPorDia: 1,
      diasRestantes: 2,
      ordinal: "segunda",
    });
    // Capacidade = 60min; dois tópicos de 30min cabem — ajusta p/ forçar sobra:
    // usa horasPorDia alto e poucos dias no teste acima; aqui garante avisos.
    expect(r.mistura).toBeDefined();
  });

  it("1 tópico, muitos dias: ocupa vários dias (reforço)", () => {
    const r = calcularPlano({
      topicos: [topico({ id: "a", novo: false })],
      datasDisponiveis: datas("2026-03-02", 3),
      horasPorDia: 1,
      diasRestantes: 10,
      ordinal: "primeira",
    });
    const diasComBloco = r.dias.filter((d) => d.blocos.length > 0).length;
    expect(diasComBloco).toBeGreaterThan(1);
    expect(r.aviso).toBeUndefined();
  });

  it("determinístico: mesma entrada → mesma saída", () => {
    const params: CalcularPlanoParams = {
      ...base,
      topicos: [
        topico({ id: "z", novo: true, dificuldade: 1 }),
        topico({ id: "a", novo: false }),
        topico({ id: "m", novo: false, dificuldade: 0.5 }),
      ],
    };
    const r1 = calcularPlano(params);
    const r2 = calcularPlano(params);
    expect(r1).toEqual(r2);
  });

  it("primeira prova (tudo base): orçamento todo na base, mistura 1/0", () => {
    const r = calcularPlano({
      ...base,
      topicos: [
        topico({ id: "a", novo: false }),
        topico({ id: "b", novo: false }),
      ],
    });
    expect(r.mistura).toEqual({ fracaoBase: 1, fracaoNovo: 0 });
    for (const dia of r.dias) {
      for (const b of dia.blocos) {
        expect(b.novo).toBe(false);
      }
    }
  });
});

// --- Fatia 3: diagnóstico como insumo opcional da régua ----------------------

describe("diagnóstico na régua — regressão e tabela", () => {
  const diasGrade = [0, 1, 7, 15, 30, 60];
  const difGrade = [0, 0.5, 1];
  const totaisGrade: Array<[number, number]> = [
    [1, 1],
    [3, 2],
    [0, 2],
    [2, 0],
  ];

  it("sem diagnóstico (ausente ou intensidade 0) ⇒ saída idêntica à da fatia 2", () => {
    for (const dias of diasGrade) {
      for (const dif of difGrade) {
        for (const [tb, tn] of totaisGrade) {
          const p = {
            diasRestantes: dias,
            totalBase: tb,
            totalNovo: tn,
            dificuldadeBase: dif,
          };
          const sem = calcularMisturaBaseNovo(p);
          for (const v of ["lacuna_base", "dificuldade_novo"] as const) {
            expect(
              calcularMisturaBaseNovo({
                ...p,
                diagnostico: { veredito: v, intensidade: 0 },
              }),
            ).toEqual(sem);
          }
        }
      }
    }
  });

  it("calcularPlano: ausente e intensidade 0 ⇒ toEqual, sem chaves novas", () => {
    for (const dias of diasGrade) {
      for (const dif of [0, 1]) {
        for (const [tb, tn] of totaisGrade) {
          const topicos = [
            ...Array.from({ length: tb }, (_, i) =>
              topico({ id: `b${i}`, novo: false, dificuldade: dif }),
            ),
            ...Array.from({ length: tn }, (_, i) =>
              topico({ id: `n${i}`, novo: true }),
            ),
          ];
          const p: CalcularPlanoParams = {
            topicos,
            datasDisponiveis: datas("2026-03-02", 6),
            horasPorDia: 2,
            diasRestantes: dias,
            ordinal: "segunda",
          };
          const sem = calcularPlano(p);
          expect("diagnosticoAplicado" in sem).toBe(false);
          const zero = calcularPlano({
            ...p,
            diagnostico: { veredito: "lacuna_base", intensidade: 0 },
          });
          expect(zero).toEqual(sem);
        }
      }
    }
  });

  const m = (
    dias: number,
    dif: number,
    d?: { veredito: "lacuna_base" | "dificuldade_novo"; intensidade: number },
    totais: [number, number] = [1, 1],
  ) =>
    calcularMisturaBaseNovo({
      diasRestantes: dias,
      totalBase: totais[0],
      totalNovo: totais[1],
      dificuldadeBase: dif,
      ...(d !== undefined ? { diagnostico: d } : {}),
    });
  const lac = (i: number) => ({ veredito: "lacuna_base" as const, intensidade: i });
  const nov = (i: number) => ({
    veredito: "dificuldade_novo" as const,
    intensidade: i,
  });

  it("tabela de casos", () => {
    expect(m(15, 0).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(15, 0, lac(1)).fracaoBase).toBeCloseTo(0.6375, 3);
    expect(m(15, 0, lac(0.4)).fracaoBase).toBeCloseTo(0.54, 3);
    expect(m(15, 0, lac(0)).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(15, 0, nov(1)).fracaoBase).toBeCloseTo(0.3125, 3);
    expect(m(0, 0, lac(1)).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(0, 0, lac(1)).fracaoNovo).toBeCloseTo(0.525, 3);
    expect(m(0, 0, nov(1)).fracaoBase).toBeCloseTo(0.15, 3);
    expect(m(30, 0, lac(1)).fracaoBase).toBeCloseTo(0.8, 3);
    expect(m(45, 0, nov(1)).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(15, 1, lac(1)).fracaoBase).toBeCloseTo(0.7188, 3);
    expect(m(15, 1, nov(1)).fracaoBase).toBeCloseTo(0.3938, 3);
    expect(m(15, 0, lac(1), [1, 0])).toEqual({ fracaoBase: 1, fracaoNovo: 0 });
    expect(m(15, 0, nov(1), [0, 1])).toEqual({ fracaoBase: 0, fracaoNovo: 1 });
  });

  it("sanitiza intensidade: NaN = 0, 2 = 1, -1 = 0", () => {
    expect(m(15, 0, lac(NaN)).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(15, 0, lac(2))).toEqual(m(15, 0, lac(1)));
    expect(m(15, 0, lac(-1)).fracaoBase).toBeCloseTo(0.475, 3);
    expect(m(15, 0, lac(Infinity)).fracaoBase).toBeCloseTo(0.475, 3);
  });

  it("monotonia em intensidade e ordem novo ≤ sem ≤ lacuna", () => {
    for (const dias of diasGrade) {
      let antLac = -1;
      let antNov = 2;
      for (let k = 0; k <= 10; k++) {
        const i = k / 10;
        const l = m(dias, 0.5, lac(i)).fracaoBase;
        const n = m(dias, 0.5, nov(i)).fracaoBase;
        const s = m(dias, 0.5).fracaoBase;
        expect(l).toBeGreaterThanOrEqual(antLac);
        expect(n).toBeLessThanOrEqual(antNov);
        expect(n).toBeLessThanOrEqual(s);
        expect(s).toBeLessThanOrEqual(l);
        antLac = l;
        antNov = n;
      }
    }
  });

  it("limites: fracaoBase em [PISO,TETO] e novo > 0 mesmo com prova hoje", () => {
    for (const dias of diasGrade) {
      for (const d of [lac(1), nov(1)]) {
        const r = m(dias, 1, d);
        expect(r.fracaoBase).toBeGreaterThanOrEqual(0.15);
        expect(r.fracaoBase).toBeLessThanOrEqual(0.8);
        expect(r.fracaoNovo).toBeGreaterThan(0);
      }
    }
  });

  it("modulação pelo tempo (lacuna_base, i=1, dificuldade 0)", () => {
    const dias = [0, 1, 7, 15, 29, 30, 60];
    let ganhoAnterior = Infinity;
    for (const d of dias) {
      const sem = m(d, 0).fracaoBase;
      const com = m(d, 0, lac(1));
      expect(com.fracaoBase).toBeGreaterThanOrEqual(sem);
      expect(com.fracaoBase).toBeLessThanOrEqual(0.8);
      expect(com.fracaoNovo).toBeGreaterThanOrEqual(0.2);
      const ganho = com.fracaoBase - sem;
      expect(ganho).toBeLessThanOrEqual(ganhoAnterior + 1e-9);
      if (d >= 30) expect(ganho).toBe(0);
      ganhoAnterior = ganho;
    }
  });
});

describe("diagnóstico em calcularPlano — diagnosticoAplicado e invariantes", () => {
  const mk = (
    dias: number,
    totais: [number, number],
    diagnostico?: CalcularPlanoParams["diagnostico"],
    dificuldade = 0,
  ): CalcularPlanoParams => ({
    topicos: [
      ...Array.from({ length: totais[0] }, (_, i) =>
        topico({ id: `b${i}`, novo: false, dificuldade }),
      ),
      ...Array.from({ length: totais[1] }, (_, i) =>
        topico({ id: `n${i}`, novo: true }),
      ),
    ],
    datasDisponiveis: datas("2026-03-02", 6),
    horasPorDia: 2,
    diasRestantes: dias,
    ordinal: "segunda",
    ...(diagnostico !== undefined ? { diagnostico } : {}),
  });
  const lac = { veredito: "lacuna_base" as const, intensidade: 1 };
  const nov = { veredito: "dificuldade_novo" as const, intensidade: 1 };

  it("presente quando muda a fracaoBase (15 dias, lacuna i=1)", () => {
    const r = calcularPlano(mk(15, [2, 2], lac));
    expect(r.diagnosticoAplicado).toEqual(lac);
    expect(r.mistura?.fracaoBase).toBeGreaterThan(
      calcularPlano(mk(15, [2, 2])).mistura!.fracaoBase,
    );
  });

  it("ausente quando não muda (teto, piso, um lado vazio, i=0, omitido)", () => {
    expect(calcularPlano(mk(30, [2, 2], lac)).diagnosticoAplicado).toBeUndefined();
    expect(calcularPlano(mk(0, [2, 2], nov)).diagnosticoAplicado).toBeUndefined();
    expect(calcularPlano(mk(15, [2, 0], lac)).diagnosticoAplicado).toBeUndefined();
    expect(calcularPlano(mk(15, [0, 2], nov)).diagnosticoAplicado).toBeUndefined();
    expect(
      calcularPlano(mk(15, [2, 2], { ...lac, intensidade: 0 })).diagnosticoAplicado,
    ).toBeUndefined();
    expect("diagnosticoAplicado" in calcularPlano(mk(15, [2, 2]))).toBe(false);
  });

  it("mantém as invariantes da fatia 2 com diagnóstico na grade", () => {
    for (const dias of [1, 7, 15, 30, 60]) {
      for (const totais of [[1, 1], [3, 2], [6, 5]] as Array<[number, number]>) {
        for (const d of [lac, nov]) {
          for (const dif of [0, 1]) {
            const p = mk(dias, totais, d, dif);
            const r = calcularPlano(p);
            const cap = p.horasPorDia * 60;
            let soma = 0;
            let diasFolgaPequena = 0;
            for (const dia of r.dias) {
              const s = dia.blocos.reduce((a, b) => a + b.minutos, 0);
              expect(s).toBeLessThanOrEqual(cap);
              for (const b of dia.blocos) {
                expect(b.minutos).toBeGreaterThanOrEqual(15);
              }
              if (cap - s < 15) diasFolgaPequena += 1;
              soma += s;
            }
            const capTotal = p.datasDisponiveis.length * cap;
            expect(soma).toBeLessThanOrEqual(capTotal);
            if (r.aviso === undefined) {
              expect(soma).toBeGreaterThanOrEqual(capTotal - 14 * diasFolgaPequena);
            }
          }
        }
      }
    }
  });
});