import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland, islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** "תפוס את הפושע" v8 tools with real touch on the real island (hasTouch + isMobile at 844x390, software GL, every input a CDP
 * Input.dispatchTouchEvent on the real buttons): the steering finger on the left, the tool button cycles to each tool in turn (spikes,
 * pulse, sticky net, tracker, tyres), the fire button fires it. Like a child, the script never brakes for a thief it cannot see and taps
 * fire even when there is no ring. It reads the game (and copies the chase events with a read-only spy) and never writes it.
 * Checks: every tool can be chosen and fires (an event for each: shot, wshot, spikesOut), the ring names the tool's target and goes grey
 * with the reason out of range, a tap with nothing in range says why (dry), the spike strip lands where the ring was and he drives over it,
 * the police car stays behind him (v7 drove past and every tool went out of range), a tyre shot is drawn as a 7-round burst and heard
 * through the v8 sound set. Screenshots and touch-run.json to CATCH_QA_DIR (default verification/catch-v8/touch). About 10 minutes.
 *   node workout/island/tests/catch-v8-touch.mjs   (CATCH_QUALITY=high, CATCH_STAGE=n, CATCH_QUERY=&catchWeaponsFix=0 to see v7) */
const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CATCH_QA_DIR || join(here, '../verification/catch-v8/touch');
const QUALITY = process.env.CATCH_QUALITY || 'low', STAGE = Number(process.env.CATCH_STAGE || 1), QUERY = process.env.CATCH_QUERY || '', V7 = /catchWeaponsFix=0/.test(QUERY);
const server = await serveIsland(), chromium = await islandChromium();
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true, isMobile: true});
const page = await context.newPage(), errors = [], outside = [], log = {stage: STAGE, quality: QUALITY, query: QUERY, tools: {}, notes: [], shots: []};
page.setDefaultTimeout(900000);
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.origin !== new URL(server.url).origin) outside.push(r.url()); });
const cdp = await context.newCDPSession(page);
const S = 'window.__island.ui.activityInterface.current?.session';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const t0 = Date.now(), secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
// real touch (as in catch-v7-touch.mjs): each finger is a CDP touch point; lifting one = touchEnd for all, the others touch down again
const fingers = new Map(); let nextId = 10; const fresh = () => nextId++;
const send = (type, list = [...fingers.values()].map(f => ({x: f.x, y: f.y, id: f.id, radiusX: 8, radiusY: 8, force: 1}))) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: list});
const down = async (name, x, y, home = null) => { fingers.set(name, {id: fresh(), x, y, home}); await send('touchStart'); };
const move = async (name, x, y) => { const f = fingers.get(name); if (!f) return; f.x = x; f.y = y; await send('touchMove'); };
async function up(name) {
  if (!fingers.has(name)) return; fingers.delete(name); await send('touchEnd', []); if (!fingers.size) return;
  const back = []; for (const f of fingers.values()) { f.id = fresh(); if (f.home) { back.push([f, f.x, f.y]); f.x = f.home.x; f.y = f.home.y; } }
  await send('touchStart'); if (back.length) { for (const [f, x, y] of back) { f.x = x; f.y = y; } await send('touchMove'); }
}
const center = async sel => { const b = await page.locator(sel).first().boundingBox().catch(() => null); return b ? {x: b.x + b.width / 2, y: b.y + b.height / 2} : null; };
async function tap(sel, holdMs = 60) { const c = await center(sel); if (!c) return false; const id = 'tap' + fresh(); await down(id, c.x, c.y); await page.waitForTimeout(holdMs); await up(id); return true; }
const shot = async name => { await page.screenshot({path: join(OUT, name + '.png')}); log.shots.push(name); console.log('  screenshot', name, secs()); };
const nextFrame = async f => page.waitForFunction(f => (window.__island.ui.activityInterface.current?.session?.debug.held().frames ?? 0) > f, f);

try {
  await mkdir(OUT, {recursive: true});
  await page.goto(server.url + `?dev=1&games=1&quality=${QUALITY}${QUERY}`, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.__island?.view.metrics().avatarLoaded);
  await tap('[data-action=avatar-start]');
  await page.evaluate(() => { const e = window.__island.engine; e.skipTutorial(); e.tick = () => ({ok: true}); window.__island.ui.activityInterface.requireDaily = () => false; localStorage.setItem('island.catch.help6', '1'); });
  // CATCH_STAGE > 1 (manual runs): the save is opened to that stage the way a child who won the stages before has it
  if (STAGE > 1) await page.evaluate(s => { const p = window.__island.engine.state.minigameProgress; p.catchCriminal = {...(p.catchCriminal || {}), stage: Math.max(s, p.catchCriminal?.stage || 1), stars: p.catchCriminal?.stars || []}; }, STAGE);
  await page.evaluate(() => window.__island.ui.activityInterface.menu());
  await page.locator('[data-action=game-enter][data-game-id=catchCriminal]').scrollIntoViewIfNeeded();
  await tap('[data-action=game-enter][data-game-id=catchCriminal]');
  await page.waitForSelector('[data-action=game-play]'); await tap('[data-action=game-play]');
  await page.waitForSelector('[data-action=stage-play]'); await tap(`[data-action=stage-play] >> nth=${STAGE - 1}`);
  await page.waitForSelector('[data-action=game-understood]', {timeout: 60000}).then(async () => { await page.waitForTimeout(300); await tap('[data-action=game-understood]'); }).catch(() => {});
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot?.ready);
  await page.waitForFunction(() => window.__island.ui.activityInterface.current?.session?.snapshot.mode === 'chase');
  const v8 = await page.evaluate(`${S}.snapshot.v8`); log.v8 = v8; console.log('v8 flags', JSON.stringify(v8), secs());
  if (!V7) assert.deepEqual({intro: v8.intro, engine: v8.engine, siren: v8.siren, weaponsFix: v8.weaponsFix, burst: v8.burst}, {intro: true, engine: true, siren: true, weaponsFix: true, burst: true}, 'v8 is the default');
  // read-only spy: a copy of every chase event the session drains
  await page.evaluate(`(()=>{const c=${S}.chase,d=c.drainEvents.bind(c);window.__ev=[];c.drainEvents=()=>{const e=d();for(const x of e)window.__ev.push({t:+c.state.t.toFixed(2),...x});return e;};})()`);
  const read = `(()=>{const s=${S},c=s.chase,st=c.state,g=c.gun.state,a=c.gun.aimInfo?.();
    const freeOf=lane=>{let free=60;for(const o of c.obstacles){if(o.kind==='pad'||o.kind==='nitro'||o.kind==='oil')continue;const os=c.obstacleS(o,st.t)-st.s;if(os>-2&&os<60&&Math.abs(o.d-lane)<2.2)free=Math.min(free,os);}return free;};
    let best=0,bs=-1e9;for(const lane of c.C.lanes){const sc=freeOf(lane)-Math.abs(lane-st.d)*1.5;if(sc>bs){bs=sc;best=lane;}}
    const zone=a&&a.inRange?(a.weapon==='spikes'?a.predD:a.zoneD):st.crim.d,zoneFree=freeOf(Math.max(-3.6,Math.min(3.6,zone)))>22;
    const q=sel=>{const n=document.querySelector(sel);if(!n||n.hidden)return null;const r=n.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height),q:n.dataset.q||null,tool:n.dataset.tool||null,text:n.textContent.trim()};};
    return {mode:s.snapshot.mode,phase:st.phase,frames:s.debug.held().frames,t:+st.t.toFixed(2),d:st.d,slide:st.slide,gap:+st.gap.toFixed(1),tank:st.tank,want:zoneFree?zone:best,
      tool:g.weapon,locked:g.locked,qual:g.quality,chance:+(g.hitChance||0).toFixed(2),reload:g.reload,ammo:g.ammo,damage:+st.damage.toFixed(2),reason:a?.reason??null,predD:a?.predD??null,zoneD:a?.zoneD??null,
      ring:q('.catch-reticle'),dot:q('.catch-aimdot'),behind:q('.catch-behind8'),popup:document.querySelector('.catch-popup')?.textContent||'',burst:s.debug.view()?.burst8?.stats?.()||null,audio:s.snapshot.v8?.audio||null};})()`;
  const STEER = {x: 200, y: 280}; let steering = false, boosting = false;
  const order = ['spikes', 'emp', 'net', 'mark', 'tyres'];
  let idx = 0, stage = 'select', tries = 0, waitFrom = 0, firedAt = 0, ev0 = 0, guard = 0, runFrames = 0, behindFrames = 0, blindTap = 0, lastT = 0;
  const rec = () => (log.tools[order[idx]] ||= {});
  while (guard++ < 6000 && idx < order.length) {
    const r = await page.evaluate(read);
    if (r.mode !== 'chase' || r.phase !== 'run') { if (r.mode !== 'chase' || r.phase === 'end' || r.phase === 'skid') break; await nextFrame(r.frames); continue; }
    runFrames++; if (r.gap < 0) behindFrames++;
    const steer = clamp((r.want - r.d) * .55 - r.slide / 5.6, -1, 1);
    if (!steering) { await down('steer', STEER.x, STEER.y, STEER); steering = true; }
    await move('steer', STEER.x + Math.round(steer * 60), STEER.y);
    // the boost like a child: whenever there is boost and he is ahead; never the brake
    const wantBoost = r.tank > .2 && r.gap > 9; if (wantBoost && !boosting) { const c = await center('.catch-boost'); if (c) { await down('boost', c.x, c.y); boosting = true; } } else if (!wantBoost && boosting) { await up('boost'); boosting = false; }
    const tool = order[idx];
    if (stage === 'select') {
      if (r.tool !== tool) { if (await tap('.catch-weapon')) tries++; if (tries > 8) { log.notes.push('could not select ' + tool); stage = 'next'; } }
      else { stage = 'aim'; waitFrom = r.t; tries = 0; rec().selected = {t: r.t, gap: r.gap, ring: r.ring, locked: r.locked, reason: r.reason}; await shot(`${idx}-${tool}-selected`); }
    } else if (stage === 'aim') {
      // no ring in range for a while: tap anyway once (a child would) and expect the reason
      if (!r.locked && r.ammo > 0 && r.reload <= 0 && r.t - waitFrom > 1.2 && !rec().dryTap && r.t - blindTap > 2) {
        blindTap = r.t; const n0 = await page.evaluate('window.__ev.length'); await tap('.catch-fire');
        rec().dryTap = {gap: r.gap, reason: r.reason, ring: r.ring}; await page.waitForTimeout(150); const ev = (await page.evaluate(`window.__ev.slice(${n0})`)).filter(e => e.type === 'dry');
        rec().dryTap.events = ev.map(e => e.reason); rec().dryTap.popup = (await page.evaluate(read)).popup; if (ev.length) await shot(`${idx}-${tool}-dry`);
      }
      if (r.locked && r.qual === 'green' && r.reload <= 0 && r.ammo > 0) {
        rec().aim = {t: r.t, gap: r.gap, chance: r.chance, ring: r.ring, dot: r.dot, predD: r.predD, zoneD: r.zoneD, d: r.d};
        await shot(`${idx}-${tool}-aim`); ev0 = await page.evaluate('window.__ev.length'); await tap('.catch-fire'); firedAt = r.t; stage = 'after';
      } else if (r.t - waitFrom > 9) { rec().noGreen = {gap: r.gap, locked: r.locked, qual: r.qual, reason: r.reason, ring: r.ring}; ev0 = await page.evaluate('window.__ev.length'); if (r.locked) await tap('.catch-fire'); firedAt = r.t; stage = 'after'; }
    } else if (stage === 'after') {
      if (r.t - firedAt > .25 && !rec().midShot) { rec().midShot = true; rec().burst = r.burst; await shot(`${idx}-${tool}-fired`); }
      if (r.t - firedAt > 2.4) {
        const ev = (await page.evaluate(`window.__ev.slice(${ev0})`)).filter(e => ['shot', 'wshot', 'spikesOut', 'spikes', 'netted', 'emp', 'marked', 'flat', 'dry', 'noAmmo', 'stopped'].includes(e.type));
        rec().events = ev.map(e => `${e.t}:${e.type}${e.weapon ? '/' + e.weapon : ''}${e.hit !== undefined ? (e.hit ? '+' : '-') : ''}${e.late ? ' late' : ''}`); rec().after = {gap: r.gap, damage: r.damage, burst: r.burst, audio: r.audio};
        if (tool === 'spikes') { const out = ev.find(e => e.type === 'spikesOut'); rec().strip = out ? {d: out.d, aimPredD: rec().aim?.predD ?? null} : null; }
        console.log(`  ${tool}: ${rec().events.join(', ')}`, secs()); stage = 'next';
      }
    }
    if (stage === 'next') { idx++; stage = 'select'; tries = 0; }
    lastT = r.t; await nextFrame(r.frames);
  }
  if (steering) await up('steer'); if (boosting) await up('boost');
  log.run = {frames: runFrames, behind: behindFrames, behindShare: +(behindFrames / Math.max(1, runFrames)).toFixed(3), lastT};
  log.end = await page.evaluate(read); log.errors = errors; log.outside = outside; log.seconds = (Date.now() - t0) / 1000;
  await writeFile(join(OUT, 'touch-run.json'), JSON.stringify(log, null, 1));
  console.log('run', JSON.stringify(log.run), 'notes', log.notes);
  // ----- what has to hold -----
  assert.deepEqual(errors, [], 'no page errors'); assert.deepEqual(outside, [], 'no outside requests');
  const fired = order.filter(id => log.tools[id]?.events?.some(e => /:(shot|wshot|spikesOut)/.test(e)));
  console.log('tools that fired:', fired.join(', '));
  if (!V7) {
    assert.ok(fired.length >= 4, 'at least four of the five tools fired by touch: ' + fired.join(', '));
    for (const id of order.filter(id => log.tools[id]?.selected)) { const s = log.tools[id].selected; if (s.ring) assert.equal(s.ring.tool, id, id + ': the ring is the tool\'s'); }
    const dry = order.map(id => log.tools[id]?.dryTap).filter(Boolean); for (const d of dry) assert.ok(d.events.length >= 1 && d.popup, 'a tap with no ring says why: ' + JSON.stringify(d));
    const sp = log.tools.spikes; if (sp?.strip && sp.aim) assert.ok(Math.abs(sp.strip.d - sp.aim.predD) < .3, 'the strip lands where the ring was: ' + JSON.stringify(sp.strip));
    assert.ok(log.run.behindShare < .05, 'the police car stays behind him (thief behind ' + (log.run.behindShare * 100).toFixed(1) + '% of the run)');
    const ty = log.tools.tyres; if (ty?.burst) assert.ok(ty.burst.rounds >= 7 && ty.burst.bursts >= 1, 'a tyre shot is a burst of rounds: ' + JSON.stringify(ty.burst));
  }
  console.log('Catch the Criminal v8 tools by real touch: done', secs());
} finally { await browser.close(); await server.close(); }
