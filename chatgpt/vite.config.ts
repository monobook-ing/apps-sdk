import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const copyStaticAssetsPlugin = () => ({
  name: "copy-static-assets",
  closeBundle() {
    const sourceDir = path.resolve(__dirname, "assets");
    const targetDir = path.resolve(__dirname, "dist/apps/assets");

    if (!fs.existsSync(sourceDir)) return;

    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [react(), copyStaticAssetsPlugin()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist/apps",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      formats: ["es"],
      fileName: () => "chatgpt-widget.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "chatgpt-widget.css";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
});
