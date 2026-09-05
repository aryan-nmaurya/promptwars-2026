import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/** Next's recommended rules plus its TypeScript set, in flat-config form. */
export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "eslint.config.mjs"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
