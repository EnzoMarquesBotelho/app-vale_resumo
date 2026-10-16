import { describe, expect, it, vi } from "vitest";

// A função sob teste vive em src/main/ipc/index.ts, que importa "electron" no
// topo. Mockamos o mínimo para o módulo carregar fora do processo Electron.
vi.mock("electron", () => ({
  ipcMain: { handle: () => {} },
  dialog: { showOpenDialog: vi.fn() },
}));

import { escolherModeloDisponivel } from "../../src/main/ipc/index.js";

describe("escolherModeloDisponivel", () => {
  it("mantém o modelo desejado quando ele está instalado", () => {
    expect(
      escolherModeloDisponivel("llama3.1:8b", ["llama3.1:8b", "qwen2.5:7b"]),
    ).toBe("llama3.1:8b");
  });

  it("casa com uma variante da mesma família quando a tag exata falta", () => {
    // Caso real: default é llama3.1:8b, mas a máquina só tem llama3.1:latest.
    expect(
      escolherModeloDisponivel("llama3.1:8b", ["llama3.1:latest"]),
    ).toBe("llama3.1:latest");
  });

  it("prefere a mesma família a um modelo não relacionado", () => {
    expect(
      escolherModeloDisponivel("llama3.1:8b", [
        "qwen2.5:7b",
        "llama3.1:70b",
      ]),
    ).toBe("llama3.1:70b");
  });

  it("usa o primeiro instalado quando não há ninguém da mesma família", () => {
    expect(
      escolherModeloDisponivel("llama3.1:8b", ["qwen2.5:7b", "mistral:7b"]),
    ).toBe("qwen2.5:7b");
  });

  it("mantém o desejado quando não há nenhum modelo instalado", () => {
    expect(escolherModeloDisponivel("llama3.1:8b", [])).toBe("llama3.1:8b");
  });
});
