import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assinaturaPlano } from "@shared/diagnostico";
import type {
  CheckpointGerado,
  DiagnosticoPlano,
  Exercicio,
  Prova,
} from "@shared/types";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  DadosProvaInvalidosError,
  carregarProva,
  concluirCheckpoint,
  criarProva,
  definirPreferenciaCheckpoint,
  editarProva,
  salvarCheckpoint,
  salvarPlano,
  salvarSessoes,
  sanearCheckpointsPersistido,
} from "../../src/main/services/provas.js";

const HOJE = "2026-03-10";
const AGORA = "2026-03-10T12:00:00.000Z";
const DEPOIS = "2026-03-11T09:30:00.000Z";

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-checkpoints-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const exs = (n: number): Exercicio[] =>
  Array.from({ length: n }, (_, i) => ({
    enunciado: `Enunciado ${i}`,
    resposta: `Resposta ${i}`,
    modo: "mista" as const,
  }));

function item(id: string, extra: Partial<CheckpointGerado> = {}): CheckpointGerado {
  return {
    id,
    geradoEm: AGORA,
    topicos: [{ id: "a", titulo: "A" }],
    ignorados: [{ id: "manual:x-0", titulo: "X", motivo: "manual" }],
    pedido: 8,
    exercicios: exs(8),
    ...extra,
  };
}

const planoBruto = {
  ordinal: "segunda",
  horasPorDia: 2,
  diasPorSemana: 5,
  topicos: [
    { id: "a", titulo: "A", novo: false },
    { id: "b", titulo: "B", novo: true },
  ],
  checkpoint: "lembrete",
};

async function provaComPlano(): Promise<Prova> {
  const criada = await criarProva(
    {
      titulo: "Prova",
      data: "2026-04-20",
      vinculo: { tipo: "caderno", cadernoId: "c", cadernoNome: "C" },
    },
    HOJE,
    baseDir,
  );
  return salvarPlano(criada.id, planoBruto, AGORA, baseDir);
}

function caminho(id: string): string {
  return join(baseDir, "provas", `${id}.json`);
}

describe("provas: salvarCheckpoint (round-trip)", () => {
  it("grava e relê com igualdade profunda", async () => {
    const p = await provaComPlano();
    const assinatura = assinaturaPlano(p.plano!);
    const salva = await salvarCheckpoint(p.id, assinatura, item("d14"), baseDir);
    expect(salva.checkpoints).toEqual({ assinatura, itens: [item("d14")] });
    const relida = await carregarProva(p.id, baseDir);
    expect(relida.checkpoints).toEqual(salva.checkpoints);
    expect(relida.atualizadoEm).toBe(AGORA);
  });

  it("substitui o item de mesmo id e insere outro id", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    await salvarCheckpoint(
      p.id,
      a,
      item("d14", { geradoEm: DEPOIS, exercicios: exs(5) }),
      baseDir,
    );
    const r = await salvarCheckpoint(p.id, a, item("d7"), baseDir);
    expect(r.checkpoints!.itens.map((i) => i.id)).toEqual(["d14", "d7"]);
    expect(r.checkpoints!.itens[0].exercicios).toHaveLength(5);
    expect(r.checkpoints!.itens[0].geradoEm).toBe(DEPOIS);
  });

  it("ordena d28, d14, d7, d3 (decrescente de diasAntes)", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    for (const id of ["d3", "d28", "d7", "d14"]) {
      await salvarCheckpoint(p.id, a, item(id), baseDir);
    }
    const relida = await carregarProva(p.id, baseDir);
    expect(relida.checkpoints!.itens.map((i) => i.id)).toEqual([
      "d28",
      "d14",
      "d7",
      "d3",
    ]);
  });

  it("assinatura divergente rejeita e nada é gravado", async () => {
    const p = await provaComPlano();
    await expect(
      salvarCheckpoint(p.id, "outra", item("d14"), baseDir),
    ).rejects.toThrow(DadosProvaInvalidosError);
    expect((await carregarProva(p.id, baseDir)).checkpoints).toBeUndefined();
  });

  it("assinatura nova substitui o bloco antigo por um bloco só com o item", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    // Muda os assuntos do plano ⇒ nova assinatura.
    const mudada = await salvarPlano(
      p.id,
      {
        ...planoBruto,
        topicos: [...planoBruto.topicos, { id: "c", titulo: "C", novo: true }],
      },
      DEPOIS,
      baseDir,
    );
    expect(mudada.checkpoints!.assinatura).toBe(a); // ainda o antigo (desatualizado)
    const nova = assinaturaPlano(mudada.plano!);
    expect(nova).not.toBe(a);
    const r = await salvarCheckpoint(p.id, nova, item("d7"), baseDir);
    expect(r.checkpoints).toEqual({ assinatura: nova, itens: [item("d7")] });
  });

  it("plano ausente rejeita", async () => {
    const criada = await criarProva(
      {
        titulo: "Sem plano",
        data: "2026-04-20",
        vinculo: { tipo: "caderno", cadernoId: "c", cadernoNome: "C" },
      },
      HOJE,
      baseDir,
    );
    await expect(
      salvarCheckpoint(criada.id, "x", item("d14"), baseDir),
    ).rejects.toThrow(DadosProvaInvalidosError);
  });

  it("escrita atômica: nenhum .tmp sobra", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    await concluirCheckpoint(p.id, "d14", DEPOIS, baseDir);
    await definirPreferenciaCheckpoint(p.id, "automatico", DEPOIS, baseDir);
    const arquivos = await readdir(join(baseDir, "provas"));
    expect(arquivos.filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("provas: prova antiga sem o bloco", () => {
  it("prova sem plano nem checkpoints carrega sem a chave", async () => {
    const criada = await criarProva(
      {
        titulo: "Antiga",
        data: "2026-04-20",
        vinculo: { tipo: "caderno", cadernoId: "c", cadernoNome: "C" },
      },
      HOJE,
      baseDir,
    );
    const relida = await carregarProva(criada.id, baseDir);
    expect("checkpoints" in relida).toBe(false);
    expect(relida).toEqual(criada);
  });

  it("prova com plano e diagnóstico, sem checkpoints, volta idêntica", async () => {
    const p = await provaComPlano();
    const diag: DiagnosticoPlano = {
      assinatura: assinaturaPlano(p.plano!),
      geradoEm: AGORA,
      perguntas: [
        {
          tipo: "multipla",
          enunciado: "Q?",
          alternativas: [
            { texto: "a", correta: true },
            { texto: "b", correta: false },
          ],
          topicoId: "a",
          camada: "base",
        },
      ],
      pedido: 1,
      ignorados: [],
    };
    const bruto = JSON.parse(await readFile(caminho(p.id), "utf-8")) as Prova;
    await writeFile(
      caminho(p.id),
      JSON.stringify({ ...bruto, diagnostico: diag }),
      "utf-8",
    );
    const relida = await carregarProva(p.id, baseDir);
    expect("checkpoints" in relida).toBe(false);
    expect(relida.plano).toEqual(p.plano);
    expect(relida.diagnostico).toEqual(diag);
  });
});

describe("provas: saneamento do bloco corrompido", () => {
  const valido = { assinatura: "s", itens: [item("d14")] };

  it("não-objeto, array, sem assinatura ou sem itens ⇒ undefined", () => {
    for (const ruim of [
      undefined,
      null,
      "texto",
      42,
      [],
      {},
      { assinatura: "", itens: [] },
      { assinatura: "s" },
      { assinatura: "s", itens: "x" },
      { assinatura: "s", itens: [] },
    ]) {
      expect(sanearCheckpointsPersistido(ruim)).toBeUndefined();
    }
  });

  it("bloco válido passa intacto", () => {
    expect(sanearCheckpointsPersistido(valido)).toEqual(valido);
  });

  it("descarta itens inválidos e mantém os bons", () => {
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [null, "x", item("d14"), { ...item("d7"), geradoEm: "" }, item("zzz")],
    });
    expect(r!.itens.map((i) => i.id)).toEqual(["d14"]);
  });

  it("ids inválidos e duplicados: mantém o 1º", () => {
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [
        item("d7", { pedido: 8 }),
        item("d7", { pedido: 9 }),
        item("d0"),
        item("d1000"),
        item("14"),
      ],
    });
    expect(r!.itens.map((i) => [i.id, i.pedido])).toEqual([["d7", 8]]);
  });

  it("exercícios inválidos são descartados; < 3 válidos ⇒ item descartado", () => {
    const ruins = [
      { enunciado: "", resposta: "r", modo: "mista" },
      { enunciado: "e", resposta: "  ", modo: "mista" },
      { enunciado: "e", resposta: "r", modo: "xyz" },
      null,
    ];
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [
        { ...item("d14"), exercicios: [...exs(3), ...ruins] },
        { ...item("d7"), exercicios: [...exs(2), ...ruins] },
      ],
    });
    expect(r!.itens.map((i) => i.id)).toEqual(["d14"]);
    expect(r!.itens[0].exercicios).toHaveLength(3);
  });

  it("topicos vazios ⇒ item descartado; dedup por id; título cortado em 200", () => {
    expect(
      sanearCheckpointsPersistido({
        assinatura: "s",
        itens: [{ ...item("d14"), topicos: [] }],
      }),
    ).toBeUndefined();
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [
        {
          ...item("d14"),
          topicos: [
            { id: "a", titulo: "x".repeat(300) },
            { id: "a", titulo: "dup" },
            { id: "", titulo: "sem id" },
          ],
        },
      ],
    });
    expect(r!.itens[0].topicos).toHaveLength(1);
    expect(r!.itens[0].topicos[0].titulo).toHaveLength(200);
  });

  it("ignorados inválidos viram []; válidos permanecem", () => {
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [
        {
          ...item("d14"),
          ignorados: [
            { id: "i", titulo: "I", motivo: "fora_da_amostra" },
            { id: "j", titulo: "J", motivo: "inventado" },
            "x",
          ],
        },
        { ...item("d7"), ignorados: "nada" },
      ],
    });
    expect(r!.itens[0].ignorados).toEqual([
      { id: "i", titulo: "I", motivo: "fora_da_amostra" },
    ]);
    expect(r!.itens[1].ignorados).toEqual([]);
  });

  it("pedido inválido ⇒ nº de exercícios", () => {
    for (const pedido of [0, -1, 2.5, "8", null]) {
      const r = sanearCheckpointsPersistido({
        assinatura: "s",
        itens: [{ ...item("d14"), pedido, exercicios: exs(5) }],
      });
      expect(r!.itens[0].pedido).toBe(5);
    }
  });

  it("concluidoEm inválido é omitido (chave ausente); válido é mantido", () => {
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: [
        { ...item("d14"), concluidoEm: 123 },
        { ...item("d7"), concluidoEm: "" },
        { ...item("d3"), concluidoEm: DEPOIS },
      ],
    });
    const porId = new Map(r!.itens.map((i) => [i.id, i] as const));
    expect("concluidoEm" in porId.get("d14")!).toBe(false);
    expect("concluidoEm" in porId.get("d7")!).toBe(false);
    expect(porId.get("d3")!.concluidoEm).toBe(DEPOIS);
  });

  it("ordena decrescente e limita a 4 itens", () => {
    const r = sanearCheckpointsPersistido({
      assinatura: "s",
      itens: ["d3", "d7", "d14", "d28", "d5"].map((id) => item(id)),
    });
    expect(r!.itens.map((i) => i.id)).toEqual(["d28", "d14", "d7", "d5"]);
  });

  it("bloco corrompido no arquivo é descartado ao carregar; arquivo continua legível", async () => {
    const p = await provaComPlano();
    const bruto = JSON.parse(await readFile(caminho(p.id), "utf-8")) as Prova;
    await writeFile(
      caminho(p.id),
      JSON.stringify({ ...bruto, checkpoints: "lixo" }),
      "utf-8",
    );
    const relida = await carregarProva(p.id, baseDir);
    expect("checkpoints" in relida).toBe(false);
    expect(relida.plano).toEqual(p.plano);
  });
});

describe("provas: o bloco sobrevive a outras escritas", () => {
  it("salvarPlano, editarProva e salvarSessoes preservam checkpoints", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    const base = await salvarCheckpoint(p.id, a, item("d14"), baseDir);

    const aposPlano = await salvarPlano(p.id, planoBruto, DEPOIS, baseDir);
    expect(aposPlano.checkpoints).toEqual(base.checkpoints);

    const aposEditar = await editarProva(p.id, { titulo: "Novo título" }, HOJE, baseDir);
    expect(aposEditar.checkpoints).toEqual(base.checkpoints);

    const aposSessoes = await salvarSessoes(p.id, aposEditar.sessoes, HOJE, baseDir);
    expect(aposSessoes.checkpoints).toEqual(base.checkpoints);

    expect((await carregarProva(p.id, baseDir)).checkpoints).toEqual(
      base.checkpoints,
    );
  });
});

describe("provas: concluirCheckpoint", () => {
  it("marca concluída e carimba Prova.atualizadoEm", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    const r = await concluirCheckpoint(p.id, "d14", DEPOIS, baseDir);
    expect(r.checkpoints!.itens[0].concluidoEm).toBe(DEPOIS);
    expect(r.atualizadoEm).toBe(DEPOIS);
    expect((await carregarProva(p.id, baseDir)).checkpoints!.itens[0].concluidoEm).toBe(
      DEPOIS,
    );
  });

  it("é idempotente: não muda carimbos nem regrava", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    await concluirCheckpoint(p.id, "d14", DEPOIS, baseDir);
    const antes = await readFile(caminho(p.id), "utf-8");
    const r = await concluirCheckpoint(p.id, "d14", "2026-03-12T00:00:00.000Z", baseDir);
    expect(r.checkpoints!.itens[0].concluidoEm).toBe(DEPOIS);
    expect(r.atualizadoEm).toBe(DEPOIS);
    expect(await readFile(caminho(p.id), "utf-8")).toBe(antes);
  });

  it("sem o item ou sem bloco ⇒ rejeita com a mensagem própria", async () => {
    const p = await provaComPlano();
    await expect(concluirCheckpoint(p.id, "d14", DEPOIS, baseDir)).rejects.toThrow(
      "Não encontrei essa lista para marcar como concluída.",
    );
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d7"), baseDir);
    await expect(concluirCheckpoint(p.id, "d14", DEPOIS, baseDir)).rejects.toThrow(
      DadosProvaInvalidosError,
    );
  });

  it("bloco desatualizado ⇒ rejeita", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    await salvarPlano(
      p.id,
      {
        ...planoBruto,
        topicos: [...planoBruto.topicos, { id: "c", titulo: "C", novo: true }],
      },
      DEPOIS,
      baseDir,
    );
    await expect(concluirCheckpoint(p.id, "d14", DEPOIS, baseDir)).rejects.toThrow(
      DadosProvaInvalidosError,
    );
  });
});

describe("provas: definirPreferenciaCheckpoint", () => {
  it("troca a preferência sem tocar plano.atualizadoEm; carimba Prova.atualizadoEm", async () => {
    const p = await provaComPlano();
    expect(p.plano!.checkpoint).toBe("lembrete");
    const r = await definirPreferenciaCheckpoint(p.id, "automatico", DEPOIS, baseDir);
    expect(r.plano!.checkpoint).toBe("automatico");
    expect(r.plano!.atualizadoEm).toBe(p.plano!.atualizadoEm);
    expect(r.atualizadoEm).toBe(DEPOIS);
    const relida = await carregarProva(p.id, baseDir);
    expect(relida.plano!.checkpoint).toBe("automatico");
    const volta = await definirPreferenciaCheckpoint(p.id, "lembrete", DEPOIS, baseDir);
    expect(volta.plano!.checkpoint).toBe("lembrete");
  });

  it("preserva os checkpoints gerados e não muda a assinatura", async () => {
    const p = await provaComPlano();
    const a = assinaturaPlano(p.plano!);
    await salvarCheckpoint(p.id, a, item("d14"), baseDir);
    const r = await definirPreferenciaCheckpoint(p.id, "automatico", DEPOIS, baseDir);
    expect(r.checkpoints!.itens).toHaveLength(1);
    expect(assinaturaPlano(r.plano!)).toBe(a);
  });

  it("valor inválido rejeita e nada muda", async () => {
    const p = await provaComPlano();
    for (const ruim of ["xyz", "", undefined, null, 1]) {
      await expect(
        definirPreferenciaCheckpoint(p.id, ruim, DEPOIS, baseDir),
      ).rejects.toThrow("Escolha automático ou lembrete.");
    }
    expect((await carregarProva(p.id, baseDir)).plano!.checkpoint).toBe("lembrete");
  });

  it("prova sem plano rejeita", async () => {
    const criada = await criarProva(
      {
        titulo: "Sem plano",
        data: "2026-04-20",
        vinculo: { tipo: "caderno", cadernoId: "c", cadernoNome: "C" },
      },
      HOJE,
      baseDir,
    );
    await expect(
      definirPreferenciaCheckpoint(criada.id, "automatico", DEPOIS, baseDir),
    ).rejects.toThrow(DadosProvaInvalidosError);
  });
});
