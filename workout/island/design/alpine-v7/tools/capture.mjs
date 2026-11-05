import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(
  "/tmp/alpine-v7-tools/node_modules/playwright-core/index.mjs"
);
const sharp = (
  await import("/tmp/alpine-v7-tools/node_modules/sharp/lib/index.js")
).default;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const round = arg("--round", "01"),
  out = path.join(root, "iterations", round),
  athlete = +arg("--athlete", "0"),
  environment = arg("--environment", "sunset"),
  clip = arg("--clip", "carve_left"),
  time = +arg("--time", "0.85");
await fs.mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (!file.startsWith(root + path.sep)) throw Error("outside root");
    const type =
      file.endsWith(".js") || file.endsWith(".mjs")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
  ],
});
const result = {
  round,
  startedAt: new Date().toISOString(),
  configuration: {
    athlete,
    environment,
    clip,
    time,
    fromAir: process.argv.includes("--from-air"),
  },
  captures: [],
  errors: [],
  warnings: [],
  externalRequests: [],
};
for (const [width, height] of [
  [390, 844],
  [844, 390],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") result.errors.push(m.text());
    else if (m.type() === "warning") result.warnings.push(m.text());
  });
  await page.route(/^https?:\/\//, (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(base + "/")
    )
      return route.continue();
    result.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(base + "/preview.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => window.__ALPINE_READY || window.__ALPINE_ERROR,
    null,
    { timeout: 90000 },
  );
  const error = await page.evaluate(() => window.__ALPINE_ERROR);
  if (error) throw Error(error);
  for (const view of ["close", "wide"]) {
    if (process.argv.includes("--from-air"))
      await page.evaluate((config) => window.alpine.set(config), {
        athlete,
        environment,
        view,
        clip: "ramp_jump",
        time: 1.62,
        playing: false,
      });
    const snapshot = await page.evaluate(
      async (config) => {
        return window.alpine.set(config);
      },
      { athlete, environment, clip, time, view, playing: false },
    );
    await page.waitForTimeout(180);
    await page.evaluate(() => window.alpine.render());
    const name = `${view === "close" ? "near" : "far"}-${width}x${height}.webp`;
    const buffer = await page.screenshot({ type: "png" });
    await sharp(buffer).webp({ quality: 91 }).toFile(path.join(out, name));
    const elementIssues = await page.evaluate(() => {
      const list = [];
      for (const e of document.querySelectorAll("button,select,input")) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || e.closest("dialog:not([open])")) continue;
        if (
          r.left < -0.5 ||
          r.right > innerWidth + 0.5 ||
          r.top < -0.5 ||
          r.bottom > innerHeight + 0.5
        )
          list.push({
            id: e.id,
            text: e.textContent.trim(),
            bounds: r.toJSON(),
          });
      }
      return list;
    });
    result.captures.push({
      file: name,
      width,
      height,
      view,
      snapshot,
      elementIssues,
    });
  }
  if (process.argv.includes("--specimens")) {
    await page.evaluate(() => (document.body.dataset.clean = "true"));
    for (const focus of ["powder", "ice", "churned", "forest"]) {
      const snapshot = await page.evaluate(
        (config) => window.alpine.set(config),
        {
          athlete: 2,
          view: "close",
          environment: "sunset",
          clip: "glide",
          time: 0.3,
          focus,
          playing: false,
        },
      );
      const name = `detail-${focus}-${width}x${height}.webp`;
      await sharp(await page.screenshot({ type: "png" }))
        .webp({ quality: 93 })
        .toFile(path.join(out, name));
      result.captures.push({
        file: name,
        width,
        height,
        view: "detail",
        focus,
        snapshot,
        elementIssues: [],
      });
    }
    await page.evaluate(() => (document.body.dataset.clean = "false"));
    for (const selected of [0, 1, 2])
      for (const action of ["carve_left", "carve_right"]) {
        const snapshot = await page.evaluate(
          (config) => window.alpine.set(config),
          {
            athlete: selected,
            view: "close",
            environment: "sunset",
            clip: action,
            time: 1.6,
            playing: false,
          },
        );
        const name = `athlete-${selected}-${action}-${width}x${height}.webp`;
        await sharp(await page.screenshot({ type: "png" }))
          .webp({ quality: 93 })
          .toFile(path.join(out, name));
        result.captures.push({
          file: name,
          width,
          height,
          view: "detail",
          athlete: selected,
          snapshot,
          elementIssues: [],
        });
      }
    await page.evaluate(() => (document.body.dataset.clean = "true"));
    for (const angle of [-0.7, 0.9]) {
      const snapshot = await page.evaluate(
        (config) => window.alpine.set(config),
        {
          athlete: 2,
          view: "close",
          environment: "sunset",
          clip: "glide",
          time: 0.3,
          focus: "forest",
          yaw: angle,
          playing: false,
        },
      );
      const name = `forest-angle-${angle}-${width}x${height}.webp`;
      await sharp(await page.screenshot({ type: "png" }))
        .webp({ quality: 93 })
        .toFile(path.join(out, name));
      result.captures.push({
        file: name,
        width,
        height,
        view: "detail",
        focus: "forest",
        snapshot,
        elementIssues: [],
      });
    }
  }
  if (process.argv.includes("--recovery-specimens")) {
    await page.evaluate(() => (document.body.dataset.clean = "false"));
    for (const selected of [0, 1, 2])
      for (const [action, phaseTime] of [
        ["fall_roll", 2.2666666667],
        ["fall_roll", 3.4],
        ["fall_roll", 4],
        ["get_up", 0],
        ["get_up", 1.9],
      ]) {
        if (process.argv.includes("--from-air"))
          await page.evaluate((config) => window.alpine.set(config), {
            athlete: selected,
            view: "close",
            environment: "sunset",
            clip: "ramp_jump",
            time: 1.62,
            playing: false,
          });
        const snapshot = await page.evaluate(
          (config) => window.alpine.set(config),
          {
            athlete: selected,
            view: "close",
            environment: "sunset",
            clip: action,
            time: phaseTime,
            playing: false,
          },
        );
        const name = `recovery-${selected}-${action}-${phaseTime}-${width}x${height}.webp`;
        await sharp(await page.screenshot({ type: "png" }))
          .webp({ quality: 93 })
          .toFile(path.join(out, name));
        result.captures.push({
          file: name,
          width,
          height,
          view: "recovery",
          athlete: selected,
          snapshot,
          elementIssues: [],
        });
      }
  }
  await context.close();
}
await browser.close();
await new Promise((resolve) => server.close(resolve));
async function hashes(dir) {
  const list = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    if (["iterations", "verification", "offline"].includes(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) list.push(...(await hashes(p)));
    else {
      const b = await fs.readFile(p);
      list.push({
        path: path.relative(root, p),
        bytes: b.length,
        sha256: crypto.createHash("sha256").update(b).digest("hex"),
      });
    }
  }
  return list;
}
result.finishedAt = new Date().toISOString();
result.sourceHashes = await hashes(root);
await fs.writeFile(
  path.join(out, "capture.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    round,
    captures: result.captures.map((c) => ({
      file: c.file,
      triangles: c.snapshot.render.triangles,
      drawCalls: c.snapshot.render.calls,
      LOD: c.snapshot.activeLOD,
      issues: c.elementIssues.length,
    })),
    errors: [...new Set(result.errors)],
    externalRequests: result.externalRequests,
  }),
);
