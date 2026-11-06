import { createRemoteJWKSet, jwtVerify } from "jose";

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
  result.headers.set("Referrer-Policy", "no-referrer");
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
export function createPreviewWorker(keySetFor = remoteKeys) {
  return {
    async fetch(request, env) {
      const team = env.EVENT_ACCESS_TEAM_DOMAIN?.trim();
      const audience = env.EVENT_ACCESS_AUD?.trim();
      const owner = env.EVENT_ACCESS_EMAIL?.trim().toLowerCase();
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
      return privateResponse(await env.ASSETS.fetch(request));
    },
  };
}

export default createPreviewWorker();
