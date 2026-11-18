/** Real-browser check of the unified athletes on the basketball game (Chromium with software WebGL).
 * Plays the real game twice, with ?athletes=0 (as shipped) and with the layer on, samples every visible player (the body yaw the mesh shows against the
 * direction of travel, the clip that plays) and takes close screenshots of runners.
 *   PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node workout/island/tools/athletes/hoops-browser-check.mjs [seconds=40] [outDir] */
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../../tests/helpers/island-browser.mjs';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const seconds = +process.argv[2] || 40, out = process.argv[3] || fileURLToPath(new URL('../../verification/unified-athletes-v1/browser/', import.meta.url));
await mkdir(out, {recursive: true});
const server = await serveIsland('/workout/island/'), base = server.url;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors']});
const results = {};
for (const flag of ['0', '1']) {
  const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, isMobile: true, deviceScaleFactor: 1}); context.setDefaultTimeout(240000);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?dev=1&athletes=${flag}`, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.__island?.view?.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').click();
  await page.evaluate(() => { const {engine: e, data} = window.__island; e.skipTutorial(); data.featureFlags.events = false; e.state.money = 50000; e.learningStatus = () => ({locked: false}); for (let z = 0; z < e.state.world.size; z++) for (let x = 0; x < e.state.world.size; x++) if (e.place('basketball', x, z).ok) return true; return false; });
  await page.evaluate(() => window.__island.games.stages('streetSlam')); await page.waitForTimeout(300);
  await page.locator('[data-action=hoops-play-next]').click(); await page.waitForTimeout(400);
  if (await page.locator('[data-action=game-understood]').count()) await page.locator('[data-action=game-understood]').click();
  await page.waitForFunction(() => window.__island.games.current?.session?.snapshot?.renderMetrics?.calls > 0, null, {timeout: 240000});
  const info = await page.evaluate(() => { const s = window.__island.games.current.session; const e = s.debug.engine; try { e.debug.state.autopilot = true; } catch {} return {tall: s.snapshot.renderMetrics.tall, unified: false}; });
  // sample: yaw the mesh shows against the travel direction, per player, per sample
  await page.evaluate(() => {
    const s = window.__island.games.current.session, view = s.debug.view, stats = window.__side = {n: 0, o45: 0, o90: 0, states: {}, samples: 0}, last = new Map();
    window.__sampler = setInterval(() => {
      const snap = s.snapshot; if (!snap || snap.phase !== 'live') return; stats.samples++;
      for (const p of snap.players) {
        const av = view.avatars.get(p.id); if (!av || !av.root.visible) continue;
        const prev = last.get(p.id); last.set(p.id, {x: p.x, z: p.z, t: performance.now()}); if (!prev) continue;
        const dt = (performance.now() - prev.t) / 1000; if (dt <= 0) continue;
        const vx = (p.x - prev.x) / dt, vz = (p.z - prev.z) / dt, sp = Math.hypot(vx, vz); if (sp < 1.6 || p.act) continue;
        const defending = snap.possession !== p.team && snap.ball.state === 'held'; if (defending && !p.hasBall && sp < 4.2) continue;
        const yaw = av.root.rotation.y, off = Math.abs(((Math.atan2(vx, vz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
        stats.n++; if (off > 45) stats.o45++; if (off > 90) stats.o90++;
        const key = av.motionState; stats.states[key] = (stats.states[key] || 0) + 1;
      }
    }, 100);
  });
  const t0 = Date.now(); let shots = 0;
  while (Date.now() - t0 < seconds * 1000) {
    await page.waitForTimeout(1500);
    if (shots < 3) {
      const runner = await page.evaluate(() => { const s = window.__island.games.current.session, snap = s.snapshot; return snap?.phase === 'live' ? snap.players.filter(p => Math.hypot(p.vx, p.vz) > 4 && !p.act).length : 0; });
      if (runner >= 2) { await page.evaluate(async () => { const d = window.__island.games.current.session.debug; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); d.hold = true; }); await page.waitForTimeout(500); await page.screenshot({path: path.join(out, `athletes-${flag}-run-${shots++}.jpg`), type: 'jpeg', quality: 86, timeout: 120000}); await page.evaluate(() => { window.__island.games.current.session.debug.hold = false; }); }
    }
  }
  const stats = await page.evaluate(() => { clearInterval(window.__sampler); window.__side.unified = [...window.__island.games.current.session.debug.view.avatars.values()].some(a => typeof a.visualFace === 'number'); return window.__side; });
  results[flag === '1' ? 'on' : 'off'] = {...info, stats: {...stats, over45Pct: +(100 * stats.o45 / Math.max(1, stats.n)).toFixed(1), over90Pct: +(100 * stats.o90 / Math.max(1, stats.n)).toFixed(1)}, errors, screenshots: shots};
  await context.close();
}
await browser.close(); await server.close?.();
await writeFile(path.join(out, 'browser.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
