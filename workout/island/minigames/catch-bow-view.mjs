import {clamp, lerp, damp, smooth, netTexture, glowTexture, starTexture, canvasTexture, blobShadow} from './catch-gfx.mjs?v=island-v2-20261107-8';

/** v6 "תפוס את הפושע", the catch as an archery range: first person at the officer's eyes, the net launcher and her hands
 * at the bottom of the screen like a bow, the thief far down the street. Local engine coordinates (x forward, y up,
 * z sideways) map to the world through the track frame where the getaway car stopped. The HUD (catch-bow-hud.mjs)
 * drives engine.setAim; this only draws: launcher draw-back and zoom, the sight (where the net passes at the thief's
 * distance), the preview arc of early stages, the flying net, catches, misses, wind streamers. */
export const BOW = Object.freeze({eyeX: .2, eyeY: 1.55, fovIdle: 44, fovDrawn: 36, pitchBase: -3, blendSeconds: .8});
export const STRINGS = Object.freeze({'catch.bow.sight': 'כוונת', 'catch.bow.distance': 'מרחק {m} מ׳'});

export function createBowStage({T, scene, camera, models, officer, thieves, frame, track, balance, level, stage, engine: initial, sparks, dust, gfx = {}, theme}) {
  let engine = initial;
  const C = balance.criminal, w = (x, z, out = {}) => track.toWorld(frame.s0 + x, frame.d0 + z, out), tmp = {}, tmpV = new T.Vector3();
  const yaw0 = track.yawAt(frame.s0); // world heading of +x
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: .7, ...extra});
  const shadowTex = glowTexture('#000000');

  // ----- the launcher and hands, fixed to the camera like a bow -----
  const rig = new T.Group(); camera.add(rig);
  const launcher = new T.Group(); rig.add(launcher);
  const tube = new T.Mesh(new T.CylinderGeometry(.045, .055, .62, 14), mat('#3a4150', {metalness: .5, roughness: .4})); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0, -.2); launcher.add(tube);
  const muzzle = new T.Mesh(new T.CylinderGeometry(.075, .06, .08, 16), mat('#d9b44a', {metalness: .6, roughness: .3})); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0, -.52); launcher.add(muzzle);
  const netTex = netTexture();
  const loadedNet = new T.Mesh(new T.SphereGeometry(.07, 12, 8), new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, color: '#f6f9ff'})); loadedNet.position.set(0, 0, -.56); launcher.add(loadedNet);
  const grip = new T.Mesh(new T.BoxGeometry(.05, .12, .07), mat('#2b2f3a')); grip.position.set(0, -.08, -.05); launcher.add(grip);
  const stock = new T.Mesh(new T.BoxGeometry(.06, .08, .22), mat('#5a4631')); stock.position.set(0, -.03, .16); launcher.add(stock);
  const skin = '#d9a07a', sleeve = '#2f4f9a';
  const hand = (x, y, z, r = .055) => { const g = new T.Group(); const palm = new T.Mesh(new T.SphereGeometry(r, 12, 10), mat(skin)); palm.scale.set(1, .8, 1.2); g.add(palm); const arm = new T.Mesh(new T.CylinderGeometry(r * .9, r * 1.2, .42, 10), mat(sleeve)); arm.position.set(0, -.18, .14); arm.rotation.x = .5; g.add(arm); g.position.set(x, y, z); return g; };
  launcher.add(hand(0, -.1, -.22), hand(.02, -.11, .08, .05));
  launcher.position.set(.26, -.28, -.75); launcher.rotation.set(.02, -.06, .06);
  rig.visible = false;

  // ----- thief dressing (same as v5) and the caught nets -----
  const thief = thieves[0].actor;
  const dressThief = actor => {
    const beanie = new T.Mesh(new T.SphereGeometry(.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#101114')); beanie.position.y = .15;
    const mask = new T.Mesh(new T.SphereGeometry(.118, 18, 10, -Math.PI / 2.2, Math.PI / 1.1, Math.PI * .56, Math.PI * .22), mat('#0d0e10', {side: T.DoubleSide})); mask.rotation.y = Math.PI / 2; mask.position.set(0, .1, .02);
    const sack = new T.Mesh(new T.SphereGeometry(.17, 14, 10), mat('#a07a3d')); sack.scale.set(.9, 1.1, .9); sack.position.set(.04, -.1, 0);
    const holder = new T.Group(); holder.add(sack); actor.attach('Head', beanie); actor.attach('Head', mask); actor.attach('LeftHand', holder);
  };
  if (!thief.dressed) { dressThief(thief); thief.dressed = true; }
  const netMat = new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, side: T.DoubleSide, depthWrite: false, color: '#f6f9ff'});
  const caughtNets = thieves.map(() => { const n = new T.Mesh(new T.SphereGeometry(1, 18, 12), netMat.clone()); n.visible = false; n.userData = {t: 0, fade: 0, scale: 1}; scene.add(n); return n; });

  // ----- projectile, sight, preview, effects -----
  const projectile = new T.Group(); projectile.visible = false; scene.add(projectile);
  const net = new T.Mesh(new T.SphereGeometry(1, 16, 10), netMat); projectile.add(net);
  const knot = new T.Mesh(new T.SphereGeometry(.1, 10, 8), mat('#d8dde8', {metalness: .5, roughness: .35})); projectile.add(knot);
  const loop = new T.Mesh(new T.TorusGeometry(1, .035, 8, 28), mat('#c79a4e')); loop.visible = false; projectile.add(loop);
  const trail = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length: 18}, () => new T.Vector3())), new T.LineBasicMaterial({color: '#ffffff', transparent: true, opacity: .55})); trail.frustumCulled = false; trail.visible = false; scene.add(trail);
  const trailPts = [];
  const dotTex = canvasTexture(64, 64, g => { g.fillStyle = '#7fd4ff55'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = '#9fe4ff'; g.beginPath(); g.arc(32, 32, 17, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill(); });
  const dots = []; for (let i = 0; i < 36; i++) { const s = new T.Sprite(new T.SpriteMaterial({map: dotTex, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, color: '#8fdcff', fog: false})); s.renderOrder = 8; s.visible = false; scene.add(s); dots.push(s); }
  const landRing = new T.Mesh(new T.RingGeometry(.42, .58, 32), new T.MeshBasicMaterial({color: '#ffd37a', transparent: true, opacity: .9, depthTest: false, side: T.DoubleSide})); landRing.renderOrder = 9; landRing.rotation.x = -Math.PI / 2; landRing.visible = false; scene.add(landRing);
  const sight = new T.Sprite(new T.SpriteMaterial({map: canvasTexture(64, 64, g => { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill(); }), transparent: true, depthTest: false, depthWrite: false, fog: false})); sight.renderOrder = 10; sight.visible = false; scene.add(sight);
  const flash = new T.Sprite(new T.SpriteMaterial({map: glowTexture('#ffffff'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, fog: false})); flash.visible = false; flash.renderOrder = 10; scene.add(flash);
  const groundNet = new T.Mesh(new T.CircleGeometry(1, 20), new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, side: T.DoubleSide, depthWrite: false})); groundNet.rotation.x = -Math.PI / 2; groundNet.visible = false; scene.add(groundNet);
  // wind streamers: leaves that drift across the street with the wind
  const leafTex = canvasTexture(32, 32, g => { g.fillStyle = '#e8d8a8'; g.beginPath(); g.ellipse(16, 16, 12, 5, .6, 0, 7); g.fill(); });
  const leaves = []; for (let i = 0; i < 10; i++) { const s = new T.Sprite(new T.SpriteMaterial({map: leafTex, transparent: true, depthWrite: false, opacity: .85})); s.scale.set(.28, .28, 1); s.visible = false; scene.add(s); leaves.push({s, x: 0, y: 0, z: 0, life: 0}); }

  // ----- camera -----
  const cam = {fov: BOW.fovIdle, yaw: 0, pitch: BOW.pitchBase, blend: 0, from: null, draw: 0, holdSway: {yaw: 0, angle: 0}};
  const look = new T.Vector3(), eye = new T.Vector3();
  let mode = 'idle', groundTimer = 0, caughtAt = null, escapeCarStart = null, sightLocal = null;

  function placeActor(actor, x, z, yawLocal = 0) { w(x, z, tmp); actor.root.position.x = tmp.x; actor.root.position.z = tmp.z; actor.root.rotation.y = yaw0 + yawLocal; }
  function flightPoint(f) {
    const t = clamp(engine.clock - f.t0, 0, f.duration), p = f.path; let i = 0; while (i < p.length - 2 && p[i + 1].t < t) i++;
    const a = p[i], b = p[i + 1] || a, u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u, t, vx: (b.x - a.x) / Math.max(1e-4, b.t - a.t), vy: (b.y - a.y) / Math.max(1e-4, b.t - a.t)};
  }
  const toolOf = id => engine.tools.find(t => t.id === id);
  function drawPreview(show) {
    const pr = show ? engine.preview() : null, points = pr?.points || [];
    const c = engine.criminalAt(engine.clock);
    // the sight: where the wind-free arc passes the thief's distance (an archer's sight pin)
    sightLocal = null;
    if (show) { const full = engine.trajectory(engine.aimNow().angle, engine.aimNow().power, engine.aim.tool, {withWind: false, yaw: engine.aimNow().yaw, stopAtObstacle: false}); const at = full.path.find(p => p.x >= c.x) || full.path[full.path.length - 1]; sightLocal = {x: at.x, y: Math.max(.05, at.y), z: at.z || 0}; w(sightLocal.x, sightLocal.z, tmp); sight.position.set(tmp.x, sightLocal.y, tmp.z); sight.scale.setScalar(.12 + Math.abs(c.x) * .03); sight.visible = true; }
    else sight.visible = false;
    const showArc = show && (pr.help >= 1 || pr.fraction < 1);
    dots.forEach((d, i) => {
      const k = points.length > 1 ? i / (dots.length - 1) * (points.length - 1) : 0, a = points[Math.floor(k)], b = points[Math.min(points.length - 1, Math.floor(k) + 1)];
      if (!showArc || !a || !b || points.length < 2) { d.visible = false; return; }
      const u = k - Math.floor(k); d.visible = true;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u;
      w(x, z, tmp); d.position.set(tmp.x, y, tmp.z);
      d.material.opacity = 1 - i / dots.length * .55; d.scale.setScalar(.22 * (1 - i / dots.length * .35));
    });
    if (pr && pr.help >= 1 && pr.land) { landRing.visible = true; w(pr.land.x, pr.land.z || 0, tmp); landRing.position.set(tmp.x, .06, tmp.z); landRing.material.color.set(pr.hit ? '#7dffb0' : '#ffd37a'); landRing.scale.setScalar(pr.hit ? 1.25 + Math.sin(performance.now() / 120) * .12 : 1); }
    else landRing.visible = false;
  }
  function placeNet(f, fp) {
    const tool = toolOf(f.tool), R = tool.radius, open = smooth((fp.t / Math.max(.3, f.duration)) * 1.8);
    w(fp.x, fp.z, tmp); projectile.visible = true; projectile.position.set(tmp.x, fp.y, tmp.z);
    const isRope = f.tool === 'rope';
    net.visible = !isRope; loop.visible = isRope; knot.visible = !isRope;
    if (isRope) { loop.scale.setScalar(.2 + R * open * 1.1); loop.rotation.y = yaw0 + Math.PI / 2; loop.rotation.x = Math.atan2(fp.vy, fp.vx); }
    else { const s = .13 + R * 1.05 * open; net.scale.set(s, s * .95, s); net.rotation.x += .1; net.rotation.y += .13; }
    trailPts.push(new T.Vector3(tmp.x, fp.y, tmp.z)); if (trailPts.length > 18) trailPts.shift();
    const pos = trail.geometry.attributes.position; for (let i = 0; i < 18; i++) { const p = trailPts[Math.max(0, trailPts.length - 18 + i)] || trailPts[0]; pos.setXYZ(i, p.x, p.y, p.z); } pos.needsUpdate = true; trail.visible = !isRope;
  }
  function endFlight() { projectile.visible = false; trail.visible = false; trailPts.length = 0; }

  const api = {
    get mode() { return mode; }, frame, yaw0,
    bind(next) { engine = next; },
    enter() {
      mode = 'aim'; rig.visible = true; officer.root.visible = false; cam.blend = 0; cam.from = camera.position.clone(); cam.fromLook = cam.from.clone().add(camera.getWorldDirection(tmpV).multiplyScalar(10)); cam.fromFov = camera.fov;
      placeActor(officer, 0, 0); thief.root.visible = true; for (const l of leaves) l.life = 0;
    },
    leave() { mode = 'idle'; rig.visible = false; officer.root.visible = true; sight.visible = false; dots.forEach(d => { d.visible = false; }); landRing.visible = false; endFlight(); },
    /** How far the thief is, in metres, for the HUD label. */
    thiefDistance() { const c = engine.criminalAt(engine.clock); return Math.hypot(c.x, c.z); },
    /** World point of the sight pin (null when there is none). */
    sightWorld() { if (!sightLocal) return null; w(sightLocal.x, sightLocal.z, tmp); return {x: tmp.x, y: sightLocal.y, z: tmp.z}; },
    /** The HUD tells the stage how far the string is drawn (0..1) and the hold sway it applied. */
    setDraw(k, sway) { cam.draw = clamp(k, 0, 1); if (sway) cam.holdSway = sway; },
    handle(events) {
      for (const e of events) {
        const s = engine.state, idx = Math.min(s.crimIndex, thieves.length - 1), th = thieves[idx];
        if (e.type === 'release') { cam.kick = .9; }
        else if (e.type === 'launch') { trailPts.length = 0; }
        else if (e.type === 'catch') {
          const f = s.flight, cx = f.catchX ?? e.x, nm = caughtNets[idx];
          nm.visible = true; nm.material.opacity = 1; nm.userData.t = 0; nm.userData.fade = 0; th.stagger = 0;
          w(e.x, e.z || 0, tmp); sparks.emit(tmp.x, e.y, tmp.z, e.perfect ? 46 : 26, {speed: 5, up: 4, color: e.perfect ? [1, .85, .3] : [.7, .9, 1], gravity: 5, life: 1.2});
          w(cx, (e.z || 0) + .3, tmp); flash.visible = true; flash.position.set(tmp.x, 1.3, tmp.z); flash.userData.t = 0; flash.scale.setScalar(.5);
          cam.shake = (cam.shake || 0) + (e.perfect ? .9 : .55); endFlight();
        } else if (e.type === 'bossHit') { caughtNets[idx].userData.fade = .001; th.stagger = .001; cam.shake = (cam.shake || 0) + .5; sparks.emit(th.actor.root.position.x, 1.2, th.actor.root.position.z, 20, {speed: 5, up: 3, color: [1, .6, .3], life: .8}); }
        else if (e.type === 'blocked') { w(e.x, e.z || 0, tmp); sparks.emit(tmp.x, e.y, tmp.z, 14, {speed: 3, up: 2.5, color: [1, .9, .7], life: .6}); dust.emit(tmp.x, e.y, tmp.z, 8, {speed: 1.5, up: 1.2, color: [.7, .65, .55], gravity: 1}); endFlight(); groundNet.visible = false; }
        else if (e.type === 'miss' || e.type === 'hidden') {
          w(e.x, e.z || 0, tmp); dust.emit(tmp.x, .1, tmp.z, 14, {speed: 2.4, up: 1.6, color: [.75, .68, .55], gravity: 2}); groundNet.visible = true; groundNet.position.set(tmp.x, .05, tmp.z);
          const R = toolOf(s.flight.tool).radius; groundNet.scale.setScalar(Math.max(.5, R * 1.1)); groundTimer = 1.4; endFlight();
          if (e.near && e.kind !== 'hidden') th.dodge = .001;
        }
        else if (e.type === 'crew') { const n = thieves[e.index]; if (n) { n.actor.root.visible = true; n.arrive = 0; n.fromX = e.x + 9; } }
        else if (e.type === 'turn') { groundNet.visible = false; if (!e.crew) for (let i = 0; i < caughtNets.length; i++) if (i >= s.crimIndex) caughtNets[i].visible = false; }
        else if (e.type === 'flee' || e.type === 'escape') { groundNet.visible = false; if (e.type === 'escape') escapeCarStart = null; }
      }
    },
    update(dt, snap = {}) {
      const s = engine.state, phase = s.phase, tn = engine.clock, cur = Math.min(s.crimIndex, thieves.length - 1);
      // thieves
      thieves.forEach((th, i) => {
        const a = th.actor, nm = caughtNets[i];
        if (i < s.crimIndex) { a.root.visible = true; placeActor(a, s.caught[i].x, s.caught[i].z || 0, Math.PI); a.state.mode = 'caught'; a.update(dt); return; }
        if (i > cur) { a.root.visible = false; return; }
        const c = engine.criminalAt(tn); let px = c.x;
        if (th.arrive !== undefined && th.arrive < 1) { th.arrive = Math.min(1, th.arrive + dt / 1.2); px = th.fromX + (c.x - th.fromX) * smooth(th.arrive); }
        const vx = (px - (th.lastX ?? px)) / Math.max(1e-4, dt); th.lastX = px;
        th.dodge = th.dodge > 0 ? th.dodge + dt : 0; if (th.dodge > .9) th.dodge = 0;
        th.stagger = th.stagger > 0 ? th.stagger + dt : 0; if (th.stagger > 1.1) th.stagger = 0;
        const hop = th.dodge > 0 ? Math.sin(th.dodge / .9 * Math.PI) * .55 : 0;
        const vz = (c.z - (th.lastZ ?? c.z)) / Math.max(1e-4, dt); th.lastZ = c.z;
        const away = phase === 'flee' || phase === 'escape';
        a.state.speed = Math.hypot(vx, vz);
        placeActor(a, px, c.z, away ? 0 : Math.PI + clamp(vz * .12, -.9, .9));
        a.root.position.y = damp(a.root.position.y, c.y, 9, dt) + (hop - (th.hopPrev || 0)); th.hopPrev = hop;
        const won = phase === 'caught' || (phase === 'done' && s.won);
        a.state.mode = won ? 'caught' : th.stagger > 0 ? 'caught' : th.dodge > 0 ? 'caught' : c.mode === 'gone' ? 'run' : c.mode;
        const t0 = won || nm.visible ? nm.userData.t : 9;
        a.root.rotation.z = (won || (nm.visible && !nm.userData.fade)) ? -.55 * Math.exp(-Math.max(0, t0 - .1) * 3.2) * smooth(t0 / .12) : th.stagger > 0 ? -.35 * Math.sin(th.stagger / 1.1 * Math.PI) : 0;
        if (phase === 'escape' && c.mode === 'gone' && i === cur) a.root.visible = false; else a.root.visible = true;
        a.update(dt); th.shadow.visible = c.exposed || phase === 'caught';
      });
      // the officer is unseen in first person; she still animates for the fallback of other cameras
      officer.state.mode = phase === 'done' ? (s.won ? 'cheer' : 'dismay') : phase === 'caught' ? 'cheer' : 'aim'; officer.update(dt);
      // projectile and preview
      const f = s.flight;
      if (phase === 'flight' && f) { const fp = flightPoint(f); snap.flightPoint = fp; placeNet(f, fp); } else if (phase !== 'throw') { if (phase !== 'impact') endFlight(); }
      drawPreview(phase === 'aim' && !snap.hidePreview);
      caughtNets.forEach((nm, i) => {
        if (!nm.visible) return;
        const th = thieves[i], R = toolOf(f?.tool || engine.tools[0].id).radius;
        nm.userData.t += dt; const k = smooth(nm.userData.t / .35);
        if (nm.userData.fade) { nm.userData.fade += dt; nm.material.opacity = Math.max(0, 1 - nm.userData.fade / .6); nm.userData.scale = 1 + nm.userData.fade * 1.6; if (nm.userData.fade > .6) { nm.visible = false; return; } }
        nm.position.set(th.actor.root.position.x, 1.0, th.actor.root.position.z);
        const sc = nm.userData.scale || 1; nm.scale.set((.2 + (.62 + R * .5) * k) * sc, (.25 + (1.05 + R * .35) * k) * sc, (.2 + (.62 + R * .5) * k) * sc);
      });
      if (flash.visible) { flash.userData.t += dt; const k = flash.userData.t / .55; flash.scale.setScalar(.5 + k * 5.5); flash.material.opacity = Math.max(0, 1 - k); if (k >= 1) flash.visible = false; }
      if (groundNet.visible) { groundTimer -= dt; groundNet.material.opacity = clamp(groundTimer / .6, 0, 1); if (groundTimer <= 0) groundNet.visible = false; }
      // wind leaves
      const wind = engine.wind;
      for (const l of leaves) {
        if (l.life <= 0) { if (Math.abs(wind) > .05 && Math.random() < .04) { l.x = 3 + Math.random() * (engine.level.dist + 4); l.z = -Math.sign(wind) * (4 + Math.random() * 2); l.y = .3 + Math.random() * 2; l.life = 3 + Math.random() * 2; l.s.visible = true; } continue; }
        l.life -= dt; l.z += wind * 1.6 * dt; l.y += Math.sin(l.life * 5) * .4 * dt; w(l.x, l.z, tmp); l.s.position.set(tmp.x, l.y, tmp.z); l.s.material.rotation += dt * 3; if (l.life <= 0 || Math.abs(l.z) > 7) { l.life = 0; l.s.visible = false; }
      }
      // camera: first person; the aim turns the head, drawing zooms in, a release kicks
      const a = engine.aimNow();
      const drawn = phase === 'aim' ? cam.draw : 0;
      cam.yawT = -(a.yaw || 0); cam.pitchT = BOW.pitchBase + clamp((a.angle - 20) * .25, -6, 10);
      cam.yaw = damp(cam.yaw, cam.yawT, 12, dt); cam.pitch = damp(cam.pitch, cam.pitchT, 10, dt);
      // far targets get a longer lens so the thief stays readable (44 degrees at 14 m, 30 at 32 m), the draw zooms a little more
      const dist = Math.max(1, Math.hypot(engine.criminalAt(tn).x, engine.criminalAt(tn).z)), fovFar = clamp(44 - (dist - 14) * (14 / 18), 30, 44);
      cam.fov = damp(cam.fov, lerp(fovFar, fovFar - 8, drawn), 8, dt);
      cam.kick = Math.max(0, (cam.kick || 0) - dt * 3); cam.shake = Math.max(0, (cam.shake || 0) - dt * 2.2);
      const sh = cam.shake * cam.shake * .5, ts = performance.now() / 1000;
      w(BOW.eyeX, 0, tmp); eye.set(tmp.x, BOW.eyeY + Math.cos(ts * 53) * sh * .2, tmp.z);
      const yawW = yaw0 + cam.yaw * Math.PI / 180 + Math.sin(ts * 47) * sh * .01, pitch = (cam.pitch - cam.kick * 3) * Math.PI / 180;
      look.set(eye.x + Math.cos(yawW) * Math.cos(pitch) * 10, eye.y + Math.sin(pitch) * 10, eye.z - Math.sin(yawW) * Math.cos(pitch) * 10);
      let fov = cam.fov;
      if (cam.from && cam.from.distanceTo(eye) > 25) cam.from = null; // a cut, not a glide, when the chase camera is far away (tests that skip the chase)
      if (cam.from && cam.blend < 1) { cam.blend = Math.min(1, cam.blend + dt / BOW.blendSeconds); const k = smooth(cam.blend); eye.lerpVectors(cam.from, eye, k); look.lerpVectors(cam.fromLook, look, k); fov = lerp(cam.fromFov, fov, k); if (cam.blend >= 1) cam.from = null; }
      camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix();
      // the launcher draws back and dips while the string is pulled, then springs forward on release
      launcher.position.z = -.75 + drawn * .16 + cam.kick * -.08; launcher.position.y = -.28 - drawn * .03 + Math.sin(ts * 1.7) * .004; launcher.rotation.x = .02 + drawn * .05 - cam.kick * .12;
      loadedNet.visible = phase === 'aim' || phase === 'throw' || phase === 'rearm' || phase === 'flee';
    },
    debugCam() { return {blend: cam.blend, from: cam.from ? cam.from.toArray() : null, eye: eye.toArray(), look: look.toArray(), fov: camera.fov, mode}; },
    project(x, y, z = 0) { w(x, z, tmp); tmpV.set(tmp.x, y, tmp.z).project(camera); return {x: tmpV.x, y: tmpV.y, visible: tmpV.z < 1}; },
    dispose() { camera.remove(rig); for (const o of [projectile, trail, landRing, sight, flash, groundNet, ...dots, ...caughtNets, ...leaves.map(l => l.s)]) scene.remove(o); },
  };
  return api;
}
