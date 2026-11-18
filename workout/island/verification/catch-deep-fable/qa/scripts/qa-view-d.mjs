// QA check (d), second pass: road width in pixels at the police car (compare chase/road-width-after.json: 396 px at stage 3, seed 3, t 5.5),
// and 4 frames on a straight where both cars are seen from behind, with the camera-vs-heading angle of both cars. Also check 8: chase
// screenshots at day (1), dusk (5), night (8). Deterministic: tools/catch-view6-harness.html with manual=1 and window.stepN.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], out = {};
const browser = await launch();
const open = async (page, q) => { await page.goto(`${BASE}tools/catch-view6-harness.html?${q}`); await page.waitForFunction('window.done===true', null, {timeout: 180000}); };
const probe = `(()=>{const st=chase.state,tr=chase.track,cam=view.camera;const dir=cam.getWorldDirection(new cam.position.constructor());
 const camYaw=Math.atan2(-dir.z,dir.x);const ang=yaw=>{let a=(camYaw-yaw)*180/Math.PI;while(a>180)a-=360;while(a<-180)a+=360;return +a.toFixed(1)};
 const P=(x,y,z)=>view.project(x,y,z);const l=tr.toWorld(st.s,-chase.C.roadHalf),r=tr.toWorld(st.s,chase.C.roadHalf);const pl=P(l.x,0,l.z),pr=P(r.x,0,r.z);
 const cl=tr.toWorld(st.crim.s,-chase.C.roadHalf),cr=tr.toWorld(st.crim.s,chase.C.roadHalf);const pcl=P(cl.x,0,cl.z),pcr=P(cr.x,0,cr.z);
 const car=view.playerCar.position,crim=view.crimCar.position;const pc=P(car.x,.8,car.z),pk=P(crim.x,.8,crim.z);
 const seg=tr.segmentAt(st.s),segC=tr.segmentAt(st.crim.s);
 return {t:+st.t.toFixed(2),s:Math.round(st.s),d:+st.d.toFixed(2),v:+st.v.toFixed(1),k:+(st.curvature*1000).toFixed(2),seg:seg.kind+(seg.radius||''),crimSeg:segC.kind+(segC.radius||''),camMinusCarDeg:ang(tr.yawAt(st.s)),camMinusThiefDeg:ang(tr.yawAt(st.crim.s)),roadPxAtCar:Math.round(Math.hypot(pr.x-pl.x,pr.y-pl.y)),roadPxAtThief:Math.round(Math.hypot(pcr.x-pcl.x,pcr.y-pcl.y)),car:{x:Math.round(pc.x),y:Math.round(pc.y)},thief:{x:Math.round(pk.x),y:Math.round(pk.y),visible:pk.visible},gap:+st.gap.toFixed(1),fov:+cam.fov.toFixed(1),phase:st.phase,roadM:2*chase.C.roadHalf}})()`;
// --- compare with chase/road-width-after.json: stage 3, seed 3, 5.5 s ---
{
  const page = await newPage(browser, errors); await open(page, 'stage=3&seed=3&auto=1&manual=1');
  await page.evaluate(() => { while (chase.state.t < 5.5) stepN(1); });
  out.compare = await page.evaluate(probe); await page.screenshot({path: `${SHOTS}0d-road-width-stage3-t5.5.png`});
  console.log('compare', JSON.stringify(out.compare)); await page.close();
}
// --- check 8: chase at day / dusk / night ---
out.themes = [];
for (const [stage, name] of [[1, 'day'], [5, 'dusk'], [8, 'night']]) {
  const page = await newPage(browser, errors); await open(page, `stage=${stage}&seed=3&auto=1&manual=1`);
  await page.evaluate(() => stepN(60 * 5));
  await page.screenshot({path: `${SHOTS}08-chase-${name}-stage${stage}.png`});
  out.themes.push({stage, name, ...(await page.evaluate(probe))});
  await page.close();
}
console.log('themes', JSON.stringify(out.themes));
// --- (d): 4 frames on a straight with both cars from behind, stages 1 and 8 (gun disabled so the thief stays in frame) ---
out.straight = [];
for (const stage of [1, 8]) {
  const page = await newPage(browser, errors); await open(page, `stage=${stage}&seed=3&auto=1&manual=1`);
  await page.evaluate(() => { chase.fire = () => false; });
  // past the opening straight (the countdown is on it): reach the second straight segment where both cars are on it
  await page.evaluate(() => { const tr = chase.track, st = chase.state; let g = 0; while (g++ < 60 * 90 && !(st.phase === 'run' && st.s > 120 && tr.segmentAt(st.s).kind === 'straight' && tr.segmentAt(st.crim.s).kind === 'straight')) stepN(1); });
  const samples = [];
  for (let i = 0; i < 4; i++) {
    if (i) await page.evaluate(() => stepN(42));
    await page.screenshot({path: `${SHOTS}0d-straight-stage${stage}-f${i}.png`});
    samples.push(await page.evaluate(probe));
  }
  out.straight.push({stage, samples}); console.log('straight stage', stage, JSON.stringify(samples));
  await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-view-d.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
