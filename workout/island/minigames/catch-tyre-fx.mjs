/** v6 "תפוס את הפושע": what a tyre shot looks like. Cartoon only, the target is always a wheel:
 * a muzzle flash at the police car, a glowing bolt to the wheel, a spark burst and a ring on a hit, a dust puff on a miss,
 * a flat tyre (the wheel squashes inside a pivot so the squash does not spin, the hub drops, a rubber flap slaps round),
 * the body leans onto the flat corner, grey smoke trails from every flat wheel while the car moves, two skid ribbons
 * follow the rear wheels through the fishtail, and a puff marks the stop. Nothing here changes the rules.
 * The pure helpers (flatSquash, leanFor, ribbonStrip) are exported for the tests; they use no Three.js. */

export const TYRE_FX = Object.freeze({
  squashY: .72, bulgeX: 1.06,       // the flat tyre: squashed, a little wider
  rollPerFlat: .06, pitchPerFlat: .026, // body lean (radians) per flat wheel: roll onto the side, pitch onto the axle
  flashSeconds: .12, boltSeconds: .2, ringSeconds: .3,
  smokeEvery: .11,                   // seconds between smoke puffs per flat wheel while rolling
  ribbonWidth: .42, ribbonMax: 180,  // skid mark: metres wide, points per wheel
  muzzle: [2.3, .9, -.6],            // police car local: front-left corner (the car faces +x, left is -z)
});

/** The flat wheel: scale and how far the hub drops so the squashed tyre still touches the road. radius in the parent's units. */
export function flatSquash(radius) { return {scaleY: TYRE_FX.squashY, scaleX: TYRE_FX.bulgeX, drop: radius * (1 - TYRE_FX.squashY)}; }
/** Body lean for a set of flat wheels (names FL/FR/RL/RR): roll > 0 = right side down, pitch > 0 = rear down. */
export function leanFor(flats) {
  let roll = 0, pitch = 0;
  for (const id of flats) { roll += id.endsWith('R') ? TYRE_FX.rollPerFlat : -TYRE_FX.rollPerFlat; pitch += id.startsWith('R') ? TYRE_FX.pitchPerFlat : -TYRE_FX.pitchPerFlat; }
  return {roll, pitch};
}
/** Triangle-strip positions for a ribbon through ground points [{x, z}] of a given width: 2 vertices per point, y given.
 * Returns {positions: Float32Array(points * 6), count: points * 2}. Fewer than 2 points give an empty strip. */
export function ribbonStrip(points, width, y = .03, into = null) {
  const n = points.length, out = into || new Float32Array(Math.max(1, n) * 6);
  if (n < 2) return {positions: out, count: 0};
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const nx = -dz * width / 2, nz = dx * width / 2, p = points[i];
    out[i * 6] = p.x + nx; out[i * 6 + 1] = y; out[i * 6 + 2] = p.z + nz;
    out[i * 6 + 3] = p.x - nx; out[i * 6 + 4] = y; out[i * 6 + 5] = p.z - nz;
  }
  return {positions: out, count: n * 2};
}
const stripIndex = n => { const idx = []; for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); return idx; }; // wound to face up

export function createTyreFx({T, scene, playerCar, crimCar, sparks, dust, gfx}) {
  const F = TYRE_FX, tmp = new T.Vector3(), tmp2 = new T.Vector3(), tmp3 = new T.Vector3(), q = new T.Quaternion(), X = new T.Vector3(1, 0, 0);
  const glow = gfx.glowTexture('#fff2b0'), glowRing = gfx.glowTexture('#ffd27a');
  const spriteMat = map => new T.SpriteMaterial({map, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false});
  // muzzle flash: a soft glow and a star, at the front-left of the police car
  const flash = new T.Group(); flash.visible = false; flash.position.set(...F.muzzle); playerCar.add(flash);
  const flashGlow = new T.Sprite(spriteMat(glow)); flashGlow.scale.set(1.6, 1.6, 1); flash.add(flashGlow);
  const starTex = gfx.canvasTexture ? gfx.canvasTexture(64, 64, g => { g.translate(32, 32); g.fillStyle = '#fff8dc'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 7 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }) : glow;
  const flashStar = new T.Sprite(spriteMat(starTex)); flashStar.scale.set(1.1, 1.1, 1); flash.add(flashStar);
  // the bolt: two crossed glowing quads from the muzzle to the impact point, visible from any angle
  const boltTex = gfx.canvasTexture ? gfx.canvasTexture(128, 16, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,240,190,0)'); gr.addColorStop(.3, 'rgba(255,236,170,.75)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h); }) : glow;
  const boltMat = new T.MeshBasicMaterial({map: boltTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false});
  const bolt = new T.Group(); bolt.visible = false; scene.add(bolt);
  const boltA = new T.Mesh(new T.PlaneGeometry(1, 1), boltMat), boltB = new T.Mesh(new T.PlaneGeometry(1, 1), boltMat); boltB.rotation.x = Math.PI / 2; bolt.add(boltA, boltB);
  // hit ring at the wheel
  const ring = new T.Sprite(spriteMat(glowRing)); ring.visible = false; scene.add(ring);
  // skid ribbons behind the two rear wheels
  const ribbonMat = new T.MeshBasicMaterial({color: '#0b0b0e', transparent: true, opacity: .8, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const ribbons = {};
  for (const id of ['RL', 'RR']) {
    const geo = new T.BufferGeometry(), pos = new Float32Array(F.ribbonMax * 6);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(stripIndex(F.ribbonMax)); geo.setDrawRange(0, 0);
    const mesh = new T.Mesh(geo, ribbonMat); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false; scene.add(mesh);
    ribbons[id] = {mesh, pos, points: []};
  }

  const wheels = {}; for (const w of crimCar.userData.wheels || []) { const m = /Wheel_(FL|FR|RL|RR)$/.exec(w.name); if (m) wheels[m[1]] = w; }
  // the body that leans: the fitted model under the car root (the view owns the root's yaw)
  let inner = null; { let n = wheels.RL || wheels.RR || null; while (n && n.parent && n.parent !== crimCar) n = n.parent; inner = n && n.parent === crimCar ? n : null; }
  const flats = new Set(), pivots = {}, flaps = {};
  let flashT = 0, boltT = 0, ringT = 0, smokeT = 0, time = 0, skidding = false, skidWas = false, stillFor = 0, stopPuffed = false, roll = 0, pitch = 0;
  const wheelWorld = (id, out = tmp2) => { const w = wheels[id]; if (!w) { return crimCar.localToWorld(out.set(id[0] === 'R' ? -1.4 : 1.4, .35, id[1] === 'L' ? -.9 : .9)); } return w.getWorldPosition(out); };
  const rearGround = (id, out) => { wheelWorld(id, out); out.y = .03; return out; };

  function flatten(id) {
    const w = wheels[id]; if (!w || pivots[id]) return;
    const parent = w.parent; if (!parent) return;
    // the wheel's radius in the parent's units, from its world size
    const box = new T.Box3().setFromObject(w), size = box.getSize(tmp3), ws = parent.getWorldScale(tmp).y || 1, radius = size.y / 2 / ws;
    const {scaleY, scaleX, drop} = flatSquash(radius);
    const pivot = new T.Group(); pivot.position.copy(w.position); pivot.quaternion.copy(w.quaternion); pivot.name = w.name + '_flat'; pivot.userData.orig = w.position.clone();
    parent.add(pivot); parent.remove(w); w.position.set(0, 0, 0); w.quaternion.identity(); pivot.add(w);
    // the wheel's local axes: the axle is x in the Codex models; up is y in the parent frame
    pivot.scale.set(scaleX, scaleY, 1); pivot.position.y -= drop; pivots[id] = pivot; w.userData.flat = true;
    // a rubber flap: a dark slab on the rim that goes round with the wheel
    const wsw = w.getWorldScale(tmp).x || 1, r = size.y / 2 / wsw, width = (size.x / wsw) * .8;
    // the axle is the wheel's x: the flap spans the tread (x), is thin (y) and hangs along the rim (z), tilted out past the tread
    const flap = new T.Mesh(new T.BoxGeometry(width, r * .14, r * .55), new T.MeshStandardMaterial({color: '#3a3a40', roughness: .9})); flap.position.set(0, -r * .98, r * .22); flap.rotation.x = .6; w.add(flap); flaps[id] = flap;
    ({roll, pitch} = leanFor(flats));
    // the view may add userData.flatLean / flatPitch to the root: the body lean is applied here on the inner model instead, in the car's own frame
    crimCar.userData.flatLean = 0; crimCar.userData.flatPitch = 0; crimCar.userData.flatLeanNow = 0;
  }
  function unflatten(id) {
    const w = wheels[id], pivot = pivots[id]; if (!w || !pivot) return;
    const parent = pivot.parent; if (flaps[id]) { w.remove(flaps[id]); flaps[id].geometry.dispose(); flaps[id].material.dispose(); delete flaps[id]; }
    pivot.remove(w); w.position.copy(pivot.userData.orig); w.quaternion.copy(pivot.quaternion); w.scale.set(1, 1, 1); parent?.add(w); parent?.remove(pivot); delete pivots[id]; w.userData.flat = false;
  }
  function startBolt(from, to) {
    const dir = tmp3.copy(to).sub(from), len = dir.length() || 1; dir.normalize();
    bolt.position.copy(from).addScaledVector(dir, len / 2); bolt.quaternion.copy(q.setFromUnitVectors(X, dir)); bolt.scale.set(len, .16, 1);
    bolt.visible = true; boltMat.opacity = 1; boltT = F.boltSeconds;
  }
  function pushRibbon(id) {
    const r = ribbons[id], p = rearGround(id, tmp);
    const last = r.points[r.points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < .12) return;
    if (r.points.length >= F.ribbonMax) r.points.shift();
    r.points.push({x: p.x, z: p.z});
    const {count} = ribbonStrip(r.points, F.ribbonWidth, .03, r.pos);
    r.mesh.geometry.attributes.position.needsUpdate = true; r.mesh.geometry.setDrawRange(0, Math.max(0, (count / 2 - 1) * 6)); r.mesh.visible = count >= 4;
  }
  function stopPuff() {
    if (stopPuffed) return; stopPuffed = true;
    const p = crimCar.position;
    dust.emit(p.x, .25, p.z, 16, {speed: 3, up: 2, color: [.82, .82, .84], gravity: -.5, life: .9, spread: 1.4});
    for (const id of ['RL', 'RR']) { rearGround(id, tmp); dust.emit(tmp.x, .1, tmp.z, 5, {speed: 1.5, up: 1.4, color: [.75, .75, .77], gravity: -.6, life: .8}); }
    sparks.emit(p.x, .5, p.z, 8, {speed: 2, up: 2.2, color: [1, .9, .6], life: .5});
  }

  return {
    handle(events) {
      for (const e of events || []) {
        if (e.type === 'shot') {
          flash.visible = true; flashT = F.flashSeconds; flashStar.material.rotation = Math.random() * Math.PI;
          const from = playerCar.localToWorld(tmp.set(...F.muzzle)).clone();
          const to = e.hit ? wheelWorld(e.wheel || 'RL').clone() : crimCar.localToWorld(tmp.set(e.x ?? -2.2, .08, e.z ?? 1.2)).clone();
          startBolt(from, to);
          if (e.hit) {
            sparks.emit(to.x, to.y, to.z, 22, {speed: 4.5, up: 2.6, color: [1, .85, .4], life: .5, spread: 1.1});
            sparks.emit(to.x, to.y + .1, to.z, 8, {speed: 2.5, up: 3, color: [1, 1, 1], life: .35});
            ring.position.copy(to); ring.visible = true; ringT = F.ringSeconds;
          } else {
            dust.emit(to.x, .1, to.z, 9, {speed: 2.2, up: 1.5, color: [.75, .68, .55], gravity: 2, life: .6});
            sparks.emit(to.x, .12, to.z, 4, {speed: 2, up: 1.4, color: [1, .9, .7], life: .3});
          }
        } else if (e.type === 'flat') {
          flats.add(e.wheel); flatten(e.wheel);
          const p = wheelWorld(e.wheel);
          dust.emit(p.x, p.y, p.z, 12, {speed: 2.2, up: 2, color: [.8, .8, .8], gravity: -.6, life: .7});
          sparks.emit(p.x, p.y, p.z, 6, {speed: 1.5, up: 1.5, color: [.3, .3, .3], life: .5}); // rubber bits
        } else if (e.type === 'skid') { skidding = true; stopPuffed = false; }
        else if (e.type === 'stopped') { skidding = true; stopPuffed = false; }
      }
    },
    update(dt, {thiefSpeed = 0, flatCount = 0, skid = false} = {}) {
      time += dt;
      if (flash.visible) { flashT -= dt; const k = Math.max(0, flashT / F.flashSeconds); flashGlow.material.opacity = k; flashStar.material.opacity = k; flashGlow.scale.setScalar(1 + k * 1.2); flashStar.scale.setScalar(.6 + k * .9); if (flashT <= 0) flash.visible = false; }
      if (bolt.visible) { boltT -= dt; boltMat.opacity = Math.max(0, boltT / F.boltSeconds); if (boltT <= 0) bolt.visible = false; }
      if (ring.visible) { ringT -= dt; const u = 1 - Math.max(0, ringT / F.ringSeconds); ring.scale.setScalar(.4 + u * 2.2); ring.material.opacity = 1 - u; if (ringT <= 0) ring.visible = false; }
      // flat wheels smoke while the car rolls, more when it rolls fast; the hubs thump a little
      if (flats.size && thiefSpeed > 1) {
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = F.smokeEvery / Math.min(2, .6 + thiefSpeed / 20);
          for (const id of flats) { const p = wheelWorld(id); dust.emit(p.x - .3, p.y + .15, p.z, 1, {speed: 1, up: 2.2, color: [.82, .82, .84], gravity: -1.2, life: .55}); }
        }
        for (const id of flats) { const pv = pivots[id]; if (pv) pv.scale.y = F.squashY + Math.sin(time * 19 + (id === 'RL' ? 0 : 2)) * .04; }
      }
      // the body settles onto the flat corners (roll about the car's own long axis, pitch onto the axle)
      if (inner) {
        const k = 1 - Math.exp(-dt * 4);
        inner.rotation.x += (roll - inner.rotation.x) * k; inner.rotation.z += (pitch - inner.rotation.z) * k;
      }
      // skid: ribbons behind the rear wheels, heavier smoke, and a puff when the car finally stands still
      if (skid) skidding = true;
      if (skidding) {
        pushRibbon('RL'); pushRibbon('RR');
        if (thiefSpeed > .5 && Math.random() < .6) { rearGround('RL', tmp); dust.emit(tmp.x, .15, tmp.z, 1, {speed: 1.5, up: 1.2, color: [.8, .8, .8], gravity: -.8, life: .6}); rearGround('RR', tmp); dust.emit(tmp.x, .15, tmp.z, 1, {speed: 1.5, up: 1.6, color: [.8, .8, .8], gravity: -.8, life: .6}); }
        stillFor = thiefSpeed < .4 ? stillFor + dt : 0;
        if ((skidWas && !skid) || stillFor > .25) { skidding = false; stopPuff(); }
      }
      skidWas = skid;
    },
    /** For the tests and the harness. */
    get flats() { return new Set(flats); }, get pivots() { return pivots; }, get inner() { return inner; }, ribbonPoints(id) { return ribbons[id]?.points.length || 0; },
    dispose() {
      for (const id of [...flats]) unflatten(id);
      playerCar.remove(flash); scene.remove(bolt, ring); for (const id in ribbons) { scene.remove(ribbons[id].mesh); ribbons[id].mesh.geometry.dispose(); }
      ribbonMat.dispose(); boltMat.dispose(); for (const s of [flashGlow, flashStar, ring]) { s.material.map?.dispose?.(); s.material.dispose(); }
    },
  };
}
