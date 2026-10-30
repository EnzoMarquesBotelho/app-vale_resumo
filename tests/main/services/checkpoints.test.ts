import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { planejarCheckpoints } from "@shared/checkpoints";
import type { CheckpointPlanejado, VisaoCheckpoints } from "@shared/checkpoints";
import { CHECKPOINT_TEXTO_MAX } from "@shared/constants";
import { assinaturaPlano } from "@shared/diagnostico";
import type { PlanoEstudo, Prova, TopicoPlano } from "@shared/types";

// `checkpoints.ts` importa `provas.ts`, que importa `app` do Electron só para o
// diretório default. Nenhuma função de disco é chamada aqui.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

const {
  CheckpointEmAndamentoError,
  CheckpointIndisponivelError,
  CheckpointInsuficienteError,
  CheckpointNaoDisponivelError,
  dataLocalDeIso,
  exigirCheckpointGeravel,
  gerarListaCheckpoint,
  mensagemAmigavelCheckpoint,
  montarVisaoCheckpoints,
} = await import("../../../src/main/services/checkpoints.js");
const { montarPlanoCalculado } = await import(
  "../../../src/main/services/planoCalculo.js"
);
const { GeracaoFalhouError, OllamaIndisponivelError } = await import(
  "../../../src/main/services/ollama.js"
);
const { DadosProvaInvalidosError, ProvaNaoEncontradaError } = await import(
  "../../../src/main/services/provas.js"
);
const { ExerciciosInvalidosError, SemTextoParaExerciciosError } = await import(
  "../../../src/main/services/parse.js"
);

const AGORA = "2026-03-10T12:00:00.000Z";

describe("dataLocalDeIso", () => {
  it("converte na data local (qualquer fuso)", () => {
    expect(dataLocalDeIso(new Date(2026, 5, 1, 12).toISOString())).toBe(
      "2026-06-01",
    );
    expect(dataLocalDeIso(new Date(2026, 0, 5, 0, 30).toISOString())).toBe(
      "2026-01-05",
    );
  });

  it("inválida ⇒ null", () => {
    expect(dataLocalDeIso("não é data")).toBeNull();
    expect(dataLocalDeIso("")).toBeNull();
  });
});

// --- montarVisaoCheckpoints ----------------------------------------------------

function topico(id: string, novo = false): TopicoPlano {
  return { id, titulo: `Titulo ${id}`, novo };
}

function planoDe(
  salvoEm: string,
  topicos: TopicoPlano[] = [topico("a"), topico("b", true)],
): PlanoEstudo {
  return {
    ordinal: "segunda",
    horasPorDia: 2,
    diasPorSemana: 7,
    topicos,
    checkpoint: "lembrete",
    atualizadoEm: salvoEm,
  };
}

function provaDe(plano?: PlanoEstudo, extra: Partial<Prova> = {}): Prova {
  return {
    id: "p1",
    titulo: "Prova",
    data: "2026-04-20",
    vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" },
    intervalos: [7, 3, 1],
    sessoes: [],
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...(plano !== undefined ? { plano } : {}),
    ...extra,
  };
}

const salvoEm = new Date(2026, 2, 1, 12).toISOString(); // 2026-03-01 local

function semEstado(v: VisaoCheckpoints): CheckpointPlanejado[] {
  return v.itens.map((i) => ({
    id: i.id,
    diasAntes: i.diasAntes,
    data: i.data,
    topicos: i.topicos,
  }));
}

describe("montarVisaoCheckpoints", () => {
  it("prova sem plano ⇒ visão vazia com lembrete e sem_topicos", () => {
    const v = montarVisaoCheckpoints(provaDe(), "2026-04-10");
    expect(v).toEqual({
      hoje: "2026-04-10",
      diasRestantes: 10,
      preferencia: "lembrete",
      bloco: "nenhum",
      itens: [],
      motivoVazio: "sem_topicos",
    });
  });

  it("usa o plano de referência da data do salvamento (estável) e resolve estados por hoje", () => {
    const prova = provaDe(planoDe(salvoEm));
    const v = montarVisaoCheckpoints(prova, "2026-04-10");
    const esperado = planejarCheckpoints({
      planoReferencia: montarPlanoCalculado(prova, "2026-03-01"),
      dataProva: prova.data,
      dataBase: "2026-03-01",
      hoje: "2026-04-10",
    });
    expect(esperado.checkpoints.length).toBeGreaterThan(0);
    expect(semEstado(v)).toEqual(esperado.checkpoints);
    expect(v.diasRestantes).toBe(10);
    expect(v.bloco).toBe("nenhum");
    expect(v.motivoVazio).toBeUndefined();
    for (const i of v.itens) {
      expect(i.estado).toBe(
        i.data < "2026-04-10" ? "atrasado" : i.data === "2026-04-10" ? "devido" : "futuro",
      );
    }
    // Os pontos NÃO andam com o relógio: outro "hoje" mantém datas e janelas.
    const outro = montarVisaoCheckpoints(prova, "2026-04-12");
    expect(semEstado(outro)).toEqual(semEstado(v));
  });

  it("dataBase futura (relógio recuado) é limitada a hoje", () => {
    const futuro = new Date(2026, 3, 12, 12).toISOString(); // 2026-04-12
    const prova = provaDe(planoDe(futuro));
    const v = montarVisaoCheckpoints(prova, "2026-04-10");
    const esperado = planejarCheckpoints({
      planoReferencia: montarPlanoCalculado(prova, "2026-04-10"),
      dataProva: prova.data,
      dataBase: "2026-04-10",
      hoje: "2026-04-10",
    });
    expect(semEstado(v)).toEqual(esperado.checkpoints);
    for (const i of v.itens) expect(i.estado).toBe("futuro");
  });

  it("carimbo inválido do plano cai para hoje", () => {
    const prova = provaDe(planoDe("lixo"));
    const v = montarVisaoCheckpoints(prova, "2026-04-10");
    const esperado = planejarCheckpoints({
      planoReferencia: montarPlanoCalculado(prova, "2026-04-10"),
      dataProva: prova.data,
      dataBase: "2026-04-10",
      hoje: "2026-04-10",
    });
    expect(semEstado(v)).toEqual(esperado.checkpoints);
  });

  it("bloco com outra assinatura ⇒ desatualizado", () => {
    const prova = provaDe(planoDe(salvoEm), {
      checkpoints: { assinatura: "outra", itens: [] },
    });
    expect(montarVisaoCheckpoints(prova, "2026-04-10").bloco).toBe("desatualizado");
  });

  it("bloco atual com a lista ⇒ pronto", () => {
    const plano = planoDe(salvoEm);
    const base = montarVisaoCheckpoints(provaDe(plano), "2026-04-10");
    const alvo = base.itens[0];
    const prova = provaDe(plano, {
      checkpoints: {
        assinatura: assinaturaPlano(plano),
        itens: [
          {
            id: alvo.id,
            geradoEm: AGORA,
            topicos: [{ id: "a", titulo: "A" }],
            ignorados: [],
            pedido: 8,
            exercicios: Array.from({ length: 3 }, () => ({
              enunciado: "e",
              resposta: "r",
              modo: "mista" as const,
            })),
          },
        ],
      },
    });
    const v = montarVisaoCheckpoints(prova, "2026-04-10");
    expect(v.bloco).toBe("atual");
    expect(v.itens.find((i) => i.id === alvo.id)?.estado).toBe("pronto");
  });

  it("preferência automática e emGeracao são repassados", () => {
    const plano = { ...planoDe(salvoEm), checkpoint: "automatico" as const };
    const v = montarVisaoCheckpoints(provaDe(plano), "2026-04-10", "d7");
    expect(v.preferencia).toBe("automatico");
    expect(v.emGeracao).toBe("d7");
    expect("emGeracao" in montarVisaoCheckpoints(provaDe(plano), "2026-04-10")).toBe(
      false,
    );
  });

  it("prova hoje ou passada ⇒ sem itens, prova_encerrada", () => {
    const prova = provaDe(planoDe(salvoEm));
    for (const hoje of ["2026-04-20", "2026-04-25"]) {
      const v = montarVisaoCheckpoints(prova, hoje);
      expect(v.itens).toEqual([]);
      expect(v.motivoVazio).toBe("prova_encerrada");
    }
  });
});

describe("exigirCheckpointGeravel", () => {
  const base = (estado: string): VisaoCheckpoints => ({
    hoje: "2026-04-10",
    diasRestantes: 10,
    preferencia: "lembrete",
    bloco: "atual",
    itens: [
      {
        id: "d7",
        diasAntes: 7,
        data: "2026-04-13",
        topicos: [{ id: "a", titulo: "A", manual: false }],
        estado: estado as never,
      },
    ],
  });

  it("devido/atrasado/pronto passam", () => {
    for (const e of ["devido", "atrasado", "pronto"]) {
      expect(exigirCheckpointGeravel(base(e), "d7").id).toBe("d7");
    }
  });

  it("futuro, feito, indisponivel e id desconhecido são rejeitados com a frase certa", () => {
    expect(() => exigirCheckpointGeravel(base("futuro"), "d7")).toThrow(
      "Esta lista só fica disponível em 13/04.",
    );
    expect(() => exigirCheckpointGeravel(base("feito"), "d7")).toThrow(
      "Esta lista já foi concluída.",
    );
    expect(() => exigirCheckpointGeravel(base("indisponivel"), "d7")).toThrow(
      "ao menos um assunto com material importado",
    );
    expect(() => exigirCheckpointGeravel(base("devido"), "d99")).toThrow(
      "Não encontrei esse checkpoint no plano atual.",
    );
    expect(() => exigirCheckpointGeravel(base("futuro"), "d99")).toThrow(
      CheckpointNaoDisponivelError,
    );
  });
});

// --- gerarListaCheckpoint -------------------------------------------------------

function jsonExercicios(n: number, marca = "x"): string {
  return JSON.stringify({
    exercicios: Array.from({ length: n }, (_, i) => ({
      enunciado: `Enunciado ${i} ${marca}`,
      resposta: `Resposta ${i} ${marca}`,
    })),
  });
}

function pontoDe(
  topicos: Array<{ id: string; titulo?: string; manual?: boolean }>,
): CheckpointPlanejado {
  return {
    id: "d14",
    diasAntes: 14,
    data: "2026-04-06",
    topicos: topicos.map((t) => ({
      id: t.id,
      titulo: t.titulo ?? `Titulo ${t.id}`,
      manual: t.manual ?? false,
    })),
  };
}

const textoDe = async (id: string): Promise<string | null> =>
  `CONTEUDO<${id}> texto do documento ${id}.`;

describe("gerarListaCheckpoint", () => {
  it("caminho feliz: 1 chamada, 8 exercícios, tópicos e ignorados corretos", async () => {
    const gerar = vi.fn(async () => jsonExercicios(8));
    const aoProgresso = vi.fn();
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }, { id: "b" }]),
      carregarTexto: textoDe,
      gerar,
      aoProgresso,
      agora: AGORA,
    });
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(gerar.mock.calls[0]).toHaveLength(2);
    expect((gerar.mock.calls[0] as unknown[])[1]).toBe("json");
    expect(r.id).toBe("d14");
    expect(r.geradoEm).toBe(AGORA);
    expect(r.exercicios).toHaveLength(8);
    expect(r.exercicios.every((e) => e.modo === "mista")).toBe(true);
    expect(r.pedido).toBe(8);
    expect(r.topicos).toEqual([
      { id: "a", titulo: "Titulo a" },
      { id: "b", titulo: "Titulo b" },
    ]);
    expect(r.ignorados).toEqual([]);
    expect("concluidoEm" in r).toBe(false);
    // aoProgresso repassado (chamado ao menos uma vez pelo caminho curto).
    expect(aoProgresso).toHaveBeenCalledWith(8, 8);
  });

  it("tópico manual é ignorado com motivo e não é lido", async () => {
    const carregarTexto = vi.fn(textoDe);
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }, { id: "manual:x-0", manual: true }]),
      carregarTexto,
      gerar: async () => jsonExercicios(8),
      agora: AGORA,
    });
    expect(carregarTexto).toHaveBeenCalledTimes(1);
    expect(r.topicos.map((t) => t.id)).toEqual(["a"]);
    expect(r.ignorados).toEqual([
      { id: "manual:x-0", titulo: "Titulo manual:x-0", motivo: "manual" },
    ]);
  });

  it("documento sem texto vira sem_texto; carregarTexto lançando também", async () => {
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }, { id: "vazio" }, { id: "quebra" }, { id: "nulo" }]),
      carregarTexto: async (id) => {
        if (id === "vazio") return "   \n ";
        if (id === "quebra") throw new Error("EACCES");
        if (id === "nulo") return null;
        return textoDe(id);
      },
      gerar: async () => jsonExercicios(8),
      agora: AGORA,
    });
    expect(r.topicos.map((t) => t.id)).toEqual(["a"]);
    expect(r.ignorados.map((t) => [t.id, t.motivo])).toEqual([
      ["vazio", "sem_texto"],
      ["quebra", "sem_texto"],
      ["nulo", "sem_texto"],
    ]);
  });

  it("todos manuais/sem texto ⇒ CheckpointIndisponivelError e a IA não é chamada", async () => {
    const gerar = vi.fn(async () => jsonExercicios(8));
    await expect(
      gerarListaCheckpoint({
        checkpoint: pontoDe([{ id: "manual:x-0", manual: true }]),
        carregarTexto: textoDe,
        gerar,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(CheckpointIndisponivelError);
    await expect(
      gerarListaCheckpoint({
        checkpoint: pontoDe([{ id: "a" }]),
        carregarTexto: async () => null,
        gerar,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(CheckpointIndisponivelError);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("texto-base vazio após a montagem ⇒ indisponível e a IA não é chamada", async () => {
    const gerar = vi.fn(async () => jsonExercicios(8));
    // Título gigante: o cabeçalho consome todo o orçamento da seção.
    await expect(
      gerarListaCheckpoint({
        checkpoint: pontoDe([{ id: "a", titulo: "T".repeat(CHECKPOINT_TEXTO_MAX + 10) }]),
        carregarTexto: textoDe,
        gerar,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(CheckpointIndisponivelError);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("geração parcial (5 de 8) é persistível com pedido = 8", async () => {
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }]),
      carregarTexto: textoDe,
      gerar: async () => jsonExercicios(5),
      agora: AGORA,
    });
    expect(r.exercicios).toHaveLength(5);
    expect(r.pedido).toBe(8);
  });

  it("menos de 3 exercícios ⇒ CheckpointInsuficienteError", async () => {
    const erro = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }]),
      carregarTexto: textoDe,
      gerar: async () => jsonExercicios(2),
      agora: AGORA,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(CheckpointInsuficienteError);
    expect(mensagemAmigavelCheckpoint(erro)).toBe(
      "Só consegui montar 2 exercícios, poucos para uma lista. Tente novamente em instantes.",
    );
  });

  it("JSON ruim 2× ⇒ ExerciciosInvalidosError; a corretiva recupera", async () => {
    const ruim = vi.fn(async () => "isto não é json");
    await expect(
      gerarListaCheckpoint({
        checkpoint: pontoDe([{ id: "a" }]),
        carregarTexto: textoDe,
        gerar: ruim,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(ExerciciosInvalidosError);
    expect(ruim).toHaveBeenCalledTimes(2);

    const corretiva = vi
      .fn<(p: string, f?: string) => Promise<string>>()
      .mockResolvedValueOnce("{ quebrado")
      .mockResolvedValueOnce(jsonExercicios(8));
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }]),
      carregarTexto: textoDe,
      gerar: corretiva,
      agora: AGORA,
    });
    expect(corretiva).toHaveBeenCalledTimes(2);
    expect(r.exercicios).toHaveLength(8);
  });

  it("o prompt traz as seções esperadas e o texto-base respeita o teto", async () => {
    const prompts: string[] = [];
    const gerar = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return jsonExercicios(8);
    });
    const longo = async (id: string): Promise<string | null> =>
      `CONTEUDO<${id}> ` + "palavra ".repeat(20000);
    await gerarListaCheckpoint({
      checkpoint: pontoDe([{ id: "a" }, { id: "b" }, { id: "c" }]),
      carregarTexto: longo,
      gerar,
      agora: AGORA,
    });
    const prompt = prompts[0];
    for (const id of ["a", "b", "c"]) {
      expect(prompt).toContain(`## Titulo ${id}`);
      expect(prompt).toContain(`CONTEUDO<${id}>`);
    }
    // O texto-base está contido no prompt e nunca passa do teto.
    const inicio = prompt.indexOf("## Titulo a");
    const fim = prompt.lastIndexOf("palavra") + "palavra".length;
    expect(fim - inicio).toBeLessThanOrEqual(CHECKPOINT_TEXTO_MAX);
  });

  it("mais de 6 assuntos ⇒ amostra de 6 e o resto fora_da_amostra", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}` }));
    const r = await gerarListaCheckpoint({
      checkpoint: pontoDe(ids),
      carregarTexto: textoDe,
      gerar: async () => jsonExercicios(8),
      agora: AGORA,
    });
    expect(r.topicos).toHaveLength(6);
    expect(r.ignorados).toHaveLength(3);
    expect(r.ignorados.every((i) => i.motivo === "fora_da_amostra")).toBe(true);
  });

  it("erros do Ollama propagam como estão", async () => {
    await expect(
      gerarListaCheckpoint({
        checkpoint: pontoDe([{ id: "a" }]),
        carregarTexto: textoDe,
        gerar: async () => {
          throw new OllamaIndisponivelError();
        },
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(OllamaIndisponivelError);
  });
});

// --- mensagemAmigavelCheckpoint -----------------------------------------------------

describe("mensagemAmigavelCheckpoint", () => {
  it("só OllamaIndisponivelError fala em offline", () => {
    const m = mensagemAmigavelCheckpoint(new OllamaIndisponivelError());
    expect(m).toMatch(/Ollama não está rodando/);
  });

  it("falha de geração não repassa 'reduza a quantidade' nem diz offline", () => {
    const m = mensagemAmigavelCheckpoint(new GeracaoFalhouError());
    expect(m).toBe(
      "A geração da lista de exercícios falhou ou demorou demais. Tente novamente ou use um modelo mais leve.",
    );
    expect(m).not.toMatch(/reduza a quantidade|offline/i);
  });

  it("JSON inválido tem frase própria", () => {
    expect(mensagemAmigavelCheckpoint(new ExerciciosInvalidosError())).toBe(
      "Não consegui montar a lista de exercícios agora. Tente novamente.",
    );
  });

  it("SemTextoParaExerciciosError ⇒ mensagem de indisponível", () => {
    expect(mensagemAmigavelCheckpoint(new SemTextoParaExerciciosError())).toBe(
      new CheckpointIndisponivelError().message,
    );
  });

  it("classes tipadas devolvem a própria mensagem", () => {
    for (const e of [
      new CheckpointIndisponivelError(),
      new CheckpointInsuficienteError(1),
      new CheckpointNaoDisponivelError("Esta lista já foi concluída."),
      new CheckpointEmAndamentoError(),
      new DadosProvaInvalidosError("Escolha automático ou lembrete."),
      new ProvaNaoEncontradaError("x"),
    ]) {
      expect(mensagemAmigavelCheckpoint(e)).toBe(e.message);
    }
    expect(new CheckpointEmAndamentoError().message).toBe(
      "Já estou preparando uma lista desta prova.",
    );
  });

  it("desconhecido ⇒ frase genérica; total (não lança)", () => {
    const generica = "Não foi possível preparar a lista. Tente novamente.";
    expect(mensagemAmigavelCheckpoint(new Error("boom"))).toBe(generica);
    expect(mensagemAmigavelCheckpoint(undefined)).toBe(generica);
    expect(mensagemAmigavelCheckpoint("texto")).toBe(generica);
    expect(mensagemAmigavelCheckpoint(null)).toBe(generica);
  });
});
