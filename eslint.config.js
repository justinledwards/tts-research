import js from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

const tsFiles = ["frontend/**/*.ts", "frontend/**/*.tsx"];

function scoped(config) {
  return {
    ...config,
    files: tsFiles,
  };
}

export default tseslint.config(
  {
    ignores: [
      ".venv/**",
      ".venv-*/**",
      "backend/**",
      "dist/**",
      "node_modules/**",
      "frontend/dist/**",
      "frontend/vite.config.ts",
    ],
  },
  {
    files: ["*.js"],
    ...js.configs.recommended,
  },
  ...tseslint.configs.strictTypeChecked.map(scoped),
  ...tseslint.configs.stylisticTypeChecked.map(scoped),
  {
    files: tsFiles,
    plugins: {
      sonarjs,
      unicorn,
    },
    languageOptions: {
      parserOptions: {
        project: ["./frontend/tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...unicorn.configs.recommended.rules,
      "unicorn/no-null": "off",
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            camelCase: true,
            pascalCase: true,
          },
        },
      ],
      "unicorn/prevent-abbreviations": "off",
    },
  },
);
