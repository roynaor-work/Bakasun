import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Submitted primitives include shadow passes and other draws outside renderer.info.
// SwiftShader gives a reproducible software run. For hardware, set PERF_SOFTWARE=0.
function installDrawCounter() {
  const counters = new WeakMap();
  const games = new WeakMap();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...options) {
    const gl = getContext.call(this, type, ...options);
    if (!gl || !/^webgl2?$/.test(type) || !this.classList.contains('minigame-canvas')) return gl;
    if (counters.has(gl)) return gl;

    const counter = {calls: 0, triangles: 0, type, renderer: gl.getParameter(gl.RENDERER)};
    counters.set(gl, counter);
    games.set(this, counter);
    const record = (mode, count, instances) => {
      counter.calls += 1;
      if (mode === gl.TRIANGLES) counter.triangles += Math.floor(count / 3) * instances;
      else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) {
        counter.triangles += Math.max(0, count - 2) * instances;
      }
    };
    const wrap = (target, name, countIndex, instanceIndex) => {
      const draw = target[name];
      if (typeof draw !== 'function') return;
      target[name] = function (...args) {
        const result = draw.apply(this, args);
        record(args[0], args[countIndex], instanceIndex === undefined ? 1 : args[instanceIndex]);
        return result;
      };
    };
    wrap(gl, 'drawArrays', 2);
    wrap(gl, 'drawElements', 1);
    wrap(gl, 'drawRangeElements', 3);
    wrap(gl, 'drawArraysInstanced', 2, 3);
    wrap(gl, 'drawElementsInstanced', 1, 4);

    const getExtension = gl.getExtension;
    const wrapped = new Set();
    gl.getExtension = function (name) {
      const extension = getExtension.call(this, name);
      if (name === 'ANGLE_instanced_arrays' && extension && !wrapped.has(extension)) {
        wrapped.add(extension);
        wrap(extension, 'drawArraysInstancedANGLE', 2, 3);
        wrap(extension, 'drawElementsInstancedANGLE', 1, 4);
      }
      return extension;
    };
    const rendererInfo = getExtension.call(gl, 'WEBGL_debug_renderer_info');
    if (rendererInfo) counter.renderer = gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL);
    return gl;
  };
  window.__alpineDraws = canvas => games.get(canvas);
}

async function measure({warmupMs, durationMs, seed, variant}) {
  const canvas = document.querySelector('canvas.minigame-canvas');
  const session = window.__island.ui.activityInterface.current.session;
  const counter = window.__alpineDraws(canvas);
  if (!counter) throw new Error('Alpine canvas did not start WebGL');
  const keyFor = {left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', slide: 'ArrowDown'};
  let choose;
  if (variant === 'runner') {
    const {createRunnerBot} = await import(new URL('design/alpine-runner-integration-patches-v1/sim/bots.mjs', location.href).href);
    choose = createRunnerBot('hard', {seed});
  }
  canvas.focus({preventScroll: true});
  const startedAt = performance.now();
  let previousCalls = counter.calls, previousTriangles = counter.triangles;
  let startDistance;
  const samples = [];
  const snapshot = await new Promise((resolve, reject) => {
    function sample(stamp) {
      try {
        const snapshot = session.snapshot;
        const distance = snapshot.frame?.distance ?? snapshot.frame?.player?.s;
        if (snapshot.phase !== 'racing') throw new Error(`Alpine left the race at ${distance} m (${snapshot.phase})`);
        const elapsedMs = stamp - startedAt;
        const draws = counter.calls - previousCalls;
        if (elapsedMs >= warmupMs && draws > 0) {
          startDistance ??= distance;
          samples.push({stamp, calls: draws, triangles: counter.triangles - previousTriangles});
        }
        previousCalls = counter.calls;
        previousTriangles = counter.triangles;
        if (elapsedMs >= warmupMs + durationMs) {
          resolve(snapshot);
          return;
        }
        const key = choose && keyFor[choose(snapshot.frame)];
        if (key) {
          for (const type of ['keydown', 'keyup']) {
            canvas.dispatchEvent(new KeyboardEvent(type, {key, code: key, bubbles: true, cancelable: true}));
          }
        }
        requestAnimationFrame(sample);
      } catch (error) {
        reject(error);
      }
    }
    requestAnimationFrame(sample);
  });

  if (samples.length < 3) throw new Error(`Collected ${samples.length} rendered frames, increase PERF_SECONDS`);
  const intervals = samples.slice(1).map((frame, index) => frame.stamp - samples[index].stamp);
  const percentile = (values, fraction) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(fraction * sorted.length) - 1];
  };
  const round = value => Math.round(value * 100) / 100;
  const triangleCounts = samples.map(sample => sample.triangles);
  const duration = (samples.at(-1).stamp - samples[0].stamp) / 1000;
  return {
    duration: round(duration),
    frames: samples.length,
    fps: round((samples.length - 1) / duration),
    frameMs: {p50: round(percentile(intervals, 0.5)), p95: round(percentile(intervals, 0.95)), max: round(percentile(intervals, 1))},
    triangles: {p50: percentile(triangleCounts, 0.5), p95: percentile(triangleCounts, 0.95), max: percentile(triangleCounts, 1)},
    maxDrawCalls: percentile(samples.map(sample => sample.calls), 1),
    startDistance,
    endDistance: snapshot.frame?.distance ?? snapshot.frame?.player?.s,
    theme: snapshot.frame?.theme,
    renderer: counter.renderer,
    context: counter.type,
    viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
    buffer: {width: canvas.width, height: canvas.height},
    renderMetrics: snapshot.renderMetrics,
  };
}

function numberOption(name, fallback, minimum) {
  const value = Number(process.env[name] ?? fallback);
  assert.ok(Number.isFinite(value) && value >= minimum, `${name} must be a number of at least ${minimum}`);
  return value;
}

const variant = process.env.PERF_VARIANT ?? 'runner';
assert.ok(['runner', 'legacy'].includes(variant), 'PERF_VARIANT must be runner or legacy');
const quality = process.env.PERF_QUALITY ?? 'low';
assert.ok(['low', 'high'].includes(quality), 'PERF_QUALITY must be low or high');
const theme = process.env.PERF_THEME;
if (theme) {
  assert.equal(variant, 'runner', 'PERF_THEME is available for the runner');
  assert.match(theme, /^[\w-]+$/, 'PERF_THEME must be a theme id');
}
const durationMs = 1000 * numberOption('PERF_SECONDS', 15, 3);
const warmupMs = 1000 * numberOption('PERF_WARMUP_SECONDS', 3, 0);
const seed = numberOption('PERF_SEED', 7, 0);
const stage = numberOption('PERF_STAGE', 1, 1);
assert.ok(Number.isSafeInteger(stage) && stage <= 3, 'PERF_STAGE must be 1, 2, or 3');
const triangleBudget = numberOption('PERF_TRIANGLE_BUDGET', quality === 'low' ? 60_000 : 100_000, 1);
const minFps = numberOption('PERF_MIN_FPS', 0, 0);
const software = process.env.PERF_SOFTWARE !== '0';
const sizes = (process.env.PERF_SIZES ?? '390x844,844x390').split(',').map(size => {
  assert.match(size, /^[1-9]\d*x[1-9]\d*$/, 'PERF_SIZES must contain widthxheight values');
  const [width, height] = size.split('x').map(Number);
  return {width, height};
});

const defaultRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const root = path.resolve(process.env.ALPINE_TEST_ROOT || defaultRoot);
const {islandChromium, serveIsland} = await import(pathToFileURL(path.join(root, 'tests/helpers/island-browser.mjs')));
const chromium = await islandChromium();
const server = await serveIsland();
let browser;
const results = [];
try {
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
  if (software) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args});
  for (const viewport of sizes) {
    const context = await browser.newContext({viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, timezoneId: 'Asia/Jerusalem'});
    try {
      await context.addInitScript(installDrawCounter);
      await context.route('**/data/featureFlags.json*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, json: {...await response.json(), events: false}});
      });
      if (variant === 'runner') {
        const botPath = fileURLToPath(new URL('../sim/bots.mjs', import.meta.url));
        await context.route('**/design/alpine-runner-integration-patches-v1/sim/bots.mjs', route => {
          return route.fulfill({path: botPath, contentType: 'text/javascript'});
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const query = new URLSearchParams({dev: '1', quality});
      if (variant === 'legacy') query.set('alpineRunner', '0');
      else query.set('alpineRunnerSeed', seed);
      await page.goto(`${server.url}?${query}`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
      await page.locator('[data-action=avatar-start]').tap();
      await page.evaluate(({seed, stage}) => {
        const {engine, ui} = window.__island;
        const activity = ui.activityInterface;
        engine.skipTutorial();
        if (!engine.state.instructionsSeen.includes('alpineRush')) engine.state.instructionsSeen.push('alpineRush');
        engine.state.minigameProgress.alpineRush.stage = stage;
        const now = activity.now;
        try {
          activity.now = () => seed;
          activity.launch('alpineRush', undefined, stage);
        } finally {
          activity.now = now;
        }
      }, {seed, stage});
      const start = page.locator('[data-action=alpine-start]');
      await start.waitFor({state: 'visible'});
      await page.waitForFunction(() => {
        const snapshot = window.__island.ui.activityInterface.current?.session.snapshot;
        return snapshot?.loaded || snapshot?.error;
      });
      const {mode, error} = await page.evaluate(() => window.__island.ui.activityInterface.current.session.snapshot);
      assert.ok(!error, `Alpine failed to load: ${error}`);
      if (variant === 'runner') assert.equal(mode, 'runner', 'expected the default Alpine runner');
      else assert.notEqual(mode, 'runner', 'expected the existing Alpine race');
      if (theme) {
        await page.locator(`[data-action="alpine-runner-theme"][data-theme="${theme}"]`).click();
      }
      await start.click();
      await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session.snapshot.phase === 'racing');
      const pending = page.evaluate(measure, {warmupMs, durationMs, seed, variant});
      let timeout;
      try {
        const result = await Promise.race([pending, new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Alpine performance measurement timed out')), warmupMs + durationMs + 120_000);
        })]);
        assert.deepEqual(errors, [], 'page errors during measurement');
        if (theme) assert.equal(result.theme, theme, 'selected theme must be active during the measurement');
        if (variant === 'runner') assert.equal(result.renderMetrics?.missingTextures, 0, 'runner textures loaded');
        results.push({requestedViewport: viewport, ...result});
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      await context.close();
    }
  }
  const report = {variant, quality, theme, stage, seed, software, browser: browser.version(), warmupMs, durationMs, triangleBudget, minFps, results};
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, json);
  process.stdout.write(json);
  for (const result of results) {
    const size = `${result.viewport.width}x${result.viewport.height}`;
    assert.ok(result.triangles.max > 0, 'game rendered no triangles');
    if (variant === 'runner') assert.ok(result.triangles.max <= triangleBudget, `${size} submitted ${result.triangles.max} triangles, budget ${triangleBudget}`);
    assert.ok(result.fps >= minFps, `${size} averaged ${result.fps} FPS, minimum ${minFps}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
