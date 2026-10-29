import { describe, expect, it } from "vitest";
import {
  ehIsoPlausivel,
  ordenarCronologicamente,
  type ItemCronologico,
} from "../../src/shared/cronologia.js";

/** Helper enxuto para montar um item com id + data opcional. */
const item = (id: string, dataArquivo?: string): ItemCronologico =>
  dataArquivo !== undefined ? { id, dataArquivo } : { id };

/** Extrai só os ids na ordem resultante, para asserts legíveis. */
const ids = (lista: ItemCronologico[]): string[] => lista.map((x) => x.id);

describe("ordenarCronologicamente", () => {
  it("ordena do mais antigo (base) ao mais recente (novo)", () => {
    const itens = [
      item("b", "2023-03-01T00:00:00.000Z"),
      item("a", "2023-01-01T00:00:00.000Z"),
      item("c", "2023-02-01T00:00:00.000Z"),
    ];
    expect(ids(ordenarCronologicamente({ itens }))).toEqual(["a", "c", "b"]);
  });

  it("desempata datas iguais de forma estável por id", () => {
    const data = "2023-01-01T00:00:00.000Z";
    const itens = [item("c", data), item("a", data), item("b", data)];
    expect(ids(ordenarCronologicamente({ itens }))).toEqual(["a", "b", "c"]);
  });

  it("coloca documentos sem data ao final, estáveis por id", () => {
    const itens = [
      item("semB"),
      item("comTarde", "2023-05-01T00:00:00.000Z"),
      item("semA"),
      item("comCedo", "2023-01-01T00:00:00.000Z"),
    ];
    expect(ids(ordenarCronologicamente({ itens }))).toEqual([
      "comCedo",
      "comTarde",
      "semA",
      "semB",
    ]);
  });

  it("devolve lista vazia para entrada vazia", () => {
    expect(ordenarCronologicamente({ itens: [] })).toEqual([]);
  });

  it("é puro: não muta a entrada e devolve um novo array", () => {
    const itens = [
      item("b", "2023-03-01T00:00:00.000Z"),
      item("a", "2023-01-01T00:00:00.000Z"),
    ];
    const copiaOriginal = ids(itens);
    const resultado = ordenarCronologicamente({ itens });
    // A entrada permanece na ordem original.
    expect(ids(itens)).toEqual(copiaOriginal);
    // O resultado é um array distinto.
    expect(resultado).not.toBe(itens);
  });

  it("não depende do relógio real (determinístico em chamadas repetidas)", () => {
    const itens = [
      item("b", "2023-03-01T00:00:00.000Z"),
      item("a", "2023-01-01T00:00:00.000Z"),
      item("sem"),
    ];
    const r1 = ids(ordenarCronologicamente({ itens }));
    const r2 = ids(ordenarCronologicamente({ itens }));
    expect(r1).toEqual(r2);
    expect(r1).toEqual(["a", "b", "sem"]);
  });

  it("ancora à frente os itens com índice manual, na ordem do índice", () => {
    const itens = [
      item("x", "2023-01-01T00:00:00.000Z"),
      item("y", "2023-02-01T00:00:00.000Z"),
      item("z", "2023-03-01T00:00:00.000Z"),
    ];
    // Fixa z antes de x, ambos à frente de y (que não é fixado).
    const ordemManual = new Map<string, number>([
      ["z", 0],
      ["x", 1],
    ]);
    expect(ids(ordenarCronologicamente({ itens, ordemManual }))).toEqual([
      "z",
      "x",
      "y",
    ]);
  });

  it("desempata itens manuais de mesmo índice por data e depois por id", () => {
    const itens = [
      item("b", "2023-02-01T00:00:00.000Z"),
      item("a", "2023-01-01T00:00:00.000Z"),
      item("c", "2023-01-01T00:00:00.000Z"),
    ];
    // Mesmo índice manual para todos → desempate por data, depois id.
    const ordemManual = new Map<string, number>([
      ["a", 0],
      ["b", 0],
      ["c", 0],
    ]);
    expect(ids(ordenarCronologicamente({ itens, ordemManual }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("com ordemManual vazia ordena 100% por data", () => {
    const itens = [
      item("b", "2023-03-01T00:00:00.000Z"),
      item("a", "2023-01-01T00:00:00.000Z"),
    ];
    const ordemManual = new Map<string, number>();
    expect(ids(ordenarCronologicamente({ itens, ordemManual }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("itens manuais sem data vêm antes dos não-manuais, na ordem do índice", () => {
    const itens = [
      item("auto", "2023-01-01T00:00:00.000Z"),
      item("manSemData"),
    ];
    const ordemManual = new Map<string, number>([["manSemData", 0]]);
    // O manual (mesmo sem data) é ancorado à frente; o automático flui depois.
    expect(ids(ordenarCronologicamente({ itens, ordemManual }))).toEqual([
      "manSemData",
      "auto",
    ]);
  });
});

describe("ehIsoPlausivel", () => {
  it("aceita a forma canônica de toISOString()", () => {
    expect(ehIsoPlausivel(new Date().toISOString())).toBe(true);
    expect(ehIsoPlausivel("2023-01-15T13:30:00.000Z")).toBe(true);
  });

  it("rejeita strings ISO não-canônicas que Date apenas 'parseia'", () => {
    expect(ehIsoPlausivel("2020")).toBe(false);
    expect(ehIsoPlausivel("01/15/2023")).toBe(false);
    expect(ehIsoPlausivel("2023-01-15")).toBe(false);
    expect(ehIsoPlausivel("2023-01-15T13:30:00Z")).toBe(false);
    expect(ehIsoPlausivel("2023-01-15T13:30:00-03:00")).toBe(false);
  });

  it("rejeita não-strings e strings inválidas", () => {
    expect(ehIsoPlausivel(undefined)).toBe(false);
    expect(ehIsoPlausivel(null)).toBe(false);
    expect(ehIsoPlausivel(1700000000000)).toBe(false);
    expect(ehIsoPlausivel("não é data")).toBe(false);
    expect(ehIsoPlausivel("")).toBe(false);
  });
});
