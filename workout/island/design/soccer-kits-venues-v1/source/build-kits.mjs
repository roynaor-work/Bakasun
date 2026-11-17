// Reuse the existing CC0 footballer, preserve its canonical skin, and bake COLOR_0.
// The only added geometry is an original, surface-projected block numeral.
import fs from 'node:fs/promises';
import path from 'node:path';
import {root, repo, io, rgb, accessor, save, writeJSON, sha, resample} from './common.mjs';

const source = 'workout/island/design/soccer-v5/models/teal-quiff.glb';
const sourceBytes = await fs.readFile(path.join(repo, source));
const rigBytes = await fs.readFile(path.join(repo, 'workout/island/design/soccer-v5/rig.json'));
const contractBytes = await fs.readFile(path.join(repo, 'workout/island/design/motion2/soccer.json'));
const canonical = JSON.parse(contractBytes).skeleton.bones;
const rig = JSON.parse(rigBytes);
if (JSON.stringify(rig.joints.map(j => [j.name, j.parent])) !== JSON.stringify(canonical.map(j => [j.name, j.parent])))
  throw Error('The source no longer matches the canonical 18-joint hierarchy.');

const kits = [
  ['ridge-red', 'אדום רכס', '#DF4053', '#1A2941', '#F2F0E5', '#F2F0E5', 'solid', 1],
  ['cobalt-tide', 'גל קובלט', '#315DE0', '#F1F2E9', '#315DE0', '#90D9E1', 'side', 2],
  ['sunfield', 'שדה שמש', '#F3BE35', '#20364A', '#F3BE35', '#20364A', 'shoulder', 3],
  ['pine-white', 'אורן ולבן', '#177C67', '#F2F0E5', '#177C67', '#E7C98B', 'side', 4],
  ['violet-dusk', 'סגול בין ערביים', '#7946BC', '#29233D', '#B19CD8', '#EEE9F0', 'solid', 5],
  ['cloud-blue', 'ענן כחול', '#E9F1EC', '#2B4FA4', '#E9F1EC', '#3877B5', 'side', 6],
  ['clay-aqua', 'חמרה ותכלת', '#EF743D', '#253E4C', '#51C5C5', '#F4EBDD', 'shoulder', 10],
  ['midnight-lime', 'לילה וליים', '#1A2E45', '#B9D853', '#1A2E45', '#B9D853', 'side', 11],
].map(([id, label, shirt, shorts, socks, trim, pattern, defaultNumber], i) => ({
  id, label, index: i + 1, palette: {shirt, shorts, socks, trim,
    number: ['sunfield', 'cloud-blue', 'clay-aqua'].includes(id) ? '#15293B' : '#F5F3E9'}, pattern, defaultNumber,
}));

// Original five-by-seven geometric digits. No font, bitmap texture or decal.
const glyphs = {
  0: ['01110','11011','11011','11011','11011','11011','01110'],
  1: ['00110','01110','00110','00110','00110','00110','01111'],
  2: ['01110','11011','00011','00110','01100','11000','11111'],
  3: ['11110','00011','00011','01110','00011','00011','11110'],
  4: ['11011','11011','11011','11111','00011','00011','00011'],
  5: ['11111','11000','11000','11110','00011','00011','11110'],
  6: ['01110','11000','11000','11110','11011','11011','01110'],
  7: ['11111','00011','00110','00110','01100','01100','01100'],
  8: ['01110','11011','11011','01110','11011','11011','01110'],
  9: ['01110','11011','11011','01111','00011','00011','01110'],
};

function closestColor(c, candidates) {
  return candidates.some(v => v.every((n, i) => Math.abs(n - c[i]) < .012));
}
function region(p, c) {
  const y = p[1];
  if (closestColor(c, [[.019,.491,.418]])) return 'shirt';
  if (closestColor(c, [[.009,.027,.067]])) return 'shorts';
  if (closestColor(c, [[.847,.888,.723]])) return 'socks';
  if (closestColor(c, [[.009,.036,.070]])) return 'trim';
  if (closestColor(c, [[1,.768,.413]])) return y > .7 ? 'trim' : y > .35 ? 'shorts-trim' : 'boot-trim';
  if (closestColor(c, [[1,.246,.141]])) return 'boots';
  return 'preserve';
}

const pristine = await io.readBinary(sourceBytes);
const body = pristine.getRoot().listNodes().find(n => n.getSkin());
const primitive = body.getMesh().listPrimitives()[0];
const positions = primitive.getAttribute('POSITION');
const colors = primitive.getAttribute('COLOR_0');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
const index = primitive.getIndices().getArray();
const labels = Array.from({length: positions.getCount()}, (_, i) => region(positions.getElement(i, []), colors.getElement(i, [])));
const backTriangles = [];
for (let i = 0; i < index.length; i += 3) {
  const ids = Array.from(index.slice(i, i + 3));
  if (ids.every(v => labels[v] === 'shirt')) {
    const ps = ids.map(v => positions.getElement(v, []));
    if (ps.every(p => p[2] < .015)) backTriangles.push({ids, ps});
  }
}

// Ray along +Z through the back garment. Copy barycentric skin influences so
// the number deforms with the cloth, including the Spine/Chest transition.
function project(x, y) {
  let hit;
  for (const {ids, ps: [a,b,c]} of backTriangles) {
    const den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(den) < 1e-10) continue;
    const u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
    const v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
    const w = 1-u-v;
    if (Math.min(u,v,w) < -1e-5) continue;
    const z = a[2]*u+b[2]*v+c[2]*w;
    if (hit && hit.z <= z) continue;
    const merged = new Map();
    for (let k = 0; k < 3; k++) {
      const ji = joints.getElement(ids[k], []), wi = weights.getElement(ids[k], []);
      for (let j = 0; j < 4; j++) merged.set(ji[j], (merged.get(ji[j]) || 0) + wi[j]*[u,v,w][k]);
    }
    const influences = [...merged].filter(([,v]) => v > 1e-8).sort((a,b) => b[1]-a[1]).slice(0,4);
    const sum = influences.reduce((s,[,v]) => s+v,0);
    while (influences.length < 4) influences.push([0,0]);
    hit = {z, p: [x,y,z-.0018], j: influences.map(v => v[0]), w: influences.map(v => v[1]/sum)};
  }
  if (!hit) throw Error(`Back-number projection missed the garment at ${x}, ${y}.`);
  return hit;
}

function numeralData(number) {
  const out = {positions: [], normals: [], joints: [], weights: [], indices: []};
  const digits = String(number), cw = .014, ch = .023, width = (digits.length*6-1)*cw;
  for (let d = 0; d < digits.length; d++) for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
    if (glyphs[digits[d]][row][col] !== '1') continue;
    // Four small facets per cell follow the low-poly jersey surface closely.
    for (let sy=0;sy<2;sy++) for (let sx=0;sx<2;sx++) {
      const x = width/2-(d*6+col)*cw-sx*cw/2;
      const y = .985-row*ch-sy*ch/2;
      const base = out.positions.length/3;
      for (const [dx,dy] of [[0,0],[-cw/2,0],[-cw/2,-ch/2],[0,-ch/2]]) {
        const p = project(x+dx,y+dy);
        out.positions.push(...p.p);out.normals.push(0,0,-1);out.joints.push(...p.j);out.weights.push(...p.w);
      }
      // Viewed from -Z; correct front-facing winding.
      out.indices.push(base,base+2,base+1,base,base+3,base+2);
    }
  }
  return out;
}
const numerals = Array.from({length:11},(_,i) => numeralData(i+1));
function addNumber(doc, skin, number, hex = '#FFFFFF') {
  const data = numerals[number-1], count = data.positions.length/3, name = `BackNumber_${String(number).padStart(2,'0')}`;
  const material = doc.createMaterial('Unbranded number / COLOR_0').setRoughnessFactor(.9).setMetallicFactor(0).setDoubleSided(true);
  const p = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', accessor(doc,name+' positions','VEC3',new Float32Array(data.positions)))
    .setAttribute('NORMAL', accessor(doc,name+' normals','VEC3',new Float32Array(data.normals)))
    .setAttribute('COLOR_0', accessor(doc,name+' linear colors','VEC3',new Float32Array(Array.from({length:count},()=>rgb(hex)).flat())))
    .setAttribute('JOINTS_0', accessor(doc,name+' joints','VEC4',new Uint16Array(data.joints)))
    .setAttribute('WEIGHTS_0', accessor(doc,name+' weights','VEC4',new Float32Array(data.weights)))
    .setIndices(accessor(doc,name+' indices','SCALAR',new Uint16Array(data.indices)));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)).setSkin(skin)
    .setExtras({role:'back-number', number, method:'surface-projected geometry with interpolated canonical skin weights', offsetMeters:.0018});
  doc.getRoot().listScenes()[0].addChild(node);
}

const records = [];
function removeAnimation(animation){
  // glTF Transform disposal is not recursive: orphan channels otherwise keep
  // all of the removed clips' accessors alive in the output buffer.
  const samplers=animation.listSamplers();
  for(const channel of animation.listChannels())channel.dispose();
  for(const sampler of samplers)sampler.dispose();
  animation.dispose();
}
for (const kit of kits) {
  const doc = await io.readBinary(sourceBytes);
  // Preserve the existing authored run, but avoid eight copies of five clips.
  for (const a of doc.getRoot().listAnimations()) if (a.getName() !== 'run') removeAnimation(a);
  await doc.transform(resample());
  const mesh = doc.getRoot().listMeshes()[0], p = mesh.listPrimitives()[0];
  for (const t of p.listTargets()) t.dispose();
  mesh.setWeights([]).setExtras({role:'canonical-footballer', kitId:kit.id});
  for(const node of doc.getRoot().listNodes())if(node.getMesh())node.setWeights([]);
  const c = p.getAttribute('COLOR_0'), pos = p.getAttribute('POSITION'), counts = {};
  const palette = Object.fromEntries(Object.entries(kit.palette).map(([k,v])=>[k,rgb(v)]));
  const arr = new Float32Array(c.getCount()*3);
  for (let i = 0; i < c.getCount(); i++) {
    const point = pos.getElement(i,[]), r = labels[i];
    counts[r] = (counts[r] || 0) + 1;
    let color = c.getElement(i,[]);
    if (r==='shirt') {
      const side = kit.pattern==='side' && Math.abs(point[0])>.105;
      const shoulder = kit.pattern==='shoulder' && point[1]>.993;
      color = palette[side||shoulder?'trim':'shirt'];
    } else if (r==='shorts') color=palette.shorts;
    else if (r==='socks') color=palette.socks;
    else if (['trim','shorts-trim','boot-trim'].includes(r)) color=palette.trim;
    else if (r==='boots') color=rgb('#1C2632');
    arr.set(color,i*3);
  }
  c.setArray(arr).setNormalized(false);
  p.getMaterial().setName('Kit '+kit.id+' / linear COLOR_0').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.9).setMetallicFactor(0);
  const skin = doc.getRoot().listSkins()[0];
  addNumber(doc, skin, kit.defaultNumber, kit.palette.number);
  doc.getRoot().setExtras({package:'soccer-kits-venues-v1',kit,canonicalBoneCount:18,colorEncoding:'linear-sRGB COLOR_0; no textures'});
  const record = await save(doc, `kits/${kit.id}.glb`);
  records.push({...kit,...record,regions:counts,animations:['run']});
}

// A small library of all eleven numbers, sharing the identical bind skeleton.
// Its eleven meshes are alternatives: consumers attach exactly one.
const library = await io.readBinary(sourceBytes);
for (const a of library.getRoot().listAnimations()) removeAnimation(a);
for (const node of library.getRoot().listNodes()) if (node.getMesh()) {
  node.setMesh(null).setSkin(null).setWeights([]);node.dispose();
}
for (const mesh of library.getRoot().listMeshes()) mesh.dispose();
const skin = library.getRoot().listSkins()[0];
for(let i=1;i<=11;i++)addNumber(library,skin,i);
const numbers = await save(library, 'kits/numbers-01-11.glb');
await writeJSON('rig.json',{...rig,source:{file:'../soccer-v5/rig.json',sha256:sha(rigBytes)},
  contract:{file:'../motion2/soccer.json',sha256:sha(contractBytes),scope:'joint names, order and parents'},
  note:'Bind transforms and inverse binds are retained from soccer-v5, not replaced by the motion library rest pose.'});
await writeJSON('kits.json',{schemaVersion:1,encoding:'linear-sRGB COLOR_0',textureImages:0,canonicalBones:18,
  source:{file:source,sha256:sha(sourceBytes),license:'CC0-1.0'},
  numberLibrary:{...numbers,range:[1,11],selection:'one mesh at a time; bind to the kit skeleton with apply.mjs'},kits:records});
