import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    // `.worktrees` isola worktrees temporários criados durante o
    // desenvolvimento; sem ignorá-los, `eslint .` desce neles e linta os
    // arquivos buildados (out/) de lá, gerando centenas de erros fantasmas.
    // `**/out` cobre o out/ de qualquer worktree, não só o da raiz.
    ignores: ["out", "**/out", "dist", "node_modules", ".worktrees"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/main/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["src/shared/**/*.ts", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.config.{js,ts}", "tests/fixtures/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
