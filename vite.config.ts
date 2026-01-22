// vite.config.ts
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    base: "/three-player-controller/",
    root: resolve(__dirname, "example"),
    build: {
        outDir: resolve(__dirname, "docs"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "example", "index.html"),
                tiles: resolve(__dirname, "example", "3dtilesScene.html"),
                tilesCustomize: resolve(__dirname, "example", "3dtilesCustomize.html"),
            },
        },
    },
});
