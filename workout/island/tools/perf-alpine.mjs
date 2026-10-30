import {runAlpineSession} from '../minigames/alpine-session.mjs?v=island-perf-20261030-1';

/** Alpine Rush performance page: runs one race on autopilot through the real session
 * (engine, controls, view, HUD) and reports frame pacing. Query: seconds, stage, seed,
 * switch=1 (force a quality change midway), small=1 (tiny canvas: JS cost only),
 * autostart=1, quality=low. Results land in window.__perf.result and in the panel. */
const params = new URLSearchParams(location.search);
const doc = document, screen = doc.getElementById('screen'), statusLine = doc.getElementById('status'), table = doc.getElementById('table'), jsonBox = doc.getElementById('json');
const secondsInput = doc.getElementById('seconds'), switchBox = doc.getElementById('switch'), smallBox = doc.getElementById('small');
if (params.get('seconds')) secondsInput.value = params.get('seconds');
switchBox.checked = params.get('switch') === '1'; smallBox.checked = params.get('small') === '1';
const rawRaf = window.requestAnimationFrame.bind(window), rawCancel = window.cancelAnimationFrame.bind(window);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

const [config, strings] = await Promise.all([fetch('../data/config.json').then(r => r.json()), fetch('../data/strings.he.json').then(r => r.json())]);
const balance = config.minigames.alpineRush;
const t = (key, vars) => String(strings[key] ?? key).replace(/{(\w+)}/g, (_, k) => vars?.[k] ?? `{${k}}`);
const memory = () => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }}; };

let current = null;
window.__perf = {result: null, done: false, runs: []};

/** Lane pilot (same idea as the browser test): steer to the cheapest lane 40 m ahead,
 * boost whenever allowed, one grab per flight, and ride up the wall now and then for pipe air. */
function makePilot(engine) {
  const objects = engine.course.objects, P = balance.physics, pipe = engine.pipe;
  let cursor = 0, frameIndex = 0, best = 0, trickedThisAir = false, wallUntil = -1, lastWallAt = 0;
  return player => {
    frameIndex++;
    const s = player.s ?? 0, x = player.x ?? 0;
    while (cursor < objects.length && objects[cursor].s < s + 1) cursor++;
    if (frameIndex % 6 === 1) {
      let bc = Infinity; best = x;
      for (let cx = -8; cx <= 8; cx += .4) {
        let c = Math.abs(cx - x) * .12;
        for (let i = cursor; i < objects.length && objects[i].s < s + 40; i++) {
          const o = objects[i], near = 1 / (1 + (o.s - s) / 18);
          if (o.type === 'rock' && Math.abs(cx - o.x) < o.radius * P.rockHitScale + P.board.halfWidth + .25) c += 100 * near;
          else if (o.type === 'gate' && Math.abs(Math.abs(cx - o.x) - P.gateHalfWidth) < 1.2) c += 100 * near;
          else if (o.type === 'ramp') { const off = Math.abs(cx - o.x); if (off >= 1.6 && off < 2.5) c += 60 * near; else if (off < 1.6) c -= 6 * near; }
          else if (o.type === 'boost' && Math.abs(cx - o.x) < 1.3) c -= 4 * near;
          else if (o.type === 'coin' && Math.abs(cx - o.x) < .6) c -= 1.5 * near;
        }
        if (c < bc) { bc = c; best = cx; }
      }
      // Every ~18 m of clear slope after 120 m: a wall ride to the lip for pipe air.
      const clear = !objects.slice(cursor, cursor + 6).some(o => o.type !== 'coin' && o.s < s + 45);
      if (clear && s - lastWallAt > 120 && !player.airborne) { wallUntil = frameIndex + 70; lastWallAt = s; }
    }
    const target = frameIndex < wallUntil ? pipe.lip : best;
    if (!player.airborne) trickedThisAir = false;
    let trick = null;
    if (player.airborne && !player.trick && !trickedThisAir) { trick = 'grab'; trickedThisAir = true; }
    return {steer: clamp((target - x) * .8 - (player.lean ?? 0) * .2, -1, 1), boost: !player.airborne, trick};
  };
}

function cell(label, value, note = '') {
  const tr = doc.createElement('tr'), th = doc.createElement('th'), td = doc.createElement('td'), extra = doc.createElement('td');
  th.textContent = label; td.innerHTML = `<span class="ltr">${value}</span>`; extra.textContent = note; extra.className = 'perf-status'; tr.append(th, td, extra); return tr;
}
function show(result) {
  table.replaceChildren(
    cell('גודל', `${result.width}×${result.height} · dpr ${result.pixelRatio}`, result.small ? 'קנבס קטן' : result.mobileProfile ? 'פרופיל טלפון' : 'פרופיל מחשב'),
    cell('טעינה', `${result.loadMs} ms`, 'מהיצירה עד שהתצוגה מוכנה'),
    cell('פריימים', `${result.frames} / ${result.seconds}s`, `ממוצע ${result.avgFps} fps אחרי חימום של ${result.warmupMs / 1000} שניות`),
    cell('פריים ראשון במרוץ', result.firstRacingFrames.map(f => `${f.frameMs}`).join(' · ') + ' ms', 'עלות JS של ארבעת הפריימים הראשונים (כולל קומפילציית שיידרים)'),
    cell('זמן פריים', `p50 ${result.frameMs.p50} · p95 ${result.frameMs.p95} · p99 ${result.frameMs.p99} ms`, `מעל 33: ${result.over33} · מעל 50: ${result.over50}`),
    cell('עלות JS לפריים', `avg ${result.tickMs.avg} · p95 ${result.tickMs.p95} · max ${result.tickMs.max} ms`, 'הקריאה של requestAnimationFrame'),
    cell('פירוק', `step ${result.parts.step} · snapshot ${result.parts.snapshot} · presentation ${result.parts.presentation} · render ${result.parts.render} · HUD+events ${result.parts.other} ms`, 'ממוצע לפריים'),
    cell('הקצאות לפריים', result.allocKB === null ? 'לא נמדד' : `median ${result.allocKB.median} · p90 ${result.allocKB.p90} KB`, 'קירוב גס מגודל הערימה; מדידה מדויקת רק עם heap profiler'),
    cell('משולשים לפי קטגוריה', result.audit ? Object.entries(result.audit.categories).sort((a, b) => b[1].tris + b[1].shadowTris - a[1].tris - a[1].shadowTris).map(([k, v]) => `${k} ${Math.round(v.tris / 1000)}k${v.shadowTris ? `+${Math.round(v.shadowTris / 1000)}k צל` : ''}${v.points ? ` ${v.points} נק'` : ''}`).join(' · ') : 'אין', result.audit ? `מפת צל ${result.audit.shadowMapSize} · תוכניות ${result.audit.programs}` : ''),
    cell('החלפות איכות', result.qualitySwitches.length ? result.qualitySwitches.map(q => `${q.to} @${q.atSecond}s: setQuality ${q.costMs} ms, פריים ${q.frameMs} ms, סביבו מעל 50: ${q.over50Around}`).join(' | ') : 'אין', result.switchMetrics ? `מתוכם רזולוציית הקנבס ${result.switchMetrics.pixelRatioMs} ms, מפת צל ${result.switchMetrics.shadowMs} ms, שינוי גודל ${result.switchMetrics.resizeMs} ms` : ''),
    cell('תצוגה', `calls ${result.render.calls} · tris ${result.render.triangles} · trees ${result.render.trees} · chunks ${result.render.visibleChunks}/${result.render.chunks} · ${result.render.quality}`, result.render.mode),
  );
  jsonBox.hidden = false; jsonBox.textContent = JSON.stringify(result);
}

async function run() {
  if (current) { current.stop(); current = null; }
  table.replaceChildren(); jsonBox.hidden = true; window.__perf.result = null; window.__perf.done = false;
  const seconds = clamp(Number(secondsInput.value) || 30, 3, 300), small = smallBox.checked, forceSwitch = switchBox.checked;
  screen.classList.toggle('small', small);
  const stage = clamp(Number(params.get('stage')) || 1, 1, balance.levels.length), seed = Number(params.get('seed')) || 7;
  statusLine.textContent = 'טוענים את התצוגה';
  // Shell markup as the island builds it: status line, stage with the canvas, controls.
  screen.replaceChildren(); screen.dataset.game = 'alpineRush';
  const status = doc.createElement('p'); status.className = 'game-status';
  const stageEl = doc.createElement('div'); stageEl.className = 'game-stage';
  const canvas = doc.createElement('canvas'); canvas.className = 'minigame-canvas'; canvas.tabIndex = 0; stageEl.append(canvas);
  const controls = doc.createElement('div'); controls.className = 'game-controls';
  screen.append(status, stageEl, controls);

  // Timing: every requestAnimationFrame callback registered from now on is measured.
  const frames = [];
  let recording = false, startWall = 0, pending = null, stopped = false;
  window.requestAnimationFrame = cb => rawRaf(ts => { if (stopped) return; const t0 = performance.now(); const heap0 = performance.memory?.usedJSHeapSize ?? null; pending = {ts, step: 0, snapshot: 0, presentation: 0, render: 0, heap: heap0}; cb(ts); pending.cost = performance.now() - t0; pending.alloc = heap0 === null ? null : (performance.memory.usedJSHeapSize - heap0) / 1024; if (recording) frames.push(pending); pending = null; });
  const created = performance.now();
  const session = runAlpineSession({balance, level: stage, seed, equipment: {}, power: 1, canvas, controls, status, t, debug: true, storage: memory(), sound() {},
    finish: () => ({ok: true}), cancel() {}, onError(reason) { statusLine.textContent = `שגיאה: ${reason}`; }});
  window.__perfSession = session;
  const engine = session.debug.engine, input = session.debug.input();
  const timed = (obj, key, slot) => { const original = obj[key]; obj[key] = function (...args) { const t0 = performance.now(); const out = original.apply(this, args); if (pending) pending[slot] += performance.now() - t0; return out; }; };
  timed(engine, 'step', 'step'); timed(engine, 'snapshot', 'snapshot'); timed(engine, 'presentation', 'presentation');
  const pilot = makePilot(engine);
  input.sample = player => pilot(player);
  const switches = [];
  current = {stop() { stopped = true; session.dispose(); window.requestAnimationFrame = rawRaf; }};

  await new Promise((resolve, reject) => { const wait = () => { if (stopped) return reject(new Error('stopped')); const snap = session.snapshot; if (snap.error) return reject(new Error(snap.error)); if (snap.loaded) return resolve(); rawRaf(wait); }; wait(); });
  const loadMs = Math.round(performance.now() - created), view = session.debug.view();
  timed(view, 'render', 'render');
  const originalSetQuality = view.setQuality;
  view.setQuality = value => { const t0 = performance.now(); originalSetQuality(value); switches.push({to: value, costMs: round(performance.now() - t0), frameIndex: frames.length, atSecond: round((performance.now() - startWall) / 1000, 1)}); };
  statusLine.textContent = 'מתחילים את המרוץ';
  screen.querySelector('[data-action=alpine-start]')?.click();
  await new Promise(resolve => { const wait = () => { if (stopped || engine.phase === 'racing') return resolve(); rawRaf(wait); }; wait(); });
  if (stopped) return;
  startWall = performance.now(); recording = true;
  let switched = false, auditHigh = null;
  await new Promise(resolve => { const wait = () => {
    if (stopped || engine.phase !== 'racing') return resolve();
    const elapsed = (performance.now() - startWall) / 1000;
    statusLine.textContent = `מודדים · ${Math.floor(elapsed)} / ${seconds} שניות · ${frames.length} פריימים`;
    if (!auditHigh && elapsed > 2.5 && frames.length > 2) auditHigh = view.audit?.() ?? null;
    if (forceSwitch && !switched && elapsed > seconds / 2) { switched = true; view.setQuality(view.quality === 'low' ? 'high' : 'low'); }
    if (elapsed >= seconds) return resolve();
    rawRaf(wait); }; wait(); });
  recording = false;
  const measured = (performance.now() - startWall) / 1000, audit = view.audit?.() ?? null;
  const WARM = 2000, firstTs = frames[0]?.ts ?? 0, steady = frames.filter(f => f.ts - firstTs >= WARM), steadySeconds = steady.length > 1 ? (steady.at(-1).ts - steady[0].ts) / 1000 : 0;
  const deltas = steady.slice(1).map((f, i) => f.ts - steady[i].ts), sortedDeltas = [...deltas].sort((a, b) => a - b);
  const costs = steady.map(f => f.cost), sortedCosts = [...costs].sort((a, b) => a - b);
  const part = key => round(mean(steady.map(f => f[key])), 3);
  const allocs = steady.map(f => f.alloc).filter(a => a !== null && a >= 0).sort((a, b) => a - b);
  const allocKB = allocs.length > 5 && new Set(allocs).size > 2 ? {median: round(percentile(allocs, .5), 1), p90: round(percentile(allocs, .9), 1)} : null;
  const metrics = session.snapshot.renderMetrics || {};
  const result = {
    width: innerWidth, height: innerHeight, pixelRatio: metrics.pixelRatio ?? devicePixelRatio, mobileProfile: !!metrics.mobileProfile, small, stage, seed, seconds: round(measured, 1), loadMs,
    frames: steady.length, allFrames: frames.length, avgFps: steadySeconds ? round((steady.length - 1) / steadySeconds, 1) : 0, warmupMs: WARM,
    firstRacingFrames: frames.slice(0, 4).map(f => ({frameMs: round(f.cost), render: round(f.render), step: round(f.step, 2)})),
    frameMs: {p50: round(percentile(sortedDeltas, .5)), p95: round(percentile(sortedDeltas, .95)), p99: round(percentile(sortedDeltas, .99)), max: round(sortedDeltas.at(-1) ?? 0)},
    over33: deltas.filter(d => d > 33).length, over50: deltas.filter(d => d > 50).length,
    tickMs: {avg: round(mean(costs), 3), p95: round(percentile(sortedCosts, .95), 3), max: round(sortedCosts.at(-1) ?? 0, 3)},
    parts: {step: part('step'), snapshot: part('snapshot'), presentation: part('presentation'), render: part('render'), other: round(mean(frames.map(f => f.cost - f.step - f.snapshot - f.presentation - f.render)), 3)},
    allocKB, audit, auditHigh, switchMetrics: metrics.lastSwitch ?? null,
    qualitySwitches: switches.map(q => { const i = q.frameIndex, around = deltas.slice(Math.max(0, i - 10), i + 10); return {...q, frameMs: round(deltas[i] ?? deltas[i - 1] ?? 0), over50Around: around.filter(d => d > 50).length, maxAround: round(Math.max(0, ...around))}; }),
    render: {calls: metrics.calls, triangles: metrics.triangles, trees: metrics.trees, chunks: metrics.chunks, visibleChunks: metrics.visibleChunks, quality: metrics.quality, mode: metrics.mode, geometries: metrics.geometries, textures: metrics.textures},
    finalPhase: engine.phase, userAgent: navigator.userAgent,
  };
  statusLine.textContent = `הסתיים · ${result.avgFps} fps בממוצע`;
  show(result);
  window.__perf.result = result; window.__perf.runs.push(result); window.__perf.done = true;
  current.stop(); current = null;
}
doc.getElementById('again').addEventListener('click', () => run().catch(e => { statusLine.textContent = `שגיאה: ${e.message}`; window.__perf.error = e.message; window.__perf.done = true; }));
doc.getElementById('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(jsonBox.textContent); statusLine.textContent = 'הועתק'; } catch { statusLine.textContent = 'ההעתקה נכשלה, אפשר לסמן את הטקסט'; } });
doc.getElementById('toggle').addEventListener('click', () => doc.querySelector('.perf-panel').classList.toggle('collapsed'));
if (params.get('autostart') === '1') doc.getElementById('again').click();
