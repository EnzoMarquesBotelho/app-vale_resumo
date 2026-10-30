import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { VisaoCheckpoints } from "@shared/checkpoints";
import { assinaturaPlano } from "@shared/diagnostico";
import type { PlanoEstudo, Prova } from "@shared/types";

/** Captura os handlers registrados via ipcMain.handle para inspeção. */
const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();
const fromWebContents = vi.fn(() => undefined as unknown);
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => {
      registered.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => "/tmp") },
  BrowserWindow: {
    fromWebContents: (...a: unknown[]) => fromWebContents(...(a as [])),
  },
}));

// Serviço de provas mockado: o teste valida a fiação do handler e a conversão
// de erro em mensagem amigável (persistência é coberta em provas-checkpoints).
const carregarProva = vi.fn();
const salvarCheckpoint = vi.fn();
const concluirCheckpoint = vi.fn();
const definirPreferenciaCheckpoint = vi.fn();
vi.mock("../../src/main/services/provas.js", () => ({
  ProvaNaoEncontradaError: class ProvaNaoEncontradaError extends Error {
    readonly code = "PROVA_NAO_ENCONTRADA" as const;
    constructor() {
      super("Prova não encontrada. Ela pode ter sido removida.");
      this.name = "ProvaNaoEncontradaError";
    }
  },
  DadosProvaInvalidosError: class DadosProvaInvalidosError extends Error {
    readonly code = "DADOS_PROVA_INVALIDOS" as const;
    constructor(message: string) {
      super(message);
      this.name = "DadosProvaInvalidosError";
    }
  },
  hojeLocal: () => "2026-03-25",
  carregarProva: (...args: unknown[]) => carregarProva(...args),
  salvarCheckpoint: (...args: unknown[]) => salvarCheckpoint(...args),
  concluirCheckpoint: (...args: unknown[]) => concluirCheckpoint(...args),
  definirPreferenciaCheckpoint: (...args: unknown[]) =>
    definirPreferenciaCheckpoint(...args),
}));

const carregarDocumento = vi.fn();
vi.mock("../../src/main/services/storage.js", () => ({
  DocumentoNaoEncontradoError: class DocumentoNaoEncontradoError extends Error {},
  carregarDocumento: (...args: unknown[]) => carregarDocumento(...args),
  criarDocumento: vi.fn(),
  listarCadernos: vi.fn(),
  listarDocumentos: vi.fn(),
  removerDocumento: vi.fn(),
  salvarExercicios: vi.fn(),
  salvarFlashcards: vi.fn(),
  salvarMapaMental: vi.fn(),
  salvarQuiz: vi.fn(),
  salvarResumo: vi.fn(),
}));

// Ollama SEMPRE mockado.
const generate = vi.fn();
const listModels = vi.fn();
vi.mock("../../src/main/services/ollama.js", () => ({
  OllamaIndisponivelError: class OllamaIndisponivelError extends Error {
    readonly code = "OLLAMA_INDISPONIVEL" as const;
    constructor() {
      super("O Ollama não está rodando. Inicie o Ollama e tente novamente.");
      this.name = "OllamaIndisponivelError";
    }
  },
  GeracaoFalhouError: class GeracaoFalhouError extends Error {
    readonly code = "GERACAO_FALHOU" as const;
    constructor() {
      super(
        "A geração falhou ou demorou demais. Tente novamente, reduza a " +
          "quantidade, ou use um modelo mais leve.",
      );
      this.name = "GeracaoFalhouError";
    }
  },
  generate: (...args: unknown[]) => generate(...args),
  isOllamaRunning: vi.fn(async () => true),
  listModels: (...args: unknown[]) => listModels(...args),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";
import {
  GeracaoFalhouError,
  OllamaIndisponivelError,
} from "../../src/main/services/ollama.js";
import { DadosProvaInvalidosError } from "../../src/main/services/provas.js";

const evento = { sender: {} } as unknown as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

// Com este plano (salvo em 2026-03-01, prova em 2026-03-30) e hoje = 03-25:
// d14 = [b1] atrasado, d7 = [b2] atrasado, d3 = [n1] futuro.
const plano: PlanoEstudo = {
  ordinal: "segunda",
  horasPorDia: 2,
  diasPorSemana: 5,
  topicos: [
    { id: "b1", titulo: "B1", novo: false },
    { id: "b2", titulo: "B2", novo: false },
    { id: "n1", titulo: "N1", novo: true },
  ],
  checkpoint: "lembrete",
  atualizadoEm: new Date(2026, 2, 1, 12).toISOString(),
};

function provaDe(p?: PlanoEstudo): Prova {
  return {
    id: "p1",
    titulo: "Prova",
    data: "2026-03-30",
    vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" },
    intervalos: [7, 3, 1],
    sessoes: [],
    criadoEm: "2026-03-01T00:00:00.000Z",
    atualizadoEm: "2026-03-01T00:00:00.000Z",
    ...(p !== undefined ? { plano: p } : {}),
  };
}

const exerciciosJson = (n: number): string =>
  JSON.stringify({
    exercicios: Array.from({ length: n }, (_, i) => ({
      enunciado: `Enunciado ${i}`,
      resposta: `Resposta ${i}`,
    })),
  });

beforeEach(() => {
  registered.clear();
  for (const m of [
    carregarProva,
    salvarCheckpoint,
    concluirCheckpoint,
    definirPreferenciaCheckpoint,
    carregarDocumento,
    generate,
    listModels,
    fromWebContents,
  ]) {
    m.mockReset();
  }
  fromWebContents.mockReturnValue(undefined);
  listModels.mockResolvedValue([]);
  carregarDocumento.mockImplementation(async (id: string) => ({
    texto: `texto do documento ${id}`,
  }));
  carregarProva.mockResolvedValue(provaDe(plano));
  salvarCheckpoint.mockImplementation(
    async (_id: string, assinatura: string, item: { id: string }) => ({
      ...provaDe(plano),
      checkpoints: { assinatura, itens: [item] },
    }),
  );
  registerIpcHandlers();
});

describe("IPC checkpoints: registro", () => {
  it("registra os quatro canais", () => {
    expect(IPC_CHANNELS.calcularCheckpoints).toBe("prova:calcular-checkpoints");
    for (const c of [
      IPC_CHANNELS.calcularCheckpoints,
      IPC_CHANNELS.gerarCheckpoint,
      IPC_CHANNELS.concluirCheckpoint,
      IPC_CHANNELS.definirPreferenciaCheckpoint,
    ]) {
      expect(registered.has(c)).toBe(true);
    }
  });
});

describe("IPC calcularCheckpoints", () => {
  it("devolve a visão com hoje fixo", async () => {
    const v = (await chamar(IPC_CHANNELS.calcularCheckpoints, "p1")) as VisaoCheckpoints;
    expect(v.hoje).toBe("2026-03-25");
    expect(v.diasRestantes).toBe(5);
    expect(v.itens.map((i) => [i.id, i.estado])).toEqual([
      ["d14", "atrasado"],
      ["d7", "atrasado"],
      ["d3", "futuro"],
    ]);
    expect(v.emGeracao).toBeUndefined();
    expect(carregarProva).toHaveBeenCalledWith("p1");
  });

  it("não chama a IA nem grava nada", async () => {
    await chamar(IPC_CHANNELS.calcularCheckpoints, "p1");
    expect(generate).not.toHaveBeenCalled();
    expect(salvarCheckpoint).not.toHaveBeenCalled();
  });

  it("prova inexistente vira mensagem amigável", async () => {
    const { ProvaNaoEncontradaError } = await import(
      "../../src/main/services/provas.js"
    );
    carregarProva.mockRejectedValue(new ProvaNaoEncontradaError("x"));
    await expect(chamar(IPC_CHANNELS.calcularCheckpoints, "zz")).rejects.toThrow(
      "Prova não encontrada",
    );
  });

  it("durante a geração a visão traz emGeracao", async () => {
    let liberar: (v: string) => void = () => {};
    generate.mockImplementationOnce(
      () => new Promise<string>((resolve) => (liberar = resolve)),
    );
    const geracao = chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const v = (await chamar(IPC_CHANNELS.calcularCheckpoints, "p1")) as VisaoCheckpoints;
    expect(v.emGeracao).toBe("d7");
    liberar(exerciciosJson(8));
    await geracao;
    const depois = (await chamar(IPC_CHANNELS.calcularCheckpoints, "p1")) as VisaoCheckpoints;
    expect(depois.emGeracao).toBeUndefined();
  });
});

describe("IPC gerarCheckpoint", () => {
  it("gera, persiste com a assinatura capturada e devolve a prova", async () => {
    generate.mockResolvedValue(exerciciosJson(8));
    const prova = (await chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")) as Prova;
    expect(salvarCheckpoint).toHaveBeenCalledTimes(1);
    const [id, assinatura, lista] = salvarCheckpoint.mock.calls[0];
    expect(id).toBe("p1");
    expect(assinatura).toBe(assinaturaPlano(plano));
    expect(lista.id).toBe("d7");
    expect(lista.exercicios).toHaveLength(8);
    expect(lista.topicos).toEqual([{ id: "b2", titulo: "B2" }]);
    expect(prova.checkpoints?.itens[0].id).toBe("d7");
    // Geração estruturada: sempre format "json".
    for (const [params] of generate.mock.calls) {
      expect((params as { format?: string }).format).toBe("json");
    }
    expect(carregarDocumento).toHaveBeenCalledWith("b2");
  });

  it("empurra progresso com artefato 'checkpoint'", async () => {
    const send = vi.fn();
    fromWebContents.mockReturnValue({
      webContents: { send, isDestroyed: () => false },
    });
    generate.mockResolvedValue(exerciciosJson(8));
    await chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7");
    expect(send).toHaveBeenCalled();
    const [canal, payload] = send.mock.calls[0];
    expect(canal).toBe(IPC_CHANNELS.geracao.progresso);
    expect(payload).toMatchObject({ artefato: "checkpoint" });
  });

  it("guarda de duplo clique: 2ª chamada é recusada e a guarda é liberada no finally", async () => {
    let liberar: (v: string) => void = () => {};
    generate.mockImplementationOnce(
      () => new Promise<string>((resolve) => (liberar = resolve)),
    );
    generate.mockResolvedValue(exerciciosJson(8));

    const primeira = chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d14")).rejects.toThrow(
      "Já estou preparando uma lista desta prova.",
    );
    liberar(exerciciosJson(8));
    await primeira;
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d14")).resolves.toBeDefined();
  });

  it("a guarda também é liberada quando a geração falha", async () => {
    generate.mockRejectedValueOnce(new GeracaoFalhouError());
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow();
    generate.mockResolvedValue(exerciciosJson(8));
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).resolves.toBeDefined();
  });

  it("a guarda é liberada quando o estado é rejeitado antes da IA", async () => {
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d3")).rejects.toThrow();
    generate.mockResolvedValue(exerciciosJson(8));
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).resolves.toBeDefined();
  });

  it("estado futuro é rejeitado com a data e a IA não é chamada", async () => {
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d3")).rejects.toThrow(
      "Esta lista só fica disponível em 27/03.",
    );
    expect(generate).not.toHaveBeenCalled();
    expect(salvarCheckpoint).not.toHaveBeenCalled();
  });

  it("id inválido ou desconhecido é rejeitado", async () => {
    for (const ruim of ["x", "d0", "", "d14; DROP", 14, undefined, "d99"]) {
      await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", ruim)).rejects.toThrow(
        "Não encontrei esse checkpoint no plano atual.",
      );
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("prova sem plano ⇒ mensagem própria e a IA não é chamada", async () => {
    carregarProva.mockResolvedValue(provaDe());
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow(
      "Monte o plano de estudo antes de preparar os checkpoints.",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("falha de geração sai com a frase da lista, nunca 'offline' nem 'quantidade'", async () => {
    generate.mockRejectedValue(new GeracaoFalhouError());
    const erro = (await chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7").catch(
      (e: unknown) => e,
    )) as Error;
    expect(erro.message).toBe(
      "A geração da lista de exercícios falhou ou demorou demais. Tente novamente ou use um modelo mais leve.",
    );
    expect(erro.message).not.toMatch(/offline|quantidade/i);
    expect(salvarCheckpoint).not.toHaveBeenCalled();
  });

  it("Ollama offline mantém a mensagem de offline", async () => {
    generate.mockRejectedValue(new OllamaIndisponivelError());
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow(
      "O Ollama não está rodando",
    );
  });

  it("documento ilegível ⇒ indisponível, sem derrubar e sem chamar a IA", async () => {
    carregarDocumento.mockRejectedValue(new Error("EACCES"));
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow(
      "ao menos um assunto com material importado",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("plano mudou durante a geração: o erro do save vira mensagem amigável", async () => {
    generate.mockResolvedValue(exerciciosJson(8));
    salvarCheckpoint.mockRejectedValue(
      new DadosProvaInvalidosError(
        "Os assuntos do plano mudaram enquanto eu preparava a lista. Tente de novo.",
      ),
    );
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow(
      "Os assuntos do plano mudaram enquanto eu preparava a lista.",
    );
  });

  it("vários vencidos: dois gerarCheckpoint sequenciais gravam os dois itens", async () => {
    generate.mockResolvedValue(exerciciosJson(8));
    await chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d14");
    await chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7");
    expect(salvarCheckpoint).toHaveBeenCalledTimes(2);
    expect(salvarCheckpoint.mock.calls.map((c) => c[2].id)).toEqual(["d14", "d7"]);
  });

  it("lista pronta pode ser regerada (estado pronto aceito)", async () => {
    const base = provaDe(plano);
    base.checkpoints = {
      assinatura: assinaturaPlano(plano),
      itens: [
        {
          id: "d7",
          geradoEm: "2026-03-24T10:00:00.000Z",
          topicos: [{ id: "b2", titulo: "B2" }],
          ignorados: [],
          pedido: 8,
          exercicios: Array.from({ length: 8 }, () => ({
            enunciado: "e",
            resposta: "r",
            modo: "mista" as const,
          })),
        },
      ],
    };
    carregarProva.mockResolvedValue(base);
    generate.mockResolvedValue(exerciciosJson(8));
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).resolves.toBeDefined();
    expect(salvarCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("lista concluída não pode ser regerada", async () => {
    const base = provaDe(plano);
    base.checkpoints = {
      assinatura: assinaturaPlano(plano),
      itens: [
        {
          id: "d7",
          geradoEm: "2026-03-24T10:00:00.000Z",
          concluidoEm: "2026-03-24T11:00:00.000Z",
          topicos: [{ id: "b2", titulo: "B2" }],
          ignorados: [],
          pedido: 8,
          exercicios: Array.from({ length: 8 }, () => ({
            enunciado: "e",
            resposta: "r",
            modo: "mista" as const,
          })),
        },
      ],
    };
    carregarProva.mockResolvedValue(base);
    await expect(chamar(IPC_CHANNELS.gerarCheckpoint, "p1", "d7")).rejects.toThrow(
      "Esta lista já foi concluída.",
    );
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("IPC concluirCheckpoint", () => {
  it("delega ao serviço com o id e devolve a prova", async () => {
    const retorno = provaDe(plano);
    concluirCheckpoint.mockResolvedValue(retorno);
    const r = await chamar(IPC_CHANNELS.concluirCheckpoint, "p1", "d7");
    expect(r).toBe(retorno);
    expect(concluirCheckpoint.mock.calls[0][0]).toBe("p1");
    expect(concluirCheckpoint.mock.calls[0][1]).toBe("d7");
    expect(typeof concluirCheckpoint.mock.calls[0][2]).toBe("string");
  });

  it("erro do serviço vira a mensagem amigável; id inválido é rejeitado", async () => {
    concluirCheckpoint.mockRejectedValue(
      new DadosProvaInvalidosError("Não encontrei essa lista para marcar como concluída."),
    );
    await expect(chamar(IPC_CHANNELS.concluirCheckpoint, "p1", "d7")).rejects.toThrow(
      "Não encontrei essa lista para marcar como concluída.",
    );
    concluirCheckpoint.mockClear();
    await expect(chamar(IPC_CHANNELS.concluirCheckpoint, "p1", "oops")).rejects.toThrow(
      "Não encontrei esse checkpoint no plano atual.",
    );
    expect(concluirCheckpoint).not.toHaveBeenCalled();
  });
});

describe("IPC definirPreferenciaCheckpoint", () => {
  it("delega ao serviço e devolve a prova", async () => {
    const retorno = provaDe({ ...plano, checkpoint: "automatico" });
    definirPreferenciaCheckpoint.mockResolvedValue(retorno);
    const r = await chamar(IPC_CHANNELS.definirPreferenciaCheckpoint, "p1", "automatico");
    expect(r).toBe(retorno);
    expect(definirPreferenciaCheckpoint.mock.calls[0].slice(0, 2)).toEqual([
      "p1",
      "automatico",
    ]);
  });

  it("valor inválido vira a mensagem amigável do serviço", async () => {
    definirPreferenciaCheckpoint.mockRejectedValue(
      new DadosProvaInvalidosError("Escolha automático ou lembrete."),
    );
    await expect(
      chamar(IPC_CHANNELS.definirPreferenciaCheckpoint, "p1", "xyz"),
    ).rejects.toThrow("Escolha automático ou lembrete.");
  });
});
