import { build } from "esbuild";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, createCipheriv } from "node:crypto";

export async function buildEventPreviewGuard(root) {
  const dist = resolve(root, "dist");
  mkdirSync(dist, { recursive: true });
  const assetKey = randomBytes(32);
  // Even if Pages falls back to static hosting, it only serves ciphertext.
  // Decryption keys are embedded exclusively in the server Worker, not public assets.
  function encrypt(dir) {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, file.name);
      if (file.isDirectory()) {
        encrypt(path);
        continue;
      }
      if (
        ["_worker.js", "_routes.json", "_headers", "_redirects"].includes(
          file.name,
        )
      )
        continue;
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", assetKey, iv);
      const content = Buffer.concat([
        cipher.update(readFileSync(path)),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      writeFileSync(
        path,
        Buffer.concat([Buffer.from("RIVALS_PRIVATE_V1\n"), iv, content]),
      );
    }
  }
  encrypt(dist);
  await build({
    entryPoints: [resolve(root, "deployment/cloudflare/preview-worker.mjs")],
    outfile: resolve(dist, "_worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    define: {
      __PREVIEW_SESSION_KEY__: JSON.stringify(randomBytes(32).toString("hex")),
      __PREVIEW_ASSET_KEY__: JSON.stringify(assetKey.toString("hex")),
    },
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
