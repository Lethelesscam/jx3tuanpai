import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("./web/"),
  publicDir: fromRoot("./public/"),
  envDir: fromRoot("./"),
  base: "/jx3tuanpai/",
  plugins: [react()],
  build: { outDir: fromRoot("./dist/pages/"), emptyOutDir: true },
});
