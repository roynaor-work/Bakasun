/** v6 "תפוס את הפושע": shooting the getaway car's tyres during the chase. Pure rules, no DOM.
 * Cartoon only: the target is always a wheel, never a person. A lock appears when the thief's car is close,
 * in front and roughly in line; a shot rolls against hitChance (near, aligned, steady, straight road = high).
 * A hit flattens a rear tyre: the car slows and wobbles; `flatsToStop` flats and it skids to a halt.
 * Ammo is limited with a slow trickle so a child is never stuck without a shot. Deterministic with the rnd given. */

export const TYRES = Object.freeze({
  rangeStage1: 30, rangeStage10: 20,     // lock range in metres, shrinking with the stage
  lateralMax: 3.6,                        // metres of sideways offset that still lock
  reloadSeconds: .8, trickleSeconds: 6,   // between shots, and one bullet back every trickleSeconds
  ammoMax: [6, 6, 6, 7, 7, 7, 8, 8, 8, 8],
  flatsToStop: [2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  baseChance: [.86, .84, .82, .8, .77, .74, .71, .68, .65, .62],
  speedScale: [1, .82, .62, .45, .3],     // thief speed by number of flats
  wobbleAmp: .32,                          // metres sideways per flat
  nearGap: 8,                              // closer than this the gap no longer helps
  farChance: .42,                          // chance factor at the edge of the range
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const STRINGS = Object.freeze({
  'catch.fire': 'ירי', 'catch.fireHint': 'ירי לגלגל של הרכב הנמלט', 'catch.ammo': 'כדורים: {count}',
  'catch.pop.shotHit': 'פגיעה בגלגל', 'catch.pop.shotMiss': 'החטאה, עוד פעם', 'catch.pop.flat': 'פנצ׳ר, הוא מאט',
  'catch.pop.stopped': 'הרכב נעצר', 'catch.pop.noAmmo': 'אין כדורים, מחכים לטעינה', 'catch.lockHint': 'כשהכוונת ירוקה לוחצים ירי',
});

export function createTyreGun({balance = {}, stage = 1, rnd = Math.random, level = {}} = {}) {
  const B = {...TYRES, ...(balance.tyres || {})}, i = clamp(stage, 1, 10) - 1;
  const pick = arr => arr[Math.min(arr.length - 1, i)];
  const range = B.rangeStage1 + (B.rangeStage10 - B.rangeStage1) * i / 9;
  const s = {ammo: pick(B.ammoMax), ammoMax: pick(B.ammoMax), reload: 0, trickle: B.trickleSeconds, locked: false, lockWheel: null, flats: {FL: false, FR: false, RL: false, RR: false}, flatCount: 0, flatsToStop: level.flatsToStop || pick(B.flatsToStop), hitChance: 0, range, shots: 0, hits: 0, stopped: false, t: 0};
  const events = [];
  let last = null;
  const api = {
    get state() { return s; }, balance: B,
    step(dt, ctx = {}) {
      s.t += dt; last = ctx;
      if (s.reload > 0) { s.reload = Math.max(0, s.reload - dt); if (s.reload === 0) events.push({type: 'reload'}); }
      if (s.ammo < s.ammoMax) { s.trickle -= dt; if (s.trickle <= 0) { s.trickle = B.trickleSeconds; s.ammo++; } } else s.trickle = B.trickleSeconds;
      const gap = ctx.gap ?? 99, lat = ctx.lateral ?? 0;
      const inRange = gap > 2 && gap < range && Math.abs(lat) < B.lateralMax && !s.stopped;
      if (inRange) {
        const gapF = gap <= B.nearGap ? 1 : 1 - (1 - B.farChance) * (gap - B.nearGap) / Math.max(1, range - B.nearGap);
        const latF = 1 - .5 * Math.abs(lat) / B.lateralMax;
        const steadyF = (ctx.stun || 0) > 0 ? .3 : ctx.scraping ? .5 : 1;
        const curveF = 1 - Math.min(.5, Math.abs(ctx.curvature || 0) * 25);
        const swerveF = 1 - .3 * Math.abs(ctx.thiefSwerve || 0);
        s.hitChance = clamp(pick(B.baseChance) * gapF * latF * steadyF * curveF * swerveF, .05, .98);
      } else s.hitChance = 0;
      s.lockWheel = inRange ? (lat > 0 ? 'RL' : 'RR') : null;
      if (inRange !== s.locked) { s.locked = inRange; events.push({type: 'lock', on: inRange}); }
    },
    fire() {
      if (s.stopped || s.reload > 0 || !s.locked) return false;
      if (s.ammo <= 0) { events.push({type: 'noAmmo'}); return false; }
      s.ammo--; s.reload = B.reloadSeconds; s.shots++;
      const hit = rnd() < s.hitChance;
      // the wheel nearer to the officer; a wheel already flat passes the hit to its neighbour
      let wheel = s.lockWheel || 'RL';
      if (hit && s.flats[wheel]) wheel = wheel === 'RL' ? 'RR' : 'RL';
      if (hit && s.flats[wheel]) wheel = wheel === 'RL' ? 'FL' : 'FR';
      const side = (last?.lateral ?? 0) > 0 ? -1 : 1;
      events.push({type: 'shot', hit, wheel: hit ? wheel : null, x: hit ? (wheel[0] === 'R' ? -1.4 : 1.4) : -2.2 - rnd() * 1.5, y: hit ? .35 : .05, z: hit ? side * .9 : side * (1.2 + rnd() * 1.6)});
      if (hit) {
        s.hits++;
        if (!s.flats[wheel]) { s.flats[wheel] = true; s.flatCount++; events.push({type: 'flat', wheel, flatCount: s.flatCount}); }
        if (s.flatCount >= s.flatsToStop && !s.stopped) { s.stopped = true; s.locked = false; s.hitChance = 0; events.push({type: 'stopped'}); }
      }
      return true;
    },
    drainEvents() { return events.splice(0); },
    thiefSpeedScale() { return B.speedScale[Math.min(B.speedScale.length - 1, s.flatCount)]; },
    thiefWobble(t) { const a = B.wobbleAmp * s.flatCount; return a ? Math.sin(t * 7) * a + Math.sin(t * 11.3) * a * .4 : 0; },
  };
  return api;
}
