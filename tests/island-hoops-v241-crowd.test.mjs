// Basketball v24.1, Roy: "the crowd in basketball is cardboard". The Codex hoops-crowd-3d-v1 fans on the v8 hall's lower tier, in a
// triangle budget per quality tier, with the cards back under the hall's frame-time governor (hoops-crowd3d.mjs, `?hoopsCrowd3d=0` = v24).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import {seatingLayout} from '../workout/island/minigames/hoops-v8-venue.mjs';
import {hoopsCrowdSeats,hoopsCrowdBudget,seatsInView,createHoopsCrowd3d,hideCardsUnder,HOOPS_CROWD_VARIANTS} from '../workout/island/minigames/hoops-crowd3d.mjs';

const island=new URL('../workout/island/',import.meta.url);
const sha=async rel=>createHash('sha256').update(await readFile(new URL(rel,island))).digest('hex');

test('crowd seats: the lower tier of the v8 hall without the stand under the camera, 796 fans, six seated figures, mostly home colours',()=>{
  const layout=seatingLayout(0),seats=hoopsCrowdSeats(layout);
  assert.equal(seats.length,796);
  assert.ok(seats.every(s=>layout[s.id].tier===0&&Math.abs(layout[s.id].angle)>1e-6),'lower tier, no near sideline');
  assert.equal(new Set(seats.map(s=>s.id)).size,seats.length);
  assert.ok(seats.every(s=>HOOPS_CROWD_VARIANTS.includes(s.variant)&&(s.team===0||s.team===1)));
  const home=seats.filter(s=>s.team===0).length/seats.length,raised=seats.filter(s=>s.variant%3===1).length/seats.length;
  assert.ok(home>.62&&home<.78,'home share '+home);assert.ok(raised>.08&&raised<.22,'arms up at rest '+raised);
  const own=seats.filter(s=>s.shirt===-1).length/seats.length;assert.ok(own>.4&&own<.65,'team shirts '+own);
  assert.ok(seats.every(s=>s.shirt===-1||Number.isInteger(s.shirt)&&s.shirt>=0&&s.shirt<10),'everyday shirt index');
  assert.deepEqual(hoopsCrowdSeats(layout),seats,'deterministic');
});

test('crowd budget per tier: 24K / levels 1-2 at quality 2, 10K / level 2 at quality 1 or after one governor step, cards after two; full = Codex 70K',()=>{
  assert.equal(hoopsCrowdBudget({mode:'off'}),null);
  assert.deepEqual(hoopsCrowdBudget({quality:2,arenaLod:0}),{levels:[1,2],triangles:24000,cull:true,replanSeconds:.25,tier:'high'});
  assert.deepEqual(hoopsCrowdBudget({quality:1,arenaLod:0}),{levels:[2],triangles:10000,cull:true,replanSeconds:.25,tier:'low'});
  assert.equal(hoopsCrowdBudget({quality:2,arenaLod:1}).tier,'low');
  assert.equal(hoopsCrowdBudget({quality:2,arenaLod:2}),null);assert.equal(hoopsCrowdBudget({quality:0}),null);
  assert.deepEqual(hoopsCrowdBudget({mode:'full'}).levels,[0,1,2]);assert.equal(hoopsCrowdBudget({mode:'full'}).triangles,70000);
});

test('the crowd runtime files are the pack files byte for byte (assets.json hashes); the level policy module is the pack\'s, unchanged',async()=>{
  const manifest=JSON.parse(await readFile(new URL('assets/hoops-v241/crowd/assets.json',island),'utf8'));
  let n=0;for(const a of manifest.assets){if(!HOOPS_CROWD_VARIANTS.includes(a.variant))continue;assert.equal(await sha('assets/hoops-v241/crowd/'+a.file),a.sha256,a.file);n++;}
  assert.equal(n,18);
  // sha256 of design/hoops-crowd-3d-v1/runtime/lod-policy.mjs on codex/hoops-crowd-3d-v1 (9486fac3)
  assert.equal(await sha('assets/hoops-v241/crowd/runtime/lod-policy.mjs'),'5e99dc3761996f0235271736926d01c7cce8ea761b5f585c99cafeafc8b9b57e');
  assert.match(await readFile(new URL('assets/hoops-v241/crowd/LICENSES.md',island),'utf8'),/CC0-1\.0/);
  const offline=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8'));
  // levels 1-2 are kept on the device; level 0 is only the `?hoopsCrowd3d=full` comparison and stays online (the island's 80 MB offline cap)
  for(const a of manifest.assets)if(HOOPS_CROWD_VARIANTS.includes(a.variant))assert.equal(offline.games.hoops.includes('assets/hoops-v241/crowd/'+a.file),a.level>0,'offline: '+a.file);
  for(const f of ['assets.json','lod-config.json'])assert.ok(offline.games.hoops.includes('assets/hoops-v241/crowd/'+f),'offline: '+f);
});

/** node: GLTFLoader reads the runtime files from disk (the page fetches them). */
async function diskCrowd(seats,mode){
  globalThis.self??=globalThis;const {GLTFLoader}=await import('../workout/island/vendor/GLTFLoader.js');
  class DiskLoader extends GLTFLoader{loadAsync(url){const bytes=readFileSync(fileURLToPath(url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);return new Promise((resolve,reject)=>this.parse(buffer,'',resolve,reject));}}
  const fetcher=async url=>{const text=readFileSync(fileURLToPath(url),'utf8');return {ok:true,json:async()=>JSON.parse(text)};};
  return createHoopsCrowd3d({T,GLTFLoader:DiskLoader,seats,mode,fetcher,teamColors:['#e55b3e','#40aab6']});
}
/** The broadcast camera of hoops-view (cameraFor, landscape), following the ball along the court. */
function broadcastCamera(x=0){const c=new T.PerspectiveCamera(30,844/390,.1,200);c.position.set(x,6.4,-(7.62+7));c.lookAt(x,1.45,0);c.updateMatrixWorld();c.updateProjectionMatrix();return c;}

test('crowd 3D: seats out of the broadcast view are not drawn, the triangles stay in the tier budget, 12 draw calls at most',async()=>{
  const seats=hoopsCrowdSeats(seatingLayout(0)),crowd=await diskCrowd(seats,'budget');
  try{
    assert.equal(crowd.metrics.files,12,'six figures x levels 1 and 2 (no level 0 in budget mode)');
    for(const x of [-10,0,10]){
      const camera=broadcastCamera(x);
      crowd.update({seconds:1+x+20,camera,budget:hoopsCrowdBudget({quality:2}),ballPosition:new T.Vector3(x,1,0)});
      const m=crowd.metrics;
      assert.ok(m.inView>80&&m.inView<seats.length,'in view at x='+x+': '+m.inView);
      assert.ok(m.triangles<=24000,'triangles '+m.triangles);assert.ok(m.draws<=12,'draws '+m.draws);
      assert.equal(m.submitted[0],0,'no level 0');
      const view=seatsInView(seats,new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements);
      assert.equal(m.inView,view.reduce((a,b)=>a+b,0),'exactly the seats in view');
    }
    crowd.update({seconds:50,camera:broadcastCamera(0),budget:hoopsCrowdBudget({quality:1})});
    assert.equal(crowd.metrics.tier,'low');assert.equal(crowd.metrics.submitted[1],0);assert.ok(crowd.metrics.triangles<=10000);
    crowd.update({seconds:51,camera:broadcastCamera(0),budget:null});assert.equal(crowd.visible,false,'no budget: the caller shows the cards');
  }finally{crowd.dispose();}
});

test('crowd 3D: the plan waits a quarter second while the camera follows, and re-plans at once on a cut',async()=>{
  const seats=hoopsCrowdSeats(seatingLayout(0)),crowd=await diskCrowd(seats,'budget'),budget=hoopsCrowdBudget({quality:2});
  try{
    const cam=broadcastCamera(0);crowd.update({seconds:10,camera:cam,budget});const p0=crowd.metrics.plans;
    cam.position.x+=.2;cam.updateMatrixWorld();crowd.update({seconds:10.05,camera:cam,budget});assert.equal(crowd.metrics.plans,p0,'small follow: no re-plan');
    crowd.update({seconds:10.3,camera:cam,budget});assert.equal(crowd.metrics.plans,p0+1,'after 0.25 s');
    const cut=new T.PerspectiveCamera(50,844/390,.1,200);cut.position.set(14,1.2,2);cut.lookAt(10,1.5,0);cut.updateMatrixWorld();
    crowd.update({seconds:10.32,camera:cut,budget});assert.equal(crowd.metrics.plans,p0+2,'a cut re-plans at once');
  }finally{crowd.dispose();}
});

test('crowd 3D full mode (comparison on a phone): Codex levels 0-2, no culling, inside its 70K budget',async()=>{
  const seats=hoopsCrowdSeats(seatingLayout(0)),crowd=await diskCrowd(seats,'full');
  try{
    assert.equal(crowd.metrics.files,18);
    crowd.update({seconds:1,camera:broadcastCamera(0),budget:hoopsCrowdBudget({mode:'full'})});
    assert.equal(crowd.metrics.inView,seats.length,'every fan submitted');assert.ok(crowd.metrics.triangles<=70000,'triangles '+crowd.metrics.triangles);
  }finally{crowd.dispose();}
});

test('cards under the 3D fans are hidden on every level of the hall (upper deck and near side stay) and come back',()=>{
  const seats=hoopsCrowdSeats(seatingLayout(0)),levels=[0,1,2].map(level=>{
    const layout=seatingLayout(level),mesh=new T.InstancedMesh(new T.PlaneGeometry(.66,1.1),new T.MeshBasicMaterial(),layout.length),d=new T.Object3D();
    layout.forEach((p,i)=>{d.position.set(p.x,p.y+.08,p.z);d.rotation.set(0,p.angle,0);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});return {mesh,layout};});
  const hide=hideCardsUnder(T,levels.map(l=>l.mesh),seats),m=new T.Matrix4(),s=new T.Vector3();
  const zeroed=({mesh,layout})=>layout.map((p,i)=>{mesh.getMatrixAt(i,m);s.setFromMatrixScale(m);return s.x===0;});
  const z0=zeroed(levels[0]);assert.equal(z0.filter(Boolean).length,796,'level 0: exactly the 3D seats');
  levels[0].layout.forEach((p,i)=>assert.equal(z0[i],p.tier===0&&Math.abs(p.angle)>1e-6,'seat '+i));
  for(const k of [1,2]){const z=zeroed(levels[k]);levels[k].layout.forEach((p,i)=>{if(p.tier===1||Math.abs(p.angle)<1e-6)assert.equal(z[i],false,'level '+k+' keeps seat '+i);});assert.ok(z.filter(Boolean).length>200,'level '+k+': '+z.filter(Boolean).length);}
  hide.restore();for(const l of levels)assert.equal(zeroed(l).filter(Boolean).length,0,'restored');
});
