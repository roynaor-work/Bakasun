// QA checks 1 (8-frame sheet through a bend), 3 (crash + oil screenshots), 8 (day/dusk/night), (d) road width and camera angle.
// Deterministic: tools/catch-view6-harness.html with manual=1 and window.stepN.
import {writeFile} from 'node:fs/promises';
import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], out = {};
const browser = await launch();
const open = async (page, q) => { await page.goto(`${BASE}tools/catch-view6-harness.html?${q}`); await page.waitForFunction('window.done===true', null, {timeout: 180000}); };
// camera-vs-car angle (deg, xz plane), road width in px at the car, both cars' screen boxes
const probe = `(()=>{const st=chase.state,tr=chase.track,cam=view.camera;const dir=cam.getWorldDirection(new cam.position.constructor());
 const camYaw=Math.atan2(-dir.z,dir.x),carYaw=tr.yawAt(st.s);let a=(camYaw-carYaw)*180/Math.PI;while(a>180)a-=360;while(a<-180)a+=360;
 const P=(x,y,z)=>view.project(x,y,z);const l=tr.toWorld(st.s,-chase.C.roadHalf),r=tr.toWorld(st.s,chase.C.roadHalf);const pl=P(l.x,0,l.z),pr=P(r.x,0,r.z);
 const cl=tr.toWorld(st.crim.s,-chase.C.roadHalf),cr=tr.toWorld(st.crim.s,chase.C.roadHalf);const pcl=P(cl.x,0,cl.z),pcr=P(cr.x,0,cr.z);
 const car=view.playerCar.position,crim=view.crimCar.position;const pc=P(car.x,.8,car.z),pk=P(crim.x,.8,crim.z);
 const fwd=tr.toWorld(st.s+2.2,st.d),bk=tr.toWorld(st.s-2.2,st.d);const pf=P(fwd.x,.5,fwd.z),pb=P(bk.x,.5,bk.z);
 const seg=tr.segmentAt(st.s);
 return {t:+st.t.toFixed(2),s:Math.round(st.s),d:+st.d.toFixed(2),v:+st.v.toFixed(1),steer:+st.steer.toFixed(2),slide:+st.slide.toFixed(2),k:+(st.curvature*1000).toFixed(2),seg:seg.kind+(seg.radius?seg.radius:''),camMinusCarDeg:+a.toFixed(1),roadPxAtCar:Math.round(Math.hypot(pr.x-pl.x,pr.y-pl.y)),roadPxAtThief:Math.round(Math.hypot(pcr.x-pcl.x,pcr.y-pcl.y)),car:{x:Math.round(pc.x),y:Math.round(pc.y)},thief:{x:Math.round(pk.x),y:Math.round(pk.y),visible:pk.visible},carAxisPx:{dx:Math.round(pf.x-pb.x),dy:Math.round(pf.y-pb.y)},gap:+st.gap.toFixed(1),fov:+cam.fov.toFixed(1),phase:st.phase}})()`;

// --- check 8: themes ---
out.themes = [];
for (const [stage, name] of (process.env.SKIP_THEMES ? [] : [[1, 'day'], [5, 'dusk'], [8, 'night']])) {
  const page = await newPage(browser, errors); await open(page, `stage=${stage}&seed=3&auto=1&manual=1`);
  await page.evaluate(() => stepN(60 * 5));
  await page.screenshot({path: `${SHOTS}08-theme-${name}-stage${stage}.png`});
  out.themes.push({stage, name, ...(await page.evaluate(probe))});
  // night: a second frame a little later in the bend
  if (stage === 8) { await page.evaluate(() => stepN(60 * 4)); await page.screenshot({path: `${SHOTS}08-theme-night-stage8-bend.png`}); }
  await page.close();
}
console.log('themes', JSON.stringify(out.themes));

// --- check 1 + (d): 8 frames through the first bend of stage 3 (R=114, 36°), with the model driver ---
{
  const page = await newPage(browser, errors); await open(page, 'stage=3&seed=3&auto=1&manual=1');
  const arc = await page.evaluate(() => chase.track.segments.find(s => s.kind === 'arc'));
  await page.evaluate(s0 => { while (chase.state.s < s0 - 25 && chase.state.phase !== 'end') stepN(30); }, arc.s0);
  const frames = []; const span = (arc.s1 - arc.s0) + 50;
  for (let i = 0; i < 8; i++) {
    const target = arc.s0 - 25 + span * i / 7;
    await page.evaluate(tg => { while (chase.state.s < tg - 6 && chase.state.phase !== 'end') stepN(6); while (chase.state.s < tg && chase.state.phase !== 'end') stepN(1); stepN(1); }, target);
    await page.screenshot({path: `${SHOTS}01-bend-stage3-f${i}.png`});
    frames.push(await page.evaluate(probe));
  }
  out.bendFrames = {arc, frames}; console.log('bend frames', JSON.stringify(frames));
  await page.close();
}
// --- (d): road width at the car on a straight and in bends, stages 1 and 8, 4 frames each "both cars from behind" ---
out.width = [];
for (const stage of [1, 8]) {
  const page = await newPage(browser, errors); await open(page, `stage=${stage}&seed=3&auto=1&manual=1`);
  // keep the thief in view: no shooting (hitChance 0 by patching fire)
  await page.evaluate(() => { chase.fire = () => false; });
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => stepN(60 * (3 + 2)));
    await page.screenshot({path: `${SHOTS}0d-behind-stage${stage}-f${i}.png`});
    samples.push(await page.evaluate(probe));
  }
  out.width.push({stage, samples}); console.log('width stage', stage, JSON.stringify(samples));
  await page.close();
}
// --- check 3: a crash into traffic and an oil slick, stage 7 (has oil) ---
{
  const page = await newPage(browser, errors); await open(page, 'stage=7&seed=3&auto=0&manual=1');
  const info = await page.evaluate(() => ({oil: chase.obstacles.filter(o => o.kind === 'oil').map(o => ({s: Math.round(o.s), d: o.d})), kinds: chase.obstacles.map(o => o.kind + '@' + Math.round(o.s) + '/' + o.d)}));
  console.log('stage 7 obstacles', JSON.stringify(info));
  // countdown, then drive at the first solid obstacle in lane: steer to its d
  await page.evaluate(() => { while (chase.state.phase !== 'run') stepN(15); });
  const crash = await page.evaluate(() => {
    const st = chase.state, solid = chase.obstacles.filter(o => ['traffic', 'parked', 'barrier', 'cone'].includes(o.kind) && o.s > st.s + 20).sort((a, b) => a.s - b.s)[0];
    let guard = 0, hits0 = st.hits;
    while (st.hits === hits0 && guard++ < 60 * 30 && st.phase === 'run') { const os = chase.obstacleS(solid, st.t); chase.setSteer(Math.max(-1, Math.min(1, (solid.d - st.d) * 1.5 - st.slide * .9 / chase.C.steerSpeed))); chase.setBoost(os - st.s > 30); chase.setBrake(false); stepN(3); }
    const v0 = st.v; stepN(2);
    return {kind: solid.kind, model: solid.model, hits: st.hits, v: +st.v.toFixed(1), stun: +st.stun.toFixed(2), t: +st.t.toFixed(2)};
  });
  await page.screenshot({path: `${SHOTS}03-crash-stage7.png`});
  // oil: teleport 22 m before the first slick, drive straight into it
  const oil = await page.evaluate(() => {
    const st = chase.state, o = chase.obstacles.find(o => o.kind === 'oil'); st.s = o.s - 22; st.d = o.d; st.crim.s = st.s + 40; st.crim.d = -o.d || 3.3; st.v = 22; st.stun = 0;
    chase.setSteer(0); chase.setBoost(false); stepN(12);
    return {s: Math.round(o.s), d: o.d, carS: Math.round(st.s)};
  });
  await page.screenshot({path: `${SHOTS}03-oil-ahead-stage7.png`});
  const oilHit = await page.evaluate(() => { const st = chase.state; let g = 0; while (st.oil <= 0 && g++ < 300) { chase.setSteer(0); stepN(3); } stepN(8); return {oil: +st.oil.toFixed(2), slide: +st.slide.toFixed(2), d: +st.d.toFixed(2), grip: st.oil > 0 ? .15 : 1}; });
  await page.screenshot({path: `${SHOTS}03-oil-slide-stage7.png`});
  out.crash = crash; out.oil = {...oil, ...oilHit}; console.log('crash', JSON.stringify(crash), 'oil', JSON.stringify(out.oil));
  await page.close();
}
out.errors = errors;
await writeFile(new URL('../measurements-view.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
