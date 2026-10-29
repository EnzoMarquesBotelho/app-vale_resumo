import { describe, expect, it } from "vitest";
import {
  assinaturaPlano,
  classificarDiagnostico,
  diagnosticoAplicavel,
  ehTopicoManual,
  estadoDiagnostico,
  fraseDiagnosticoParcial,
  fraseResultadoDiagnostico,
  fraseTopicosIgnorados,
  planejarDiagnostico,
  pontuarDiagnostico,
  resultadoDoDiagnostico,
  rotuloProgressoDiagnostico,
  selecionarTopicosDiagnostico,
} from "../../src/shared/diagnostico";
import type {
  ContextoFrase,
  RespostaDiagnostico,
  ResultadoDiagnostico,
} from "../../src/shared/diagnostico";
import type {
  CamadaDiagnostico,
  DiagnosticoPlano,
  PerguntaDiagnostico,
  TopicoIgnorado,
  TopicoPlano,
} from "../../src/shared/types";

const t = (id: string, novo: boolean, titulo = id): TopicoPlano => ({
  id,
  titulo,
  novo,
});

/** Gera respostas: `n` do tópico, `acertos` certas. */
function resp(
  camada: CamadaDiagnostico,
  topicoId: string,
  acertos: number,
  total: number,
): RespostaDiagnostico[] {
  return Array.from({ length: total }, (_, i) => ({
    topicoId,
    camada,
    acertou: i < acertos,
  }));
}

describe("ehTopicoManual / assinaturaPlano", () => {
  it("reconhece o prefixo manual:", () => {
    expect(ehTopicoManual("manual:x-0")).toBe(true);
    expect(ehTopicoManual("abc")).toBe(false);
  });

  const base = [t("a", false), t("b", true)];
  it("formato exato e independente da ordem", () => {
    expect(assinaturaPlano({ ordinal: "segunda", topicos: base })).toBe(
      '["segunda",[["a",0],["b",1]]]',
    );
    expect(
      assinaturaPlano({ ordinal: "segunda", topicos: [...base].reverse() }),
    ).toBe('["segunda",[["a",0],["b",1]]]');
  });
  it("ignora manuais", () => {
    expect(
      assinaturaPlano({
        ordinal: "segunda",
        topicos: [...base, t("manual:x-2", true)],
      }),
    ).toBe('["segunda",[["a",0],["b",1]]]');
    expect(assinaturaPlano({ ordinal: "segunda", topicos: [] })).toBe(
      '["segunda",[]]',
    );
  });
  it("muda com novo e ordinal", () => {
    expect(
      assinaturaPlano({
        ordinal: "segunda",
        topicos: [t("a", false), t("b", false)],
      }),
    ).toBe('["segunda",[["a",0],["b",0]]]');
    expect(assinaturaPlano({ ordinal: "final", topicos: base })).toBe(
      '["final",[["a",0],["b",1]]]',
    );
  });
  it("não colide por separador no id", () => {
    const um = assinaturaPlano({
      ordinal: "segunda",
      topicos: [t("a,b:1", false)],
    });
    const dois = assinaturaPlano({
      ordinal: "segunda",
      topicos: [t("a", false), t("b", true)],
    });
    expect(um).not.toBe(dois);
  });
});

describe("selecionarTopicosDiagnostico", () => {
  const ids = (n: number, max: number): string[] =>
    selecionarTopicosDiagnostico(
      Array.from({ length: n }, (_, i) => ({ id: String(i) })),
      max,
    ).map((x) => x.id);

  it("segue a tabela de índices", () => {
    expect(ids(0, 3)).toEqual([]);
    expect(ids(2, 3)).toEqual(["0", "1"]);
    expect(ids(3, 3)).toEqual(["0", "1", "2"]);
    expect(ids(4, 3)).toEqual(["0", "2", "3"]);
    expect(ids(5, 3)).toEqual(["0", "2", "4"]);
    expect(ids(10, 3)).toEqual(["0", "5", "9"]);
    expect(ids(5, 1)).toEqual(["0"]);
  });
  it("max < 1 devolve vazio", () => {
    expect(ids(5, 0)).toEqual([]);
    expect(ids(5, -2)).toEqual([]);
  });
});

describe("planejarDiagnostico", () => {
  it("2 base + 1 novo com texto", () => {
    const r = planejarDiagnostico(
      [t("a", false), t("b", false), t("c", true)],
      new Set(["a", "b", "c"]),
    );
    expect(r.base.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.novo.map((x) => x.id)).toEqual(["c"]);
    expect(r.ignorados).toEqual([]);
    expect(r.indisponivel).toBe(false);
  });
  it("manuais ignorados com motivo", () => {
    const r = planejarDiagnostico(
      [t("manual:a-0", false), t("b", false), t("manual:c-2", true)],
      new Set(["b"]),
    );
    expect(r.base.map((x) => x.id)).toEqual(["b"]);
    expect(r.novo).toEqual([]);
    expect(r.ignorados.map((i) => i.motivo)).toEqual(["manual", "manual"]);
  });
  it("só base manual ⇒ indisponível", () => {
    const r = planejarDiagnostico(
      [t("manual:a-0", false), t("manual:b-1", false)],
      new Set(),
    );
    expect(r.indisponivel).toBe(true);
    expect(r.ignorados.every((i) => i.motivo === "manual")).toBe(true);
  });
  it("base sem texto ⇒ sem_texto e indisponível se era a única", () => {
    const r = planejarDiagnostico([t("a", false), t("c", true)], new Set(["c"]));
    expect(r.ignorados).toEqual([
      { id: "a", titulo: "a", motivo: "sem_texto" },
    ]);
    expect(r.indisponivel).toBe(true);
  });
  it("só novo com texto ⇒ indisponível", () => {
    expect(planejarDiagnostico([t("c", true)], new Set(["c"])).indisponivel).toBe(
      true,
    );
  });
  it("1ª prova (tudo base) ⇒ sem novo, disponível", () => {
    const r = planejarDiagnostico(
      [t("a", false), t("b", false)],
      new Set(["a", "b"]),
    );
    expect(r.novo).toEqual([]);
    expect(r.indisponivel).toBe(false);
  });
  it("amostra de 7 base elegíveis ⇒ índices 0,3,6", () => {
    const ts = Array.from({ length: 7 }, (_, i) => t(`t${i}`, false));
    const r = planejarDiagnostico(ts, new Set(ts.map((x) => x.id)));
    expect(r.base.map((x) => x.id)).toEqual(["t0", "t3", "t6"]);
    expect(r.ignorados).toEqual([]);
  });
});

function perg(
  correta: number,
  topicoId = "a",
  camada: CamadaDiagnostico = "base",
): PerguntaDiagnostico {
  return {
    tipo: "multipla",
    enunciado: "Q?",
    alternativas: [0, 1, 2, 3].map((i) => ({
      texto: `alt ${i}`,
      correta: i === correta,
    })),
    topicoId,
    camada,
  };
}

describe("pontuarDiagnostico", () => {
  const ps = [perg(1), perg(2, "b", "novo")];
  it("acerta, erra, 'Não sei', fora de faixa e escolhas curtas", () => {
    expect(pontuarDiagnostico(ps, [1, 0]).map((r) => r.acertou)).toEqual([
      true,
      false,
    ]);
    expect(pontuarDiagnostico(ps, [-1, 2]).map((r) => r.acertou)).toEqual([
      false,
      true,
    ]);
    expect(pontuarDiagnostico(ps, [9, 9]).map((r) => r.acertou)).toEqual([
      false,
      false,
    ]);
    const curto = pontuarDiagnostico(ps, [1]);
    expect(curto).toHaveLength(2);
    expect(curto[1].acertou).toBe(false);
  });
  it("carrega o rótulo da pergunta", () => {
    expect(pontuarDiagnostico(ps, [1, 2])[1]).toEqual({
      topicoId: "b",
      camada: "novo",
      acertou: true,
    });
  });
});

describe("classificarDiagnostico", () => {
  const B = (a: number, n: number) => resp("base", "tb", a, n);
  const N = (a: number, n: number) => resp("novo", "tn", a, n);

  it("1: lista vazia ⇒ inconclusivo", () => {
    const r = classificarDiagnostico([]);
    expect(r.veredito).toBe("inconclusivo");
    expect(r.intensidade).toBe(0);
  });
  it("2: caso feliz", () => {
    const r = classificarDiagnostico([...B(7, 9), ...N(8, 9)]);
    expect(r.veredito).toBe("sem_dificuldade");
    expect(r.intensidade).toBe(0);
  });
  it("3: só a base cai", () => {
    const r = classificarDiagnostico([...B(2, 9), ...N(8, 9)]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo((0.6 - 2 / 9) / 0.6, 6);
    expect(r.intensidade).toBeCloseTo(0.6296, 3);
  });
  it("4: só o novo cai", () => {
    const r = classificarDiagnostico([...B(8, 9), ...N(3, 9)]);
    expect(r.veredito).toBe("dificuldade_novo");
    expect(r.intensidade).toBeCloseTo(0.4444, 3);
  });
  it("5: base baixa vence mesmo com novo baixo", () => {
    const r = classificarDiagnostico([...B(2, 9), ...N(2, 9)]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo(0.6296, 3);
  });
  it("6: tudo errado ⇒ lacuna_base i=1", () => {
    const r = classificarDiagnostico([...B(0, 9), ...N(0, 9)]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBe(1);
  });
  it("7: tudo certo ⇒ sem_dificuldade", () => {
    const r = classificarDiagnostico([...B(9, 9), ...N(9, 9)]);
    expect(r.veredito).toBe("sem_dificuldade");
    expect(r.intensidade).toBe(0);
  });
  it("8: exatamente 3/5 não é baixa (limiar estrito)", () => {
    const r = classificarDiagnostico([...B(3, 5), ...N(9, 9)]);
    expect(r.veredito).toBe("sem_dificuldade");
  });
  it("9: 2/5 é baixa, mas amostra pequena encolhe a intensidade", () => {
    const r = classificarDiagnostico([...B(2, 5), ...N(9, 9)]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo(0.1852, 3);
  });
  it("10: base com < 3 respostas ⇒ inconclusivo", () => {
    expect(classificarDiagnostico([...B(2, 2), ...N(5, 5)]).veredito).toBe(
      "inconclusivo",
    );
  });
  it("11: só o novo medido ⇒ inconclusivo", () => {
    expect(classificarDiagnostico(N(3, 3)).veredito).toBe("inconclusivo");
  });
  it("12: 1ª prova (sem novo) com base boa ⇒ sem_dificuldade", () => {
    const r = classificarDiagnostico(B(5, 5));
    expect(r.veredito).toBe("sem_dificuldade");
    expect(r.novo.medida).toBe(false);
  });
  it("13: amostra mínima 1/3 ⇒ lacuna_base com efeito pequeno", () => {
    const r = classificarDiagnostico(B(1, 3));
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo(0.1481, 3);
  });
  it("14: novo com 2 respostas = não medido", () => {
    expect(classificarDiagnostico([...B(5, 5), ...N(1, 2)]).veredito).toBe(
      "sem_dificuldade",
    );
  });
  it("15: dificuldade_novo com 3/6", () => {
    const r = classificarDiagnostico([...B(6, 9), ...N(3, 6)]);
    expect(r.veredito).toBe("dificuldade_novo");
    expect(r.intensidade).toBeCloseTo(0.1111, 3);
  });
  it("16: 5/9 é baixa (borda) com intensidade pequena", () => {
    const r = classificarDiagnostico([...B(5, 9), ...N(9, 9)]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo(0.0741, 3);
  });
  it("17: topicosFracos na ordem da 1ª aparição", () => {
    const r = classificarDiagnostico([
      ...resp("base", "A", 0, 3),
      ...resp("base", "B", 0, 3),
      ...resp("base", "C", 3, 3),
    ]);
    expect(r.veredito).toBe("lacuna_base");
    expect(r.intensidade).toBeCloseTo(0.4444, 3);
    expect(r.topicosFracos).toEqual(["A", "B"]);
  });
  it("18: ordem das respostas é irrelevante", () => {
    const todas = [...B(2, 9), ...N(8, 9)];
    const a = classificarDiagnostico(todas);
    const b = classificarDiagnostico([...todas].reverse());
    expect(b.veredito).toBe(a.veredito);
    expect(b.intensidade).toBe(a.intensidade);
  });

  it("limiar por inteiros: 3/5 e 6/10 não, 2/5 e 5/9 sim", () => {
    const v = (a: number, n: number) =>
      classificarDiagnostico(B(a, n)).veredito;
    expect(v(3, 5)).toBe("sem_dificuldade");
    expect(v(6, 10)).toBe("sem_dificuldade");
    expect(v(2, 5)).toBe("lacuna_base");
    expect(v(5, 9)).toBe("lacuna_base");
  });
  it("invariantes: intensidade em [0,1] e aplicável ⇔ intensidade > 0", () => {
    for (let bt = 0; bt <= 10; bt++) {
      for (let ba = 0; ba <= bt; ba++) {
        for (let nt = 0; nt <= 10; nt += 3) {
          for (let na = 0; na <= nt; na++) {
            const r = classificarDiagnostico([...B(ba, bt), ...N(na, nt)]);
            expect(r.intensidade).toBeGreaterThanOrEqual(0);
            expect(r.intensidade).toBeLessThanOrEqual(1);
            const aplicavel =
              r.veredito === "lacuna_base" || r.veredito === "dificuldade_novo";
            expect(aplicavel).toBe(r.intensidade > 0);
          }
        }
      }
    }
  });
  it("monotonia na amostra: mesma taxa, mais respostas ⇒ intensidade não menor", () => {
    const i = (a: number, n: number) =>
      classificarDiagnostico(B(a, n)).intensidade;
    expect(i(1, 3)).toBeLessThanOrEqual(i(2, 6));
    expect(i(2, 6)).toBeLessThanOrEqual(i(3, 9));
    expect(i(3, 9)).toBeLessThanOrEqual(i(6, 18));
  });
});

describe("estadoDiagnostico / diagnosticoAplicavel / resultadoDoDiagnostico", () => {
  const plano = {
    ordinal: "segunda" as const,
    topicos: [t("a", false), t("b", true)],
  };
  const perguntas = [
    perg(0, "a", "base"),
    perg(0, "a", "base"),
    perg(0, "a", "base"),
    perg(0, "b", "novo"),
  ];
  const diag = (respostas?: number[]): DiagnosticoPlano => ({
    assinatura: assinaturaPlano(plano),
    geradoEm: "2025-01-01T00:00:00.000Z",
    perguntas,
    pedido: 4,
    ignorados: [],
    ...(respostas !== undefined
      ? { respostas, concluidoEm: "2025-01-02T00:00:00.000Z" }
      : {}),
  });

  it("nenhum quando falta plano ou diagnóstico", () => {
    expect(estadoDiagnostico(undefined, diag())).toBe("nenhum");
    expect(estadoDiagnostico(plano, undefined)).toBe("nenhum");
    expect(diagnosticoAplicavel(undefined, diag([0, 0, 0, 0]))).toBeUndefined();
  });
  it("pendente sem respostas ou com comprimento errado", () => {
    expect(estadoDiagnostico(plano, diag())).toBe("pendente");
    expect(estadoDiagnostico(plano, diag([0, 0]))).toBe("pendente");
    expect(diagnosticoAplicavel(plano, diag())).toBeUndefined();
    expect(resultadoDoDiagnostico(diag())).toBeUndefined();
  });
  it("concluído com lacuna_base ⇒ ajuste", () => {
    const d = diag([-1, -1, -1, 0]);
    expect(estadoDiagnostico(plano, d)).toBe("concluido");
    expect(diagnosticoAplicavel(plano, d)).toEqual({
      veredito: "lacuna_base",
      intensidade: 1 * (3 / 9),
    });
  });
  it("concluído sem dificuldade ou inconclusivo ⇒ sem ajuste", () => {
    expect(diagnosticoAplicavel(plano, diag([0, 0, 0, 0]))).toBeUndefined();
    const curto: DiagnosticoPlano = {
      ...diag([0, 0]),
      perguntas: perguntas.slice(0, 2),
      assinatura: assinaturaPlano(plano),
    };
    expect(estadoDiagnostico(plano, curto)).toBe("concluido");
    expect(diagnosticoAplicavel(plano, curto)).toBeUndefined();
  });
  it("desatualizado quando um tópico virou novo", () => {
    const outro = {
      ordinal: "segunda" as const,
      topicos: [t("a", true), t("b", true)],
    };
    const d = diag([-1, -1, -1, 0]);
    expect(estadoDiagnostico(outro, d)).toBe("desatualizado");
    expect(diagnosticoAplicavel(outro, d)).toBeUndefined();
  });
  it("horas/dia ou dificuldade não invalidam (fora da assinatura)", () => {
    const outro = {
      ordinal: "segunda" as const,
      topicos: [
        { ...t("a", false), dificuldade: "dificil" as const },
        t("b", true),
      ],
    };
    expect(estadoDiagnostico(outro, diag([0, 0, 0, 0]))).toBe("concluido");
  });
});

describe("fraseResultadoDiagnostico", () => {
  const titulos = new Map([
    ["a", "Limites"],
    ["b", "Derivadas"],
    ["c", "Integrais"],
    ["d", "Séries"],
  ]);
  const camada = (acertos: number, total: number) => ({
    acertos,
    total,
    taxa: total > 0 ? acertos / total : 0,
    medida: total >= 3,
  });
  const lacuna = (fracos: string[]): ResultadoDiagnostico => ({
    veredito: "lacuna_base",
    base: camada(2, 9),
    novo: camada(8, 9),
    intensidade: 0.63,
    topicosFracos: fracos,
  });
  const novoDif = (fracos: string[]): ResultadoDiagnostico => ({
    veredito: "dificuldade_novo",
    base: camada(8, 9),
    novo: camada(3, 9),
    intensidade: 0.44,
    topicosFracos: fracos,
  });
  const ctx = (p: Partial<ContextoFrase> = {}): ContextoFrase => ({
    novoPlanejado: true,
    efeitoNoPlano: true,
    planoDistribuido: true,
    ...p,
  });
  const ini =
    "Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores";
  const fim = ". Por isso o plano dá mais tempo à base antes do conteúdo novo.";

  it("1–4: lista de fracos com 1, 2, 3 e 4 títulos", () => {
    expect(fraseResultadoDiagnostico(lacuna(["a"]), titulos, ctx())).toBe(
      `${ini}; os pontos mais fracos: Limites${fim}`,
    );
    expect(fraseResultadoDiagnostico(lacuna(["a", "b"]), titulos, ctx())).toBe(
      `${ini}; os pontos mais fracos: Limites e Derivadas${fim}`,
    );
    expect(
      fraseResultadoDiagnostico(lacuna(["a", "b", "c"]), titulos, ctx()),
    ).toBe(`${ini}; os pontos mais fracos: Limites, Derivadas e Integrais${fim}`);
    expect(
      fraseResultadoDiagnostico(lacuna(["a", "b", "c", "d"]), titulos, ctx()),
    ).toBe(
      `${ini}; os pontos mais fracos: Limites, Derivadas, Integrais e mais 1${fim}`,
    );
  });
  it("5: id ausente é omitido", () => {
    expect(fraseResultadoDiagnostico(lacuna(["a", "zzz"]), titulos, ctx())).toBe(
      `${ini}; os pontos mais fracos: Limites${fim}`,
    );
  });
  it("6: só ids ausentes ou lista vazia omitem a cláusula", () => {
    const esperado = `${ini}${fim}`;
    expect(fraseResultadoDiagnostico(lacuna(["zzz"]), titulos, ctx())).toBe(
      esperado,
    );
    expect(fraseResultadoDiagnostico(lacuna([]), titulos, ctx())).toBe(esperado);
  });
  it("7: sem efeito, com novo planejado", () => {
    expect(
      fraseResultadoDiagnostico(lacuna([]), titulos, ctx({ efeitoNoPlano: false })),
    ).toBe(
      `${ini}. O plano já dá o máximo de foco à base que a distância da prova permite.`,
    );
  });
  it("8: 1ª prova (sem novo)", () => {
    expect(
      fraseResultadoDiagnostico(
        lacuna([]),
        titulos,
        ctx({ efeitoNoPlano: false, novoPlanejado: false }),
      ),
    ).toBe(
      `${ini}. Como todo o conteúdo do plano é base, não há conteúdo novo para reequilibrar.`,
    );
  });
  it("9: dificuldade_novo com efeito", () => {
    expect(fraseResultadoDiagnostico(novoDif(["c"]), titulos, ctx())).toBe(
      "A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9); os pontos mais fracos: Integrais. O plano reservou mais tempo para ele.",
    );
  });
  it("10: dificuldade_novo sem efeito", () => {
    expect(
      fraseResultadoDiagnostico(novoDif([]), titulos, ctx({ efeitoNoPlano: false })),
    ).toBe(
      "A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9). O plano já dá o máximo de foco possível ao conteúdo novo.",
    );
  });
  it("11–13: sem_dificuldade", () => {
    const sem = (medida: boolean): ResultadoDiagnostico => ({
      veredito: "sem_dificuldade",
      base: camada(8, 9),
      novo: medida ? camada(8, 9) : camada(0, 0),
      intensidade: 0,
      topicosFracos: [],
    });
    expect(fraseResultadoDiagnostico(sem(true), titulos, ctx())).toBe(
      "Você foi bem nas perguntas. O plano continua como estava.",
    );
    expect(fraseResultadoDiagnostico(sem(false), titulos, ctx())).toBe(
      "Você foi bem nas perguntas. O plano continua como estava. Não deu para medir o conteúdo novo.",
    );
    expect(
      fraseResultadoDiagnostico(sem(false), titulos, ctx({ novoPlanejado: false })),
    ).toBe("Você foi bem nas perguntas. O plano continua como estava.");
  });
  it("14: inconclusivo", () => {
    const r: ResultadoDiagnostico = {
      veredito: "inconclusivo",
      base: camada(0, 0),
      novo: camada(0, 0),
      intensidade: 0,
      topicosFracos: [],
    };
    expect(fraseResultadoDiagnostico(r, titulos, ctx())).toBe(
      "Não deu para tirar uma conclusão (poucas perguntas sobre a base). O plano continua como estava.",
    );
  });
  it("15–16: plano sem dias distribuídos nunca promete 'máximo de foco'", () => {
    const sd = ctx({ efeitoNoPlano: false, planoDistribuido: false });
    const a = fraseResultadoDiagnostico(lacuna([]), titulos, sd);
    const b = fraseResultadoDiagnostico(novoDif([]), titulos, sd);
    expect(a).toBe(
      `${ini}. Ainda não há dias de estudo no plano para ajustar.`,
    );
    expect(b).toBe(
      "A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9). Ainda não há dias de estudo no plano para ajustar.",
    );
    expect(a).not.toContain("máximo de foco");
    expect(b).not.toContain("máximo de foco");
  });
});

describe("textos auxiliares", () => {
  it("fraseDiagnosticoParcial", () => {
    expect(fraseDiagnosticoParcial(12, 18)).toBe(
      "Montei 12 de 18 perguntas. O resultado vale, mas é menos preciso. Você pode refazer o diagnóstico depois.",
    );
    expect(fraseDiagnosticoParcial(18, 18)).toBeNull();
    expect(fraseDiagnosticoParcial(20, 18)).toBeNull();
    expect(fraseDiagnosticoParcial(0, 0)).toBeNull();
  });
  it("fraseTopicosIgnorados", () => {
    const ig = (titulo: string, motivo: TopicoIgnorado["motivo"]) => ({
      id: titulo,
      titulo,
      motivo,
    });
    expect(fraseTopicosIgnorados([])).toBeNull();
    expect(
      fraseTopicosIgnorados([ig("Limites", "manual"), ig("Séries", "nao_gerou")]),
    ).toBe(
      "Ficaram de fora, por não terem material importado: Limites. Não consegui montar perguntas sobre: Séries.",
    );
    expect(
      fraseTopicosIgnorados([ig("Limites", "sem_texto"), ig("Derivadas", "manual")]),
    ).toBe(
      "Ficaram de fora, por não terem material importado: Limites e Derivadas.",
    );
  });
  it("fraseTopicosIgnorados com 4 ignorados e título vazio, sem omitir", () => {
    const f = fraseTopicosIgnorados([
      { id: "1", titulo: "A", motivo: "manual" },
      { id: "2", titulo: "B", motivo: "manual" },
      { id: "3", titulo: "C", motivo: "sem_texto" },
      { id: "4", titulo: "", motivo: "manual" },
    ]);
    expect(f).toBe(
      "Ficaram de fora, por não terem material importado: A, B, C e mais 1.",
    );
    expect(
      fraseTopicosIgnorados([{ id: "1", titulo: "  ", motivo: "nao_gerou" }]),
    ).toBe("Não consegui montar perguntas sobre: (sem título).");
  });
  it("rotuloProgressoDiagnostico", () => {
    const p = { geracaoId: "g", artefato: "diagnostico" as const };
    expect(rotuloProgressoDiagnostico({ ...p, prontos: 2, total: 6 })).toBe(
      "Preparando as perguntas: assunto 2 de 6…",
    );
    expect(rotuloProgressoDiagnostico({ ...p, prontos: 0, total: 0 })).toBe(
      "Preparando as perguntas…",
    );
  });
});
