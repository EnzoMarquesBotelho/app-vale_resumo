import { describe, expect, it } from "vitest";
import {
  STATUS_DEV,
  clampPercent,
  mapAvailableToStatus,
  mapCheckingToStatus,
  mapDownloadedToStatus,
  mapErrorToStatus,
  mapNotAvailableToStatus,
  mapProgressToStatus,
  mensagemErroUpdater,
  normalizarVersao,
  rotuloDisponivel,
} from "@shared/updater";

describe("updater (domínio puro): STATUS_DEV", () => {
  it("é o estado dev-unavailable", () => {
    expect(STATUS_DEV).toEqual({ tipo: "dev-unavailable" });
  });
});

describe("updater: mapeamento evento→estado", () => {
  it("checking", () => {
    expect(mapCheckingToStatus()).toEqual({ tipo: "checking" });
  });

  it("not-available", () => {
    expect(mapNotAvailableToStatus()).toEqual({ tipo: "not-available" });
  });

  it("available normaliza a versão", () => {
    expect(mapAvailableToStatus({ version: "v0.1.2" })).toEqual({
      tipo: "available",
      versao: "0.1.2",
    });
  });

  it("ready (update-downloaded) normaliza a versão", () => {
    expect(mapDownloadedToStatus({ version: "0.1.2" })).toEqual({
      tipo: "ready",
      versao: "0.1.2",
    });
  });

  it("downloading clampa o percent", () => {
    expect(mapProgressToStatus({ percent: 42.7 })).toEqual({
      tipo: "downloading",
      percent: 43,
    });
  });

  it("error produz mensagem pt-BR", () => {
    const estado = mapErrorToStatus(new Error("ENOTFOUND api.github.com"));
    expect(estado.tipo).toBe("error");
    if (estado.tipo === "error") {
      expect(estado.mensagem).toContain("conexão");
    }
  });
});

describe("updater: clampPercent", () => {
  it("arredonda", () => {
    expect(clampPercent(50.6)).toBe(51);
  });

  it("limita abaixo de 0", () => {
    expect(clampPercent(-5)).toBe(0);
  });

  it("limita acima de 100", () => {
    expect(clampPercent(150)).toBe(100);
  });

  it("NaN vira 0", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("undefined vira 0", () => {
    expect(clampPercent(undefined)).toBe(0);
  });
});

describe("updater: normalizarVersao", () => {
  it("remove o prefixo v", () => {
    expect(normalizarVersao("v0.1.2")).toBe("0.1.2");
  });

  it("mantém versão sem prefixo", () => {
    expect(normalizarVersao("0.1.2")).toBe("0.1.2");
  });

  it("vazia vira desconhecida", () => {
    expect(normalizarVersao("")).toBe("desconhecida");
  });

  it("faz trim", () => {
    expect(normalizarVersao("  1.0.0 ")).toBe("1.0.0");
  });

  it("ausente vira desconhecida", () => {
    expect(normalizarVersao(undefined)).toBe("desconhecida");
  });
});

describe("updater: rotuloDisponivel", () => {
  it("cita o número quando conhecido", () => {
    expect(rotuloDisponivel("0.1.2")).toBe("Nova versão 0.1.2 disponível");
  });

  it("omite o número quando desconhecida", () => {
    expect(rotuloDisponivel("desconhecida")).toBe("Nova versão disponível");
  });
});

describe("updater: mensagemErroUpdater", () => {
  it("erro de rede → frase de conexão", () => {
    expect(mensagemErroUpdater(new Error("net::ERR_INTERNET_DISCONNECTED"))).toContain(
      "conexão",
    );
    expect(mensagemErroUpdater({ code: "ENOTFOUND" })).toContain("conexão");
  });

  it("erro genérico → frase genérica", () => {
    const msg = mensagemErroUpdater(new Error("algo quebrou"));
    expect(msg).toBe(
      "Não foi possível concluir a atualização. Tente novamente mais tarde.",
    );
  });

  it("nunca devolve o detalhe cru", () => {
    const msg = mensagemErroUpdater(new Error("stack trace secreto 0xDEADBEEF"));
    expect(msg).not.toContain("0xDEADBEEF");
  });
});
