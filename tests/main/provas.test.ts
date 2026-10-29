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
  salvarPlano,
  sanearPlano,
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

/** Carimbo fixo para os testes de plano (datas determinísticas). */
const AGORA = "2026-03-10T12:00:00.000Z";

describe("provas: sanearPlano", () => {
  it("ordinal inválido ou ausente lança DadosProvaInvalidosError", () => {
    expect(() => sanearPlano({ topicos: [{ titulo: "X" }] }, AGORA)).toThrow(
      DadosProvaInvalidosError,
    );
    expect(() =>
      sanearPlano({ ordinal: "quarta", topicos: [{ titulo: "X" }] }, AGORA),
    ).toThrow(DadosProvaInvalidosError);
  });

  it("topicos vazio (após sanear) lança DadosProvaInvalidosError", () => {
    expect(() => sanearPlano({ ordinal: "segunda", topicos: [] }, AGORA)).toThrow(
      "Informe ao menos um assunto.",
    );
    // Só títulos em branco → todos descartados → vazio → erro.
    expect(() =>
      sanearPlano(
        { ordinal: "segunda", topicos: [{ titulo: "   " }, { titulo: "" }] },
        AGORA,
      ),
    ).toThrow(DadosProvaInvalidosError);
  });

  it("ordinal 'primeira' força todos os tópicos a novo:false", () => {
    const plano = sanearPlano(
      {
        ordinal: "primeira",
        topicos: [
          { titulo: "Base A", novo: true },
          { titulo: "Base B", novo: true },
        ],
      },
      AGORA,
    );
    expect(plano.topicos.every((t) => t.novo === false)).toBe(true);
  });

  it("ordinal 'segunda'/'final' respeita o flag novo informado", () => {
    const plano = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [
          { titulo: "Velho", novo: false },
          { titulo: "Recente", novo: true },
        ],
      },
      AGORA,
    );
    const porTitulo = new Map(plano.topicos.map((t) => [t.titulo, t]));
    expect(porTitulo.get("Velho")?.novo).toBe(false);
    expect(porTitulo.get("Recente")?.novo).toBe(true);
  });

  it("aplica clamp e arredonda horasPorDia e diasPorSemana (com defaults)", () => {
    const base = { ordinal: "segunda", topicos: [{ titulo: "X" }] } as const;
    expect(
      sanearPlano({ ...base, horasPorDia: 99, diasPorSemana: 0 }, AGORA),
    ).toMatchObject({ horasPorDia: 24, diasPorSemana: 1 });
    expect(
      sanearPlano({ ...base, horasPorDia: 3.4, diasPorSemana: 4.6 }, AGORA),
    ).toMatchObject({ horasPorDia: 3, diasPorSemana: 5 });
    // Ausente/não-finito → defaults 2 e 5.
    expect(sanearPlano({ ...base, horasPorDia: NaN }, AGORA)).toMatchObject({
      horasPorDia: 2,
      diasPorSemana: 5,
    });
  });

  it("id de tópico digitado à mão vira 'manual:<slug>-<i>' e nunca colide com id de doc", () => {
    const plano = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [
          { id: "doc-uuid-1", titulo: "Vindo de doc" },
          { titulo: "Integração por Partes" }, // sem id → manual
          { id: "manual:qualquer", titulo: "Id manual rejeitado" }, // prefixo reservado → re-derivado
        ],
      },
      AGORA,
    );
    expect(plano.topicos[0].id).toBe("doc-uuid-1");
    expect(plano.topicos[1].id).toBe("manual:integracao-por-partes-1");
    expect(plano.topicos[2].id).toBe("manual:id-manual-rejeitado-2");
    // Nenhum id de doc começa com 'manual:'.
    const manuais = plano.topicos.filter((t) => t.id.startsWith("manual:"));
    expect(manuais).toHaveLength(2);
    expect(manuais.every((t) => t.id !== "doc-uuid-1")).toBe(true);
  });

  it("dedup de tópicos por id mantém o primeiro", () => {
    const plano = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [
          { id: "a", titulo: "Primeiro" },
          { id: "a", titulo: "Duplicado" },
          { id: "b", titulo: "Outro" },
        ],
      },
      AGORA,
    );
    expect(plano.topicos.map((t) => t.id)).toEqual(["a", "b"]);
    expect(plano.topicos[0].titulo).toBe("Primeiro");
  });

  it("dificuldade só se válida; dataArquivo só se ISO canônica UTC", () => {
    const plano = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [
          {
            id: "a",
            titulo: "Com dados",
            dificuldade: "dificil",
            dataArquivo: "2026-03-01T00:00:00.000Z",
          },
          {
            id: "b",
            titulo: "Inválidos",
            dificuldade: "impossivel",
            dataArquivo: "01/15/2023",
          },
        ],
      },
      AGORA,
    );
    expect(plano.topicos[0].dificuldade).toBe("dificil");
    expect(plano.topicos[0].dataArquivo).toBe("2026-03-01T00:00:00.000Z");
    expect("dificuldade" in plano.topicos[1]).toBe(false);
    expect("dataArquivo" in plano.topicos[1]).toBe(false);
  });

  it("ordemManual filtra ids inexistentes, dedup, e omite a chave quando vazia", () => {
    const comOrdem = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [
          { id: "a", titulo: "A" },
          { id: "b", titulo: "B" },
        ],
        ordemManual: ["b", "fantasma", "a", "b"],
      },
      AGORA,
    );
    expect(comOrdem.ordemManual).toEqual(["b", "a"]);

    const semOrdem = sanearPlano(
      {
        ordinal: "segunda",
        topicos: [{ id: "a", titulo: "A" }],
        ordemManual: ["fantasma"],
      },
      AGORA,
    );
    expect("ordemManual" in semOrdem).toBe(false);
  });

  it("checkpoint usa default 'lembrete' quando inválido/ausente", () => {
    expect(
      sanearPlano(
        { ordinal: "segunda", topicos: [{ titulo: "X" }] },
        AGORA,
      ).checkpoint,
    ).toBe("lembrete");
    expect(
      sanearPlano(
        { ordinal: "segunda", topicos: [{ titulo: "X" }], checkpoint: "automatico" },
        AGORA,
      ).checkpoint,
    ).toBe("automatico");
  });

  it("carimba atualizadoEm com o 'agora' recebido", () => {
    const plano = sanearPlano(
      { ordinal: "segunda", topicos: [{ titulo: "X" }] },
      AGORA,
    );
    expect(plano.atualizadoEm).toBe(AGORA);
  });
});

describe("provas: salvarPlano", () => {
  it("grava o bloco plano e faz round-trip idêntico ao recarregar", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const salva = await salvarPlano(
      criada.id,
      {
        ordinal: "segunda",
        horasPorDia: 3,
        diasPorSemana: 5,
        topicos: [
          { id: "a", titulo: "Base", novo: false },
          { id: "b", titulo: "Novo", novo: true, dificuldade: "dificil" },
        ],
        ordemManual: ["b", "a"],
        checkpoint: "automatico",
      },
      AGORA,
      baseDir,
    );
    expect(salva.plano).toBeDefined();
    const relida = await carregarProva(criada.id, baseDir);
    expect(relida.plano).toEqual(salva.plano);
  });

  it("recarimba PlanoEstudo.atualizadoEm e Prova.atualizadoEm com o MESMO timestamp", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    const salva = await salvarPlano(
      criada.id,
      { ordinal: "primeira", topicos: [{ titulo: "X" }] },
      AGORA,
      baseDir,
    );
    expect(salva.atualizadoEm).toBe(AGORA);
    expect(salva.plano?.atualizadoEm).toBe(AGORA);
  });

  it("prova antiga sem o campo plano carrega sem erro e expõe plano === undefined", async () => {
    // Fixture crua: uma prova sem o campo `plano`.
    const prova = {
      id: "antiga",
      titulo: "Antiga",
      data: "2026-03-20",
      vinculo: vinculoCaderno,
      intervalos: [7, 3, 1],
      sessoes: [],
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    };
    await escreverJsonCru(baseDir, "antiga.json", JSON.stringify(prova));
    const carregada = await carregarProva("antiga", baseDir);
    expect(carregada.plano).toBeUndefined();
  });

  it("salvarPlano de id ausente lança ProvaNaoEncontradaError", async () => {
    await expect(
      salvarPlano(
        "nao-existe",
        { ordinal: "segunda", topicos: [{ titulo: "X" }] },
        AGORA,
        baseDir,
      ),
    ).rejects.toBeInstanceOf(ProvaNaoEncontradaError);
  });

  it("salvarPlano com dados inválidos lança DadosProvaInvalidosError", async () => {
    const criada = await criarProva(
      { titulo: "Prova", data: "2026-03-20", vinculo: vinculoCaderno },
      HOJE,
      baseDir,
    );
    await expect(
      salvarPlano(criada.id, { topicos: [] }, AGORA, baseDir),
    ).rejects.toBeInstanceOf(DadosProvaInvalidosError);
  });
});
