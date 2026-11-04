import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../viewer/draco/DRACOLoader.js';
import {clone} from '../../vendor/SkeletonUtils.js';
const $=id=>document.getElementById(id),stage=$('stage');
const scene=new T.Scene();scene.background=new T.Color('#b4c6ca');
const camera=new T.PerspectiveCamera(44,1,.05,500);
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
stage.append(renderer.domElement);
scene.add(new T.HemisphereLight(0xeaf5ff,0x5c6951,1.8));
const sun=new T.DirectionalLight(0xfff2d9,2.4);sun.position.set(-25,60,28);scene.add(sun);
const fill=new T.DirectionalLight(0xd1e9ff,.65);fill.position.set(40,15,-20);scene.add(fill);
const decoder=new DRACOLoader().setDecoderPath(new URL('../viewer/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(decoder);
const actors=[],errors=[];let manifest,stadium,view='main',playing=false,kit='home',elapsed=0;
let target=new T.Vector3(),yaw=0,pitch=.6,distance=100,focus,selected='idle',disposed=false;
const names={idle:'עמידה',run:'ריצה',sprint:'ספרינט',kick:'בעיטה',pass:'מסירה',throw_in:'הוצאת חוץ',keeper_throw:'הוצאת שוער ביד',keeper_punt:'הוצאת שוער ברגל',keeper_dive_left:'זינוק לשמאל',keeper_dive_right:'זינוק לימין'};
const viewNames={main:'המצלמה הראשית',stadium:'מבט על היציעים',player:'שחקן · תלבושת אחידה',keeper:'שוער · כפפות ותנועה',turf:'דשא · פסי כיסוח ופרטים'};
const white=new T.MeshBasicMaterial({color:'#102e25',transparent:true,opacity:.20,depthWrite:false});
const shadowGeometry=new T.CircleGeometry(.38,24);shadowGeometry.rotateX(-Math.PI/2);

function tint(actor,palette){
  actor.model.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    const colors=o.geometry.attributes.color,regions=o.geometry.attributes._kit_region,names=o.userData.kitRegionNames;
    if(!regions||!names)throw Error('Missing stable kit regions');
    const values=names.map(key=>palette[key]?new T.Color(palette[key]):null);
    for(let i=0;i<colors.count;i++){const color=values[regions.getX(i)];if(color)colors.setXYZ(i,color.r,color.g,color.b);}
    colors.needsUpdate=true;
  });
}
function makeActor(gltf,pos,rotation,isKeeper=false,index=0){
  const model=clone(gltf.scene);model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.frustumCulled=false;}});
  const group=new T.Group();group.add(model);group.position.set(...pos);group.rotation.y=rotation;
  const scale=manifest[isKeeper?'goalkeeper':'soccer-player'].displayScale;model.scale.setScalar(scale);
  const shadow=new T.Mesh(shadowGeometry,white);shadow.position.y=.003;group.add(shadow);scene.add(group);
  const mixer=new T.AnimationMixer(model),clips=gltf.animations;
  const actor={model,group,mixer,clips,isKeeper,index,action:null};actors.push(actor);
  tint(actor,isKeeper?manifest.palette.keeper:manifest.palette[index%2?'away':'home']);
  const idle=clips.find(c=>c.name==='idle');actor.action=mixer.clipAction(idle).play();mixer.setTime(index*.13);return actor;
}
function options(){
  $('clip').replaceChildren(...focus.clips.map(c=>new Option(names[c.name]||c.name,c.name)));
  $('clip').value=focus.clips.some(c=>c.name===selected)?selected:'idle';selected=$('clip').value;
}
function playClip(name,time=0){
  selected=name;elapsed=time;const clip=focus.clips.find(c=>c.name===name);if(!clip)throw Error(`Unknown clip ${name}`);
  focus.mixer.stopAllAction();focus.action=focus.mixer.clipAction(clip);focus.action.reset();
  const spec=manifest.clips[focus.isKeeper?'goalkeeper':'soccer-player'].find(c=>c.name===name);
  focus.action.setLoop(spec.loop?T.LoopRepeat:T.LoopOnce,spec.loop?Infinity:1);focus.action.clampWhenFinished=true;focus.action.play();focus.mixer.setTime(time);
  $('clip').value=name;updateTime();render();
}
function updateTime(){const d=focus?.action?.getClip().duration||1;const t=Math.min(d,focus.action.time);$('time').textContent=`${t.toFixed(2)} / ${d.toFixed(2)}`;$('scrub').value=t/d;}
function setView(name){
  view=name;playing=false;$('play').innerHTML='ניגון <span>▶</span>';
  focus=name==='keeper'?actors.find(a=>a.isKeeper):actors[0];options();playClip(selected);
  let pos,look;
  if(name==='player'||name==='keeper'){
    look=focus.group.position.clone().add(new T.Vector3(0,.95,0));pos=look.clone().add(new T.Vector3(2.5,.25,4.6));
  }else if(name==='stadium'){pos=new T.Vector3(100,102,126);look=new T.Vector3(0,1,0);}
  else{let spec=manifest.cameras[name==='turf'?'turf':'main'];if(name==='main'&&stage.clientWidth<stage.clientHeight)spec=spec.portrait;pos=new T.Vector3(...spec.position);look=new T.Vector3(...spec.target);}
  target.copy(look);const offset=pos.sub(look);distance=offset.length();pitch=Math.asin(offset.y/distance);yaw=Math.atan2(offset.x,offset.z);
  camera.fov=name==='player'||name==='keeper'?30:name==='stadium'?44:manifest.cameras[name==='turf'?'turf':'main'].fov;camera.updateProjectionMatrix();
  for(const a of actors)a.group.visible=name!=='turf'&&(name!=='player'&&name!=='keeper'||a===focus);
  $('viewLabel').textContent=viewNames[name];
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===name));render();
}
function render(){if(disposed)return;camera.position.copy(target).add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));camera.lookAt(target);renderer.render(scene,camera);}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
function setKit(id){kit=id;tint(actors[0],manifest.palette[id]);document.querySelectorAll('[data-kit]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.kit===id));render();}
function dispose(){if(disposed)return;disposed=true;for(const a of actors)a.mixer.stopAllAction();const seen=new Set();scene.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const v of Object.values(m))if(v?.isTexture&&!seen.has(v)){seen.add(v);v.dispose();}if(!seen.has(m)){seen.add(m);m.dispose();}}});decoder.dispose();renderer.dispose();}
const ready=(async()=>{
  const response=await fetch('./manifest.json');if(!response.ok)throw Error('Manifest loading failed');manifest=await response.json();
  const [ground,player,keeper]=await Promise.all(['soccer-stadium','soccer-player','goalkeeper'].map(n=>loader.loadAsync(new URL(`./${n}.glb`,import.meta.url).href)));
  stadium=ground.scene;scene.add(stadium);
  const y=manifest.groundY;
  for(const [i,p] of [[0,[-4,y,8]],[1,[5,y,4]],[2,[-12,y,-8]],[3,[12,y,-13]],[4,[6,y,23]],[5,[-9,y,26]]])makeActor(player,p,i%2?Math.PI:0,false,i);
  makeActor(keeper,[0,y,-50],0,true,6);makeActor(keeper,[0,y,50],Math.PI,true,7);
  setView('main');resize();$('status').textContent='המגרש מוכן';return true;
})();
ready.catch(e=>{errors.push(String(e));$('status').textContent='הטעינה נכשלה · נסו לרענן';console.error(e);});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-kit]').forEach(b=>b.onclick=()=>setKit(b.dataset.kit));
$('reset').onclick=()=>setView(view);
$('clip').onchange=()=>{playing=false;playClip($('clip').value);$('play').innerHTML='ניגון <span>▶</span>';};
$('play').onclick=()=>{if(!focus)return;playing=!playing;if(playing&&focus.action.time>=focus.action.getClip().duration-.001)playClip(selected);$('play').innerHTML=playing?'השהיה <span>Ⅱ</span>':'ניגון <span>▶</span>';};
$('scrub').oninput=()=>{playing=false;$('play').innerHTML='ניגון <span>▶</span>';playClip(selected,+$('scrub').value*focus.action.getClip().duration);};
let dragging=null;
renderer.domElement.onpointerdown=e=>{dragging={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);};
renderer.domElement.onpointermove=e=>{if(!dragging||dragging.id!==e.pointerId)return;yaw-=(e.clientX-dragging.x)*.006;pitch=T.MathUtils.clamp(pitch+(e.clientY-dragging.y)*.004,.03,1.48);dragging.x=e.clientX;dragging.y=e.clientY;render();};
renderer.domElement.onpointerup=renderer.domElement.onpointercancel=()=>dragging=null;
renderer.domElement.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),view==='player'||view==='keeper'?1.5:3,300);render();};
window.addEventListener('resize',resize);window.addEventListener('pagehide',dispose);
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('play').innerHTML='ניגון <span>▶</span>';}});
let last=performance.now();function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(playing&&focus){focus.mixer.update(dt);elapsed+=dt;updateTime();render();}if(!disposed)requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.soccerV4={ready,errors,setView,setKit,playClip,render,resize,dispose,get manifest(){return manifest;},get actors(){return actors;},get focus(){return focus;},get renderer(){return renderer;},get stadium(){return stadium;},get camera(){return camera;},get view(){return view;},get playing(){return playing;}};
