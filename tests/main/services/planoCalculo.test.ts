import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { assinaturaPlano } from "@shared/diagnostico";
import type {
  DiagnosticoPlano,
  PerguntaDiagnostico,
  PlanoEstudo,
  Prova,
  TopicoPlano,
} from "@shared/types";

// `planoCalculo.ts` importa `DadosProvaInvalidosError` de `provas.ts`, que por
// sua vez importa `app` do Electron só para o diretório default. Mockamos o
// módulo para o import resolver (nenhuma função de disco é chamada aqui).
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

const { montarPlanoCalculado, nivelParaPeso } = await import(
  "../../../src/main/services/planoCalculo.js"
);
const { DadosProvaInvalidosError } = await import(
  "../../../src/main/services/provas.js"
);

/** Helper: prova mínima com um plano opcional. */
function provaDe(data: string, plano?: PlanoEstudo): Prova {
  return {
    id: "p1",
    titulo: "Prova",
    data,
    vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" },
    intervalos: [7, 3, 1],
    sessoes: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    ...(plano !== undefined ? { plano } : {}),
  };
}

/** Helper: tópico de plano. */
function topico(partes: Partial<TopicoPlano> & { id: string }): TopicoPlano {
  return {
    id: partes.id,
    titulo: partes.titulo ?? partes.id,
    novo: partes.novo ?? false,
    ...(partes.dificuldade !== undefined
      ? { dificuldade: partes.dificuldade }
      : {}),
    ...(partes.dataArquivo !== undefined
      ? { dataArquivo: partes.dataArquivo }
      : {}),
  };
}

/** Helper: plano de estudo com defaults. */
function planoDe(partes: Partial<PlanoEstudo> = {}): PlanoEstudo {
  return {
    ordinal: partes.ordinal ?? "segunda",
    horasPorDia: partes.horasPorDia ?? 2,
    diasPorSemana: partes.diasPorSemana ?? 5,
    topicos: partes.topicos ?? [topico({ id: "a" })],
    ...(partes.ordemManual !== undefined
      ? { ordemManual: partes.ordemManual }
      : {}),
    checkpoint: partes.checkpoint ?? "lembrete",
    atualizadoEm: partes.atualizadoEm ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("nivelParaPeso", () => {
  it("mapeia facil/media/dificil/undefined → 0/0.5/1/0.5", () => {
    expect(nivelParaPeso("facil")).toBe(0);
    expect(nivelParaPeso("media")).toBe(0.5);
    expect(nivelParaPeso("dificil")).toBe(1);
    expect(nivelParaPeso(undefined)).toBe(0.5);
  });
});

describe("montarPlanoCalculado", () => {
  it("lança DadosProvaInvalidosError quando a prova não tem plano", () => {
    expect(() => montarPlanoCalculado(provaDe("2026-04-01"), "2026-03-10")).toThrow(
      DadosProvaInvalidosError,
    );
  });

  it("prova que já passou → prova_passou, sem régua, sem dias", () => {
    const prova = provaDe("2026-03-05", planoDe());
    const r = montarPlanoCalculado(prova, "2026-03-10");
    expect(r.aviso).toEqual({ tipo: "prova_passou" });
    expect(r.mistura).toBeUndefined();
    expect(r.dias).toEqual([]);
  });

  it("prova amanhã → sem dias corridos entre hoje e a prova → sem_dias", () => {
    const prova = provaDe("2026-03-11", planoDe());
    const r = montarPlanoCalculado(prova, "2026-03-10");
    expect(r.aviso).toEqual({ tipo: "sem_dias" });
  });

  it("filtra dias úteis por âncora i % 7 < diasPorSemana", () => {
    // hoje=2026-03-10, prova=2026-03-25 → 14 dias corridos (11..24).
    // diasPorSemana=5 → úteis os índices 0..4, 7..11 (10 dias de estudo).
    const prova = provaDe(
      "2026-03-25",
      planoDe({ diasPorSemana: 5, horasPorDia: 2, topicos: [topico({ id: "a" })] }),
    );
    const r = montarPlanoCalculado(prova, "2026-03-10");
    // Datas com bloco só podem ser as úteis; a 1ª é amanhã (índice 0).
    const corridas: string[] = [];
    for (let i = 11; i <= 24; i++) {
      corridas.push(`2026-03-${i.toString().padStart(2, "0")}`);
    }
    const uteisEsperadas = corridas.filter((_, i) => i % 7 < 5);
    expect(r.dias.map((d) => d.data)).toEqual(uteisEsperadas);
  });

  it("ordemManual reconstruída em ReadonlyMap: respeita a ordem informada", () => {
    // Dois tópicos sem data; ordemManual força "b" antes de "a".
    const prova = provaDe(
      "2026-03-25",
      planoDe({
        topicos: [
          topico({ id: "a", novo: false }),
          topico({ id: "b", novo: false }),
        ],
        ordemManual: ["b", "a"],
        horasPorDia: 1,
      }),
    );
    const r = montarPlanoCalculado(prova, "2026-03-10");
    const primeiroBloco = r.dias.flatMap((d) => d.blocos)[0];
    expect(primeiroBloco.topicoId).toBe("b");
  });
});

describe("montarPlanoCalculado — diagnóstico (fatia 3)", () => {
  const pergunta = (
    topicoId: string,
    camada: "base" | "novo",
  ): PerguntaDiagnostico => ({
    tipo: "multipla",
    enunciado: "Q?",
    alternativas: [
      { texto: "A", correta: true },
      { texto: "B", correta: false },
    ],
    topicoId,
    camada,
  });
  const plano = planoDe({
    topicos: [
      topico({ id: "a", novo: false }),
      topico({ id: "b", novo: true }),
    ],
  });
  const diag = (
    respostas?: number[],
    assinatura = assinaturaPlano(plano),
  ): DiagnosticoPlano => ({
    assinatura,
    geradoEm: "2026-01-02T00:00:00.000Z",
    perguntas: [
      pergunta("a", "base"),
      pergunta("a", "base"),
      pergunta("a", "base"),
      pergunta("b", "novo"),
    ],
    pedido: 6,
    ignorados: [],
    ...(respostas !== undefined
      ? { respostas, concluidoEm: "2026-01-03T00:00:00.000Z" }
      : {}),
  });
  const comDiag = (data: string, d?: DiagnosticoPlano): Prova => ({
    ...provaDe(data, plano),
    ...(d !== undefined ? { diagnostico: d } : {}),
  });
  const HOJE = "2026-03-10";
  const DATA = "2026-03-25"; // 15 dias
  // base toda errada (alternativa B = índice 1), novo certo.
  const lacuna = [1, 1, 1, 0];

  it("lacuna_base concluída ⇒ mais base e diagnosticoAplicado", () => {
    const sem = montarPlanoCalculado(comDiag(DATA), HOJE);
    const com = montarPlanoCalculado(comDiag(DATA, diag(lacuna)), HOJE);
    expect(com.mistura!.fracaoBase).toBeGreaterThan(sem.mistura!.fracaoBase);
    expect(com.diagnosticoAplicado?.veredito).toBe("lacuna_base");
  });

  it("pendente, desatualizado, inconclusivo e sem_dificuldade ⇒ idêntico ao sem diagnóstico", () => {
    const sem = montarPlanoCalculado(comDiag(DATA), HOJE);
    expect(montarPlanoCalculado(comDiag(DATA, diag()), HOJE)).toEqual(sem);
    expect(
      montarPlanoCalculado(comDiag(DATA, diag(lacuna, "outra")), HOJE),
    ).toEqual(sem);
    // todas certas (alternativa A = índice 0) ⇒ sem_dificuldade
    expect(
      montarPlanoCalculado(comDiag(DATA, diag([0, 0, 0, 0])), HOJE),
    ).toEqual(sem);
    // só 2 perguntas de base ⇒ inconclusivo
    const curto: DiagnosticoPlano = {
      ...diag([1, 1]),
      perguntas: [pergunta("a", "base"), pergunta("a", "base")],
    };
    expect(montarPlanoCalculado(comDiag(DATA, curto), HOJE)).toEqual(sem);
  });

  it("prova passada ⇒ prova_passou, sem diagnosticoAplicado", () => {
    const r = montarPlanoCalculado(comDiag("2026-03-01", diag(lacuna)), HOJE);
    expect(r).toEqual({ dias: [], aviso: { tipo: "prova_passou" } });
  });

  it("prova antiga (sem o bloco) ⇒ idêntica à fatia 2", () => {
    const r = montarPlanoCalculado(provaDe(DATA, plano), HOJE);
    expect("diagnosticoAplicado" in r).toBe(false);
    expect(r.mistura).toBeDefined();
  });
});
