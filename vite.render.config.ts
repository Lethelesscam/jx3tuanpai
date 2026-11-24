import { defineConfig } from "vite";

export default defineConfig({
  build: { ssr: "server/render.ts", outDir: "dist/render", target: "node22" },
});
