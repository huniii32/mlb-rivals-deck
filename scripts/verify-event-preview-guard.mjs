import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createPreviewWorker } from "../deployment/cloudflare/preview-worker.mjs";
import { createHash, createCipheriv } from "node:crypto";
import { COOKIE } from "../deployment/cloudflare/owner-preview.mjs";

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

const ownerKey = "1".repeat(64),
  sessionKey = "2".repeat(64),
  assetKey = "3".repeat(64);
const ownerKeyHash = createHash("sha256").update(ownerKey).digest("hex");
const ownerWorker = createPreviewWorker(undefined, {
  ownerKeyHash,
  sessionKey,
  assetKey,
});
let ownerReads = 0;
const cipher = createCipheriv(
  "aes-256-gcm",
  Buffer.from(assetKey, "hex"),
  Buffer.alloc(12),
);
const plaintext = "<h1>private demo</h1>";
const ciphertext = Buffer.concat([
  Buffer.from("RIVALS_PRIVATE_V1\n"),
  Buffer.alloc(12),
  cipher.update(plaintext),
  cipher.final(),
  cipher.getAuthTag(),
]);
const ownerEnv = {
  ASSETS: {
    fetch: async (request) => {
      ownerReads++;
      assert.equal(request.headers.has("Range"), false);
      return new Response(ciphertext, {
        headers: {
          "Content-Type": "text/html",
          "Content-Length": String(ciphertext.length),
        },
      });
    },
  },
};
const post = (key, origin = "https://preview.example.test") =>
  new Request("https://preview.example.test/__preview/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ access_key: key }),
  });
for (const path of [
  "/event-demo/",
  "/event-demo/assets/data.wasm",
  "/?access_key=" + ownerKey,
])
  assert.equal((await ownerWorker.fetch(request(path), ownerEnv)).status, 401);
assert.equal(
  (await ownerWorker.fetch(post("0".repeat(64)), ownerEnv)).status,
  401,
);
assert.equal(
  (await ownerWorker.fetch(post("x".repeat(1024)), ownerEnv)).status,
  401,
);
assert.equal(
  (await ownerWorker.fetch(post(ownerKey, "https://elsewhere.test"), ownerEnv))
    .status,
  403,
);
assert.equal(
  (
    await ownerWorker.fetch(
      request("/", { Cookie: `${COOKIE}=${ownerKey}` }),
      ownerEnv,
    )
  ).status,
  401,
);
assert.equal(ownerReads, 0);
const login = await ownerWorker.fetch(post(ownerKey), ownerEnv);
assert.equal(login.status, 303);
assert.equal(login.headers.get("Location"), "/event-demo/?view=admin");
const setCookie = login.headers.get("Set-Cookie"),
  sessionCookie = setCookie.split(";")[0];
for (const option of ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=3600"])
  assert.ok(setCookie.includes(option));
assert.ok(
  !setCookie.includes(ownerKey),
  "session cookie never contains the access key",
);
const admitted = await ownerWorker.fetch(
  request("/event-demo/", { Cookie: sessionCookie, Range: "bytes=0-5" }),
  ownerEnv,
);
assert.equal(admitted.status, 200);
assert.equal(await admitted.text(), plaintext);
assert.equal(admitted.headers.get("Cache-Control"), "private, no-store");
assert.equal(admitted.headers.has("Content-Length"), false);
assert.equal((await ownerWorker.fetch(request("/_worker%2Ejs", { Cookie: sessionCookie }), ownerEnv)).status, 404);
const expired = await new SignJWT({ role: "owner-preview" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer("https://preview.example.test")
  .setAudience("event-preview")
  .setSubject("owner")
  .setIssuedAt(now - 4000)
  .setExpirationTime(now - 1)
  .sign(Buffer.from(sessionKey, "hex"));
assert.equal(
  (
    await ownerWorker.fetch(
      request("/", { Cookie: `${COOKIE}=${expired}` }),
      ownerEnv,
    )
  ).status,
  401,
);
const redeployed = createPreviewWorker(undefined, {
  ownerKeyHash,
  sessionKey: "4".repeat(64),
  assetKey,
});
assert.equal(
  (await redeployed.fetch(request("/", { Cookie: sessionCookie }), ownerEnv))
    .status,
  401,
);
// Configuring Access never enables key login as a bypass, even with an otherwise valid owner session.
assert.equal(
  (
    await ownerWorker.fetch(request("/", { Cookie: sessionCookie }), {
      ...ownerEnv,
      EVENT_ACCESS_AUD: "partial",
    })
  ).status,
  503,
);
const logout = await ownerWorker.fetch(
  new Request("https://preview.example.test/__preview/logout", {
    method: "POST",
    headers: { Origin: "https://preview.example.test", Cookie: sessionCookie },
  }),
  ownerEnv,
);
assert.equal(logout.status, 303);
assert.ok(logout.headers.get("Set-Cookie").includes("Max-Age=0"));
assert.equal(ownerReads, 1);
const damaged = Buffer.from(ciphertext);
damaged[damaged.length - 1] ^= 1;
const corruptResponse = await ownerWorker.fetch(
  request("/event-demo/", { Cookie: sessionCookie }),
  {
    ASSETS: { fetch: async () => new Response(damaged) },
  },
);
assert.equal(
  corruptResponse.status,
  503,
  "failed asset authentication never serves partial plaintext",
);
console.log(
  "Preview access: Access JWT or issued owner key; invalid/expired/redeployed sessions, wrong credentials, query bypass and cross-origin login blocked; encrypted assets decoded only for owner; no-store and secure cookies verified.",
);
