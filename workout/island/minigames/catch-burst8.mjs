/** v8 "תפוס את הפושע": what a burst looks like (Roy after v23: "the firing should be like an automatic rifle, like a long burst, even if
 * it is one shot"; ?catchBurst=0 = the v7 single bolt). One tap = BURST8.rounds rounds at BURST8.rate a second, the same two numbers as the
 * sound (catch-audio8.mjs AUDIO8.burst): a muzzle flash that flickers once per round at the police car's front corner, a tracer per round
 * flying from the muzzle to its impact, sparks where a round strikes the car part, dust where it strikes the road. A hit walks onto the
 * target (the first rounds land just short of it on the road, the rest on it); a miss sprays the road around it.
 * The rules do not change: one roll per tap, decided at the tap (catch-weapons.mjs, catch-tyres.mjs); the burst spreads that one result over
 * the rounds, so the damage per tap is the damage of v7. Cartoon only: the targets are car parts. Takes Three.js as a parameter. */
export const BURST8 = Object.freeze({rounds: 7, rate: 11.5, walk: 2, speed: 140, tracerLen: 2.4, tracerWidth: .1, flash: .04, spread: [.35, 1.1], muzzle: [2.3, .9, -.6], pool: 10, shake: .05});

/** The rounds of one burst: when each leaves (s from the tap), whether it strikes the target, and where it lands off the target (metres in
 * the getaway car's frame: dx along it, behind negative; dz across). Deterministic for a given rnd. */
export function burstPlan({rounds = BURST8.rounds, rate = BURST8.rate, hit = false, walk = BURST8.walk, rnd = Math.random} = {}) {
  const out = [];
  for (let i = 0; i < rounds; i++) {
    const on = Boolean(hit) && i >= Math.min(walk, rounds - 1), a = rnd() * Math.PI * 2, r = BURST8.spread[0] + rnd() * (BURST8.spread[1] - BURST8.spread[0]);
    out.push(on ? {t: i / rate, on, dx: (rnd() - .5) * .2, dz: (rnd() - .5) * .2} : {t: i / rate, on, dx: -.25 - Math.abs(Math.cos(a)) * r, dz: Math.sin(a) * r});
  }
  return out;
}

export function createBurstFx({T, scene, playerCar, crimCar, sparks, dust, gfx, onRound = () => {}}) {
  const B = BURST8, X = new T.Vector3(1, 0, 0), v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3();
  const spriteMat = map => new T.SpriteMaterial({map, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false});
  // the muzzle flash: a warm glow and an eight-point star at the police car's front-left corner, one flicker per round
  const flash = new T.Group(); flash.visible = false; flash.position.set(...B.muzzle); playerCar.add(flash);
  const glow = gfx.glowTexture('#fff0b8'), star = gfx.canvasTexture(64, 64, g => { g.translate(32, 32); g.fillStyle = '#fff6d6'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 6 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
  const fGlow = new T.Sprite(spriteMat(glow)), fStar = new T.Sprite(spriteMat(star)); fGlow.scale.set(1.5, 1.5, 1); fStar.scale.set(1, 1, 1); flash.add(fGlow, fStar);
  // tracers: a small pool of streaks (two crossed glowing quads each, seen from any angle)
  const tracerTex = gfx.canvasTexture(64, 8, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,200,90,0)'); gr.addColorStop(.6, 'rgba(255,226,150,.8)'); gr.addColorStop(1, 'rgba(255,255,235,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const tracerMat = new T.MeshBasicMaterial({map: tracerTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false});
  const quad = new T.PlaneGeometry(1, 1), pool = [];
  for (let i = 0; i < B.pool; i++) { const g = new T.Group(), a = new T.Mesh(quad, tracerMat), b = new T.Mesh(quad, tracerMat); b.rotation.x = Math.PI / 2; g.add(a, b); g.visible = false; g.renderOrder = 6; scene.add(g); pool.push({g, busy: false, from: new T.Vector3(), to: new T.Vector3(), k: 0, dur: .1, q: null}); }
  const queue = [];
  let time = 0, flashT = 0, active = true, rounds = 0, onTarget = 0, bursts = 0;

  /** World point of a wheel of the getaway car (FL/FR/RL/RR), found by its node name, else from the car's size. */
  function wheelPoint(id, out = new T.Vector3()) {
    let w = null; crimCar.traverse(o => { if (!w && o.name === 'Wheel_' + id) w = o; });
    return w ? w.getWorldPosition(out) : crimCar.localToWorld(out.set(id[0] === 'R' ? -1.4 : 1.4, .35, id[1] === 'L' ? -.9 : .9));
  }
  const targets = {
    wheel: id => out => wheelPoint(id || 'RL', out),
    trunk: () => out => crimCar.localToWorld(out.set(-2.05, .85, 0)),
  };
  function impactPoint(q, out) { q.target(out); out.add(v3.set(q.dx, 0, q.dz).applyQuaternion(crimCar.quaternion)); if (!q.on) out.y = .05; return out; }
  function launch(q) {
    const tr = pool.find(p => !p.busy); rounds++; if (q.on) onTarget++;
    flash.visible = true; flashT = B.flash; fStar.material.rotation = Math.random() * Math.PI; fGlow.scale.setScalar(1.1 + Math.random() * .7); onRound(q);
    if (!tr) return;
    playerCar.localToWorld(tr.from.set(...B.muzzle)); impactPoint(q, tr.to);
    tr.busy = true; tr.q = q; tr.k = 0; tr.dur = Math.max(.04, tr.from.distanceTo(tr.to) / B.speed); tr.g.visible = true; place(tr);
  }
  function place(tr) {
    if (tr.q.on) impactPoint(tr.q, tr.to); // the car moves during the flight: the rounds that strike it follow it
    const head = v1.copy(tr.from).lerp(tr.to, tr.k), dir = v2.copy(tr.to).sub(tr.from); const len = dir.length() || 1; dir.divideScalar(len);
    const streak = Math.min(B.tracerLen, Math.max(.3, len * tr.k));
    tr.g.position.copy(head).addScaledVector(dir, -streak / 2); tr.g.quaternion.setFromUnitVectors(X, dir); tr.g.scale.set(streak, B.tracerWidth * 2, 1);
  }
  function impact(tr) {
    const p = tr.to;
    if (tr.q.on) sparks.emit(p.x, p.y, p.z, 7, {speed: 4, up: 2.4, color: [1, .86, .45], life: .4, spread: 1});
    else dust.emit(p.x, .08, p.z, 3, {speed: 1.6, up: 1.1, color: [.72, .66, .55], gravity: 2, life: .45});
  }
  return {
    /** A tap: `target` is a function that writes the target's world point into a vector (targets.wheel(id), targets.trunk()). */
    fire({hit = false, target = targets.wheel('RL'), rounds: n = B.rounds} = {}) {
      if (!active) return 0; bursts++;
      for (const q of burstPlan({rounds: n, hit})) queue.push({...q, at: time + q.t, target});
      return n;
    },
    targets,
    update(dt) {
      if (!active) return;
      time += dt;
      for (let i = 0; i < queue.length;) { if (queue[i].at <= time) launch(queue.splice(i, 1)[0]); else i++; }
      for (const tr of pool) { if (!tr.busy) continue; tr.k += dt / tr.dur; if (tr.k >= 1) { if (tr.q.on) impactPoint(tr.q, tr.to); impact(tr); tr.busy = false; tr.g.visible = false; } else place(tr); }
      if (flash.visible) { flashT -= dt; const k = Math.max(0, flashT / B.flash); fGlow.material.opacity = k; fStar.material.opacity = k; if (flashT <= 0) flash.visible = false; }
    },
    leave() { active = false; queue.length = 0; flash.visible = false; for (const tr of pool) { tr.busy = false; tr.g.visible = false; } },
    /** For the tests and the harness: rounds started, rounds that struck the target, taps, tracers in the air, rounds still to come. */
    stats() { return {bursts, rounds, onTarget, inAir: pool.filter(p => p.busy).length, queued: queue.length, flash: flash.visible}; },
    dispose() {
      active = false; playerCar.remove(flash); for (const tr of pool) scene.remove(tr.g);
      quad.dispose(); tracerMat.dispose(); tracerTex.dispose?.(); for (const s of [fGlow, fStar]) { s.material.map?.dispose?.(); s.material.dispose(); }
    },
  };
}
