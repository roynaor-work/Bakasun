/** A child-like ski bot for the league measurements (ski league v23). It sees only what the screen shows: the engine snapshot
 * (the player, the obstacles within the view distance, wind, boost and trick readiness), never the rivals' plans or the future course.
 * Like a seven-year-old it is late and imprecise: it re-plans its line every `reaction` seconds, looks `look` metres ahead, misses an
 * obstacle now and then (`miss`, decided once per obstacle), aims with noise, feels a gust `windDelay` seconds late and leans into it
 * only partly. It presses boost when the tank is ready and the lane is clear, and tries a grab on a ramp jump.
 * The same decide() runs in tools/alpine-league-sim.mjs (headless, engine commands) and tools/alpine-league-browser.mjs (real touches).
 * Pure: no DOM, no engine import. */
export const KID = Object.freeze({reaction: .4, look: 30, noise: .45, miss: .1, missBright: .03, gain: .7, windDelay: .5, windComp: .7, boostClear: 26, boostAt: .98, trickChance: .55, gateDesire: 5});

export function createKidBot({seed = 1, physics, ...options} = {}) {
  const o = {...KID, ...options}, P = physics, half = P.pipe.flatHalf, board = P.board.halfWidth;
  let state = (Number(seed) >>> 0) || 1;
  const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const missed = new Map(), winds = [];
  let nextPlan = -1, targetX = 0, trickTried = false, wasAir = false;
  function plan(snap) {
    const p = snap.player, ps = p.s;
    const ahead = (snap.obstacles || []).filter(ob => ob.s > ps + 1 && ob.s < ps + o.look && ob.type !== 'coin' && ob.type !== 'warn' && ob.type !== 'finish');
    // Rocks are easy to overlook; flagged gates and ramps are big and bright (missBright).
    for (const ob of ahead) if (!missed.has(ob.id)) missed.set(ob.id, rnd() < (ob.type === 'rock' ? o.miss : o.missBright));
    let best = p.x, bestCost = Infinity;
    const speed = Math.max(8, (snap.speedKmh || 0) / 3.6), postReach = board + P.postHalf[0] + .3;
    for (let cx = -half - 1; cx <= half + 1 + 1e-9; cx += .4) {
      let cost = Math.abs(cx - p.x) * .12 + Math.max(0, Math.abs(cx) - half) * 1.5;
      // Like any rider, the move to cx sweeps every lane in between: obstacles reached before the move ends count for the whole sweep.
      const lo = Math.min(cx, p.x), hi = Math.max(cx, p.x);
      for (const ob of ahead) {
        if (missed.get(ob.id)) continue;
        const near = 1 / (1 + (ob.s - ps) / 18), off = Math.abs(cx - ob.x), sweeping = ob.s - ps < Math.abs(cx - p.x) / P.lateralSpeed * speed + 3;
        if (ob.type === 'rock') { const reach = ob.radius * P.rockHitScale + board + .3; if (off < reach || (sweeping && ob.x > lo - reach && ob.x < hi + reach)) cost += 100 * near; }
        else if (ob.type === 'gate') {
          const crosses = sweeping && [-1, 1].some(side => { const post = ob.x + side * P.gateHalfWidth; return post > lo - postReach && post < hi + postReach; });
          if (Math.abs(off - P.gateHalfWidth) < postReach || crosses) cost += 100 * near; else if (off < P.gateHalfWidth - board - .2) cost -= o.gateDesire * near;
        }
        else if (ob.type === 'boost') { if (off < P.pad.width / 2 - .3) cost -= 4 * near; }
        else if (ob.type === 'ramp') { if (off < 1.1) cost -= 3 * near; else if (off < P.ramp.width / 2 + board) cost += 60 * near; }
      }
      if (cost < bestCost - 1e-9) { bestCost = cost; best = cx; }
    }
    targetX = Math.max(-half - 1, Math.min(half + 1, best + (rnd() * 2 - 1) * o.noise));
  }
  return {
    /** One decision from a snapshot: {steer: -1..1, boost: bool, trick: id|null}. */
    decide(snap) {
      const t = snap.timeMs / 1000, p = snap.player;
      if (snap.phase !== 'racing' || !p) return {steer: 0, boost: false, trick: null};
      if (t >= nextPlan) { plan(snap); nextPlan = t + o.reaction * (.8 + .4 * rnd()); }
      // Wind is felt late: the bot leans against the gust it felt windDelay seconds ago.
      winds.push([t, snap.wind?.v || 0]); while (winds.length > 2 && winds[1][0] <= t - o.windDelay) winds.shift();
      const felt = winds[0][0] <= t - o.windDelay + 1e-9 ? winds[0][1] : 0;
      const steer = Math.max(-1, Math.min(1, (targetX - p.x) * o.gain - o.windComp * felt / P.lateralSpeed));
      let boost = false, trick = null;
      // A child presses boost when the button blinks (the HUD arrow shows at a full tank), not at the first usable drop.
      if (snap.boostReady && (snap.boostFraction ?? 1) >= o.boostAt && !p.boosting && !p.crashed && !p.airborne) {
        const blocked = (snap.obstacles || []).some(ob => ob.type === 'rock' && ob.s > p.s && ob.s < p.s + o.boostClear && Math.abs(ob.x - p.x) < ob.radius + board + .5);
        boost = !blocked;
      }
      if (p.airborne && !wasAir) trickTried = false;
      if (snap.trickReady && !trickTried && p.airKind === 'ramp' && (p.height ?? 0) > .45) { trickTried = true; if (rnd() < o.trickChance) trick = 'grab'; }
      wasAir = !!p.airborne;
      return {steer: Math.abs(steer) < .02 ? 0 : steer, boost, trick};
    },
    get targetX() { return targetX; }
  };
}
