import { build } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/event-demo");
await build({
  configFile: false,
  root: resolve(root, "demo/event-web"),
  base: "/event-demo/",
  plugins: [react()],
  // This standalone demo must never initialize or contact the live Supabase client.
  envDir: false,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
    "import.meta.env.VITE_EVENT_ID": JSON.stringify("browser-demo"),
    "import.meta.env.VITE_EVENT_PILOT": JSON.stringify(""),
  },
  build: { outDir: output, emptyOutDir: true },
});
console.log(
  "Standalone event demo: /event-demo/ · isolated browser DB · no live API",
);
