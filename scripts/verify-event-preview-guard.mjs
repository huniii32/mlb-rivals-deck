import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createPreviewWorker } from "../deployment/cloudflare/preview-worker.mjs";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const worker = createPreviewWorker(() =>
  createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] }),
);
let assetsRead = 0;
const env = {
  EVENT_ACCESS_TEAM_DOMAIN: "owner-test.cloudflareaccess.com",
  EVENT_ACCESS_AUD: "test-app",
  EVENT_ACCESS_EMAIL: "owner@example.test",
  ASSETS: {
    fetch: async () => {
      assetsRead++;
      return new Response("private content");
    },
  },
};
const now = Math.floor(Date.now() / 1000);
async function token(overrides = {}, key = privateKey) {
  return new SignJWT({
    type: "app",
    email: env.EVENT_ACCESS_EMAIL,
    sub: "owner",
    iss: `https://${env.EVENT_ACCESS_TEAM_DOMAIN}`,
    aud: env.EVENT_ACCESS_AUD,
    iat: now,
    exp: now + 60,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(key);
}
const request = (path, headers = {}) =>
  new Request(`https://preview.example.test${path}`, { headers });
for (const field of [
  "EVENT_ACCESS_TEAM_DOMAIN",
  "EVENT_ACCESS_AUD",
  "EVENT_ACCESS_EMAIL",
]) {
  assert.equal(
    (await worker.fetch(request("/event-demo/"), { ...env, [field]: "" }))
      .status,
    503,
  );
}
assert.equal(
  (
    await worker.fetch(request("/"), {
      ...env,
      EVENT_ACCESS_TEAM_DOMAIN: "attacker.test",
    })
  ).status,
  503,
);
for (const path of [
  "/",
  "/?event=1",
  "/event-demo/",
  "/event-demo/assets/data.wasm",
  "/assets/app.js",
  "/demo/events.html",
]) {
  const response = await worker.fetch(
    request(path, {
      "Cf-Access-Authenticated-User-Email": env.EVENT_ACCESS_EMAIL,
    }),
    env,
  );
  assert.equal(
    response.status,
    403,
    "a header with the owner's email alone grants no access",
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}
const otherKey = (await generateKeyPair("RS256")).privateKey;
for (const invalid of [
  "forged",
  await token({}, otherKey),
  await token({ exp: now - 1 }),
  await token({ aud: "other-app" }),
  await token({ iss: "https://attacker.test" }),
  await token({ email: "someone@example.test" }),
  await token({ type: "service" }),
  await token({ exp: undefined }),
  await token({ sub: undefined }),
  await token({ nbf: now + 120 }),
]) {
  assert.equal(
    (
      await worker.fetch(
        request("/event-demo/", { "Cf-Access-Jwt-Assertion": invalid }),
        env,
      )
    ).status,
    403,
  );
}
assert.equal(assetsRead, 0, "denied requests never load protected assets");
for (const headers of [
  { "Cf-Access-Jwt-Assertion": await token() },
  { Cookie: `other=x; CF_Authorization=${await token()}; trailing=y` },
]) {
  const response = await worker.fetch(request("/event-demo/", headers), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "private content");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}
const unavailable = createPreviewWorker(() => {
  throw Error("unavailable keys");
});
assert.equal(
  (
    await unavailable.fetch(
      request("/", { "Cf-Access-Jwt-Assertion": await token() }),
      env,
    )
  ).status,
  403,
);
assert.equal(assetsRead, 2);
console.log(
  "Preview access: signed owner JWT only; wrong user/app/issuer, expired/forged tokens, missing config and key outages blocked; assets private and uncached.",
);
