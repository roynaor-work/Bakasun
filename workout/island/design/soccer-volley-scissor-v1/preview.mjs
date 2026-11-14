/** SPDX-License-Identifier: CC0-1.0
 * Original offline review surface; real native GLB animation via MIT Three.js.
 * The ball is sampled independently and never constrained to a striking bone.
 */
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
const $=id=>document.getElementById(id);
const capture=new URLSearchParams(location.search).has('capture');
if(capture)document.body.classList.add('capture');
const names={
 volley_right:['בעיטת עף · ימין','כדור נמוך','רגל שמאל תומכת, רגל ימין פוגשת את הכדור באוויר.'],
 volley_left:['בעיטת עף · שמאל','כדור נמוך','העברת משקל לימין ובעיטת עף ברגל שמאל.'],
 scissor_backward:['מספרת לאחור','כדור גבוה','ניתור לאחור, החלפת רגליים ובעיטה מעל הגוף.'],
 scissor_land_getup:['נחיתה וקימה','התאוששות מהירה','נחיתה על הגב ולאחריה קימה מהירה.'],
 header_prepare:['הכנה לנגיחה','מול הכדור','התייצבות מול הכדור והעמסה לקראת הניתור.'],
 header_jump_neutral:['נגיחה בקפיצה','נגיחה נייטרלית','ניתור בשתי רגליים, מגע במצח ונחיתה מאוזנת.']
};
const eventNames={back:'הכנה',load:'העמסה',takeoff:'ניתור',contact:'מגע',follow:'המשך',land:'נחיתה',back_land:'נחיתה על הגב',getup_start:'תחילת קימה',getup_end:'סיום קימה',getup_complete:'סיום קימה',prepare:'הכנה לנגיחה',handoff:'מעבר לנחיתה',recover:'קימה',ready:'מוכן',settle:'התייצבות'};
const renderer=new THREE.WebGLRenderer({canvas:$('stage'),antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color('#1a332c');scene.fog=new THREE.Fog('#1a332c',7,14);
const camera=new THREE.PerspectiveCamera(34,1,.01,40);
const views={three:[3.2,1.9,4.25],front:[0,1.6,5.3],side:[5.1,1.65,.05]};let view='three';
function setView(name){if(!views[name])throw new Error(`Unknown view ${name}`);view=name;camera.position.fromArray(views[name]);camera.lookAt(0,1.02,-.07);for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===name));renderer.render(scene,camera);}
setView('three');scene.add(new THREE.HemisphereLight('#e9f2dd','#354c3d',2.5));
for(const [color,intensity,position] of [['#fff1d3',3,[3,5,4]],['#bdd8c4',2,[-3,3,-2]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.fromArray(position);scene.add(light);}
const ground=new THREE.Mesh(new THREE.PlaneGeometry(35,35),new THREE.MeshStandardMaterial({color:'#284c39',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.012;scene.add(ground);
const grid=new THREE.GridHelper(15,60,'#83936b','#3b5c45');grid.position.y=-.009;grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
const fieldRing=new THREE.Mesh(new THREE.RingGeometry(.91,.916,96),new THREE.MeshBasicMaterial({color:'#afbd8b',side:THREE.DoubleSide,transparent:true,opacity:.3}));fieldRing.rotation.x=-Math.PI/2;fieldRing.position.y=-.007;scene.add(fieldRing);
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.28,40),new THREE.MeshBasicMaterial({color:'#102c20',transparent:true,opacity:.28,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.004;shadow.scale.set(1,1.7,1);scene.add(shadow);
const ball=new THREE.Mesh(new THREE.SphereGeometry(.11,24,16),new THREE.MeshStandardMaterial({color:'#f5f1dd',roughness:.7}));scene.add(ball);
for(const axis of ['x','y','z']){const seam=new THREE.Mesh(new THREE.TorusGeometry(.1103,.0016,4,48),new THREE.MeshBasicMaterial({color:'#6b7763'}));if(axis==='x')seam.rotation.x=Math.PI/2;if(axis==='y')seam.rotation.y=Math.PI/2;ball.add(seam);}
const contactMarker=new THREE.Mesh(new THREE.SphereGeometry(.025,16,10),new THREE.MeshBasicMaterial({color:'#ffd18a',depthTest:false}));contactMarker.renderOrder=20;scene.add(contactMarker);
const contactRing=new THREE.Mesh(new THREE.TorusGeometry(.047,.0024,5,32),new THREE.MeshBasicMaterial({color:'#ffd18a',depthTest:false}));contactRing.renderOrder=19;scene.add(contactRing);
const loader=new GLTFLoader(),cache=new Map();
let clips=[],current,active,ready=false,time=0,playing=!capture,pairMode=false,arcLine,last=performance.now();
const duration=c=>c.durationSeconds??c.duration??1;
const at=e=>e?.time??e?.atSeconds??(e?.frame??0)/30;
const type=e=>e?.type??e?.event??e?.name;
const events=c=>(c.events??[]).filter(e=>eventNames[type(e)]);
const contact=c=>c?.events?.find(e=>type(e)==='contact')??c?.contact??c?.event;
const vec=new THREE.Vector3(),quat=new THREE.Quaternion();
function fail(error){ready=false;playing=false;$('error').hidden=false;$('error').textContent=`התצוגה לא נטענה. ${error.message}`;console.error(error);}
function setPlaying(value){playing=value;$('play').textContent=value?'השהיה':'ניגון';$('play').setAttribute('aria-label',value?'השהיה':'ניגון');}
function sampleBall(c,t){const keys=c.ball?.samples??c.ball?.keys??[];if(!keys.length)return null;let i=keys.findIndex(k=>(k.time??k.t)>=t);if(i<0)i=keys.length-1;const b=keys[i],a=keys[Math.max(0,i-1)],ta=a.time??a.t,tb=b.time??b.t,u=tb>ta?Math.max(0,Math.min(1,(t-ta)/(tb-ta))):0;return (a.position??a.center).map((v,j)=>v+((b.position??b.center)[j]-v)*u);}
function pose(){
 if(!active||!current)return;
 active.action.time=Math.min(time,Math.max(0,active.action.getClip().duration-1e-8));active.action.paused=true;active.mixer.update(0);active.model.updateMatrixWorld(true);active.skeleton.visible=$('skeleton').checked;
 const center=sampleBall(current,time);ball.visible=!!center;if(center)ball.position.fromArray(center);
 const e=contact(current),bone=e?.bone&&active.model.getObjectByName(e.bone),local=e?.local??e?.localPointMeters;
 contactMarker.visible=contactRing.visible=!!bone&&Array.isArray(local)&&Math.abs(at(e)-time)<.09;
 if(bone&&local){bone.getWorldPosition(vec);bone.getWorldQuaternion(quat);contactMarker.position.copy(vec).add(new THREE.Vector3(...local).applyQuaternion(quat));contactRing.position.copy(contactMarker.position);contactRing.quaternion.copy(camera.quaternion);}
 const hips=active.model.getObjectByName('Hips');if(hips){hips.getWorldPosition(vec);shadow.position.x=vec.x;shadow.position.z=vec.z;shadow.scale.setScalar(Math.max(.35,1-(vec.y-.78)*.15));}
 const d=duration(current),frame=Math.round(time*30);$('scrub').value=String(frame);$('frame').textContent=`פריים ${frame} / ${Math.round(d*30)}`;$('time').textContent=`${time.toFixed(2)} / ${d.toFixed(2)} s`;
 const near=events(current).find(e=>Math.abs(at(e)-time)<.065),previous=events(current).filter(e=>at(e)<=time).at(-1);$('phase').textContent=near?eventNames[type(near)]:previous?eventNames[type(previous)]:'הכנה';
}
function removeActive(){if(!active)return;scene.remove(active.model);scene.remove(active.skeleton);if(arcLine){scene.remove(arcLine);arcLine.geometry.dispose();arcLine.material.dispose();arcLine=null;}}
function buildArc(){const e=contact(current),bone=e?.bone&&active.model.getObjectByName(e.bone),local=e?.local??e?.localPointMeters;if(!bone||!local)return;const points=[],start=Math.max(0,at(e)-.28),end=Math.min(duration(current),at(e)+.22);for(let t=start;t<=end+1e-8;t+=1/90){active.action.time=t;active.mixer.update(0);active.model.updateMatrixWorld(true);points.push(bone.localToWorld(new THREE.Vector3(...local)));}arcLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#efc577',transparent:true,opacity:.65}));scene.add(arcLine);}
async function select(id,{keepPlaying=false,keepPair=false}={}){
 const c=clips.find(c=>c.id===id);if(!c)throw new Error(`Unknown clip ${id}`);if(!cache.has(id))throw new Error(`Asset not loaded: ${id}`);
 ready=false;removeActive();current=c;active=cache.get(id);scene.add(active.model);scene.add(active.skeleton);active.action.reset().play();active.action.setLoop(THREE.LoopOnce,1);active.action.clampWhenFinished=true;time=0;if(!keepPlaying)setPlaying(false);if(!keepPair){pairMode=false;$('sequence').setAttribute('aria-pressed','false');}
 const detail=names[id]??[c.label??id,'',c.notes??''];$('title').textContent=detail[0];$('description').textContent=detail[2];$('scrub').max=String(Math.round(duration(c)*30));for(const b of document.querySelectorAll('[data-clip]'))b.setAttribute('aria-pressed',String(b.dataset.clip===id));
 const e=contact(c);let range=c.ballHeightRangeMeters??c.heightRangeMeters??c.ballHeight?.rangeMeters??c.selection?.ballHeightRangeMeters??(id.startsWith('volley')?[.5,1.2]:id==='scissor_backward'?[1.8,2.4]:id.startsWith('header')?[1.5,2.2]:null);$('height').innerHTML=range?`גובה הכדור <bdi dir="ltr">${range[0].toFixed(1)}–${range[1].toFixed(1)}</bdi> מ׳`:'נחיתה · קימה ב־0.6 שנ׳';$('contact-detail').textContent=e?`מגע · ${(at(e)).toFixed(3)} שנ׳`:'ללא מגע בכדור';
 $('events').replaceChildren();$('markers').replaceChildren();const significant=events(c).filter(e=>['contact','takeoff','land','back_land','getup_start','getup_end','getup_complete'].includes(type(e)));
 for(const ev of significant){const marker=document.createElement('i');marker.className='marker';marker.style.left=`${100*at(ev)/duration(c)}%`;$('markers').append(marker);}
 for(const ev of significant.slice(0,3)){const b=document.createElement('button');b.type='button';b.className='event-button';b.textContent=eventNames[type(ev)];b.title=`${at(ev).toFixed(3)} שנ׳`;b.addEventListener('click',()=>seek(at(ev)));$('events').append(b);}
 ball.scale.setScalar((c.ball?.radius??.11)/.11);buildArc();pose();ready=true;renderer.render(scene,camera);return id;
}
function seek(t){if(!current)return;time=Math.max(0,Math.min(duration(current),t));setPlaying(false);pose();renderer.render(scene,camera);}
function sequence(){pairMode=true;$('sequence').setAttribute('aria-pressed','true');select('scissor_backward',{keepPlaying:true,keepPair:true});setPlaying(true);}
function resize(){const {width,height}=$('stage').getBoundingClientRect();if(width<=0||height<=0)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);}
new ResizeObserver(resize).observe($('stage'));resize();
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));$('play').addEventListener('click',()=>setPlaying(!playing));$('restart').addEventListener('click',()=>{time=0;pose();});$('sequence').addEventListener('click',sequence);$('scrub').addEventListener('input',()=>seek(Number($('scrub').value)/30));$('skeleton').addEventListener('change',()=>{pose();renderer.render(scene,camera);});
addEventListener('keydown',e=>{if(e.target.matches('select,input'))return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}if(e.code==='ArrowRight'){e.preventDefault();seek(time+1/30);}if(e.code==='ArrowLeft'){e.preventDefault();seek(time-1/30);}});
renderer.setAnimationLoop(now=>{const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(ready&&playing){time+=dt*Number($('speed').value);if(time>duration(current)){if(pairMode&&current.id==='scissor_backward'){const overflow=time-duration(current);select('scissor_land_getup',{keepPlaying:true,keepPair:true});time=overflow;}else if(time>duration(current)+.45){if(pairMode)select('scissor_backward',{keepPlaying:true,keepPair:true});else time=0;}}const save=time;time=Math.min(time,duration(current));pose();time=save;}renderer.render(scene,camera);});
try{
 const response=await fetch(new URL('./catalog.json',import.meta.url));if(!response.ok)throw new Error(`HTTP ${response.status}`);const catalog=await response.json();clips=catalog.clips;if(!Array.isArray(clips)||clips.length!==6)throw new Error('נדרשות שש תנועות בקטלוג.');
 for(const [i,c] of clips.entries()){const detail=names[c.id]??[c.label??c.id,''];const b=document.createElement('button');b.type='button';b.className='clip-button';b.dataset.clip=c.id;b.setAttribute('aria-pressed','false');const n=document.createElement('span');n.className='clip-number';n.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span');const title=document.createElement('strong');title.textContent=detail[0];const small=document.createElement('small');small.textContent=detail[1];text.append(title,small);const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='←';arrow.setAttribute('aria-hidden','true');b.append(n,text,arrow);b.addEventListener('click',()=>{select(c.id,{keepPlaying:true});setPlaying(true);});$('clips').append(b);}
 await Promise.all(clips.map(async c=>{const asset=await loader.loadAsync(new URL(c.asset??`clips/${c.id}.glb`,import.meta.url).href);const model=asset.scene,mixer=new THREE.AnimationMixer(model),animation=asset.animations.find(a=>a.name===c.id)??asset.animations[0];if(!animation)throw new Error(`${c.id} has no animation`);const action=mixer.clipAction(animation),skeleton=new THREE.SkeletonHelper(model);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.65;skeleton.renderOrder=5;skeleton.visible=false;cache.set(c.id,{model,mixer,action,skeleton});}));
 const startPlaying=playing;await select(clips[0].id);setPlaying(startPlaying);
 window.__soccerVolley={get ready(){return ready;},get clips(){return clips.map(c=>c.id);},select,seek,setView,sequence,setPlaying,render(){renderer.render(scene,camera);},snapshot(){const joints={};for(const name of ['Hips','Head','LeftFoot','RightFoot']){const b=active.model.getObjectByName(name);joints[name]=b?.getWorldPosition(new THREE.Vector3()).toArray();}return {id:current.id,time,frame:Math.round(time*30),duration:duration(current),ready,playing,pairMode,view,ball:ball.visible?ball.position.toArray():null,contactMarker:contactMarker.visible?contactMarker.position.toArray():null,joints,bones:active.model.getObjectByProperty('isSkinnedMesh',true)?.skeleton.bones.map(b=>b.name),clipDuration:active.action.getClip().duration};}};
}catch(error){fail(error);}
