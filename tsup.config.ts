import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["three", "three-mesh-bvh", "@dimforge/rapier3d-compat"],
    target: "es2020",
    minify: false,
    esbuildOptions(options) {
        options.loader = {
            ...options.loader,
            ".png": "dataurl",
            ".jpg": "dataurl",
            ".svg": "dataurl",
        };
    },
});
