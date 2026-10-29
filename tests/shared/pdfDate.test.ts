import { describe, expect, it } from "vitest";
import { parsearDataPdf } from "../../src/shared/pdfDate.js";

describe("parsearDataPdf", () => {
  it("converte data PDF completa com fuso para ISO canônico UTC", () => {
    // 10:30 local em -03:00 → 13:30 UTC.
    expect(parsearDataPdf("D:20230115103000-03'00'")).toBe(
      "2023-01-15T13:30:00.000Z",
    );
  });

  it("aceita data sem o prefixo D:", () => {
    expect(parsearDataPdf("20230115103000-03'00'")).toBe(
      "2023-01-15T13:30:00.000Z",
    );
  });

  it("sem fuso é interpretado como UTC (determinístico)", () => {
    expect(parsearDataPdf("D:20230115103000")).toBe(
      "2023-01-15T10:30:00.000Z",
    );
  });

  it("aceita partes opcionais ausentes (só ano+mês; só ano+mês+dia)", () => {
    // Mês presente, dia ausente → dia 01; hora/min/seg → 00.
    expect(parsearDataPdf("D:202301")).toBe("2023-01-01T00:00:00.000Z");
    expect(parsearDataPdf("D:20230115")).toBe("2023-01-15T00:00:00.000Z");
  });

  it("aceita o sufixo Z como UTC", () => {
    expect(parsearDataPdf("D:20230115103000Z")).toBe(
      "2023-01-15T10:30:00.000Z",
    );
  });

  it("no caso degenerado Z + dígitos de offset, o Z vence (offset 0)", () => {
    expect(parsearDataPdf("D:20230115103000Z03'00'")).toBe(
      "2023-01-15T10:30:00.000Z",
    );
  });

  it("aplica offset positivo (+05'30')", () => {
    // 10:30 local em +05:30 → 05:00 UTC.
    expect(parsearDataPdf("D:20230115103000+05'30'")).toBe(
      "2023-01-15T05:00:00.000Z",
    );
  });

  it("rejeita data inexistente no calendário (mês 13) devolvendo undefined", () => {
    expect(parsearDataPdf("D:20231301103000")).toBeUndefined();
  });

  it("rejeita dia inexistente (dia 32) devolvendo undefined", () => {
    expect(parsearDataPdf("D:20230132103000")).toBeUndefined();
  });

  it("devolve undefined para string vazia ou só espaços", () => {
    expect(parsearDataPdf("")).toBeUndefined();
    expect(parsearDataPdf("   ")).toBeUndefined();
  });

  it("devolve undefined para entradas não-string", () => {
    expect(parsearDataPdf(undefined)).toBeUndefined();
    expect(parsearDataPdf(null)).toBeUndefined();
    expect(parsearDataPdf(20230115)).toBeUndefined();
    expect(parsearDataPdf({})).toBeUndefined();
    expect(parsearDataPdf(["D:20230115"])).toBeUndefined();
  });

  it("devolve undefined para lixo sem dígitos de data", () => {
    expect(parsearDataPdf("sem data")).toBeUndefined();
    expect(parsearDataPdf("D:")).toBeUndefined();
  });

  it("nunca lança, mesmo com entradas estranhas", () => {
    const estranhas: unknown[] = [
      Number.NaN,
      Symbol("x") as unknown,
      "D:99999999999999",
      "D:0000",
      true,
    ];
    for (const e of estranhas) {
      expect(() => parsearDataPdf(e)).not.toThrow();
    }
  });
});
