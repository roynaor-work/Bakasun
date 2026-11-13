/** v7 "תפוס את הפושע": what the new chase elements and tools look like. Takes Three.js as a parameter (imports nothing),
 * reads the chase rules (catch-chase6.mjs with v7, catch-weapons.mjs) and only draws:
 *   nitro orbs     floating cyan orbs in short lines with a glow on the road (two instanced draws for all of them)
 *   police lights  red and blue flashers on the roadblocks that close two lanes (one point cloud)
 *   spike strip    flies over the getaway car and lands across a lane, spikes up (two instanced draws)
 *   sticky net     drapes over the getaway car while the engine is clogged
 *   pulse          a blue ring from the police car to the getaway car and a crackle of sparks
 *   tracker        a red beacon on the trunk and the police helicopter overhead with its spotlight while he is marked
 *   oil            the getaway car fishtails when it drives through oil
 * Draw calls stay low: the helicopter body is one merged mesh with vertex colours, everything else is instanced or shared. */
export const FX7 = Object.freeze({nitroY: 1, nitroR: .42, heliY: 15, heliAhead: 4, heliSide: 7, heliSpeed: 3.2, stripLen: 3.4, spikes: 9, flyNet: .32, flyPulse: .38, flyStrip: .5, window: [-25, 170]});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

/** Merges non-indexed copies of the given geometries, painting each with its colour (for one draw call). */
function mergeColored(T, parts) {
  const pos = [], nor = [], col = [], c = new T.Color();
  for (const [geo, color] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); c.set(color);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return out;
}

export function createChaseFx7({T, scene, track, chase, playerCar, crimCar, sparks, dust, gfx, theme = {}, low = false}) {
  const {glowTexture, canvasTexture, netTexture} = gfx, M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), UP = new T.Vector3(0, 1, 0), tmp = {}, tmp2 = {};
  const glow = glowTexture('#ffffff');
  const objs = [];
  const add = o => { scene.add(o); objs.push(o); return o; };
  // ----- nitro orbs -----
  const orbs = chase.obstacles.filter(o => o.kind === 'nitro');
  const orbMesh = add(new T.InstancedMesh(new T.IcosahedronGeometry(FX7.nitroR, 1), new T.MeshBasicMaterial({color: '#62ecff'}), Math.max(1, orbs.length)));
  const orbGlow = add(new T.InstancedMesh(new T.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: glowTexture('#5fe8ff'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .9}), Math.max(1, orbs.length)));
  orbMesh.frustumCulled = orbGlow.frustumCulled = false; orbMesh.count = orbGlow.count = 0; orbMesh.visible = orbGlow.visible = false;
  // ----- police flashers on the roadblocks -----
  const blocks = chase.obstacles.filter(o => o.kind === 'barrier' && o.police);
  const flashMax = Math.max(2, blocks.length * 2), flashPos = new Float32Array(flashMax * 3), flashCol = new Float32Array(flashMax * 3);
  const flashGeo = new T.BufferGeometry(); flashGeo.setAttribute('position', new T.BufferAttribute(flashPos, 3)); flashGeo.setAttribute('color', new T.BufferAttribute(flashCol, 3)); flashGeo.setDrawRange(0, 0);
  const flashes = add(new T.Points(flashGeo, new T.PointsMaterial({size: 1.6, map: glow, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true})));
  flashes.frustumCulled = false;
  // ----- spike strips (instanced planks and spikes, two strips at most at a time) -----
  const stripTex = canvasTexture(64, 16, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = '#1c1c1c'; g.fillRect(x, 0, 8, h); g.fillStyle = '#ffd21f'; g.fillRect(x + 8, 0, 8, h); } });
  const planks = add(new T.InstancedMesh(new T.BoxGeometry(.55, .07, FX7.stripLen), new T.MeshStandardMaterial({map: stripTex, roughness: .7}), 4));
  const spikes = add(new T.InstancedMesh(new T.ConeGeometry(.07, .26, 5), new T.MeshStandardMaterial({color: '#cfd6df', metalness: .7, roughness: .3}), 4 * FX7.spikes));
  planks.count = spikes.count = 0; planks.frustumCulled = spikes.frustumCulled = false;
  // ----- the sticky net over the getaway car -----
  const net = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({map: netTexture(), transparent: true, alphaTest: .2, side: T.DoubleSide, depthWrite: false, color: '#f3fbff'}));
  net.visible = false; scene.add(net); objs.push(net);
  // ----- pulse ring, tracker beacon, a flying blob for the net and the tracker -----
  const ring = add(new T.Mesh(new T.TorusGeometry(1, .09, 6, 36), new T.MeshBasicMaterial({color: '#7fd8ff', transparent: true, blending: T.AdditiveBlending, depthWrite: false})));
  ring.visible = false;
  const beacon = new T.Sprite(new T.SpriteMaterial({map: glowTexture('#ff3b3b'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); beacon.scale.set(1.1, 1.1, 1); beacon.position.set(-2.05, 1.05, 0); beacon.visible = false; crimCar.add(beacon); objs.push(beacon);
  const blob = add(new T.Sprite(new T.SpriteMaterial({map: glow, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, color: '#ffffff'}))); blob.visible = false; blob.scale.set(1.2, 1.2, 1);
  // ----- the police helicopter: one merged body, a rotor, a spotlight cone and the light on the road -----
  const heli = new T.Group(); heli.visible = false; add(heli);
  const bodyGeo = mergeColored(T, [
    [new T.SphereGeometry(1.15, 14, 10).scale(1.6, .95, 1), '#1f3f8a'], [new T.SphereGeometry(.92, 12, 8).scale(1.1, .8, .9).translate(.95, .1, 0), '#9fd8ff'],
    [new T.CylinderGeometry(.22, .34, 4.2, 8).rotateZ(Math.PI / 2).translate(-3.2, .25, 0), '#1f3f8a'], [new T.BoxGeometry(.9, 1.1, .12).translate(-5.2, .75, 0), '#f2f4f8'],
    [new T.BoxGeometry(3.4, .1, .12).translate(0, -1.25, .75), '#2a2d33'], [new T.BoxGeometry(3.4, .1, .12).translate(0, -1.25, -.75), '#2a2d33'],
    [new T.BoxGeometry(.1, .5, .1).translate(.8, -.95, .75), '#2a2d33'], [new T.BoxGeometry(.1, .5, .1).translate(-.8, -.95, .75), '#2a2d33'], [new T.BoxGeometry(.1, .5, .1).translate(.8, -.95, -.75), '#2a2d33'], [new T.BoxGeometry(.1, .5, .1).translate(-.8, -.95, -.75), '#2a2d33'],
    [new T.BoxGeometry(2.2, .1, .5).translate(-.2, -.55, 0), '#f2f4f8'], [new T.CylinderGeometry(.22, .22, .3, 10).translate(0, 1.05, 0), '#2a2d33'],
  ]);
  heli.add(new T.Mesh(bodyGeo, new T.MeshStandardMaterial({vertexColors: true, roughness: .55, metalness: .25})));
  const rotor = new T.Mesh(mergeColored(T, [[new T.BoxGeometry(7.6, .05, .32), '#1b1d22'], [new T.BoxGeometry(.32, .05, 7.6), '#1b1d22']]), new T.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: .55, depthWrite: false}));
  rotor.position.y = 1.25; heli.add(rotor);
  const coneLen = FX7.heliY + .5, cone = new T.Mesh(new T.CylinderGeometry(.35, 3.2, coneLen, 18, 1, true).translate(0, -coneLen / 2, 0), new T.MeshBasicMaterial({color: '#fff6d0', transparent: true, opacity: theme.lamps ? .16 : .08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false}));
  cone.position.y = -1.1; heli.add(cone);
  const spot = add(new T.Mesh(new T.CircleGeometry(3.4, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: glowTexture('#fff3c4'), transparent: true, opacity: theme.lamps ? .75 : .4, blending: T.AdditiveBlending, depthWrite: false})));
  spot.visible = false;
  const fly = {kind: null, t: 0, dur: 0, from: new T.Vector3(), to: new T.Vector3()};
  const stripsFly = new Map(); // strip id -> landing progress
  let phase = 0, netShown = 0, heliK = 0, ringT = -1, oilWiggle = 0, active = true;
  const heliPos = new T.Vector3(), heliLook = new T.Vector3();
  const st = () => chase.state, g = () => chase.gun.raw || {};

  function launchBlob(kind, color, dur) { fly.kind = kind; fly.t = 0; fly.dur = dur; blob.material.color.set(color); fly.from.set(playerCar.position.x, 1.3, playerCar.position.z); fly.to.set(crimCar.position.x, 1.2, crimCar.position.z); blob.visible = true; }
  const api = {
    handle(events) {
      for (const e of events) {
        if (e.type === 'nitro') { const o = chase.obstacles.find(x => x.id === e.id); if (o) { track.toWorld(o.s, o.d, tmp); sparks.emit(tmp.x, FX7.nitroY, tmp.z, 16, {speed: 4, up: 2.5, color: [.4, .95, 1], life: .5}); } }
        else if (e.type === 'spikesOut') stripsFly.set(e.strip, 0);
        else if (e.type === 'spikes') { sparks.emit(crimCar.position.x, .4, crimCar.position.z, 30, {speed: 5, up: 2.5, color: [1, .85, .4], life: .6}); dust.emit(crimCar.position.x, .3, crimCar.position.z, 10, {speed: 2.5, up: 1.4, color: [.6, .6, .6], gravity: -.4, life: 1}); }
        else if (e.type === 'wshot' && !e.late) {
          if (e.weapon === 'net') launchBlob('net', '#e8f6ff', FX7.flyNet);
          else if (e.weapon === 'emp') { ringT = 0; ring.visible = true; }
          else if (e.weapon === 'mark') launchBlob('mark', '#ff5a4a', .28);
          if (!e.hit && e.weapon !== 'emp') fly.miss = true; else fly.miss = false;
        }
        else if (e.type === 'emp') sparks.emit(crimCar.position.x, 1, crimCar.position.z, 34, {speed: 5, up: 3, color: [.5, .85, 1], life: .55});
        else if (e.type === 'netted') netShown = .001;
        else if (e.type === 'marked') sparks.emit(crimCar.position.x, 1.1, crimCar.position.z, 14, {speed: 3, up: 2, color: [1, .4, .3], life: .5});
        else if (e.type === 'crimOil') { oilWiggle = 1.1; dust.emit(crimCar.position.x, .3, crimCar.position.z, 10, {speed: 2, up: .8, color: [.25, .25, .3], gravity: .5, life: .7}); }
      }
    },
    update(dt) {
      if (!active) return;
      phase += dt; const s = st(), c = s.crim, raw = g(), lo = s.s + FX7.window[0], hi = s.s + FX7.window[1];
      // nitro orbs: bob and spin, gone once picked
      let n = 0;
      for (const o of orbs) {
        if (o.used || o.s < lo || o.s > hi) continue;
        track.toWorld(o.s, o.d, tmp); const bob = Math.sin(phase * 3 + o.id) * .14;
        Q.setFromAxisAngle(UP, phase * 2 + o.id); S.setScalar(1 + Math.sin(phase * 6 + o.id) * .06); P.set(tmp.x, FX7.nitroY + bob, tmp.z); M.compose(P, Q, S); orbMesh.setMatrixAt(n, M);
        Q.identity(); S.setScalar(.85 + Math.sin(phase * 5 + o.id) * .12); P.set(tmp.x, .05, tmp.z); M.compose(P, Q, S); orbGlow.setMatrixAt(n, M); n++;
      }
      orbMesh.count = orbGlow.count = n; orbMesh.visible = orbGlow.visible = n > 0; if (n) { orbMesh.instanceMatrix.needsUpdate = true; orbGlow.instanceMatrix.needsUpdate = true; }
      // flashers on the visible police roadblocks
      let f = 0; const red = Math.sin(phase * 10) > 0;
      for (const b of blocks) {
        if (b.s < lo || b.s > hi || f + 2 > flashMax) continue;
        for (const side of [-1, 1]) { track.toWorld(b.s, b.d + side * 1.1, tmp); flashPos.set([tmp.x, 1.25, tmp.z], f * 3); const on = (side > 0) === red; flashCol.set(on ? (side > 0 ? [1, .15, .15] : [.2, .35, 1]) : [.08, .08, .1], f * 3); f++; }
      }
      flashGeo.setDrawRange(0, f); flashes.visible = f > 0; if (f) { flashGeo.attributes.position.needsUpdate = true; flashGeo.attributes.color.needsUpdate = true; }
      // spike strips: fly in an arc over the car to their spot, then lie across the lane
      let pk = 0, sk = 0;
      for (const strip of raw.strips || []) {
        let k = (stripsFly.get(strip.id) ?? 1); k = Math.min(1, k + dt / FX7.flyStrip); stripsFly.set(strip.id, k);
        track.toWorld(strip.s, strip.d, tmp); track.toWorld(Math.min(strip.s, c.s), c.d, tmp2);
        const x = lerp(tmp2.x, tmp.x, k), z = lerp(tmp2.z, tmp.z, k), y = .04 + Math.sin(k * Math.PI) * 3.2, fade = strip.state === 'live' ? 1 : clamp(1 - strip.age / 1.4, 0, 1);
        if (fade <= 0 || pk >= 4) continue;
        Q.setFromAxisAngle(UP, track.yawAt(strip.s) + (1 - k) * 4); S.set(1, 1, fade); P.set(x, y, z); M.compose(P, Q, S); planks.setMatrixAt(pk++, M);
        for (let i = 0; i < FX7.spikes; i++) { const u = (i / (FX7.spikes - 1) - .5) * (FX7.stripLen - .3) * fade; track.toWorld(strip.s, strip.d + u, tmp); P.set(lerp(tmp2.x, tmp.x, k), y + .16, lerp(tmp2.z, tmp.z, k) + 0); Q.identity(); S.setScalar(fade * (strip.state === 'hit' ? .6 : 1)); M.compose(P, Q, S); spikes.setMatrixAt(sk++, M); }
      }
      planks.count = pk; spikes.count = sk; planks.visible = pk > 0; spikes.visible = sk > 0; if (pk) { planks.instanceMatrix.needsUpdate = true; spikes.instanceMatrix.needsUpdate = true; }
      // the flying blob (net, tracker): police car -> getaway car, a miss flies past
      if (fly.kind) {
        fly.t += dt; const k = clamp(fly.t / fly.dur, 0, 1); fly.to.set(crimCar.position.x + (fly.miss ? 2.5 : 0), fly.miss ? .4 : 1.25, crimCar.position.z + (fly.miss ? 1.8 : 0));
        blob.position.lerpVectors(fly.from, fly.to, k); blob.position.y += Math.sin(k * Math.PI) * 1.2; blob.scale.setScalar(fly.kind === 'net' ? .6 + k * 1.4 : .7);
        if (k >= 1) { fly.kind = null; blob.visible = false; }
      }
      // the sticky net drapes over the car while the engine is clogged
      const netOn = (raw.slows?.net || 0) > 0 && s.phase === 'run';
      if (netOn || netShown) { netShown = netOn ? Math.min(1, netShown + dt * 4) : Math.max(0, netShown - dt * 3); net.visible = netShown > 0; if (net.visible) { net.position.set(crimCar.position.x, .55, crimCar.position.z); net.rotation.y = crimCar.rotation.y; const e = .4 + .6 * netShown; net.scale.set(2.5 * e, 1.25 * e, 1.35 * e); net.material.opacity = netShown; } }
      // the pulse ring grows from the police car to the getaway car
      if (ringT >= 0) { ringT += dt; const k = ringT / FX7.flyPulse; if (k >= 1.4) { ringT = -1; ring.visible = false; } else { ring.position.lerpVectors(playerCar.position, crimCar.position, clamp(k, 0, 1)); ring.position.y = .9; ring.lookAt(crimCar.position.x, .9, crimCar.position.z); ring.scale.setScalar(.6 + k * 2.2); ring.material.opacity = clamp(1.4 - k, 0, 1); } }
      // the tracker: a beacon on the trunk and the helicopter overhead with its spotlight while marked
      const marked = (raw.marked || 0) > 0 && s.phase !== 'end';
      beacon.visible = marked && Math.sin(phase * 12) > -.2; heliK = clamp(heliK + (marked ? dt : -dt) / 1.6, 0, 1);
      heli.visible = spot.visible = heliK > 0;
      if (heli.visible) {
        track.toWorld(c.s + FX7.heliAhead, c.d + FX7.heliSide * (1 - heliK * .6), tmp);
        const tx = tmp.x, tz = tmp.z, ty = FX7.heliY + (1 - heliK) * 12 + Math.sin(phase * 1.3) * .4;
        if (!heliPos.lengthSq()) heliPos.set(tx + 30, ty + 8, tz);
        const kf = 1 - Math.exp(-dt * FX7.heliSpeed); heliPos.x += (tx - heliPos.x) * kf; heliPos.y += (ty - heliPos.y) * kf; heliPos.z += (tz - heliPos.z) * kf;
        heli.position.copy(heliPos); heliLook.set(crimCar.position.x, heliPos.y, crimCar.position.z); heli.rotation.set(0, track.yawAt(c.s), -.12); rotor.rotation.y += dt * 38;
        // the cone points at the getaway car
        P.set(crimCar.position.x - heliPos.x, -(heliPos.y - .2), crimCar.position.z - heliPos.z); const len = P.length(); P.normalize();
        cone.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), P.applyQuaternion(Q.copy(heli.quaternion).invert())); cone.scale.set(1, len / coneLen, 1);
        spot.position.set(crimCar.position.x, .06, crimCar.position.z); spot.material.opacity = (theme.lamps ? .75 : .42) * heliK;
      }
      // oil: the getaway car fishtails for a moment
      if (oilWiggle > 0) { oilWiggle = Math.max(0, oilWiggle - dt); crimCar.rotation.y += Math.sin(phase * 14) * .28 * oilWiggle; }
    },
    leave() { active = false; for (const o of objs) o.visible = false; beacon.visible = false; },
    stats() { return {orbs: orbMesh.count, flashes: flashGeo.drawRange.count, strips: planks.count, net: net.visible, heli: heli.visible, ring: ring.visible}; },
    dispose() { for (const o of objs) { o.parent?.remove(o); o.traverse?.(m => { m.geometry?.dispose?.(); if (m.material) { m.material.map?.dispose?.(); m.material.dispose?.(); } }); } },
  };
  return api;
}
