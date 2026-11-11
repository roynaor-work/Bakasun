// Two things seen in the frames: (1) at stage 3, s≈63, the road ribbon was not drawn (only the ground); (2) at a 6 m gap in the
// same lane the getaway car hides behind the police car. Render a few exact frames and count road pixels / the thief's visible box.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
const out = {road: [], occlusion: []};
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=3&seed=3&auto=1&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.evaluate(() => { window.quietTo = s => { let g = 0; while (chase.state.s < s && g++ < 5000) { chase.step(1 / 60); view.handleChase(chase.drainEvents()); view.update(1 / 60, {noRender: true}); } view.update(1 / 60, {}); }; });
// road pixels: sample the bottom band of the canvas for dark asphalt (r,g,b all < 110 and close together)
const roadRatio = async () => page.evaluate(() => { const cv = document.getElementById('cv'); const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height; const c = g.getContext('2d'); c.drawImage(cv, 0, 0); const band = c.getImageData(0, Math.floor(g.height * .62), g.width, Math.floor(g.height * .3)).data; let dark = 0, n = 0; for (let i = 0; i < band.length; i += 16) { const r = band[i], gg = band[i + 1], b = band[i + 2]; n++; if (r < 120 && gg < 120 && b < 130 && Math.abs(r - gg) < 25 && Math.abs(gg - b) < 30) dark++; } return +(dark / n).toFixed(3); });
await page.evaluate(() => { while (chase.state.phase !== 'run') { chase.step(1 / 60); chase.drainEvents(); } });
for (const s of [20, 40, 55, 58, 61, 63, 65, 68, 72, 80, 100]) {
  await page.evaluate(q => quietTo(q), s);
  const info = await page.evaluate(() => ({s: Math.round(chase.state.s), d: +chase.state.d.toFixed(2), v: +chase.state.v.toFixed(1), fov: +view.camera.fov.toFixed(1), boosting: chase.state.boosting, camY: +view.camera.position.y.toFixed(2), roadVisible: view.scene.children.find(o => o.geometry?.attributes?.uv && o.material?.map && o.position.x === 0)?.visible}));
  const ratio = await roadRatio(); out.road.push({...info, asphaltRatioBottomBand: ratio});
  if (ratio < .25) await page.screenshot({path: `${SHOTS}0x-road-missing-stage3-s${info.s}.png`});
  console.log('road', JSON.stringify({...info, ratio}));
}
await page.screenshot({path: `${SHOTS}0x-road-check-stage3-s100.png`});
// occlusion: stage 1, same lane, gaps 5 / 8 / 12 / 18 m: the thief's car box on screen vs the police car box
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=1&seed=3&auto=0&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
await page.evaluate(() => { while (chase.state.phase !== 'run') { chase.step(1 / 60); chase.drainEvents(); } chase.fire = () => false; });
for (const gap of [5, 8, 12, 18]) {
  const info = await page.evaluate(g => {
    const st = chase.state; st.s = 150; st.d = 0; st.crim.s = 150 + g; st.crim.d = 0; st.crim.targetD = 0; st.v = 22; st.crim.v = 22;
    for (let i = 0; i < 20; i++) { chase.setSteer(0); chase.step(1 / 60); view.handleChase(chase.drainEvents()); view.update(1 / 60, {noRender: true}); } view.update(1 / 60, {});
    const P = (x, y, z) => view.project(x, y, z); const pc = view.playerCar.position, cc = view.crimCar.position, tr = chase.track;
    const box = (s, d, w, h) => { const pts = []; for (const dd of [-w / 2, w / 2]) for (const y of [0, h]) for (const ds of [-2.2, 2.2]) { const p = tr.toWorld(s + ds, d + dd); const q = P(p.x, y, p.z); pts.push(q); } return {top: Math.round(Math.min(...pts.map(p => p.y))), bottom: Math.round(Math.max(...pts.map(p => p.y))), left: Math.round(Math.min(...pts.map(p => p.x))), right: Math.round(Math.max(...pts.map(p => p.x)))}; };
    const police = box(st.s, st.d, 2, 1.5), thief = box(st.crim.s, st.crim.d + (st.crim.wobble || 0), 2, 1.4);
    const wheel = tr.toWorld(st.crim.s - 1.4, st.crim.d + .9), wp = P(wheel.x, .35, wheel.z);
    return {gap: g, police, thief, rearWheelPx: {x: Math.round(wp.x), y: Math.round(wp.y)}, thiefVisibleRows: Math.max(0, police.top - thief.top), thiefHeightPx: thief.bottom - thief.top, locked: chase.gun.state.locked, chance: +chase.gun.state.hitChance.toFixed(2)};
  }, gap);
  await page.screenshot({path: `${SHOTS}0x-occlusion-stage1-gap${gap}.png`});
  out.occlusion.push(info); console.log('occlusion', JSON.stringify(info));
}
out.errors = errors; await writeFile(new URL('../measurements-road-occlusion.json', import.meta.url), JSON.stringify(out, null, 1));
await browser.close();
