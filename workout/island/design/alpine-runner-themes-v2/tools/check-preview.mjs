// SPDX-License-Identifier: CC0-1.0
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const prefix = resolve(process.argv[2] ?? "/tmp/alpine-themes-qa");
const url = new URL(process.argv[3] ??
  "http://127.0.0.1:8765/workout/island/design/alpine-runner-themes-v2/preview.html");
const captures = process.argv[4] ? resolve(process.argv[4]) : null;
const { chromium } = createRequire(join(prefix, "package.json"))("playwright-core");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const target = { width: 844, height: 390 };
const browser = await chromium.launch({
  executablePath: process.env.ALPINE_CHROMIUM ?? "/usr/bin/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-proxy-server"],
});

const errors = [], external = [], invalidRequests = [], abortedRequests = [], requested = new Set();
const report = { chromium: browser.version(), viewport: target, themes: {}, tileVisits: 0, weatherChanges: 0,
  keyboard: false, playback: false, reachesFinish: false, parallaxMovement: false, quickSwitch: false, touch: false };
const scenicDistances = { forest: 16, ice: 131, "frozen-lava": 12, aurora: 11, village: 15, summit: 223 };
let stageDimensions;

async function audit(context) {
  await context.route("**/*", (route) => {
    const resource = new URL(route.request().url());
    if (resource.origin === url.origin) return route.continue();
    external.push(resource.href);
    return route.abort();
  });
  context.on("request", (request) => requested.add(new URL(request.url()).pathname));
  context.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;
    if (failure === "net::ERR_ABORTED") abortedRequests.push(request.url());
    else invalidRequests.push({ url: request.url(), failure });
  });
  context.on("response", (response) => {
    if (response.status() >= 400) invalidRequests.push({ url: response.url(), status: response.status() });
  });
  context.on("weberror", (failure) => errors.push(failure.error().message));
  context.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

function ready(page, id) {
  return page.locator(`#stage[data-theme="${id}"][aria-busy="false"]`).waitFor();
}

async function seek(page, at) {
  await page.locator("#distance").fill(String(at));
  assert.equal(await page.locator("#metres").textContent(), `${at} / 240`);
}

async function capture(page, filename) {
  if (captures) await page.screenshot({ path: join(captures, filename + ".png") });
}

try {
  if (captures) await mkdir(captures, { recursive: true });
  const context = await browser.newContext({ viewport: target, serviceWorkers: "block", reducedMotion: "reduce" });
  await audit(context);
  const page = await context.newPage();
  await page.goto(url.href);
  await ready(page, "forest");
  const stage = page.locator("#stage");
  stageDimensions = await stage.boundingBox();
  assert.ok(stageDimensions.width >= 800 && stageDimensions.height >= 225);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]),
    [target.width, target.height]);
  assert.equal(await page.locator("#themes button").count(), manifest.themes.length);
  await capture(page, "start-844x390");

  const slider = page.locator("#distance");
  const toggle = page.locator("#weather-toggle");
  for (const theme of manifest.themes) {
    await page.locator(`button[data-theme="${theme.id}"]`).click();
    await ready(page, theme.id);
    assert.equal(await page.locator("#themes [aria-pressed=true]").count(), 1);
    assert.equal(await page.locator("#scene-name").textContent(), theme.title);
    assert.equal(await page.locator("#scene-weather").textContent(), theme.weather.label);

    const weatherCanvas = theme.weather.kind === "glow" ? "#backdrop" : "#atmosphere";
    const layer = page.locator(weatherCanvas);
    const withWeather = await layer.evaluate((canvas) => canvas.toDataURL());
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.notEqual(await layer.evaluate((canvas) => canvas.toDataURL()), withWeather);
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    report.weatherChanges++;

    const names = [];
    for (const tile of theme.tiles) {
      await seek(page, tile.startMeters + 12);
      assert.equal(await stage.getAttribute("data-tile"), tile.id);
      assert.equal(await page.locator("#tile-name").textContent(), tile.label);
      names.push(tile.id);
      report.tileVisits++;
    }
    const resources = [...requested].filter((path) => path.includes(`/assets/${theme.id}/`));
    assert.equal(resources.length, 24, theme.id);
    const at = scenicDistances[theme.id];
    await seek(page, at);
    await page.locator("#title").click();
    await capture(page, `${theme.id}-844x390`);
    report.themes[theme.id] = { assetsRequested: resources.length, tiles: names, screenshotAtMeters: at };
  }

  await slider.focus();
  await slider.press("Home");
  assert.equal(await slider.inputValue(), "0");
  await slider.press("ArrowRight");
  assert.equal(await slider.inputValue(), "1");
  await slider.press("End");
  assert.equal(await slider.inputValue(), "240");
  await page.locator("#title").click();
  await capture(page, "finish-844x390");
  report.keyboard = true;

  const backdrop = page.locator("#backdrop");
  const finishBackground = await backdrop.evaluate((canvas) => canvas.toDataURL());
  await seek(page, 29);
  assert.notEqual(await backdrop.evaluate((canvas) => canvas.toDataURL()), finishBackground);
  report.parallaxMovement = true;

  const play = page.locator("#play");
  await play.click();
  await page.waitForFunction(() => Number(document.querySelector("#distance").value) > 31);
  await play.click();
  const pausedAt = await slider.inputValue();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await slider.inputValue(), pausedAt);
  assert.equal(await play.getAttribute("data-playing"), "false");
  report.playback = true;
  await seek(page, 234);
  await play.click();
  await page.waitForFunction(() => document.querySelector("#distance").value === "240" &&
    document.querySelector("#play").dataset.playing === "false");
  await play.click();
  await page.waitForFunction(() => Number(document.querySelector("#distance").value) < 20);
  await play.click();
  report.reachesFinish = true;

  await page.evaluate(() => {
    for (const id of ["ice", "village", "aurora"]) document.querySelector(`button[data-theme="${id}"]`).click();
  });
  await ready(page, "aurora");
  assert.equal(await page.locator("#themes [aria-pressed=true]").getAttribute("data-theme"), "aurora");
  report.quickSwitch = true;

  await seek(page, 0);
  await stage.evaluate((element) => {
    window.visitedOnGlide = [element.dataset.tile];
    new MutationObserver(() => window.visitedOnGlide.push(element.dataset.tile))
      .observe(element, { attributes: true, attributeFilter: ["data-tile"] });
  });
  await play.click();
  await page.waitForFunction(() => document.querySelector("#distance").value === "240" &&
    document.querySelector("#play").dataset.playing === "false", null, { timeout: 60000 });
  report.continuousGlide = await page.evaluate(() => window.visitedOnGlide);
  assert.deepEqual(report.continuousGlide, report.themes.aurora.tiles);
  await context.close();

  const mobile = await browser.newContext({ viewport: target, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await audit(mobile);
  const touchPage = await mobile.newPage();
  const direct = new URL(url);
  direct.search = "?theme=village&at=166";
  await touchPage.goto(direct.href);
  await ready(touchPage, "village");
  assert.equal(await touchPage.locator("#distance").inputValue(), "166");
  await touchPage.locator('button[data-theme="forest"]').tap();
  await ready(touchPage, "forest");
  assert.equal(await touchPage.locator("#distance").inputValue(), "166");
  await touchPage.locator("#distance").tap();
  assert.ok(Math.abs(Number(await touchPage.locator("#distance").inputValue()) - 120) <= 3);
  report.touch = true;
  await mobile.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(invalidRequests, []);
  Object.assign(report, {
    stage: { width: stageDimensions.width, height: stageDimensions.height }, externalRequests: external.length,
    requestFailures: invalidRequests.length, scriptErrors: errors.length,
  });
  await mkdir(join(root, "verification"), { recursive: true });
  await writeFile(join(root, "verification/browser.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, canceledRequestsDuringRapidSwitch: abortedRequests.length }, null, 2));
} finally {
  await browser.close();
}
