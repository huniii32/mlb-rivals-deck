import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export async function buildEventPreviewGuard(root) {
  const dist = resolve(root, "dist");
  mkdirSync(dist, { recursive: true });
  await build({
    entryPoints: [resolve(root, "deployment/cloudflare/preview-worker.mjs")],
    outfile: resolve(dist, "_worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
  });
  // Include assets too: protecting only HTML would leave the demo JS/DB public.
  writeFileSync(
    resolve(dist, "_routes.json"),
    JSON.stringify({
      version: 1,
      include: ["/*"],
      exclude: [],
    }),
  );
}
