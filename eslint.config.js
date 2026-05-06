import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "build",
      "coverage",
      "node_modules",
      "qa-artifacts",
      ".vercel",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      "api/**/*.ts",
      "server/**/*.ts",
      "tests/**/*.ts",
      "vite.config.ts",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
