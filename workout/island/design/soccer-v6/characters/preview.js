import * as THREE from '../../../vendor/three.module.js';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../../vendor/DRACOLoader.js';
import {clone} from '../../../vendor/SkeletonUtils.js';
import {createStadium} from './stadium.js';

const $ = id => document.getElementById(id);
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#11202b');
const camera = new THREE.PerspectiveCamera(34,1,.05,180);
const stadium = createStadium(scene, renderer);
const draco = new DRACOLoader().setDecoderPath('../../../vendor/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map(), digests = new Map(), loadErrors = [];
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let manifest, motion, clearance;
let characterID='player-01', kitID='home', lod='auto', view='hero', clipID='idle';
let hero=null, match=[], actors=[], playing=true, speed=1, time=0, yaw=.30, pitch=.06;
let pending=0, elapsed=0, frames=0, fps=0, dead=false, frameHandle, renderDelta=0;

function fetchJSON(path, optional=false) {
  return fetch(path).then(async r=>{
    if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
    const content=await r.text();
    if(globalThis.crypto?.subtle){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));digests.set(path,Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));}
    return JSON.parse(content);
  }).catch(e=>{if(optional)return null;throw e;});
}
function definitions() {return manifest.characters;}
function definition(id=characterID) {return definitions().find(c=>c.id===id);}
function kits(c) {return c.kits || [{id:'home',lod0:c.lod0,lod1:c.lod1}];}
function selectedKit(c,k=kitID) {const list=kits(c);return list.find(x=>x.id===k)||list[k==='away'?1:0]||list[0];}
function pathFor(c,k,l) {return selectedKit(c,k)[`lod${l}`];}
function level() {return lod==='auto'?(view==='match'?1:0):Number(lod);}
function status(s) {$('status').textContent=s;}
function options(id,list) {$(id).replaceChildren(...list.map(([value,text])=>Object.assign(document.createElement('option'),{value,textContent:text})));}
const clipLabels={idle:'עמידה',run:'ריצה',sprint:'ספרינט',decelerate:'האטה',turn_left:'פנייה חדה לשמאל',turn_right:'פנייה חדה לימין',kick_straight:'בעיטה ישרה',kick_curve:'בעיטה מסובבת',pass_short:'מסירה קצרה',pass_long:'מסירה ארוכה',header:'נגיחה',dribble:'כדרור',slide:'גלישה',fall:'נפילה',getup:'קימה',celebrate:'חגיגה',keeper_ready:'שוער · היכון',keeper_dive_left:'שוער · זינוק לשמאל',keeper_dive_right:'שוער · זינוק לימין',keeper_catch:'שוער · תפיסה'};
function clipLabel(id) {return clipLabels[id] || motion.states[id].label || motion.states[id].displayName || id.replaceAll('_',' ');}

async function template(path) {
  if(!path)throw Error('Missing GLB path in asset manifest');
  if(!cache.has(path))cache.set(path,loader.loadAsync(path).then(g=>{
    g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
    return g.scene;
  }));
  const entry=cache.get(path);cache.delete(path);cache.set(path,entry);return entry;
}

function disposeTemplate(model){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  model.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
function trimCache(){
  const keep=new Set(actors.map(a=>a.path));
  for(const path of [...cache.keys()].reverse()){if(keep.size>=14)break;keep.add(path);}
  for(const [path,entry] of cache)if(!keep.has(path)){cache.delete(path);entry.then(disposeTemplate);}
}

function takePose(id,seconds) {
  const c=motion.states[id];
  const t=c.loop?((seconds%c.durationSeconds)+c.durationSeconds)%c.durationSeconds:THREE.MathUtils.clamp(seconds,0,c.durationSeconds);
  const u=t/c.durationSeconds, keys=c.keyframes;
  let lo=0,hi=keys.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(keys[m].time<=u)lo=m;else hi=m;}
  const a=keys[lo],b=keys[hi],w=THREE.MathUtils.clamp((u-a.time)/(b.time-a.time||1),0,1);
  const rotations={};
  for(const name of Object.keys(a.rotations))rotations[name]=new THREE.Quaternion().fromArray(a.rotations[name]).slerp(new THREE.Quaternion().fromArray(b.rotations[name]),w).toArray();
  return {rotations,hipsOffsetMeters:a.hipsOffsetMeters.map((x,i)=>THREE.MathUtils.lerp(x,b.hipsOffsetMeters[i],w))};
}

function blendPose(a,b,w) {
  return {rotations:Object.fromEntries(Object.keys(b.rotations).map(n=>[n,new THREE.Quaternion().fromArray(a.rotations[n]).slerp(new THREE.Quaternion().fromArray(b.rotations[n]),w).toArray()])),hipsOffsetMeters:a.hipsOffsetMeters.map((x,i)=>THREE.MathUtils.lerp(x,b.hipsOffsetMeters[i],w))};
}

// Continue the displayed pose's measured velocity during a crossfade. This also
// keeps a second interruption continuous when it arrives before the first ends.
function extrapolate(current,previous,dt,t) {
  if(!previous||dt<=0)return current;
  const rotations={};
  for(const n of Object.keys(current.rotations)){
    const q=new THREE.Quaternion().fromArray(current.rotations[n]);
    const d=new THREE.Quaternion().fromArray(previous.rotations[n]).invert().multiply(q);
    if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);
    const angle=2*Math.acos(THREE.MathUtils.clamp(d.w,-1,1)),s=Math.sin(angle/2);
    if(s>1e-7)q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(d.x/s,d.y/s,d.z/s),Math.min(24,angle/dt)*t));
    rotations[n]=q.normalize().toArray();
  }
  return {rotations,hipsOffsetMeters:current.hipsOffsetMeters.map((v,i)=>v+THREE.MathUtils.clamp((v-previous.hipsOffsetMeters[i])/dt,-3,3)*t)};
}

class Actor {
  constructor(model,path,id,phase=0) {
    this.model=model;this.path=path;this.id=id;this.phase=phase;this.bones={};this.meshes=[];this.rest={};
    model.visible=false;
    model.traverse(o=>{if(o.isBone){this.bones[o.name]=o;this.rest[o.name]=o.position.clone();}if(o.isSkinnedMesh)this.meshes.push(o);});
    for(const b of motion.skeleton.bones)if(!this.bones[b.name])throw Error(`${path}: missing canonical bone ${b.name}`);
    this.display=null;this.previous=null;this.fade=null;this.lastDelta=1/30;this.lift=0;this.rawMin=0;
    this.helper=new THREE.SkeletonHelper(model);this.helper.visible=false;this.helper.material.depthTest=false;this.helper.renderOrder=10;scene.add(this.helper);
    scene.add(model);
  }
  change() {if(this.display)this.fade={source:structuredClone(this.display),previous:this.previous,delta:this.lastDelta,elapsed:0};}
  update(seconds,dt=0,exact=false) {
    const sampleTime=seconds+(motion.states[clipID].loop?this.phase:0);
    const target=takePose(clipID,sampleTime);
    let pose=target;
    if(this.fade){
      this.fade.elapsed+=dt;
      const u=THREE.MathUtils.clamp(this.fade.elapsed/.22,0,1),w=u*u*(3-2*u);
      pose=blendPose(extrapolate(this.fade.source,this.fade.previous,this.fade.delta,this.fade.elapsed),target,w);
      if(u===1)this.fade=null;
    }
    this.previous=this.display;this.display=pose;if(dt>0)this.lastDelta=dt;
    for(const [n,q] of Object.entries(pose.rotations))this.bones[n].quaternion.fromArray(q);
    this.bones.Hips.position.copy(this.rest.Hips).add(tmp.fromArray(pose.hipsOffsetMeters));
    this.model.position.y=0;this.updateMatrices();
    const baked=this.envelope(sampleTime);
    if(exact||this.fade||baked===null){this.rawMin=this.minimumY();this.lift=Math.max(0,.002-this.rawMin);}
    else this.lift=baked;
    this.model.position.y=this.lift;this.updateMatrices();
    this.helper.visible=$('skeleton').checked;
  }
  envelope(t) {
    const models=clearance?.models || clearance?.assets;
    const entry=models?.[this.path];
    const track=entry?.clips?.[clipID] || entry?.[clipID];
    if(!track)return null;
    const values=track.requiredLiftMeters || track.lifts || track;
    if(!Array.isArray(values))return null;
    const c=motion.states[clipID],s=c.loop?((t%c.durationSeconds)+c.durationSeconds)%c.durationSeconds:THREE.MathUtils.clamp(t,0,c.durationSeconds);
    const index=s*(track.sampleRateHz || track.sampleRate || clearance.sampleRateHz || clearance.sampleRate ||60),i=Math.min(values.length-1,Math.floor(index));
    return THREE.MathUtils.lerp(values[i],values[Math.min(i+1,values.length-1)],index-i)+.001;
  }
  updateMatrices(){this.model.updateMatrixWorld(true);for(const m of this.meshes)m.skeleton.update();}
  minimumY(){let low=Infinity;for(const m of this.meshes)for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,tmp);tmp.applyMatrix4(m.matrixWorld);low=Math.min(low,tmp.y);}return low;}
  triangles(){let n=0;this.model.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}
  dispose(){scene.remove(this.model,this.helper);for(const skeleton of new Set(this.meshes.map(m=>m.skeleton)))skeleton.dispose();this.helper.geometry.dispose();this.helper.material.dispose();}
}

async function makeActor(c,k,l,phase=0){const path=pathFor(c,k,l);return new Actor(clone(await template(path)),path,c.id,phase);}
function clearActors(){for(const a of actors)a.dispose();actors=[];hero=null;match=[];}

async function rebuild() {
  const ticket=++pending;status('טוען דמויות…');
  const next=[];
  if(view==='hero')next.push(await makeActor(definition(),kitID,level()));
  else {
    const fields=definitions().filter(c=>c.role==='player'||c.role==='field'||c.id.startsWith('player-'));
    const keeper=definitions().find(c=>c.id==='goalkeeper'||c.role==='goalkeeper');
    const slots=Array.from({length:12},(_,n)=>({side:Math.floor(n/6),i:n%6}));
    next.push(...await Promise.all(slots.map(async({side,i})=>{
      const c=i===5&&keeper?keeper:fields[i%fields.length];
      const a=await makeActor(c,side?'away':'home',level(),i*.113+side*.23);
      a.model.position.set((i%3-1)*6+(side?2:-2),0,(side?1:-1)*(i===5?22:3+Math.floor(i/3)*8));
      a.model.rotation.y=side?Math.PI:0;return a;
    })));
  }
  if(ticket!==pending){for(const a of next)a.dispose();return;}
  clearActors();actors=next;
  if(view==='hero')hero=actors[0];else match=actors;
  for(const a of actors){a.update(time,0,true);a.model.visible=true;a.model.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)m.wireframe=$('wireframe').checked;}});}
  $('character-label').textContent=view==='hero'?(definition().label||definition().name||characterID):'6 × 6';
  $('triangles').textContent=Math.round(actors.reduce((n,a)=>n+a.triangles(),0)).toLocaleString('en');
  const paths=[...new Set(actors.map(a=>a.path))];
  let bytes=0;
  for(const path of paths){const r=await fetch(path,{method:'HEAD'});bytes+=Number(r.headers.get('content-length')||0);}
  $('asset-size').textContent=`${(bytes/1e6).toFixed(2)} MB`;
  trimCache();status(view==='hero'?'מוכן · גררו לסיבוב':'מוכן · 12 שחקנים');resize();render();
}

function resize(){const rect=canvas.parentElement.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();placeCamera();}
function placeCamera(){
  scene.traverse(o=>{if(o.isDirectionalLight&&o.castShadow){const shadow=o.shadow.camera,close=view==='hero';shadow.left=close?-4:-23;shadow.right=close?4:23;shadow.top=close?5:32;shadow.bottom=close?-3:-32;shadow.updateProjectionMatrix();o.shadow.normalBias=close?.004:.022;}});
  if(view==='match'){
    const spec=stadium.matchCamera;camera.fov=camera.aspect<1?58:46;
    if(camera.aspect>=1){camera.position.set(34,23,0).multiplyScalar(Math.max(1,1.85/camera.aspect));camera.lookAt(0,0,0);}
    else{camera.position.fromArray(spec.position).multiplyScalar(1.30);camera.lookAt(...spec.target);}
  } else {
    camera.fov=camera.aspect<1?35:32;
    const r=camera.aspect<1?3.35:3.6;
    camera.position.set(Math.sin(yaw)*r,1.0+pitch,Math.cos(yaw)*r);camera.lookAt(0,.86,0);
  }
  camera.updateProjectionMatrix();
}
function render(){renderer.render(scene,camera);$('draws').textContent=renderer.info.render.calls;}
function setClip(id){if(!motion.states[id])throw Error(`Unknown clip: ${id}`);for(const a of actors)a.change();clipID=id;time=0;$('clip').value=id;$('clip-label').textContent=clipLabel(id);for(const a of actors){if(!playing)a.fade=null;a.update(time,0);}updateTime();render();}
function seek(u){time=THREE.MathUtils.clamp(u,0,1)*motion.states[clipID].durationSeconds;for(const a of actors){a.fade=null;a.update(time,0);a.previous=null;}updateTime();render();}
function updateTime(){const c=motion.states[clipID];const t=c.loop?time%c.durationSeconds:Math.min(time,c.durationSeconds);$('scrub').value=t/c.durationSeconds;$('time').textContent=`${t.toFixed(2)} / ${c.durationSeconds.toFixed(2)}`;}
function setPlaying(value){playing=value;$('play').textContent=playing?'השהיה':'נגן';$('play').setAttribute('aria-label',playing?'השהיה':'נגן');$('play').setAttribute('aria-pressed',String(playing));}
function tick(){
  if(dead)return;
  frameHandle=requestAnimationFrame(tick);
  const wallDelta=clock.getDelta();elapsed+=wallDelta;renderDelta+=wallDelta;
  if(renderDelta<1/30)return;
  const dt=Math.min(.1,renderDelta);renderDelta%=1/30;frames++;
  if(elapsed>=.5){fps=Math.round(frames/elapsed);$('fps').textContent=fps;elapsed=0;frames=0;}
  if(playing){time+=dt*speed;for(const a of actors)a.update(time,dt*speed);updateTime();}
  stadium.update(clock.elapsedTime);render();
}

const api={renderer,scene,camera,loadErrors,get actors(){return actors;},get motion(){return motion;},get manifest(){return manifest;},get clearanceReady(){return Boolean(clearance);},get clip(){return clipID;},get time(){return time;},get playing(){return playing;},get view(){return view;},
  setClip,seek,setPlaying,resize,
  async setCharacter(id){characterID=id;$('character').value=id;return rebuild();},
  async setKit(id){kitID=id;$('kit').value=id;return rebuild();},
  async setLOD(value){lod=String(value);$('lod').value=lod;return rebuild();},
  async setView(value){view=value;$('view').value=value;return rebuild();},
  step(seconds){time+=seconds;for(const a of actors)a.update(time,seconds);updateTime();render();},
  probe(exact=true){for(const a of actors)a.update(time,0,exact);render();return {actors:actors.length,clip:clipID,lod:level(),calls:renderer.info.render.calls,triangles:actors.reduce((n,a)=>n+a.triangles(),0),minimumY:Math.min(...actors.map(a=>a.minimumY())),lifts:actors.map(a=>a.lift),paths:actors.map(a=>a.path),bakedEnvelopeAvailable:actors.every(a=>a.envelope(time)!==null),finite:actors.every(a=>a.meshes.every(m=>m.skeleton.boneMatrices.every(Number.isFinite)))};},
  dispose(){dead=true;cancelAnimationFrame(frameHandle);clearActors();for(const entry of cache.values())entry.then(disposeTemplate);cache.clear();stadium.dispose();draco.dispose();renderer.dispose();}
};
window.soccerCharacters=api;
api.ready=(async()=>{
  [manifest,motion,clearance]=await Promise.all([fetchJSON('./asset-manifest.json'),fetchJSON('./motion/soccer-v6.json'),fetchJSON('./motion/floor-clearance.json',true)]);
  // A stale envelope must never mask changes to the canonical motion file.
  if(clearance?.motion?.sha256!==digests.get('./motion/soccer-v6.json'))clearance=null;
  options('character',definitions().map(c=>[c.id,c.label||c.name||c.id]));
  options('clip',Object.keys(motion.states).map(id=>[id,clipLabel(id)]));
  characterID=definitions()[0].id;clipID='idle';$('character').value=characterID;$('clip-label').textContent=clipLabel(clipID);
  $('character').addEventListener('change',e=>api.setCharacter(e.target.value).catch(fail));
  $('clip').addEventListener('change',e=>setClip(e.target.value));
  $('kit').addEventListener('change',e=>api.setKit(e.target.value).catch(fail));
  $('lod').addEventListener('change',e=>api.setLOD(e.target.value).catch(fail));
  $('view').addEventListener('change',e=>api.setView(e.target.value).catch(fail));
  $('play').addEventListener('click',()=>setPlaying(!playing));
  $('reset').addEventListener('click',()=>{yaw=.30;pitch=.06;placeCamera();seek(0);});
  $('scrub').addEventListener('input',e=>{setPlaying(false);seek(Number(e.target.value));});
  $('speed').addEventListener('change',e=>speed=Number(e.target.value));
  $('skeleton').addEventListener('change',()=>{for(const a of actors)a.helper.visible=$('skeleton').checked;});
  $('wireframe').addEventListener('change',()=>{for(const a of actors)a.model.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.wireframe=$('wireframe').checked;});});
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||view!=='hero')return;yaw-=(e.clientX-pointer.x)*.008;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-pointer.y)*.003,-.3,.9);pointer={x:e.clientX,y:e.clientY};placeCamera();});
  canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('pointercancel',()=>pointer=null);
  new ResizeObserver(resize).observe(canvas.parentElement);
  await rebuild();setPlaying(true);tick();return true;
})().catch(e=>{fail(e);throw e;});
function fail(e){loadErrors.push(String(e));status(`שגיאה: ${e.message}`);console.error(e);}
