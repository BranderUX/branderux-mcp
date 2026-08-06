import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Builds the element-preview MCP App: a single self-contained HTML file. */
export default defineConfig({
  root: path.resolve(__dirname, "app"),
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: path.resolve(__dirname, "dist/app"),
    emptyOutDir: true,
    target: "es2020",
  },
});
