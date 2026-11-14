/** v7 "תפוס את הפושע": the chase arsenal. Pure rules, no DOM, no Three.js.
 * Roy (13/11, after v22): more ways to fire, from the very start of the chase, and the goal is to bring the getaway car down.
 * Five tools, one chosen at a time with a single cycle button (like the weapon button of the boar game); each one has its
 * own target ZONE on the getaway car (or on the road in front of it):
 *   tyres  (פנצ׳ר)       the rear wheel on the officer's side: a flat, the car slows and wobbles
 *   net    (רשת דבק)     the roof: a sticky net clogs the engine for a few seconds
 *   spikes (קוצים)       a spike strip lands on the road ahead of him, in the officer's lane: he has to drive over it
 *   emp    (פולס חשמלי)  a short-range pulse on the whole car: the electronics stall for a moment
 *   mark   (סימון)       a tracker on the trunk: the police helicopter follows him, he is a little slower and easier to hit
 * Every hit fills one damage meter ("נזק לרכב"); a full meter = the car is down, it skids to a stop and the throw starts there.
 * Cartoon only: every target is a part of the car or the road, never a person.
 *
 * Aiming is driving: the shot leaves along the police car's line (its lateral position d), and the error is the angle
 * between that line and the zone, seen from the officer. With the aim assist (v7 default, `?catchAssist=0` = the v6 roll)
 * a cone around the zone counts as on target: wider early, narrower later, never smaller than a few metres when close;
 * the first green lock opens a short "close time" in which the thief stops weaving and slows down. Without the assist
 * every tool rolls the v6 tyre-gun chance (distance, lateral offset, steadiness, bends, swerve).
 * The interface mirrors catch-tyres.mjs (state, balance, step, fire, drainEvents, thiefSpeedScale, thiefWobble), so the
 * chase engine and the v6 fire HUD helpers keep working; `state` is the view of the tool in hand. Deterministic with rnd. */
import {TYRES} from './catch-tyres.mjs?v=island-v2-20261107-12';

export const ARSENAL = Object.freeze({
  order: ['tyres', 'net', 'spikes', 'emp', 'mark'],
  tools: Object.freeze({
    // zone: s along the getaway car from its centre (+ ahead), d across (side: toward the officer's side), y height, w half-width (m) the assist keeps on target near
    tyres: {zone: {s: -1.35, d: .85, side: true, y: .35, w: 1.35}, range: [2, 28, 18], reload: 1.2, ammo: 5, trickle: 5, weight: 1}, // the v6 tyre-gun range
    net: {zone: {s: .1, d: 0, y: 1.35, w: 1.55}, range: [4, 22, 16], reload: 2.2, ammo: 3, trickle: 7, weight: .9, slow: .72, slowSeconds: 3},
    spikes: {zone: {s: 15, d: 0, lane: true, y: .05, w: 1.7}, range: [6, 26, 20], reload: 2.5, ammo: 2, trickle: 8, weight: 1.5, slow: .65, slowSeconds: 2.2},
    emp: {zone: {s: 0, d: 0, y: .7, w: 2.3, ring: true}, range: [2, 13, 10], reload: 1, ammo: 1, trickle: 9, weight: .8, slow: .55, slowSeconds: 1.6},
    mark: {zone: {s: -2.05, d: 0, y: .85, w: 1.25}, range: [4, 30, 22], reload: 1.5, ammo: 2, trickle: 10, weight: .45, markSeconds: 12, markSlow: .94, markCone: 1.25},
  }),
  // per stage 1..10: equivalent hits to fill the meter, the assist cone (degrees), the near half-width scale, the base chance
  hitsToStop: [5.5, 6, 6.5, 6.5, 6.5, 7, 7, 7.5, 8, 8.5],
  cone: [13.5, 13, 12.5, 10.5, 10, 9.5, 9, 7, 7, 6.5],
  widen: [1, .97, .94, .86, .82, .79, .76, .64, .64, .62],
  core: [.96, .95, .94, .9, .89, .88, .86, .8, .8, .78],
  nearGap: 10, farF: .66,                     // the chance at the far edge of the range (x core)
  falloff: 1.8,                                // from the cone edge to falloff x cone the chance fades to fadeTo
  fadeTo: .12, outside: .05,
  lateralMax: 4.6,                             // metres of sideways offset that still show the reticle
  closeSeconds: [1.5, 1.45, 1.4, 1.3, 1.3, 1.25, 1.2, 1.1, 1.05, 1], closeCool: 3.2, closeSlow: .86, // close time after the first green lock
  panic: 1.1,                                  // seconds of the thief's burst away after a hit (the chase gives him crimBoostSpeed)
  stripHit: 2.1, stripAhead: 15, stripLife: 4, // a spike strip catches him if his centre passes within stripHit metres of it
  dodge: [.08, .1, .14, .18, .22, .26, .3, .34, .38, .42], // chance that he spots a strip and changes lane (not in close time)
  speedScale: [1, .9, .8, .72, .66],          // by number of flat tyres
  rampFrom: .6, rampSeconds: [14, 14, 15, 15, 16, 16, 17, 17, 18, 18], // early hits count less: firing starts at once, yet a sharp player still drives the bends (QA 11/11: a car stopped in 10 s made the track feel straight)
  wobbleAmp: .3,
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = 180 / Math.PI;

export const STRINGS = Object.freeze({
  'catch.weapon': 'כלי', 'catch.weapon.next': 'החלפת כלי, עכשיו {name}',
  'catch.weapon.tyres': 'פנצ׳ר', 'catch.weapon.net': 'רשת דבק', 'catch.weapon.spikes': 'קוצים', 'catch.weapon.emp': 'פולס', 'catch.weapon.mark': 'סימון',
  'catch.weapon.tyres.hint': 'מכוונים לגלגל האחורי', 'catch.weapon.net.hint': 'מכוונים לגג, הרשת תוקעת את המנוע', 'catch.weapon.spikes.hint': 'נוסעים בנתיב שלו, הקוצים נוחתים לפניו',
  'catch.weapon.emp.hint': 'מתקרבים ממש, הפולס עוצר את הרכב לרגע', 'catch.weapon.mark.hint': 'מסמנים את תא המטען, המסוק עוקב אחריו',
  'catch.damage7': 'נזק לרכב', 'catch.pop.down': 'הרכב נפל, הפושע בורח ברגל',
  'catch.pop.net': 'רשת דבק על הגג, המנוע נתקע', 'catch.pop.spikesOut': 'קוצים על הכביש', 'catch.pop.spikes': 'עלה על הקוצים',
  'catch.pop.spikesMiss': 'הוא עקף את הקוצים', 'catch.pop.emp': 'פולס, הרכב נעצר לרגע', 'catch.pop.mark': 'מסומן, המסוק עוקב',
  'catch.pop.close': 'זמן קרוב, הוא מאט', 'catch.pop.toolMiss': 'החטאה, מתקרבים ומנסים שוב', 'catch.pop.toolEmpty': 'אין עוד, מחליפים כלי',
  'catch.chase.down': 'הרכב נפל, הפושע בורח ברגל. זריקות: {throws}',
});

/** The chance of a shot with the aim assist: error `e` (degrees) inside `allowed` = on target; it fades out beyond it. */
export function assistChance(e, allowed, core, {falloff = ARSENAL.falloff, fadeTo = ARSENAL.fadeTo, outside = ARSENAL.outside} = {}) {
  if (e <= allowed) return core;
  if (e <= allowed * falloff) return core * .8 + (fadeTo - core * .8) * (e - allowed) / Math.max(1e-6, allowed * (falloff - 1));
  return outside;
}
/** The reticle colour for a chance, the same thresholds as v6 (catch-fire-hud.mjs reticleQuality). */
export const quality7 = c => c > .6 ? 'green' : c > .3 ? 'yellow' : 'grey';

export function createArsenal({balance = {}, stage = 1, rnd = Math.random, level = {}, assist = true, addDamage = () => {}} = {}) {
  const A = {...ARSENAL, ...(balance.arsenal || {})}, T6 = {...TYRES, ...(balance.tyres || {})}, i = clamp(stage, 1, 10) - 1;
  const pick = arr => Array.isArray(arr) ? arr[Math.min(arr.length - 1, i)] : arr;
  const ids = (level.weapons || A.order).filter(id => A.tools[id]);
  const per = Object.fromEntries(ids.map(id => { const d = A.tools[id]; return [id, {id, ammo: d.ammo, ammoMax: d.ammo, reload: 0, trickle: d.trickle, shots: 0, hits: 0}]; }));
  const hitsToStop = pick(A.hitsToStop);
  const g = {current: ids[0], locked: false, hitChance: 0, quality: 'grey', inRange: false, e: 99, allowed: 0, flats: {FL: false, FR: false, RL: false, RR: false}, flatCount: 0, lockWheel: null,
    shots: 0, hits: 0, damage: 0, stopped: false, t: 0, closeT: 0, closeCool: 0, closes: 0, marked: 0, slows: {net: 0, spikes: 0, emp: 0}, panic: 0, strips: [], stripId: 0, aim: null};
  const events = [];
  let last = {};
  const rangeOf = d => d.range[0] === undefined ? [2, 20] : [d.range[0], d.range[1] + (d.range[2] - d.range[1]) * i / 9];
  /** Where the zone of tool `id` is and how far the police car's line is from it, for the current frame. */
  function geometry(id, ctx) {
    const d = A.tools[id], z = d.zone, gap = ctx.gap ?? 99, lat = ctx.lateral ?? 0, dO = ctx.dOfficer ?? 0, dT = (ctx.dThief ?? dO + lat);
    let zoneD = dT + (z.side ? (lat > 0 ? -z.d : z.d) : z.d), predD = null;
    if (z.lane) { // spikes: the strip lands in the officer's lane; the thief will be where he is heading
      const tArrive = Math.max(.2, (z.s + 2) / Math.max(6, ctx.vThief ?? 20));
      predD = dT + clamp((ctx.thiefTargetD ?? dT) - dT, -(ctx.crimSteer ?? 2.6) * tArrive, (ctx.crimSteer ?? 2.6) * tArrive);
      zoneD = dO;
    }
    const dist = Math.max(3, gap + z.s), off = z.lane ? Math.abs(predD - dO) : Math.abs(zoneD - dO);
    return {gap, lat, dist, zoneS: z.s, zoneD, zoneY: z.y, predD, e: Math.atan2(off, dist) * DEG, off};
  }
  function chanceFor(id, geo, ctx) {
    const d = A.tools[id], [rmin, rmax] = rangeOf(d), gap = geo.gap;
    const inRange = !g.stopped && gap > rmin && gap < rmax && Math.abs(geo.lat) < (assist ? A.lateralMax : T6.lateralMax);
    if (!inRange) return {inRange, chance: 0, allowed: 0};
    if (!assist) { // v6: the tyre-gun roll for every tool
      const gapF = gap <= T6.nearGap ? 1 : 1 - (1 - T6.farChance) * (gap - T6.nearGap) / Math.max(1, rmax - T6.nearGap);
      const latF = 1 - .5 * Math.abs(geo.lat) / T6.lateralMax, steadyF = (ctx.stun || 0) > 0 ? .3 : ctx.scraping ? .5 : 1;
      const curveF = 1 - Math.min(.5, Math.abs(ctx.curvature || 0) * 25), swerveF = 1 - .3 * Math.abs(ctx.thiefSwerve || 0);
      return {inRange, chance: clamp(pick(T6.baseChance) * gapF * latF * steadyF * curveF * swerveF, .05, .98), allowed: 0};
    }
    const allowed = Math.max(pick(A.cone) * (g.marked > 0 && id !== 'mark' ? A.tools.mark.markCone : 1), Math.atan2(d.zone.w * pick(A.widen), geo.dist) * DEG);
    const distF = gap <= A.nearGap ? 1 : 1 - (1 - A.farF) * (gap - A.nearGap) / Math.max(1, rmax - A.nearGap);
    const condF = ((ctx.stun || 0) > 0 ? .55 : ctx.scraping ? .78 : 1) * (1 - Math.min(.22, Math.abs(ctx.curvature || 0) * 11)) * (g.closeT > 0 ? 1 : 1 - .12 * Math.abs(ctx.thiefSwerve || 0));
    return {inRange, chance: clamp(assistChance(geo.e, allowed, pick(A.core)) * distF * condF, .03, .99), allowed};
  }
  /** Lock, chance and reticle of the tool in hand for this frame (also right after a switch, so a tap at once fires the new tool). */
  function evaluate(ctx) {
    const geo = geometry(g.current, ctx), c = chanceFor(g.current, geo, ctx);
    const locked = c.inRange && !g.stopped;
    g.hitChance = locked ? c.chance : 0; g.quality = quality7(g.hitChance); g.inRange = c.inRange; g.e = geo.e; g.allowed = c.allowed;
    g.lockWheel = g.current === 'tyres' && locked ? (geo.lat > 0 ? 'RL' : 'RR') : null;
    g.aim = {...geo, weapon: g.current, chance: g.hitChance, quality: g.quality, inRange: c.inRange, allowed: c.allowed, assist};
    if (locked !== g.locked) { g.locked = locked; events.push({type: 'lock', on: locked}); }
    return locked;
  }
  const damageOf = id => A.tools[id].weight / hitsToStop * Math.min(1, A.rampFrom + (1 - A.rampFrom) * g.t / pick(A.rampSeconds));
  function hurt(id, extra = {}) {
    if (g.stopped) return;
    const amount = damageOf(id), total = addDamage(amount); g.damage = Number.isFinite(total) ? total : Math.min(1, g.damage + amount);
    if (g.damage >= 1 - 1e-9 && !g.stopped) api.down(id, extra);
  }
  function flat(wheel) {
    if (g.flats[wheel]) { const order = wheel[1] === 'L' ? ['RL', 'RR', 'FL', 'FR'] : ['RR', 'RL', 'FR', 'FL']; wheel = order.find(w => !g.flats[w]) || null; }
    if (!wheel) return null;
    g.flats[wheel] = true; g.flatCount++; events.push({type: 'flat', wheel, flatCount: g.flatCount}); return wheel;
  }
  const api = {
    ids, tools: A.tools, A, hitsToStop,
    /** The tool in hand merged with the shared numbers: what catch-tyres.mjs exposed, so the v6 HUD helpers read it. */
    get state() { const w = per[g.current]; return {...w, weapon: g.current, locked: g.locked, hitChance: g.hitChance, quality: g.quality, flats: g.flats, flatCount: g.flatCount, lockWheel: g.lockWheel, damage: g.damage, stopped: g.stopped, armed: true, armIn: 0, shots: g.shots, hits: g.hits, closeT: g.closeT, marked: g.marked, flatsToStop: 99, t: g.t, perTool: per}; },
    get balance() { const d = A.tools[g.current]; return {reloadSeconds: d.reload, trickleSeconds: d.trickle}; },
    get current() { return g.current; }, get strips() { return g.strips; }, get raw() { return g; },
    /** The aim of the tool in hand this frame (for the HUD): zone, the line of the police car, the error and the cone. */
    aimInfo() { return g.aim; },
    calm() { return g.closeT > 0; },
    next() { const k = ids.indexOf(g.current); for (let n = 1; n <= ids.length; n++) { const id = ids[(k + n) % ids.length]; if (per[id].ammo > 0 || n === ids.length) { g.current = id; break; } } events.push({type: 'weapon', id: g.current}); if (last.gap !== undefined) evaluate(last); return g.current; },
    select(id) { if (!per[id]) return false; g.current = id; events.push({type: 'weapon', id}); if (last.gap !== undefined) evaluate(last); return true; },
    step(dt, ctx = {}) {
      g.t += dt; last = ctx;
      for (const id of ids) { const w = per[id], d = A.tools[id]; if (w.reload > 0) { w.reload = Math.max(0, w.reload - dt); if (!w.reload && id === g.current) events.push({type: 'reload'}); } if (w.ammo < w.ammoMax) { w.trickle -= dt; if (w.trickle <= 0) { w.trickle = d.trickle; w.ammo++; } } else w.trickle = d.trickle; }
      for (const k of Object.keys(g.slows)) g.slows[k] = Math.max(0, g.slows[k] - dt);
      g.marked = Math.max(0, g.marked - dt); g.panic = Math.max(0, g.panic - dt);
      const wasClose = g.closeT > 0; g.closeT = Math.max(0, g.closeT - dt); if (wasClose && g.closeT === 0) g.closeCool = A.closeCool; else g.closeCool = Math.max(0, g.closeCool - dt);
      // spike strips on the road: resolved when the getaway car's front reaches them
      for (const st of g.strips) {
        if (st.state !== 'live') { st.age += dt; continue; }
        st.age += dt;
        if ((ctx.sThief ?? 0) + 2.1 >= st.s) {
          const hit = Math.abs((ctx.dThief ?? 0) - st.d) < A.stripHit && !g.stopped;
          st.state = hit ? 'hit' : 'missed'; st.age = 0;
          events.push({type: 'wshot', weapon: 'spikes', hit, strip: st.id, late: true});
          if (hit) { per.spikes.hits++; g.hits++; g.slows.spikes = A.tools.spikes.slowSeconds; for (const w of ['FL', 'FR']) flat(w); g.panic = 0; events.push({type: 'spikes', strip: st.id}); hurt('spikes'); }
        } else if (st.age > A.stripLife) { st.state = 'missed'; st.age = 0; events.push({type: 'wshot', weapon: 'spikes', hit: false, strip: st.id, late: true}); }
      }
      g.strips = g.strips.filter(st => st.state === 'live' || st.age < 1.5);
      // the tool in hand: geometry, chance, reticle colour, and the close time on the first green lock
      const locked = evaluate(ctx);
      if (assist && locked && g.quality === 'green' && g.closeT <= 0 && g.closeCool <= 0) { g.closeT = pick(A.closeSeconds); g.closes++; events.push({type: 'closeTime', seconds: g.closeT}); }
    },
    fire() {
      const w = per[g.current], d = A.tools[g.current];
      if (g.stopped || w.reload > 0 || !g.locked) return false;
      if (w.ammo <= 0) { events.push({type: 'noAmmo', weapon: g.current}); return false; }
      w.ammo--; w.reload = d.reload; w.shots++; g.shots++;
      const id = g.current, geo = g.aim || geometry(id, last);
      if (id === 'spikes') { // the strip flies over the car and lands ahead in the officer's lane: decided when he gets there
        const st = {id: ++g.stripId, s: (last.sThief ?? 0) + A.stripAhead, d: geo.zoneD, state: 'live', age: 0, dodge: rnd() < pick(A.dodge)};
        g.strips.push(st); events.push({type: 'spikesOut', strip: st.id, s: st.s, d: st.d}); return true;
      }
      const hit = rnd() < g.hitChance;
      if (id === 'tyres') { // the v6 event shapes, so catch-tyre-fx.mjs draws the hit and the flat wheel
        let wheel = g.lockWheel || 'RL'; const side = (last.lateral ?? 0) > 0 ? -1 : 1;
        if (hit && g.flats[wheel]) wheel = wheel === 'RL' ? 'RR' : 'RL';
        if (hit && g.flats[wheel]) wheel = wheel === 'RL' ? 'FL' : 'FR';
        events.push({type: 'shot', hit, weapon: id, wheel: hit ? wheel : null, x: hit ? (wheel[0] === 'R' ? -1.4 : 1.4) : -2.2 - rnd() * 1.5, y: hit ? .35 : .05, z: hit ? side * .9 : side * (1.2 + rnd() * 1.6)});
        if (hit) { w.hits++; g.hits++; flat(wheel); g.panic = A.panic; hurt(id); }
        return true;
      }
      events.push({type: 'wshot', weapon: id, hit});
      if (!hit) return true;
      w.hits++; g.hits++;
      if (id === 'net') { g.slows.net = d.slowSeconds; g.panic = 0; events.push({type: 'netted'}); }
      else if (id === 'emp') { g.slows.emp = d.slowSeconds; g.panic = 0; events.push({type: 'emp'}); }
      else if (id === 'mark') { g.marked = d.markSeconds; g.panic = A.panic; events.push({type: 'marked', seconds: d.markSeconds}); }
      hurt(id);
      return true;
    },
    drainEvents() { return events.splice(0); },
    /** The meter is full (a hit, or ramming filled the rest): the car is down, nothing more to fire. */
    down(by = 'ram', extra = {}) { if (g.stopped) return; g.stopped = true; g.locked = false; g.hitChance = 0; g.damage = 1; events.push({type: 'stopped', by, ...extra}); },
    /** Everything that slows the getaway car, multiplied: flats, the sticky net, the strip, the pulse, the tracker, the close time. */
    thiefSpeedScale() {
      let k = A.speedScale[Math.min(A.speedScale.length - 1, g.flatCount)];
      if (g.slows.net > 0) k *= A.tools.net.slow; if (g.slows.spikes > 0) k *= A.tools.spikes.slow; if (g.slows.emp > 0) k *= A.tools.emp.slow;
      if (g.marked > 0) k *= A.tools.mark.markSlow; if (g.closeT > 0) k *= A.closeSlow;
      return Math.max(.5, k); // stacked tools never stop him dead: the police car would shoot past him
    },
    /** True for a moment after a hit: the chase gives him a short burst away from the police car. */
    panicking() { return g.panic > 0 && g.slows.emp <= 0 && g.slows.spikes <= 0; },
    thiefWobble(t) { const a = A.wobbleAmp * g.flatCount + (g.slows.emp > 0 ? .12 : 0); return a ? Math.sin(t * 7) * a + Math.sin(t * 11.3) * a * .4 : 0; },
    /** Dodging a strip ahead: the lanes he would rather leave (the chase's thief brain reads this). */
    stripsAhead(sThief, span = 32) { return g.strips.filter(st => st.state === 'live' && st.s > sThief && st.s - sThief < span); },
  };
  return api;
}
