import { describe, expect, it } from "vitest";
import { appName, defaultModel, ollamaBaseUrl } from "@shared/constants";

describe("shared constants", () => {
  it("define o nome do app", () => {
    expect(appName).toBe("App de Estudos com IA Local");
  });

  it("usa a porta local padrão do Ollama", () => {
    expect(ollamaBaseUrl).toBe("http://localhost:11434");
  });

  it("tem um modelo padrão configurado", () => {
    expect(defaultModel).toBe("llama3.1:8b");
  });
});
