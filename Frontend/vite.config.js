import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";

const inputFiles = {
  main: resolve(import.meta.dirname, "index.html"),
};

const pagesDir = resolve(import.meta.dirname, "src/pages");
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir)
    .filter((file) => file.endsWith(".html"))
    .forEach((file) => {
      const name = file.replace(/\.html$/, "");
      inputFiles[name] = resolve(pagesDir, file);
    });
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: inputFiles,
    },
  },
});
