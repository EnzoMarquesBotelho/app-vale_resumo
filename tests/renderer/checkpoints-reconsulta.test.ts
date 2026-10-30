import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisaoCheckpoints } from "@shared/checkpoints";
import type { Prova } from "@shared/types";
import {
  aplicarSeMesmaProva,
  iniciarReconsultaCheckpoints,
} from "../../src/renderer/views/checkpointsReconsulta";

function visao(emGeracao?: string): VisaoCheckpoints {
  return {
    hoje: "2026-03-25",
    diasRestantes: 5,
    preferencia: "automatico",
    bloco: "atual",
    itens: [],
    ...(emGeracao !== undefined ? { emGeracao } : {}),
  };
}

function prova(id: string): Prova {
  return {
    id,
    titulo: id,
    data: "2026-03-30",
    vinculo: { tipo: "abrangente", modoDistribuicao: "intercalado" },
    intervalos: [7, 3, 1],
    sessoes: [],
    criadoEm: "2026-03-01T00:00:00.000Z",
    atualizadoEm: "2026-03-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("iniciarReconsultaCheckpoints", () => {
  it("consulta a cada intervalo enquanto há geração e sai sozinho ao terminar", async () => {
    const consultar = vi
      .fn<() => Promise<VisaoCheckpoints>>()
      .mockResolvedValueOnce(visao("d7"))
      .mockResolvedValueOnce(visao("d7"))
      .mockResolvedValueOnce(visao());
    const aoVisao = vi.fn();
    const aoTerminar = vi.fn();
    const aoErro = vi.fn();
    iniciarReconsultaCheckpoints({
      consultar,
      aoVisao,
      aoTerminar,
      aoErro,
      intervaloMs: 5000,
    });

    expect(consultar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(aoTerminar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(consultar).toHaveBeenCalledTimes(2);
    expect(aoTerminar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(consultar).toHaveBeenCalledTimes(3);
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    expect(aoVisao).toHaveBeenLastCalledWith(visao());

    // Terminou: o intervalo foi limpo (sem timers pendentes, sem novas consultas).
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(consultar).toHaveBeenCalledTimes(3);
    expect(aoTerminar).toHaveBeenCalledTimes(1);
    expect(aoErro).not.toHaveBeenCalled();
  });

  it("cancelar (desmontar/trocar de prova) limpa o intervalo e nada mais é entregue", async () => {
    let resolver: (v: VisaoCheckpoints) => void = () => {};
    const consultar = vi.fn(
      () => new Promise<VisaoCheckpoints>((resolve) => (resolver = resolve)),
    );
    const aoVisao = vi.fn();
    const aoTerminar = vi.fn();
    const cancelar = iniciarReconsultaCheckpoints({
      consultar,
      aoVisao,
      aoTerminar,
      aoErro: vi.fn(),
      intervaloMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(consultar).toHaveBeenCalledTimes(1);

    cancelar();
    expect(vi.getTimerCount()).toBe(0);
    // A consulta em voo termina depois do cancelamento: resultado descartado.
    resolver(visao());
    await vi.advanceTimersByTimeAsync(0);
    expect(aoVisao).not.toHaveBeenCalled();
    expect(aoTerminar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("cancelar antes do primeiro tick não consulta nada", async () => {
    const consultar = vi.fn(async () => visao("d7"));
    const cancelar = iniciarReconsultaCheckpoints({
      consultar,
      aoVisao: vi.fn(),
      aoTerminar: vi.fn(),
      aoErro: vi.fn(),
      intervaloMs: 5000,
    });
    cancelar();
    await vi.advanceTimersByTimeAsync(20000);
    expect(consultar).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("erro numa consulta é reportado e a reconsulta continua", async () => {
    const consultar = vi
      .fn<() => Promise<VisaoCheckpoints>>()
      .mockRejectedValueOnce(new Error("falhou"))
      .mockResolvedValueOnce(visao());
    const aoErro = vi.fn();
    const aoTerminar = vi.fn();
    iniciarReconsultaCheckpoints({
      consultar,
      aoVisao: vi.fn(),
      aoTerminar,
      aoErro,
      intervaloMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(aoErro).toHaveBeenCalledTimes(1);
    expect(aoTerminar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(aoTerminar).toHaveBeenCalledTimes(1);
  });
});

describe("aplicarSeMesmaProva (setter funcional da Agenda)", () => {
  it("aplica quando a prova selecionada é a mesma", () => {
    const nova = { ...prova("p1"), titulo: "novo" };
    expect(aplicarSeMesmaProva(prova("p1"), nova)).toBe(nova);
  });

  it("não sobrescreve se o aluno trocou de prova", () => {
    const atual = prova("p2");
    expect(aplicarSeMesmaProva(atual, prova("p1"))).toBe(atual);
  });

  it("não reabre uma prova fechada (seleção nula)", () => {
    expect(aplicarSeMesmaProva(null, prova("p1"))).toBeNull();
  });
});
