// vite.config.ts
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  // 在 GH Pages 上通常需要把 base 设置为仓库名（以斜杠开头/结尾）
  base: "/three-player-controller/",
  // 把 Vite 的 root 指向 example（这样 example 下的 index.html / 3dtilesScene.html 会作为入口）
  root: resolve(__dirname, "example"),
  build: {
    // 输出到仓库根的 docs 文件夹（用于 GitHub Pages 当前设置）
    outDir: resolve(__dirname, "docs"),
    // 清空 docs 目录以保证输出干净
    emptyOutDir: true,
    rollupOptions: {
      // 多页面入口：把 example 下的两个 html 都注册进来
      input: {
        main: resolve(__dirname, "example", "index.html"),
        tiles: resolve(__dirname, "example", "3dtilesScene.html"),
      },
    },
  },
});
