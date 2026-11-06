import { SignJWT, jwtVerify } from "jose";

export const COOKIE = "__Host-rivals-preview";
const encoder = new TextEncoder();
export const bytes = (hex) =>
  Uint8Array.from(hex.match(/../g) || [], (n) => parseInt(n, 16));
export function cookie(request, name) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
}

function loginPage(status = 401, wrong = false) {
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>운영자 이벤트 페이지</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#1d293e;font:16px/1.7 system-ui,sans-serif}
    main{max-width:460px;margin:12vh auto;padding:28px;background:white;border:1px solid #dce3ed;border-radius:16px}
    h1{font-size:25px;margin:8px 0}p{color:#5c6b80}label{display:block;font-weight:700}
    input,button{display:block;width:100%;padding:13px;border:1px solid #becbde;border-radius:8px;font:inherit;margin-top:10px}
    button{background:#315d9e;color:white;cursor:pointer}small{color:#617189}a{color:#315d9e}
    .error{color:#ad2828}@media(max-width:500px){main{margin:8vh 14px}}
    </style><main><small>RIVALS DECK · PRIVATE PREVIEW</small><h1>운영자 이벤트 페이지</h1>
    <p>전달받은 개인 접속 키를 붙여 넣으면 이벤트 화면을 확인할 수 있습니다.</p>
    ${wrong ? '<p role="alert" class="error">접속 키가 맞지 않습니다. 파일의 내용을 다시 복사해주세요.</p>' : ""}
    <form method="post" action="/__preview/login"><label for="key">개인 접속 키</label>
    <input id="key" name="access_key" type="password" required autocomplete="current-password" spellcheck="false" maxlength="64">
    <button>이벤트 페이지 열기</button></form><p><small>접속은 1시간 동안 유지됩니다.<br>운영자 확인용 가상 체험이며 실제 응모에는 반영되지 않습니다.</small></p>
    <a href="https://mlb-rivals-deck.pages.dev/">덱 관리로 돌아가기</a></main></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}

async function readForm(request) {
  if (
    !request.headers
      .get("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0,
    body = "";
  const decoder = new TextDecoder();
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 512) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(part.value, { stream: true });
  }
  return new URLSearchParams(body + decoder.decode());
}

// Returns null only when a signed, unexpired owner session allows the asset request.
export async function ownerAccess(request, keyHash, sessionKey) {
  const url = new URL(request.url);
  const path = url.pathname;
  const signingKey = bytes(sessionKey);
  if (path === "/__preview/login" && request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin)
      return new Response("Forbidden", { status: 403 });
    const form = await readForm(request);
    const key = form?.get("access_key")?.trim() || "";
    if (!/^[a-f0-9]{64}$/.test(key)) return loginPage(401, true);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(key)),
    );
    const expected = bytes(keyHash);
    let mismatch = digest.length ^ expected.length;
    for (let i = 0; i < digest.length; i++) mismatch |= digest[i] ^ expected[i];
    if (mismatch) return loginPage(401, true);
    const session = await new SignJWT({ role: "owner-preview" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(url.origin)
      .setAudience("event-preview")
      .setSubject("owner")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(signingKey);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/event-demo/?view=admin",
        "Set-Cookie": `${COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
      },
    });
  }
  if (path === "/__preview/logout" && request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin)
      return new Response("Forbidden", { status: 403 });
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/event-demo/",
        "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
      },
    });
  }
  try {
    const token = cookie(request, COOKIE);
    if (!token || token.length > 4096) return loginPage();
    const { payload } = await jwtVerify(token, signingKey, {
      algorithms: ["HS256"],
      issuer: url.origin,
      audience: "event-preview",
      requiredClaims: ["exp", "iat", "sub"],
    });
    if (payload.sub !== "owner" || payload.role !== "owner-preview")
      return loginPage();
    return null;
  } catch {
    return loginPage();
  }
}

export async function privateAsset(response, keyHex) {
  if (!response.ok) return response;
  const encrypted = new Uint8Array(await response.arrayBuffer());
  const prefix = encoder.encode("RIVALS_PRIVATE_V1\n");
  if (!prefix.every((value, i) => encrypted[i] === value))
    return new Response("Private asset unavailable", { status: 503 });
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(keyHex),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const body = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: encrypted.slice(prefix.length, prefix.length + 12),
      },
      key,
      encrypted.slice(prefix.length + 12),
    );
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.delete("ETag");
    headers.delete("Content-Encoding");
    return new Response(body, { status: response.status, headers });
  } catch {
    return new Response("Private asset unavailable", { status: 503 });
  }
}
