import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js?v=island-alpine-20261028-1';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js?v=island-alpine-20261028-1';
import {createProRider} from './athlete.mjs';
import {presentationFrame,dampWeight} from './alpine-presentation.mjs';
import {createProRider as createFallbackRider} from './rider-fallback.mjs';
import {snowMaterial,rockMaterial,createArtWorld} from './alpine-art.mjs';
import {pipeProfile, surfaceHeight, wallAngle} from './alpine-track.mjs?v=island-alpine-20261028-1';

/** Alpine Rush presentation (Codex design package view, rebuilt for the curved halfpipe).
 * Renders a SkiFrame only: positions, collisions, tricks and results belong to the engine.
 * Everything is placed in world space through the course centreline: s along the path,
 * x across the pipe, height above the floor. Version 9 keeps the original collision
 * profile, with procedural snow, 3D fir branches, granite/snow cliffs, a close chase
 * camera and grooves recording engine positions. The Mixamo rig has authored sport outerwear; attribution is in ASSETS.md.
 * This local candidate includes a separately reviewed engine feel proposal; it is not a released build. */
export async function createSkiView(host, {canvas, modelUrl = new URL('../assets/alpine-rush/athlete.glb', import.meta.url).href, rockTextureUrl = new URL('../assets/alpine-rush/granite-v5.webp',import.meta.url).href, quality: initialQuality = 'high', mobileProfile: forcedMobile = null, maxDpr = 1.7, lowDpr = 1, isDisposed = () => false, course, physics, visual = {}} = {}) {
  if (!course?.path || !physics) throw new Error('alpine.view.course');
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
  let quality = initialQuality, disposed = false, ro = null;
  const mobile = forcedMobile ?? (globalThis.matchMedia?.('(pointer: coarse)').matches ?? false);
  const highDpr = mobile ? Math.min(1.25,maxDpr) : maxDpr;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : highDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!canvas) host.append(renderer.domElement);
  const look = {sky: '#85a9b9', fog: '#b5c9d1', fogNear: 85, fogFar: 300, snow: .10, light: 1, trees: 1, ...visual}; const forestStage=(look.trees??1)>1.5;look.fog=look.dusk?'#aab2c5':forestStage?'#b6cbd0':'#b5c9d1';look.fogNear=look.dusk?75:forestStage?85:105;look.fogFar=look.dusk?245:forestStage?285:330;look.snow=look.dusk?.38:forestStage?.17:.09;
  const dusk = !!look.dusk;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
  const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,toneMapped:false,vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float t=normalize(p).y*.5+.5;gl_FragColor=vec4(mix(vec3(.14,.20,.25),vec3(.72,.87,.97),t),1.);}'})));
  const envSun=new THREE.Mesh(new THREE.SphereGeometry(3,12,8),new THREE.MeshBasicMaterial({color:new THREE.Color('#ffe4bc').multiplyScalar(3),toneMapped:false}));envSun.position.set(-15,20,-20);envScene.add(envSun);
  const pmrem=new THREE.PMREMGenerator(renderer),envTarget=pmrem.fromScene(envScene,.035,.1,100);scene.environment=envTarget.texture;pmrem.dispose();envScene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 900);
  const hemi = new THREE.HemisphereLight(dusk ? '#9da3ca' : '#bbd4e4', '#3c5368', 1.1 * look.light); scene.add(hemi);
  const sun = new THREE.DirectionalLight(dusk ? '#f0c5b1' : '#ffe2ba', 2.65 * look.light); sun.castShadow = true; sun.shadow.mapSize.set(mobile?1024:2048, mobile?1024:2048);
  Object.assign(sun.shadow.camera, {left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120}); sun.shadow.bias = -.0005; scene.add(sun, sun.target);
  const mat = (c, roughness = .8) => new THREE.MeshStandardMaterial({color: c, roughness,envMapIntensity:.2});
  const snow=snowMaterial(),ice=mat('#90b5c4',.5),navy=mat('#263f4a'),orange=mat('#c97550'),white=mat('#e4e3d7'),stone=rockMaterial(),green=mat('#254e40'),red=mat('#b65e48',.8),gold=new THREE.MeshStandardMaterial({color:'#f3cb77',emissive:'#9c6f23',emissiveIntensity:.15,roughness:.28,metalness:.55});
  function mesh(geo, material, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  const box = (w, h, d, m, p, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, p, x, y, z);
  const placed = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, s = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(s, s, s)));
  const canvasTexture = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex; };

  scene.background=new THREE.Color(look.fog);
  let granite=new THREE.Texture(),rockTextureError=null;try{granite=await new THREE.TextureLoader().loadAsync(rockTextureUrl);}catch(error){rockTextureError=String(error?.message||'rock-texture-unavailable');}
  granite.colorSpace=THREE.SRGBColorSpace;granite.wrapS=granite.wrapT=THREE.RepeatWrapping;granite.anisotropy=8;if(granite.image)stone.userData.granite=granite;
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
  const pipeMat=snow,terrainMat=snowMaterial({powder:true});
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
  const art=createArtWorld(scene,{course,deckEdge,terrainY,place,frameAt,snow,stone,dusk,mobile,density:look.trees});
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
  const riders = new Map();
  // Clone skeletons without importing an additional runtime dependency.
  function cloneSkinned(source) { const clone = source.clone(true), orig = [], copies = [], boneMap = new Map(); source.traverse(n => orig.push(n)); clone.traverse(n => copies.push(n)); for (let i = 0; i < orig.length; i++) if (orig[i].isBone) boneMap.set(orig[i], copies[i]); for (let i = 0; i < orig.length; i++) if (orig[i].isSkinnedMesh) { copies[i].skeleton = orig[i].skeleton.clone(); copies[i].skeleton.bones = orig[i].skeleton.bones.map(b => boneMap.get(b)); copies[i].bindMatrix.copy(orig[i].bindMatrix); } return clone; }
  const riderMaterials=new Set(),riderGeo=g=>g;
  const riderMat=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8,envMapIntensity:.24,...opts});riderMaterials.add(m);return m;};
  const riderMesh=(g,m,parent,x=0,y=0,z=0)=>mesh(g,m,parent,x,y,z),riderBox=(a,b,c,m,p,x,y,z)=>box(a,b,c,m,p,x,y,z);
 function boardTexture(color){return canvasTexture(256,1024,(c,w,h)=>{c.fillStyle='#dbd2b7';c.fillRect(0,0,w,h);c.fillStyle='#b75c43';c.beginPath();c.moveTo(0,0);c.lineTo(w,0);c.lineTo(w,200);c.lineTo(0,360);c.fill();c.fillStyle='#203b45';c.fillRect(0,720,w,304);c.fillStyle='#b75c43';c.fillRect(24,470,12,165);c.fillStyle='#ecdfbf';c.font='bold 48px Arial';c.save();c.translate(145,930);c.rotate(-Math.PI/2);c.fillText('AR / 06',0,0);c.restore();});}
 function snowboard(color,parent){const shape=new THREE.Shape();shape.moveTo(0,-1.1);shape.bezierCurveTo(.3,-1.1,.24,-.63,.21,-.35);shape.bezierCurveTo(.185,0,.185,.4,.22,.7);shape.bezierCurveTo(.3,1.23,-.3,1.23,-.22,.7);shape.bezierCurveTo(-.185,.4,-.185,0,-.21,-.35);shape.bezierCurveTo(-.24,-.63,-.3,-1.1,0,-1.1);const g=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelThickness:.012,bevelSize:.015,bevelSegments:3,steps:1,curveSegments:14});g.rotateX(Math.PI/2);const a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+Math.pow(Math.max(0,Math.abs(a.getZ(i))-.68),2)*.64);g.computeVertexNormals();const uv=g.attributes.uv;for(let i=0;i<a.count;i++)uv.setXY(i,(a.getX(i)+.3)/.6,(a.getZ(i)+1.1)/2.2);g.scale(.8,1,.77);const m=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:boardTexture(color),roughness:.24,clearcoat:.85,clearcoatRoughness:.18});riderMaterials.add(m);riderMesh(g,m,parent,0,.105,0);for(const z of [-.31,.31]){const n=riderBox(.32,.07,.19,navy,parent,0,.155,z);n.rotation.y=z<0?-.22:.22;riderBox(.11,.12,.24,white,parent,-.11,.2,z);}}
  const PIVOT=.85;
  function rider(id,color){
    const root=new THREE.Group(),pivot=new THREE.Group(),inner=new THREE.Group();root.add(pivot);pivot.add(inner);pivot.position.y=PIVOT;inner.position.y=-PIVOT;scene.add(root);
    const maker=gltf?createProRider:createFallbackRider,actor=maker(gltf,id,color,scene,{cloneSkinned,mesh:riderMesh,geo:riderGeo,mat:riderMat,basic:opts=>new THREE.MeshBasicMaterial(opts),box:riderBox,dark:navy,silver:white,snowboard,contactTex,profile:{slope:.11},materials:riderMaterials});scene.remove(actor.root);inner.add(actor.root);
    const r={root,pivot,inner,body:actor.body,shadow:actor.shadow,actor,bones:{},air:0,squash:0,grab:0,roll:0,crashAt:-1,hitAt:-10,wasHit:false};riders.set(id,r);return r;
  }
  for (const [id, color] of [['player', '#ce6545'], ['rival-1', '#bd974e'], ['rival-2', '#498b9d'], ['rival-3', '#746b96'], ['rival-4', '#a95d5b'], ['rival-5', '#7b8d5b']]) rider(id, color);

  // ---------- Weather and effects ----------
  const dot = canvasTexture(32, 32, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#ffffffff'); g.addColorStop(.45, '#ffffffcc'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
  const SNOW_MAX = Math.round(450 * Math.max(.2, look.snow)), snowOffsets = new Float32Array(SNOW_MAX * 3), snowPos = new Float32Array(SNOW_MAX * 3);
  for (let i = 0; i < SNOW_MAX; i++) { const a = rnd() * Math.PI * 2, d = 3 + rnd() * 27; snowOffsets[i * 3] = Math.cos(a) * d; snowOffsets[i * 3 + 1] = rnd() * 24 - 5; snowOffsets[i * 3 + 2] = Math.sin(a) * d; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowfall = new THREE.Points(snowGeo, new THREE.PointsMaterial({color: '#ffffff', map: dot, size: .045 + look.snow * .1, transparent: true, opacity: .95, depthWrite: false})); snowfall.frustumCulled = false; scene.add(snowfall);
  const snowSpeed = 1.6 + look.snow * 2.6, wind = look.snow > .8 ? 3.2 : .6;
  const trailGeo = new THREE.BufferGeometry(), trailPositions = new Float32Array(140 * 3),trailAge=new Float32Array(140); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));trailGeo.setAttribute('powderAge',new THREE.BufferAttribute(trailAge,1));
  const powderMat=new THREE.PointsMaterial({color:'#f2f7fa',map:dot,size:.23,transparent:true,opacity:.55,depthWrite:false});powderMat.onBeforeCompile=s=>{s.vertexShader='attribute float powderAge; varying float vPowderAge;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('gl_PointSize = size;','vPowderAge=powderAge;gl_PointSize=size*(.55+powderAge*1.4);');s.fragmentShader='varying float vPowderAge;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor=vec4(diffuse,opacity*pow(1.-vPowderAge,1.7));');};powderMat.customProgramCacheKey=()=> 'alpine-powder-v7';
  const spray = new THREE.Points(trailGeo,powderMat); spray.frustumCulled = false; scene.add(spray);
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
  const trackMesh=new THREE.Mesh(trackGeo,new THREE.MeshBasicMaterial({color:'#6f8b99',transparent:true,opacity:.085,depthWrite:false,side:THREE.DoubleSide}));trackMesh.frustumCulled=false;scene.add(trackMesh);let trackCount=0,trackNext=0;const previousTracks=new Map();
  function rememberTracks(state){for(const r of [state.player,...(state.rivals||[])]){const id=r.id||'player',s=r.s??state.player.s-r.z,old=previousTracks.get(id);if(r.airborne){previousTracks.delete(id);continue;}if(old&&s>old.s+.18&&s-old.s<5){const p=[],out=new THREE.Vector3();for(const [ss,xx] of [[old.s,old.x-.055],[s,r.x-.055],[old.s,old.x+.055],[s,r.x-.055],[s,r.x+.055],[old.s,old.x+.055]]){worldPoint(ss,xx,surfaceHeight(xx,pipe)+.013,out);p.push(out.x,out.y,out.z);}trackVertices.set(p,trackNext*18);trackNext=(trackNext+1)%trackCapacity;trackCount=Math.min(trackCapacity,trackCount+1);trackGeo.setDrawRange(0,trackCount*6);trackGeo.attributes.position.needsUpdate=true;}if(!old||s>old.s+.18)previousTracks.set(id,{s,x:r.x});}}
  function seedTracks(frames){previousTracks.clear();trackCount=trackNext=0;for(const state of frames)rememberTracks(state);}
  let lastTrackS=0;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches ?? false;
  function resize(){if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; ro?.observe(host); resize();
  let canonicalPresentation=false;
  let lastT = 0, fov = 50, camLat = 0, camRise = 0, lastCoins = new Map(), snowAt = 0;
  const ease = p => p < .5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2;
  const crashSeconds = physics.crashSeconds ?? 1.4;

  function render(canonicalState, presentation = canonicalState.presentation) {
    if (disposed) return;
    // Pausing preserves the exact scene pose; UI overlays are managed by the session.
    if(canonicalState.phase==='paused'){snowAt=performance.now()/1000;renderer.render(scene,camera);return;}
    canonicalPresentation=!!presentation;
    const state=presentationFrame(canonicalState,physics.fixedStep,presentation);
    const t = state.timeMs / 1000, playing = state.phase !== 'menu', portrait = camera.aspect < .9, dt = Math.min(.1, Math.max(0, t - lastT)), wall = performance.now() / 1000, wdt = Math.min(.1, Math.max(0, wall - snowAt));
    lastT = t; snowAt = wall;
    const player = state.player, ps = player.s ?? 0;
    if(ps<lastTrackS-2){seedTracks([]);for(const r of riders.values()){r.air=r.squash=r.grab=r.roll=0;r.wasHit=false;r.hitAt=-10;r.crashAt=-1;}camLat=player.x*.98;camRise=0;}
    lastTrackS=ps;rememberTracks(canonicalState);
    placeScenery(ps, wall);scenery.update(ps,look.fogFar);
    for (const c of chunks) c.visible = c.userData.s1 > ps - 70 && c.userData.s0 < ps + look.fogFar + 30;
    for (const [id, r] of riders) {
      const s = id === 'player' ? player : state.rivals?.find(x => x.id === id), z = id === 'player' ? 0 : s?.z ?? 0;
      // Riders just behind the player sit between the chase camera and the player; they are hidden so they never fill the screen.
      const blocking = id !== 'player' && !!s && (z > 1.2 || (z > .4 && Math.abs(s.x - player.x) < 2.4));
      const visible = !!s && playing && z > -look.fogFar && z < 30 && !blocking; r.root.visible = r.shadow.visible = visible; if (!visible) continue;
      const height = Math.max(0, s.height ?? 0), lean = s.lean ?? 0, side = Math.sign(s.x) || 1, surf = surfaceHeight(s.x, pipe), trick = s.trick;
      r.air += ((s.airborne ? 1 : 0) - r.air) * dampWeight(10,wdt); r.squash += ((s.landing ? 1 : 0) - r.squash) * dampWeight(15,wdt);
      const grabbing = trick && (trick.id === 'grab' || trick.id === 'combo') ? Math.sin(Math.min(1, trick.progress) * Math.PI) : 0;
      r.grab += (grabbing - r.grab) * dampWeight(18,wdt);

      // On a wall the rider stands square to the surface; in pipe air the body eases upright.
      const rollTarget = s.airKind === 'pipe' ? side * wallAngle(pipe.lip, pipe) * .55 : s.airborne ? 0 : side * wallAngle(s.x, pipe);
      r.roll += (rollTarget - r.roll) * dampWeight(11,wdt);
      place(r.root, s.s ?? ps - z, s.x, surf + height + .03, r.roll, lean * .24, s.airKind === 'ramp' ? r.air * .12 : 0);
      // Tricks spin, flip or both around the centre of mass; a crash tumbles onto the side.
      let yaw = 0, flip = 0, roll = 0, drop = 0;
      if (trick) { const e = ease(Math.min(1, trick.progress)); if (trick.id === 'spin' || trick.id === 'combo') yaw = e * Math.PI * 2; if (trick.id === 'flip' || trick.id === 'combo') flip = e * Math.PI * 2; if (trick.id === 'grab') roll = Math.sin(trick.progress * Math.PI) * .35 * side; }
      if (s.crashed) { if (r.crashAt < 0) { r.crashAt = t; if (id === 'player') { worldPoint(s.s ?? ps, s.x, surf + .6, P); burst(P, puffColor, 26, 3.2); } } const c = Math.min(1, (t - r.crashAt) / crashSeconds), fall = c < .35 ? c / .35 : c > .75 ? (1 - c) / .25 : 1; roll = side * -1.25 * fall; drop = .45 * fall; yaw = Math.sin(c * 9) * .3 * (1 - c); }
      else r.crashAt = -1;
      if(s.hit&&!r.wasHit&&!s.crashed){r.hitAt=t;if(id==='player'){worldPoint(s.s??ps,s.x,surf+.35,P);burst(P,puffColor,reduced?8:22,2.5);}}
      r.wasHit=!!s.hit;
      const impact=s.crashed?0:Math.max(0,1-(t-r.hitAt)/.65)**2;
      // A readable recoil and knee compression, including reduced-motion mode.
      flip-=impact*.28;roll+=side*impact*.16;drop+=impact*.1;
      r.pivot.rotation.set(flip, yaw, roll, 'YXZ'); r.pivot.position.y = PIVOT - drop;
      if(r.actor)r.actor.pose(t,lean,r.air,Math.max(r.squash,impact*.8),r.grab);else r.body.position.y = .14 + Math.sin(t * 5 + (id === 'player' ? 0 : 3)) * .018;
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
    const wantFov = baseFov + (boost && !reduced ? 6 : 0); fov += (wantFov - fov) * dampWeight(5,wdt); camera.fov = fov; camera.updateProjectionMatrix();
    const follow=.98;
    if (playing) {
      const k = dampWeight(9,wdt); camLat += (px * follow - camLat) * k; camRise += (absY * .75 - camRise) * dampWeight(6,wdt);
      worldPoint(ps-(portrait?5.2:5.8)-(boost&&!reduced?.3:0),camLat+(portrait?.2:.65),2.45+camRise,camera.position);
      worldPoint(ps+16,px*.8,2.0+camRise*.8,target);
    } else {
      worldPoint(portrait ? -4.8 : -5.5, portrait ? 4 : 7, portrait ? 2.6 : 2.7, camera.position); worldPoint(portrait ? 8 : 8, portrait ? 0 : -4, .7, target);
      const pr = riders.get('player'); pr.root.visible = pr.shadow.visible = true; place(pr.root, portrait ? 2 : .4, portrait ? 1.8 : 3.8, .03, 0, -.38); pr.pivot.rotation.set(0, 0, 0); pr.pivot.position.y = PIVOT; place(pr.shadow, portrait ? 2 : .4, portrait ? 1.8 : 3.8, .05); pr.shadow.rotateX(-Math.PI / 2);
      for (const [id, r] of riders) if (id !== 'player') r.root.visible = r.shadow.visible = false;
    }
    if (player.hit && !reduced) {const impact=Math.max(0,1-(t-riders.get('player').hitAt)/.45);camera.position.y+=Math.sin(Math.min(1,(t-riders.get('player').hitAt)/.45)*Math.PI)*.055*impact;}
    camera.lookAt(target);
    if (playing && !reduced) camera.rotateZ(-(player.lean ?? 0) * .025);
    camAt.copy(camera.position);
    mountains.position.set(camAt.x, camAt.y - 48, camAt.z); field.position.set(camAt.x, camAt.y - 78, camAt.z);
    worldPoint(ps, px, 0, P); sun.target.position.copy(P); sun.position.set(P.x-32,P.y+25,P.z-38);art.update(ps,look.fogFar,camera,quality);
    // Board spray and falling snow.
    frameAt(ps, FR); const dx = Math.sin(FR.theta), dz = -Math.cos(FR.theta), rx = Math.cos(FR.theta), rz = Math.sin(FR.theta);
    worldPoint(ps, px, absY, P);
    for(let i=0;i<140;i++){const life=(t*1.7+i/140)%1,cut=Math.min(1,Math.abs(player.lean??0)+.12),r=Math.sin(i*37.7),side=r*life*(.25+cut*.9)+(player.lean??0)*life*.45,back=life*(2.1+(state.speedKmh??72)*.018);trailAge[i]=life;trailPositions[i*3]=P.x-dx*back+rx*side;trailPositions[i*3+1]=P.y+.07+Math.sin(life*Math.PI)*(.11+cut*.4)*(.35+Math.sin(i*9.1)**2*.65);trailPositions[i*3+2]=P.z-dz*back+rz*side;}
    trailGeo.attributes.position.needsUpdate = true;trailGeo.attributes.powderAge.needsUpdate=true; spray.visible = quality !== 'low' && playing && !player.airborne && (Math.abs(player.lean ?? 0) > .12 || boost);
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
  function setQuality(value) { if (disposed) return; quality = value === 'low' ? 'low' : 'high'; renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'low' ? lowDpr : highDpr)); renderer.shadowMap.enabled = quality !== 'low'; scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); resize(); }
  function disposeAll() {
    if (disposed) return; disposed = true; ro?.disconnect();
    const materials = new Set(), geometries = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); });
    scene.background?.dispose?.();scenery.dispose();art.dispose();contactTex.dispose();granite.dispose();
    for (const m of [...treeMeshes, flagPole, flagCloth, coins]) m.dispose?.();
    sun.shadow.map?.dispose();envTarget.dispose(); renderer.renderLists.dispose(); renderer.dispose();renderer.forceContextLoss();
    if (!canvas) renderer.domElement.remove();
  }
  return {
    render, seedTracks, setQuality, dispose: disposeAll, canvas: renderer.domElement,
    get quality() { return quality; },
    get modelError() { return modelError; },
    get rockTextureError(){return rockTextureError;},
    mode: 'alpine-feel-v9',
    metrics() { return {calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, props: Object.values(pools).reduce((n, l) => n + l.length, 0), chunks: chunks.length, visibleChunks: chunks.filter(c => c.visible).length, coins: coins.count, ...art.metrics(),quality, disposed, mode: gltf ? 'model' : 'primitive',rockTexture:granite.image?'loaded':'procedural',mobileProfile:mobile,pixelRatio:renderer.getPixelRatio(),fov:+fov.toFixed(3),interpolation:!!canonicalPresentation}; },
  };
}
