import { resolve } from "path";
import { defineConfig } from "vite";

const isVercel = process.env.VERCEL === "1";

export default defineConfig({
    base: isVercel ? "/" : "/grudgecontrol/",
    root: resolve(__dirname, "example"),
    server: { host: true },
    build: {
        outDir: isVercel ? resolve(__dirname, "dist") : resolve(__dirname, "docs"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "example", "index.html"),
                grudge6: resolve(__dirname, "example", "grudge6.html"),
                gltf: resolve(__dirname, "example", "glTF.html"),
                tiles: resolve(__dirname, "example", "3dtilesScene.html"),
                dgs: resolve(__dirname, "example", "3dgs.html"),
                ShinChan: resolve(__dirname, "example", "ShinChan.html"),
                OfficeBuilding: resolve(__dirname, "example", "OfficeBuilding.html"),
                shooting: resolve(__dirname, "example", "shooting", "shooting.html"),
                multiplayergltf: resolve(__dirname, "example", "multiplayer-gltf.html"),
                multiplayer3dgs: resolve(__dirname, "example", "multiplayer-3dgs.html"),
            },
        },
    },
});
