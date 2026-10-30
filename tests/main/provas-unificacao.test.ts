import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estadoBlocoCheckpoints } from "@shared/checkpoints";
import { assinaturaPlano, estadoDiagnostico } from "@shared/diagnostico";
import { montarLinhaDoTempo } from "@shared/linhaDoTempo";
import type { DiagnosticoPlano, Prova, VinculoProva } from "@shared/types";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));
import {
  DadosProvaInvalidosError,
  carregarProva,
  criarProva,
  editarProva,
  hojeLocal,
  listarProvas,
  regerarAgenda,
  salvarDiagnostico,
  salvarPlano,
  salvarSessoes,
} from "../../src/main/services/provas.js";

const HOJE = "2026-10-30";
const AGORA = "2026-10-30T12:00:00.000Z";
const vinculo: VinculoProva = {
  tipo: "caderno",
  cadernoId: "calculo",
  cadernoNome: "Cálculo",
};

let baseDir: string;
beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-unif-"));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(baseDir, { recursive: true, force: true });
});

async function semear(prova: Record<string, unknown>): Promise<string> {
  const dir = join(baseDir, "provas");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(prova.id)}.json`), JSON.stringify(prova), "utf-8");
  return String(prova.id);
}

async function jsonCru(id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(baseDir, "provas", `${id}.json`), "utf-8"));
}

const planoBruto = (ordinal: string, novo = true) => ({
  ordinal,
  horasPorDia: 2,
  diasPorSemana: 5,
  topicos: [
    { id: "a", titulo: "Base", novo: false },
    { id: "b", titulo: "Novo", novo },
  ],
  checkpoint: "lembrete",
});

const pergunta = (topicoId: string, camada: "base" | "novo") => ({
  tipo: "multipla" as const,
  enunciado: "Pergunta?",
  alternativas: [
    { texto: "A", correta: true },
    { texto: "B", correta: false },
  ],
  topicoId,
  camada,
});

function diagnosticoDe(plano: Prova["plano"]): DiagnosticoPlano {
  return {
    assinatura: assinaturaPlano(plano!),
    geradoEm: AGORA,
    perguntas: [pergunta("a", "base"), pergunta("b", "novo")],
    pedido: 2,
    ignorados: [],
  };
}

describe("data mínima (main, relógio injetado)", () => {
  it("criar: hoje e passado são rejeitados com mensagem pt-BR; amanhã é aceito", async () => {
    for (const data of ["2026-10-30", "2026-10-29"]) {
      await expect(
        criarProva({ titulo: "P", data, vinculo }, HOJE, baseDir),
      ).rejects.toThrow(/a partir de amanhã \(31\/10\/2026\)/);
    }
    expect(await listarProvas(HOJE, baseDir)).toEqual([]);
    const ok = await criarProva({ titulo: "P", data: "2026-10-31", vinculo }, HOJE, baseDir);
    expect(ok.data).toBe("2026-10-31");
  });

  it("virada do dia: a mesma data é aceita com hoje=10-30 e rejeitada com hoje=10-31", async () => {
    await expect(
      criarProva({ titulo: "P", data: "2026-10-31", vinculo }, "2026-10-30", baseDir),
    ).resolves.toBeDefined();
    await expect(
      criarProva({ titulo: "P", data: "2026-10-31", vinculo }, "2026-10-31", baseDir),
    ).rejects.toBeInstanceOf(DadosProvaInvalidosError);
  });

  it("hojeLocal usa o calendário local (23:59 e 00:01)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59));
    expect(hojeLocal()).toBe("2026-10-30");
    vi.setSystemTime(new Date(2026, 9, 31, 0, 1));
    expect(hojeLocal()).toBe("2026-10-31");
  });

  it("prova antiga com data passada continua abrindo e listando como passada", async () => {
    const id = await semear({
      id: "velha",
      titulo: "Velha",
      data: "2026-03-01",
      vinculo,
      intervalos: [7, 3, 1],
      sessoes: [],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
    expect((await carregarProva(id, baseDir)).data).toBe("2026-03-01");
    const lista = await listarProvas(HOJE, baseDir);
    expect(lista[0]).toMatchObject({ estado: "passada" });
  });

  it("editar: só título ou mesma data passam; data nova passada/hoje rejeita; amanhã aceita e preserva manuais", async () => {
    const id = await semear({
      id: "velha",
      titulo: "Velha",
      data: "2026-03-01",
      vinculo,
      intervalos: [7, 3, 1],
      sessoes: [],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
    expect((await editarProva(id, { titulo: "Nova" }, HOJE, baseDir)).titulo).toBe("Nova");
    expect(
      (await editarProva(id, { data: "2026-03-01", vinculo }, HOJE, baseDir)).data,
    ).toBe("2026-03-01");
    for (const data of ["2026-03-05", "2026-10-30"]) {
      await expect(editarProva(id, { data }, HOJE, baseDir)).rejects.toBeInstanceOf(
        DadosProvaInvalidosError,
      );
    }
    const futura = await criarProva({ titulo: "F", data: "2026-11-20", vinculo }, HOJE, baseDir);
    const comManual = await salvarSessoes(
      futura.id,
      [...futura.sessoes, { id: "x", data: "2026-11-05", diasAntes: 0, manual: true }],
      HOJE,
      baseDir,
    );
    const movida = await editarProva(comManual.id, { data: "2026-11-25" }, HOJE, baseDir);
    expect(movida.sessoes.some((s) => s.manual && s.data === "2026-11-05")).toBe(true);
  });
});

describe("tipo da prova", () => {
  it("criar sem tipo não grava a chave; com tipo grava; inválido rejeita", async () => {
    const sem = await criarProva({ titulo: "P", data: "2026-11-20", vinculo }, HOJE, baseDir);
    expect("tipo" in (await jsonCru(sem.id))).toBe(false);
    const com = await criarProva(
      { titulo: "E", data: "2026-11-20", vinculo, tipo: "enem" },
      HOJE,
      baseDir,
    );
    expect((await jsonCru(com.id)).tipo).toBe("enem");
    await expect(
      criarProva(
        // @ts-expect-error valor inválido de propósito
        { titulo: "X", data: "2026-11-20", vinculo, tipo: "xyz" },
        HOJE,
        baseDir,
      ),
    ).rejects.toThrow("Escolha um tipo de prova válido.");
  });

  it("editarProva({tipo:null}) remove a chave; tipo inválido rejeita", async () => {
    const p = await criarProva(
      { titulo: "P", data: "2026-11-20", vinculo, tipo: "final" },
      HOJE,
      baseDir,
    );
    await editarProva(p.id, { tipo: null }, HOJE, baseDir);
    expect("tipo" in (await jsonCru(p.id))).toBe(false);
    await expect(
      // @ts-expect-error valor inválido de propósito
      editarProva(p.id, { tipo: "xyz" }, HOJE, baseDir),
    ).rejects.toThrow("Escolha um tipo de prova válido.");
  });

  it("tipo corrompido no JSON é descartado na leitura", async () => {
    const id = await semear({
      id: "cor",
      titulo: "C",
      data: "2026-11-20",
      vinculo,
      intervalos: [7],
      sessoes: [],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      tipo: "xyz",
    });
    expect("tipo" in (await carregarProva(id, baseDir))).toBe(false);
  });

  it("salvarPlano com tipo enem grava ordinal primeira e novo=false mesmo se o renderer mandar final", async () => {
    const p = await criarProva(
      { titulo: "E", data: "2026-11-20", vinculo, tipo: "enem" },
      HOJE,
      baseDir,
    );
    const salva = await salvarPlano(p.id, planoBruto("final"), AGORA, baseDir);
    expect(salva.plano?.ordinal).toBe("primeira");
    expect(salva.plano?.topicos.every((t) => !t.novo)).toBe(true);
    const enade = await criarProva(
      { titulo: "E", data: "2026-11-20", vinculo, tipo: "enade" },
      HOJE,
      baseDir,
    );
    expect((await salvarPlano(enade.id, planoBruto("segunda"), AGORA, baseDir)).plano?.ordinal).toBe(
      "primeira",
    );
  });

  it("salvarPlano: sem tipo faz backfill tipo=ordinal; bruto não-objeto lança como antes", async () => {
    const p = await criarProva({ titulo: "P", data: "2026-11-20", vinculo }, HOJE, baseDir);
    const salva = await salvarPlano(p.id, planoBruto("segunda"), AGORA, baseDir);
    expect(salva.tipo).toBe("segunda");
    expect((await jsonCru(p.id)).tipo).toBe("segunda");
    const comTipo = await criarProva(
      { titulo: "T", data: "2026-11-20", vinculo, tipo: "final" },
      HOJE,
      baseDir,
    );
    await expect(salvarPlano(comTipo.id, "lixo", AGORA, baseDir)).rejects.toBeInstanceOf(
      DadosProvaInvalidosError,
    );
  });

  it("editarProva({tipo}) sincroniza o plano, não recarimba plano.atualizadoEm e invalida diagnóstico/checkpoints", async () => {
    const p = await criarProva(
      { titulo: "P", data: "2026-11-20", vinculo, tipo: "segunda" },
      HOJE,
      baseDir,
    );
    const comPlano = await salvarPlano(p.id, planoBruto("segunda"), AGORA, baseDir);
    await salvarDiagnostico(p.id, diagnosticoDe(comPlano.plano), baseDir);
    const antes = await carregarProva(p.id, baseDir);
    expect(estadoDiagnostico(antes.plano, antes.diagnostico)).toBe("pendente");
    const bloco = { assinatura: assinaturaPlano(antes.plano!), itens: [] };
    expect(estadoBlocoCheckpoints(antes.plano, bloco)).toBe("atual");

    const editada = await editarProva(p.id, { tipo: "final" }, HOJE, baseDir);
    expect(editada.plano?.ordinal).toBe("final");
    expect(editada.plano?.atualizadoEm).toBe(AGORA);
    expect(estadoDiagnostico(editada.plano, editada.diagnostico)).toBe("desatualizado");
    expect(estadoBlocoCheckpoints(editada.plano, bloco)).toBe("desatualizado");
  });

  it("segunda→primeira descarta 'novo'; voltar a segunda não restaura", async () => {
    const p = await criarProva(
      { titulo: "P", data: "2026-11-20", vinculo, tipo: "segunda" },
      HOJE,
      baseDir,
    );
    const comPlano = await salvarPlano(p.id, planoBruto("segunda", true), AGORA, baseDir);
    expect(comPlano.plano?.topicos.some((t) => t.novo)).toBe(true);
    const prim = await editarProva(p.id, { tipo: "primeira" }, HOJE, baseDir);
    expect(prim.plano?.topicos.every((t) => !t.novo)).toBe(true);
    expect(prim.plano?.atualizadoEm).toBe(AGORA);
    const volta = await editarProva(p.id, { tipo: "segunda" }, HOJE, baseDir);
    expect(volta.plano?.ordinal).toBe("segunda");
    expect(volta.plano?.topicos.every((t) => !t.novo)).toBe(true);
  });

  it("divergência em disco: carregar não reconcilia; salvarPlano seguinte restaura a coerência", async () => {
    const id = await semear({
      id: "div",
      titulo: "D",
      data: "2026-11-20",
      vinculo,
      intervalos: [7],
      sessoes: [],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      tipo: "final",
      plano: {
        ordinal: "primeira",
        horasPorDia: 2,
        diasPorSemana: 5,
        topicos: [{ id: "a", titulo: "A", novo: false }],
        checkpoint: "lembrete",
        atualizadoEm: AGORA,
      },
    });
    const lida = await carregarProva(id, baseDir);
    expect(lida.tipo).toBe("final");
    expect(lida.plano?.ordinal).toBe("primeira");
    const salva = await salvarPlano(id, planoBruto("primeira"), AGORA, baseDir);
    expect(salva.plano?.ordinal).toBe("final");
  });

  it("sessões ficam intactas após salvarPlano e editarProva({tipo})", async () => {
    const p = await criarProva({ titulo: "P", data: "2026-11-20", vinculo }, HOJE, baseDir);
    const com = await salvarSessoes(
      p.id,
      [
        ...p.sessoes,
        { id: "m", data: "2026-11-08", diasAntes: 0, manual: true, concluida: true },
      ],
      HOJE,
      baseDir,
    );
    const antes = JSON.stringify(com.sessoes);
    const a = await salvarPlano(p.id, planoBruto("segunda"), AGORA, baseDir);
    expect(JSON.stringify(a.sessoes)).toBe(antes);
    const b = await editarProva(p.id, { tipo: "final" }, HOJE, baseDir);
    expect(JSON.stringify(b.sessoes)).toBe(antes);
  });
});

describe("round-trip de prova ANTIGA (sem tipo)", () => {
  it("preserva blocos e não grava tipo, exceto o backfill do salvarPlano", async () => {
    const plano = {
      ordinal: "segunda",
      horasPorDia: 2,
      diasPorSemana: 5,
      topicos: [
        { id: "a", titulo: "Base", novo: false },
        { id: "b", titulo: "Novo", novo: true },
      ],
      checkpoint: "lembrete",
      atualizadoEm: AGORA,
    };
    const checkpoints = {
      assinatura: assinaturaPlano(plano as never),
      itens: [
        {
          id: "d7",
          geradoEm: AGORA,
          topicos: [{ id: "a", titulo: "Base", manual: false }],
          ignorados: [],
          pedido: 3,
          exercicios: [1, 2, 3].map((n) => ({
            enunciado: `E${n}`,
            resposta: `R${n}`,
            modo: "teorica",
          })),
        },
      ],
    };
    const id = await semear({
      id: "antiga",
      titulo: "Antiga",
      data: "2026-11-20",
      vinculo,
      intervalos: [7, 3, 1],
      sessoes: [
        { id: "s0", data: "2026-11-13", diasAntes: 7, manual: true, concluida: true },
        { id: "s1", data: "2026-11-17", diasAntes: 3, manual: false },
      ],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      plano,
      diagnostico: diagnosticoDe(plano as never),
      checkpoints,
    });
    const inicial = await carregarProva(id, baseDir);
    expect("tipo" in inicial).toBe(false);
    expect(inicial.plano).toEqual(plano);
    expect(inicial.checkpoints?.itens).toHaveLength(1);
    expect(inicial.diagnostico).toBeDefined();

    await editarProva(id, { titulo: "Antiga 2" }, HOJE, baseDir);
    await salvarSessoes(id, inicial.sessoes, HOJE, baseDir);
    await regerarAgenda(id, HOJE, baseDir);
    const depois = await carregarProva(id, baseDir);
    expect("tipo" in (await jsonCru(id))).toBe(false);
    expect(depois.plano).toEqual(plano);
    expect(depois.diagnostico).toEqual(inicial.diagnostico);
    expect(depois.checkpoints).toEqual(inicial.checkpoints);
    expect(depois.sessoes.some((s) => s.manual && s.concluida)).toBe(true);

    const comBackfill = await salvarPlano(id, planoBruto("segunda"), AGORA, baseDir);
    expect(comBackfill.tipo).toBe("segunda");
    expect(comBackfill.diagnostico).toEqual(inicial.diagnostico);
  });
});

describe("regressão: prova sem plano mantém a Agenda de revisão", () => {
  it("criar → salvarSessoes → regerar → editar data, e linha do tempo ≡ sessões ordenadas", async () => {
    const p = await criarProva({ titulo: "P", data: "2026-11-20", vinculo }, HOJE, baseDir);
    expect(p.sessoes.map((s) => [s.data, s.diasAntes, s.manual])).toEqual([
      ["2026-11-13", 7, false],
      ["2026-11-17", 3, false],
      ["2026-11-19", 1, false],
    ]);
    expect("tipo" in p).toBe(false);
    expect("plano" in p).toBe(false);

    const sal = await salvarSessoes(
      p.id,
      [...p.sessoes, { id: "x", data: "2026-11-05", diasAntes: 0, manual: true }],
      HOJE,
      baseDir,
    );
    expect(sal.sessoes.map((s) => [s.id, s.data, s.manual])).toEqual([
      ["s0", "2026-11-05", true],
      ["s1", "2026-11-13", false],
      ["s2", "2026-11-17", false],
      ["s3", "2026-11-19", false],
    ]);
    const reg = await regerarAgenda(p.id, HOJE, baseDir);
    expect(reg.sessoes).toHaveLength(4);
    const mov = await editarProva(p.id, { data: "2026-11-25" }, HOJE, baseDir);
    expect(mov.sessoes.some((s) => s.manual && s.data === "2026-11-05")).toBe(true);
    expect("tipo" in (await jsonCru(p.id))).toBe(false);

    const linha = montarLinhaDoTempo({
      sessoes: mov.sessoes,
      plano: undefined,
      checkpoints: [],
      hoje: HOJE,
    });
    expect(linha.map((i) => (i.tipo === "revisao" ? i.sessao.id : ""))).toEqual(
      [...mov.sessoes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)).map((s) => s.id),
    );
  });
});
