import { describe, expect, it } from "vitest";
import type { CheckpointVisao } from "@shared/checkpoints";
import { montarLinhaDoTempo } from "@shared/linhaDoTempo";
import type { PlanoCalculado } from "@shared/plano";
import type { SessaoRevisao } from "@shared/types";

const HOJE = "2026-11-02";

function sessao(
  id: string,
  data: string,
  extra: Partial<SessaoRevisao> = {},
): SessaoRevisao {
  return { id, data, diasAntes: 0, manual: false, ...extra };
}

function cp(
  id: string,
  data: string,
  estado: CheckpointVisao["estado"] = "futuro",
): CheckpointVisao {
  return { id, diasAntes: 0, data, topicos: [], estado };
}

function planoDe(datas: string[], blocos = true): PlanoCalculado {
  return {
    dias: datas.map((data) => ({
      data,
      blocos: blocos
        ? [
            { topicoId: "a", titulo: "Limites", novo: false, minutos: 40 },
            { topicoId: "b", titulo: "Derivadas", novo: true, minutos: 50 },
          ]
        : [],
    })),
  };
}

const PADRAO = [
  sessao("s0", "2026-11-13", { diasAntes: 7 }),
  sessao("s1", "2026-11-17", { diasAntes: 3 }),
  sessao("s2", "2026-11-19", { diasAntes: 1 }),
];
const CPS = [
  cp("d14", "2026-11-06"),
  cp("d7", "2026-11-13"),
  cp("d3", "2026-11-17"),
];

/** Resumo legível: "C:data", "C:data+[ids]", "R:data", "E:data". */
function resumo(itens: ReturnType<typeof montarLinhaDoTempo>): string[] {
  return itens.map((i) => {
    if (i.tipo === "estudo") return `E:${i.data}`;
    if (i.tipo === "revisao") return `R:${i.data}`;
    return i.revisoes.length > 0
      ? `C:${i.data}+[${i.revisoes.map((r) => r.id).join(",")}]`
      : `C:${i.data}`;
  });
}

describe("montarLinhaDoTempo: tabela do design", () => {
  it("T1: sem plano nem checkpoints, só revisões", () => {
    const r = montarLinhaDoTempo({
      sessoes: PADRAO,
      plano: undefined,
      checkpoints: [],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["R:2026-11-13", "R:2026-11-17", "R:2026-11-19"]);
  });

  it("T2: fusão revisão×checkpoint na mesma data (d7 e d3)", () => {
    const r = montarLinhaDoTempo({
      sessoes: PADRAO,
      plano: undefined,
      checkpoints: CPS,
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual([
      "C:2026-11-06",
      "C:2026-11-13+[s0]",
      "C:2026-11-17+[s1]",
      "R:2026-11-19",
    ]);
  });

  it("T3: intervalos 10/5/2 não coincidem, sem fusão", () => {
    const r = montarLinhaDoTempo({
      sessoes: [
        sessao("s0", "2026-11-10"),
        sessao("s1", "2026-11-15"),
        sessao("s2", "2026-11-18"),
      ],
      plano: undefined,
      checkpoints: CPS,
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual([
      "C:2026-11-06",
      "R:2026-11-10",
      "C:2026-11-13",
      "R:2026-11-15",
      "C:2026-11-17",
      "R:2026-11-18",
    ]);
  });

  it("T4: sessão manual na data do checkpoint é preservada", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("m", "2026-11-13", { manual: true })],
      plano: undefined,
      checkpoints: [CPS[1]],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["C:2026-11-13+[m]"]);
    const item = r[0];
    expect(item.tipo === "checkpoint" && item.revisoes[0].manual).toBe(true);
  });

  it("T5: duas sessões na mesma data, ambas fundidas na ordem de entrada", () => {
    const r = montarLinhaDoTempo({
      sessoes: [
        sessao("a", "2026-11-13"),
        sessao("b", "2026-11-13", { manual: true }),
      ],
      plano: undefined,
      checkpoints: [CPS[1]],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["C:2026-11-13+[a,b]"]);
  });

  it("T6: um dia de diferença não funde", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-12")],
      plano: undefined,
      checkpoints: [CPS[1]],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["R:2026-11-12", "C:2026-11-13"]);
  });

  it("T7: checkpoint+revisão antes do estudo no mesmo dia", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-13")],
      plano: planoDe(["2026-11-13"]),
      checkpoints: [CPS[1]],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["C:2026-11-13+[s]", "E:2026-11-13"]);
  });

  it("T8: revisão antes do estudo no mesmo dia, sem checkpoint", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-13")],
      plano: planoDe(["2026-11-13"]),
      checkpoints: [],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["R:2026-11-13", "E:2026-11-13"]);
  });

  it("T9: revisão concluída fundida mantém concluida", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-13", { concluida: true })],
      plano: undefined,
      checkpoints: [CPS[1]],
      hoje: HOJE,
    });
    const item = r[0];
    expect(item.tipo === "checkpoint" && item.revisoes[0].concluida).toBe(true);
  });

  it("T10: checkpoint indisponível continua existindo, com revisão fundida", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-13")],
      plano: undefined,
      checkpoints: [cp("d7", "2026-11-13", "indisponivel")],
      hoje: HOJE,
    });
    expect(r).toHaveLength(1);
    const item = r[0];
    expect(item.tipo === "checkpoint" && item.checkpoint.estado).toBe("indisponivel");
    expect(item.tipo === "checkpoint" && item.revisoes).toHaveLength(1);
  });

  it("T11: só dias de estudo, em ordem, com minutosTotal", () => {
    const r = montarLinhaDoTempo({
      sessoes: [],
      plano: planoDe(["2026-11-03", "2026-11-04"]),
      checkpoints: undefined,
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["E:2026-11-03", "E:2026-11-04"]);
    expect(r[0].tipo === "estudo" && r[0].minutosTotal).toBe(90);
  });

  it("T12: sessão na data da prova é o último item e não há estudo nela", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-11-20")],
      plano: planoDe(["2026-11-19"]),
      checkpoints: [],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["E:2026-11-19", "R:2026-11-20"]);
  });

  it("T13: sessões desordenadas saem ordenadas por data", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("b", "2026-11-17"), sessao("a", "2026-11-13")],
      plano: undefined,
      checkpoints: [],
      hoje: HOJE,
    });
    expect(r.map((i) => i.data)).toEqual(["2026-11-13", "2026-11-17"]);
  });

  it("T14: situação passado/hoje/futuro", () => {
    const r = montarLinhaDoTempo({
      sessoes: [
        sessao("a", "2026-11-12"),
        sessao("b", "2026-11-13"),
        sessao("c", "2026-11-14"),
      ],
      plano: undefined,
      checkpoints: [],
      hoje: "2026-11-13",
    });
    expect(r.map((i) => i.situacao)).toEqual(["passado", "hoje", "futuro"]);
  });

  it("T15: tudo vazio", () => {
    expect(
      montarLinhaDoTempo({
        sessoes: [],
        plano: undefined,
        checkpoints: undefined,
        hoje: HOJE,
      }),
    ).toEqual([]);
  });

  it("T16: entradas congeladas não lançam e ficam intactas", () => {
    const sessoes = Object.freeze(
      PADRAO.map((s) => Object.freeze({ ...s })),
    ) as readonly SessaoRevisao[];
    const cps = Object.freeze(
      CPS.map((c) => Object.freeze({ ...c, topicos: Object.freeze([]) })),
    ) as unknown as readonly CheckpointVisao[];
    const plano = planoDe(["2026-11-03"]);
    const copia = JSON.stringify({ sessoes, cps, plano });
    expect(() =>
      montarLinhaDoTempo({ sessoes, plano, checkpoints: cps, hoje: HOJE }),
    ).not.toThrow();
    expect(JSON.stringify({ sessoes, cps, plano })).toBe(copia);
  });

  it("T17: dia do plano sem blocos não gera item", () => {
    const r = montarLinhaDoTempo({
      sessoes: [],
      plano: planoDe(["2026-11-03"], false),
      checkpoints: [],
      hoje: HOJE,
    });
    expect(r).toEqual([]);
  });

  it("T18: prova passada, só revisões com situação passado", () => {
    const r = montarLinhaDoTempo({
      sessoes: [sessao("s", "2026-10-01")],
      plano: { dias: [], aviso: { tipo: "prova_passou" } },
      checkpoints: [],
      hoje: HOJE,
    });
    expect(resumo(r)).toEqual(["R:2026-10-01"]);
    expect(r[0].situacao).toBe("passado");
  });

  it("T19: propriedade com semente fixa (L1, L2, L3, L5)", () => {
    let semente = 12345;
    const rand = (n: number): number => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente % n;
    };
    const data = (): string => `2026-11-${String(3 + rand(18)).padStart(2, "0")}`;
    for (let k = 0; k < 100; k++) {
      const sessoes = Array.from({ length: rand(6) }, (_, i) =>
        sessao(`s${i}`, data(), { manual: rand(2) === 0 }),
      );
      const checkpoints = Array.from({ length: rand(5) }, (_, i) =>
        cp(`d${i + 1}`, data()),
      );
      const dias = Array.from(new Set(Array.from({ length: rand(8) }, data))).sort();
      const plano = planoDe(dias);
      const r = montarLinhaDoTempo({ sessoes, plano, checkpoints, hoje: HOJE });

      const revisoes = r.reduce(
        (soma, i) =>
          soma +
          (i.tipo === "revisao" ? 1 : i.tipo === "checkpoint" ? i.revisoes.length : 0),
        0,
      );
      expect(revisoes).toBe(sessoes.length); // L1
      expect(r.filter((i) => i.tipo === "checkpoint")).toHaveLength(checkpoints.length); // L2
      expect(r.filter((i) => i.tipo === "estudo")).toHaveLength(dias.length); // L3
      for (let i = 1; i < r.length; i++) {
        expect(r[i - 1].data <= r[i].data).toBe(true); // L5
      }
    }
  });
});
