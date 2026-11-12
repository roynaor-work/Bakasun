/** v6 "תפוס את הפושע": what a tyre shot looks like. Cartoon only: a muzzle flash at the police car, a tracer to the wheel,
 * sparks on a hit, a dust puff on a miss, a flat tyre (the wheel squashes and the car sits lower on that corner),
 * grey smoke trailing from a flat wheel while the car moves, and a skid mark when it stops. Nothing here changes the rules. */
export function createTyreFx({T, scene, playerCar, crimCar, sparks, dust, gfx}) {
  const glow = gfx.glowTexture('#fff2b0');
  const flash = new T.Sprite(new T.SpriteMaterial({map: glow, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); flash.visible = false; flash.position.set(2.3, .9, -.6); playerCar.add(flash);
  const tracer = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({color: '#ffe9a8', transparent: true, opacity: 0})); tracer.frustumCulled = false; scene.add(tracer);
  const wheels = {}; for (const w of crimCar.userData.wheels || []) { const m = /Wheel_(FL|FR|RL|RR)$/.exec(w.name); if (m) wheels[m[1]] = w; }
  const flats = new Set(); let flashT = 0, tracerT = 0, smokeT = 0, skidMark = null, lastThiefSpeed = 0;
  const tmp = new T.Vector3(), tmp2 = new T.Vector3();
  const wheelWorld = id => { const w = wheels[id]; if (!w) return crimCar.position.clone(); return w.getWorldPosition(tmp2); };
  const settle = () => {
    // the car leans onto its flat corners
    let lean = 0, pitch = 0;
    for (const id of flats) { lean += id.endsWith('L') ? -.035 : .035; pitch += id.startsWith('R') ? -.02 : .02; }
    crimCar.userData.flatLean = lean; crimCar.userData.flatPitch = pitch;
  };
  return {
    handle(events) {
      for (const e of events) {
        if (e.type === 'shot') {
          flash.visible = true; flashT = .12; flash.scale.set(1.6, 1.6, 1);
          const from = playerCar.localToWorld(tmp.set(2.3, .9, -.6)).clone(), to = e.hit ? wheelWorld(e.wheel).clone() : crimCar.localToWorld(tmp.set(e.x, .1, e.z)).clone();
          const pos = tracer.geometry.attributes.position; pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, to.x, to.y, to.z); pos.needsUpdate = true; tracer.material.opacity = 1; tracerT = .2;
          if (e.hit) sparks.emit(to.x, to.y, to.z, 18, {speed: 4, up: 2.5, color: [1, .85, .4], life: .5});
          else dust.emit(to.x, .1, to.z, 8, {speed: 2, up: 1.4, color: [.75, .68, .55], gravity: 2, life: .6});
        } else if (e.type === 'flat') {
          flats.add(e.wheel); const w = wheels[e.wheel];
          if (w) { w.scale.y = .72; w.position.y -= .05 * (w.scale.x || 1); w.userData.flat = true; }
          settle(); const p = wheelWorld(e.wheel); dust.emit(p.x, p.y, p.z, 14, {speed: 2, up: 1.6, color: [.6, .6, .6], gravity: -.4, life: 1});
        } else if (e.type === 'stopped' || e.type === 'skid') {
          if (!skidMark) {
            const tex = gfx.canvasTexture(128, 32, g => { g.fillStyle = 'rgba(20,20,24,.55)'; for (let i = 0; i < 2; i++) { g.fillRect(0, 6 + i * 16, 128, 5); } });
            skidMark = new T.Mesh(new T.PlaneGeometry(9, 2.2), new T.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false})); skidMark.rotation.x = -Math.PI / 2; skidMark.position.y = .025; scene.add(skidMark);
          }
          skidMark.position.set(crimCar.position.x, .025, crimCar.position.z); skidMark.rotation.z = -crimCar.rotation.y;
        }
      }
    },
    update(dt, {thiefSpeed = 0, flatCount = 0, skid = false} = {}) {
      if (flash.visible) { flashT -= dt; flash.material.opacity = Math.max(0, flashT / .12); if (flashT <= 0) flash.visible = false; }
      if (tracerT > 0) { tracerT -= dt; tracer.material.opacity = Math.max(0, tracerT / .2); }
      // the flat wheels wobble and smoke while the car still moves; the body leans on the flat corner
      if (flats.size && thiefSpeed > 1) {
        smokeT -= dt;
        if (smokeT <= 0) { smokeT = .12; for (const id of flats) { const p = wheelWorld(id); dust.emit(p.x, p.y + .1, p.z, 1, {speed: 1.2, up: 1.4, color: [.55, .55, .55], gravity: -.6, life: .8}); } }
        for (const id of flats) { const w = wheels[id]; if (w) w.rotation.z = Math.sin(performance.now() / 60) * .08; }
      }
      crimCar.userData.flatLeanNow = (crimCar.userData.flatLeanNow || 0) + ((crimCar.userData.flatLean || 0) - (crimCar.userData.flatLeanNow || 0)) * Math.min(1, dt * 4); // the view adds this lean to the body
      if (skid) { const sm = skidMark; if (sm) sm.position.set(crimCar.position.x, .025, crimCar.position.z); }
      lastThiefSpeed = thiefSpeed;
    },
    dispose() { playerCar.remove(flash); scene.remove(tracer); if (skidMark) scene.remove(skidMark); },
  };
}
