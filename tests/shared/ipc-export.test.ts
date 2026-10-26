import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "@shared/ipc";
import type { AppApi } from "@shared/ipc";
import type { AlvoExportacao, ResultadoExportacao } from "@shared/export/types";

describe("contrato de IPC da exportação (CA11)", () => {
  it("expõe os canais de exportação em IPC_CHANNELS", () => {
    expect(IPC_CHANNELS.exportarMarkdown).toBe("export:markdown");
    expect(IPC_CHANNELS.exportarPdf).toBe("export:pdf");
  });

  it("o AppApi tipa os métodos de exportação (type-check)", () => {
    // Verificação de tipo: um objeto com só os métodos de exportação precisa
    // ser atribuível ao formato de `AppApi` nesses campos.
    const metodos: Pick<AppApi, "exportarMarkdown" | "exportarPdf"> = {
      exportarMarkdown: (alvo: AlvoExportacao) =>
        Promise.resolve<ResultadoExportacao>({
          status: "salvo",
          caminho: alvo.documento.nome,
        }),
      exportarPdf: (alvo: AlvoExportacao) =>
        Promise.resolve<ResultadoExportacao>({
          status: "salvo",
          caminho: alvo.documento.nome,
        }),
    };
    expect(typeof metodos.exportarMarkdown).toBe("function");
    expect(typeof metodos.exportarPdf).toBe("function");
  });
});
