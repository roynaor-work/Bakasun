import assert from 'node:assert/strict';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The default serves this checkout on an ephemeral loopback port. Override the
// URL to inspect a separately started server. Dependencies are never downloaded.
let playwright;
try { playwright = await import('playwright'); }
catch {
  const modulePath = process.env.ISLAND_PLAYWRIGHT || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  playwright = await import(pathToFileURL(modulePath).href);
}
const { chromium } = playwright;
let server;
if (!process.env.ISLAND_BASE_URL) {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const islandRoot = path.join(repoRoot, 'workout', 'island');
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/workout/island/')) { response.writeHead(403).end(); return; }
      let filename = path.resolve(islandRoot, pathname.slice('/workout/island/'.length) || '.');
      if (filename !== islandRoot && !filename.startsWith(islandRoot + path.sep)) { response.writeHead(403).end(); return; }
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      response.writeHead(200, { 'content-type': types[path.extname(filename)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
}
const baseUrl = new URL(process.env.ISLAND_BASE_URL || `http://127.0.0.1:${server.address().port}/`);
const target = new URL('workout/island/?dev=1', baseUrl).href;
const appPath = new URL('.', target).pathname;
let executablePath = process.env.ISLAND_BROWSER;
if (!executablePath && process.platform === 'win32') {
  executablePath = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
  await access(executablePath);
}
const directory = fileURLToPath(new URL('./screenshots/', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: [
  '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
] });
const reports = [];

async function checkViewport(width, height, label) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600 });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [], externalRequests = [], outsideIslandRequests = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseUrl.origin) externalRequests.push(url.href);
    if (['http:', 'https:'].includes(url.protocol) && url.origin === baseUrl.origin && !url.pathname.startsWith(appPath)) outsideIslandRequests.push(url.href);
  });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  const shots = [];
  async function screenshot(name) {
    const filename = `island-${label}-${name}.png`;
    await page.screenshot({ path: path.join(directory, filename), fullPage: false }); shots.push(filename);
  }
  async function clickCell(x, z) {
    const point = await page.evaluate(({ x, z }) => window.__island.view.screenForCell(x, z), { x, z });
    assert.ok(point.x >= 0 && point.y >= 0 && point.x < width && point.y < height, `cell ${x},${z} is on-screen`);
    if (width < 600) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    return point;
  }
  async function selectType(typeId) {
    const category = await page.evaluate(id => window.__island.engine.registry.buildings.get(id).category, typeId);
    await page.locator(`[data-category="${category}"]`).click();
    const card = page.locator(`[data-building="${typeId}"]`);
    await card.scrollIntoViewIfNeeded(); await card.click();
  }
  async function place(typeId, x, z, greenShot) {
    const before = await page.evaluate(() => window.__island.engine.state.buildings.length);
    await selectType(typeId); await clickCell(x, z);
    await page.locator('#ghost-status[data-valid="true"]').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.__island.ui.currentGhost), { x, z }, `${typeId} snaps to requested cell`);
    assert.equal(await page.locator('#world').getAttribute('data-ghost'), 'valid');
    if (greenShot) await screenshot(greenShot);
    await page.locator('[data-action="place"]').click();
    await page.waitForFunction(count => window.__island.engine.state.buildings.length === count + 1, before);
    return page.evaluate(({ typeId, x, z }) => window.__island.engine.state.buildings.find(b => b.typeId === typeId && b.x === x && b.z === z), { typeId, x, z });
  }
  async function findCell(typeId, ignoreId) {
    return page.evaluate(({ typeId, ignoreId }) => {
      const { engine, view } = window.__island, candidates = [];
      const safe = point => [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => document.elementFromPoint(Math.round(point.x) + dx, Math.round(point.y) + dy)?.id === 'world');
      for (let z = 0; z < engine.state.world.size; z++) for (let x = 0; x < engine.state.world.size; x++) {
        if (!engine.validatePlacement(typeId, x, z, ignoreId).ok) continue;
        const point = view.screenForCell(x, z);
        if (!safe(point)) continue;
        candidates.push({ x, z, distance: Math.hypot(x - engine.state.world.size / 2, z - engine.state.world.size / 2) });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const cell = candidates[0]; return cell ? { x: cell.x, z: cell.z } : null;
    }, { typeId, ignoreId });
  }
  async function closeInfo() {
    const close = page.locator('[data-action="close-info"]');
    if (await close.isVisible()) await close.click();
  }
  try {
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded);
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    const avatarDialog = page.locator('[role="dialog"]');
    await avatarDialog.waitFor({ state: 'visible' });
    await page.locator('[data-field="gender"][data-value="girl"]').click();
    await page.locator('[data-field="hairstyle"][data-value="long"]').click();
    await page.locator('[data-field="shirtColor"]').nth(2).click();
    await page.locator('[data-action="avatar-start"]').click();
    await avatarDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__island.engine.state.avatar.gender), 'girl');
    await screenshot('tutorial');

    const steps = await page.evaluate(() => window.__island.data.tutorial.steps.map(step => ({ ...step, target: window.__island.data.config.tutorialPlacements[step.id] })));
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await place(step.buildType, step.target.x, step.target.z, i === 0 ? 'green' : undefined);
      assert.equal(await page.evaluate(() => window.__island.engine.state.tutorial.step), i + 1, 'only real construction completes a guide step');
    }
    assert.equal(await page.evaluate(() => window.__island.engine.state.tutorial.completed), true);

    // Overlap must be red, disabled, and cannot spend currency or place anything.
    await selectType('house'); await clickCell(4, 5);
    await page.locator('#ghost-status[data-valid="false"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ghost-status').getAttribute('data-reason'), 'reason.occupied');
    assert.equal(await page.locator('#world').getAttribute('data-ghost'), 'invalid');
    assert.equal(await page.locator('[data-action="place"]').isDisabled(), true);
    await screenshot('red');
    await page.locator('[data-action="cancel"]').click();

    // Inspect an actual service building and its real radius mesh.
    await clickCell(7, 5);
    await page.locator('.info-card:not([hidden])').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => Boolean(window.__island.view.radius)), true);
    await screenshot('info'); await closeInfo();

    // Fund the fixture through ordinary bounded economy ticks, not state injection.
    await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__island.engine.tick(60); });
    // The public integration hook opens stages while retaining all earlier buildings.
    assert.equal(await page.evaluate(() => window.islandApi.grantParts('general', 12).ok), true);
    await page.locator('[data-action="home"]').click();

    const allTypes = await page.evaluate(() => [...window.__island.engine.registry.buildings.values()].filter(b => !b.locked && !b.featureFlag).map(b => b.id));
    assert.equal(allTypes.length, 17);
    for (const typeId of allTypes) {
      if (await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.typeId === id), typeId)) continue;
      let cell = await findCell(typeId);
      // Extend access through real road selections and actual placement clicks.
      if (!cell) {
        const access = await page.evaluate(id => {
          const { engine, view } = window.__island, type = engine.registry.buildings.get(id);
          const visible = (x, z) => { const p = view.screenForCell(x, z); return [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => document.elementFromPoint(Math.round(p.x) + dx, Math.round(p.y) + dy)?.id === 'world'); };
          const candidates = [];
          for (let z = 0; z < engine.state.world.size; z++) for (let x = 0; x < engine.state.world.size; x++) {
            if (engine.validatePlacement(id, x, z).reason !== 'reason.road' || !visible(x, z)) continue;
            const [w, d] = type.footprint, perimeter = [];
            for (let dx = 0; dx < w; dx++) perimeter.push({ x: x + dx, z: z - 1 }, { x: x + dx, z: z + d });
            for (let dz = 0; dz < d; dz++) perimeter.push({ x: x - 1, z: z + dz }, { x: x + w, z: z + dz });
            const road = perimeter.find(p => engine.validatePlacement('road', p.x, p.z).ok && visible(p.x, p.z));
            if (road) candidates.push({ road, x, z, distance: Math.hypot(x - engine.state.world.size / 2, z - engine.state.world.size / 2) });
          }
          candidates.sort((a, b) => a.distance - b.distance); return candidates[0] || null;
        }, typeId);
        assert.ok(access, `room to add road access for ${typeId}`);
        await place('road', access.road.x, access.road.z); cell = await findCell(typeId);
      }
      assert.ok(cell, `valid visible location for ${typeId}`);
      await place(typeId, cell.x, cell.z);
    }
    const placedTypes = await page.evaluate(() => [...new Set(window.__island.engine.state.buildings.map(b => b.typeId))]);
    for (const id of allTypes) assert.ok(placedTypes.includes(id), `${id} placed by actual UI`);

    await page.locator('[data-category="defense"]').click();
    assert.equal(await page.locator('[data-building].locked').count(), 4);
    const beforeLocked = await page.evaluate(() => window.__island.engine.state.buildings.length);
    await page.locator('[data-building="wall"]').click();
    assert.equal(await page.evaluate(() => window.__island.ui.selected), null);
    assert.equal(await page.evaluate(() => window.__island.engine.state.buildings.length), beforeLocked);

    // Add a visible road, move it, remove it, and undo each action through the UI.
    const roadCell = await findCell('road'); assert.ok(roadCell);
    const road = await place('road', roadCell.x, roadCell.z);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road.id), false);
    const road2 = await place('road', roadCell.x, roadCell.z);
    await clickCell(roadCell.x, roadCell.z);
    const selectedInfo = await page.evaluate(() => window.__island.ui.infoId);
    if (width < 600) await page.locator('[data-action="move"]').tap(); else await page.locator('[data-action="move"]').click();
    const moveStart = await page.evaluate(() => ({ selected: window.__island.ui.selected, moving: window.__island.ui.movingId, ghost: window.__island.ui.currentGhost, dragged: window.__island.view.dragged, pointers: [...window.__island.view.pointers.keys()] }));
    assert.equal(moveStart.moving, road2.id, `move start diagnostic: ${JSON.stringify({ selectedInfo, road2, ...moveStart })}`);
    const moveCell = await findCell('road', road2.id); assert.ok(moveCell);
    // Ensure a genuinely different destination is used.
    let destination = moveCell;
    if (destination.x === roadCell.x && destination.z === roadCell.z) {
      destination = await page.evaluate(id => {
        const { engine, view } = window.__island, old = engine.state.buildings.find(b => b.id === id);
        for (let z = 0; z < engine.state.world.size; z++) for (let x = 0; x < engine.state.world.size; x++) {
          const p = view.screenForCell(x, z);
          const safe = [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => document.elementFromPoint(Math.round(p.x) + dx, Math.round(p.y) + dy)?.id === 'world');
          if ((x !== old.x || z !== old.z) && engine.validatePlacement('road', x, z, id).ok && safe) return { x, z };
        }
        return null;
      }, road2.id);
    }
    await page.evaluate(() => {
      window.__islandTapLog = [];
      for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
        window.__islandTapLog.push({ type, pointer: event.pointerType, x: event.clientX, y: event.clientY, target: event.target.id || event.target.className, action: event.target.closest?.('[data-action]')?.dataset.action, selected: window.__island.ui.selected, moving: window.__island.ui.movingId });
      }, { capture: true });
    });
    assert.ok(destination); const movePoint = await clickCell(destination.x, destination.z);
    const moveDiagnostic = await page.evaluate(({ point }) => ({ point, ghost: window.__island.ui.currentGhost, moving: window.__island.ui.movingId, selected: window.__island.ui.selected, cellAt: window.__island.view.cellAt(point.x, point.y), hit: document.elementFromPoint(point.x, point.y)?.id, events: window.__islandTapLog, viewport: { innerWidth, innerHeight, scrollX, scrollY, visual: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, x: visualViewport.offsetLeft, y: visualViewport.offsetTop } } }), { point: movePoint });
    assert.deepEqual(moveDiagnostic.ghost, destination, `move tap diagnostic: ${JSON.stringify(moveDiagnostic)}`);
    await page.locator('#ghost-status[data-valid="true"]').waitFor({ state: 'visible' });
    if (width < 600) await page.locator('[data-action="place"]').tap(); else await page.locator('[data-action="place"]').click();
    assert.deepEqual(await page.evaluate(id => { const b = window.__island.engine.state.buildings.find(b => b.id === id); return { x: b.x, z: b.z }; }, road2.id), destination);
    await page.locator('[data-action="undo"]').click();
    await clickCell(roadCell.x, roadCell.z);
    await page.locator('[data-action="remove"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), true, 'first tap only asks for confirmation');
    await page.locator('[data-action="remove-yes"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), false);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), true);

    const snapshot = await page.evaluate(() => { window.__island.engine.save(); return { buildings: window.__island.engine.state.buildings, avatar: window.__island.engine.state.avatar, tutorial: window.__island.engine.state.tutorial }; });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded);
    assert.deepEqual(await page.evaluate(() => ({ buildings: window.__island.engine.state.buildings, avatar: window.__island.engine.state.avatar, tutorial: window.__island.engine.state.tutorial })), snapshot);
    assert.equal(await page.locator('[data-action="avatar-start"]').count(), 0);

    // Parent gate responds to a sustained gesture; a short click does not open it.
    const parent = page.locator('[data-action="parent"]'); await parent.click();
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    const box = await parent.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.waitForTimeout(await page.evaluate(() => window.__island.data.config.ui.parentHoldMs + 150));
    await page.mouse.up();
    await page.locator('[data-action="export"]').waitFor({ state: 'visible' });
    await page.locator('[data-action="close-modal"]').click();

    await page.waitForTimeout(250); // Measure settled CSS, not the 160ms pressed-button animation.
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('button')].filter(b => !b.hidden && b.getBoundingClientRect().width && b.getBoundingClientRect().height).map(b => ({ action: b.dataset.action, width: b.offsetWidth, height: b.offsetHeight })) }));
    assert.ok(layout.scroll <= width + 1, 'no horizontal page overflow');
    assert.ok(layout.buttons.every(b => b.width >= 55.5 && b.height >= 55.5), `all visible buttons meet the 56px finger target: ${JSON.stringify(layout.buttons.filter(b => b.width < 55.5 || b.height < 55.5))}`);

    const performance = await page.evaluate(async () => {
      const times = []; let start;
      await new Promise(resolve => { const frame = t => { start ??= t; times.push(t); if (t - start >= 3000) resolve(); else requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
      const intervals = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
      return { ...window.__island.view.metrics(), rafFps: (times.length - 1) / ((times.at(-1) - times[0]) / 1000), p95FrameMs: intervals[Math.floor(intervals.length * .95)], sampleMs: times.at(-1) - times[0] };
    });
    assert.ok(performance.citizens <= 30);
    assert.ok(performance.avatarLoaded);
    if (label === 'phone') {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('[data-action="home"]').click();
      await screenshot('landscape');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'landscape has no horizontal page overflow');
      const panels = await page.evaluate(() => {
        const box = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        return { dock: box('.build-dock'), city: box('.city-panel'), mission: box('.mission'), camera: box('.camera-controls') };
      });
      for (const name of ['city', 'mission', 'camera']) assert.ok(panels[name].bottom <= panels.dock.top, `landscape ${name} remains above the building dock`);
    }
    assert.deepEqual(externalRequests, [], 'no request leaves the local app origin');
    assert.deepEqual(outsideIslandRequests, [], 'every static app dependency is deployed inside workout/island/');
    assert.deepEqual(errors, [], 'no browser errors');
    assert.deepEqual(failedRequests, [], 'all local assets loaded');
    reports.push({ viewport: { width, height }, tutorialSteps: 5, buildingTypes: placedTypes.length, screenshots: shots, performance, errors, externalRequests, outsideIslandRequests, failedRequests });
  } catch (error) {
    await screenshot('failure').catch(() => {});
    console.error(JSON.stringify({ label, url: page.url(), errors, externalRequests, outsideIslandRequests, failedRequests, completedViewports: reports }, null, 2));
    throw error;
  } finally { await context.close(); }
}

try {
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'desktop') await checkViewport(1440, 900, 'desktop');
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'phone') await checkViewport(390, 844, 'phone');
  const report = { browser: await browser.version(), environment: 'Desktop Chromium with ANGLE/SwiftShader; viewport checks, not a physical Android 10 device', deploymentScope: 'Private server exposes only workout/island/; all requests are audited against that folder', results: reports };
  await writeFile(path.join(directory, 'island-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
