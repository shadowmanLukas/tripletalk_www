import eslint from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".astro/**", "dist/**", "node_modules/**"] },
  { files: ["**/*.js", "**/*.mjs"], ...eslint.configs.recommended },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
];
