import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlvoExportacao, ResultadoExportacao } from "@shared/export/types";
import type { Resumo } from "@shared/types";

/** Captura os handlers registrados via ipcMain.handle para inspeção. */
const registered = new Map<
  string,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
>();

/** Mock do save dialog — controlado por teste. */
const showSaveDialog = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => {
      registered.set(channel, handler);
    },
  },
  dialog: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) },
  // Nunca a pasta Facul: o app aponta para o tmp do SO nos testes.
  app: { getPath: vi.fn(() => tmpdir()) },
  BrowserWindow: { fromWebContents: vi.fn(() => undefined) },
}));

// Controla a falha de gravação sem tocar as demais operações de fs.
let writeFileDeveFalhar = false;
vi.mock("node:fs/promises", async (importActual) => {
  const real = await importActual<typeof import("node:fs/promises")>();
  const writeFileMock = ((...args: unknown[]) => {
    if (writeFileDeveFalhar) {
      return Promise.reject(
        Object.assign(new Error("EACCES"), { code: "EACCES" }),
      );
    }
    return (real.writeFile as (...a: unknown[]) => unknown)(...args);
  }) as typeof real.writeFile;
  return { ...real, default: real, writeFile: writeFileMock };
});

// O render real do PDF (pdfmake) é verificação manual; aqui o pdfmake é
// mockado por um printer falso que emite um Buffer fixo, para exercitar a
// gravação (dialog + escrita atômica) sem a stack real de pdfmake/pdfkit.
const PDF_FALSO = Buffer.from("%PDF-FAKE");

/** Documento falso no formato de evento do pdfkit (data/end/error). */
function docFalso(): {
  on: (evento: string, cb: (c?: Buffer) => void) => void;
  end: () => void;
} {
  const ouvintes = new Map<string, (c?: Buffer) => void>();
  return {
    on(evento, cb) {
      ouvintes.set(evento, cb);
    },
    end() {
      ouvintes.get("data")?.(PDF_FALSO);
      ouvintes.get("end")?.();
    },
  };
}

vi.mock("pdfmake", () => ({
  default: class PdfPrinterFalso {
    createPdfKitDocument(): ReturnType<typeof docFalso> {
      return docFalso();
    }
  },
}));

vi.mock("pdfmake/build/vfs_fonts.js", () => ({
  default: {
    "Roboto-Regular.ttf": "",
    "Roboto-Medium.ttf": "",
    "Roboto-Italic.ttf": "",
    "Roboto-MediumItalic.ttf": "",
  },
}));

import { IPC_CHANNELS } from "@shared/ipc";
import { registerIpcHandlers } from "../../src/main/ipc/index.js";

const evento = {} as IpcMainInvokeEvent;

function chamar(canal: string, ...args: unknown[]): Promise<unknown> {
  const handler = registered.get(canal);
  if (!handler) throw new Error(`handler ausente para ${canal}`);
  return Promise.resolve(handler(evento, ...args));
}

const resumo: Resumo = {
  documentoId: "",
  modo: "curto",
  conteudo: "Conteúdo exportável.",
  geradoEm: "",
};

const alvoResumo: AlvoExportacao = {
  escopo: "artefato",
  tipo: "resumo",
  documento: { nome: "Doc", resumo },
};

let dir: string;

beforeEach(async () => {
  registered.clear();
  showSaveDialog.mockReset();
  writeFileDeveFalhar = false;
  dir = await mkdtemp(join(tmpdir(), "export-ipc-"));
  registerIpcHandlers();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("IPC: exportação (CA11)", () => {
  it("registra os canais de exportação", () => {
    expect(registered.has(IPC_CHANNELS.exportarMarkdown)).toBe(true);
    expect(registered.has(IPC_CHANNELS.exportarPdf)).toBe(true);
  });

  it("(a) Markdown ponta a ponta: grava o .md e resolve 'salvo'", async () => {
    const caminho = join(dir, "saida.md");
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: caminho });

    const resultado = (await chamar(
      IPC_CHANNELS.exportarMarkdown,
      alvoResumo,
    )) as ResultadoExportacao;

    expect(resultado).toEqual({ status: "salvo", caminho });
    const conteudo = await readFile(caminho, "utf-8");
    expect(conteudo).toContain("## Resumo");
    expect(conteudo).toContain("Conteúdo exportável.");
  });

  it("(b) cancelar não grava nada — Markdown e PDF", async () => {
    showSaveDialog.mockResolvedValue({ canceled: true });

    const md = (await chamar(
      IPC_CHANNELS.exportarMarkdown,
      alvoResumo,
    )) as ResultadoExportacao;
    const pdf = (await chamar(
      IPC_CHANNELS.exportarPdf,
      alvoResumo,
    )) as ResultadoExportacao;

    expect(md).toEqual({ status: "cancelado" });
    expect(pdf).toEqual({ status: "cancelado" });
  });

  it("(c) PDF salvo: grava o buffer renderizado e resolve 'salvo'", async () => {
    const caminho = join(dir, "saida.pdf");
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: caminho });

    const resultado = (await chamar(
      IPC_CHANNELS.exportarPdf,
      alvoResumo,
    )) as ResultadoExportacao;

    expect(resultado).toEqual({ status: "salvo", caminho });
    const conteudo = await readFile(caminho);
    expect(conteudo.equals(PDF_FALSO)).toBe(true);
  });

  it("(d) falha de gravação vira mensagem amigável", async () => {
    const caminho = join(dir, "saida.md");
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: caminho });
    writeFileDeveFalhar = true;

    await expect(
      chamar(IPC_CHANNELS.exportarMarkdown, alvoResumo),
    ).rejects.toThrow(/Não foi possível gravar o arquivo/);
  });
});
