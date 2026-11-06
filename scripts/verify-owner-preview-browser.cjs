// Runs the built encrypted preview through the actual Worker, or verifies its deployed URL.
// The operator key is read privately from a file and is never written to logs or URLs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const keyFile = process.env.EVENT_PREVIEW_KEY_FILE;
if (!keyFile)
  throw Error(
    "Set EVENT_PREVIEW_KEY_FILE to the private key file outside the repository.",
  );
const key = fs.readFileSync(keyFile, "utf8").trim();
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
};
let server, browser;
(async () => {
  let target = process.env.EVENT_PREVIEW_URL;
  try {
    if (!target) {
      const worker = (
        await import(pathToFileURL(path.join(dist, "_worker.js")).href)
      ).default;
      const env = {
        ASSETS: {
          fetch: async (request) => {
            let file = path.resolve(dist, "." + new URL(request.url).pathname);
            if (
              !file.startsWith(dist + path.sep) ||
              ["_worker.js", "_routes.json", "_headers"].includes(
                path.basename(file),
              )
            )
              return new Response(null, { status: 404 });
            if (fs.existsSync(file) && fs.statSync(file).isDirectory())
              file = path.join(file, "index.html");
            if (!fs.existsSync(file))
              return new Response(null, { status: 404 });
            return new Response(fs.readFileSync(file), {
              headers: {
                "Content-Type":
                  mime[path.extname(file)] || "application/octet-stream",
              },
            });
          },
        },
      };
      assert.ok(
        fs
          .readFileSync(path.join(dist, "event-demo/index.html"))
          .subarray(0, 18)
          .toString()
          .startsWith("RIVALS_PRIVATE_V1"),
      );
      server = http.createServer(async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const response = await worker.fetch(
            new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers: req.headers,
              ...(req.method === "GET" || req.method === "HEAD"
                ? {}
                : { body: Buffer.concat(chunks) }),
            }),
            env,
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.writeHead(500);
          res.end("local preview error");
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      target = `http://localhost:${server.address().port}/event-demo/`;
    }
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const errors = [],
      external = [];
    const origin = new URL(target).origin;
    await context.route("**/*", (r) => {
      const url = new URL(r.request().url());
      if (
        url.hostname === "cdn.jsdelivr.net" &&
        url.pathname.startsWith("/gh/orioncactus/pretendard@")
      )
        return r.fulfill({ contentType: "text/css", body: "" });
      if (url.origin !== origin) {
        external.push(url.origin);
        return r.abort();
      }
      return r.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on("pageerror", (e) => errors.push(e.message));
    assert.equal((await page.goto(target)).status(), 401);
    await page.getByLabel("개인 접속 키", { exact: true }).fill("0".repeat(64));
    const [denied] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/__preview/login" &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "이벤트 페이지 열기" }).click(),
    ]);
    assert.equal(
      denied.status(),
      401,
      "bad-key login response; Origin=" + denied.request().headers().origin,
    );
    await page.getByRole("alert").waitFor();
    await page.getByLabel("개인 접속 키", { exact: true }).fill(key);
    await page.getByRole("button", { name: "이벤트 페이지 열기" }).click();
    await page.locator(".event-admin").waitFor();
    assert.equal(
      await page.getByLabel("체험할 화면", { exact: true }).inputValue(),
      "admin",
    );
    assert.ok(!page.url().includes(key));
    for (const width of [320, 390, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    const script = await page
      .locator('script[type="module"]')
      .getAttribute("src");
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
    const anonymousPage = await anonymous.newPage();
    assert.equal(
      (await anonymousPage.goto(new URL(script, page.url()).href)).status(),
      401,
      "direct assets require authentication too",
    );
    await anonymous.close();
    await page.reload();
    await page.locator(".event-admin").waitFor();
    await page.getByLabel("체험할 화면", { exact: true }).selectOption("alice");
    await page
      .getByRole("button", { name: "현재 등록 덱으로 이벤트 참여" })
      .click();
    await page
      .getByRole("button", { name: "스킬 점수에 도전하기", exact: true })
      .click();
    await page.getByText("1 / 5회", { exact: true }).waitFor();
    if (
      await page.getByRole("button", { name: "접속 종료", exact: true }).count()
    ) {
      await page
        .getByRole("button", { name: "접속 종료", exact: true })
        .click();
    } else {
      await page.request.post(origin + "/__preview/logout", {
        headers: { Origin: origin },
      });
      await page.goto(target);
    }
    await page.getByLabel("개인 접속 키", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      "Private preview browser: wrong key denied, owner login and encrypted JS/WASM load, admin landing, responsive UI, reload, skill attempt, logout and anonymous asset denial passed. " +
        target,
    );
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
