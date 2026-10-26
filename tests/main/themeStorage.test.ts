import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `themeStorage.ts` importa `app` do Electron só para o diretório default. Nos
// testes passamos um `baseDir` temporário, então `app.getPath` não é chamado;
// mesmo assim o import precisa resolver, por isso mockamos o módulo.
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => tmpdir()) },
}));

import {
  carregarPreferenciaTema,
  salvarPreferenciaTema,
} from "../../src/main/services/themeStorage.js";

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "app-estudos-tema-"));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("themeStorage", () => {
  it("round-trip: salva 'claro' e carrega de volta igual", async () => {
    await salvarPreferenciaTema("claro", baseDir);
    expect(await carregarPreferenciaTema(baseDir)).toBe("claro");
  });

  it("arquivo ausente ou corrompido cai no padrão 'automatico'", async () => {
    // Ausente: diretório temporário recém-criado, sem tema.json.
    expect(await carregarPreferenciaTema(baseDir)).toBe("automatico");

    // Corrompido: JSON inválido no lugar do arquivo.
    const dir = join(baseDir, "configuracoes");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "tema.json"), "{ não é json", "utf-8");
    expect(await carregarPreferenciaTema(baseDir)).toBe("automatico");
  });
});
