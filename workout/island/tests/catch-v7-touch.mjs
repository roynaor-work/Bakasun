import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** "תפוס את הפושע" v7 with real touch, end to end, on the real island: hasTouch + isMobile at 844x390, software GL, every input
 * a CDP Input.dispatchTouchEvent on the real buttons and the real screen (steering finger on the left, boost held, the tool
 * button, the fire button, the help card, the library and stage buttons, the archery hold-drag-release). The script reads the
 * game state to decide like a player looking at the screen, and never writes it. It plays a whole chase with the tools, brings
 * the getaway car down, catches the thief with the net and wins the stage. Screenshots and a short JSON of what happened go to
 * CATCH_QA_DIR (default verification/catch-v7/touch). Slow on software GL: about 10 minutes.
 *   node workout/island/tests/catch-v7-touch.mjs   (CATCH_QUALITY=high for the full renderer, CATCH_STAGE=n) */
const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CATCH_QA_DIR || join(here, '../verification/catch-v7/touch');
const QUALITY = process.env.CATCH_QUALITY || 'low', STAGE = Number(process.env.CATCH_STAGE || 1);
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true, isMobile: true});
// CATCH_SOUND=off mutes the island; by default the sound is on, so the run also shows the Codex sound pack decoding and playing
if (process.env.CATCH_SOUND === 'off') await context.addInitScript(() => { localStorage.setItem('island.sound', 'off'); });
const page = await context.newPage(), errors = [], outside = [], log = {stage: STAGE, quality: QUALITY, taps: {}, tools: {}, events: [], shots: []};
page.setDefaultTimeout(900000);
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.origin !== new URL(server.url).origin) outside.push(r.url()); });
const cdp = await context.newCDPSession(page);
const S = 'window.__island.ui.activityInterface.current?.session';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const t0 = Date.now(), secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

// ----- real touch: every finger is a CDP touch point; each event lists the fingers still on the glass -----
// Chromium (CDP Input.dispatchTouchEvent) presses a new id on touchStart and moves the listed ids on touchMove, but the only
// release is touchEnd, which carries no points and lifts EVERY finger (a point merely left out of a touchMove stays pressed,
// and a lifted id is never pressed again). So lifting one finger = touchEnd, then the other fingers touch down again at once
// with new ids; the steering finger goes down at its drag origin and slides back to where it was, so the drag continues.
const fingers = new Map(); // name -> {id, x, y, home}
let nextId = 10; const fresh = () => nextId++;
const send = (type, list = [...fingers.values()].map(f => ({x: f.x, y: f.y, id: f.id, radiusX: 8, radiusY: 8, force: 1}))) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: list});
const down = async (name, x, y, home = null) => { fingers.set(name, {id: fresh(), x, y, home}); await send('touchStart'); };
const move = async (name, x, y) => { const f = fingers.get(name); if (!f) return; f.x = x; f.y = y; await send('touchMove'); };
async function up(name) {
  if (!fingers.has(name)) return; fingers.delete(name);
  await send('touchEnd', []);
  if (!fingers.size) return;
  const back = [];
  for (const f of fingers.values()) { f.id = fresh(); if (f.home) { back.push([f, f.x, f.y]); f.x = f.home.x; f.y = f.home.y; } }
  await send('touchStart');
  if (back.length) { for (const [f, x, y] of back) { f.x = x; f.y = y; } await send('touchMove'); }
}
const center = async (sel, must = true) => { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (must) assert.ok(b, 'on screen: ' + sel); return b ? {x: b.x + b.width / 2, y: b.y + b.height / 2} : null; };
// a game button can leave the screen between looking and tapping (the fire button goes when the car is down): then the tap lands on nothing
async function tap(sel, _id = 0, holdMs = 70, must = true) { const c = await center(sel, must); if (!c) return false; const id = 'tap' + fresh(); await down(id, c.x, c.y); await page.waitForTimeout(holdMs); await up(id); log.taps[sel] = (log.taps[sel] || 0) + 1; return true; }
const shot = async name => { const file = join(OUT, name + '.png'); await page.screenshot({path: file}); log.shots.push(name); console.log('  screenshot', name, secs()); };
const frames = () => page.evaluate(`${S}.debug.held().frames`);
const nextFrame = async f => page.waitForFunction(f => (window.__island.ui.activityInterface.current?.session?.debug.held().frames ?? 0) > f, f);

try {
  await mkdir(OUT, {recursive: true});
  await page.goto(server.url + `?dev=1&games=1&quality=${QUALITY}`, {waitUntil: 'networkidle'}); console.log('island loaded', secs());
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
  await tap('[data-action=avatar-start]');
  // the island's own gates (tutorial, daily lesson) are opened the way every island browser test opens them
  await page.evaluate(() => { const e = window.__island.engine; e.skipTutorial(); e.tick = () => ({ok: true}); window.__island.ui.activityInterface.requireDaily = () => false; });
  await page.evaluate(() => window.__island.ui.activityInterface.menu());
  await page.locator('[data-action=game-enter][data-game-id=catchCriminal]').scrollIntoViewIfNeeded();
  // library -> game home -> play -> stage map -> stage 1, all by touch
  await tap('[data-action=game-enter][data-game-id=catchCriminal]');
  await page.waitForSelector('[data-action=game-play]'); await tap('[data-action=game-play]');
  await page.waitForSelector('[data-action=stage-play]'); await tap(`[data-action=stage-play] >> nth=${STAGE - 1}`);
  // the island's "how to play" card comes first; its play button starts the game
  await page.waitForSelector('[data-action=game-understood]', {timeout: 60000}).then(async () => { await page.waitForTimeout(300); await shot('00-intro'); await tap('[data-action=game-understood]'); }).catch(() => {});
  console.log('stage map and intro by touch: ok', secs());
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot?.ready);
  await page.waitForFunction(() => document.querySelector('.game-screen')?.dataset.starting !== 'true');
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.mode === 'chase');
  const v7 = await page.evaluate(`${S}.snapshot.v7`); log.v7 = v7;
  assert.deepEqual({weapons: v7.weapons, assist: v7.assist, elements: v7.elements, siren: v7.siren, assets: v7.assets}, {weapons: true, assist: true, elements: true, siren: .55, assets: true}, 'v7 is the default (tools, assist, road elements, the softer siren, the Codex packs)');
  assert.equal(v7.props, true, 'the Codex prop pack is drawn (catch-props7.mjs loaded in the real island)');
  log.pack = {start: await page.evaluate(`({props:${S}.debug.view().props7Stats(),files:${S}.debug.view().props7.stats(),sounds:${S}.snapshot.v7.sounds})`)};
  // the help card of stage 1 (new save): read it and tap the button
  if (await page.locator('.catch-help:not([hidden]) .catch-help-ok').count()) { await page.waitForTimeout(300); await shot('01-help'); await tap('.catch-help-ok'); }
  console.log('library, stage map and help card by touch: ok', secs());

  // ----- the chase: one finger steers on the left, the other hand boosts, cycles the tool and fires -----
  // what a player sees: the lanes ahead (free or blocked), the thief, the reticle and its colour, the tool button
  const read = `(()=>{const s=${S},c=s.chase,st=c.state,g=c.gun.state,a=c.gun.aimInfo?.(),raw=c.gun.raw||{},k=Math.abs(c.track.curvatureAt(st.s+30));
    const freeOf=lane=>{let free=60;for(const o of c.obstacles){if(o.kind==='pad'||o.kind==='nitro'||o.kind==='oil')continue;const os=c.obstacleS(o,st.t)-st.s;if(os>-2&&os<60&&Math.abs(o.d-lane)<2.2)free=Math.min(free,os);}return free;};
    let best=0,bs=-1e9;for(const lane of c.C.lanes){const sc=freeOf(lane)-Math.abs(lane-st.d)*1.5;if(sc>bs){bs=sc;best=lane;}}
    const zone=g.locked&&a?(a.weapon==='spikes'?a.predD:a.zoneD):st.crim.d,zoneFree=freeOf(Math.max(-3.6,Math.min(3.6,zone)))>22;
    return {mode:s.snapshot.mode,phase:st.phase,frames:s.debug.held().frames,t:st.t,d:st.d,slide:st.slide,gap:st.gap,tank:st.tank,bend:k>1/110,crimD:st.crim.d,v:st.v,want:zoneFree?zone:best,
      locked:g.locked,q:g.quality,reload:g.reload,ammo:g.ammo,tool:g.weapon,damage:st.damage,aimD:a?(a.weapon==='spikes'?a.predD:a.zoneD):null,close:g.closeT>0,
      hits:g.hits,shots:g.shots,net:(raw.slows?.net||0)>0,emp:(raw.slows?.emp||0)>0,marked:(raw.marked||0)>0,strips:(raw.strips||[]).filter(x=>x.state==='live').length,nitro:st.nitro||0,
      ramp:c.obstacles.some(o=>o.kind==='pad'&&o.s-st.s>14&&o.s-st.s<40),air:+(s.debug.view()?.playerCar.position.y||0).toFixed(2),block:c.obstacles.some(o=>o.police&&o.s-st.s>16&&o.s-st.s<55),
      sounds:s.snapshot.v7.sounds,fx:s.debug.view()?.fx7?.stats?.()||null};})()`;
  const STEER = {x: 200, y: 280};
  let steering = false, boosting = false, braking = false, f = await frames(), lastHits = 0, firstLock = false, seen = {}, plan = ['net', 'tyres', 'mark', 'tyres', 'spikes', 'tyres', 'emp', 'tyres'], planIdx = 0, guard = 0, lastLog = 0, lastT = 0, yellowFor = 0, stuckFor = 0;
  while (guard++ < 6000) {
    const r = await page.evaluate(read);
    if (r.mode !== 'chase') break;
    if (r.phase === 'run') {
      const steer = clamp((r.want - r.d) * .55 - r.slide / 5.6, -1, 1); // the zone (or the thief) when its lane is free, else the free lane
      if (!steering) { await down('steer', STEER.x, STEER.y, STEER); steering = true; }
      await move('steer', STEER.x + Math.round(steer * 60), STEER.y);
      const wantBoost = r.tank > .15 && !r.bend && r.gap > 7;
      if (r.gap < -1.5 && !braking) { const c = await center('.catch-brake', false); if (c) { await down('brake', c.x, c.y); braking = true; } } else if (r.gap >= -1.5 && braking) { await up('brake'); braking = false; }
      if (wantBoost && !boosting) { const c = await center('.catch-boost', false); if (c) { await down('boost', c.x, c.y); boosting = true; } }
      else if (!wantBoost && boosting) { await up('boost'); boosting = false; }
      // like a child: green = tap at once; yellow = tap after a short wait (about 0.6 s of game time)
      const dtg = Math.max(0, r.t - lastT); lastT = r.t; yellowFor = r.locked && r.q === 'yellow' ? yellowFor + dtg : 0; stuckFor = r.locked && r.q === 'green' ? 0 : stuckFor + dtg;
      if (r.locked && r.reload <= 0 && r.ammo > 0 && (r.q === 'green' || yellowFor >= .6)) {
        if (!firstLock && r.q === 'green') { firstLock = true; await shot('02-chase-green'); }
        if (await tap('.catch-fire', 3, 50, false)) { log.tools[r.tool] = (log.tools[r.tool] || 0) + 1; yellowFor = 0; console.log(`  fire ${r.tool} (${r.q}) at t ${r.t.toFixed(1)} gap ${r.gap.toFixed(1)}`, secs()); }
      }
      // a new hit (or an empty tool): the next tool in the plan, through the one tool button
      if (r.hits > lastHits || (r.ammo <= 0 && r.reload <= 0) || stuckFor > 2.5) {
        lastHits = r.hits; stuckFor = 0;
        const target = plan[planIdx++ % plan.length];
        for (let n = 0; n < 5 && (await page.evaluate(`${S}.chase.gun.current`)) !== target; n++) if (!(await tap('.catch-weapon', 4, 50, false))) break;
        if (!seen['tool-' + target] && target !== 'tyres') { seen['tool-' + target] = true; if (target === 'net') await shot('03-tool-button-net'); }
      }
      for (const [key, name] of [['net', '03-sticky-net'], ['strips', '04-spike-strip'], ['emp', '05-pulse'], ['marked', '05-tracker-helicopter'], ['close', '02-close-time']]) if (r[key] && !seen[key]) { seen[key] = true; await shot(name); }
      if (r.fx?.orbs && !seen.orbs && r.t > 2) { seen.orbs = true; await shot('02-nitro-orbs'); }
      // the Codex props when they come up: a ramp ahead (with its warning sign), the car in the air over it, a police roadblock
      for (const [key, ok, name] of [['ramp', r.ramp, '05-ramp-ahead'], ['air', r.air > .5, '05-ramp-jump'], ['block', r.block, '05-roadblock']]) if (ok && !seen[key]) { seen[key] = true; await shot(name); }
      if (r.sounds?.siren && !log.sirenPlaying) log.sirenPlaying = {t: +r.t.toFixed(1), ...r.sounds};
      if (r.t - lastLog >= 5) { lastLog = r.t; console.log(`  t ${r.t.toFixed(1)} gap ${r.gap.toFixed(1)} tool ${r.tool} shots ${r.shots} hits ${r.hits} damage ${r.damage.toFixed(2)} nitro ${r.nitro}`, secs()); }
    } else if (r.phase === 'skid' && !seen.skid) { seen.skid = true; if (steering) { await up('steer'); steering = false; } if (boosting) { await up('boost'); boosting = false; } if (braking) { await up('brake'); braking = false; } await shot('06-car-down'); }
    await nextFrame(r.frames);
  }
  if (steering) await up('steer'); if (boosting) await up('boost'); if (braking) await up('brake');
  const chase = await page.evaluate(`(()=>{const r=${S}.chase.result();return {how:r.how,byWeapons:r.byWeapons,seconds:+r.seconds.toFixed(1),shots:r.shots,toolHits:r.toolHits,damage:r.damage,nitro:r.nitro,nearMisses:r.nearMisses,closeness:r.closeness};})()`);
  log.chase = chase; console.log('chase by touch:', JSON.stringify(chase), secs());
  log.pack.end = await page.evaluate(`({sounds:${S}.snapshot.v7.sounds})`); log.pack.siren = log.sirenPlaying || null; console.log('packs:', JSON.stringify(log.pack));
  if (process.env.CATCH_SOUND !== 'off') { assert.equal(log.pack.end.sounds?.decoded, 9, 'the nine pack sounds decoded in the real island'); assert.ok(['police-soft', 'siren-near'].includes(log.sirenPlaying?.siren), 'the pack siren played during the chase'); }
  assert.equal(chase.how, 'caught', 'the tools brought the car down'); assert.equal(chase.byWeapons, true); assert.ok(chase.toolHits >= 3, 'several tool hits');

  // ----- the catch: hold anywhere, drag the sight onto him (or onto the dashed lead ring), lift the finger -----
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.mode === 'throw');
  const readThrow = `(()=>{const s=${S},e=s.engine,v=s.debug.view(),sg=document.querySelector('.catch-bow-sight'),ld=document.querySelector('.catch-bow-lead');
    const c=e.criminalAt(e.clock),bw=v.bow,w=bw?.toWorld(c.x,c.z),p=w?v.project(w.x,1.05,w.z):null;
    const leadOn=ld&&!ld.hidden;return {phase:e.state.phase,frames:s.debug.held().frames,done:e.state.phase==='done',thrown:e.state.thrown,catches:e.state.catches,left:e.state.throwsLeft,
      sight:sg&&!sg.hidden?{x:parseFloat(sg.style.left),y:parseFloat(sg.style.top),lock:sg.dataset.lock==='true'}:null,
      target:leadOn?{x:parseFloat(ld.style.left),y:parseFloat(ld.style.top),lead:true}:p?{x:p.x,y:p.y,lead:false}:null};})()`;
  let throws = 0, tg = 0, aimShot = false;
  while (tg++ < 40) {
    await page.waitForFunction(() => { const s = window.__island.ui.activityInterface.current?.session; return !s || (['aim', 'done'].includes(s.engine?.state.phase) && s.snapshot.mode === 'throw'); }).catch(() => {});
    let r = await page.evaluate(readThrow);
    if (r.done || !(await page.evaluate(`${S}.snapshot.mode`)).includes('throw')) break;
    await page.waitForTimeout(250);
    const F = {x: 560, y: 250}; await down('aim', F.x, F.y);
    let fx = F.x, fy = F.y;
    for (let k = 0; k < 14; k++) {
      await nextFrame((await page.evaluate(readThrow)).frames);
      r = await page.evaluate(readThrow);
      if (r.phase !== 'aim' || !r.sight || !r.target) continue;
      const dx = r.target.x - r.sight.x, dy = r.target.y - r.sight.y;
      if (k >= 4 && (r.sight.lock || Math.hypot(dx, dy) < 10)) break; // held long enough to count as a draw (0.15 s)
      fx += clamp(dx * 1.1, -45, 45); fy += clamp(dy * 1.1, -45, 45); await move('aim', Math.round(fx), Math.round(fy));
    }
    if (!aimShot) { aimShot = true; await shot('07-aim-sight'); }
    await up('aim'); throws++;
    const before = r.catches;
    // follow the net to the end of the turn; a catch gets its picture
    let caughtShot = false;
    for (let k = 0; k < 400; k++) {
      const q = await page.evaluate(readThrow);
      if (!caughtShot && q.catches > before) { caughtShot = true; await shot(throws === 1 ? '08-catch' : `08-catch-${throws}`); }
      if (q.done || (q.phase === 'aim' && k > 3)) break;
      await nextFrame(q.frames);
    }
    if ((await page.evaluate(readThrow)).done) break;
  }
  await page.waitForSelector('[data-result=catchCriminal]', {timeout: 300000});
  await page.waitForTimeout(400); await shot('09-result');
  const won = await page.evaluate(() => ({stage: window.__island.engine.state.minigameProgress.catchCriminal.stage, stars: window.__island.engine.state.minigameProgress.catchCriminal.stars[0]}));
  const thr = await page.evaluate(`(()=>{const e=${S}.engine;return {thrown:e.state.thrown,catches:e.state.catches,won:e.state.won};})()`).catch(() => null);
  log.throw = {throws, ...thr}; log.result = won;
  console.log('catch by touch:', JSON.stringify(log.throw), 'result', JSON.stringify(won), secs());
  assert.equal(won.stage, STAGE + 1, 'the stage is won and the next one opens'); assert.ok(won.stars >= 1);
  assert.deepEqual(errors, [], 'no page errors'); assert.deepEqual(outside, [], 'no outside requests');
  log.seconds = (Date.now() - t0) / 1000; await writeFile(join(OUT, 'touch-run.json'), JSON.stringify(log, null, 1));
  console.log('Catch the Criminal v7 by real touch: whole chase with the tools, car down, catch, stage won');
} finally { await browser.close(); await server.close(); }
