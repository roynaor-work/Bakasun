import assert from 'node:assert/strict';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {checkActivity} from './island-activity.mjs';
import {checkG2c} from './island-g2c.mjs';

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
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
const directory = process.env.ISLAND_OUTPUT_DIR ? path.resolve(process.env.ISLAND_OUTPUT_DIR) : fileURLToPath(new URL('./screenshots/', import.meta.url));
await mkdir(directory, { recursive: true });
const launchBrowser = () => chromium.launch({ executablePath, headless: true, args: [
  '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
] });
let browser = await launchBrowser();
const reports = [];

async function checkViewport(width, height, label) {
  console.log(`${label}: gameplay ${width}x${height}`);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 600 });
  // Keep the construction regression focused; activity has its own seeded flow.
  await context.route('**/data/featureFlags.json',async route=>{const response=await route.fetch();const flags=await response.json();await route.fulfill({response,json:{...flags,events:false}});});
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
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
    if (greenShot) await page.evaluate(() => {
      window.__missionUpdates = [];
      const { engine, ui } = window.__island;
      const unsubscribe = engine.subscribe(() => {
        window.__missionUpdates.push({ title: ui.missionToggle.textContent, highlighted: ui.mission.classList.contains('mission-complete') });
      });
      window.__stopMissionUpdates = unsubscribe;
    });
    await page.locator('[data-action="place"]').click();
    if (greenShot) {
      const updates = await page.evaluate(() => { window.__stopMissionUpdates(); return window.__missionUpdates; });
      assert.ok(updates.some(update => update.highlighted), 'objective advances and flashes during the engine notification, without waiting for the highlight');
    }
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
    console.log(`${label}: tutorial passed`);

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
    assert.equal(await page.locator('[data-action="remove"]').count(),1,'opening information does not also request removal');
    await screenshot('info'); assertLayout(await measureLayout(page), null, `${label} building information`); await closeInfo();

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
    console.log(`${label}: all 17 building types passed`);

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
    assert.equal(await page.locator('[data-action="remove"]').count(),1,'the world tap must not activate a new button under the finger');
    if (width < 600) await page.locator('[data-action="remove"]').tap(); else await page.locator('[data-action="remove"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), true, 'first tap only asks for confirmation');
    if (width < 600) await page.locator('[data-action="remove-yes"]').tap(); else await page.locator('[data-action="remove-yes"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), false);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.some(b => b.id === id), road2.id), true);

    console.log(`${label}: move, remove, confirmation and undo passed`);
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
    const beforeInvalidImport = await page.evaluate(() => window.__island.engine.state.buildings);
    await page.locator('#island-import').setInputFiles({ name: 'invalid-island.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await page.locator('.modal-toast:not([hidden])').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.__island.engine.state.buildings), beforeInvalidImport, 'invalid import only reports an error');
    assertLayout(await measureLayout(page), null, `${label} parent feedback`);
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
      assertLayout(await measureLayout(page), 60, 'gameplay rotation');
    }
    assert.deepEqual(externalRequests, [], 'no request leaves the local app origin');
    assert.deepEqual(outsideIslandRequests, [], 'every static app dependency is deployed inside workout/island/');
    assert.deepEqual(errors, [], 'no browser errors');
    assert.deepEqual(failedRequests, [], 'all local assets loaded');
    reports.push({ viewport: { width, height }, tutorialSteps: 5, buildingTypes: placedTypes.length, screenshots: shots, performance, errors, externalRequests, outsideIslandRequests, failedRequests });
  } catch (error) {
    await screenshot('failure').catch(() => {});
    console.error(JSON.stringify({ label, url: page.url(), errors, externalRequests, outsideIslandRequests, failedRequests, completedViewports: reports, tapLog: await page.evaluate(() => window.__islandTapLog?.slice(-20)) }, null, 2));
    throw error;
  } finally { await context.close(); }
}

// Geometry uses clipped visible rectangles, including scroll-container clips.
// An empty rectangle must span >=65% of portrait width or >=60% of landscape
// height, so a narrow gap beside a panel cannot count as a visible island.
async function measureLayout(page) {
  return page.evaluate(() => {
    const rect = node => {
      const r = node.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      // Fixed UI is clipped by the viewport, not the zero flow height of body.
      for (let parent = node.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, p.left + parent.clientLeft); right = Math.min(right, p.left + parent.clientLeft + parent.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, p.top + parent.clientTop); bottom = Math.min(bottom, p.top + parent.clientTop + parent.clientHeight); }
      }
      return { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]');
    const nodes = [...document.querySelectorAll('button,.city-panel,.mission,.event-panel,.info-card,.build-dock,.avatar-footer,.modal-overlay,#toast.visible,.save-error')].filter(visible).map(node => ({ node, box: rect(node) })).filter(({box}) => box.width > .5 && box.height > .5);
    const name = node => node.dataset.action || node.className || node.id;
    const intersects = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left) > .5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) > .5;
    const overlaps = [];
    for (let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
      const a=nodes[i],b=nodes[j];
      if (!a.node.contains(b.node) && !b.node.contains(a.node) && intersects(a.box,b.box)) overlaps.push([name(a.node),name(b.node)]);
    }
    const buttons = [...document.querySelectorAll('button')].filter(visible).map(node => ({ action:name(node), width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height }));
    const boxes = nodes.map(n=>n.box);
    const xs = [...new Set([0,innerWidth,...boxes.flatMap(b=>[b.left,b.right])])].sort((a,b)=>a-b);
    const ys = [...new Set([0,innerHeight,...boxes.flatMap(b=>[b.top,b.bottom])])].sort((a,b)=>a-b);
    const portrait = innerHeight >= innerWidth;
    let clear = {left:0,right:0,top:0,bottom:0,width:0,height:0}, fraction=0;
    for(let xi=0;xi<xs.length-1;xi++) for(let xj=xi+1;xj<xs.length;xj++) {
      const width=xs[xj]-xs[xi]; if(portrait && width < innerWidth*.65) continue;
      for(let yi=0;yi<ys.length-1;yi++) for(let yj=yi+1;yj<ys.length;yj++) {
        const height=ys[yj]-ys[yi]; if(!portrait && height < innerHeight*.6) continue;
        const candidate={left:xs[xi],right:xs[xj],top:ys[yi],bottom:ys[yj],width,height};
        const ratio=portrait?height/innerHeight:width/innerWidth;
        if(ratio <= fraction || boxes.some(b=>intersects(candidate,b))) continue;
        clear=candidate;fraction=ratio;
      }
    }
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,buttons,overlaps,obstructions:nodes.map(({node,box})=>({name:name(node),...box})),clearRectangle:clear,clearPercent:fraction*100,axis:portrait?'height':'width'};
  });
}
function assertLayout(layout, minimum, label) {
  assert.equal(layout.scrollWidth,layout.clientWidth,`${label}: no horizontal page overflow`);
  assert.ok(layout.obstructions.length>0,`${label}: geometry includes real visible UI rectangles`);
  assert.deepEqual(layout.overlaps,[],`${label}: visible interactive components do not overlap`);
  assert.ok(layout.buttons.every(b=>b.width>=56 && b.height>=56),`${label}: 56px buttons ${JSON.stringify(layout.buttons.filter(b=>b.width<56||b.height<56))}`);
  if(minimum) assert.ok(layout.clearPercent>=minimum,`${label}: clear island ${layout.clearPercent.toFixed(2)}% of ${layout.axis}, required ${minimum}%`);
}
async function checkLayoutViewport(width,height) {
  const label=`${width}x${height}`, context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[],failedRequests=[],outsideRequests=[],layouts={},shots=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failedRequests.push(r.url()));
  page.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&(u.origin!==baseUrl.origin||!u.pathname.startsWith(appPath)))outsideRequests.push(u.href);});
  const shot=async name=>{const file=`island-after-${label}-${name}.png`;await page.screenshot({path:path.join(directory,file)});shots.push(file);};
  const measure=async(name,minimum)=>{const layout=await measureLayout(page);layouts[name]=layout;console.log(`${label} ${name}: ${layout.clearPercent.toFixed(2)}% clear`);assertLayout(layout,minimum,`${label} ${name}`);};
  const avatarFields=async()=>{
    await measure('avatar');
    const fields=page.locator('.avatar-field');
    for(let i=0;i<await fields.count();i++) {
      await fields.nth(i).scrollIntoViewIfNeeded();
      const geometry=await fields.nth(i).evaluate(field=>{
        const r=field.getBoundingClientRect(), scroll=field.closest('.avatar-scroll'), s=scroll.getBoundingClientRect(),f=document.querySelector('.avatar-footer').getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,scrollTop:s.top,footerTop:f.top,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth};
      });
      assert.equal(geometry.scrollWidth,geometry.clientWidth,`${label}: avatar scroll has no horizontal overflow`);
      assert.ok(geometry.top>=geometry.scrollTop-.5 && geometry.bottom<=geometry.footerTop+.5,`${label}: complete field ${i} scrolls above the footer: ${JSON.stringify(geometry)}`);
    }
    await measure('avatar-last-field');await shot('avatar-last-field');
  };
  try {
    await page.goto(target,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await shot('avatar');await avatarFields();
    assert.equal(await page.locator('.modal-overlay').evaluate(node=>getComputedStyle(node).backdropFilter),'none','no expensive backdrop filter');
    await page.locator('[data-field="gender"][data-value="girl"]').tap();
    await page.locator('[data-field="hairstyle"][data-value="long"]').tap();
    await page.locator('[data-field="shirtColor"]').nth(2).tap();
    await page.locator('[data-action="avatar-start"]').tap();
    await page.locator('[role="dialog"]').waitFor({state:'hidden'});
    await measure('welcome-toast');await shot('toast');
    await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));
    const minimum=width>height?60:55;
    await measure('closed',minimum);await shot('closed');
    const city=page.locator('[data-action="toggle-city"]'), mission=page.locator('[data-action="toggle-mission"]');
    assert.equal(await page.locator('.metric-track:visible').count(),0,'collapsed strip contains no progress bars');
    assert.equal(await city.locator('.status-value').count(),9,'money, five metrics and three resources remain in the strip');
    const strip=await city.evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert.equal(strip.scroll,strip.width,'all summary values fit the strip');
    await city.tap();assert.equal(await city.getAttribute('aria-expanded'),'true');await measure('city-details');await shot('city-details');
    assert.equal(await page.locator('.metric-track:visible').count(),5);
    await city.tap();assert.equal(await city.getAttribute('aria-expanded'),'false');
    await city.tap();await page.touchscreen.tap(width/2,height>width?height-110:height/2);assert.equal(await city.getAttribute('aria-expanded'),'false','outside tap closes city');
    assert.equal(await mission.getAttribute('aria-expanded'),'false','outside tap cannot click through to another strip');
    await mission.tap();assert.equal(await mission.getAttribute('aria-expanded'),'true');await measure('mission-details');await shot('mission-details');
    await mission.tap();assert.equal(await mission.getAttribute('aria-expanded'),'false');
    await mission.tap();await page.touchscreen.tap(width/2,height>width?height-110:height/2);assert.equal(await mission.getAttribute('aria-expanded'),'false','outside tap closes mission');
    await page.locator('[data-action="toggle-build"]').tap();await measure('open',width>height?60:40);await shot('open');
    await page.locator('[data-action="toggle-build"]').tap();await measure('reclosed',minimum);
    await page.locator('[data-category="basic"]').tap();await page.locator('[data-building="house"]').tap();
    assert.equal(await page.locator('.build-dock').getAttribute('data-placing'),'true');
    assert.equal(await page.locator('.catalog').isVisible(),false,'catalog collapses automatically for the ghost');
    await measure('placing',minimum);await shot('placing');
    const occupied = await page.evaluate(() => {
      const {engine,view}=window.__island, building=engine.state.buildings[0];
      return view.screenForCell(building.x,building.z);
    });
    assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id,occupied),'world','occupied fixture cell remains uncovered');
    await page.touchscreen.tap(occupied.x,occupied.y);
    await page.locator('#ghost-status[data-valid="false"]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-action="place"]').isDisabled(),true);
    await measure('placing-red',minimum);await shot('placing-red');
    await page.locator('[data-action="cancel"]').tap();
    assert.equal(await page.locator('#world').getAttribute('data-ghost'),null);
    await page.locator('[data-action="avatar-edit"]').tap();await avatarFields();
    await page.locator('[data-field="skinColor"]').last().tap();await page.locator('[data-action="avatar-start"]').tap();
    const skin=await page.evaluate(()=>window.__island.engine.state.avatar.skinColor);
    assert.equal(skin,await page.evaluate(()=>window.__island.data.avatar.skinColors.at(-1).color));
    await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));
    // Rotation reuses this live UI and saved character, rather than a new page.
    await page.setViewportSize({width:height,height:width});await page.locator('[data-action="home"]').tap();
    await measure('rotated',height>width?60:55);
    assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);assert.deepEqual(outsideRequests,[]);
    reports.push({layoutViewport:{width,height},layouts,screenshots:shots,errors,failedRequests,outsideRequests});
  } catch(error) {await shot('failure').catch(()=>{});console.error(JSON.stringify({label,layouts,errors,failedRequests,outsideRequests},null,2));throw error;}
  finally{await context.close();}
}

async function checkCityViewport(width, height) {
  console.log(`city rules: ${width}x${height}`);
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
  // City limits are checked independently of the separately tested scheduler.
  await context.route('**/data/featureFlags.json',async route=>{const response=await route.fetch();const flags=await response.json();await route.fulfill({response,json:{...flags,events:false}});});
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const errors = [], failedRequests = [], outsideRequests = [], screenshots = [], levels = [], assetRequests=[];
  let phase='initial';
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for(const type of ['request','requestfinished','requestfailed'])page.on(type,request=>{if(request.url().endsWith('/kid-full.glb'))assetRequests.push({type,phase,timing:request.timing(),error:request.failure()?.errorText});});
  page.on('requestfailed', request => failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && (url.origin !== baseUrl.origin || !url.pathname.startsWith(appPath))) outsideRequests.push(url.href); });
  const shot = async name => { const file = `island-g1c-${width}-${name}.png`; await page.screenshot({ path: path.join(directory, file) }); screenshots.push(file); };
  const cell = async (x, z) => {
    const point = await page.evaluate(({ x, z }) => window.__island.view.screenForCell(x, z), { x, z });
    assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id, point), 'world', `cell ${x},${z} remains visible`);
    await page.touchscreen.tap(point.x, point.y);
  };
  const select = async typeId => {
    const category = await page.evaluate(id => window.__island.engine.registry.buildings.get(id).category, typeId);
    await page.locator(`[data-category="${category}"]`).tap();
    await page.locator(`[data-building="${typeId}"]`).tap();
  };
  const place = async (typeId, x, z) => {
    await select(typeId); await cell(x, z);
    assert.equal(await page.locator('#ghost-status').getAttribute('data-valid'), 'true');
    await page.locator('[data-action="place"]').tap();
    return page.evaluate(() => window.__island.engine.state.buildings.at(-1).id);
  };
  const inspect = async (id, x, z) => {
    // A tall foreground house can cover another building's ground anchor.
    // Tap an actually visible part of the requested mesh, just as a child does.
    const point = await page.evaluate(async ({ id, x, z }) => {
      const T = await import('./vendor/three.module.js');
      const { view } = window.__island;
      view.scene.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(view.groups.get(id).group);
      const points = [view.screenForCell(x, z)];
      const projected = [];
      for (const px of [box.min.x, box.max.x]) for (const py of [box.min.y, box.max.y]) for (const pz of [box.min.z, box.max.z]) {
        const p = new T.Vector3(px, py, pz).project(view.camera);
        projected.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
      }
      for (let py = Math.min(...projected.map(p => p.y)); py <= Math.max(...projected.map(p => p.y)); py += 2) for (let px = Math.min(...projected.map(p => p.x)); px <= Math.max(...projected.map(p => p.x)); px += 2) points.push({ x: px, y: py });
      return points.find(p => {
        if (document.elementFromPoint(p.x, p.y)?.id !== 'world') return false;
        view.cellAt(p.x, p.y);
        return view.ray.intersectObjects([...view.groups.values()].map(item => item.group), true).find(hit => hit.object.userData.buildingId)?.object.userData.buildingId === id;
      });
    }, { id, x, z });
    assert.ok(point, `visible mesh for ${id}`);
    await page.touchscreen.tap(point.x, point.y);
    assert.equal(await page.evaluate(() => window.__island.ui.infoId), id);
    await page.locator('.info-card:not([hidden])').waitFor();
  };
  try {
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded);
    await page.locator('[data-action="avatar-start"]').tap();
    await page.evaluate(() => { const { engine } = window.__island; engine.skipTutorial(); for (let i = 0; i < 200; i++) engine.tick(60); });
    await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
    const home = await place('house', 4, 5);
    await inspect(home, 4, 5);
    for (let level = 1; level <= 4; level++) {
      const result = await page.evaluate(id => {
        const { engine, view } = window.__island, item = view.groups.get(id);
        return { level: engine.state.buildings.find(b => b.id === id).level, population: engine.population(), visualId: item.group.uuid };
      }, home);
      assert.equal(result.level, level); levels.push(result);
      assertLayout(await measureLayout(page), null, `${width} house level ${level}`);
      await shot(`house-level-${level}`);
      if (level === 4) { assert.equal(await page.locator('[data-action="upgrade"]').isDisabled(), true); break; }
      if (level > 1) {
        assert.equal(await page.locator('[data-action="upgrade"]').isDisabled(), true);
        assert.match(await page.locator('[data-action="upgrade"]').textContent(), /כשהאי יתרחב/);
        await page.evaluate(stage => { const { engine, data } = window.__island; engine.grantParts(data.world.partGroup, data.config.worldStages[stage].requiredParts - engine.state.parts[data.world.partGroup]); }, level - 1);
        await page.locator('[data-action="home"]').tap();
      }
      assert.equal(await page.locator('[data-action="upgrade"]').isDisabled(), false);
      await page.locator('[data-action="upgrade"]').tap();
    }
    assert.deepEqual(levels.map(item => item.population), [4, 8, 16, 24]);
    assert.equal(new Set(levels.map(item => item.visualId)).size, 4, 'each upgrade replaces the visible model');
    await page.locator('[data-action="close-info"]').tap();
    const tower = await place('waterTower', 8, 5);
    await inspect(tower, 8, 5);
    assert.match(await page.locator('.service-supply').textContent(), /24 מתוך 24/);
    await page.locator('[data-action="close-info"]').tap();
    await select('waterTower');
    assert.equal(await page.locator('#ghost-status').getAttribute('data-reason'), 'reason.limit.waterTower');
    assert.match(await page.locator('#ghost-status').textContent(), /לשדרג/);
    assert.equal(await page.locator('[data-action="place"]').isDisabled(), true);
    assert.equal(await page.locator('#world').getAttribute('data-ghost'), 'invalid');
    assertLayout(await measureLayout(page), 55, `${width} blocked water placement`);
    await shot('water-blocked');
    await page.locator('[data-action="cancel"]').tap();
    await page.locator('[data-category="services"]').tap();
    assert.equal(await page.locator('[data-building="waterTower"] .building-hint').textContent(), 'אין צורך');
    await shot('catalog-no-need');
    await page.locator('[data-action="toggle-build"]').tap();
    const secondHome = await place('house', 6, 5);
    await inspect(secondHome, 6, 5); await page.locator('[data-action="upgrade"]').tap();
    await page.locator('[data-action="close-info"]').tap();
    await page.locator('[data-category="services"]').tap();
    assert.equal(await page.locator('[data-building="school"] .building-hint').textContent(), 'מומלץ');
    await shot('catalog-recommended');
    await page.locator('[data-action="toggle-build"]').tap();
    await select('waterTower'); await cell(10, 5);
    assert.equal(await page.locator('#ghost-status').getAttribute('data-valid'), 'true', 'house upgrade creates demand');
    await page.locator('[data-action="cancel"]').tap();
    await place('soccer', 3, 8);
    await page.locator('[data-category="sports"]').tap();
    assert.match(await page.locator('[data-building="soccer"] .building-hint').textContent(), /שדרוג הקיים/);
    await shot('catalog-upgrade');
    await page.locator('[data-building="soccer"]').tap();
    assert.equal(await page.locator('#ghost-status').getAttribute('data-reason'), 'reason.limit.soccer');
    assert.match(await page.locator('#ghost-status').textContent(), /לשדרג את הקיים/);
    await shot('soccer-blocked'); await page.locator('[data-action="cancel"]').tap();

    // A service moves across opposite corners using the same pointer flow. The
    // access roads are ordinary commands; no instance, currency or save is injected.
    await page.evaluate(() => { const { engine } = window.__island; for (const [x, z] of [[3, 1], [22, 20]]) { const r = engine.place('road', x, z); if (!r.ok) throw new Error(r.reason); } });
    await inspect(tower, 8, 5);
    await page.locator('[data-action="move"]').tap();
    await cell(1, 1); await page.locator('[data-action="place"]').tap();
    await inspect(tower, 1, 1);
    const actions = await page.locator('.info-actions button').evaluateAll(nodes => nodes.map(node => ({ action: node.dataset.action, text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    assert.deepEqual(actions.map(item => item.action), ['move', 'upgrade', 'remove']);
    assert.ok(actions.every(item => item.width >= 56 && item.height >= 56));
    await shot('actions'); await page.locator('[data-action="move"]').tap();
    assert.match(await page.locator('#ghost-status').textContent(), /ללא עלות/);
    await cell(6, 5);
    assert.equal(await page.locator('#ghost-status').getAttribute('data-reason'), 'reason.occupied');
    assert.equal(await page.locator('[data-action="place"]').isDisabled(), true);
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.find(b => b.id === id).x, tower), 1);
    await shot('move-red'); await page.locator('[data-action="cancel"]').tap();
    await inspect(tower, 1, 1); await page.locator('[data-action="move"]').tap();
    await cell(20, 20); assertLayout(await measureLayout(page), 55, `${width} free move placement`); await shot('move-green');
    const moveResult = await page.evaluate(() => {
      const { engine, ui } = window.__island, money = engine.state.money;
      let change, previousMoney = money;
      const off = engine.subscribe((state, event) => { if (event.type === 'move') change = { money: state.money, previousMoney, id: event.id }; previousMoney = state.money; });
      window.__cityMove = { money, off, getChange: () => change };
      return { ghost: ui.currentGhost };
    });
    assert.deepEqual(moveResult.ghost, { x: 20, z: 20 });
    await page.locator('[data-action="place"]').tap();
    const moved = await page.evaluate(id => { const { engine } = window.__island, check = window.__cityMove; check.off(); return { change: check.getChange(), before: check.money, instance: engine.state.buildings.find(b => b.id === id) }; }, tower);
    // Only engine events are used for this comparison, excluding unrelated ticks.
    assert.equal(moved.change.money, moved.change.previousMoney); assert.equal(moved.change.id, tower);
    assert.deepEqual([moved.instance.x, moved.instance.z], [20, 20]);
    await shot('moved');
    await page.locator('[data-action="undo"]').tap();
    assert.deepEqual(await page.evaluate(id => { const b = window.__island.engine.state.buildings.find(b => b.id === id); return [b.x, b.z]; }, tower), [1, 1]);
    phase='reload';await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded);phase='reloaded';
    assert.equal(await page.evaluate(id => window.__island.engine.state.buildings.find(b => b.id === id).level, home), 4);
    assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(outsideRequests, []);
    reports.push({ cityViewport: { width, height }, levels, actions, moved: moved.instance, errors, failedRequests, outsideRequests, screenshots });
  } catch (error) { await shot('failure').catch(() => {}); console.error(JSON.stringify({ width, errors, failedRequests, outsideRequests,assetRequests })); throw error; }
  finally { await context.close(); }
}

try {
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'g2c') reports.push(...await checkG2c({browser,target,directory}));
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'activity') reports.push(...await checkActivity({browser,target,directory}));
  // Keep virtual-clock activity and the real-time city suite in separate
  // Chromium processes, including their network and graphics state.
  if (!process.env.ISLAND_ONLY) {await browser.close();browser=await launchBrowser();}
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'city') for (const width of [390, 360]) await checkCityViewport(width, width === 390 ? 844 : 740);
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'desktop') await checkViewport(1440, 900, 'desktop');
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'phone') await checkViewport(390, 844, 'phone');
  if (!process.env.ISLAND_ONLY || process.env.ISLAND_ONLY === 'layout') for (const [width,height] of [[360,740],[390,844],[412,915],[844,390]]) if (!process.env.ISLAND_LAYOUT_VIEWPORT || process.env.ISLAND_LAYOUT_VIEWPORT === `${width}x${height}`) await checkLayoutViewport(width,height);
  const report = { browser: await browser.version(), environment: 'Desktop Chromium with ANGLE/SwiftShader; viewport checks, not a physical Android 10 device', deploymentScope: 'Private server exposes only workout/island/; all requests are audited against that folder', results: reports };
  await writeFile(path.join(directory, process.env.ISLAND_REPORT_NAME ? path.basename(process.env.ISLAND_REPORT_NAME) : process.env.ISLAND_ONLY === 'city' ? 'island-city-report.json' : process.env.ISLAND_ONLY === 'layout' ? 'island-layout-report.json' : 'island-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
