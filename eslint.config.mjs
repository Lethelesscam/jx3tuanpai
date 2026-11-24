import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  { ...reactHooks.configs.flat.recommended, files: ["app/**/*.{ts,tsx}", "web/**/*.{ts,tsx}"] },
]);

export default eslintConfig;
