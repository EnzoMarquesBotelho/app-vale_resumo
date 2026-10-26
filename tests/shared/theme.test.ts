import { describe, expect, it } from "vitest";
import { resolveEffectiveTheme } from "@shared/theme";

describe("resolveEffectiveTheme", () => {
  it("claro resolve para light, independente do sistema (sistema claro)", () => {
    expect(resolveEffectiveTheme("claro", false)).toBe("light");
  });

  it("claro resolve para light, independente do sistema (sistema escuro)", () => {
    expect(resolveEffectiveTheme("claro", true)).toBe("light");
  });

  it("escuro resolve para dark, independente do sistema (sistema claro)", () => {
    expect(resolveEffectiveTheme("escuro", false)).toBe("dark");
  });

  it("escuro resolve para dark, independente do sistema (sistema escuro)", () => {
    expect(resolveEffectiveTheme("escuro", true)).toBe("dark");
  });

  it("automatico acompanha o sistema claro (light)", () => {
    expect(resolveEffectiveTheme("automatico", false)).toBe("light");
  });

  it("automatico acompanha o sistema escuro (dark)", () => {
    expect(resolveEffectiveTheme("automatico", true)).toBe("dark");
  });
});
