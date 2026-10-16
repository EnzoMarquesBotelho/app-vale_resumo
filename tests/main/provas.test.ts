import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessaoRevisao, VinculoProva } from "@shared/types";

// `provas.ts` importa `app` do Electron só para o diretório default. Nos
// testes passamos um `baseDir` temporário, então `app.getPath` não é chamado;
// mesmo assim o import precisa resolver, por isso mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  DadosProvaInvalidosError,
  ProvaNaoEncontradaError,
  carregarProva,
  criarProva,
  editarProva,
  hojeLocal,
  listarProvas,
  regerarAgenda,
  removerProva,
  salvarSessoes,
} from "../../src/main/services/provas.js";

/** "Hoje" fixo usado na maioria dos testes (datas determinísticas). */
const HOJE = "2026-03-10";

const vinculoCaderno: VinculoProva = {
  tipo: "caderno",
  cadernoId: "calculo",
  cadernoNome: "Cálculo",
};

/** Escreve um JSON de prova diretamente no diretório de provas (cru). */
async function escreverJsonCru(
  base: string,
  nomeArquivo: string,
  conteudo: string,
): Promise<void> {
  const dir = join(base, "provas");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, nomeArquivo), conteudo, "utf-8");
}

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-provas-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("provas: hojeLocal", () => {
  it("devolve uma data no formato YYYY-MM-DD", () => {
    expect(hojeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("provas: criar e carregar (round-trip)", () => {
  it("cria uma prova e a carrega de volta igual, com a 1ª agenda esperada", async () => {
    const criada = await criarProva(
      {
        titulo: "P1 de Cálculo",
        data: "2026-03-20", // hoje+10
        vinculo: { tipo: "caderno", cadernoNome: "Cálculo" } as VinculoProva,
        intervalos: [7, 3, 1],
      },
      HOJE,
      baseDir,
    );

    const carregada = await carregarProva(criada.id, baseDir);
    expect(carregada).toEqual(criada);
    expect(carregada.titulo).toBe("P1 de Cálculo");
    expect(carregada.data).toBe("2026-03-20");
    // cadernoId re-derivado server-side via montarCaderno.
    expect(carregada.vinculo).toEqual(vinculoCaderno);
    expect(carregada.intervalos).toEqual([7, 3, 1]);

    // Agenda esperada: 2026-03-20 menos 7/3/1 dias, ordenada asc, ids s0..s2.
    expect(carregada.sessoes).toEqual([
      { id: "s0", data: "2026-03-13", diasAntes: 7, manual: false },
      { id: "s1", data: "2026-03-17", diasAntes: 3, manual: false },
      { id: "s2", data: "2026-03-19", diasAntes: 1, manual: false },
    ]);
    expect(typeof carregada.criadoEm).toBe("string");
    expect(typeof carregada.atualizadoEm).toBe("string");
  });

  it("trunca um título de 250 caracteres em 200 (saneamento, não erro)", async () => {
    const titulo = "A".repeat(250);
    const criada = await criarProva(
      {
        titulo,
        data: "2026-03-20",
        vinculo: { tipo: "caderno", cadernoNome: "Cálculo" } as VinculoProva,
      },
      HOJE,
      baseDir,
    );
    expect(criada.titulo).toHaveLength(200);
  });

  it("intervalos ausente cai no default [7,3,1]", async () => {
    const criada = await criarProva(
      {
        titulo: "Prova",
        data: "2026-03-20",
        vinculo: { tipo: "abrangente", modoDistribuicao: "rotacao" },
      },
      HOJE,
      baseDir,
    );
    expect(criada.intervalos).toEqual([7, 3, 1]);
  });

  it("gera ids únicos para provas diferentes", async () => {
    const a = await criarProva(
      { titulo: "A", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const b = await criarProva(
      { titulo: "B", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    expect(a.id).not.toBe(b.id);
  });

  it("título vazio lança DadosProvaInvalidosError", async () => {
    await expect(
      criarProva(
        { titulo: "   ", data: "2026-03-20", vinculo: vinculoCaderno },
        HOJE,
        baseDir,
      ),
    ).rejects.toBeInstanceOf(DadosProvaInvalidosError);
  });

  it("data inválida (data irreal) lança DadosProvaInvalidosError", async () => {
    await expect(
      criarProva(
        { titulo: "Prova", data: "2026-02-30", vinculo: vinculoCaderno },
        HOJE,
        baseDir,
      ),
    ).rejects.toBeInstanceOf(DadosProvaInvalidosError);
  });

  it("carregarProva de id ausente lança ProvaNaoEncontradaError", async () => {
    await expect(
      carregarProva("nao-existe", baseDir),
    ).rejects.toBeInstanceOf(ProvaNaoEncontradaError);
  });
});

describe("provas: listar", () => {
  it("diretório ausente devolve lista vazia", async () => {
    expect(await listarProvas(HOJE, baseDir)).toEqual([]);
  });

  it("ordena por data asc e calcula diasRestantes/estado", async () => {
    await criarProva(
      { titulo: "Distante", data: "2026-03-25", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await criarProva(
      { titulo: "Hoje", data: "2026-03-10", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await criarProva(
      { titulo: "Amanhã", data: "2026-03-11", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );

    const lista = await listarProvas(HOJE, baseDir);
    expect(lista.map((p) => p.titulo)).toEqual(["Hoje", "Amanhã", "Distante"]);
    expect(lista[0]).toMatchObject({ diasRestantes: 0, estado: "hoje" });
    expect(lista[1]).toMatchObject({ diasRestantes: 1, estado: "amanha" });
    expect(lista[2]).toMatchObject({ diasRestantes: 15, estado: "futura" });
    // tipoVinculo e cadernoNome no resumo leve.
    expect(lista[0].tipoVinculo).toBe("caderno");
    expect(lista[0].cadernoNome).toBe("Cálculo");
  });

  it("empate de data desempata pelo título", async () => {
    await criarProva(
      { titulo: "Zebra", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await criarProva(
      { titulo: "Alfa", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const lista = await listarProvas(HOJE, baseDir);
    expect(lista.map((p) => p.titulo)).toEqual(["Alfa", "Zebra"]);
  });

  it("pula arquivos corrompidos sem derrubar a listagem", async () => {
    const criada = await criarProva(
      { titulo: "Válida", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await escreverJsonCru(baseDir, "corrompida.json", "{ não é json");
    const lista = await listarProvas(HOJE, baseDir);
    expect(lista.map((p) => p.id)).toEqual([criada.id]);
  });

  it("prova passada aparece com estado 'passada' e diasRestantes negativo", async () => {
    await criarProva(
      { titulo: "Passou", data: "2026-03-01", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const lista = await listarProvas(HOJE, baseDir);
    expect(lista[0]).toMatchObject({ diasRestantes: -9, estado: "passada" });
  });
});

describe("provas: editar", () => {
  it("mudar a data recomputa preservando a sessão manual futura", async () => {
    const criada = await criarProva(
      {
        titulo: "Prova",
        data: "2026-03-20",
        vinculo: vinculoCaderno,
        intervalos: [7, 3, 1],
      },
      HOJE,
      baseDir,
    );

    // Adiciona uma sessão manual futura via salvarSessoes.
    const comManual = await salvarSessoes(
      criada.id,
      [
        ...criada.sessoes,
        { id: "x", data: "2026-03-15", diasAntes: 0, manual: true },
      ],
      HOJE,
      baseDir,
    );
    expect(comManual.sessoes.some((s) => s.data === "2026-03-15" && s.manual)).toBe(
      true,
    );

    // Muda a data: as sugeridas re-ancoram; a manual (futura) permanece.
    const editada = await editarProva(
      criada.id,
      { data: "2026-03-27" },
      HOJE,
      baseDir,
    );
    expect(editada.data).toBe("2026-03-27");
    expect(editada.sessoes.some((s) => s.data === "2026-03-15" && s.manual)).toBe(
      true,
    );
    // Sugeridas re-ancoradas na nova data (2026-03-27 − 7/3/1).
    expect(editada.sessoes.some((s) => s.data === "2026-03-20" && !s.manual)).toBe(
      true,
    );
    expect(editada.sessoes.some((s) => s.data === "2026-03-24" && !s.manual)).toBe(
      true,
    );
    expect(editada.sessoes.some((s) => s.data === "2026-03-26" && !s.manual)).toBe(
      true,
    );
  });

  it("mudar só o vínculo não recomputa as datas; substituição integral caderno→abrangente", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const sessoesAntes = criada.sessoes;

    const editada = await editarProva(
      criada.id,
      { vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" } },
      HOJE,
      baseDir,
    );
    // Datas intactas (nenhuma recomputação).
    expect(editada.sessoes).toEqual(sessoesAntes);
    // Vínculo substituído integralmente: sem cadernoId órfão.
    expect(editada.vinculo).toEqual({
      tipo: "abrangente",
      modoDistribuicao: "intercalado",
    });
    expect("cadernoId" in editada.vinculo).toBe(false);
  });

  it("substituição integral abrangente→caderno re-deriva cadernoId via montarCaderno", async () => {
    const criada = await criarProva(
      {
        titulo: "Prova",
        data: "2026-03-20",
        vinculo: { tipo: "abrangente", modoDistribuicao: "rotacao" },
      },
      HOJE,
      baseDir,
    );
    const editada = await editarProva(
      criada.id,
      { vinculo: { tipo: "caderno", cadernoNome: "Física Quântica" } as VinculoProva },
      HOJE,
      baseDir,
    );
    expect(editada.vinculo).toEqual({
      tipo: "caderno",
      cadernoId: "fisica-quantica",
      cadernoNome: "Física Quântica",
    });
  });

  it("editarProva de id ausente lança ProvaNaoEncontradaError", async () => {
    await expect(
      editarProva("nao-existe", { titulo: "x" }, HOJE, baseDir),
    ).rejects.toBeInstanceOf(ProvaNaoEncontradaError);
  });
});

describe("provas: salvarSessoes", () => {
  it("preserva o flag manual recebido (false fica false, true fica true)", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const entrada: SessaoRevisao[] = [
      { id: "a", data: "2026-03-13", diasAntes: 0, manual: false },
      { id: "b", data: "2026-03-15", diasAntes: 0, manual: true },
    ];
    const salva = await salvarSessoes(criada.id, entrada, HOJE, baseDir);
    const porData = new Map(salva.sessoes.map((s) => [s.data, s]));
    expect(porData.get("2026-03-13")?.manual).toBe(false);
    expect(porData.get("2026-03-15")?.manual).toBe(true);
  });

  it("sanea datas inválidas/passadas, recalcula diasAntes, reordena e re-id", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const entrada: SessaoRevisao[] = [
      { id: "x", data: "2026-03-18", diasAntes: 999, manual: true }, // válida
      { id: "y", data: "2026-02-01", diasAntes: 0, manual: true }, // passada → descartada
      { id: "z", data: "2026-99-99", diasAntes: 0, manual: true }, // inválida → descartada
      { id: "w", data: "2026-03-12", diasAntes: 0, manual: false }, // válida
    ];
    const salva = await salvarSessoes(criada.id, entrada, HOJE, baseDir);
    // Só sobrevivem as válidas futuras, ordenadas por data, ids s0..sN.
    expect(salva.sessoes).toEqual([
      { id: "s0", data: "2026-03-12", diasAntes: 8, manual: false },
      { id: "s1", data: "2026-03-18", diasAntes: 2, manual: true },
    ]);

    // Reler confirma a persistência.
    const relida = await carregarProva(criada.id, baseDir);
    expect(relida.sessoes).toEqual(salva.sessoes);
  });

  it("preserva concluida via spread condicional (true grava, false/ausente omite)", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const entrada: SessaoRevisao[] = [
      { id: "a", data: "2026-03-13", diasAntes: 0, manual: false, concluida: true },
      { id: "b", data: "2026-03-15", diasAntes: 0, manual: false, concluida: false },
      { id: "c", data: "2026-03-17", diasAntes: 0, manual: false },
    ];
    const salva = await salvarSessoes(criada.id, entrada, HOJE, baseDir);
    const porData = new Map(salva.sessoes.map((s) => [s.data, s]));
    expect(porData.get("2026-03-13")?.concluida).toBe(true);
    expect("concluida" in (porData.get("2026-03-15") as object)).toBe(false);
    expect("concluida" in (porData.get("2026-03-17") as object)).toBe(false);
  });

  it("ciclo: concluir uma sugerida (manual:false) → regerar substitui", async () => {
    const criada = await criarProva(
      {
        titulo: "Prova",
        data: "2026-03-20",
        vinculo: vinculoCaderno,
        intervalos: [7, 3, 1],
      },
      HOJE,
      baseDir,
    );
    // Marca uma sugerida como concluída, mantendo manual:false.
    const sessoesConcluindo = criada.sessoes.map((s) =>
      s.data === "2026-03-13" ? { ...s, concluida: true } : s,
    );
    const salva = await salvarSessoes(
      criada.id,
      sessoesConcluindo,
      HOJE,
      baseDir,
    );
    expect(
      salva.sessoes.find((s) => s.data === "2026-03-13")?.concluida,
    ).toBe(true);

    // Regerar: como a sessão continua manual:false, é substituída (concluida some).
    const regerada = await regerarAgenda(criada.id, HOJE, baseDir);
    expect(
      regerada.sessoes.find((s) => s.data === "2026-03-13")?.concluida,
    ).toBeUndefined();
    expect(regerada.sessoes.every((s) => !s.manual)).toBe(true);
  });

  it("salvarSessoes de id ausente lança ProvaNaoEncontradaError", async () => {
    await expect(
      salvarSessoes("nao-existe", [], HOJE, baseDir),
    ).rejects.toBeInstanceOf(ProvaNaoEncontradaError);
  });
});

describe("provas: regerarAgenda", () => {
  it("preserva as sessões manuais e regera as sugeridas", async () => {
    const criada = await criarProva(
      {
        titulo: "Prova",
        data: "2026-03-20",
        vinculo: vinculoCaderno,
        intervalos: [7, 3, 1],
      },
      HOJE,
      baseDir,
    );
    // Mantém só uma manual futura + remove as sugeridas.
    const comManual = await salvarSessoes(
      criada.id,
      [{ id: "m", data: "2026-03-16", diasAntes: 0, manual: true }],
      HOJE,
      baseDir,
    );
    expect(comManual.sessoes).toHaveLength(1);

    const regerada = await regerarAgenda(criada.id, HOJE, baseDir);
    // Manual preservada.
    expect(
      regerada.sessoes.some((s) => s.data === "2026-03-16" && s.manual),
    ).toBe(true);
    // Sugeridas regeradas (7/3/1).
    expect(regerada.sessoes.some((s) => s.data === "2026-03-13" && !s.manual)).toBe(
      true,
    );
  });
});

describe("provas: remover", () => {
  it("remove uma prova e some da listagem", async () => {
    const criada = await criarProva(
      { titulo: "Apagar", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await removerProva(criada.id, baseDir);
    await expect(
      carregarProva(criada.id, baseDir),
    ).rejects.toBeInstanceOf(ProvaNaoEncontradaError);
    expect(await listarProvas(HOJE, baseDir)).toEqual([]);
  });

  it("remover um id inexistente não lança (no-op)", async () => {
    await expect(
      removerProva("nao-existe", baseDir),
    ).resolves.toBeUndefined();
  });
});
