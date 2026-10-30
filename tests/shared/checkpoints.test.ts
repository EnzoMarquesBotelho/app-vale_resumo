import { describe, expect, it } from "vitest";
import {
  escolherCheckpointAutomatico,
  estadoBlocoCheckpoints,
  fraseCheckpointIgnorados,
  fraseCheckpointParcial,
  fraseLembreteCheckpoint,
  fraseSemCheckpoints,
  montarTextoBaseCheckpoint,
  planejarCheckpoints,
  planejarTextoCheckpoint,
  preferenciaEfetiva,
  resolverEstadosCheckpoints,
  rotuloEstadoCheckpoint,
  rotuloPreparandoCheckpoint,
  tentadosDaProva,
} from "@shared/checkpoints";
import type {
  CheckpointPlanejado,
  CheckpointVisao,
  EstadoCheckpoint,
  TopicoJanela,
} from "@shared/checkpoints";
import { assinaturaPlano } from "@shared/diagnostico";
import type { AvisoPlano, PlanoCalculado } from "@shared/plano";
import type {
  CheckpointGerado,
  CheckpointsPlano,
  Exercicio,
  TopicoPlano,
} from "@shared/types";
import { numeroParaDia, diaParaNumero } from "@shared/agenda";

const PROVA = "2026-06-20";
const BASE = "2026-06-01";

/** Monta um plano de referência: `blocos` = [data, topicoId] na ordem dada. */
function refDe(
  blocos: Array<[string, string]>,
  aviso?: AvisoPlano,
  inicio = BASE,
  fim = PROVA,
): PlanoCalculado {
  const dias = [];
  for (let n = diaParaNumero(inicio) + 1; n < diaParaNumero(fim); n++) {
    const data = numeroParaDia(n);
    dias.push({
      data,
      blocos: blocos
        .filter(([d]) => d === data)
        .map(([, id]) => ({
          topicoId: id,
          titulo: `T-${id}`,
          novo: false,
          minutos: 30,
        })),
    });
  }
  return { dias, ...(aviso !== undefined ? { aviso } : {}) };
}

const P: Array<[string, string]> = [
  ["2026-06-04", "A"],
  ["2026-06-07", "B"],
  ["2026-06-10", "C"],
  ["2026-06-13", "D"],
  ["2026-06-15", "E"],
  ["2026-06-18", "F"],
];

function plan(
  ref: PlanoCalculado,
  extra: Partial<{ dataProva: string; dataBase: string; hoje: string }> = {},
) {
  return planejarCheckpoints({
    planoReferencia: ref,
    dataProva: PROVA,
    dataBase: BASE,
    hoje: BASE,
    ...extra,
  });
}

const ids = (c: CheckpointPlanejado) => c.topicos.map((t) => t.id);

describe("planejarCheckpoints (tabela do design)", () => {
  it("1: fixture P ⇒ d14:[A], d7:[B,C,D], d3:[E]; F fora; d28 descartado", () => {
    const r = plan(refDe(P));
    expect(r.motivoVazio).toBeUndefined();
    expect(r.checkpoints.map((c) => [c.id, c.data, ids(c)])).toEqual([
      ["d14", "2026-06-06", ["A"]],
      ["d7", "2026-06-13", ["B", "C", "D"]],
      ["d3", "2026-06-17", ["E"]],
    ]);
    expect(r.checkpoints.map((c) => c.diasAntes)).toEqual([14, 7, 3]);
  });

  it("2: prova hoje ⇒ vazio prova_encerrada", () => {
    expect(plan(refDe(P), { hoje: PROVA })).toEqual({
      checkpoints: [],
      motivoVazio: "prova_encerrada",
    });
  });

  it("3: prova passada ⇒ vazio prova_encerrada", () => {
    expect(plan(refDe(P), { hoje: "2026-06-25" }).motivoVazio).toBe(
      "prova_encerrada",
    );
  });

  it("4: sem_topicos", () => {
    expect(
      plan({ dias: [], aviso: { tipo: "sem_topicos" } }).motivoVazio,
    ).toBe("sem_topicos");
  });

  it("5: sem_dias", () => {
    expect(plan(refDe(P, { tipo: "sem_dias" })).motivoVazio).toBe("sem_dias");
  });

  it("6: prova_passou no plano de referência ⇒ sem_dias", () => {
    expect(plan({ dias: [], aviso: { tipo: "prova_passou" } }).motivoVazio).toBe(
      "sem_dias",
    );
  });

  it("7: prova longe ⇒ 4 pontos com janelas contíguas", () => {
    const ref = refDe(
      [
        ["2026-05-20", "A"],
        ["2026-06-01", "B"],
        ["2026-06-10", "C"],
        ["2026-06-15", "D"],
      ],
      undefined,
      "2026-03-01",
    );
    const r = plan(ref, { dataBase: "2026-03-01", hoje: "2026-03-01" });
    expect(r.checkpoints.map((c) => [c.id, ids(c)])).toEqual([
      ["d28", ["A"]],
      ["d14", ["B"]],
      ["d7", ["C"]],
      ["d3", ["D"]],
    ]);
    expect(r.checkpoints.map((c) => c.data)).toEqual([
      "2026-05-23",
      "2026-06-06",
      "2026-06-13",
      "2026-06-17",
    ]);
  });

  it("8: dataBase 06-10 ⇒ d14 descartado; d7 cobre (−∞, 06-13]", () => {
    const r = plan(refDe(P, undefined, "2026-06-10"), {
      dataBase: "2026-06-10",
      hoje: "2026-06-10",
    });
    expect(r.checkpoints.map((c) => c.id)).toEqual(["d7", "d3"]);
  });

  it("9: dataBase == data do d14 ⇒ d14 descartado (estritamente depois)", () => {
    const r = plan(refDe(P, undefined, "2026-06-06"), {
      dataBase: "2026-06-06",
      hoje: "2026-06-06",
    });
    expect(r.checkpoints.map((c) => c.id)).not.toContain("d14");
  });

  it("10: janelas vazias são omitidas (só d3)", () => {
    const r = plan(
      refDe([
        ["2026-06-14", "X"],
        ["2026-06-16", "Y"],
      ]),
    );
    expect(r.checkpoints.map((c) => [c.id, ids(c)])).toEqual([
      ["d3", ["X", "Y"]],
    ]);
  });

  it("11: tudo até 06-06 ⇒ só d14 com todos", () => {
    const r = plan(
      refDe([
        ["2026-06-03", "A"],
        ["2026-06-05", "B"],
      ]),
    );
    expect(r.checkpoints.map((c) => [c.id, ids(c)])).toEqual([
      ["d14", ["A", "B"]],
    ]);
  });

  it("12: tudo depois de 06-17 ⇒ curto_demais", () => {
    const r = plan(refDe([["2026-06-18", "A"]]));
    expect(r).toEqual({ checkpoints: [], motivoVazio: "curto_demais" });
  });

  it("13: tópico com blocos em 06-03, 06-05 e 06-12 entra só em d7", () => {
    const r = plan(
      refDe([
        ["2026-06-03", "X"],
        ["2026-06-05", "X"],
        ["2026-06-12", "X"],
      ]),
    );
    expect(r.checkpoints.map((c) => [c.id, ids(c)])).toEqual([["d7", ["X"]]]);
  });

  it("14: mesmo dia ⇒ desempate pela ordem de aparição", () => {
    const r = plan(
      refDe([
        ["2026-06-04", "A"],
        ["2026-06-04", "B"],
      ]),
    );
    expect(ids(r.checkpoints[0])).toEqual(["A", "B"]);
    const inv = plan(
      refDe([
        ["2026-06-04", "B"],
        ["2026-06-04", "A"],
      ]),
    );
    expect(ids(inv.checkpoints[0])).toEqual(["B", "A"]);
  });

  it("15: tópico manual entra com manual:true", () => {
    const r = plan(refDe([["2026-06-04", "manual:x-0"]]));
    expect(r.checkpoints[0].topicos).toEqual([
      { id: "manual:x-0", titulo: "T-manual:x-0", manual: true },
    ]);
  });

  it("16: nao_cabe ⇒ tópico sem bloco nunca aparece", () => {
    const r = plan(
      refDe([["2026-06-04", "A"]], { tipo: "nao_cabe", topicosForaDoPlano: 1 }),
    );
    const todos = r.checkpoints.flatMap(ids);
    expect(todos).toEqual(["A"]);
    expect(todos).not.toContain("G");
  });

  it("17: prova no dia seguinte à base ⇒ sem_dias", () => {
    const r = planejarCheckpoints({
      planoReferencia: { dias: [], aviso: { tipo: "sem_dias" } },
      dataProva: "2026-06-02",
      dataBase: "2026-06-01",
      hoje: "2026-06-01",
    });
    expect(r.motivoVazio).toBe("sem_dias");
  });

  it("18: determinística e sem mutar a entrada", () => {
    const ref = refDe(P);
    const copia = JSON.parse(JSON.stringify(ref)) as PlanoCalculado;
    const a = plan(ref);
    const b = plan(ref);
    expect(a).toEqual(b);
    expect(ref).toEqual(copia);
  });

  it("19: dataBase inválida lança", () => {
    expect(() => plan(refDe(P), { dataBase: "01/06/2026" })).toThrow();
  });

  it("invariantes: cada tópico em no máximo um ponto; data entre base e prova", () => {
    const r = plan(refDe(P));
    const todos = r.checkpoints.flatMap(ids);
    expect(new Set(todos).size).toBe(todos.length);
    for (const c of r.checkpoints) {
      expect(c.data > BASE && c.data < PROVA).toBe(true);
      expect(c.topicos.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("dias vazios sem aviso ⇒ sem_dias", () => {
    expect(plan({ dias: [] }).motivoVazio).toBe("sem_dias");
  });
});

// --- Estados ----------------------------------------------------------------

const planoBase = {
  ordinal: "segunda" as const,
  topicos: [
    { id: "a", titulo: "A", novo: false },
    { id: "b", titulo: "B", novo: true },
  ] as TopicoPlano[],
};

const exs: Exercicio[] = Array.from({ length: 3 }, (_, i) => ({
  enunciado: `e${i}`,
  resposta: `r${i}`,
  modo: "mista" as const,
}));

function gerado(id: string, extra: Partial<CheckpointGerado> = {}): CheckpointGerado {
  return {
    id,
    geradoEm: "2026-06-06T12:00:00.000Z",
    topicos: [{ id: "a", titulo: "A" }],
    ignorados: [],
    pedido: 8,
    exercicios: exs,
    ...extra,
  };
}

function blocoDe(
  itens: CheckpointGerado[],
  assinatura = assinaturaPlano(planoBase),
): CheckpointsPlano {
  return { assinatura, itens };
}

const topA: TopicoJanela = { id: "a", titulo: "A", manual: false };
const topM: TopicoJanela = { id: "manual:m-0", titulo: "M", manual: true };

function ponto(id: string, data: string, topicos = [topA]): CheckpointPlanejado {
  return { id, diasAntes: Number(id.slice(1)), data, topicos };
}

function estados(
  planejados: CheckpointPlanejado[],
  hoje: string,
  bloco?: CheckpointsPlano,
  plano: typeof planoBase | null = planoBase,
) {
  return resolverEstadosCheckpoints({
    planejados,
    bloco,
    plano: plano ?? undefined,
    hoje,
  });
}

describe("resolverEstadosCheckpoints", () => {
  const d14 = ponto("d14", "2026-06-06");

  it("1-3: futuro → devido → atrasado só por avanço de hoje", () => {
    expect(estados([d14], "2026-06-05").itens[0].estado).toBe("futuro");
    expect(estados([d14], "2026-06-06").itens[0].estado).toBe("devido");
    expect(estados([d14], "2026-06-09").itens[0].estado).toBe("atrasado");
  });

  it("4: bloco atual com item ⇒ pronto", () => {
    const r = estados([d14], "2026-06-09", blocoDe([gerado("d14")]));
    expect(r.bloco).toBe("atual");
    expect(r.itens[0].estado).toBe("pronto");
  });

  it("5: com concluidoEm ⇒ feito", () => {
    const r = estados(
      [d14],
      "2026-06-09",
      blocoDe([gerado("d14", { concluidoEm: "2026-06-09T10:00:00.000Z" })]),
    );
    expect(r.itens[0].estado).toBe("feito");
  });

  it("6: só manuais ⇒ indisponivel em qualquer data", () => {
    const m = ponto("d14", "2026-06-06", [topM]);
    for (const hoje of ["2026-06-01", "2026-06-06", "2026-06-09"]) {
      expect(estados([m], hoje).itens[0].estado).toBe("indisponivel");
    }
  });

  it("7: assinatura diferente ⇒ desatualizado e a lista é ignorada", () => {
    const r = estados([d14], "2026-06-09", blocoDe([gerado("d14")], "outra"));
    expect(r.bloco).toBe("desatualizado");
    expect(r.itens[0].estado).toBe("atrasado");
    expect(estados([d14], "2026-06-06", blocoDe([gerado("d14")], "x")).itens[0].estado).toBe(
      "devido",
    );
  });

  it("8: plano indefinido ⇒ bloco nenhum, estados só por data", () => {
    const r = estados([d14], "2026-06-09", blocoDe([gerado("d14")]), null);
    expect(r.bloco).toBe("nenhum");
    expect(r.itens[0].estado).toBe("atrasado");
  });

  it("9: item de id que não está nos planejados é ignorado (órfão)", () => {
    const r = estados([d14], "2026-06-09", blocoDe([gerado("d7")]));
    expect(r.itens.map((i) => i.id)).toEqual(["d14"]);
    expect(r.itens[0].estado).toBe("atrasado");
  });

  it("10: ponto misto não é indisponivel", () => {
    const mx = ponto("d14", "2026-06-06", [topM, topA]);
    expect(estados([mx], "2026-06-06").itens[0].estado).toBe("devido");
  });

  it("11: relógio recuado ⇒ futuro", () => {
    expect(estados([d14], "2026-05-01").itens[0].estado).toBe("futuro");
  });

  it("manter ordem/ids dos planejados e não mutar", () => {
    const lista = [ponto("d14", "2026-06-06"), ponto("d7", "2026-06-13")];
    const r = estados(lista, "2026-06-10");
    expect(r.itens.map((i) => [i.id, i.estado])).toEqual([
      ["d14", "atrasado"],
      ["d7", "futuro"],
    ]);
    expect("estado" in lista[0]).toBe(false);
  });

  it("transições: pronto/feito vencem a data (item de data futura)", () => {
    const fut = ponto("d3", "2026-06-17");
    expect(estados([fut], "2026-06-01", blocoDe([gerado("d3")])).itens[0].estado).toBe(
      "pronto",
    );
  });
});

describe("estadoBlocoCheckpoints / preferenciaEfetiva", () => {
  it("nenhum / atual / desatualizado", () => {
    expect(estadoBlocoCheckpoints(planoBase, undefined)).toBe("nenhum");
    expect(estadoBlocoCheckpoints(undefined, blocoDe([]))).toBe("nenhum");
    expect(estadoBlocoCheckpoints(planoBase, blocoDe([]))).toBe("atual");
    expect(estadoBlocoCheckpoints(planoBase, blocoDe([], "x"))).toBe(
      "desatualizado",
    );
  });

  it("ausente ou inválida ⇒ lembrete", () => {
    expect(preferenciaEfetiva(undefined)).toBe("lembrete");
    expect(preferenciaEfetiva({})).toBe("lembrete");
    expect(preferenciaEfetiva({ checkpoint: "xyz" })).toBe("lembrete");
    expect(preferenciaEfetiva({ checkpoint: "lembrete" })).toBe("lembrete");
    expect(preferenciaEfetiva({ checkpoint: "automatico" })).toBe("automatico");
  });
});

// --- Modo automático -----------------------------------------------------------

const HOJE = "2026-06-20";

function v(id: string, data: string, estado: EstadoCheckpoint): CheckpointVisao {
  return { ...ponto(id, data), estado };
}

function auto(
  itens: CheckpointVisao[],
  extra: Partial<Parameters<typeof escolherCheckpointAutomatico>[0]> = {},
) {
  return escolherCheckpointAutomatico({
    itens,
    hoje: HOJE,
    preferencia: "automatico",
    bloco: "atual",
    emGeracao: undefined,
    tentados: new Set(),
    ...extra,
  });
}

describe("escolherCheckpointAutomatico", () => {
  it("1: d14 devido ⇒ d14", () => {
    expect(auto([v("d14", HOJE, "devido")])).toBe("d14");
  });

  it("2: d14 e d7 atrasados ⇒ o mais recente (d7)", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d7", "2026-06-13", "atrasado")]),
    ).toBe("d7");
  });

  it("3: d14 atrasado + d7 devido ⇒ d7", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d7", HOJE, "devido")]),
    ).toBe("d7");
  });

  it("4: d7 já tentado (falhou) ⇒ não cai para o d14", () => {
    expect(
      auto(
        [v("d14", "2026-06-06", "atrasado"), v("d7", "2026-06-13", "atrasado")],
        { tentados: new Set(["d7"]) },
      ),
    ).toBeUndefined();
  });

  it("5: lembrete ⇒ nada", () => {
    expect(auto([v("d14", HOJE, "devido")], { preferencia: "lembrete" })).toBeUndefined();
  });

  it("6: bloco desatualizado ⇒ nada", () => {
    expect(auto([v("d14", HOJE, "devido")], { bloco: "desatualizado" })).toBeUndefined();
  });

  it("7: em geração ⇒ nada", () => {
    expect(auto([v("d14", HOJE, "devido")], { emGeracao: "d14" })).toBeUndefined();
  });

  it("8: só futuro/pronto/feito/indisponivel ⇒ nada", () => {
    expect(
      auto([
        v("d28", "2026-05-23", "feito"),
        v("d14", "2026-06-06", "pronto"),
        v("d7", "2026-06-13", "indisponivel"),
        v("d3", "2026-06-25", "futuro"),
      ]),
    ).toBeUndefined();
  });

  it("9: indisponivel mais recente não bloqueia ⇒ d7", () => {
    expect(
      auto([v("d7", "2026-06-13", "atrasado"), v("d3", "2026-06-17", "indisponivel")]),
    ).toBe("d7");
  });

  it("10: d7 pronto + d14 atrasado ⇒ nada (os antigos só por clique)", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d7", "2026-06-13", "pronto")]),
    ).toBeUndefined();
  });

  it("11: d3 indisponivel, d7 pronto, d14 atrasado ⇒ nada", () => {
    expect(
      auto([
        v("d14", "2026-06-06", "atrasado"),
        v("d7", "2026-06-13", "pronto"),
        v("d3", "2026-06-17", "indisponivel"),
      ]),
    ).toBeUndefined();
  });

  it("12: d7 feito + d14 atrasado ⇒ nada", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d7", "2026-06-13", "feito")]),
    ).toBeUndefined();
  });

  it("13: d3 futuro (data > hoje) não é candidato ⇒ d7", () => {
    expect(
      auto([v("d7", "2026-06-13", "atrasado"), v("d3", "2026-06-25", "futuro")]),
    ).toBe("d7");
  });

  it("14: tentados de outro ponto não conta", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado")], { tentados: new Set(["d7"]) }),
    ).toBe("d14");
  });

  it("15: d14 pronto + d7 devido ⇒ d7", () => {
    expect(
      auto([v("d14", "2026-06-06", "pronto"), v("d7", HOJE, "devido")]),
    ).toBe("d7");
  });

  it("16: todos futuro ⇒ nada", () => {
    expect(auto([v("d14", "2026-06-25", "futuro")])).toBeUndefined();
  });

  it("data FUTURA com pronto/feito não vira candidato; atrasado antigo é gerado", () => {
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d3", "2026-06-25", "pronto")]),
    ).toBe("d14");
    expect(
      auto([v("d14", "2026-06-06", "atrasado"), v("d3", "2026-06-25", "feito")]),
    ).toBe("d14");
  });

  it("idempotente: depois de gerada (pronto) devolve undefined", () => {
    const antes = [v("d7", "2026-06-13", "atrasado")];
    expect(auto(antes)).toBe("d7");
    const depois = [v("d7", "2026-06-13", "pronto")];
    expect(auto(depois)).toBeUndefined();
  });

  it("sem itens ⇒ nada", () => {
    expect(auto([])).toBeUndefined();
  });
});

describe("tentadosDaProva", () => {
  it("filtra só a prova pedida e remove o prefixo", () => {
    const g = new Set(["p1:d14", "p1:d7", "p2:d14", "semprefixo"]);
    expect(tentadosDaProva(g, "p1")).toEqual(new Set(["d14", "d7"]));
    expect(tentadosDaProva(g, "p2")).toEqual(new Set(["d14"]));
  });

  it("prefixo parecido (p1 × p10) não vaza", () => {
    const g = new Set(["p10:d14", "p1:d7"]);
    expect(tentadosDaProva(g, "p1")).toEqual(new Set(["d7"]));
    expect(tentadosDaProva(g, "p10")).toEqual(new Set(["d14"]));
  });

  it("Set vazio ⇒ vazio", () => {
    expect(tentadosDaProva(new Set(), "p1").size).toBe(0);
  });
});

// --- Texto-base ----------------------------------------------------------------

const jan = (n: number): TopicoJanela[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    titulo: `Titulo ${i}`,
    manual: false,
  }));
const todosComTexto = (ts: TopicoJanela[]) => new Set(ts.map((t) => t.id));

describe("planejarTextoCheckpoint", () => {
  it("1: 3 tópicos com doc ⇒ todos selecionados", () => {
    const ts = jan(3);
    const r = planejarTextoCheckpoint(ts, todosComTexto(ts));
    expect(r.selecionados).toEqual(ts);
    expect(r.ignorados).toEqual([]);
    expect(r.indisponivel).toBe(false);
  });

  it("2: manual vai para ignorados", () => {
    const ts = [...jan(2), { id: "manual:x", titulo: "X", manual: true }];
    const r = planejarTextoCheckpoint(ts, todosComTexto(jan(2)));
    expect(r.selecionados).toHaveLength(2);
    expect(r.ignorados).toEqual([{ id: "manual:x", titulo: "X", motivo: "manual" }]);
  });

  it("3: sem texto vai para ignorados", () => {
    const ts = jan(2);
    const r = planejarTextoCheckpoint(ts, new Set(["t1"]));
    expect(r.selecionados.map((t) => t.id)).toEqual(["t1"]);
    expect(r.ignorados).toEqual([{ id: "t0", titulo: "Titulo 0", motivo: "sem_texto" }]);
  });

  it("4: só manuais ou sem texto ⇒ indisponível", () => {
    const m: TopicoJanela[] = [{ id: "manual:x", titulo: "X", manual: true }];
    expect(planejarTextoCheckpoint(m, new Set()).indisponivel).toBe(true);
    const r = planejarTextoCheckpoint(jan(2), new Set());
    expect(r.indisponivel).toBe(true);
    expect(r.selecionados).toEqual([]);
  });

  it("5: 9 elegíveis ⇒ 6 espaçados e 3 fora_da_amostra, ordem original", () => {
    const ts = jan(9);
    const r = planejarTextoCheckpoint(ts, todosComTexto(ts));
    expect(r.selecionados.map((t) => t.id)).toEqual(
      [0, 2, 3, 5, 6, 8].map((i) => `t${i}`),
    );
    expect(r.ignorados.map((t) => [t.id, t.motivo])).toEqual([
      ["t1", "fora_da_amostra"],
      ["t4", "fora_da_amostra"],
      ["t7", "fora_da_amostra"],
    ]);
  });

  it("6: 7 elegíveis + 1 manual ⇒ ignorados na ordem original", () => {
    const ts = jan(7);
    const com = [ts[0], { id: "manual:m", titulo: "M", manual: true }, ...ts.slice(1)];
    const r = planejarTextoCheckpoint(com, todosComTexto(ts));
    expect(r.selecionados).toHaveLength(6);
    const motivos = r.ignorados.map((t) => t.motivo);
    expect(motivos).toContain("manual");
    expect(motivos.filter((m) => m === "fora_da_amostra")).toHaveLength(1);
    // ordem original: o manual (posição 1) vem antes do fora_da_amostra.
    expect(r.ignorados[0].id).toBe("manual:m");
  });
});

describe("montarTextoBaseCheckpoint", () => {
  it("7: duas seções curtas", () => {
    expect(
      montarTextoBaseCheckpoint(
        [
          { titulo: "A", texto: "txtA" },
          { titulo: "B", texto: "txtB" },
        ],
        12000,
      ),
    ).toBe("## A\ntxtA\n\n## B\ntxtB");
  });

  it("8: 6 seções de 50.000 caracteres ⇒ ≤ 12000 e cada seção ≤ 1998", () => {
    const secoes = Array.from({ length: 6 }, (_, i) => ({
      titulo: `S${i}`,
      texto: "x".repeat(50000),
    }));
    const r = montarTextoBaseCheckpoint(secoes, 12000);
    expect(r.length).toBeLessThanOrEqual(12000);
    for (const parte of r.split("\n\n")) {
      expect(parte.length).toBeLessThanOrEqual(1998);
    }
    expect(r.split("\n\n")).toHaveLength(6);
  });

  it("9: seção só de espaços é omitida", () => {
    expect(
      montarTextoBaseCheckpoint(
        [
          { titulo: "A", texto: "   \n " },
          { titulo: "B", texto: "ok" },
        ],
        12000,
      ),
    ).toBe("## B\nok");
  });

  it("10: lista vazia ⇒ vazio", () => {
    expect(montarTextoBaseCheckpoint([], 12000)).toBe("");
  });

  it("11: título enorme e max apertado ⇒ length ≤ max", () => {
    const r = montarTextoBaseCheckpoint(
      [{ titulo: "T".repeat(200), texto: "y".repeat(500) }],
      100,
    );
    expect(r.length).toBeLessThanOrEqual(100);
  });

  it("propriedade: length ≤ max para vários tamanhos", () => {
    for (const n of [1, 2, 3, 6]) {
      for (const max of [0, 1, 10, 50, 500, 12000]) {
        const secoes = Array.from({ length: n }, (_, i) => ({
          titulo: `Sec ${i}`,
          texto: "z".repeat(3000),
        }));
        expect(montarTextoBaseCheckpoint(secoes, max).length).toBeLessThanOrEqual(
          max,
        );
      }
    }
  });
});

// --- Frases ----------------------------------------------------------------------

describe("textos de UI", () => {
  it("fraseLembreteCheckpoint: plural, singular, só não manuais, vazio", () => {
    const t = (id: string, titulo: string, manual = false): TopicoJanela => ({
      id,
      titulo,
      manual,
    });
    expect(
      fraseLembreteCheckpoint({ topicos: [t("a", "A"), t("b", "B")] }, 7),
    ).toBe("Faltam 7 dias para a prova. Que tal uma lista de exercícios sobre A e B?");
    expect(fraseLembreteCheckpoint({ topicos: [t("a", "A")] }, 1)).toBe(
      "Falta 1 dia para a prova. Que tal uma lista de exercícios sobre A?",
    );
    expect(
      fraseLembreteCheckpoint({ topicos: [t("a", "A"), t("manual:m", "M", true)] }, 3),
    ).toContain("sobre A?");
    expect(fraseLembreteCheckpoint({ topicos: [t("manual:m", "M", true)] }, 3)).toBe(
      "",
    );
  });

  it("rotuloEstadoCheckpoint cobre todos os estados", () => {
    expect(rotuloEstadoCheckpoint("futuro")).toBe("Em breve");
    expect(rotuloEstadoCheckpoint("devido")).toBe("Hoje");
    expect(rotuloEstadoCheckpoint("atrasado")).toBe("Atrasado");
    expect(rotuloEstadoCheckpoint("pronto")).toBe("Lista pronta");
    expect(rotuloEstadoCheckpoint("feito")).toBe("Concluído");
    expect(rotuloEstadoCheckpoint("indisponivel")).toBe("Sem material");
  });

  it("fraseCheckpointParcial: null quando veio tudo", () => {
    expect(fraseCheckpointParcial(8, 8)).toBeNull();
    expect(fraseCheckpointParcial(9, 8)).toBeNull();
    expect(fraseCheckpointParcial(5, 8)).toBe(
      "Montei 5 de 8 exercícios. A lista vale, mas é menor que o previsto. Você pode gerar outra.",
    );
  });

  it("fraseCheckpointIgnorados", () => {
    expect(fraseCheckpointIgnorados([])).toBeNull();
    expect(
      fraseCheckpointIgnorados([
        { id: "m", titulo: "M", motivo: "manual" },
        { id: "s", titulo: "S", motivo: "sem_texto" },
        { id: "f", titulo: "F", motivo: "fora_da_amostra" },
      ]),
    ).toBe(
      "Ficaram de fora, por não terem material importado: M e S. " +
        "Ficaram de fora desta lista (limite de assuntos): F.",
    );
    expect(
      fraseCheckpointIgnorados([{ id: "f", titulo: " ", motivo: "fora_da_amostra" }]),
    ).toBe("Ficaram de fora desta lista (limite de assuntos): (sem título).");
  });

  it("rotuloPreparandoCheckpoint é constante", () => {
    expect(rotuloPreparandoCheckpoint()).toBe(rotuloPreparandoCheckpoint());
    expect(rotuloPreparandoCheckpoint()).toContain("Preparando");
  });

  it("fraseSemCheckpoints", () => {
    expect(fraseSemCheckpoints("curto_demais")).toBe(
      "O plano é curto demais para ter checkpoints.",
    );
    expect(fraseSemCheckpoints("sem_topicos")).toBeNull();
    expect(fraseSemCheckpoints("sem_dias")).toBeNull();
    expect(fraseSemCheckpoints("prova_encerrada")).toBeNull();
  });
});
