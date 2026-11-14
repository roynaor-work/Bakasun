// Tennis officials v1 viewer. Runtime dependencies are bundled locally.
import * as T from '../vendor/three-gltf-r160.mjs';
const $=id=>document.getElementById(id),base=new URL('../',import.meta.url);
const roles={
 chair:{label:'שופט הכיסא',clips:[['chair_seated','ישיבה בכיסא'],['chair_idle','עמידה'],['chair_score','הכרזת ניקוד'],['chair_good','סימון טוב'],['chair_nod','הנהון']]},
 line:{label:'שופט קו',clips:[['line_idle','עמידה'],['line_out','אאוט — ידיים פרושות'],['line_good','טוב — ידיים למטה']]},
 kid:{label:'ילד כדורים',clips:[['kid_idle','עמידה'],['kid_bend','רכינה'],['kid_run_collect','ריצה לאיסוף'],['kid_roll','גלגול כדור'],['kid_offer','הנפת כדור לשחקן'],['kid_return','חזרה למקום']]}
};
const definitions=[
 {id:'chair-umpire',role:'chair',label:'שופט הכיסא',position:[7.1,0,0],yaw:-Math.PI/2,scale:1},
 {id:'line-judge-01',role:'line',label:'שופט קו 1',position:[-6.7,0,-12.9],yaw:Math.PI/2,scale:1},
 {id:'line-judge-02',role:'line',label:'שופט קו 2',position:[6.7,0,12.9],yaw:-Math.PI/2,scale:1},
 {id:'ball-kid-01',role:'kid',label:'ילד כדורים 1',position:[-7.2,0,-14],yaw:Math.PI/3,scale:.8},
 {id:'ball-kid-02',role:'kid',label:'ילד כדורים 2',position:[7.2,0,-14],yaw:-Math.PI/3,scale:.78},
 {id:'ball-kid-03',role:'kid',label:'ילדת כדורים 3',position:[-7.2,0,14],yaw:2*Math.PI/3,scale:.82},
 {id:'ball-kid-04',role:'kid',label:'ילדת כדורים 4',position:[-7.2,0,.9],yaw:Math.PI/2,scale:.79}
];
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('stage').prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#d9d7bf');scene.fog=new T.Fog('#d9d7bf',43,85);
const camera=new T.PerspectiveCamera(40,1,.05,150),target=new T.Vector3();
const hemisphere=new T.HemisphereLight('#fff7df','#536e5d',2.4);scene.add(hemisphere);
const sun=new T.DirectionalLight('#fff3d6',3.1);sun.position.set(-10,24,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-19,right:19,top:23,bottom:-23,near:1,far:65});sun.shadow.bias=-.0002;scene.add(sun);
const fill=new T.DirectionalLight('#b9e0e0',.7);fill.position.set(12,9,-15);scene.add(fill);
const court=new T.Group();scene.add(court);
const mat=(color,roughness=.9)=>new T.MeshStandardMaterial({color,roughness});
const palette={surround:mat('#557465'),court:mat('#356b70'),line:mat('#eee9d6'),ivory:mat('#d8d5b9'),navy:mat('#243f3a'),net:mat('#21423b')};
function box(p,s,m,parent=court){const v=new T.Mesh(new T.BoxGeometry(...s),m);v.position.set(...p);v.castShadow=true;v.receiveShadow=true;parent.add(v);return v;}
box([0,-.15,0],[21,.26,36],palette.surround);box([0,-.006,0],[10.97,.015,23.77],palette.court);
for(const x of [-5.485,5.485,-4.115,4.115])box([x,.009,0],[.055,.008,23.77],palette.line);
for(const z of [-11.885,11.885])box([0,.009,z],[10.97,.008,.07],palette.line);
for(const z of [-6.4,6.4])box([0,.009,z],[8.23,.008,.055],palette.line);box([0,.009,0],[.055,.008,12.8],palette.line);
for(const z of [-11.75,11.75])box([0,.009,z],[.055,.008,.26],palette.line);
for(const x of [-6.25,6.25])box([x,.535,0],[.08,1.07,.08],palette.navy);
// Actual open grid keeps the court visible through the net.
for(let i=-59;i<=59;i++)box([i*.103,.505,0],[.007,.97,.008],palette.net);
for(let i=0;i<10;i++)box([0,.065+i*.102,0],[12.2,.006,.008],palette.net);
box([0,1.015,0],[12.5,.046,.036],palette.line);
// Low backdrop and floor seams frame the asset review, without external textures.
for(const z of [-17.5,17.5]){box([0,.48,z],[20.9,.96,.14],palette.navy);box([0,.98,z],[21,.035,.2],palette.ivory);}
for(const x of [-10.4,10.4])box([x,.15,0],[.13,.30,35],palette.ivory);
const loader=new T.GLTFLoader(),actors=[];let chair=null,selected='all',currentClip='',playing=true,audioEnabled=false,lastClock=performance.now(),orbitAngle=0,timeline=0;
const ballSounds=new Map();
function sound(id){if(!audioEnabled)return;let a=ballSounds.get(id);if(!a){a=new Audio(new URL('audio/'+id+'.wav',base));a.volume=.6;ballSounds.set(id,a);}a.currentTime=0;a.play().catch(()=>{});}
function getActor(id=selected){return actors.find(a=>a.id===id);}
function clipFor(a,id){return a.clips.find(c=>c.name===id);}
function setAction(a,id){const clip=clipFor(a,id);if(!clip)return false;a.mixer.stopAllAction();a.action=a.mixer.clipAction(clip);const meta=a.metadata[id]??{};a.action.reset().setLoop(meta.loop?T.LoopRepeat:T.LoopOnce,meta.loop?Infinity:1);a.action.clampWhenFinished=true;a.action.play();a.clipId=id;a.elapsed=0;a.mixer.update(0);a.duration=clip.duration;a.prevPhase=0;return true;}
function populateClips(){const a=getActor();$('clip').innerHTML='';const items=a?roles[a.role].clips:[['court_idle','צוות בעמדות'],['court_calls','הדגמת השיפוט'],['court_ball','הדגמת ילדי הכדורים']];for(const [value,text]of items){const option=new Option(text,value);if(!a||clipFor(a,value))$('clip').add(option);}if(a&&a.clipId)$('clip').value=a.clipId;}
function setActor(id){if(id!=='all'&&!getActor(id))throw Error('Unknown actor '+id);selected=id;$('actor').value=id;orbitAngle=0;populateClips();const a=getActor();if(a){currentClip=a.clipId;$('captionTitle').textContent=a.label;$('captionText').textContent=roles[a.role].clips.find(c=>c[0]===a.clipId)?.[1]??a.clipId;}else{$('captionTitle').textContent='סביב המגרש';$('captionText').textContent='שופט כיסא · 2 שופטי קו · 4 ילדי כדורים';setClip('court_idle');}focus();return snapshot();}
function setClip(id){const a=getActor();if(a){if(!setAction(a,id))throw Error('Clip absent '+id);currentClip=id;$('clip').value=id;$('captionText').textContent=roles[a.role].clips.find(c=>c[0]===id)?.[1]??id;}else{for(const actor of actors){const value=id==='court_calls'?(actor.role==='chair'?'chair_score':actor.role==='line'?'line_out':'kid_idle'):id==='court_ball'?(actor.role==='kid'?'kid_offer':actor.role==='chair'?'chair_seated':'line_idle'):actor.role==='chair'?'chair_seated':actor.role==='line'?'line_idle':'kid_idle';setAction(actor,value);}currentClip=id;$('clip').value=id;}timeline=0;focus();return snapshot();}
function seek(value){const a=getActor();const list=a?[a]:actors;for(const actor of list){actor.elapsed=Math.max(0,Math.min(actor.duration,value));actor.action.time=actor.elapsed;actor.mixer.update(0);actor.prevPhase=actor.duration?actor.elapsed/actor.duration:0;}timeline=value;updateFocusedCamera();render();return snapshot();}
function updateFocusedCamera(){
 const a=getActor();
 if(!a){target.set(0,.5,0);const r=34;camera.position.set(Math.sin(.66+orbitAngle)*r,24,Math.cos(.66+orbitAngle)*r);camera.fov=40;}
 else{a.root.updateMatrixWorld(true);const root=a.root.getObjectByName('Root'),hips=a.root.getObjectByName('Hips');const p=root?root.getWorldPosition(new T.Vector3()):a.group.position.clone();const h=hips?hips.getWorldPosition(new T.Vector3()).y:p.y+.88*a.scale;const elevated=a.role==='chair'&&a.clipId!=='chair_idle';target.set(p.x,h+(elevated?.42:.06)*a.scale,p.z);const theta=a.yaw+orbitAngle+.25;camera.position.set(p.x+Math.sin(theta)*4.0,target.y+.6*a.scale,p.z+Math.cos(theta)*4.0);camera.fov=elevated?42:34;}
 const requiredWidth=a?2.15:34,dist=a?4:42;camera.fov=Math.max(camera.fov,T.MathUtils.radToDeg(2*Math.atan(requiredWidth/(2*dist*camera.aspect))));camera.updateProjectionMatrix();camera.lookAt(target);
}
function focus(){const a=getActor();for(const actor of actors)actor.group.visible=!a||actor===a;court.visible=true;if(chair)chair.visible=!a||a.role==='chair'&&a.clipId!=='chair_idle';updateFocusedCamera();}
function snapshot(){const a=getActor();return{ready:true,actor:selected,clip:a?.clipId??currentClip,playing,audioEnabled,time:a?.elapsed??timeline,duration:a?.duration??Math.max(...actors.map(v=>v.duration)),viewport:{width:renderer.domElement.clientWidth,height:renderer.domElement.clientHeight},actors:actors.map(v=>({id:v.id,role:v.role,clip:v.clipId,scale:v.scale,position:v.group.position.toArray(),visible:v.group.visible,animations:v.clips.map(c=>c.name),bones:v.root.getObjectByProperty('isSkinnedMesh',true)?.skeleton?.bones.length??0})),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
function render(){scene.updateMatrixWorld(true);renderer.render(scene,camera);const a=getActor(),duration=a?.duration??Math.max(...actors.map(v=>v.duration));const t=a?.elapsed??timeline;$('timeline').value=duration?t/duration:0;$('time').value=t.toFixed(2)+' / '+duration.toFixed(2);}
function resize(){const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;updateFocusedCamera();render();}
$('actor').add(new Option('כל המגרש','all'));for(const d of definitions)$('actor').add(new Option(d.label,d.id));
$('actor').addEventListener('change',()=>setActor($('actor').value));$('clip').addEventListener('change',()=>{setClip($('clip').value);focus();});$('play').addEventListener('click',()=>{if(!playing){const a=getActor();for(const v of a?[a]:actors)if(v.action.time>=v.duration-.001)setAction(v,v.clipId);}playing=!playing;$('play').textContent=playing?'עצירה':'ניגון';$('play').setAttribute('aria-pressed',String(playing));});$('timeline').addEventListener('input',()=>{playing=false;$('play').textContent='ניגון';$('play').setAttribute('aria-pressed','false');const a=getActor(),duration=a?.duration??Math.max(...actors.map(v=>v.duration));seek(Number($('timeline').value)*duration);});$('audio').addEventListener('click',()=>{audioEnabled=!audioEnabled;$('audio').textContent=audioEnabled?'קול פעיל':'קול כבוי';$('audio').setAttribute('aria-pressed',String(audioEnabled));});$('soundTest').addEventListener('click',()=>{audioEnabled=true;$('audio').textContent='קול פעיל';$('audio').setAttribute('aria-pressed','true');sound($('sound').value);});for(const [id,dir]of [['orbitLeft',-1],['orbitRight',1]])$(id).addEventListener('click',()=>{orbitAngle+=dir*Math.PI/6;focus();render();});$('resetView').addEventListener('click',()=>{orbitAngle=0;focus();render();});window.addEventListener('resize',resize);
let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,angle:orbitAngle};renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(drag){orbitAngle=drag.angle+(e.clientX-drag.x)*.008;focus();render();}});renderer.domElement.addEventListener('pointerup',()=>{drag=null;});
async function init(){
 for(const def of definitions){const gltf=await loader.loadAsync(new URL('models/'+def.id+'.glb',base).href),group=new T.Group();group.name=def.id+' placement';group.position.set(...def.position);group.rotation.y=def.yaw;group.scale.setScalar(def.scale);group.add(gltf.scene);scene.add(group);gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});const a={...def,group,root:gltf.scene,clips:gltf.animations,mixer:new T.AnimationMixer(gltf.scene),duration:1,elapsed:0,metadata:Object.fromEntries((gltf.parser.json.animations??[]).map(v=>[v.name,v.extras??{}]))};actors.push(a);setAction(a,def.role==='chair'?'chair_seated':def.role==='line'?'line_idle':'kid_idle');}
 const chairGLTF=await loader.loadAsync(new URL('models/umpire-chair.glb',base).href);chair=chairGLTF.scene;const umpire=actors[0];chair.position.copy(umpire.group.position);chair.rotation.y=umpire.yaw;chair.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(chair);
 window.officialsPreview={setActor,setClip,seek,snapshot,setPlaying:v=>{playing=Boolean(v);$('play').textContent=playing?'עצירה':'ניגון';$('play').setAttribute('aria-pressed',String(playing));},setOrbit:v=>{orbitAngle=v;focus();render();}};
 populateClips();setClip('court_idle');focus();resize();$('loading').style.display='none';window.previewReady=true;
 const query=new URL(location.href).searchParams;if(query.has('actor'))setActor(query.get('actor'));if(query.has('clip'))setClip(query.get('clip'));if(query.has('t')){playing=false;seek(Number(query.get('t')));}focus();
 function tick(now){const dt=Math.min((now-lastClock)/1000,.05);lastClock=now;if(playing){for(const a of actors){const previous=a.elapsed;a.mixer.update(dt);a.elapsed=a.action.time;for(const cue of a.metadata[a.clipId]?.events??[])if(cue.sound&&previous<cue.time&&a.elapsed>=cue.time)sound(cue.sound);}timeline=(timeline+dt)%Math.max(...actors.map(a=>a.duration));updateFocusedCamera();}render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
}
init().catch(error=>{console.error(error);$('loading').style.display='none';$('error').style.display='block';$('error').textContent='התצוגה לא נטענה. יש לפתוח את התיקייה דרך שרת HTTP מקומי.\n'+error.message;window.previewError=error.message;});
