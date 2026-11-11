// Screenshots for the v6 chase report. Uses tools/catch-view6-harness.html (chase + view, model driver, window.stepN).
//   node workout/island/verification/catch-deep-fable/chase/shots6.mjs <outDir> <job> [stage] [seed]
// jobs: width <name>  (one frame at a fixed step with the road width in pixels at the car)
//       sheet         (8 frames through the first long bend, composed later with sheet.py)
//       straight      (a frame on the opening straight: both cars from behind)
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const [,, outDir = '.', job = 'width', stageArg = '3', seedArg = '3', nameArg = 'road-width'] = process.argv;
const {chromium} = await import('/opt/node-tools/node_modules/playwright/index.mjs');
const base = 'http://127.0.0.1:8765/workout/island/';
const browser = await chromium.launch({args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server']});
await mkdir(outDir, {recursive: true});
const page = await browser.newPage({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true});
page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 300))); page.setDefaultTimeout(180000);
await page.goto(`${base}tools/catch-view6-harness.html?stage=${stageArg}&seed=${seedArg}&manual=1`);
await page.waitForFunction('window.done===true', null, {timeout: 120000});
const step = n => page.evaluate(n => window.stepN(n), n);
/** Playwright's screenshot can stall for minutes on a loaded machine with software GL; the canvas itself is captured right after a render instead. */
async function snap(file) {
  try { await page.screenshot({path: file, timeout: 45000}); }
  catch { const data = await page.evaluate(() => { window.stepN(1, 0); return view.renderer.domElement.toDataURL('image/png'); }); await writeFile(file, Buffer.from(data.split(',')[1], 'base64')); }
}
const info = () => page.evaluate(() => {
  const st = chase.state, t = chase.track, C = chase.C, l = t.toWorld(st.s, -C.roadHalf), r = t.toWorld(st.s, C.roadHalf);
  const pl = view.project(l.x, 0, l.z), pr = view.project(r.x, 0, r.z);
  const car = view.playerCar, crim = view.crimCar, cam = view.camera;
  // viewing angle of each car: 0 = seen exactly from behind, 90 = in profile
  const ang = (obj) => { const f = new view.camera.position.constructor(Math.cos(obj.rotation.y), 0, -Math.sin(obj.rotation.y)); const v = cam.position.clone().sub(obj.position); v.y = 0; v.normalize(); return Math.round(Math.acos(Math.abs(f.dot(v))) * 180 / Math.PI); };
  return {s: +st.s.toFixed(1), d: +st.d.toFixed(2), v: +st.v.toFixed(1), k: +(st.curvature * 1000).toFixed(2), gap: +st.gap.toFixed(1), roadPx: Math.round(Math.hypot(pr.x - pl.x, pr.y - pl.y)), carAngle: ang(car), crimAngle: ang(crim), phase: st.phase, wheelRot: car.userData.wheels?.[0]?.rotation.x};
});
if (job === 'width') {
  await step(60 * 5.5); const i = await info();
  await snap(path.join(outDir, nameArg + '.png')); console.log(JSON.stringify(i)); await writeFile(path.join(outDir, nameArg + '.json'), JSON.stringify(i));
} else if (job === 'straight') {
  await step(60 * 3.6); const i = await info(); await snap(path.join(outDir, `stage${stageArg}-straight-behind.png`)); console.log(JSON.stringify(i));
} else if (job === 'perf') {
  // draw calls, triangles and the JS time of chase.step + view.update per frame, 3 s into the chase (deterministic counts; the ms depend on the machine)
  const out = await page.evaluate(() => { window.stepN(60 * 3); const r = view.renderer; const t0 = performance.now(); for (let i = 0; i < 30; i++) window.stepN(1); const ms = (performance.now() - t0) / 30; return {calls: r.info.render.calls, tris: r.info.render.triangles, frameMs: +ms.toFixed(2), textures: r.info.memory.textures, geometries: r.info.memory.geometries}; });
  console.log(JSON.stringify({stage: +stageArg, ...out})); await writeFile(path.join(outDir, `perf-stage${stageArg}.json`), JSON.stringify({stage: +stageArg, ...out}));
} else if (job === 'sheet') {
  // find the first arc of at least 60 degrees after the opening straight and shoot 8 frames spread through it
  const arc = await page.evaluate(() => chase.track.segments.find(s => s.kind === 'arc' && s.angle > 1.0) || chase.track.segments.find(s => s.kind === 'arc'));
  const span = arc.s1 - arc.s0, marks = Array.from({length: 8}, (_, i) => arc.s0 - 12 + (span + 24) * i / 7);
  const rows = [];
  for (let i = 0; i < 8; i++) {
    let guard = 0; while (guard++ < 60 * 90) { const s = await page.evaluate(() => chase.state.s); if (s >= marks[i] || await page.evaluate(() => chase.state.phase === 'end')) break; await step(3); }
    const inf = await info(); rows.push(inf);
    await snap(path.join(outDir, `sheet-stage${stageArg}-${i + 1}.png`)); console.log(i + 1, JSON.stringify(inf));
  }
  await writeFile(path.join(outDir, `sheet-stage${stageArg}.json`), JSON.stringify({arc, rows}, null, 1));
}
await browser.close();
