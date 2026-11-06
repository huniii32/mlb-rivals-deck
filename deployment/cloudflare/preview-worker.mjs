import { createRemoteJWKSet, jwtVerify } from "jose";
import { OWNER_KEY_HASH } from "./owner-preview-key.mjs";
import { ownerAccess, privateAsset } from "./owner-preview.mjs";

// Generated for each private build; only the server-side Worker receives these.
const SESSION_KEY =
  typeof __PREVIEW_SESSION_KEY__ === "undefined" ? "" : __PREVIEW_SESSION_KEY__;
const ASSET_KEY =
  typeof __PREVIEW_ASSET_KEY__ === "undefined" ? "" : __PREVIEW_ASSET_KEY__;

const keySets = new Map();
function remoteKeys(issuer) {
  if (!keySets.has(issuer)) {
    keySets.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
        timeoutDuration: 5000,
      }),
    );
  }
  return keySets.get(issuer);
}

function privateResponse(response) {
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  // Same-origin form POSTs need an Origin header for the login/logout CSRF check.
  result.headers.set("Referrer-Policy", "same-origin");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}

function denied(status) {
  return privateResponse(
    new Response(
      `<!doctype html><html lang="ko"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>운영자 전용 미리보기</title><main><h1>운영자 전용 미리보기</h1>
    <p>${status === 503 ? "접근 보호 설정을 준비하고 있습니다." : "이 페이지를 열 수 있는 운영자 인증이 필요합니다."}</p>
    <p>공개 사이트는 <a href="https://mlb-rivals-deck.pages.dev/">여기에서 이용하세요.</a></p></main></html>`,
      {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        },
      },
    ),
  );
}

// The factory permits a local signing key in tests, never a deployed bypass.
export function createPreviewWorker(
  keySetFor = remoteKeys,
  {
    ownerKeyHash = OWNER_KEY_HASH,
    sessionKey = SESSION_KEY,
    assetKey = ASSET_KEY,
  } = {},
) {
  return {
    async fetch(request, env) {
      const team = env.EVENT_ACCESS_TEAM_DOMAIN?.trim();
      const audience = env.EVENT_ACCESS_AUD?.trim();
      const owner = env.EVENT_ACCESS_EMAIL?.trim().toLowerCase();
      // Access remains authoritative once configured. A broken Access configuration
      // cannot silently fall back to a different authentication method.
      const usingAccess = !!(team || audience || owner);
      if (!usingAccess) {
        if (
          !/^[a-f0-9]{64}$/.test(ownerKeyHash) ||
          !/^[a-f0-9]{64}$/.test(sessionKey)
        )
          return denied(503);
        const response = await ownerAccess(request, ownerKeyHash, sessionKey);
        if (response) return privateResponse(response);
        return serveAsset(request, env, assetKey);
      }
      // No owner addresses or signing settings are embedded in public JS.
      if (
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(
          team || "",
        ) ||
        !audience ||
        !owner ||
        !owner.includes("@")
      )
        return denied(503);
      const token =
        request.headers.get("Cf-Access-Jwt-Assertion") ||
        request.headers
          .get("Cookie")
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("CF_Authorization="))
          ?.slice("CF_Authorization=".length);
      if (!token || token.length > 16384) return denied(403);
      try {
        const issuer = `https://${team}`;
        const { payload } = await jwtVerify(token, keySetFor(issuer), {
          algorithms: ["RS256"],
          issuer,
          audience,
          requiredClaims: ["exp", "iat", "sub", "email"],
        });
        if (
          payload.type !== "app" ||
          typeof payload.email !== "string" ||
          payload.email.toLowerCase() !== owner
        )
          return denied(403);
      } catch {
        // Expired, forged, other-app tokens and JWKS outages all fail closed.
        return denied(403);
      }
      if (
        new URL(request.url).pathname === "/__preview/logout" &&
        request.method === "POST"
      ) {
        if (request.headers.get("Origin") !== new URL(request.url).origin)
          return denied(403);
        return privateResponse(
          new Response(null, {
            status: 303,
            headers: { Location: `https://${team}/cdn-cgi/access/logout` },
          }),
        );
      }
      return serveAsset(request, env, assetKey);
    },
  };
}

async function serveAsset(request, env, assetKey) {
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); }
  catch { return privateResponse(new Response("Bad request", { status: 400 })); }
  if (["/_worker.js", "/_routes.json", "/_headers", "/_redirects"].includes(path))
    return privateResponse(new Response("Not found", { status: 404 }));
  if (!["GET", "HEAD"].includes(request.method))
    return privateResponse(new Response("Method not allowed", { status: 405 }));
  const headers = new Headers(request.headers);
  for (const name of [
    "Range",
    "If-Range",
    "If-None-Match",
    "If-Modified-Since",
  ])
    headers.delete(name);
  // Fetch complete ciphertext even for HEAD; only return the decoded headers then.
  const response = await env.ASSETS.fetch(
    new Request(request, { method: "GET", headers }),
  );
  const result = assetKey ? await privateAsset(response, assetKey) : response;
  return privateResponse(
    request.method === "HEAD" ? new Response(null, result) : result,
  );
}

export default createPreviewWorker();
