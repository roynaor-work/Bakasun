import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const playwrightVersion = JSON.parse(await readFile(new URL(import.meta.resolve('playwright-core/package.json')), 'utf8')).version;
const launchFlags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const screenshotViewport = { width: 420, height: 600 };
const phoneViewport = { width: 390, height: 844 };
const stages = ['blockout', 'shaped', 'final'];
const views = ['front', 'side', 'back', 'threeQuarter'];
const optimizationViews = ['front', 'side', 'threeQuarter'];
const viewFiles = { front: 'front.png', side: 'side.png', back: 'back.png', threeQuarter: 'three-quarter.png' };
const errors = [];
const warnings = [];
const requestURLs = new Set();
const externalRequests = [];
const artifacts = [];
const stageShots = {};
const viewMetrics = {};
const controlChecks = [];

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

async function openLab(context, label, { capture = true } = {}) {
  const page = await context.newPage();
  watch(page, label);
  const errorStart = errors.length;
  try {
    await page.goto(`${service.url}/?${capture ? 'capture=1&' : ''}view=front&stage=final&palette=blue`, { waitUntil: 'networkidle' });
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

async function setAppearance(page, { view = 'front', stage = 'final', palette = 'blue', detail = 'balanced' } = {}) {
  await page.evaluate(({ view, stage, palette, detail }) => {
    window.kidLab.setDetail(detail, { deferRender: true });
    window.kidLab.setPalette(palette);
    window.kidLab.setStage(stage);
    window.kidLab.setView(view);
    window.kidLab.render();
  }, { view, stage, palette, detail });
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  return page.evaluate(() => window.kidLab.getMetrics());
}

async function saveShot(page, relative, { fullPage = false } = {}) {
  const path = resolve(shots, relative);
  await page.screenshot({ path, animations: 'disabled', fullPage });
  const pixels = PNG.sync.read(await readFile(path));
  assert(pixels.width > 0 && pixels.height > 0, `Empty screenshot: ${relative}`);
  artifacts.push(relative);
}

const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length, values };
};

async function checkControls(page, label) {
  for (const [property, value] of [['detail', 'dense'], ['palette', 'coral'], ['stage', 'blockout'], ['view', 'back'], ['stage', 'final'], ['detail', 'balanced'], ['palette', 'blue'], ['view', 'front']]) {
    const button = page.locator(`button[data-${property}="${value}"]`);
    await button.click();
    const metrics = await page.evaluate(() => window.kidLab.getMetrics());
    assert.equal(metrics[property], value, `${label} ${property} control did not update the renderer`);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', `${label} ${property} control is not marked active`);
    controlChecks.push({ page: label, property, value, actual: metrics[property], modelTriangles: metrics.modelTriangles });
  }
  assert((await page.evaluate(() => window.kidLab.getMetrics())).parts.includes('number'), `${label} final model numbers missing`);
}

async function readyUIImages(page) {
  await page.locator('#comparison').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#comparison')?.complete && document.querySelector('#comparison').naturalWidth > 0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function benchmark(page, { stage = 'final', detail = 'balanced' } = {}) {
  await setAppearance(page, { stage, detail });
  const builds = await page.evaluate(stage => {
    const wallTimes = [], modelTimes = [];
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
  assert(Number.isFinite(builds.metrics.drawCalls), 'Draw calls must come from renderer.info.render.calls');
  const rendering = await page.evaluate(() => window.kidLab.measure({ durationMs: 5000, warmupMs: 1000 }));
  console.log(`נמדד ${stage}/${detail}: ${builds.metrics.modelTriangles} משולשים, ${builds.metrics.drawCalls} draw calls, ${rendering.fps.toFixed(1)} FPS`);
  return { stage, detail, geometry: builds.metrics, buildTimeMs: summarize(builds.modelTimes), rebuildWallTimeMs: summarize(builds.wallTimes), rendering };
}

/** Pixel differences compare the same camera/light/render settings, without registration or deformation. */
async function pixelDifference(first, second) {
  const a = PNG.sync.read(await readFile(resolve(shots, first)));
  const b = PNG.sync.read(await readFile(resolve(shots, second)));
  assert.equal(a.width, b.width, 'Pixel comparison width differs');
  assert.equal(a.height, b.height, 'Pixel comparison height differs');
  const backgroundA = [...a.data.slice(0, 3)], backgroundB = [...b.data.slice(0, 3)];
  let absolute = 0, squared = 0, changed = 0, union = 0, intersection = 0, foregroundAbsolute = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    let maximumDifference = 0, distanceA = 0, distanceB = 0, pixelAbsolute = 0;
    for (let c = 0; c < 3; c++) {
      const difference = Math.abs(a.data[offset + c] - b.data[offset + c]);
      absolute += difference; squared += difference * difference; pixelAbsolute += difference;
      maximumDifference = Math.max(maximumDifference, difference);
      distanceA = Math.max(distanceA, Math.abs(a.data[offset + c] - backgroundA[c]));
      distanceB = Math.max(distanceB, Math.abs(b.data[offset + c] - backgroundB[c]));
    }
    if (maximumDifference > 8) changed++;
    const foregroundA = distanceA > 14, foregroundB = distanceB > 14;
    if (foregroundA || foregroundB) { union++; foregroundAbsolute += pixelAbsolute; }
    if (foregroundA && foregroundB) intersection++;
  }
  const pixels = a.width * a.height;
  return { first, second, width: a.width, height: a.height, meanAbsoluteRGB: absolute / (pixels * 3), rootMeanSquareRGB: Math.sqrt(squared / (pixels * 3)), changedPixelPercent: changed * 100 / pixels, changedThreshold: 8, foregroundMeanAbsoluteRGB: foregroundAbsolute / Math.max(union * 3, 1), silhouetteIoU: intersection / Math.max(union, 1), foregroundThreshold: 14, foregroundPixels: union };
}

async function preserveBaseline() {
  await mkdir(resolve(shots, 'optimization'), { recursive: true });
  const copies = optimizationViews.map(view => [`baseline-${view}.png`, `baseline-${view}.png`]);
  copies.push(['baseline-metrics.json', 'baseline-metrics.json']);
  for (const [source, destination] of copies) {
    try { await copyFile(resolve(root, 'work', source), resolve(shots, 'optimization', destination)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  try { return JSON.parse(await readFile(resolve(shots, 'optimization/baseline-metrics.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function drawOptimizationBoard(page, optimization) {
  const width = 1800, height = 1090;
  await page.setViewportSize({ width, height });
  await page.setContent(`<html lang="he" dir="rtl"><meta charset="utf-8"><style>html,body{margin:0;background:#f6f4ee}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas></html>`);
  await page.evaluate(async ({ width, height, optimization, optimizationViews }) => {
    await document.fonts.ready;
    const ctx = document.querySelector('canvas').getContext('2d');
    const text = (label, x, y, size = 18) => { ctx.fillStyle = '#294b53'; ctx.font = `${size}px Arial,sans-serif`; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillText(label, x, y); };
    const load = source => new Promise((accept, reject) => { const img = new Image(); img.onload = () => accept(img); img.onerror = reject; img.src = source; });
    const labels = { front: 'חזית', side: 'צד', threeQuarter: 'שלושה רבעים' };
    ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, width, height);
    text('שיפור הגוף ובדיקת צפיפות הרשת · אותה מצלמה, תאורה ורזולוציה', width / 2, 34, 28);
    for (let row = 0; row < 2; row++) {
      const top = 56 + row * 496;
      text(row === 0 ? 'לפני השיפור לצד התוצאה המאוזנת' : 'רשת צפופה לצד רשת מאוזנת', width / 2, top + 21, 23);
      for (let col = 0; col < optimizationViews.length; col++) {
        const view = optimizationViews[col], x = 12 + col * 596;
        text(labels[view], x + 284, top + 49, 21);
        for (let side = 0; side < 2; side++) {
          const name = side === 1 ? 'balanced' : row === 0 ? 'baseline' : 'dense';
          const label = side === 1 ? 'מאוזן · אחרי' : row === 0 ? 'לפני' : 'צפוף';
          text(label, x + 136 + side * 292, top + 73, 18);
          const img = await load(`/shots/optimization/${name}-${view}.png`);
          ctx.drawImage(img, x + side * 292, top + 84, 280, 400);
        }
      }
    }
    const comparisons = optimization.pixelDiff.denseVsBalanced;
    text(`פער צפוף/מאוזן RGB ממוצע: ${comparisons.map(d => d.meanAbsoluteRGB.toFixed(3)).join(' / ')} מתוך 255 · אחוז פיקסלים שונים ביותר מ־8: ${comparisons.map(d => d.changedPixelPercent.toFixed(2) + '%').join(' / ')}`, width / 2, 1070, 17);
  }, { width, height, optimization, optimizationViews });
}

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
  const baseline = await preserveBaseline();
  for (const view of views) {
    viewMetrics[view] = await setAppearance(page, { view });
    await saveShot(page, viewFiles[view]);
  }
  const detailShots = { balanced: {}, dense: {} };
  for (const view of optimizationViews) {
    await copyFile(resolve(shots, viewFiles[view]), resolve(shots, `optimization/balanced-${view}.png`));
    artifacts.push(`optimization/balanced-${view}.png`);
    detailShots.balanced[view] = viewMetrics[view];
    detailShots.dense[view] = await setAppearance(page, { view, detail: 'dense' });
    await saveShot(page, `optimization/dense-${view}.png`);
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
    measurements.push(await benchmark(phonePage, { stage, detail: 'balanced' }));
  }
  const denseMeasurement = await benchmark(phonePage, { stage: 'final', detail: 'dense' });
  await setAppearance(phonePage, { stage: 'final', detail: 'balanced' });
  const extendedBalancedRendering = await phonePage.evaluate(() => window.kidLab.measure({ durationMs: 10000, warmupMs: 1000 }));
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
  const pixelDiff = { denseVsBalanced: [], baselineVsBalanced: [] };
  for (const view of optimizationViews) {
    pixelDiff.denseVsBalanced.push(await pixelDifference(`optimization/dense-${view}.png`, `optimization/balanced-${view}.png`));
    if (baseline) pixelDiff.baselineVsBalanced.push(await pixelDifference(`optimization/baseline-${view}.png`, `optimization/balanced-${view}.png`));
  }
  const optimization = {
    baselineCommit: 'ef6e17d5b6312ede14750275ac273c98903b092f',
    baseline,
    qualities: { balanced: measurements.find(row => row.stage === 'final'), dense: denseMeasurement },
    extendedBalancedRendering,
    screenshots: detailShots,
    pixelDiff,
    pixelDiffMethod: 'No registration, resizing, recoloring, or warping. Images have identical 420×600 viewport and DPR 1. RGB error is measured on 0–255 channels. changedPixelPercent uses max channel difference >8. Foreground mask uses max RGB distance >14 from each image top-left background; silhouetteIoU includes sufficiently dark ground shadow and is an approximate mask, not semantic segmentation. Low image error is evidence of visual preservation, not a substitute for visual inspection.',
  };
  await writeFile(resolve(shots, 'optimization/metrics.json'), `${JSON.stringify(optimization, null, 2)}\n`);
  if (baseline) {
    await drawOptimizationBoard(boardPage, optimization);
    await saveShot(boardPage, 'optimization.png');
  }
  // UI previews include the comparison image just written by this run.
  const desktopUI = await openLab(context, 'desktop-controls', { capture: false });
  await desktopUI.setViewportSize({ width: 1440, height: 1000 });
  await checkControls(desktopUI, 'desktop');
  await readyUIImages(desktopUI);
  await saveShot(desktopUI, 'desktop-lab.png', { fullPage: true });
  await desktopUI.close();
  const phoneUIContext = await browser.newContext({ viewport: phoneViewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await phoneUIContext.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  const phoneUI = await openLab(phoneUIContext, 'phone-controls', { capture: false });
  await checkControls(phoneUI, 'phone');
  await readyUIImages(phoneUI);
  await saveShot(phoneUI, 'phone-lab.png', { fullPage: true });
  await phoneUIContext.close();

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
    context: { viewport: phoneViewport, deviceScaleFactor: 2, browser: await browser.version(), playwright: playwrightVersion, ...browserInfo, executablePath, launchFlags, softwareRendering: true, physicalPhone: false },
    methodology: {
      build: '20 synchronous model rebuilds per stage with intermediate renders deferred. buildTimeMs measures geometry/material/texture construction; rebuildWallTimeMs includes disposal and scene insertion. Only the last model is uploaded/rendered after the loop. No GPU upload time is claimed.',
      fps: 'One active rendering page; real continuous requestAnimationFrame rendering, 1000 ms warm-up and 5000 ms measured per stage in a 390×844 CSS pixel viewport at DPR 2. Headless Chromium uses SwiftShader software rendering; this is not a physical phone benchmark.',
      triangles: 'modelTriangles sums indexed/non-indexed model geometry only; sceneTriangles separately counts all renderable geometry including studio ground. Number textures do not add glyph mesh triangles.',
      drawCalls: 'renderer.info.render.calls after the explicit final frame render; main scene pass only because renderer.info auto-reset occurs between shadow and main passes. Material groups count separately. Shadow maps are cached during FPS measurement.',
      comparison: 'Original reference crops are paired with neck-to-ankle projected model crops, preserving each image aspect ratio. The fourth reference column repeats front and is paired with front. No three-quarter target exists.',
    },
    stages: measurements,
    optimization,
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
    verification: { requiredParts, missingParts, excludedPartsFound, controlChecks, consoleErrors: errors, consoleWarnings: warnings, externalRequests, localRequestPaths: [...requestURLs].filter(url => /^https?:/.test(url)).map(url => new URL(url).pathname).sort() },
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
