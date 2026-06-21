import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import react from "eslint-plugin-react";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react: react,
      "unused-imports": unusedImports,
    },
    settings: {
      next: {
        rootDir: ["."],
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
      react: {
        version: "detect",
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react/react-in-jsx-scope": "off",
      semi: ["error", "never"],
      quotes: ["error", "single", { avoidEscape: true, allowTemplateLiterals: true }],
      "jsx-quotes": ["error", "prefer-single"],
      "@typescript-eslint/no-var-requires": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase", "UPPER_CASE"],
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info", "time", "timeEnd"] }],
      "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],
    },
  },
  globalIgnores([
    "**/*.js",
    "**/*.json",
    "node_modules/**",
    "public/**",
    "**/app/api/**",
    "styles/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "dist/**",
    ".turbo/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
