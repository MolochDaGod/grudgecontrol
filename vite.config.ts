import { defineConfig } from "vite";

export default defineConfig({
  root: "./example",
  base: "./glbScene.html",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
