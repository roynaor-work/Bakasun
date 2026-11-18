/** Contact sheets of the real game pipelines for the shared athlete body (soccer: loadDesignCharacters; basketball: loadAthleteHoops + createAvatarTall).
 * Runs in Chromium (tools/athletes/body-v22-shots.mjs): window.sheet(spec) -> PNG data URL of 8 frames of one clip on one body, plus window.getInfo().
 * `?athleteBodyV22=0` renders the previous body through exactly the same paths (the "before" sheets). */
import * as THREE from '../../vendor/three.module.js';
import {loadDesignCharacters,prepareSoccerDesignSources} from '../../minigames/soccer-design-character.mjs';
import {loadAthleteHoops} from '../../minigames/hoops-athlete.mjs';
import {createAvatarTall} from '../../minigames/hoops-tall.mjs';

const q=new URLSearchParams(location.search),W=180,H=300,N=8;
const cfgAll=await (await fetch('../../data/config.json')).json();
const canvas=document.getElementById('c');canvas.width=W*N;canvas.height=H;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(W*N,H,false);renderer.setScissorTest(true);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#cfd6dc');
scene.add(new THREE.HemisphereLight(0xffffff,0x778899,2.2));const sun=new THREE.DirectionalLight(0xfff2dc,2.6);sun.position.set(3,6,4);scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x9aa7b0,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const camera=new THREE.PerspectiveCamera(28,W/H,.1,50);

const soccer=cfgAll.minigames.soccer,hoops=cfgAll.minigames.streetSlam;
const info={flag:q.get('athleteBodyV22')!=='0'};
let soccerChars=null,hoopsAssets=null,view=0.9;
async function soccerSetup(){
  if(soccerChars)return soccerChars;
  const roster=[{team:0,role:'field'},{team:1,role:'field'},{team:0,role:'keeper'},{team:1,role:'field'},{team:0,role:'field'},{team:1,role:'field'}];
  const res=await loadDesignCharacters({config:{...soccer,team:{colors:['#2868ee','#ffcf69']},opponent:{colors:['#d63a3a','#f2f2ee']}},roster,scene,track:x=>x,selectedKit:null,numbers:new THREE.DataTexture(new Uint8Array(64*64*4),64,64)});
  const src=await prepareSoccerDesignSources();
  info.soccer={metrics:res.metrics,clips:src.clips,set:src.set,v22:!!src.v22};
  return soccerChars={res,src};
}
async function hoopsSetup(){
  if(hoopsAssets)return hoopsAssets;
  const errors=[];
  const assets=await loadAthleteHoops(hoops.assets,new URL('../../',import.meta.url).href,null,{params:new URLSearchParams(location.search),onFallback:(a,e)=>errors.push(a+': '+e)});
  info.hoops={v22:assets.v22,bodyVersion:assets.bodyVersion,errors,clips:[...assets.clipSets.guard.keys()],dunks:assets.dunks};
  return hoopsAssets=assets;
}
const frame=(i,box)=>{
  const x=i*W;renderer.setViewport(x,0,W,H);renderer.setScissor(x,0,W,H);
  const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()),span=Math.max(s.y*1.15,s.x*1.5,s.z*1.5,1.9);
  const d=span/(2*Math.tan(THREE.MathUtils.degToRad(14)));
  const dir=new THREE.Vector3(Math.sin(view)*Math.cos(.12),Math.sin(.12),Math.cos(view)*Math.cos(.12));
  camera.position.copy(c).addScaledVector(dir,d);camera.lookAt(c);camera.updateProjectionMatrix();renderer.render(scene,camera);
};
window.__av={};
/** spec: {sport:'soccer'|'hoops', slot (soccer roster index) | body (guard|wing|center), clip, view?, n?}. Returns {png, minY, height, duration}. */
window.sheet=async spec=>{
  view=spec.view??0.9;
  let mixer,root,clip;
  if(spec.sport==='soccer'){
    const {res,src}=await soccerSetup();const ch=res.characters[spec.slot??0];
    ch.pivot.position.set(0,0,0);ch.pivot.rotation.set(0,0,0);
    clip=src.clipSets[0].find(c=>c.name===spec.clip);if(!clip)throw Error('no soccer clip '+spec.clip);
    mixer=ch.mixer;root=ch.pivot;res.characters.forEach(c=>{c.pivot.visible=c===ch;});
  }else{
    const assets=await hoopsSetup();
    const key=spec.body+':'+(spec.n||0);
    if(!window.__av[key]){const look={primary:spec.primary||'#5b38c9',trim:'#f4d377',secondary:'#f4d377'};const pos={guard:'PG',wing:'SF',center:'C'}[spec.body];const av=createAvatarTall(assets,{id:'t'+key,pos,number:spec.n||7,look:{skin:spec.n||0},ratings:{}},look,{});scene.add(av.root);window.__av[key]=av;}
    const av=window.__av[key];for(const a of Object.values(window.__av))a.root.visible=a===av;
    clip=assets.clipSets[spec.body].get(spec.clip);if(!clip)throw Error('no hoops clip '+spec.clip);
    mixer=av.mixer;root=av.root;
  }
  mixer.stopAllAction();
  const action=mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopRepeat,Infinity);action.setEffectiveWeight(1);action.play();
  renderer.setScissor(0,0,W*N,H);renderer.setViewport(0,0,W*N,H);renderer.setClearColor(0xcfd6dc);renderer.clear();
  const boxes=[];
  for(let i=0;i<N;i++){
    action.time=clip.duration*i/N;mixer.update(0);root.updateMatrixWorld(true);
    const b=new THREE.Box3();root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let k=0;k<p.count;k+=7){o.getVertexPosition(k,v).applyMatrix4(o.matrixWorld);b.expandByPoint(v);}}});
    boxes.push(b);
  }
  const all=new THREE.Box3();boxes.forEach(b=>all.union(b));
  for(let i=0;i<N;i++){action.time=clip.duration*i/N;mixer.update(0);root.updateMatrixWorld(true);frame(i,all);}
  action.stop();mixer.stopAllAction();
  return {png:canvas.toDataURL('image/png'),minY:boxes.map(b=>+b.min.y.toFixed(3)),height:+(all.max.y-all.min.y).toFixed(3),duration:clip.duration};
};
/** A line-up (one frame of a clip): every soccer roster slot, or the three basketball bodies in two skins each, side by side. */
window.lineup=async spec=>{
  const items=[];
  soccerChars?.res.characters.forEach(c=>{c.pivot.visible=false;});Object.values(window.__av).forEach(a=>{a.root.visible=false;});
  if(spec.sport==='soccer'){const {res,src}=await soccerSetup();const clip=src.clipSets[0].find(c=>c.name===(spec.clip||'idle'));res.characters.forEach((ch,i)=>{ch.pivot.visible=true;ch.pivot.position.set((i-(res.characters.length-1)/2)*1.1,0,0);ch.pivot.rotation.set(0,spec.yaw??0.35,0);ch.mixer.stopAllAction();const a=ch.mixer.clipAction(clip);a.play();a.time=clip.duration*.25;ch.mixer.update(0);items.push(ch.pivot);});}
  else{const assets=await hoopsSetup();let i=0;for(const body of ['guard','wing','center'])for(const n of [1,4]){const key=body+':L'+n,pos={guard:'PG',wing:'SF',center:'C'}[body];if(!window.__av[key]){const av=createAvatarTall(assets,{id:'l'+key,pos,number:n,look:{skin:n},ratings:{}},{primary:n===1?'#5b38c9':'#d63a3a',trim:'#f4d377',secondary:'#f4d377'},{});scene.add(av.root);window.__av[key]=av;}const av=window.__av[key];av.root.visible=true;av.root.position.set((i++-2.5)*1.1,0,0);av.root.rotation.y=spec.yaw??0.35;const clip=assets.clipSets[body].get(spec.clip||'idle')||assets.clipSets[body].get('run');av.mixer.stopAllAction();const a=av.mixer.clipAction(clip);a.play();a.time=clip.duration*.25;av.mixer.update(0);items.push(av.root);}}
  const box=new THREE.Box3();items.forEach(r=>{r.updateMatrixWorld(true);r.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let k=0;k<p.count;k+=7){o.getVertexPosition(k,v).applyMatrix4(o.matrixWorld);box.expandByPoint(v);}}});});
  renderer.setScissor(0,0,W*N,H);renderer.setViewport(0,0,W*N,H);renderer.setClearColor(0xcfd6dc);renderer.clear();
  renderer.setViewport(0,0,W*N,H);renderer.setScissor(0,0,W*N,H);
  const c=box.getCenter(new THREE.Vector3()),sz=box.getSize(new THREE.Vector3());camera.aspect=W*N/H;const d=Math.max(sz.x/camera.aspect,sz.y)*1.15/(2*Math.tan(THREE.MathUtils.degToRad(14)));camera.position.set(c.x,c.y+.2,c.z+d);camera.lookAt(c);camera.updateProjectionMatrix();renderer.render(scene,camera);camera.aspect=W/H;camera.updateProjectionMatrix();
  return canvas.toDataURL('image/png');
};
window.getInfo=async sport=>{if(sport==='soccer')await soccerSetup();else await hoopsSetup();return info;};
window.ready=true;
