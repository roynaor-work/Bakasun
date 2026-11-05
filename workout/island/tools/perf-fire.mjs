import {createFireModel} from '../minigames/fire.mjs';
import {createFireView} from '../minigames/fire-view.mjs';
import {seededRandom} from '../minigames/context.mjs';

/** Fire performance page. Real model + real three.js view, scripted play (drive to the first fire, spray it).
 * Query: seconds (default 12), level (default 6), fireV7=0 (old look), dpr. Result: window.__perf.result.
 * Frame times are wall-clock rAF intervals; under SwiftShader they measure software rasterisation, not a phone. */
const params = new URLSearchParams(location.search);
const seconds = Number(params.get('seconds') || 12), level = Number(params.get('level') || 6);
const [config, strings] = await Promise.all([fetch('../data/config.json').then(r => r.json()), fetch('../data/strings.he.json').then(r => r.json())]);
const minigames = config.minigames, balance = minigames.fireRescue;
const canvas = document.getElementById('c'), out = document.getElementById('out'), paint = canvas.getContext('2d');
const ctx = {config: {...minigames, width: 360, height: 480}, balance, t: id => strings[id] || id};
const model = createFireModel({config: minigames, balance, level, random: seededRandom(2026)});
const view = createFireView(ctx, model);
window.__perf = {done: false, result: null, view, model};
if (!view) { window.__perf.result = {error: 'no view'}; window.__perf.done = true; out.textContent = 'no view'; }
else {
  const times = []; let last = 0, start = 0; const percentile = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const tick = now => {
    if (!start) start = now;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    if (last) times.push(now - last);
    last = now;
    const f = model.flames.find(x => x.active) || model.flames[0];
    model.update(dt || .016, {x: f.x, y: f.y, firing: now - start > 1500});
    view.draw(paint);
    if (now - start < seconds * 1000) requestAnimationFrame(tick); else finish();
  };
  const finish = () => {
    const settled = times.slice(Math.min(30, times.length >> 2)), sorted = settled.slice().sort((a, b) => a - b);
    const m = view.metrics(), mean = settled.reduce((a, b) => a + b, 0) / Math.max(1, settled.length);
    window.__perf.result = {frames: settled.length, meanMs: +mean.toFixed(1), medianMs: +percentile(sorted, .5).toFixed(1), p95Ms: +percentile(sorted, .95).toFixed(1), fps: +(1000 / mean).toFixed(1),
      triangles: m.rendererTriangles, drawCalls: m.rendererDrawCalls, modelTriangles: m.triangles, quality: m.fireV7 ? {level: m.fireV7.level, steps: m.fireV7.governorSteps, loaded: m.fireV7.loaded, failed: m.fireV7.failed, swaps: m.fireV7.swaps, atlas: m.fireV7.effects?.atlas, perFrame: m.fireV7.effects?.perFrame} : null, city: m.city, truckLoaded: m.truck?.loaded, search: location.search};
    window.__perf.done = true; out.textContent = JSON.stringify(window.__perf.result, null, 1);
  };
  requestAnimationFrame(tick);
}
