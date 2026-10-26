/**
 * Domínio puro de tema (claro/escuro/automático), compartilhado entre main e
 * renderer. Casa única dos tipos de tema e da regra de resolução do tema
 * efetivo. Sem dependências de Electron, disco ou DOM: só lógica pura, para
 * ser testável isoladamente e reusável nos dois processos.
 */

/**
 * Preferência de tema escolhida pelo usuário. `'automatico'` acompanha o
 * sistema operacional; `'claro'`/`'escuro'` fixam o tema.
 */
export type ThemePreference = "claro" | "escuro" | "automatico";

/**
 * Tema efetivamente aplicado na UI, depois de resolver `'automatico'` contra o
 * sistema. É o valor que vai para `data-theme` no renderer.
 */
export type EffectiveTheme = "light" | "dark";

/** Estado completo de tema trafegado pelo IPC (preferência + resolução). */
export interface EstadoTema {
  /** Preferência bruta escolhida pelo usuário. */
  preferencia: ThemePreference;
  /** Tema efetivo já resolvido (o que a UI aplica). */
  efetivo: EffectiveTheme;
  /** Se o sistema operacional está em modo escuro no momento. */
  sistemaEscuro: boolean;
}

/** Preferência padrão quando nada foi escolhido ou a leitura falhou. */
export const THEME_PREFERENCE_PADRAO: ThemePreference = "automatico";

/**
 * Type-guard puro: confirma que um valor desconhecido é uma `ThemePreference`
 * válida. Usado na leitura tolerante da persistência e na validação do IPC.
 */
export function ehThemePreference(x: unknown): x is ThemePreference {
  return x === "claro" || x === "escuro" || x === "automatico";
}

/**
 * Resolve o tema efetivo a partir da preferência e do estado do sistema.
 * `'claro'` → `'light'`, `'escuro'` → `'dark'`, `'automatico'` acompanha o
 * sistema (`systemIsDark ? 'dark' : 'light'`). Função pura, sem efeitos.
 */
export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemIsDark: boolean,
): EffectiveTheme {
  switch (preference) {
    case "claro":
      return "light";
    case "escuro":
      return "dark";
    case "automatico":
      return systemIsDark ? "dark" : "light";
  }
}
