import { describe, expect, it } from "vitest";
import {
  appName,
  defaultModel,
  ollamaBaseUrl,
  QUIZ_ALTERNATIVAS_MAXIMO,
  QUIZ_ALTERNATIVAS_MINIMO,
} from "@shared/constants";

describe("shared constants", () => {
  it("define o nome do app", () => {
    expect(appName).toBe("Desenrola");
  });

  it("usa a porta local padrão do Ollama", () => {
    expect(ollamaBaseUrl).toBe("http://localhost:11434");
  });

  it("tem um modelo padrão configurado", () => {
    expect(defaultModel).toBe("llama3.1:8b");
  });

  it("limita o mínimo de alternativas do quiz", () => {
    expect(QUIZ_ALTERNATIVAS_MINIMO).toBe(2);
  });

  it("limita o máximo de alternativas do quiz", () => {
    expect(QUIZ_ALTERNATIVAS_MAXIMO).toBe(6);
  });
});
