import { build } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

await build({
  configFile: false, root: resolve("demo/deck-score"), base: "/deck-score-demo/",
  envDir: false, plugins: [react()], build: { outDir: resolve("dist/deck-score-demo"), emptyOutDir: true },
});
