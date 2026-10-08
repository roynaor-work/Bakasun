import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { startServer } from './serve.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const shots = resolve(root, 'shots');
const reference = JSON.parse(await readFile(resolve(root, 'reference.json'), 'utf8'));
const launchFlags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const screenshotViewport = { width: 420, height: 600 };
const phoneViewport = { width: 390, height: 844 };
const stages = ['blockout', 'shaped', 'final'];
const views = ['front', 'side', 'back', 'threeQuarter'];
const viewFiles = { front: 'front.png', side: 'side.png', back: 'back.png', threeQuarter: 'three-quarter.png' };
const errors = [];
const warnings = [];
const requestURLs = new Set();
const externalRequests = [];
const artifacts = [];
const stageShots = {};
const viewMetrics = {};

await mkdir(resolve(shots, 'stages'), { recursive: true });
const service = await startServer();
const origin = new URL(service.url).origin;
let browser;

function watch(page, label) {
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ page: label, text: message.text() });
    if (message.type() === 'warning') warnings.push({ page: label, text: message.text() });
  });
  page.on('pageerror', error => errors.push({ page: label, text: error.message }));
  page.on('request', request => {
    requestURLs.add(request.url());
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
}

async function openLab(context, label) {
  const page = await context.newPage();
  watch(page, label);
  const errorStart = errors.length;
  try {
    await page.goto(`${service.url}/?capture=1&view=front&stage=final&palette=blue`, { waitUntil: 'networkidle' });
    if (errors.length > errorStart) throw new Error('Browser failed while loading the lab');
    await page.waitForFunction(() => window.kidLab?.ready === true, null, { timeout: 30_000 });
  } catch (cause) {
    await mkdir(resolve(root, 'work'), { recursive: true });
    const state = await page.evaluate(() => ({ url: location.href, title: document.title, ready: window.kidLab?.ready, errorMessage: document.querySelector('#error')?.textContent, canvasPresent: !!document.querySelector('canvas') })).catch(() => null);
    await page.screenshot({ path: resolve(root, `work/capture-error-${label}.png`) }).catch(() => {});
    const report = { cause: cause.message, state, errors: errors.slice(errorStart), warnings };
    await writeFile(resolve(root, 'work/capture-failure.json'), `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`Lab did not become ready: ${JSON.stringify(report)}`, { cause });
  }
  return page;
}

async function setAppearance(page, { view = 'front', stage = 'final', palette = 'blue' } = {}) {
  await page.evaluate(({ view, stage, palette }) => {
    window.kidLab.setPalette(palette);
    window.kidLab.setStage(stage);
    window.kidLab.setView(view);
    window.kidLab.render();
  }, { view, stage, palette });
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  return page.evaluate(() => window.kidLab.getMetrics());
}

async function saveShot(page, relative) {
  const path = resolve(shots, relative);
  await page.screenshot({ path, animations: 'disabled' });
  const pixels = PNG.sync.read(await readFile(path));
  assert(pixels.width > 0 && pixels.height > 0, `Empty screenshot: ${relative}`);
  artifacts.push(relative);
}

const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length, values };
};

/** A browser canvas only lays out the original pixels and the captured renders. */
async function drawBoard(page, { kind, reference, viewMetrics, stageShots }) {
  const comparison = kind === 'comparison';
  const width = comparison ? 1520 : 1320;
  const height = comparison ? 1136 : 798;
  await page.setViewportSize({ width, height });
  await page.setContent(`<html lang="he" dir="rtl"><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#f6f4ee}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas></html>`);
  await page.evaluate(async ({ comparison, width, height, reference, viewMetrics, stageShots }) => {
    await document.fonts.ready;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const load = source => new Promise((accept, reject) => {
      const image = new Image();
      image.onload = () => accept(image);
      image.onerror = () => reject(new Error(`Image unavailable: ${source}`));
      image.src = source;
    });
    const text = (value, x, y, size = 20, color = '#294b53', align = 'center') => {
      ctx.fillStyle = color;
      ctx.font = `${size >= 22 ? '600' : '400'} ${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.direction = 'rtl';
      ctx.fillText(value, x, y);
    };
    const box = (x, y, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#dce4de'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    };
    ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, width, height);
    text(comparison ? 'מעבדת גוף ובגדים · היעד לצד מודל three.js' : 'לפני ואחרי · שלושה שלבים מאותו קוד בנייה', width / 2, 44, 30);
    text('מצלמה ותאורה קבועות בכל הצילומים · ערכת כחול', width / 2, 77, 18, '#617779');
    if (comparison) {
      const target = await load(reference.url);
      const cropHeight = reference.bodyCrop.bottom - reference.bodyCrop.top;
      for (let i = 0; i < reference.views.length; i++) {
        const view = reference.views[i];
        const modelView = view.name === 'frontRepeat' ? 'front' : view.name;
        const model = await load(`/shots/${modelView === 'threeQuarter' ? 'three-quarter' : modelView}.png`);
        const projection = viewMetrics[modelView].projection;
        const pairX = 24 + (i % 2) * 752;
        const pairY = 104 + Math.floor(i / 2) * 464;
        const panelWidth = 344;
        const imageTop = pairY + 67;
        const bodyHeight = 366;
        text(view.label, pairX + 360, pairY + 23, i === 3 ? 20 : 24);
        text('תמונת יעד', pairX + 172, pairY + 52, 18);
        text('המודל שנבנה', pairX + 536, pairY + 52, 18);
        box(pairX, imageTop, panelWidth, bodyHeight);
        box(pairX + 364, imageTop, panelWidth, bodyHeight);
        const targetWidth = (view.right - view.left) * bodyHeight / cropHeight;
        ctx.drawImage(target, view.left, reference.bodyCrop.top, view.right - view.left, cropHeight,
          pairX + (panelWidth - targetWidth) / 2, imageTop, targetWidth, bodyHeight);
        const sourceHeight = projection.ankleY - projection.neckY;
        if (!(sourceHeight > 0)) throw new Error('Missing neck/ankle projection for comparison');
        const scale = bodyHeight / sourceHeight;
        const centerX = projection.centerX ?? model.width / 2;
        const sourceWidth = Math.min(model.width, panelWidth / scale);
        const sourceX = Math.max(0, Math.min(model.width - sourceWidth, centerX - sourceWidth / 2));
        const drawWidth = sourceWidth * scale;
        ctx.drawImage(model, sourceX, projection.neckY, sourceWidth, sourceHeight,
          pairX + 364 + (panelWidth - drawWidth) / 2, imageTop, drawWidth, bodyHeight);
        text('יישור לפי צוואר–קרסול; שימור יחס רוחב/גובה', pairX + 360, imageTop + bodyHeight + 23, 16, '#617779');
      }
      text('פיקסלי היעד נקראו ישירות מהקובץ המקורי; חיתוך בלבד, ללא שינוי צבע או צורה.', width / 2, 1084, 18);
      text('הראש והנעליים מחוץ לחיתוך. כפות הידיים ברפרנס מחוץ למשימה. מבט ¾ מצולם בנפרד: אין לו יעד מקביל בגיליון.', width / 2, 1116, 17, '#617779');
    } else {
      const labels = ['לפני: גושים ראשוניים', 'ביניים: מעטפת מעוצבת', 'אחרי: ביגוד וקפלים רכים'];
      const names = ['blockout', 'shaped', 'final'];
      for (let i = 0; i < names.length; i++) {
        const image = await load(`/shots/stages/${names[i]}-front.png`);
        const x = 18 + i * 434;
        text(labels[i], x + 210, 121, 24);
        box(x, 146, 420, 600);
        ctx.drawImage(image, x, 146, 420, 600);
        text(`${stageShots[names[i]].modelTriangles.toLocaleString('en-US')} משולשים במודל`, x + 210, 775, 18);
      }
    }
  }, { comparison, width, height, reference, viewMetrics, stageShots });
}

try {
  browser = await chromium.launch({ executablePath, args: launchFlags, headless: true });
  const context = await browser.newContext({ viewport: screenshotViewport, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  const page = await openLab(context, 'screenshots');
  for (const view of views) {
    viewMetrics[view] = await setAppearance(page, { view });
    await saveShot(page, viewFiles[view]);
  }
  await setAppearance(page, { palette: 'coral', view: 'threeQuarter' });
  await saveShot(page, 'coral.png');
  for (const stage of stages) {
    stageShots[stage] = await setAppearance(page, { stage });
    await saveShot(page, `stages/${stage}-front.png`);
  }

  // One active renderer during measurement; screenshot RAF must not compete.
  await page.close();
  const phoneContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await phoneContext.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  const phonePage = await openLab(phoneContext, 'phone-benchmark');
  const measurements = [];
  for (const stage of stages) {
    await setAppearance(phonePage, { stage });
    const builds = await phonePage.evaluate(stage => {
      const wallTimes = [];
      const modelTimes = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        window.kidLab.setStage(stage, { deferRender: true });
        wallTimes.push(performance.now() - start);
        modelTimes.push(window.kidLab.getMetrics().buildTimeMs);
      }
      window.kidLab.render();
      return { wallTimes, modelTimes, metrics: window.kidLab.getMetrics() };
    }, stage);
    assert(builds.modelTimes.every(Number.isFinite), 'Model buildTimeMs must be a measured number');
    const rendering = await phonePage.evaluate(() => window.kidLab.measure({ durationMs: 5000, warmupMs: 1000 }));
    measurements.push({ stage, geometry: builds.metrics, buildTimeMs: summarize(builds.modelTimes), rebuildWallTimeMs: summarize(builds.wallTimes), rendering });
    console.log(`נמדד ${stage}: ${builds.metrics.modelTriangles} משולשים, ${rendering.fps.toFixed(1)} FPS`);
  }
  await setAppearance(phonePage, { view: 'front' });
  await saveShot(phonePage, 'phone-front.png');
  await setAppearance(phonePage, { view: 'threeQuarter' });
  await saveShot(phonePage, 'phone.png');
  const browserInfo = await phonePage.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      drawingBuffer: gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : null,
      gpu: info ? { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) } : null,
      webglVersion: gl?.getParameter(gl.VERSION),
    };
  });

  await phonePage.close();
  await phoneContext.close();
  const boardPage = await context.newPage();
  watch(boardPage, 'comparison-board');
  // Establish the local origin without loading a second continuously rendering lab.
  await boardPage.goto(`${service.url}/reference.json`, { waitUntil: 'networkidle' });
  await drawBoard(boardPage, { kind: 'comparison', reference, viewMetrics, stageShots });
  await saveShot(boardPage, 'comparison.png');
  await drawBoard(boardPage, { kind: 'stages', reference, viewMetrics, stageShots });
  await saveShot(boardPage, 'before-after.png');

  const sourceBytes = await readFile(resolve(root, reference.source));
  const sourceImage = PNG.sync.read(sourceBytes);
  assert.equal(sourceImage.width, reference.size.width, 'Reference width changed');
  assert.equal(sourceImage.height, reference.size.height, 'Reference height changed');
  const requiredParts = ['torso', 'neck', 'jersey', 'collar', 'arm', 'sleeve', 'shorts', 'leg', 'sock', 'number'];
  const finalParts = stageShots.final.parts;
  const missingParts = requiredParts.filter(part => !finalParts.includes(part));
  const excludedPartsFound = finalParts.filter(part => ['head', 'hand', 'shoe', 'foot'].includes(part));
  const metrics = {
    capturedAt: new Date().toISOString(),
    context: { viewport: phoneViewport, deviceScaleFactor: 2, browser: await browser.version(), ...browserInfo, executablePath, launchFlags, softwareRendering: true, physicalPhone: false },
    methodology: {
      build: '20 synchronous model rebuilds per stage with intermediate renders deferred. buildTimeMs measures geometry/material/texture construction; rebuildWallTimeMs includes disposal and scene insertion. Only the last model is uploaded/rendered after the loop. No GPU upload time is claimed.',
      fps: 'One active rendering page; real continuous requestAnimationFrame rendering, 1000 ms warm-up and 5000 ms measured per stage in a 390×844 CSS pixel viewport at DPR 2. Headless Chromium uses SwiftShader software rendering; this is not a physical phone benchmark.',
      triangles: 'modelTriangles sums indexed/non-indexed model geometry only; sceneTriangles separately counts all renderable geometry including studio ground. Number textures do not add glyph mesh triangles.',
      comparison: 'Original reference crops are paired with neck-to-ankle projected model crops, preserving each image aspect ratio. The fourth reference column repeats front and is paired with front. No three-quarter target exists.',
    },
    stages: measurements,
  };
  await writeFile(resolve(shots, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  const audit = {
    capturedAt: metrics.capturedAt,
    screenshotContext: { viewport: screenshotViewport, deviceScaleFactor: 1 },
    browser: metrics.context,
    source: { file: reference.source, sha256: createHash('sha256').update(sourceBytes).digest('hex'), pixelAccess: true, size: reference.size, crop: reference.bodyCrop, views: reference.views },
    artifacts,
    viewMetrics,
    stageShots,
    verification: { requiredParts, missingParts, excludedPartsFound, consoleErrors: errors, consoleWarnings: warnings, externalRequests, localRequestPaths: [...requestURLs].filter(url => /^https?:/.test(url)).map(url => new URL(url).pathname).sort() },
  };
  await writeFile(resolve(shots, 'capture.json'), `${JSON.stringify(audit, null, 2)}\n`);
  assert.equal(externalRequests.length, 0, 'Capture attempted an external request');
  assert.equal(errors.length, 0, `Browser errors: ${JSON.stringify(errors)}`);
  assert.equal(missingParts.length, 0, `Required body/clothing parts missing: ${missingParts.join(', ')}`);
  assert.equal(excludedPartsFound.length, 0, `Parts outside task scope were built: ${excludedPartsFound.join(', ')}`);
  assert(measurements.every(row => row.geometry.modelTriangles > 0 && row.geometry.sceneTriangles >= row.geometry.modelTriangles), 'Triangle counts are missing or invalid');
  assert(measurements.every(row => Number.isFinite(row.rendering.fps) && row.rendering.fps > 0), 'Actual browser FPS missing');
  console.log(JSON.stringify({ shots: artifacts, measured: measurements.map(row => ({ stage: row.stage, triangles: row.geometry.modelTriangles, medianBuildMs: row.buildTimeMs.median, fps: row.rendering.fps })), errors: errors.length, externalRequests: externalRequests.length }, null, 2));
} finally {
  await browser?.close();
  await service.close();
}
