// CC0-1.0. Motion check of athlete-body-v3 against the body it replaces (v22), in Chromium (software WebGL).
// Every clip of every library (475 per body: soccer v9..v12, hoops tall v12, hoops v11) is played on the v3 body and on the v22 body, same root height, `samples` times per clip.
// Per sample, over the vertices that follow the feet (dominant joint Foot or Leg below the knee):
//   - continuity: every skinned vertex and every bone quaternion is finite (a NaN or a collapsed matrix fails the run);
//   - floor: the lowest foot vertex of v3 against the lowest of v22 (v3 below v22 by more than 1 cm = penetration), and against the floor itself;
//   - slide: when both bodies' lowest vertex is within 3 cm of the floor, the horizontal distance between those two vertices (v22 is the reference: same bones, so the contact point must not travel).
// Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/design/athlete-body-v3/tools/check.mjs <out.json> [samples=5] [bodies=soccer,guard,wing,center]
//        static server on the repository root: python3 -m http.server 8791
import {writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT || 'playwright');
const out = process.argv[2] || 'check.json';
const samples = Number(process.argv[3] || 5);
const bodies = (process.argv[4] || 'soccer,guard,wing,center').split(',');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:8791';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 600, height: 400}});
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(origin + '/workout/island/design/athlete-body-v3/preview.html');
await page.waitForFunction(() => window.previewReady, null, {timeout: 120000});
const result = await page.evaluate(async ({samples, bodies}) => {
  const T = window.v3Preview.THREE;
  const {GLTFLoader} = await import('../../vendor/GLTFLoader.js');
  const {clone} = await import('../../vendor/SkeletonUtils.js');
  const v3 = await import('../../minigames/athlete-body-v3.mjs?v=island-v2-20261107-25');
  const v22 = await import('../../minigames/athlete-body-v22.mjs?v=island-v2-20261107-25');
  const loader = new GLTFLoader(), load = url => loader.loadAsync(url);
  const src3 = window.v3Preview.source, src22 = await v22.loadAthleteV22(load, {T, bodies});
  const clips = window.v3Preview.clips;
  const kit = {primary: '#1f5fbf', secondary: '#ffd35c', shorts: '#14305f', shortsTrim: '#ffd35c', socks: '#1f5fbf', boots: '#1b1d22'};
  const report = {};
  const footVerts = (mesh) => {
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, pos = mesh.geometry.attributes.position, names = mesh.skeleton.bones.map(b => b.name), list = [];
    for (let i = 0; i < pos.count; i++) {
      let best = -1, j = -1; for (let k = 0; k < 4; k++) { const w = [sw.getX, sw.getY, sw.getZ, sw.getW][k].call(sw, i); if (w > best) { best = w; j = [si.getX, si.getY, si.getZ, si.getW][k].call(si, i); } }
      if (/Foot$/.test(names[j]) || (/Leg$/.test(names[j]) && !/UpLeg$/.test(names[j]) && pos.getY(i) < 0.25)) list.push({i, side: pos.getX(i) > 0 ? 0 : 1});
    }
    return list;
  };
  for (const id of bodies) {
    const sport = id === 'soccer' ? 'soccer' : 'basketball', height = v22.V22_BODIES[id].height;
    const mk = (src, create) => { const inst = create(T, src, {bodyId: id, cloneRig: clone, appearance: {skin: '#bd8058', hairStyle: 'crop'}, kit, style: sport, height}); const mesh = inst.meshes.full.find(o => o.isSkinnedMesh && !o.userData.v22Hair); const mixer = new T.AnimationMixer(inst.root); return {inst, mesh, mixer, feet: footVerts(mesh)}; };
    const a = mk(src3, v3.createAthleteV3Instance), b = mk(src22, v22.createAthleteV22Instance);
    const v = new T.Vector3(), w = new T.Vector3();
    let n = 0, nonFinite = 0, below = 0, worstBelow = 0, worstAbs = 0, worstAbs22 = 0, slideOver = 0, slideN = 0, slideMax = 0, slideSum = 0, contactN = 0;
    const lowest = (s, side) => { let y = Infinity, x = 0, z = 0; for (const {i, side: sd} of s.feet) { if (sd !== side) continue; s.mesh.getVertexPosition(i, v); if (!Number.isFinite(v.x + v.y + v.z)) { nonFinite++; continue; } if (v.y < y) { y = v.y; x = v.x; z = v.z; } } return {y, x, z}; };
    for (const [cid, clip] of clips) {
      const lib = cid.split('/')[0], parts = cid.split('/');
      if (lib === 'hoops-tall-v12' && parts[1] !== id) continue;
      if (lib === 'hoops-v11' && !cid.includes('/' + id + '/') && !(id === 'guard' || id === 'wing' || id === 'center')) continue;
      if (id === 'soccer' && lib.startsWith('hoops')) continue;
      if (id !== 'soccer' && lib.startsWith('soccer')) continue;
      for (const s of [a, b]) { s.mixer.stopAllAction(); const act = s.mixer.clipAction(clip); act.setLoop(T.LoopOnce, 1); act.clampWhenFinished = true; act.play(); }
      for (let f = 0; f < samples; f++) {
        const t = clip.duration * f / Math.max(1, samples - 1);
        for (const s of [a, b]) { s.mixer.setTime ? s.mixer.setTime(t) : null; s.mixer._actions.forEach(x => x.time = t); s.mixer.update(0); s.inst.root.updateMatrixWorld(true); s.mesh.skeleton.update(); }
        for (const bone of a.mesh.skeleton.bones) if (!Number.isFinite(bone.quaternion.x + bone.position.y)) nonFinite++;
        n++;
        for (const side of [0, 1]) {
          const A = lowest(a, side), B = lowest(b, side);
          const d = B.y - A.y;                   // > 0: v3 lower than v22, same foot
          if (d > 0.01) { below++; worstBelow = Math.max(worstBelow, d); }
          worstAbs = Math.max(worstAbs, -A.y); worstAbs22 = Math.max(worstAbs22, -B.y);
          if (A.y < 0.03 && B.y < 0.03) { contactN++; const sl = Math.hypot(A.x - B.x, A.z - B.z); slideMax = Math.max(slideMax, sl); slideSum += sl; if (sl > 0.03) slideOver++; }
        }
      }
    }
    report[id] = {samples: n, nonFinite, v3BelowV22By1cm_perFoot: below, worstBelowV22: +worstBelow.toFixed(4), lowestBelowFloorM: +Math.max(0, worstAbs).toFixed(4), v22LowestBelowFloorM: +Math.max(0, worstAbs22).toFixed(4), slideOver3cm: slideOver, contactSamples: contactN, slideMaxM: +slideMax.toFixed(4), slideMeanM: +(contactN ? slideSum / contactN : 0).toFixed(4)};
    for (const s of [a, b]) { s.mixer.stopAllAction(); s.inst.dispose(); }
    console.log(id, JSON.stringify(report[id]));
  }
  return report;
}, {samples, bodies});
await writeFile(out, JSON.stringify({generated: new Date().toISOString(), samples, errors, result}, null, 1));
console.log(JSON.stringify(result), JSON.stringify({errors}));
await browser.close();
