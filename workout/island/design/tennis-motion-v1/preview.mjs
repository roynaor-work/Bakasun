// Original preview, court and interaction code. CC0-1.0; see LICENSES.md.
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {sample as sampleMotion, transitionFrame} from './runtime/player.mjs';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const loader = new GLTFLoader(); // Intentionally no Draco or meshopt decoder.
const cache = new Map();
const categoryLabels = {ready:'מוכנות',readiness:'מוכנות',locomotion:'תנועה במגרש',movement:'תנועה במגרש',groundstroke:'מכות קרקע',groundstrokes:'מכות קרקע',serve:'הגשות',serves:'הגשות',special:'רשת ומכות מיוחדות',net:'רשת ומכות מיוחדות',reaction:'תגובות ורגשות',reactions:'תגובות ורגשות',gestures:'תגובות ורגשות'};
const eventLabels = {racket_contact:'מגע מחבט',ball_contact:'מגע בכדור',contact:'מגע בכדור',ball_release:'שחרור הכדור',toss_release:'שחרור בהטלה',visual_contact:'מגע בכדור',visual_ball_release:'שחרור הכדור',trophy_pose:'תנוחת גביע',foot_plant:'נעילת רגל',racket_plant:'נעיצת מחבט'};
let catalog, clips = [], current, model, mixer, action, trace = [], contactObjects = [];
let playing = true, speed = 1, localTime = 0, trailVisible = true, selectToken = 0, initialized = false;
let activeClipId = '', lastTimestamp = 0, lastUiFrame = -1;
let sequenceActive=false, sequenceSampler, lastCatalogId='ready_idle', motionsPromise;
const boneNodes=new Map();
let resolveReady, rejectReady;
const ready = new Promise((resolve,reject) => { resolveReady=resolve; rejectReady=reject; });
const errors = [];
const scene = new T.Scene();
scene.background = new T.Color('#e2e8db');
scene.fog = new T.Fog('#e2e8db', 15, 45);
const camera = new T.PerspectiveCamera(37,1,.05,100);
const renderer = new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','שחקן טניס, מסלול המחבט ומגרש');
viewport.prepend(renderer.domElement);
scene.add(new T.HemisphereLight('#fffde8','#789776',2.2));
const sunlight=new T.DirectionalLight('#ffefd0',3.1);sunlight.position.set(-4,7,5);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);Object.assign(sunlight.shadow.camera,{left:-12,right:12,top:14,bottom:-12,near:.1,far:35});sunlight.shadow.bias=-.0002;sunlight.shadow.normalBias=.025;scene.add(sunlight);
const fill=new T.DirectionalLight('#d1eadc',1);fill.position.set(5,3,-4);scene.add(fill);
const court = new T.Group(); scene.add(court);
function flatBox(w,h,d,x,y,z,color){const o=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.96}));o.position.set(x,y,z);o.receiveShadow=true;court.add(o);return o;}
flatBox(32,.04,34,0,-.035,3,'#c0cdb1');
flatBox(10.8,.012,20.4,0,-.008,3.8,'#698c6c');
flatBox(8.2,.007,15.6,0,-.001,3.8,'#608766');
const lineColor='#dfe9cf';
for(const x of [-4.1,4.1])flatBox(.027,.005,15.6,x,.004,3.8,lineColor);
for(const z of [-4,11.6])flatBox(8.2,.005,.027,0,.004,z,lineColor);
for(const x of [-3.1,3.1])flatBox(.023,.005,15.6,x,.004,3.8,lineColor);
for(const z of [-1.3,8.9])flatBox(6.2,.005,.026,0,.004,z,lineColor);
flatBox(.024,.005,10.2,0,.004,3.8,lineColor);
flatBox(.025,.005,.22,0,.004,-3.9,lineColor);
// The distant net gives a direction of play without obscuring the athlete.
const netMat=new T.LineBasicMaterial({color:'#bdc9ac',transparent:true,opacity:.55});
const netPoints=[];for(let x=-5;x<=5.01;x+=.25)netPoints.push(new T.Vector3(x,.08,11.9),new T.Vector3(x,.91,11.9));for(let y=.08;y<=.91;y+=.14)netPoints.push(new T.Vector3(-5,y,11.9),new T.Vector3(5,y,11.9));
const net=new T.LineSegments(new T.BufferGeometry().setFromPoints(netPoints),netMat);court.add(net);for(const x of [-5,5])flatBox(.045,1,.045,x,.5,11.9,'#587258');flatBox(10,.035,.025,0,.92,11.9,'#e0e6d0');
const overlays=new T.Group();scene.add(overlays);
let trailObject;
const currentHead=new T.Mesh(new T.SphereGeometry(.027,14,10),new T.MeshBasicMaterial({color:'#fff1a0'}));overlays.add(currentHead);
const ball=new T.Mesh(new T.SphereGeometry(.034,18,12),new T.MeshStandardMaterial({color:'#dbed67',roughness:.8}));ball.visible=false;scene.add(ball);
const footMarkers={};for(const side of ['Left','Right']){const m=new T.Mesh(new T.RingGeometry(.085,.1,40),new T.MeshBasicMaterial({color:'#a7f3b1',side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));m.rotation.x=-Math.PI/2;m.visible=false;scene.add(m);footMarkers[side]=m;}
const orbit={target:new T.Vector3(0,.95,0),azimuth:.65,polar:1.28,distance:5.8};
function updateCamera(){const s=new T.Spherical(orbit.distance,orbit.polar,orbit.azimuth);camera.position.copy(orbit.target).add(new T.Vector3().setFromSpherical(s));camera.lookAt(orbit.target);}
updateCamera();
new ResizeObserver(()=>{const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe(viewport);
let drag;
viewport.addEventListener('pointerdown',e=>{if(e.target!==renderer.domElement)return;drag={x:e.clientX,y:e.clientY};viewport.setPointerCapture(e.pointerId);});
viewport.addEventListener('pointermove',e=>{if(!drag)return;orbit.azimuth-=(e.clientX-drag.x)*.008;orbit.polar=T.MathUtils.clamp(orbit.polar+(e.clientY-drag.y)*.007,.18,1.51);drag={x:e.clientX,y:e.clientY};updateCamera();clearViewSelection();});
viewport.addEventListener('pointerup',()=>drag=null);viewport.addEventListener('pointercancel',()=>drag=null);
viewport.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=T.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),1.5,27);updateCamera();},{passive:false});
function clearViewSelection(){document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed','false'));}
function setView(view){const choices={'three-quarter':[.65,1.28],front:[0,1.36],side:[Math.PI/2,1.36],top:[0,.22]};[orbit.azimuth,orbit.polar]=choices[view]||choices['three-quarter'];updateCamera();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
function categoryLabel(value){return categoryLabels[value]||value||'תנועות טניס';}
function label(c){return c.labelHe||c.label||c.nameHe||c.id;}
function duration(c=current){return c?.durationSeconds||c?.duration||1;}
function frameCount(c=current){return Math.round(duration(c)*30);}
function eventTime(e){return e.atSeconds??e.timeSeconds??(e.frame??0)/30;}
function eventsOf(c=current){return [...(c?.events||[])].sort((a,b)=>eventTime(a)-eventTime(b));}
function isContact(e){return /contact|strike|hit/i.test(e.name||e.type||'')&&!/foot|ground|handshake|plant/i.test(e.name||e.type||'');}
function isRelease(e){return /release/i.test(e.name||e.type||'')&&/ball|toss/i.test(e.name||e.type||'');}
function eventLabel(e){return e.labelHe||eventLabels[e.name]||(/contact|strike|hit/i.test(e.name)?'מגע':/release/i.test(e.name)?'שחרור':/trophy/i.test(e.name)?'תנוחת גביע':e.name||'אירוע');}
function positionOf(e){return e.worldPointMeters||e.positionMeters||e.pointMeters||null;}
async function getGltf(c){if(!cache.has(c.id)){const file=c.file||`clips/${c.id}.glb`;cache.set(c.id,loader.loadAsync(new URL(`runtime/${file}`,import.meta.url).href).then(g=>{const exts=[...(g.parser.json.extensionsUsed||[]),...(g.parser.json.extensionsRequired||[])];if(exts.some(x=>/draco|meshopt/i.test(x)))throw Error(`${c.id}: compressed geometry is not accepted`);if(!g.animations.length)throw Error(`${c.id}: missing animation`);if(!g.scene.getObjectByName('RacketHead'))throw Error(`${c.id}: missing RacketHead`);return g;}));}return cache.get(c.id);}
function renderPose(t){if(!mixer||!current)return;localTime=T.MathUtils.clamp(t,0,duration());if(sequenceActive&&sequenceSampler){const frame=sequenceSampler(localTime);for(const bone of catalog.skeleton.bones){const node=boneNodes.get(bone.name);if(!node)continue;node.quaternion.fromArray(frame.rotations[bone.name]);if(bone.name==='Root')node.position.fromArray(bone.restTranslationMeters.map((v,i)=>v+frame.referenceRootTranslationMeters[i]));if(bone.name==='Hips')node.position.fromArray(bone.restTranslationMeters.map((v,i)=>v+frame.hipsOffsetMeters[i]));}}else{action.enabled=true;action.paused=false;mixer.setTime(localTime);}model.updateMatrixWorld(true);}
function nodeWorld(name,point){const n=model?.getObjectByName(name);if(!n)return null;return n.localToWorld(new T.Vector3(...(point||[0,0,0])));}
function eventWorld(e){const explicit=positionOf(e);if(explicit)return new T.Vector3(...explicit);return nodeWorld(e.node||e.effector||'RacketHead',e.localPointMeters||[0,0,0]);}
function disposeOverlay(o){if(!o)return;overlays.remove(o);o.traverse(n=>{n.geometry?.dispose();if(Array.isArray(n.material))n.material.forEach(m=>m.dispose());else n.material?.dispose();});}
function buildTrace(){disposeOverlay(trailObject);contactObjects.forEach(disposeOverlay);contactObjects=[];trace=[];const saved=localTime;const bounds=new T.Box3();for(let i=0;i<=frameCount()*2;i++){renderPose(i/60);const p=nodeWorld('RacketHead');if(p){trace.push(p.clone());bounds.expandByPoint(p);}for(const n of ['Root','Head','LeftFoot','RightFoot','LeftHand']){const q=nodeWorld(n);if(q)bounds.expandByPoint(q);}}
  const geo=new T.BufferGeometry().setFromPoints(trace);trailObject=new T.Line(geo,new T.LineBasicMaterial({color:'#ffd663',transparent:true,opacity:.95,depthWrite:false}));trailObject.renderOrder=2;trailObject.visible=trailVisible;overlays.add(trailObject);
  for(const e of eventsOf().filter(isContact)){renderPose(eventTime(e));const p=eventWorld(e);if(!p)continue;const marker=new T.Group();marker.position.copy(p);const dot=new T.Mesh(new T.SphereGeometry(.038,16,10),new T.MeshBasicMaterial({color:'#f87956',depthTest:false}));dot.renderOrder=4;marker.add(dot);const halo=new T.Mesh(new T.SphereGeometry(.067,16,10),new T.MeshBasicMaterial({color:'#ffbe8d',transparent:true,opacity:.22,depthWrite:false}));halo.renderOrder=3;marker.add(halo);marker.visible=trailVisible;overlays.add(marker);contactObjects.push(marker);}
  renderPose(saved);const center=bounds.getCenter(new T.Vector3());const size=bounds.getSize(new T.Vector3());center.y=Math.max(.8,center.y-.17);orbit.target.copy(center);const aspect=viewport.clientWidth/viewport.clientHeight;const field=2*Math.tan(T.MathUtils.degToRad(camera.fov)/2);orbit.distance=T.MathUtils.clamp(Math.max(size.y/field,size.x/(field*Math.max(.65,aspect)),size.z*.8)*1.5+1.8,4.7,24);updateCamera();
}
function measuredContactSpeed(){const e=eventsOf().find(isContact);if(!e)return null;const t=eventTime(e),saved=localTime;renderPose(Math.max(0,t-1/30));const before=nodeWorld('RacketHead');renderPose(Math.min(duration(),t+1/30));const after=nodeWorld('RacketHead');renderPose(saved);return before&&after?before.distanceTo(after)/(Math.min(duration(),t+1/30)-Math.max(0,t-1/30)):null;}
function refreshList(preferred){const term=$('search').value.trim().toLocaleLowerCase();const cat=$('category').value;const filtered=clips.filter(c=>(cat==='all'||c.category===cat)&&(!term||`${c.id} ${label(c)} ${categoryLabel(c.category)}`.toLocaleLowerCase().includes(term)));$('clip').replaceChildren(...filtered.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=label(c);return o;}));$('clip-count').textContent=filtered.length;const chosen=filtered.find(c=>c.id===(preferred||activeClipId))||filtered[0];if(chosen){$('clip').value=chosen.id;if(chosen.id!==activeClipId&&(initialized||activeClipId))select(chosen.id).catch(fail);}else{$('clip').append(new Option('לא נמצאו תנועות',''));}}
async function select(id){const c=clips.find(x=>x.id===id);if(!c)throw Error(`Unknown clip ${id}`);const token=++selectToken;$('status').textContent='טוען קליפ…';const g=await getGltf(c);if(token!==selectToken)return getState();if(model)scene.remove(model);sequenceActive=false;current=c;activeClipId=id;lastCatalogId=id;model=g.scene;boneNodes.clear();for(const b of catalog.skeleton.bones)boneNodes.set(b.name,model.getObjectByName(b.name));scene.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});mixer=new T.AnimationMixer(model);action=mixer.clipAction(g.animations.find(a=>a.name===id)||g.animations[0]);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();localTime=0;renderPose(0);buildTrace();renderPose(0);lastUiFrame=-1;showClipDetails();return getState();}
function showClipDetails(){$('clip-title').textContent=label(current);$('clip-id').textContent=activeClipId;$('category-label').textContent=categoryLabel(current.category);$('frame-total').textContent=String(frameCount()).padStart(2,'0');$('duration').textContent=`${duration().toFixed(2)} שנ׳`;$('loop-label').textContent=sequenceActive?'רצף מעברים':current.loop?'לולאה':'פעולה מלאה';$('timeline').max=String(duration());const contact=eventsOf().find(isContact);$('contact').disabled=!contact;const v=measuredContactSpeed();$('contact-speed').textContent=v===null?'—':`${v.toFixed(1)} מ׳/שנייה`;$('events').replaceChildren(...eventsOf().map(e=>{const b=document.createElement('button');b.textContent=`${eventLabel(e)} · ${e.frame??Math.round(eventTime(e)*30)}`;b.onclick=()=>{playing=false;renderPose(eventTime(e));updatePlay();updateUI(true);};return b;}));if([...$('clip').options].some(o=>o.value===activeClipId))$('clip').value=activeClipId;$('status').textContent='מוכן לניגון';updateUI(true);$('sequence').setAttribute('aria-pressed',String(sequenceActive));$('sequence').textContent=sequenceActive?'חזרה לקליפ יחיד':'רצף ריצה ← מכה ← ריצה';}
function supportWindows(){return current?.footPlantWindows||current?.footPlants||current?.plantWindows||current?.plants||[];}
function supportAt(t){const result=[];for(const w of supportWindows()){const start=w.startSeconds??(w.startFrame!==undefined?w.startFrame/30:w.startTime*duration());const end=w.endSeconds??(w.endFrame!==undefined?w.endFrame/30:w.endTime*duration());if(t>=start-1e-5&&t<=end+1e-5)result.push(w);}return result;}
function updateBall(){const trajectory=current.ballTrajectory||current.ballTrajectoryMeters||current.ball?.trajectory;if(Array.isArray(trajectory)&&trajectory.length){const getTime=p=>p.atSeconds??p.timeSeconds??(p.frame!==undefined?p.frame/30:p.time*duration());let a=trajectory[0],b=trajectory.at(-1);for(let i=1;i<trajectory.length;i++){if(getTime(trajectory[i])>=localTime){a=trajectory[i-1];b=trajectory[i];break;}}const ta=getTime(a),tb=getTime(b);const pa=a.positionMeters||a.worldPointMeters||a.position,pb=b.positionMeters||b.worldPointMeters||b.position;if(pa&&pb&&localTime>=getTime(trajectory[0])&&localTime<=getTime(trajectory.at(-1))){ball.position.fromArray(pa).lerp(new T.Vector3(...pb),tb===ta?0:T.MathUtils.clamp((localTime-ta)/(tb-ta),0,1));ball.visible=true;return;}}
  const release=eventsOf().find(isRelease),contact=eventsOf().find(isContact);if(!release&&!contact){ball.visible=false;return;}if(release&&localTime<eventTime(release)){const p=nodeWorld(release.node||'LeftHand',release.localPointMeters||[0,0,0]);if(p){ball.position.copy(p);ball.visible=true;return;}}
  const rpos=release&&positionOf(release),cpos=contact&&positionOf(contact);if(release&&rpos&&(!contact||localTime<=eventTime(contact))){const dt=localTime-eventTime(release);const interval=contact?eventTime(contact)-eventTime(release):.9;const velocity=release.velocityMetersPerSecond||(cpos?[0,1,2].map(i=>(cpos[i]-rpos[i])/interval+(i===1?4.905*interval:0)):[0,4.6,0]);ball.position.fromArray(rpos).addScaledVector(new T.Vector3(...velocity),dt);ball.position.y-=4.905*dt*dt;ball.visible=dt>=0&&ball.position.y>=.034;return;}
  if(contact&&cpos){const dt=localTime-eventTime(contact);if(dt>=-.28&&dt<=.36){ball.position.fromArray(cpos).addScaledVector(new T.Vector3(...(dt<0?[0,.5,-8]:[0,2,13])),dt);ball.position.y-=dt>0?4.905*dt*dt:0;ball.visible=ball.position.y>.034;return;}}ball.visible=false;
}
function updateUI(force=false){if(!current)return;const f=Math.min(frameCount(),Math.round(localTime*30));if(f===lastUiFrame&&!force)return;lastUiFrame=f;$('frame').textContent=String(f).padStart(2,'0');$('timeline').value=String(localTime);$('time').textContent=`${localTime.toFixed(2)} / ${duration().toFixed(2)} שנ׳`;const e=eventsOf().find(x=>Math.abs(eventTime(x)-localTime)<1/30);const next=eventsOf().filter(x=>eventTime(x)>=localTime).sort((a,b)=>eventTime(a)-eventTime(b))[0];const contact=eventsOf().find(isContact);$('event').textContent=e?`${eventLabel(e)} · פריים ${e.frame??f}`:contact?`פריים ${contact.frame??Math.round(eventTime(contact)*30)}`:next?eventLabel(next):'ללא מגע בכדור';const support=supportAt(localTime);$('support').textContent=support.length?support.map(w=>/Left|left|\.L/.test(w.bone||w.effector||w.foot||'')?'שמאל':'ימין').filter((x,i,a)=>a.indexOf(x)===i).join(' + '):'ללא נעילה';}
function updatePlay(){$('play').textContent=playing?'השהיה':'ניגון';$('play').setAttribute('aria-pressed',String(playing));}
function getState(){const p=model?nodeWorld('RacketHead'):null;return {ready:initialized,sequence:sequenceActive,id:activeClipId,clipId:activeClipId,trailPointCount:trace.length,headWorldMeters:p?.toArray()||null,rootWorldMeters:model?nodeWorld('Root')?.toArray():null,timeSeconds:localTime,frame:Math.round(localTime*30),durationSeconds:current?duration():0,playing,loaded:cache.size,clipCount:clips.length,trailSamples:trace.length,racketHeadWorldMeters:p?.toArray()||null,events:current?.events||[],decoderConfigured:false,errors:[...errors]};}
async function loadAll(){const results=[];for(const c of clips){const g=await getGltf(c);results.push({id:c.id,animation:g.animations[0].name,durationSeconds:g.animations[0].duration,racketHead:!!g.scene.getObjectByName('RacketHead'),extensions:g.parser.json.extensionsRequired||[],loaded:true});$('status').textContent=`נבדקו ${results.length} / ${clips.length}`;} $('status').textContent=`${clips.length} קליפים נטענו`;return results;}
window.tennisPreview={ready,select,playSequence,async sampleSequence(t){if(!sequenceActive)await playSequence();return this.sample(t);},sample(t){playing=false;renderPose(t);updatePlay();updateOverlays();updateUI(true);renderer.render(scene,camera);return getState();},getState,loadAll,setView};
$('search').addEventListener('input',()=>refreshList());$('category').addEventListener('change',()=>refreshList());$('clip').addEventListener('change',()=>select($('clip').value).catch(fail));
function advance(delta){const opts=[...$('clip').options];if(!opts.length)return;const i=opts.findIndex(o=>o.value===activeClipId);const next=opts[(i+delta+opts.length)%opts.length];if(next.value)select(next.value).catch(fail);}
$('sequence').onclick=()=>{(sequenceActive?select(lastCatalogId):playSequence()).catch(fail);};$('previous').onclick=()=>advance(-1);$('next').onclick=()=>advance(1);$('play').onclick=()=>{playing=!playing;if(playing&&localTime>=duration())localTime=0;updatePlay();};$('contact').onclick=()=>{const e=eventsOf().find(isContact);if(e)window.tennisPreview.sample(eventTime(e));};$('timeline').addEventListener('input',()=>window.tennisPreview.sample(Number($('timeline').value)));$('speed').onchange=()=>speed=Number($('speed').value);$('trail-toggle').onclick=()=>{trailVisible=!trailVisible;if(trailObject)trailObject.visible=trailVisible;contactObjects.forEach(o=>o.visible=trailVisible);$('trail-toggle').setAttribute('aria-pressed',String(trailVisible));};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.code==='ArrowRight')window.tennisPreview.sample(localTime+1/30);if(e.code==='ArrowLeft')window.tennisPreview.sample(localTime-1/30);});
function fail(error){errors.push(String(error?.message||error));$('error').hidden=false;$('error').textContent=`התצוגה לא נטענה: ${error?.message||error}`;$('status').textContent='שגיאת טעינה';console.error(error);}
async function init(){const response=await fetch(new URL('runtime/catalog.json',import.meta.url));if(!response.ok)throw Error(`catalog HTTP ${response.status}`);catalog=await response.json();clips=Array.isArray(catalog.clips)?catalog.clips:Object.values(catalog.states||{});if(!clips.length)throw Error('catalog has no clips');$('count-chip').textContent=`${clips.length} קליפים`;$('category').append(...[...new Set(clips.map(c=>c.category))].filter(Boolean).map(c=>new Option(categoryLabel(c),c)));refreshList();const first=new URL(location.href).searchParams.get('clip')||clips[0].id;await select(clips.some(c=>c.id===first)?first:clips[0].id);initialized=true;resolveReady(getState());}
async function playSequence(){
 if(!initialized)await ready;
 if(!motionsPromise)motionsPromise=fetch(new URL('runtime/motions.json',import.meta.url)).then(async r=>{if(!r.ok)throw Error(`motions HTTP ${r.status}`);return r.json();});
 const motions=await motionsPromise,run=motions.states.run_forward,shot=motions.states.forehand_flat_long,skeleton=motions.skeleton;
 const previous=sequenceActive?lastCatalogId:activeClipId;
 await select('forehand_flat_long');lastCatalogId=previous;
 const lead=.4,tail=.8,endShot=transitionFrame(skeleton,run,shot,lead,shot.durationSeconds),delta=endShot.referenceRootTranslationMeters.map((v,i)=>v-shot.keyframes.at(-1).referenceRootTranslationMeters[i]);
 const shiftedShot={...shot,keyframes:shot.keyframes.map(f=>({...f,referenceRootTranslationMeters:f.referenceRootTranslationMeters.map((v,i)=>v+delta[i])}))};
 sequenceSampler=t=>t<lead?sampleMotion(run,t):t<=lead+shot.durationSeconds?transitionFrame(skeleton,run,shot,lead,t-lead):transitionFrame(skeleton,shiftedShot,run,shot.durationSeconds,t-lead-shot.durationSeconds);
 const shiftedEvents=shot.events.map(e=>({...e,frame:e.frame+Math.round(lead*30),atSeconds:e.atSeconds+lead,worldPointMeters:e.worldPointMeters?.map((v,i)=>v+delta[i])}));
 const shiftedTrajectory=shot.ballTrajectory.map(p=>({...p,frame:p.frame+Math.round(lead*30),positionMeters:p.positionMeters.map((v,i)=>v+delta[i])}));
 const plants=[...run.footPlants.filter(p=>p.startFrame<lead*30).map(p=>({...p,endFrame:Math.min(p.endFrame,lead*30)})),...shot.footPlants.map(p=>({...p,startFrame:p.startFrame+lead*30,endFrame:p.endFrame+lead*30})),...run.footPlants.filter(p=>p.startFrame<tail*30).map(p=>({...p,startFrame:p.startFrame+(lead+shot.durationSeconds)*30,endFrame:Math.min(p.endFrame,tail*30)+(lead+shot.durationSeconds)*30}))];
 current={id:'run_hit_run_demo',labelHe:'ריצה ← פורהנד ← חזרה לריצה',category:'רצף מעברים',durationSeconds:lead+shot.durationSeconds+tail,events:shiftedEvents,ballTrajectory:shiftedTrajectory,footPlants:plants,loop:false};activeClipId=current.id;sequenceActive=true;localTime=0;buildTrace();renderPose(0);lastUiFrame=-1;showClipDetails();playing=true;updatePlay();updateOverlays();return getState();
}
function updateOverlays(){if(!current||!model)return;const hp=nodeWorld('RacketHead');if(hp)currentHead.position.copy(hp);currentHead.visible=trailVisible;for(const [side,marker]of Object.entries(footMarkers)){const supported=supportAt(localTime).some(w=>new RegExp(side,'i').test(w.bone||w.effector||w.foot||''));const p=supported&&nodeWorld(`${side}Foot`,[0,-.08,0]);marker.visible=!!p;if(p)marker.position.set(p.x,.012,p.z);}updateBall();}
function tick(timestamp){requestAnimationFrame(tick);const dt=lastTimestamp?Math.min(.08,(timestamp-lastTimestamp)/1000):0;lastTimestamp=timestamp;if(current&&mixer){if(playing){let t=localTime+dt*speed;if(t>duration())t%=duration();renderPose(t);}updateOverlays();updateUI();}renderer.render(scene,camera);}
requestAnimationFrame(tick);init().catch(e=>{fail(e);rejectReady(e);});
