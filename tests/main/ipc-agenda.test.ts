import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { Prova } from "@shared/types";

/** Captura os handlers registrados via ipcMain.handle para inspeção. */
const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();

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
}));

// Serviço de provas mockado: o teste de IPC valida o fiação (wiring) e a
// conversão de erro em mensagem amigável, não o acesso a disco (coberto em
// provas.test.ts).
const criarProva = vi.fn();
const listarProvas = vi.fn();
const carregarProva = vi.fn();
const editarProva = vi.fn();
const salvarSessoes = vi.fn();
const regerarAgenda = vi.fn();
const removerProva = vi.fn();

vi.mock("../../src/main/services/provas.js", () => ({
  // Classes de erro reais (o handler usa `instanceof`), definidas DENTRO da
  // factory porque `vi.mock` é içada ao topo do arquivo.
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
  // `hoje` fixo para a dica mecânica ser determinística.
  hojeLocal: () => "2026-03-10",
  criarProva: (...args: unknown[]) => criarProva(...args),
  listarProvas: (...args: unknown[]) => listarProvas(...args),
  carregarProva: (...args: unknown[]) => carregarProva(...args),
  editarProva: (...args: unknown[]) => editarProva(...args),
  salvarSessoes: (...args: unknown[]) => salvarSessoes(...args),
  regerarAgenda: (...args: unknown[]) => regerarAgenda(...args),
  removerProva: (...args: unknown[]) => removerProva(...args),
}));

// Serviço de dica mockado: valida que o handler injeta `gerar` e devolve a
// string; a orquestração do prompt é coberta em prompts/dica.
const gerarDicaIa = vi.fn();
vi.mock("../../src/main/services/dica.js", () => ({
  gerarDicaIa: (...args: unknown[]) => gerarDicaIa(...args),
}));

// Storage mockado para o helper cadernosEmFocoDisponiveis (dicaDoDia/dicaDaIa).
const listarCadernos = vi.fn();
const listarDocumentos = vi.fn();
vi.mock("../../src/main/services/storage.js", () => ({
  DocumentoNaoEncontradoError: class DocumentoNaoEncontradoError extends Error {},
  carregarDocumento: vi.fn(),
  criarDocumento: vi.fn(),
  listarCadernos: (...args: unknown[]) => listarCadernos(...args),
  listarDocumentos: (...args: unknown[]) => listarDocumentos(...args),
  removerDocumento: vi.fn(),
  salvarExercicios: vi.fn(),
  salvarFlashcards: vi.fn(),
  salvarMapaMental: vi.fn(),
  salvarResumo: vi.fn(),
}));

// Ollama mockado: generate/listModels controlados por teste.
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
  generate: (...args: unknown[]) => generate(...args),
  isOllamaRunning: vi.fn(async () => true),
  listModels: (...args: unknown[]) => listModels(...args),
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";
import { OllamaIndisponivelError } from "../../src/main/services/ollama.js";
import {
  DadosProvaInvalidosError,
  ProvaNaoEncontradaError,
} from "../../src/main/services/provas.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const provaExemplo: Prova = {
  id: "p1",
  titulo: "P1 de Cálculo",
  data: "2026-03-20",
  vinculo: { tipo: "caderno", cadernoId: "calculo", cadernoNome: "Cálculo" },
  intervalos: [7, 3, 1],
  sessoes: [
    { id: "s0", data: "2026-03-10", diasAntes: 10, manual: false },
  ],
  criadoEm: "2026-03-10T12:00:00.000Z",
  atualizadoEm: "2026-03-10T12:00:00.000Z",
};

describe("IPC: provas (agenda)", () => {
  beforeEach(() => {
    registered.clear();
    criarProva.mockReset();
    listarProvas.mockReset();
    carregarProva.mockReset();
    editarProva.mockReset();
    salvarSessoes.mockReset();
    regerarAgenda.mockReset();
    removerProva.mockReset();
    gerarDicaIa.mockReset();
    listarCadernos.mockReset();
    listarDocumentos.mockReset();
    generate.mockReset();
    listModels.mockReset();
    registerIpcHandlers();
  });

  it("registra todos os 9 canais de prova", () => {
    expect(registered.has(IPC_CHANNELS.criarProva)).toBe(true);
    expect(registered.has(IPC_CHANNELS.listarProvas)).toBe(true);
    expect(registered.has(IPC_CHANNELS.carregarProva)).toBe(true);
    expect(registered.has(IPC_CHANNELS.editarProva)).toBe(true);
    expect(registered.has(IPC_CHANNELS.salvarSessoes)).toBe(true);
    expect(registered.has(IPC_CHANNELS.regerarAgenda)).toBe(true);
    expect(registered.has(IPC_CHANNELS.removerProva)).toBe(true);
    expect(registered.has(IPC_CHANNELS.dicaDoDia)).toBe(true);
    expect(registered.has(IPC_CHANNELS.dicaDaIa)).toBe(true);
  });

  it("criarProva repassa os dados ao serviço e devolve a prova", async () => {
    criarProva.mockResolvedValue(provaExemplo);
    const dados = {
      titulo: "P1 de Cálculo",
      data: "2026-03-20",
      vinculo: { tipo: "caderno", cadernoNome: "Cálculo" },
    };
    const resultado = await chamar(IPC_CHANNELS.criarProva, dados);
    expect(resultado).toEqual(provaExemplo);
    expect(criarProva).toHaveBeenCalledWith(dados, "2026-03-10");
  });

  it("criarProva converte DadosProvaInvalidosError em mensagem amigável", async () => {
    criarProva.mockRejectedValue(
      new DadosProvaInvalidosError("Informe uma data válida (ano-mês-dia)."),
    );
    await expect(
      chamar(IPC_CHANNELS.criarProva, {}),
    ).rejects.toThrow(/Informe uma data válida/);
  });

  it("listarProvas devolve a lista do serviço com o hoje fixo", async () => {
    listarProvas.mockResolvedValue([]);
    const resultado = await chamar(IPC_CHANNELS.listarProvas);
    expect(resultado).toEqual([]);
    expect(listarProvas).toHaveBeenCalledWith("2026-03-10");
  });

  it("carregarProva devolve a prova; id ausente vira mensagem amigável", async () => {
    carregarProva.mockResolvedValue(provaExemplo);
    expect(await chamar(IPC_CHANNELS.carregarProva, "p1")).toEqual(provaExemplo);

    carregarProva.mockRejectedValue(new ProvaNaoEncontradaError());
    await expect(
      chamar(IPC_CHANNELS.carregarProva, "x"),
    ).rejects.toThrow(/Prova não encontrada/);
  });

  it("editarProva repassa id/mudancas/hoje e devolve a prova", async () => {
    editarProva.mockResolvedValue(provaExemplo);
    const mudancas = { data: "2026-03-21" };
    const resultado = await chamar(IPC_CHANNELS.editarProva, "p1", mudancas);
    expect(resultado).toEqual(provaExemplo);
    expect(editarProva).toHaveBeenCalledWith("p1", mudancas, "2026-03-10");
  });

  it("salvarSessoes repassa id/sessoes/hoje e devolve a prova", async () => {
    salvarSessoes.mockResolvedValue(provaExemplo);
    const sessoes = provaExemplo.sessoes;
    const resultado = await chamar(IPC_CHANNELS.salvarSessoes, "p1", sessoes);
    expect(resultado).toEqual(provaExemplo);
    expect(salvarSessoes).toHaveBeenCalledWith("p1", sessoes, "2026-03-10");
  });

  it("regerarAgenda repassa id/hoje e devolve a prova", async () => {
    regerarAgenda.mockResolvedValue(provaExemplo);
    const resultado = await chamar(IPC_CHANNELS.regerarAgenda, "p1");
    expect(resultado).toEqual(provaExemplo);
    expect(regerarAgenda).toHaveBeenCalledWith("p1", "2026-03-10");
  });

  it("removerProva chama o serviço com o id", async () => {
    removerProva.mockResolvedValue(undefined);
    await chamar(IPC_CHANNELS.removerProva, "p1");
    expect(removerProva).toHaveBeenCalledWith("p1");
  });

  it("dicaDoDia devolve uma DicaDoDia coerente sem tocar o Ollama", async () => {
    carregarProva.mockResolvedValue(provaExemplo);
    listarCadernos.mockResolvedValue([
      {
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
        totalDocumentos: 2,
        atualizadoEm: "2026-03-01T00:00:00.000Z",
      },
    ]);
    listarDocumentos.mockResolvedValue([
      {
        id: "d1",
        nome: "a.pdf",
        formato: "pdf",
        importadoEm: "2026-03-01T00:00:00.000Z",
        atualizadoEm: "2026-03-01T00:00:00.000Z",
        cadernoId: "calculo",
        cadernoNome: "Cálculo",
        temResumo: true,
        temFlashcards: false,
        temExercicios: false,
        temMapaMental: false,
      },
    ]);

    const dica = (await chamar(IPC_CHANNELS.dicaDoDia, "p1")) as {
      provaId: string;
      temRevisaoHoje: boolean;
      cadernosEmFoco: { cadernoId: string; temResumo: boolean }[];
      mensagem: string;
    };
    expect(dica.provaId).toBe("p1");
    // Há sessão em 2026-03-10 (hoje), vínculo caderno "calculo".
    expect(dica.temRevisaoHoje).toBe(true);
    expect(dica.cadernosEmFoco).toHaveLength(1);
    expect(dica.cadernosEmFoco[0].cadernoId).toBe("calculo");
    expect(dica.cadernosEmFoco[0].temResumo).toBe(true);
    expect(dica.mensagem).toContain("Cálculo");
    expect(generate).not.toHaveBeenCalled();
  });

  it("dicaDaIa resolve o modelo via modeloParaGeracao e nunca manda modelo cru", async () => {
    carregarProva.mockResolvedValue(provaExemplo);
    listarCadernos.mockResolvedValue([]);
    listarDocumentos.mockResolvedValue([]);
    // modeloParaGeracao chama listModels; só "llama3.1:latest" instalado.
    listModels.mockResolvedValue(["llama3.1:latest"]);
    gerarDicaIa.mockImplementation(
      async ({ gerar }: { gerar: (p: string) => Promise<string> }) =>
        gerar("prompt qualquer"),
    );
    generate.mockResolvedValue("Estude um pouco hoje.");

    const resultado = await chamar(IPC_CHANNELS.dicaDaIa, "p1");
    expect(resultado).toBe("Estude um pouco hoje.");
    // O generate recebeu um modelo resolvido (nunca o cru "llama3.1:8b").
    expect(generate).toHaveBeenCalledTimes(1);
    const argModel = (generate.mock.calls[0][0] as { model: string }).model;
    expect(argModel).toBe("llama3.1:latest");
  });

  it("dicaDaIa com Ollama ausente rejeita com mensagem amigável", async () => {
    carregarProva.mockResolvedValue(provaExemplo);
    listarCadernos.mockResolvedValue([]);
    listarDocumentos.mockResolvedValue([]);
    listModels.mockResolvedValue(["llama3.1:latest"]);
    gerarDicaIa.mockImplementation(
      async ({ gerar }: { gerar: (p: string) => Promise<string> }) =>
        gerar("prompt qualquer"),
    );
    generate.mockRejectedValue(new OllamaIndisponivelError());

    await expect(
      chamar(IPC_CHANNELS.dicaDaIa, "p1"),
    ).rejects.toThrow(/Ollama não está rodando/);
  });

  it("dicaDaIa com prova inexistente rejeita com mensagem amigável", async () => {
    carregarProva.mockRejectedValue(new ProvaNaoEncontradaError());
    await expect(
      chamar(IPC_CHANNELS.dicaDaIa, "x"),
    ).rejects.toThrow(/Prova não encontrada/);
  });
});
