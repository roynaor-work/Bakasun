// Cost of "תפוס את הפושע" v7 per stage against the same session with every v7 flag off (= v22): draw calls, triangles and the
// JS time of chase.step + view.update (software GL, only the relative size means something). Three frames per stage:
//   chase  3 s after the start (as tools/catch-perf6.mjs)
//   busy   the heaviest v7 moment: the helicopter and its spotlight (tracker), the sticky net on the car, a spike strip on the
//          road, nitro orbs and a police roadblock in view (v7 only; v22 measures the same moment of its own chase)
//   throw  the catch after the chase
//   node workout/island/tools/catch-perf7.mjs [stages=1,5,8,10] [baseUrl=http://127.0.0.1:8765/workout/island/]
import {pathToFileURL} from 'node:url';
const [,, stagesArg = '1,5,8,10', base = 'http://127.0.0.1:8765/workout/island/'] = process.argv;
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT ? pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href : '/opt/node-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server']});
const rows = [];
for (const stage of stagesArg.split(',').map(Number)) for (const [label, q] of [['v22', '&catchWeapons=0&catchElements=0&catchAssist=0&catchSiren=v6'], ['v7', '']]) {
  const page = await browser.newPage({viewport: {width: 844, height: 390}, deviceScaleFactor: 1});
  await page.goto(`${base}tools/catch-harness6.html?stage=${stage}&dev=1${q}`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
  await page.waitForFunction(() => session.snapshot.mode === 'chase');
  const sample = await page.evaluate(async () => {
    const d = session.debug, v = d.view(), r = v.renderer, c = session.chase, out = {};
    const time = (label, fn) => { for (let i = 0; i < 10; i++) fn(); const t0 = performance.now(); for (let i = 0; i < 60; i++) fn(); out[label] = +((performance.now() - t0) / 60).toFixed(2); };
    const frame = () => { d.stepChase(1 / 60); v.update(1 / 60, {}); };
    for (let i = 0; i < 60 * 3; i++) d.stepChase(1 / 60);
    time('chaseMs', frame); out.chaseCalls = r.info.render.calls; out.chaseTris = r.info.render.triangles;
    // the busy moment: the police car right behind him, every v7 tool shown at once, an orb line and a roadblock ahead
    if (c.v7?.weapons) {
      await new Promise(res => setTimeout(res, 300)); // the effects module loads lazily
      const orb = c.obstacles.find(o => o.kind === 'nitro' && o.s > c.state.s + 20), block = c.obstacles.find(o => o.police && o.s > c.state.s);
      c.state.crim.s = c.state.s + 12; c.state.crim.d = c.state.d; for (let i = 0; i < 3; i++) d.stepChase(1 / 60);
      c.gun.raw.marked = 12; c.gun.raw.slows.net = 3; // the tracker (helicopter) and the sticky net, as after two hits
      c.gun.select('spikes'); d.stepChase(1 / 60); c.gun.raw.locked = true; c.gun.state.perTool.spikes.reload = 0; c.fire(); // a strip on the road
      let shift = 0; if (orb && block) { const lo = Math.min(orb.s, block.s); if (lo - c.state.s > 120) { shift = lo - c.state.s - 100; c.state.s += shift; c.state.crim.s += shift; } }
      for (let i = 0; i < 90; i++) frame();
      out.busy = v.fx7?.stats?.() || null;
      time('busyMs', frame); out.busyCalls = r.info.render.calls; out.busyTris = r.info.render.triangles;
      c.state.s -= shift; c.state.crim.s -= shift; for (let i = 0; i < 3; i++) frame(); // back to the same stretch of road, so the throw compares with v22
    } else { for (let i = 0; i < 90; i++) frame(); time('busyMs', frame); out.busyCalls = r.info.render.calls; out.busyTris = r.info.render.triangles; }
    d.skipChase();
    return new Promise(res => setTimeout(() => { time('throwMs', () => { d.step(1 / 60); v.update(1 / 60, {}); }); out.throwCalls = r.info.render.calls; out.throwTris = r.info.render.triangles; out.textures = r.info.memory.textures; out.geometries = r.info.memory.geometries; res(out); }, 3200));
  });
  rows.push({stage, label, ...sample}); await page.close();
}
console.log('stage ver   chase: ms calls tris      busy: ms calls tris      throw: ms calls tris      textures geometries');
for (const r of rows) console.log(String(r.stage).padStart(3), r.label.padEnd(4), String(r.chaseMs).padStart(9), String(r.chaseCalls).padStart(5), String(r.chaseTris).padStart(8), String(r.busyMs).padStart(10), String(r.busyCalls).padStart(5), String(r.busyTris).padStart(8), String(r.throwMs).padStart(10), String(r.throwCalls).padStart(5), String(r.throwTris).padStart(8), String(r.textures).padStart(9), String(r.geometries).padStart(9), r.busy ? JSON.stringify(r.busy) : '');
console.log(JSON.stringify(rows));
await browser.close();
