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
  // A chunky cartoon net launcher: receiver, barrel, bell muzzle with the wound net, pistol grip and fore-grip, a strap,
  // two gloved hands in the uniform's blue. Lower right of the screen, the muzzle never reaches the sight at the centre.
  const rig = new T.Group(); camera.add(rig);
  const launcher = new T.Group(); rig.add(launcher);
  const metal = mat('#3a4150', {metalness: .55, roughness: .4}), navy = mat('#223a6b', {roughness: .6}), brass = mat('#d9b44a', {metalness: .65, roughness: .3}), rubber = mat('#1c1f27', {roughness: .95});
  const body = new T.Mesh(new T.BoxGeometry(.11, .13, .4, 1, 1, 1), navy); body.position.set(0, -.01, -.06); launcher.add(body);
  const bodyTop = new T.Mesh(new T.CylinderGeometry(.055, .055, .4, 12, 1, false, 0, Math.PI), navy); bodyTop.rotation.x = Math.PI / 2; bodyTop.rotation.z = Math.PI; bodyTop.position.set(0, .055, -.06); launcher.add(bodyTop);
  const stripe = new T.Mesh(new T.BoxGeometry(.114, .03, .3), mat('#f2f4f8', {roughness: .6})); stripe.position.set(0, -.02, -.06); launcher.add(stripe);
  const tube = new T.Mesh(new T.CylinderGeometry(.045, .05, .5, 14), metal); tube.rotation.x = Math.PI / 2; tube.position.set(0, .01, -.48); launcher.add(tube);
  const band = new T.Mesh(new T.TorusGeometry(.052, .012, 8, 18), brass); band.position.set(0, .01, -.3); launcher.add(band);
  const muzzle = new T.Mesh(new T.CylinderGeometry(.095, .065, .14, 16, 1, true), metal); muzzle.rotation.x = -Math.PI / 2; muzzle.position.set(0, .01, -.76); launcher.add(muzzle);
  const muzzleRing = new T.Mesh(new T.TorusGeometry(.095, .014, 8, 20), brass); muzzleRing.position.set(0, .01, -.83); launcher.add(muzzleRing);
  const netTex = netTexture();
  const loadedNet = new T.Group(); loadedNet.position.set(0, .01, -.86); launcher.add(loadedNet);
  const netCore = new T.Mesh(new T.SphereGeometry(.072, 12, 10), mat('#f08c1c', {roughness: .8})); loadedNet.add(netCore);
  const netWrap = new T.Mesh(new T.SphereGeometry(.082, 14, 10), new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, color: '#f6f9ff', side: T.DoubleSide})); loadedNet.add(netWrap);
  const rail = new T.Mesh(new T.BoxGeometry(.03, .025, .22), metal); rail.position.set(0, .085, -.1); launcher.add(rail);
  const bead = new T.Mesh(new T.SphereGeometry(.012, 8, 6), brass); bead.position.set(0, .07, -.7); launcher.add(bead);
  const grip = new T.Mesh(new T.BoxGeometry(.05, .15, .07), rubber); grip.position.set(0, -.12, .04); grip.rotation.x = .3; launcher.add(grip);
  const foreGrip = new T.Mesh(new T.BoxGeometry(.045, .1, .06), rubber); foreGrip.position.set(0, -.06, -.42); foreGrip.rotation.x = .15; launcher.add(foreGrip);
  const strapCurve = new T.CatmullRomCurve3([new T.Vector3(.02, -.06, .16), new T.Vector3(.1, -.3, .14), new T.Vector3(.16, -.5, -.02), new T.Vector3(.14, -.62, -.34), new T.Vector3(.02, -.2, -.5)]);
  const strap = new T.Mesh(new T.TubeGeometry(strapCurve, 24, .014, 6, false), mat('#8a6a3c', {roughness: .9})); launcher.add(strap);
  const glove = mat('#2b4c9c', {roughness: .7}), cuffMat = mat('#1a2d5c', {roughness: .7});
  /** A gloved hand: palm, four curled fingers and a thumb around a grip, a cuff with a gold stripe, the sleeve leading out of the frame. */
  const hand = (x, y, z, {curl = 1, armDir = [.3, -1, .5], scale = 1} = {}) => {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(scale);
    const palm = new T.Mesh(new T.SphereGeometry(.052, 12, 10), glove); palm.scale.set(1.05, .75, 1.3); g.add(palm);
    for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.CapsuleGeometry(.014, .05, 3, 8), glove); f.position.set(-.012 + i * .016, .03 + curl * .01, .02 - i * .003); f.rotation.x = -.9 * curl; f.rotation.z = (i - 1.5) * .06; g.add(f); }
    const thumb = new T.Mesh(new T.CapsuleGeometry(.015, .04, 3, 8), glove); thumb.position.set(-.045, .02, -.01); thumb.rotation.z = .9; thumb.rotation.x = -.4; g.add(thumb);
    const cuff = new T.Mesh(new T.CylinderGeometry(.056, .06, .05, 12), cuffMat), stripe = new T.Mesh(new T.CylinderGeometry(.061, .061, .012, 12), brass);
    const arm = new T.Mesh(new T.CylinderGeometry(.058, .07, .5, 12), mat('#2f4f9a', {roughness: .7}));
    const dir = new T.Vector3(...armDir).normalize();
    for (const [m, d] of [[cuff, .07], [stripe, .095], [arm, .36]]) { m.position.copy(dir).multiplyScalar(d); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().negate()); g.add(m); }
    return g;
  };
  launcher.add(hand(.005, -.15, .05, {armDir: [.45, -1, .55]}), hand(-.01, -.1, -.42, {armDir: [-.55, -1, .35], scale: .95}));
  const LAUNCHER_AT = {x: .3, y: -.3, z: -.62, rx: .02, ry: -.1, rz: .08, scale: 1};
  launcher.position.set(LAUNCHER_AT.x, LAUNCHER_AT.y, LAUNCHER_AT.z); launcher.rotation.set(LAUNCHER_AT.rx, LAUNCHER_AT.ry, LAUNCHER_AT.rz);
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

  // ----- feedback: target-ring bursts on a catch, a dust ring on a miss, a halo on the thief under the sight, wind flags -----
  const ringGeo = new T.RingGeometry(.72, .9, 40);
  const bursts = Array.from({length: 3}, (_, i) => { const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: T.DoubleSide, fog: false})); m.renderOrder = 11; m.visible = false; m.userData = {t: 0, delay: i * .09, gold: false}; scene.add(m); return m; });
  const missRing = new T.Mesh(new T.RingGeometry(.6, .78, 32), new T.MeshBasicMaterial({color: '#c9a86a', transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide})); missRing.rotation.x = -Math.PI / 2; missRing.visible = false; missRing.userData = {t: 9}; scene.add(missRing);
  const halo = new T.Sprite(new T.SpriteMaterial({map: glowTexture('#9fe4ff'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0, fog: false})); halo.renderOrder = 7; halo.scale.set(2.6, 3.2, 1); halo.visible = false; scene.add(halo);
  /** A streamer flag on a pole at the sidewalk: hangs limp in calm air, stands out and flutters with the wind, towards where it blows. */
  const flagMat = mat('#ff7a2a', {side: T.DoubleSide, roughness: .8}), flagGeo = new T.PlaneGeometry(.9, .24, 6, 1); flagGeo.translate(.45, 0, 0);
  const flags = [[-1.5, 5.3], [3.5, -5.3]].map(([dx, z]) => {
    const g = new T.Group(); const pole = new T.Mesh(new T.CylinderGeometry(.03, .035, 3.4, 8), metal); pole.position.y = 1.7; g.add(pole);
    const knob = new T.Mesh(new T.SphereGeometry(.06, 8, 6), brass); knob.position.y = 3.42; g.add(knob);
    const pivot = new T.Group(); pivot.position.y = 3.25; g.add(pivot); const cloth = new T.Mesh(flagGeo, flagMat); pivot.add(cloth);
    g.visible = false; scene.add(g); return {g, pivot, cloth, dx, z, phase: Math.random() * 6};
  });
  const flagPos = flagGeo.attributes.position, flagRest = flagPos.array.slice();

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
    if (show) { const full = engine.trajectory(engine.aimNow().angle, engine.aimNow().power, engine.aim.tool, {withWind: false, yaw: engine.aimNow().yaw, stopAtObstacle: false}); const at = full.path.find(p => p.x >= c.x) || full.path[full.path.length - 1]; sightLocal = {x: at.x, y: Math.max(.05, at.y), z: at.z || 0}; w(sightLocal.x, sightLocal.z, tmp); sight.position.set(tmp.x, sightLocal.y, tmp.z); sight.scale.setScalar(.12 + Math.abs(c.x) * .03); sight.visible = false; } // the HUD's .catch-bow-sight is the one sight; the sprite only keeps the point
    else sight.visible = false;
    const showArc = show && (pr.help >= 1 || pr.fraction < 1);
    dots.forEach((d, i) => {
      const k = points.length > 1 ? i / (dots.length - 1) * (points.length - 1) : 0, a = points[Math.floor(k)], b = points[Math.min(points.length - 1, Math.floor(k) + 1)];
      if (!showArc || !a || !b || points.length < 2) { d.visible = false; return; }
      const u = k - Math.floor(k);
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u;
      w(x, z, tmp); d.position.set(tmp.x, y, tmp.z);
      // a dotted line of the same thickness all the way (scaled by the distance from the eye), faint near the muzzle so it never blocks the view
      const dc = d.position.distanceTo(camera.position); d.visible = i >= 3; d.scale.setScalar(.012 * dc + .03); d.material.opacity = clamp((dc - 2) / 6, .15, .85);
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
      for (const fl of flags) { fl.g.visible = true; w(engine.level.dist + fl.dx, fl.z, tmp); fl.g.position.set(tmp.x, .16, tmp.z); fl.g.rotation.y = yaw0; }
    },
    leave() { mode = 'idle'; rig.visible = false; officer.root.visible = true; sight.visible = false; dots.forEach(d => { d.visible = false; }); landRing.visible = false; halo.visible = false; for (const fl of flags) fl.g.visible = false; for (const b of bursts) b.visible = false; missRing.visible = false; endFlight(); },
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
          w(cx, (e.z || 0), tmp); for (const b of bursts) { b.visible = true; b.userData.t = 0; b.userData.gold = Boolean(e.perfect); b.position.set(tmp.x, e.perfect ? 1.55 : 1.05, tmp.z); b.material.color.set(e.perfect ? '#ffd25e' : '#9fe4ff'); }
        } else if (e.type === 'bossHit') { caughtNets[idx].userData.fade = .001; th.stagger = .001; cam.shake = (cam.shake || 0) + .5; sparks.emit(th.actor.root.position.x, 1.2, th.actor.root.position.z, 20, {speed: 5, up: 3, color: [1, .6, .3], life: .8}); }
        else if (e.type === 'blocked') { w(e.x, e.z || 0, tmp); sparks.emit(tmp.x, e.y, tmp.z, 14, {speed: 3, up: 2.5, color: [1, .9, .7], life: .6}); dust.emit(tmp.x, e.y, tmp.z, 8, {speed: 1.5, up: 1.2, color: [.7, .65, .55], gravity: 1}); endFlight(); groundNet.visible = false; }
        else if (e.type === 'miss' || e.type === 'hidden') {
          w(e.x, e.z || 0, tmp); dust.emit(tmp.x, .1, tmp.z, 14, {speed: 2.4, up: 1.6, color: [.75, .68, .55], gravity: 2}); groundNet.visible = true; groundNet.position.set(tmp.x, .05, tmp.z);
          const R = toolOf(s.flight.tool).radius; groundNet.scale.setScalar(Math.max(.5, R * 1.1)); groundTimer = 1.4; endFlight();
          missRing.visible = true; missRing.userData.t = 0; missRing.position.set(tmp.x, .07, tmp.z);
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
      // target-ring bursts face the camera and grow outwards, gold for a head hit
      for (const b of bursts) {
        if (!b.visible) continue; b.userData.t += dt; const u = (b.userData.t - b.userData.delay) / .75;
        if (u < 0) { b.material.opacity = 0; continue; } if (u >= 1) { b.visible = false; continue; }
        b.scale.setScalar((.25 + u * (b.userData.gold ? 2.6 : 2)) * (1 + b.userData.delay * 2)); b.material.opacity = (1 - u) * .9; b.lookAt(camera.position);
      }
      if (missRing.visible) { missRing.userData.t += dt; const u = missRing.userData.t / .7; if (u >= 1) missRing.visible = false; else { missRing.scale.setScalar(.4 + u * 2.4); missRing.material.opacity = (1 - u) * .7; } }
      // a soft halo on the thief while the sight is close to him (helps at 24 to 32 m)
      { const c = engine.criminalAt(tn), near = sightLocal && phase === 'aim' ? clamp(1 - Math.hypot((sightLocal.z - c.z) / 1.6, (sightLocal.y - 1.1) / 1.4), 0, 1) : 0;
        halo.material.opacity = damp(halo.material.opacity, near * .4, 8, dt); halo.visible = halo.material.opacity > .02; if (halo.visible) { const th = thieves[cur].actor.root; halo.position.set(th.position.x, 1.05, th.position.z); } }
      // wind flags: the cloth points with the wind, stands out more in a stronger wind, ripples along its length
      for (const fl of flags) {
        if (!fl.g.visible) continue; const k = clamp(Math.abs(wind) / 1.6, 0, 1); fl.phase += dt * (3 + k * 7);
        fl.pivot.rotation.y = (wind >= 0 ? -Math.PI / 2 : Math.PI / 2) + Math.sin(fl.phase * .7) * .12 * k; fl.pivot.rotation.z = -(1 - k) * 1.25 + Math.sin(fl.phase) * .06 * k;
        for (let i = 0; i < flagPos.count; i++) { const x = flagRest[i * 3]; flagPos.setZ(i, Math.sin(fl.phase * 1.3 + x * 7) * .06 * k * (x / .9)); } flagPos.needsUpdate = true;
      }
      // camera: first person; the aim turns the head, drawing zooms in, a release kicks
      const a = engine.aimNow();
      const drawn = phase === 'aim' ? cam.draw : 0;
      cam.yawT = -(a.yaw || 0); cam.pitchT = BOW.pitchBase + clamp((a.angle - 20) * .25, -6, 10);
      cam.yaw = damp(cam.yaw, cam.yawT, 12, dt); cam.pitch = damp(cam.pitch, cam.pitchT, 10, dt);
      // far targets get a longer lens so the thief stays readable (44 degrees at 14 m, 30 at 32 m), the draw zooms a little more
      const dist = Math.max(1, Math.hypot(engine.criminalAt(tn).x, engine.criminalAt(tn).z)), fovFar = clamp(44 - (dist - 14) * (16 / 18), 28, 44);
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
      // the launcher draws back and tilts up 5 degrees while the string is pulled, kicks up and back on release, and breathes a little
      launcher.position.z = LAUNCHER_AT.z + drawn * .14 + cam.kick * .1; launcher.position.y = LAUNCHER_AT.y - drawn * .02 + Math.sin(ts * 1.7) * .004 + cam.kick * .02; launcher.position.x = LAUNCHER_AT.x + Math.sin(ts * 1.1) * .003;
      launcher.rotation.x = LAUNCHER_AT.rx + drawn * .09 + cam.kick * .16; launcher.rotation.y = LAUNCHER_AT.ry + drawn * .03; launcher.rotation.z = LAUNCHER_AT.rz; launcher.scale.setScalar(LAUNCHER_AT.scale);
      loadedNet.visible = phase === 'aim' || phase === 'throw' || phase === 'rearm' || phase === 'flee'; loadedNet.scale.setScalar(1 + drawn * .18); netWrap.rotation.y += dt * .6;
    },
    /** Tuning hook for the harness: where the launcher sits in the camera's frame. */
    launcherAt(next) { Object.assign(LAUNCHER_AT, next); return {...LAUNCHER_AT}; },
    debugCam() { return {blend: cam.blend, from: cam.from ? cam.from.toArray() : null, eye: eye.toArray(), look: look.toArray(), fov: camera.fov, mode}; },
    project(x, y, z = 0) { w(x, z, tmp); tmpV.set(tmp.x, y, tmp.z).project(camera); return {x: tmpV.x, y: tmpV.y, visible: tmpV.z < 1}; },
    dispose() { camera.remove(rig); for (const o of [projectile, trail, landRing, sight, flash, groundNet, halo, missRing, ...bursts, ...flags.map(f => f.g), ...dots, ...caughtNets, ...leaves.map(l => l.s)]) scene.remove(o); },
  };
  return api;
}
