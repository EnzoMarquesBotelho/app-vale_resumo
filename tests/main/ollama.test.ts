import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultModel, ollamaBaseUrl } from "@shared/constants";
import {
  OllamaIndisponivelError,
  generate,
  isOllamaRunning,
  listModels,
} from "../../src/main/services/ollama.js";

/** Monta uma resposta `fetch` falsa (Ollama HTTP mockado — sem modelo real). */
function respostaFake(options: {
  ok: boolean;
  status?: number;
  json?: unknown;
}): Response {
  return {
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    json: async () => options.json,
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isOllamaRunning", () => {
  it("retorna true quando GET /api/tags responde ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaFake({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await isOllamaRunning()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${ollamaBaseUrl}/api/tags`);
  });

  it("retorna false quando a resposta não é ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respostaFake({ ok: false, status: 500 })),
    );
    expect(await isOllamaRunning()).toBe(false);
  });

  it("retorna false (sem crashar) quando o fetch rejeita (Ollama offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    expect(await isOllamaRunning()).toBe(false);
  });
});

describe("listModels", () => {
  it("devolve os nomes dos modelos baixados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respostaFake({
          ok: true,
          json: { models: [{ name: "llama3.1:8b" }, { name: "qwen2.5:7b" }] },
        }),
      ),
    );
    expect(await listModels()).toEqual(["llama3.1:8b", "qwen2.5:7b"]);
  });

  it("devolve lista vazia quando offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await listModels()).toEqual([]);
  });

  it("devolve lista vazia quando não há modelos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respostaFake({ ok: true, json: {} })),
    );
    expect(await listModels()).toEqual([]);
  });
});

describe("generate", () => {
  it("faz POST /api/generate com stream:false e usa o modelo default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaFake({ ok: true, json: { response: "resumo gerado" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const texto = await generate({ prompt: "resuma isto" });

    expect(texto).toBe("resumo gerado");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ollamaBaseUrl}/api/generate`);
    expect(init.method).toBe("POST");
    const corpo = JSON.parse(init.body as string) as {
      model: string;
      prompt: string;
      stream: boolean;
    };
    expect(corpo.model).toBe(defaultModel);
    expect(corpo.prompt).toBe("resuma isto");
    expect(corpo.stream).toBe(false);
  });

  it("respeita o modelo informado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaFake({ ok: true, json: { response: "ok" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generate({ prompt: "x", model: "qwen2.5:7b" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string) as { model: string };
    expect(corpo.model).toBe("qwen2.5:7b");
  });

  it("inclui format no corpo quando fornecido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaFake({ ok: true, json: { response: "ok" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generate({ prompt: "x", format: "json" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string) as { format?: string };
    expect(corpo.format).toBe("json");
  });

  it("omite format do corpo quando não fornecido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaFake({ ok: true, json: { response: "ok" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generate({ prompt: "x" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(corpo)).not.toContain("format");
  });

  it("lança OllamaIndisponivelError quando o fetch rejeita (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    await expect(generate({ prompt: "x" })).rejects.toBeInstanceOf(
      OllamaIndisponivelError,
    );
  });

  it("lança erro quando o Ollama responde com status de erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respostaFake({ ok: false, status: 404 })),
    );
    await expect(generate({ prompt: "x" })).rejects.toThrow(/status 404/);
  });
});
