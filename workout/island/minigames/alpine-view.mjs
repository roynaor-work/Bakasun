import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js?v=island-alpine-20261029-1';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-alpine-20261029-1';
import {createProRider} from './athlete.mjs';
import {snowMaterial,rockMaterial,createArtWorld} from './alpine-art.mjs';
import {pipeProfile, surfaceHeight, wallAngle} from './alpine-track.mjs?v=island-alpine-20261029-1';

/** Alpine Rush presentation (Codex design package view, rebuilt for the curved halfpipe).
 * Renders a SkiFrame only: positions, collisions, tricks and results belong to the engine.
 * Everything is placed in world space through the course centreline: s along the path,
 * x across the pipe, height above the floor. Version 6 keeps the original collision
 * profile, with procedural snow, 3D fir branches, granite/snow cliffs, a close chase
 * camera and grooves recording engine positions. Mixamo rider attribution is in ASSETS.md.
 * Engine rules are unchanged. This is an art-direction review, not a released build. */
export async function createSkiView(host, {canvas, modelUrl = new URL('../assets/alpine-rush/athlete.glb', import.meta.url).href, quality: initialQuality = 'high', maxDpr = 1.7, lowDpr = 1, isDisposed = () => false, course, physics, visual = {}} = {}) {
  if (!course?.path || !physics) throw new Error('alpine.view.course');
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
  let quality = initialQuality, disposed = false, ro = null;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!canvas) host.append(renderer.domElement);
  const look = {sky: '#85a9b9', fog: '#b5c9d1', fogNear: 85, fogFar: 300, snow: .10, light: 1, trees: 1, ...visual}; look.fog='#b5c9d1';look.fogNear=105;look.fogFar=330;look.snow=.09;
  const dusk = !!look.dusk;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 900);
  const hemi = new THREE.HemisphereLight(dusk ? '#9da3ca' : '#bbd4e4', '#3c5368', 1.25 * look.light); scene.add(hemi);
  const sun = new THREE.DirectionalLight(dusk ? '#f0c5b1' : '#ffe2ba', 2.65 * look.light); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120}); sun.shadow.bias = -.0005; scene.add(sun, sun.target);
  const mat = (c, roughness = .8) => new THREE.MeshStandardMaterial({color: c, roughness});
  const snow=snowMaterial(),ice=mat('#90b5c4',.5),navy=mat('#263f4a'),orange=mat('#c97550'),white=mat('#e4e3d7'),stone=rockMaterial(),green=mat('#254e40'),red=mat('#b65e48',.8),gold=new THREE.MeshStandardMaterial({color:'#f3cb77',emissive:'#9c6f23',emissiveIntensity:.15,roughness:.28,metalness:.55});
  function mesh(geo, material, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  const box = (w, h, d, m, p, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, p, x, y, z);
  const placed = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, s = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(s, s, s)));
  const canvasTexture = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex; };

  scene.background=new THREE.Color(look.fog);
  const granite=await new THREE.TextureLoader().loadAsync(new URL('../assets/alpine-rush/granite-v5.webp',import.meta.url).href);
  granite.colorSpace=THREE.SRGBColorSpace;granite.wrapS=granite.wrapT=THREE.RepeatWrapping;granite.anisotropy=8;stone.userData.granite=granite;
  // ---------- Course frame: centreline position, heading and grade at any s ----------
  const path = course.path, N = path.count, pipe = pipeProfile(physics), DECK = 3, deckEdge = pipe.lip + DECK;
  function frameAt(s, o) {
    let i, f;
    if (s <= 0) { i = 0; f = s; } else if (s >= N - 1) { i = N - 2; f = s - i; } else { i = Math.floor(s); f = s - i; }
    const grade = path.py[i] - path.py[i + 1];
    if (s <= 0 || s >= N - 1) { const th = path.theta[s <= 0 ? 0 : N - 1], base = s <= 0 ? 0 : N - 1, d = s - base; o.theta = th; o.x = path.px[base] + Math.sin(th) * d; o.z = path.pz[base] - Math.cos(th) * d; o.y = path.py[base] - grade * d; }
    else { o.theta = path.theta[i] + (path.theta[i + 1] - path.theta[i]) * f; o.x = path.px[i] + (path.px[i + 1] - path.px[i]) * f; o.z = path.pz[i] + (path.pz[i + 1] - path.pz[i]) * f; o.y = path.py[i] + (path.py[i + 1] - path.py[i]) * f; }
    o.grade = grade; return o;
  }
  const FR = {}, FR2 = {};
  function worldPoint(s, x, y, out) { frameAt(s, FR); return out.set(FR.x + x * Math.cos(FR.theta), FR.y + y, FR.z + x * Math.sin(FR.theta)); }
  /** Positions an object on the course; local -z points downhill, +x across to the right. */
  function place(obj, s, x, y, roll = 0, yaw = 0, pitch = 0) { worldPoint(s, x, y, obj.position); obj.rotation.set(-Math.atan(FR.grade) + pitch, -FR.theta + yaw, roll, 'YXZ'); }

  // ---------- Halfpipe surface: one texture across the profile, stripes run downhill ----------
  const right = [{x: 0, y: 0, nx: 0, ny: 1}, {x: pipe.F * .5, y: 0, nx: 0, ny: 1}, {x: pipe.F, y: 0, nx: 0, ny: 1}];
  for (let k = 1; k <= 14; k++) { const a = pipe.angle * k / 14; right.push({x: pipe.F + pipe.R * Math.sin(a), y: pipe.R * (1 - Math.cos(a)), nx: -Math.sin(a), ny: Math.cos(a)}); }
  right.push({x: pipe.lip, y: pipe.lipHeight, nx: 0, ny: 1}, {x: pipe.lip + .3, y: pipe.lipHeight + .04, nx: 0, ny: 1}, {x: deckEdge, y: pipe.lipHeight, nx: 0, ny: 1});
  const profile = [...right.slice(1).reverse().map(p => ({x: -p.x, y: p.y, nx: -p.nx, ny: p.ny})), ...right];
  let arc = 0; profile.forEach((p, i) => { if (i) arc += Math.hypot(p.x - profile[i - 1].x, p.y - profile[i - 1].y); p.arc = arc; }); profile.forEach(p => { p.u = p.arc / arc; });
  const xAtU = u => { const a = u * arc; for (let i = 1; i < profile.length; i++) if (profile[i].arc >= a) { const p = profile[i - 1], q = profile[i], f = (a - p.arc) / Math.max(1e-6, q.arc - p.arc); return p.x + (q.x - p.x) * f; } return deckEdge; };
  const pipeMat=snow,terrainMat=snow;
  // Side terrain: deck level near the pipe, a bumpy bank, then a long fall away into fog.
  const TX=[0,2,5,10,18,30,50,90],TY=[0,.5,2,6,11,19,9,-35];
  function terrainY(s, ax, side) {
    const d = ax - deckEdge;
    if (d <= 0) return pipe.lipHeight;
    for (let k = 1; k < TX.length; k++) if (d <= TX[k] || k === TX.length - 1) {
      const y0 = terrainAt(s, k - 1, side), y1 = terrainAt(s, k, side), f = Math.min(1, (d - TX[k - 1]) / (TX[k] - TX[k - 1]));
      return y0 + (y1 - y0) * f;
    }
    return pipe.lipHeight;
  }
  function terrainAt(s, k, side) {
    if (k === 0) return pipe.lipHeight;
    const x = TX[k], bump = k < 7 ? 1.5*Math.sin(s*.047+x*.31+side*1.7)+1.8*Math.sin(s*.023+x*.12+side*4.1) : 0;
    return pipe.lipHeight + TY[k] + bump * Math.min(1, k / 2);
  }
  function strip(s0, s1, K, sample, vScale, normals) {
    const rows = Math.round(s1 - s0) + 1, pos = new Float32Array(rows * K * 3), nor = new Float32Array(rows * K * 3), uv = new Float32Array(rows * K * 2), index = [], p = {};
    for (let j = 0; j < rows; j++) {
      const s = s0 + j; frameAt(s, FR2); const c = Math.cos(FR2.theta), sn = Math.sin(FR2.theta);
      for (let k = 0; k < K; k++) {
        sample(s, k, p); const o = (j * K + k) * 3, t = (j * K + k) * 2;
        pos[o] = FR2.x + p.x * c; pos[o + 1] = FR2.y + p.y; pos[o + 2] = FR2.z + p.x * sn;
        nor[o] = p.nx * c; nor[o + 1] = p.ny; nor[o + 2] = p.nx * sn; uv[t] = p.u; uv[t + 1] = s / vScale;
        if (j && k) { const d = j * K + k, b = d - K, a = b - 1, cc = d - 1; index.push(a, b, cc, b, d, cc); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(index);
    if (normals) g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
  const CHUNK = 40, chunks = [], sFirst = -60, sLast = N - 1;
  for (let s0 = sFirst; s0 < sLast; s0 += CHUNK) {
    const s1 = Math.min(sLast, s0 + CHUNK), group = new THREE.Group();
    const surface = mesh(strip(s0, s1, profile.length, (s, k, o) => Object.assign(o, profile[k]), 8, false), pipeMat, group); surface.castShadow = false;
    const sides = [-1, 1].map(side => strip(s0, s1, TX.length, (s, k, o) => { const kk = side < 0 ? TX.length - 1 - k : k; o.x = side * (deckEdge + TX[kk]); o.y = terrainAt(s, kk, side); o.nx = 0; o.ny = 1; o.u = 0; }, 8, true));
    const land = mesh(mergeGeometries(sides), terrainMat, group); land.castShadow = false; sides.forEach(g => g.dispose());

    group.userData = {s0, s1}; scene.add(group); chunks.push(group);
  }
  const art=createArtWorld(scene,{course,deckEdge,terrainY,place,frameAt,snow,stone,dusk});
  const scenery={update(){},dispose(){}};
  const mountains=new THREE.Group(),field=new THREE.Group();
  const treeMeshes=[],flagPole=new THREE.Group(),flagCloth=new THREE.Group();
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), vec = new THREE.Vector3(), vec2 = new THREE.Vector3(), scl = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  function placeScenery(){};
  let seed=92317;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;

  // ---------- Coins: one instanced mesh, spinning ----------
  const COIN_POOL = 90, coinGeo = new THREE.TorusGeometry(.32,.065,8,24);
  const coins = new THREE.InstancedMesh(coinGeo, gold, COIN_POOL); coins.castShadow = true; coins.frustumCulled = false; coins.count = 0; scene.add(coins);

  // ---------- Obstacles: bounded pools per type ----------
  const boostMat = new THREE.MeshStandardMaterial({color:'#a9dbd5',emissive:'#477875',emissiveIntensity:.25,roughness:.55});
  function pad() { const g = new THREE.Group(); box(3.3, .08, 5.5, ice, g, 0, .07, 0); for (let i = 0; i < 3; i++) for (const side of [-1, 1]) { const a = box(1.22, .04, .25, boostMat, g, side * .39, .14, i * 1.25 - 1.5); a.rotation.y = side * .6; } return g; }
  function ramp() { const g = new THREE.Group(), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 3, 2, 0, 3, -2, 1.2, -3, 2, 0, 3, 2, 1.2, -3, -2, 1.2, -3], 3)); geo.computeVertexNormals(); mesh(geo, snow, g); for (const x of [-2, 2]) { const edge = box(.12, .08, 6.12, orange, g, x, .6, 0); edge.rotation.x = .197; } box(4.1, 1.2, .14, navy, g, 0, .6, -3); return g; }
  function gate() {
    // Slalom gate: striped poles, red flag panels and the banner bar riders pass under.
    const g = new THREE.Group(), gw = physics.gateHalfWidth, top = physics.gatePostHeight;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) { const m = mesh(new THREE.CylinderGeometry(.09, .09, top * 1.2 / 5, 8), k % 2 ? white : red, g, side * gw, top * 1.2 * (k + .5) / 5, 0); m.castShadow = true; }
      const cloth = box(.9, 1.15, .03, red, g, side * (gw + .5), top * 1.2 - .62, 0); cloth.castShadow = true;
    }
    box(gw * 2, .5, .12, navy, g, 0, top, 0); box(gw * 2, .08, .14, red, g, 0, top + .29, 0); box(gw * 2, .08, .14, red, g, 0, top - .29, 0);
    return g;
  }
  function rock(){const g=new THREE.Group(),geo=new THREE.SphereGeometry(.7,24,16),p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=1+.10*Math.sin(x*13+z*3)*Math.cos(y*9);p.setXYZ(i,x*n,y*n,z*n);}geo.computeVertexNormals();const r=mesh(geo,stone,g,0,.39,0);r.scale.set(1,.67,1);return g;}
  const makers = {rock, gate, boost: pad, ramp}, pools = {rock: [], gate: [], boost: [], ramp: []};
  function prop(type, used) { const list = pools[type], i = used[type]++; if (!list[i]) { const g = makers[type](); scene.add(g); list.push(g); } list[i].visible = true; return list[i]; }
  function textTexture(label, bg = '#ff643b', fg = '#ffffff') {
    return canvasTexture(1024, 96, (ctx, w, h) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = fg; ctx.font = '900 64px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, w / 2, h / 2 + 3); ctx.fillStyle = '#ff643b'; ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8); });
  }
  // Finish arch and chequered line, built once at the finish.
  const finish = new THREE.Group(); {
    const half = pipe.lip + .9;
    for (const x of [-half, half]) box(.55, 6.2, .55, navy, finish, x, pipe.lipHeight + 3.1, 0);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + .6, 1.3, .22), new THREE.MeshStandardMaterial({map: textTexture('FINISH', '#123d59', '#ffffff'), roughness: .7}));
    banner.position.set(0, pipe.lipHeight + 5.7, 0); finish.add(banner);
    for (let i = 0; i < 26; i++) for (let j = 0; j < 2; j++) { const t = box(pipe.F * 2 / 26, .02, .6, (i + j) % 2 ? navy : white, finish, -pipe.F + (i + .5) * pipe.F * 2 / 26, .03, j * .6 - .3); t.castShadow = false; }
    scene.add(finish); place(finish, course.length, 0, 0);
  }

  // ---------- Riders ----------
  const contactTex=canvasTexture(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(25,45,65,.55)');g.addColorStop(1,'rgba(25,45,65,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
  let gltf=null,modelError=null;try{gltf=await new GLTFLoader().loadAsync(modelUrl);}catch(error){modelError=String(error.message);}
  if (isDisposed()) { disposeAll(); throw Object.assign(new Error('alpine.disposed'), {disposed: true}); }
  function primitiveBody(color) {
    const g = new THREE.Group(), coat = mat(color, .6);
    for (const x of [-.18, .18]) mesh(new THREE.CapsuleGeometry(.12, .5, 4, 8), navy, g, x, .45, 0);
    mesh(new THREE.CapsuleGeometry(.26, .45, 4, 10), coat, g, 0, 1.1, 0);
    const head = mesh(new THREE.SphereGeometry(.3, 16, 12), mat('#f1c7a5', .7), g, 0, 1.62, 0); head.name = 'Head';
    return g;
  }
  const riders = new Map();
  // Clone skeletons without importing an additional runtime dependency.
  function cloneSkinned(source) { const clone = source.clone(true), orig = [], copies = [], boneMap = new Map(); source.traverse(n => orig.push(n)); clone.traverse(n => copies.push(n)); for (let i = 0; i < orig.length; i++) if (orig[i].isBone) boneMap.set(orig[i], copies[i]); for (let i = 0; i < orig.length; i++) if (orig[i].isSkinnedMesh) { copies[i].skeleton = orig[i].skeleton.clone(); copies[i].skeleton.bones = orig[i].skeleton.bones.map(b => boneMap.get(b)); copies[i].bindMatrix.copy(orig[i].bindMatrix); } return clone; }
  const riderMaterials=new Set(),riderGeo=g=>g;
  const riderMat=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8,...opts});riderMaterials.add(m);return m;};
  const riderMesh=(g,m,parent,x=0,y=0,z=0)=>mesh(g,m,parent,x,y,z),riderBox=(a,b,c,m,p,x,y,z)=>box(a,b,c,m,p,x,y,z);
 function boardTexture(color){return canvasTexture(256,1024,(c,w,h)=>{c.fillStyle='#dbd2b7';c.fillRect(0,0,w,h);c.fillStyle='#b75c43';c.beginPath();c.moveTo(0,0);c.lineTo(w,0);c.lineTo(w,200);c.lineTo(0,360);c.fill();c.fillStyle='#203b45';c.fillRect(0,720,w,304);c.fillStyle='#b75c43';c.fillRect(24,470,12,165);c.fillStyle='#ecdfbf';c.font='bold 48px Arial';c.save();c.translate(145,930);c.rotate(-Math.PI/2);c.fillText('AR / 06',0,0);c.restore();});}
 function snowboard(color,parent){const shape=new THREE.Shape();shape.moveTo(0,-1.1);shape.bezierCurveTo(.3,-1.1,.24,-.63,.21,-.35);shape.bezierCurveTo(.185,0,.185,.4,.22,.7);shape.bezierCurveTo(.3,1.23,-.3,1.23,-.22,.7);shape.bezierCurveTo(-.185,.4,-.185,0,-.21,-.35);shape.bezierCurveTo(-.24,-.63,-.3,-1.1,0,-1.1);const g=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelThickness:.012,bevelSize:.015,bevelSegments:3,steps:1,curveSegments:14});g.rotateX(Math.PI/2);const a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+Math.pow(Math.max(0,Math.abs(a.getZ(i))-.68),2)*.64);g.computeVertexNormals();const uv=g.attributes.uv;for(let i=0;i<a.count;i++)uv.setXY(i,(a.getX(i)+.3)/.6,(a.getZ(i)+1.1)/2.2);g.scale(.8,1,.77);const m=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:boardTexture(color),roughness:.24,clearcoat:.85,clearcoatRoughness:.18});riderMaterials.add(m);riderMesh(g,m,parent,0,.105,0);for(const z of [-.31,.31]){const n=riderBox(.32,.07,.19,navy,parent,0,.155,z);n.rotation.y=z<0?-.22:.22;riderBox(.11,.12,.24,white,parent,-.11,.2,z);}}
  const POSE = {upperLeg: -.33, lowerLeg: .68, foot: -.35, upperArm: .65, lowerArm: -.5};
  const PIVOT = .85;
  function rider(id, color) {
    if(gltf){const root=new THREE.Group(),pivot=new THREE.Group(),inner=new THREE.Group();root.add(pivot);pivot.add(inner);pivot.position.y=PIVOT;inner.position.y=-PIVOT;scene.add(root);const actor=createProRider(gltf,id,color,scene,{cloneSkinned,mesh:riderMesh,geo:riderGeo,mat:riderMat,basic:opts=>new THREE.MeshBasicMaterial(opts),box:riderBox,dark:navy,silver:white,snowboard,contactTex,profile:{slope:.11},materials:riderMaterials});scene.remove(actor.root);inner.add(actor.root);const r={root,pivot,inner,body:actor.body,shadow:actor.shadow,actor,bones:{},air:0,squash:0,grab:0,roll:0,crashAt:-1};riders.set(id,r);return r;} 
    // root sits on the board contact point; pivot turns tricks around the rider's centre.
    const root = new THREE.Group(), pivot = new THREE.Group(), inner = new THREE.Group(); root.add(pivot); pivot.add(inner); pivot.position.y = PIVOT; inner.position.y = -PIVOT;
    const body = gltf ? cloneSkinned(gltf.scene) : primitiveBody(color); inner.add(body); body.rotation.y = Math.PI / 2; body.position.y = .14;
    body.traverse(n => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; if (n.name === 'Ball' || n.name === 'Skin_2') n.visible = false;
      if ((n.name === 'Skin_1' || n.name.startsWith('ShoeSurface')) && n.geometry.attributes.color) { n.geometry = n.geometry.clone(); const pos = n.geometry.attributes.position, cols = n.geometry.attributes.color, coat = new THREE.Color(color), pants = new THREE.Color('#1a344b'); for (let i = 0; i < cols.count; i++) { const shade = THREE.MathUtils.clamp((cols.getX(i) + cols.getY(i) + cols.getZ(i)) * .9, .6, 1); const c = n.name === 'Skin_1' && pos.getY(i) > .85 && Math.abs(pos.getX(i)) < .48 ? coat : pants; cols.setXYZ(i, c.r * shade, c.g * shade, c.b * shade); } cols.needsUpdate = true; }
    } });
    const bones = {}; body.traverse(n => { if (n.isBone) bones[n.name] = n; });
    const headAnchor = gltf ? null : body.getObjectByName('Head');
    const hipsY = bones.Hips ? bones.Hips.position.y - .06 : 0;
    const head = bones.Head || headAnchor || inner, k = gltf ? 1 : .6, hy = gltf ? 0 : -.3;
    const helmet = mesh(new THREE.SphereGeometry(.55 * k, 24, 16, 0, Math.PI * 2, 0, Math.PI * .6), mat(color, .35), head, 0, .53 * k + hy * .2, -.01); helmet.scale.set(1, 1, .99);
    const goggles = mesh(new THREE.SphereGeometry(.48 * k, 20, 10, 0, Math.PI), mat('#193b54', .13), head, 0, .4 * k + hy * .2, .18 * k); goggles.scale.set(.97, .28, .91);
    box(1.03 * k, .095, .22 * k, navy, head, 0, .4 * k + hy * .2, -.03).rotation.y = .04;
    snowboard(color,inner);
    const scarf = new THREE.Group(); inner.add(scarf); scarf.position.set(.1, 1.48, .12);
    const sf = mesh(new THREE.PlaneGeometry(.18, 1.3, 1, 10), new THREE.MeshStandardMaterial({color: '#ff593d', side: THREE.DoubleSide}), scarf); sf.rotation.x = -Math.PI / 2; sf.position.z = .6;
    const shadow = mesh(new THREE.CircleGeometry(.8, 24), new THREE.MeshBasicMaterial({color: '#386483', transparent: true, opacity: .17, depthWrite: false}), scene); shadow.castShadow = false;
    scene.add(root); root.rotation.order = 'YXZ';
    const r = {root, pivot, inner, body, bones, hipsY, scarf, sf, shadow, air: 0, squash: 0, grab: 0, roll: 0, crashAt: -1}; riders.set(id, r); applyPose(r, 0, 0, 0); return r;
  }
  /** Knees bend deeper on landing, arms lift in the air, a grab tucks the knees and reaches down. */
  function applyPose(r, air, squash, grab) {
    const b = r.bones; if (!b.Hips) return;
    for (const side of ['L', 'R']) {
      if (b['UpperLeg_' + side]) b['UpperLeg_' + side].rotation.x = POSE.upperLeg - squash * .35 - air * .25 - grab * .7;
      if (b['LowerLeg_' + side]) b['LowerLeg_' + side].rotation.x = POSE.lowerLeg + squash * .6 + air * .45 + grab * 1.05;
      if (b['Foot_' + side]) b['Foot_' + side].rotation.x = POSE.foot - squash * .2 - air * .15 - grab * .3;
      const reach = side === 'R' ? grab * 1.1 : 0;
      if (b['UpperArm_' + side]) b['UpperArm_' + side].rotation.z = (side === 'L' ? -1 : 1) * (POSE.upperArm + air * .55 * (1 - grab) - reach);
      if (b['LowerArm_' + side]) b['LowerArm_' + side].rotation.x = POSE.lowerArm + reach * .4;
    }
    b.Hips.position.y = r.hipsY - squash * .1 + air * .05 - grab * .16; if (b.Spine) b.Spine.rotation.x = .18 + squash * .12 + grab * .45;
  }
  for (const [id, color] of [['player', '#ce6545'], ['rival-1', '#ffc540'], ['rival-2', '#59cad5'], ['rival-3', '#ab8cdb'], ['rival-4', '#df5368'], ['rival-5', '#a7d54d']]) rider(id, color);

  // ---------- Weather and effects ----------
  const dot = canvasTexture(32, 32, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#ffffffff'); g.addColorStop(.45, '#ffffffcc'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
  const SNOW_MAX = Math.round(450 * Math.max(.2, look.snow)), snowOffsets = new Float32Array(SNOW_MAX * 3), snowPos = new Float32Array(SNOW_MAX * 3);
  for (let i = 0; i < SNOW_MAX; i++) { const a = rnd() * Math.PI * 2, d = 3 + rnd() * 27; snowOffsets[i * 3] = Math.cos(a) * d; snowOffsets[i * 3 + 1] = rnd() * 24 - 5; snowOffsets[i * 3 + 2] = Math.sin(a) * d; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowfall = new THREE.Points(snowGeo, new THREE.PointsMaterial({color: '#ffffff', map: dot, size: .045 + look.snow * .1, transparent: true, opacity: .95, depthWrite: false})); snowfall.frustumCulled = false; scene.add(snowfall);
  const snowSpeed = 1.6 + look.snow * 2.6, wind = look.snow > .8 ? 3.2 : .6;
  const trailGeo = new THREE.BufferGeometry(), trailPositions = new Float32Array(140 * 3); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const spray = new THREE.Points(trailGeo, new THREE.PointsMaterial({color: '#ffffff', map: dot, size: .2, transparent: true, opacity: .85, depthWrite: false})); spray.frustumCulled = false; scene.add(spray);
  // Short bursts: gold sparkles for coins, snow puffs for crashes.
  const BURST = 120, burstPos = new Float32Array(BURST * 3), burstCol = new Float32Array(BURST * 3), burstVel = new Float32Array(BURST * 3), burstLife = new Float32Array(BURST); let burstNext = 0;
  const burstGeo = new THREE.BufferGeometry(); burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3)); burstGeo.setAttribute('color', new THREE.BufferAttribute(burstCol, 3));
  const bursts = new THREE.Points(burstGeo, new THREE.PointsMaterial({size: .3, map: dot, vertexColors: true, transparent: true, depthWrite: false})); bursts.frustumCulled = false; scene.add(bursts);
  for (let i = 0; i < BURST; i++) burstPos[i * 3 + 1] = -1e5;
  const sparkleColor = new THREE.Color('#ffd34d'), puffColor = new THREE.Color('#ffffff');
  function burst(at, color, count, speed) {
    for (let n = 0; n < count; n++) {
      const i = burstNext; burstNext = (burstNext + 1) % BURST; const a = rnd() * Math.PI * 2, up = rnd();
      burstPos.set([at.x, at.y, at.z], i * 3); burstVel.set([Math.cos(a) * speed * (1 - up * .5), speed * (.4 + up), Math.sin(a) * speed * (1 - up * .5)], i * 3); burstCol.set([color.r, color.g, color.b], i * 3); burstLife[i] = .55 + rnd() * .3;
    }
  }
  function stepBursts(dt) {
    for (let i = 0; i < BURST; i++) {
      if (burstLife[i] <= 0) continue; burstLife[i] -= dt;
      if (burstLife[i] <= 0) { burstPos[i * 3 + 1] = -1e5; continue; }
      burstVel[i * 3 + 1] -= 9 * dt; for (let k = 0; k < 3; k++) burstPos[i * 3 + k] += burstVel[i * 3 + k] * dt;
    }
    burstGeo.attributes.position.needsUpdate = true; burstGeo.attributes.color.needsUpdate = true;
  }

  const target = new THREE.Vector3(), camAt = new THREE.Vector3(), P = new THREE.Vector3();
  // Board grooves record actual engine positions, including the deterministic review replay.
  const trackCapacity=4200,trackVertices=new Float32Array(trackCapacity*18),trackGeo=new THREE.BufferGeometry();trackGeo.setAttribute('position',new THREE.BufferAttribute(trackVertices,3));trackGeo.setDrawRange(0,0);
  const trackMesh=new THREE.Mesh(trackGeo,new THREE.MeshBasicMaterial({color:'#547b91',transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide}));trackMesh.frustumCulled=false;scene.add(trackMesh);let trackCount=0,trackNext=0;const previousTracks=new Map();
  function rememberTracks(state){for(const r of [state.player,...(state.rivals||[])]){const id=r.id||'player',s=r.s??state.player.s-r.z,old=previousTracks.get(id);if(r.airborne){previousTracks.delete(id);continue;}if(old&&s>old.s+.18&&s-old.s<5){const p=[],out=new THREE.Vector3();for(const [ss,xx] of [[old.s,old.x-.055],[s,r.x-.055],[old.s,old.x+.055],[s,r.x-.055],[s,r.x+.055],[old.s,old.x+.055]]){worldPoint(ss,xx,surfaceHeight(xx,pipe)+.013,out);p.push(out.x,out.y,out.z);}trackVertices.set(p,trackNext*18);trackNext=(trackNext+1)%trackCapacity;trackCount=Math.min(trackCapacity,trackCount+1);trackGeo.setDrawRange(0,trackCount*6);trackGeo.attributes.position.needsUpdate=true;}if(!old||s>old.s+.18)previousTracks.set(id,{s,x:r.x});}}
  function seedTracks(frames){previousTracks.clear();trackCount=trackNext=0;for(const state of frames)rememberTracks(state);}
  let lastTrackS=0;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches ?? false;
  function resize(){if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; ro?.observe(host); resize();
  let lastT = 0, fov = 50, camLat = 0, camRise = 0, lastCoins = new Map(), snowAt = 0;
  const ease = p => p < .5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
  const crashSeconds = physics.crashSeconds ?? 1.4;

  function render(state) {
    if (disposed) return;
    const t = state.timeMs / 1000, playing = state.phase !== 'menu', portrait = camera.aspect < .9, dt = Math.min(.1, Math.max(0, t - lastT)), wall = performance.now() / 1000, wdt = Math.min(.1, Math.max(0, wall - snowAt));
    lastT = t; snowAt = wall;
    const player = state.player, ps = player.s ?? 0;
    if(ps<lastTrackS-2)seedTracks([]);lastTrackS=ps;rememberTracks(state);
    placeScenery(ps, wall);scenery.update(ps,look.fogFar);
    for (const c of chunks) c.visible = c.userData.s1 > ps - 70 && c.userData.s0 < ps + look.fogFar + 30;
    for (const [id, r] of riders) {
      const s = id === 'player' ? player : state.rivals?.find(x => x.id === id), z = id === 'player' ? 0 : s?.z ?? 0;
      // Riders just behind the player sit between the chase camera and the player; they are hidden so they never fill the screen.
      const blocking = id !== 'player' && !!s && (z > 1.2 || (z > .4 && Math.abs(s.x - player.x) < 2.4));
      const visible = !!s && playing && z > -look.fogFar && z < 30 && !blocking; r.root.visible = r.shadow.visible = visible; if (!visible) continue;
      const height = Math.max(0, s.height ?? 0), lean = s.lean ?? 0, side = Math.sign(s.x) || 1, surf = surfaceHeight(s.x, pipe), trick = s.trick;
      r.air += ((s.airborne ? 1 : 0) - r.air) * Math.min(1, dt * 9); r.squash += ((s.landing ? 1 : 0) - r.squash) * Math.min(1, dt * 14);
      const grabbing = trick && (trick.id === 'grab' || trick.id === 'combo') ? Math.sin(Math.min(1, trick.progress) * Math.PI) : 0;
      r.grab += (grabbing - r.grab) * Math.min(1, dt * 16);
      applyPose(r, reduced ? r.air * .6 : r.air, r.squash, r.grab);
      // On a wall the rider stands square to the surface; in pipe air the body eases upright.
      const rollTarget = s.airKind === 'pipe' ? side * wallAngle(pipe.lip, pipe) * .55 : s.airborne ? 0 : side * wallAngle(s.x, pipe);
      r.roll += (rollTarget - r.roll) * Math.min(1, dt * 8);
      place(r.root, s.s ?? ps - z, s.x, surf + height + .03, r.roll, lean * .24, s.airKind === 'ramp' ? r.air * .12 : 0);
      // Tricks spin, flip or both around the centre of mass; a crash tumbles onto the side.
      let yaw = 0, flip = 0, roll = 0, drop = 0;
      if (trick) { const e = ease(Math.min(1, trick.progress)); if (trick.id === 'spin' || trick.id === 'combo') yaw = e * Math.PI * 2; if (trick.id === 'flip' || trick.id === 'combo') flip = e * Math.PI * 2; if (trick.id === 'grab') roll = Math.sin(trick.progress * Math.PI) * .35 * side; }
      if (s.crashed) { if (r.crashAt < 0) { r.crashAt = t; if (id === 'player') { worldPoint(s.s ?? ps, s.x, surf + .6, P); burst(P, puffColor, 26, 3.2); } } const c = Math.min(1, (t - r.crashAt) / crashSeconds), fall = c < .35 ? c / .35 : c > .75 ? (1 - c) / .25 : 1; roll = side * -1.25 * fall; drop = .45 * fall; yaw = Math.sin(c * 9) * .3 * (1 - c); }
      else r.crashAt = -1;
      r.pivot.rotation.set(flip, yaw, roll, 'YXZ'); r.pivot.position.y = PIVOT - drop;
      if (s.hit && !s.crashed && !reduced) r.pivot.rotation.x += Math.sin(t * 40) * .12;
      if(r.actor)r.actor.pose(t,lean,height,r.squash,r.grab);else r.body.position.y = .14 + Math.sin(t * 5 + (id === 'player' ? 0 : 3)) * .018;
      place(r.shadow, s.s ?? ps - z, s.x, surf + .05, s.airborne ? 0 : side * wallAngle(s.x, pipe)); r.shadow.rotateX(-Math.PI / 2);
      r.shadow.material.opacity = .2 / (1 + height * .7); r.shadow.scale.set(.75 / (1 + height * .15), 1.4 / (1 + height * .15), 1);
      if(r.sf){const a = r.sf.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(i * .9 + t * 10) * .05 * (i % 11 / 10)); a.needsUpdate = true;}
    }
    // Obstacles and coins from the frame.
    const used = {rock: 0, gate: 0, boost: 0, ramp: 0};
    for (const list of Object.values(pools)) for (const g of list) g.visible = false;
    let coinCount = 0; const seen = new Map();
    for (const o of state.obstacles ?? []) {
      const os = o.s ?? ps - o.z;
      // Anything already behind the player would sit between it and the chase camera.
      if (os < ps - 1.5) continue;
      if (o.type === 'coin') {
        if (coinCount >= COIN_POOL) continue;
        worldPoint(os, o.x, (o.h ?? .85) + Math.sin(wall * 3 + os) * .06, vec); frameAt(os, FR);
        matrix.compose(vec, quat.setFromEuler(euler.set(0, -FR.theta + wall * 3.2 + os * .4, 0)), scl.setScalar(1)); coins.setMatrixAt(coinCount++, matrix);
        seen.set(o.id, {s: os, x: o.x, h: o.h ?? .85}); continue;
      }
      if (!makers[o.type]) continue;
      const g = prop(o.type, used); place(g, os, o.x, 0);
      if (o.type === 'rock') g.scale.setScalar((o.radius ?? .7) / .7);
    }
    coins.count = coinCount; coins.instanceMatrix.needsUpdate = true;
    // A coin that vanishes beside the player was collected: sparkle where it was.
    for (const [id, c] of lastCoins) if (!seen.has(id) && Math.abs(c.s - ps) < 4 && playing) { worldPoint(c.s, c.x, c.h, P); burst(P, sparkleColor, 9, 2.4); }
    lastCoins = seen;
    stepBursts(dt);

    // Camera: a chase rig along the path that rises with the rider on walls and in the air.
    const px = player.x, boost = !!player.boosting, absY = surfaceHeight(px, pipe) + Math.max(0, player.height ?? 0);
    // Narrow screens sit higher with a wider lens and follow the rider almost fully sideways.
    const wide=Math.min(1,Math.max(0,(camera.aspect-.45)/1.3)),baseFov=67-wide*7;
    const wantFov = baseFov + (boost && !reduced ? 6 : 0); fov += (wantFov - fov) * Math.min(1, dt * 4 || 1); camera.fov = fov; camera.updateProjectionMatrix();
    const follow=.98;
    if (playing) {
      const k = Math.min(1, (wdt || 1 / 60) * 5); camLat += (px * follow - camLat) * k; camRise += (absY * .75 - camRise) * Math.min(1, (wdt || 1 / 60) * 3.5);
      worldPoint(ps-(portrait?5.2:5.8)-(boost&&!reduced?.3:0),camLat+(portrait?.2:.65),2.45+camRise,camera.position);
      worldPoint(ps+16,px*.8,2.0+camRise*.8,target);
    } else {
      worldPoint(portrait ? -4.8 : -5.5, portrait ? 4 : 7, portrait ? 2.6 : 2.7, camera.position); worldPoint(portrait ? 8 : 8, portrait ? 0 : -4, .7, target);
      const pr = riders.get('player'); pr.root.visible = pr.shadow.visible = true; place(pr.root, portrait ? 2 : .4, portrait ? 1.8 : 3.8, .03, 0, -.38); pr.pivot.rotation.set(0, 0, 0); pr.pivot.position.y = PIVOT; place(pr.shadow, portrait ? 2 : .4, portrait ? 1.8 : 3.8, .05); pr.shadow.rotateX(-Math.PI / 2);
      for (const [id, r] of riders) if (id !== 'player') r.root.visible = r.shadow.visible = false;
    }
    if (player.hit && !reduced) camera.position.y += Math.sin(t * 65) * .07;
    camera.lookAt(target);
    if (playing && !reduced) camera.rotateZ(-(player.lean ?? 0) * .025);
    camAt.copy(camera.position);
    mountains.position.set(camAt.x, camAt.y - 48, camAt.z); field.position.set(camAt.x, camAt.y - 78, camAt.z);
    worldPoint(ps, px, 0, P); sun.target.position.copy(P); sun.position.set(P.x-32,P.y+25,P.z-38);art.update(ps,look.fogFar,camera,quality);
    // Board spray and falling snow.
    frameAt(ps, FR); const dx = Math.sin(FR.theta), dz = -Math.cos(FR.theta), rx = Math.cos(FR.theta), rz = Math.sin(FR.theta);
    worldPoint(ps, px, absY, P);
    for (let i = 0; i < 140; i++) { const life = ((t * 1.8 + i / 140) % 1), side = Math.sin(i * 3.7) * life * .5; trailPositions[i * 3] = P.x - dx * life * 4 + rx * side; trailPositions[i * 3 + 1] = P.y + .1 + Math.sin(life * Math.PI) * .4; trailPositions[i * 3 + 2] = P.z - dz * life * 4 + rz * side; }
    trailGeo.attributes.position.needsUpdate = true; spray.visible = quality !== 'low' && playing && !player.airborne && (Math.abs(player.lean ?? 0) > .12 || boost);
    const count = quality === 'low' ? Math.round(SNOW_MAX * .35) : SNOW_MAX;
    for (let i = 0; i < count; i++) {
      let y = snowOffsets[i * 3 + 1] - snowSpeed * wdt, x = snowOffsets[i * 3] + wind * wdt;
      if (y < -5) y += 24; if (x > 30) x -= 57;
      snowOffsets[i * 3] = x; snowOffsets[i * 3 + 1] = y;
      snowPos[i * 3] = camAt.x + x; snowPos[i * 3 + 1] = camAt.y + y; snowPos[i * 3 + 2] = camAt.z + snowOffsets[i * 3 + 2];
    }
    snowGeo.setDrawRange(0, count); snowGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function setQuality(value) { if (disposed) return; quality = value === 'low' ? 'low' : 'high'; renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : maxDpr)); renderer.shadowMap.enabled = quality !== 'low'; scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); resize(); }
  function disposeAll() {
    if (disposed) return; disposed = true; ro?.disconnect();
    const materials = new Set(), geometries = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); });
    scene.background?.dispose?.();scenery.dispose();art.dispose();contactTex.dispose();granite.dispose();
    for (const m of [...treeMeshes, flagPole, flagCloth, coins]) m.dispose?.();
    sun.shadow.map?.dispose(); renderer.renderLists.dispose(); renderer.dispose();renderer.forceContextLoss();
    if (!canvas) renderer.domElement.remove();
  }
  return {
    render, seedTracks, setQuality, dispose: disposeAll, canvas: renderer.domElement,
    get quality() { return quality; },
    get modelError() { return modelError; },
    mode: 'mixamo-rider-procedural-world-v6',
    metrics() { return {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, props: Object.values(pools).reduce((n, l) => n + l.length, 0), chunks: chunks.length, visibleChunks: chunks.filter(c => c.visible).length, coins: coins.count, trees: art.metrics().trees, quality, disposed, mode: gltf ? 'model' : 'primitive'}; },
  };
}
