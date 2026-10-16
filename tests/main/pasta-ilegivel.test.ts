import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Raiz varrida e subpasta protegida com caminhos FIXOS (não mkdtemp), para
// poderem ser referenciados no factory de `vi.mock`, que é içado para o topo.
const raizFixa = join(tmpdir(), "app-estudos-ilegivel-raiz");
const subProtegida = join(raizFixa, "Protegida");

// `app` do Electron só para o diretório default; usamos `baseDir` temporário.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

// Mocka `node:fs/promises` delegando tudo ao módulo real, exceto `readdir`,
// que lança apenas para a subpasta protegida (e delega para as demais).
vi.mock("node:fs/promises", async (importActual) => {
  const real = await importActual<typeof import("node:fs/promises")>();
  const readdirMock = ((
    dir: Parameters<typeof real.readdir>[0],
    options?: unknown,
  ) => {
    if (typeof dir === "string" && dir === subProtegida) {
      return Promise.reject(
        Object.assign(new Error("EACCES"), { code: "EACCES" }),
      );
    }
    return (real.readdir as (...a: unknown[]) => unknown)(dir, options);
  }) as typeof real.readdir;
  return { ...real, default: real, readdir: readdirMock };
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { importarPasta } from "../../src/main/services/pasta.js";
import { listarDocumentos } from "../../src/main/services/storage.js";

let baseDir: string;

async function arquivoTexto(conteudo: string, caminho: string): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, conteudo, "utf-8");
}

beforeEach(async () => {
  await rm(raizFixa, { recursive: true, force: true });
  await mkdir(raizFixa, { recursive: true });
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-ilegivel-base-"));
});

afterEach(async () => {
  await rm(raizFixa, { recursive: true, force: true });
  await rm(baseDir, { recursive: true, force: true });
});

describe("importarPasta: subpasta ilegível não aborta o lote", () => {
  it("pula a subpasta que lança em readdir e importa o resto", async () => {
    await arquivoTexto("raiz", join(raizFixa, "r.txt"));
    await arquivoTexto("secreto", join(subProtegida, "x.txt"));
    await arquivoTexto("ok", join(raizFixa, "Legivel", "y.txt"));

    const r = await importarPasta(raizFixa, baseDir);

    // r.txt (raiz) + Legivel/y.txt entram; Protegida/x.txt não (readdir lança).
    expect(r.importados).toBe(2);
    expect(r.falhas).toBe(0);
    const docs = await listarDocumentos(undefined, baseDir);
    expect(docs.map((d) => d.nome).sort()).toEqual(["r.txt", "y.txt"]);
  });
});
