// Basketball v24.9, Roy (22/11): "the players look weird and bad" and "keep raising the level". The look layer on the shared athlete body
// (hoops-look-v249.mjs) and the motion offence (hoops-ai.mjs, config play.motion), each behind its URL switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {hoopsLookEnabled,hoopsV249Enabled,cullCoveredSkin,hoopsLookProtect,cullBodyGeometry,patchHoopsLookFragment,hoopsLookProportions,hoopsLookKit,applyHoopsLook,HOOPS_LOOK,HOOPS_LOOK_FRAGMENT,HOOPS_LOOK_CROWD_TINT} from '../workout/island/minigames/hoops-look-v249.mjs';
import {HOOPS_CROWD_TINT} from '../workout/island/minigames/hoops-crowd3d.mjs';
import {motionExchangePair,motionKickSpot} from '../workout/island/minigames/hoops-ai.mjs';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';

const island=new URL('../workout/island/',import.meta.url);
const text=rel=>readFileSync(new URL(rel,island),'utf8');
const cfg=()=>JSON.parse(text('data/config.json')).minigames.streetSlam;

// a GLB body as plain arrays (rest + the basketball morph, as the game culls it)
function body(id){
  const b=readFileSync(new URL('assets/hoops-v241/body/models/'+id+'.glb',island)),jl=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+jl).toString()),bin=b.subarray(20+jl+8);
  const acc=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],C={5126:Float32Array,5123:Uint16Array,5121:Uint8Array,5125:Uint32Array}[a.componentType];
    const get={5126:'getFloat32',5123:'getUint16',5121:'getUint8',5125:'getUint32'}[a.componentType],stride=v.byteStride||n*C.BYTES_PER_ELEMENT,dv=new DataView(bin.buffer,bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0)),out=new C(a.count*n);
    for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=dv[get](k*stride+c*C.BYTES_PER_ELEMENT,true);return out;};
  const mesh=j.meshes[0],p=mesh.primitives[0],positions=acc(p.attributes.POSITION),morph=acc(p.targets[mesh.extras.targetNames.indexOf('basketball')].POSITION);
  for(let i=0;i<positions.length;i++)positions[i]+=morph[i];
  const J=acc(p.attributes.JOINTS_0),W=acc(p.attributes.WEIGHTS_0),names=j.skins[0].joints.map(n=>j.nodes[n].name),wn=p.attributes.WEIGHTS_0&&j.accessors[p.attributes.WEIGHTS_0].componentType===5126?1:255;
  const protect=hoopsLookProtect(positions.length/3,names,(i,k)=>J[i*4+k],(i,k)=>W[i*4+k]/wn);
  return {positions,normals:acc(p.attributes.NORMAL),regions:acc(p.attributes._REGION),index:acc(p.indices),protect};
}

test('switches: the look and the whole v24.9 layer are on by default, `?hoopsLook=0` and `?hoopsV249=0` return v24.8',()=>{
  assert.equal(hoopsLookEnabled(''),true);assert.equal(hoopsLookEnabled('?hoopsLook=0'),false);assert.equal(hoopsLookEnabled('?hoopsV249=0'),false);
  assert.equal(hoopsV249Enabled('?hoopsLook=0'),true);assert.equal(hoopsLookEnabled('?hoopsLook=1&hoopsBodyV2=0'),true);
  const athlete=text('minigames/hoops-athlete.mjs');
  assert.match(athlete,/lookV249=!!v22\?\.v2&&hoopsLookEnabled\(search\)/,'only on the v2 bodies, behind the switch');
  assert.match(athlete,/if\(lookOn&&decoration\)\{try\{lookCtl=applyHoopsLook/,'a failure keeps the v24.8 player');
  assert.match(text('minigames/hoops-view.mjs'),/hoopsLookEnabled\(search\)\?\{tint:HOOPS_LOOK_CROWD_TINT\}:\{\}/);
  const session=text('minigames/hoops-session.mjs');
  assert.match(session,/params\.get\('hoopsV249'\)==='0'\|\|params\.get\('hoopsMotion249'\)==='0'\)&&balance\.play\?\{\.\.\.balance\.play,motion:null\}/);
});

test('the body under the kit: skin triangles under the jersey and the shorts go on the three bodies, nothing else does',()=>{
  for(const id of ['guard','wing','center']){
    const b=body(id),r=cullCoveredSkin(b),before=b.index.length/3;
    assert.ok(r.removed>=120&&r.removed<before*.2,`${id}: ${r.removed} of ${before} triangles`);
    assert.equal(r.index.length,r.kept*3);assert.equal(r.kept+r.removed,before);
    assert.ok(r.studs>=40,`${id}: the football studs under the sole go (${r.studs})`);
    // what is left: every kit, shoe-upper, eye and sock triangle, and every skin triangle of the head, the arms and the lower legs
    const count=(index,keep)=>{let n=0;for(let t=0;t<index.length;t+=3)if(keep(index[t],index[t+1],index[t+2]))n++;return n;};
    for(const region of [1,2,3,4,6,8]){const same=(a,c,d)=>b.regions[a]===region&&b.regions[c]===region&&b.regions[d]===region;assert.equal(count(r.index,same),count(b.index,same),`${id}: region ${region} untouched`);}
    const y=i=>b.positions[i*3+1],outside=(a,c,d)=>b.regions[a]===0&&(Math.min(y(a),y(c),y(d))>1.47||Math.max(y(a),y(c),y(d))<.58);
    assert.equal(count(r.index,outside),count(b.index,outside),`${id}: head and lower legs untouched`);
    const hand=(a,c,d)=>b.regions[a]===0&&[a,c,d].every(i=>Math.abs(b.positions[i*3])>.2||y(i)<.82&&y(i)>.62&&Math.abs(b.positions[i*3])>.12);
    assert.equal(count(r.index,hand),count(b.index,hand),`${id}: hands untouched`);
  }
  // the protection: arms and hands hang beside the shorts in the rest pose and would be 'covered' without it
  const g=body('guard');assert.ok(cullCoveredSkin({...g,protect:null}).removed>cullCoveredSkin(g).removed);
  // no kit: nothing is covered
  const b=body('wing'),bare={...b,regions:new Uint8Array(b.regions.length)};
  assert.equal(cullCoveredSkin({...bare,studs:0}).removed,0);
});

test('the cull on a three.js geometry: once, the original index kept for a way back, the morph read as relative',()=>{
  const b=body('wing'),g=new T.BufferGeometry();
  const rest=new Float32Array(b.positions.length);g.setAttribute('position',new T.BufferAttribute(rest,3));
  g.setAttribute('normal',new T.BufferAttribute(b.normals,3));g.setAttribute('_region',new T.BufferAttribute(b.regions,1));g.setIndex(new T.BufferAttribute(b.index,1));
  g.morphAttributes.position=[new T.BufferAttribute(b.positions,3)];g.morphTargetsRelative=true;
  const mesh={geometry:g,morphTargetDictionary:{basketball:0}},first=cullBodyGeometry(T,mesh),tris=g.index.count/3;
  assert.equal(first.removed,cullCoveredSkin({...b,protect:null}).removed,'no skeleton on this mesh: no protection');assert.equal(tris,first.kept);assert.equal(g.userData.hoopsLookIndex.count,b.index.length);
  assert.equal(cullBodyGeometry(T,mesh),first,'second call is the cached result');assert.equal(g.index.count/3,tris);
  assert.equal(cullBodyGeometry(T,{geometry:new T.BufferGeometry()}),null);
});

test('shader patch: sits after the v2 number block, declares its uniforms, and refuses a shader without the anchor',()=>{
  const v2='void main(){\n#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);\n#include <emissivemap_fragment>\n}';
  const out=patchHoopsLookFragment(v2);
  assert.ok(out.startsWith('uniform vec3 hoopsLookSkin;'));
  assert.ok(out.indexOf('lookSock')>out.indexOf('athleteTrim,cuff'));assert.ok(out.indexOf('hoopsLookRim')>out.indexOf('#include <emissivemap_fragment>'));
  assert.equal(out.split('#include <emissivemap_fragment>').length,2,'the include stays once');
  assert.throws(()=>patchHoopsLookFragment('void main(){}'),/anchor/);
  // the anchor is really in the v2 material the game compiles
  assert.ok(text('minigames/athlete-body-v2.mjs').includes('diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);'));
  for(const name of ['lookSock','lookStripe','lookPanel','lookHem','lookChestUV','lookBrow','lookScalp','lookStrap'])assert.ok(HOOPS_LOOK_FRAGMENT.includes(name),name);
  // a crew sock: over the shoe collar (0.173), far under the mesh sock top (0.396); the stripe inside the sock
  assert.ok(HOOPS_LOOK.sockTop>.22&&HOOPS_LOOK.sockTop<.3);assert.ok(HOOPS_LOOK.sockStripe[0]>.173&&HOOPS_LOOK.sockStripe[1]<HOOPS_LOOK.sockTop);
  // eyebrows just over the eye region of the mesh (1.589 .. 1.613), not in the forehead
  assert.ok(HOOPS_LOOK.brow.y>1.613&&HOOPS_LOOK.brow.y<1.625);
});

test('proportions: a taller body gets a smaller head (never a pinhead), the natural body keeps its own',()=>{
  const g=hoopsLookProportions(1.88),w=hoopsLookProportions(1.98),c=hoopsLookProportions(2.08),n=hoopsLookProportions(1.76);
  assert.equal(n.head,1);assert.ok(g.head>w.head&&w.head>c.head&&c.head>=.86,`${g.head} ${w.head} ${c.head}`);
  assert.ok(c.heads>7.6&&c.heads<8.4,'about eight heads tall: '+c.heads);assert.ok(g.hand<=.94&&c.hand>=.86);
  assert.equal(hoopsLookProportions(NaN).head,1);
});

test('kit: team-coloured shoes that never match the white sock, for light, mid and black kits',()=>{
  for(const primary of ['#1f5fff','#111111','#f4f4f0','#ffd23f','#d91e36']){
    const k=hoopsLookKit({primary,secondary:'#ffffff',shorts:primary});
    assert.match(k.boots,/^#[0-9a-f]{6}$/);assert.notEqual(k.boots,k.socks);assert.equal(k.primary,primary);
    const l=h=>[1,3,5].reduce((s,i,j)=>s+parseInt(h.slice(i,i+2),16)*[.2126,.7152,.0722][j],0)/255;
    assert.ok(l(k.boots)<.6,'not a white shoe: '+k.boots);assert.ok(l(k.boots)>.08,'not a black blob: '+k.boots);
  }
});

test('one player: the look wraps the v2 material once, sets head and hands, follows a kit change; no v2 material, no change',()=>{
  const material=new T.MeshStandardMaterial();material.name='athlete_body_v2';let called=0;
  material.onBeforeCompile=shader=>{called++;shader.fragmentShader+='\ndiffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);';};
  const bones={Head:new T.Object3D(),LeftHand:new T.Object3D(),RightHand:new T.Object3D()},mesh={isSkinnedMesh:true,material};
  const ctl=applyHoopsLook(T,{meshes:{full:[mesh,{isSkinnedMesh:false,material:new T.MeshStandardMaterial()}]},bones,height:2.08},{skin:'#70422d',shirt:'#1f5fff',hair:'#1f1712'});
  assert.ok(ctl);assert.equal(bones.Head.scale.x,hoopsLookProportions(2.08).head);assert.equal(bones.LeftHand.scale.x,ctl.proportions.hand);
  const shader={uniforms:{},fragmentShader:'void main(){}'};material.onBeforeCompile(shader);
  assert.equal(called,1);assert.ok(shader.uniforms.hoopsLookSkin&&shader.fragmentShader.includes('lookSock'));
  assert.notEqual(material.customProgramCacheKey(),'athlete-body-v2-masks-1');
  ctl.setKit({primary:'#d91e36'});assert.equal('#'+ctl.uniforms.hoopsLookShirt.value.getHexString(),'#d91e36');
  assert.equal(applyHoopsLook(T,{meshes:{full:[mesh]},bones,height:2},{}),null,'already wrapped');
  assert.equal(applyHoopsLook(T,{meshes:{full:[{isSkinnedMesh:true,material:new T.MeshStandardMaterial()}]},bones,height:2},{}),null);
  assert.notEqual(HOOPS_LOOK_CROWD_TINT,HOOPS_CROWD_TINT);
});

test('motion offence, pure: the weak side trades spots, the kick-out spot is the open window',()=>{
  const mates=[{id:'a',pos:'SG',z:5},{id:'b',pos:'SF',z:-5},{id:'c',pos:'C',z:-6},{id:'d',pos:'PF',z:6}];
  assert.deepEqual(motionExchangePair(mates,4).map(m=>m.id).sort(),['b','c'],'ball on +z: the two on -z');
  assert.deepEqual(motionExchangePair(mates,-4).map(m=>m.id).sort(),['a','d']);
  assert.equal(motionExchangePair(mates.slice(0,2),4),null,'one man on the weak side: nobody moves');
  assert.equal(motionExchangePair(mates.map(m=>({...m,busy:m.id==='b'})),4),null,'a man catching or screening is left alone');
  const h={x:8,z:0},spot={x:6,z:5};
  assert.deepEqual(motionKickSpot(h,spot,[],[]),spot,'nobody in the way: stay on the spot');
  const blocked=motionKickSpot(h,spot,[{x:7,z:2.5}],[]);assert.notEqual(blocked.z,spot.z,'a defender on the line: slide');
  assert.ok(Math.abs(blocked.z)<=6.6);
  const crowded=motionKickSpot(h,spot,[{x:7,z:2.5}],[{x:6,z:blocked.z}]);assert.notEqual(crowded.z,blocked.z,'not on top of a mate');
});

test('motion offence in the engine: on by config, spots are traded and men slide for the kick; `motion:null` plays without either',()=>{
  const run=play=>{
    const config=cfg(),teams=matchTeams(config,initialHoops(config),{stage:1}).teams;
    const e=createHoopsEngine({config,seed:9037,teams,userTeam:0,profile:'quick',difficulty:'normal',autopilot:true,aiVersion:'v2',...(play?{play}:{})});
    const S=e.debug.state;let swaps=0,kicks=0,score=0;
    for(let i=0;i<60*150&&S.phase!=='final';i++){e.step(NO_INPUT);e.drainEvents();
      for(const t of [0,1]){if(S.teams[t].ai?.swap)swaps++;}
      for(const p of e.snapshot().players)if(p.role==='kick')kicks++;}
    score=S.teams[0].score+S.teams[1].score;return {swaps,kicks,score};
  };
  const config=cfg();assert.equal(config.play.motion.enabled,true);
  const on=run(null),again=run(null),off=run({...config.play,motion:null});
  assert.deepEqual(on,again,'deterministic');
  assert.ok(on.swaps>200,'spots traded: '+on.swaps);assert.equal(off.swaps,0);assert.equal(off.kicks,0);
  assert.ok(on.score>6&&off.score>6,`both versions play a real game (${on.score} / ${off.score})`);
});
