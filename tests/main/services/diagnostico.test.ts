import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { assinaturaPlano } from "@shared/diagnostico";
import type { PlanoEstudo, TopicoPlano } from "@shared/types";

// `diagnostico.ts` importa `provas.ts`, que importa `app` do Electron só para o
// diretório default. Nenhuma função de disco é chamada aqui.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

const {
  DiagnosticoEmAndamentoError,
  DiagnosticoIndisponivelError,
  DiagnosticoInsuficienteError,
  gerarDiagnostico,
  mensagemAmigavelDiagnostico,
} = await import("../../../src/main/services/diagnostico.js");
const { GeracaoFalhouError, OllamaIndisponivelError } = await import(
  "../../../src/main/services/ollama.js"
);
const { DadosProvaInvalidosError, ProvaNaoEncontradaError } = await import(
  "../../../src/main/services/provas.js"
);

const AGORA = "2026-03-10T12:00:00.000Z";

function topico(id: string, novo: boolean): TopicoPlano {
  return { id, titulo: `Titulo ${id}`, novo };
}

function planoDe(topicos: TopicoPlano[]): PlanoEstudo {
  return {
    ordinal: "segunda",
    horasPorDia: 2,
    diasPorSemana: 5,
    topicos,
    checkpoint: "lembrete",
    atualizadoEm: AGORA,
  };
}

/** JSON de `n` perguntas de múltipla escolha; a 1ª alternativa é a correta. */
function jsonPerguntas(n: number, marca: string, extra: object = {}): string {
  return JSON.stringify({
    perguntas: Array.from({ length: n }, (_, i) => ({
      tipo: "multipla",
      enunciado: `Pergunta ${i} sobre ${marca}?`,
      alternativas: [
        { texto: "certa", correta: true },
        { texto: "errada", correta: false },
        { texto: "outra", correta: false },
      ],
      ...extra,
    })),
  });
}

/** Texto do tópico: contém a marca para o mock identificá-lo no prompt. */
const textoDe = (id: string): string => `MARCA<${id}> conteudo do documento ${id}.`;

/** Descobre de qual tópico é o prompt pela marca no texto. */
function marcaDoPrompt(prompt: string): string | undefined {
  return /MARCA<([^>]+)>/.exec(prompt)?.[1];
}

const todosTemTexto = async (id: string): Promise<string | null> => textoDe(id);

describe("gerarDiagnostico — caminho feliz", () => {
  const plano = planoDe([
    topico("b1", false),
    topico("b2", false),
    topico("n1", true),
  ]);

  it("rotula pelo plano (não pela IA), 3 por tópico, base antes de novo, progresso e assinatura", async () => {
    const gerar = vi.fn(async (prompt: string) => {
      const marca = marcaDoPrompt(prompt) ?? "?";
      // A IA tenta forjar o rótulo: o resultado deve ignorá-lo.
      return jsonPerguntas(5, marca, { camada: "novo", topicoId: "forjado" });
    });
    const progresso: Array<[number, number]> = [];
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      aoProgresso: (a, b) => progresso.push([a, b]),
      agora: AGORA,
    });

    expect(d.perguntas).toHaveLength(9);
    expect(d.perguntas.map((p) => `${p.topicoId}:${p.camada}`)).toEqual([
      "b1:base",
      "b1:base",
      "b1:base",
      "b2:base",
      "b2:base",
      "b2:base",
      "n1:novo",
      "n1:novo",
      "n1:novo",
    ]);
    expect(d.pedido).toBe(9);
    expect(d.ignorados).toEqual([]);
    expect(d.assinatura).toBe(assinaturaPlano(plano));
    expect(d.geradoEm).toBe(AGORA);
    expect("respostas" in d).toBe(false);
    expect(progresso).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    // 1 chamada por tópico (caminho curto, sem corretiva nem condensação).
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("texto enorme é cortado: nenhum prompt de condensação", async () => {
    const enorme = (id: string) => `MARCA<${id}> ` + "x".repeat(50_000);
    const gerar = vi.fn(async (prompt: string) =>
      jsonPerguntas(5, marcaDoPrompt(prompt) ?? "?"),
    );
    await gerarDiagnostico({
      plano,
      carregarTexto: async (id) => enorme(id),
      gerar,
      agora: AGORA,
    });
    expect(gerar).toHaveBeenCalledTimes(3);
    for (const [prompt] of gerar.mock.calls) {
      expect(prompt.length).toBeLessThan(20_000);
    }
  });
});

describe("gerarDiagnostico — tópicos sem texto", () => {
  it("tópico manual é ignorado com motivo 'manual' (sem chamar carregarTexto)", async () => {
    const plano = planoDe([
      topico("b1", false),
      topico("manual:x-1", false),
      topico("n1", true),
    ]);
    const carregar = vi.fn(todosTemTexto);
    const gerar = vi.fn(async (p: string) =>
      jsonPerguntas(5, marcaDoPrompt(p) ?? "?"),
    );
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: carregar,
      gerar,
      agora: AGORA,
    });
    expect(d.ignorados).toEqual([
      { id: "manual:x-1", titulo: "Titulo manual:x-1", motivo: "manual" },
    ]);
    expect(carregar).not.toHaveBeenCalledWith("manual:x-1");
    expect(d.pedido).toBe(6);
  });

  it("documento ausente (null) e carregarTexto que rejeita ⇒ 'sem_texto'", async () => {
    const plano = planoDe([
      topico("b1", false),
      topico("b2", false),
      topico("n1", true),
      topico("n2", true),
    ]);
    const gerar = vi.fn(async (p: string) =>
      jsonPerguntas(5, marcaDoPrompt(p) ?? "?"),
    );
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: async (id) => {
        if (id === "n1") return null;
        if (id === "n2") throw new Error("EACCES");
        return textoDe(id);
      },
      gerar,
      agora: AGORA,
    });
    expect(d.ignorados.map((i) => [i.id, i.motivo])).toEqual([
      ["n1", "sem_texto"],
      ["n2", "sem_texto"],
    ]);
    expect(d.perguntas.every((p) => p.camada === "base")).toBe(true);
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("texto só com espaços conta como sem texto", async () => {
    const plano = planoDe([topico("b1", false), topico("b2", false)]);
    const gerar = vi.fn(async (p: string) =>
      jsonPerguntas(5, marcaDoPrompt(p) ?? "?"),
    );
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: async (id) => (id === "b2" ? "   \n " : textoDe(id)),
      gerar,
      agora: AGORA,
    });
    expect(d.ignorados.map((i) => [i.id, i.motivo])).toEqual([
      ["b2", "sem_texto"],
    ]);
  });

  it("sem base com texto ⇒ Indisponível e gerar nunca é chamado", async () => {
    const plano = planoDe([
      topico("manual:a-0", false),
      topico("b1", false),
      topico("n1", true),
    ]);
    const gerar = vi.fn(async () => "{}");
    await expect(
      gerarDiagnostico({
        plano,
        carregarTexto: async (id) => (id === "b1" ? null : textoDe(id)),
        gerar,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(DiagnosticoIndisponivelError);
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe("gerarDiagnostico — geração parcial e inválida", () => {
  it("tópico com 2 perguntas ⇒ válido, pedido > perguntas", async () => {
    const plano = planoDe([topico("b1", false), topico("b2", false)]);
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p) ?? "?";
      return jsonPerguntas(marca === "b2" ? 2 : 5, marca);
    });
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    });
    expect(d.perguntas).toHaveLength(5);
    expect(d.pedido).toBe(6);
    expect(d.pedido).toBeGreaterThan(d.perguntas.length);
  });

  it("lixo duas vezes num tópico ⇒ 'nao_gerou', demais seguem", async () => {
    const plano = planoDe([
      topico("b1", false),
      topico("b2", false),
      topico("n1", true),
    ]);
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p);
      // a corretiva não repete o texto-base: sem marca ⇒ lixo também.
      return marca === undefined || marca === "n1"
        ? "isto não é json"
        : jsonPerguntas(5, marca);
    });
    // A corretiva do tópico n1 não tem marca (lixo) e a do b1/b2 nem ocorre.
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    });
    expect(d.ignorados).toEqual([
      { id: "n1", titulo: "Titulo n1", motivo: "nao_gerou" },
    ]);
    expect(d.perguntas).toHaveLength(6);
    // n1: 1ª tentativa + 1 corretiva.
    expect(gerar).toHaveBeenCalledTimes(4);
  });

  it("só perguntas abertas ⇒ 'nao_gerou'", async () => {
    const plano = planoDe([
      topico("b1", false),
      topico("b2", false),
      topico("n1", true),
    ]);
    const abertas = JSON.stringify({
      perguntas: [
        { tipo: "aberta", enunciado: "Explique?", gabarito: "porque" },
      ],
    });
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p);
      // A corretiva não repete o texto-base (sem marca): também só abertas.
      return marca === undefined || marca === "n1"
        ? abertas
        : jsonPerguntas(5, marca);
    });
    const d = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    });
    expect(d.ignorados.map((i) => [i.id, i.motivo])).toEqual([
      ["n1", "nao_gerou"],
    ]);
  });

  it("base com < 3 perguntas ⇒ Insuficiente e gerar só nos tópicos de base", async () => {
    const plano = planoDe([
      topico("b1", false),
      topico("b2", false),
      topico("n1", true),
      topico("n2", true),
    ]);
    const marcas: string[] = [];
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p) ?? "?";
      marcas.push(marca);
      return jsonPerguntas(1, marca); // 1 por tópico ⇒ base = 2 < 3
    });
    await expect(
      gerarDiagnostico({
        plano,
        carregarTexto: todosTemTexto,
        gerar,
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(DiagnosticoInsuficienteError);
    expect(marcas).toEqual(["b1", "b2"]);
  });
});

describe("gerarDiagnostico — erros do Ollama", () => {
  const plano = planoDe([
    topico("b1", false),
    topico("b2", false),
    topico("b3", false),
    topico("n1", true),
  ]);

  it("offline no 1º tópico propaga", async () => {
    const gerar = vi.fn(async () => {
      throw new OllamaIndisponivelError();
    });
    await expect(
      gerarDiagnostico({ plano, carregarTexto: todosTemTexto, gerar, agora: AGORA }),
    ).rejects.toBeInstanceOf(OllamaIndisponivelError);
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("offline no meio propaga, mesmo com perguntas acumuladas", async () => {
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p) ?? "?";
      if (marca === "b2") throw new OllamaIndisponivelError();
      return jsonPerguntas(5, marca);
    });
    await expect(
      gerarDiagnostico({ plano, carregarTexto: todosTemTexto, gerar, agora: AGORA }),
    ).rejects.toBeInstanceOf(OllamaIndisponivelError);
  });

  it("GeracaoFalhouError no 1º propaga (e não é 'offline')", async () => {
    const gerar = vi.fn(async () => {
      throw new GeracaoFalhouError();
    });
    const erro = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(GeracaoFalhouError);
    expect(erro).not.toBeInstanceOf(OllamaIndisponivelError);
    expect(mensagemAmigavelDiagnostico(erro)).not.toMatch(/offline|rodando/i);
  });

  it("falha no 3º de 4 tópicos com base ≥ 3 ⇒ parcial; 3º e 4º em 'nao_gerou'", async () => {
    const quatro = planoDe([
      topico("b1", false),
      topico("b2", false),
      topico("b3", false),
      topico("n1", true),
    ]);
    // Falha no 3º (b3): base acumulada = 6 (b1, b2) ⇒ válido.
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p) ?? "?";
      if (marca === "b3") throw new GeracaoFalhouError();
      return jsonPerguntas(5, marca);
    });
    const d = await gerarDiagnostico({
      plano: quatro,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    });
    expect(d.perguntas).toHaveLength(6);
    expect(d.perguntas.every((p) => p.camada === "base")).toBe(true);
    expect(d.ignorados.map((i) => [i.id, i.motivo])).toEqual([
      ["b3", "nao_gerou"],
      ["n1", "nao_gerou"],
    ]);
    expect(d.pedido).toBe(12);
    expect(d.pedido).toBeGreaterThan(d.perguntas.length);
    // Nada foi chamado depois da falha.
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("falha no 2º com base < 3 ⇒ relança o GeracaoFalhouError original", async () => {
    const gerar = vi.fn(async (p: string) => {
      const marca = marcaDoPrompt(p) ?? "?";
      if (marca === "b2") throw new GeracaoFalhouError();
      return jsonPerguntas(2, marca); // base = 2 < 3
    });
    const erro = await gerarDiagnostico({
      plano,
      carregarTexto: todosTemTexto,
      gerar,
      agora: AGORA,
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(GeracaoFalhouError);
  });
});

describe("mensagemAmigavelDiagnostico", () => {
  it("mapeia cada tipo de erro para o texto exato", () => {
    const off = new OllamaIndisponivelError();
    expect(mensagemAmigavelDiagnostico(off)).toBe(off.message);
    expect(mensagemAmigavelDiagnostico(new GeracaoFalhouError())).toBe(
      "A geração das perguntas falhou ou demorou demais. Tente novamente ou use um modelo mais leve.",
    );
    const indisp = new DiagnosticoIndisponivelError();
    expect(mensagemAmigavelDiagnostico(indisp)).toBe(indisp.message);
    expect(indisp.message).toContain("ao menos um assunto de base");
    expect(mensagemAmigavelDiagnostico(new DiagnosticoInsuficienteError())).toBe(
      "Não consegui montar perguntas suficientes sobre a base. Tente de novo em instantes.",
    );
    expect(mensagemAmigavelDiagnostico(new DiagnosticoEmAndamentoError())).toBe(
      "Já estou preparando o diagnóstico desta prova.",
    );
    expect(mensagemAmigavelDiagnostico(new DadosProvaInvalidosError("frase"))).toBe(
      "frase",
    );
    const nao = new ProvaNaoEncontradaError("x");
    expect(mensagemAmigavelDiagnostico(nao)).toBe(nao.message);
  });

  it("qualquer outra coisa vira a mensagem genérica, sem lançar", () => {
    const generica = "Não foi possível preparar o diagnóstico. Tente novamente.";
    expect(mensagemAmigavelDiagnostico(new Error("boom"))).toBe(generica);
    expect(mensagemAmigavelDiagnostico("texto")).toBe(generica);
    expect(mensagemAmigavelDiagnostico(undefined)).toBe(generica);
    expect(mensagemAmigavelDiagnostico(null)).toBe(generica);
  });

  it("só a mensagem de offline menciona offline/Ollama; a de falha nunca fala em quantidade", () => {
    const falha = mensagemAmigavelDiagnostico(new GeracaoFalhouError());
    expect(falha).not.toMatch(/offline|quantidade/i);
  });
});
