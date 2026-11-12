/** Original athlete-body-v1 review viewer. CC0-1.0. Uses repository Three.js under its existing MIT license. */
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../../vendor/SkeletonUtils.js';

const BONE_NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const BODY_LABELS={soccer:'כדורגל',guard:'רכז',wing:'קיצוני',center:'סנטר'};
const HAIR_LABELS={buzz:'קצוץ',crop:'קצר', 'side-part':'שביל בצד',quiff:'בלורית',curls:'תלתלים',afro:'אפרו','swept-back':'מסורק לאחור',bun:'אסוף'};
const REGION={skin:0,uniform_primary:1,uniform_secondary:2,uniform_trim:3,shoe_upper:4,shoe_sole:5,eyes:6,hair:7,sock:8};
const SKIN=['#f2c6a0','#d9a17b','#bd8058','#9a6041','#70422d','#44291f'];
const BACKGROUND='#e9eadd';
const state={sport:'soccer',skin:1,hair:'quiff',hairColor:'#342820',primary:'#187e83',secondary:'#16363b',trim:'#e7dbb9',playing:true,time:0,angle:'front'};
const bodySources=new Map(),hairSources=new Map(),clipSources=new Map(),loadRecords=[];
let bodyManifest,motionManifest,actors=[],activeClip,frameHandle,lastTime=0,renderer,scene,camera,stage,captureRenderer;
let resolveReady,rejectReady;
const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
// A caught copy avoids an unhandled rejection while preserving the public promise for automation.
readyPromise.catch(()=>{});
const q=s=>document.querySelector(s);
const color=hex=>new THREE.Color(hex);
const fetchJson=async path=>{const r=await fetch(path);if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();};
const loader=new GLTFLoader(); // Decoder-free by construction. No Draco, meshopt, workers or WebAssembly.
const outlineMaterial=new THREE.MeshBasicMaterial({color:0x263d34,side:THREE.BackSide,depthWrite:true});
outlineMaterial.name='SharedOutline';
outlineMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed += normalize(normal) * 0.003;');};
outlineMaterial.customProgramCacheKey=()=> 'athlete-outline-3mm-v1';

function createScene(){
 const s=new THREE.Scene();s.background=color(BACKGROUND);
 s.add(new THREE.HemisphereLight(0xf8f4df,0x6e8873,2.4));
 const key=new THREE.DirectionalLight(0xfff1d8,2.5);key.position.set(-3,6,4);s.add(key);
 const fill=new THREE.DirectionalLight(0xc9e7ee,.9);fill.position.set(4,3,1);s.add(fill);
 const rim=new THREE.DirectionalLight(0xfff9e8,1.8);rim.position.set(0,4,-4);s.add(rim);
 return s;
}
function makeFloor(s,width=8){
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(width,8),new THREE.MeshStandardMaterial({color:0xe0e4d5,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.014;s.add(floor);return floor;
}
function gltfStats(g){
 let triangles=0,vertices=0,skinned=0,meshes=0;
 g.scene.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position?.count||0;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;if(o.isSkinnedMesh)skinned++;}});
 return {triangles,vertices,skinned,meshes,animations:g.animations.length,bones:BONE_NAMES.filter(n=>g.scene.getObjectByName(n)).length};
}
async function loadAsset(path,type,id){
 try{const g=await loader.loadAsync(path);loadRecords.push({id,path,type,ok:true,...gltfStats(g)});return g;}
 catch(e){loadRecords.push({id,path,type,ok:false,error:String(e)});throw e;}
}
function getModels(){return bodyManifest.models||bodyManifest.bodies||[];}
function getHair(){return bodyManifest.hair||bodyManifest.hairstyles||Object.keys(HAIR_LABELS).map(id=>({id,path:`runtime/hair/${id}.glb`}));}
function modelInfo(id){const m=getModels().find(v=>v.id===id);if(!m)throw Error(`Unknown body ${id}`);return m;}
function skinAttributes(mesh){const geometry=mesh.geometry.clone();if(geometry.attributes.color)geometry.setAttribute('color',geometry.attributes.color.clone());mesh.geometry=geometry;return geometry;}
function addOutline(mesh,actor){
 const shell=mesh.isSkinnedMesh?new THREE.SkinnedMesh(mesh.geometry,outlineMaterial):new THREE.Mesh(mesh.geometry,outlineMaterial);
 shell.name=`outline-${mesh.name}`;shell.frustumCulled=false;shell.renderOrder=1;shell.userData.isOutline=true;
 if(mesh.isSkinnedMesh){shell.bind(mesh.skeleton,mesh.bindMatrix);shell.bindMode=mesh.bindMode;}
 shell.position.copy(mesh.position);shell.quaternion.copy(mesh.quaternion);shell.scale.copy(mesh.scale);
 if(mesh.morphTargetInfluences)shell.morphTargetInfluences=mesh.morphTargetInfluences;
 mesh.parent.add(shell);actor.outlines.push(shell);return shell;
}
function makeActor(id,{hair=state.hair,appearance=state}={}){
 const src=bodySources.get(id);if(!src)throw Error(`Body not loaded ${id}`);
 const root=cloneSkinned(src.scene),outer=new THREE.Group();outer.name=`presentation-${id}`;outer.add(root);
 const surface=[];root.traverse(o=>{if(o.isMesh)surface.push(o);});
 const sourceMaterial=surface[0]?.material;
 const material=new THREE.MeshStandardMaterial({name:'UnifiedAthleteSurface',map:sourceMaterial?.map||null,vertexColors:true,roughness:bodyManifest.runtime?.roughness??.88,metalness:0,color:0xffffff});
 const actor={id,root,outer,surface,material,outlines:[],hair:null,bind:new Map(),mixer:null,action:null,clip:null,slot:0,info:modelInfo(id)};
 for(const name of BONE_NAMES){const bone=root.getObjectByName(name);if(!bone)throw Error(`Missing canonical bone ${id}/${name}`);actor.bind.set(name,{bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()});}
 for(const mesh of surface){skinAttributes(mesh);mesh.material=material;mesh.frustumCulled=false;mesh.userData.baseColors=mesh.geometry.attributes.color?.array.slice();addOutline(mesh,actor);}
 actor.mixer=new THREE.AnimationMixer(root);
 setActorHair(actor,hair);
 applyActorAppearance(actor,appearance);
 return actor;
}
function setActorHair(actor,id){
 if(actor.hair){actor.hair.removeFromParent();for(const outline of actor.hair.userData.outlines||[]){outline.removeFromParent();actor.outlines.splice(actor.outlines.indexOf(outline),1);}actor.hair.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
 const source=hairSources.get(id);if(!source)return;
 const hair=source.scene.clone(true);hair.name=`hair-${id}`;const hs=[];hair.traverse(o=>{if(o.isMesh)hs.push(o);});
 hair.scale.set(actor.info.bodyShape?.width??1,1,actor.info.bodyShape?.depth??1);
 actor.root.getObjectByName('Head').add(hair);actor.hair=hair;hair.userData.outlines=[];
 for(const mesh of hs){skinAttributes(mesh);mesh.material=actor.material;mesh.frustumCulled=false;mesh.userData.baseColors=mesh.geometry.attributes.color?.array.slice();hair.userData.outlines.push(addOutline(mesh,actor));}
 actor.hairId=id;
}
function paintMesh(mesh,appearance,forceHair=false){
 const g=mesh.geometry,reg=g.attributes._region||g.attributes._REGION,c=g.attributes.color;if(!c)return;
 const base=mesh.userData.baseColors;
 const palette={0:color(SKIN[appearance.skin]||appearance.skin||SKIN[1]),1:color(appearance.primary),2:color(appearance.secondary),3:color(appearance.trim),4:color('#34453f'),5:color('#e0dfcd'),7:color(appearance.hairColor),8:color(appearance.trim)};
 for(let i=0;i<c.count;i++){
  const r=forceHair?REGION.hair:reg?.getX(i);const target=palette[r];
  if(target)c.setXYZ(i,target.r,target.g,target.b);else if(base)c.setXYZ(i,base[i*3],base[i*3+1],base[i*3+2]);
 }
 c.needsUpdate=true;
}
function applyActorAppearance(actor,appearance){
 for(const mesh of actor.surface){paintMesh(mesh,appearance);if(mesh.morphTargetInfluences){mesh.morphTargetInfluences.fill(0);const index=mesh.morphTargetDictionary?.[appearance.sport];if(index!==undefined)mesh.morphTargetInfluences[index]=1;}}
 actor.hair?.traverse(o=>{if(o.isMesh&&!o.userData.isOutline)paintMesh(o,appearance,true);});
 actor.root.updateMatrixWorld(true);
}
function resetActor(actor){
 actor.mixer.stopAllAction();for(const {bone,p,q,s} of actor.bind.values()){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
 actor.root.updateMatrixWorld(true);
}
function useActorClip(actor,clip){
 resetActor(actor);actor.clip=clip;
 const gltf=clipSources.get(clip.id);if(!gltf)throw Error(`Clip not loaded ${clip.id}`);
 const anim=gltf.animations.find(v=>v.name===clip.animationName)||gltf.animations[0];if(!anim)throw Error(`Missing animation ${clip.id}`);
 actor.action=actor.mixer.clipAction(anim);actor.action.setLoop(THREE.LoopOnce,1);actor.action.clampWhenFinished=true;actor.action.reset().play();actor.mixer.setTime(0);
}
function poseActor(actor,time,{inPlace=true}={}){
 if(actor.action){actor.action.enabled=true;actor.action.paused=false;actor.mixer.setTime(Math.max(0,Math.min(actor.clip.duration,time)));}
 actor.outer.position.set(actor.slot,0,0);
 actor.outer.rotation.y=state.angle==='side'?-Math.PI/2:state.angle==='three'?-.4:0;
 actor.root.updateMatrixWorld(true);
 if(inPlace){const h=actor.root.getObjectByName('Hips'),p=h.getWorldPosition(new THREE.Vector3());actor.outer.position.x-=p.x-actor.slot;actor.outer.position.z-=p.z;actor.outer.updateMatrixWorld(true);}
}
function disposeActor(actor){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.root);actor.outer.removeFromParent();for(const m of actor.surface)m.geometry.dispose();actor.hair?.traverse(o=>{if(o.isMesh&&!o.userData.isOutline)o.geometry.dispose();});actor.material.dispose();}
function actorBounds(actor){
 const box=new THREE.Box3();actor.outer.updateMatrixWorld(true);
 actor.outer.traverse(o=>{if(o.isMesh&&!o.userData.isOutline){const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){o.getVertexPosition(i,v);box.expandByPoint(v.applyMatrix4(o.matrixWorld));}}});return box;
}
function cameraFor(bounds,aspect=1,margin=1.12){
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const height=Math.max(2.2,size.y*margin,size.x/aspect*margin),width=height*aspect;
 const cam=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.01,100);cam.position.set(center.x,center.y,center.z+10);cam.lookAt(center);cam.updateProjectionMatrix();return cam;
}
function frameMetrics(actor,time){
 actor.outer.updateMatrixWorld(true);const box=actorBounds(actor),joints={};for(const name of BONE_NAMES){const b=actor.root.getObjectByName(name);joints[name]=b.getWorldPosition(new THREE.Vector3()).toArray();}
 return {time,bounds:{min:box.min.toArray(),max:box.max.toArray()},joints,finite:[...box.min.toArray(),...box.max.toArray(),...Object.values(joints).flat()].every(Number.isFinite)};
}
async function setClip(id){await readyPromise;const clip=motionManifest.clips.find(v=>v.id===id);if(!clip)throw Error(`Unknown clip ${id}`);activeClip=clip;state.time=0;for(const actor of actors)useActorClip(actor,clip);q('#clip').value=id;renderMain();return {id,duration:clip.duration};}
async function setAppearance(changes={}){
 await readyPromise;Object.assign(state,changes);for(const actor of actors){if(changes.hair&&actor.hairId!==changes.hair)setActorHair(actor,changes.hair);applyActorAppearance(actor,state);}
 for(const field of ['primary','secondary','trim','hair'])if(q(`#${field}`))q(`#${field}`).value=state[field];
 q('#hair-color').value=state.hairColor;
 document.querySelectorAll('[data-sport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sport===state.sport)));
 q('#skin-options').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===state.skin)));
 document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.angle===state.angle)));
 q('#play').textContent=state.playing?'השהיה':'ניגון';q('#play').setAttribute('aria-label',state.playing?'השהה תנועה':'נגן תנועה');
 const hairTriangles=getHair().find(h=>h.id===state.hair)?.triangles||0;
 q('#body-labels').querySelectorAll('div').forEach((d,i)=>{const info=getModels()[i];d.querySelector('span').textContent=`${Number(info.height||info.heightMeters).toFixed(2)} מ׳ · ${(info.triangles+hairTriangles).toLocaleString('he-IL')} משולשים`;});
 renderMain();return {...state};
}
function renderMain(){
 if(!renderer||!actors.length)return;for(const actor of actors)poseActor(actor,state.time);renderer.render(scene,camera);
 q('#timeline').value=activeClip?Math.round(state.time/activeClip.duration*1000):0;q('#clock').textContent=state.time.toFixed(2);
}
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);
 const aspect=w/h,height=Math.max(2.6,6.25/aspect),width=height*aspect;camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.position.set(0,1.14,9);camera.lookAt(0,1.14,0);camera.updateProjectionMatrix();renderMain();
}
function animate(now){
 frameHandle=requestAnimationFrame(animate);const dt=lastTime?Math.min(.1,(now-lastTime)/1000):0;lastTime=now;
 if(state.playing&&activeClip)state.time=(state.time+dt)%activeClip.duration;renderMain();
}
function makeCaptureRenderer(w,h){
 if(!captureRenderer){captureRenderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});captureRenderer.setPixelRatio(1);captureRenderer.outputColorSpace=THREE.SRGBColorSpace;captureRenderer.toneMapping=THREE.ACESFilmicToneMapping;captureRenderer.toneMappingExposure=1.03;}
 captureRenderer.setSize(w,h);return captureRenderer;
}
async function renderSheet(bodyId,clipId,options={}){
 await readyPromise;const clip=motionManifest.clips.find(v=>v.id===clipId);if(!clip)throw Error(`Unknown clip ${clipId}`);
 const appearance={...state,...options.appearance,sport:options.sport||((bodyId==='soccer')?'soccer':'basketball')};
 const actor=makeActor(bodyId,{appearance}),s=createScene();makeFloor(s,7);s.add(actor.outer);useActorClip(actor,clip);
 const frames=[],times=Array.from({length:8},(_,i)=>clip.duration*i/(clip.loop?8:7));
 const union=new THREE.Box3();for(const t of times){poseActor(actor,t);const box=actorBounds(actor);union.union(box);}
 const w=options.frameWidth||320,h=options.frameHeight||360,gap=2,caption=33;
 const capture=makeCaptureRenderer(w,h),cam=cameraFor(union,w/h,1.13),sheet=document.createElement('canvas');sheet.width=w*4+gap*3;sheet.height=(h+caption)*2+gap;
 const ctx=sheet.getContext('2d');ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,sheet.width,sheet.height);ctx.font='14px Arial';ctx.textAlign='center';
 for(let i=0;i<times.length;i++){
  poseActor(actor,times[i]);capture.render(s,cam);const x=(i%4)*(w+gap),y=Math.floor(i/4)*(h+caption+gap);ctx.drawImage(capture.domElement,x,y,w,h);ctx.fillStyle='#17352e';ctx.fillText(`${i+1} · ${times[i].toFixed(3)}s`,x+w/2,y+h+21);frames.push(frameMetrics(actor,times[i]));
 }
 const result={dataURL:sheet.toDataURL('image/png'),bodyId,clipId,width:sheet.width,height:sheet.height,frameCount:8,frames,appearance,lighting:'shared-studio-v1',outlineWidthMetres:.003,camera:{projection:'orthographic',position:cam.position.toArray(),left:cam.left,right:cam.right,top:cam.top,bottom:cam.bottom}};
 disposeActor(actor);s.traverse(o=>{if(o.isMesh&&o.geometry.type==='PlaneGeometry'){o.geometry.dispose();o.material.dispose();}});return result;
}
async function renderCompare(options={}){
 await readyPromise;const normalizeHeight=options.normalizeHeight??true,sameUniform=options.sameUniform??true;
 const leftId=options.leftId||'soccer',rightId=options.rightId||'guard';
 const app={...state,...options.appearance};const left=makeActor(leftId,{appearance:{...app,sport:'soccer'}}),right=makeActor(rightId,{appearance:{...app,sport:sameUniform?'soccer':'basketball'}});
 const pair=[left,right],s=createScene();s.add(left.outer,right.outer);
 for(const actor of pair){resetActor(actor);actor.outer.rotation.y=options.angle==='side'?-Math.PI/2:0;if(normalizeHeight)actor.outer.scale.setScalar(1.8/(actor.info.height||actor.info.heightMeters));}
 const width=options.cellWidth||600,height=options.cellHeight||620,capture=makeCaptureRenderer(width,height),union=new THREE.Box3();
 for(const a of pair)union.union(actorBounds(a));const cam=cameraFor(union,width/height,1.16),images=[];
 const sheet=document.createElement('canvas');sheet.width=width*2;sheet.height=height;const ctx=sheet.getContext('2d');
 const metrics=[];
 for(let i=0;i<pair.length;i++){
  pair.forEach((a,k)=>{a.outer.visible=k===i;});capture.render(s,cam);images.push(capture.domElement.toDataURL('image/png'));ctx.drawImage(capture.domElement,width*i,0);metrics.push(frameMetrics(pair[i],0));
 }
 const result={dataURL:sheet.toDataURL('image/png'),leftDataURL:images[0],rightDataURL:images[1],leftId,rightId,normalizeHeight,sameUniform,pose:'canonical-rest',appearance:app,lighting:'shared-studio-v1',background:BACKGROUND,outlineWidthMetres:.003,width:width*2,height,camera:{projection:'orthographic',position:cam.position.toArray(),left:cam.left,right:cam.right,top:cam.top,bottom:cam.bottom},frames:metrics};
 pair.forEach(disposeActor);return result;
}
async function inspectAssets(){await readyPromise;return {models:getModels(),hair:getHair(),clips:motionManifest.clips,loads:loadRecords,allLoaded:loadRecords.every(r=>r.ok),renderer:renderer.info,wasmDecoders:false};}
async function sampleFrame(bodyId,clipId,time,options={}){
 await readyPromise;const clip=motionManifest.clips.find(v=>v.id===clipId);if(!clip)throw Error(`Unknown clip ${clipId}`);const actor=makeActor(bodyId,{appearance:{...state,...options.appearance}});useActorClip(actor,clip);poseActor(actor,time,{inPlace:options.inPlace??false});const result=frameMetrics(actor,time);disposeActor(actor);return result;
}
window.athletePreview={readyPromise,setClip,setAppearance,renderSheet,renderCompare,inspectAssets,sampleFrame,get ready(){return Boolean(renderer&&actors.length===4&&activeClip);},get state(){return {...state};}};

async function refreshComparison(){
 const image=q('#comparison-image');image.setAttribute('aria-busy','true');const comparison=await renderCompare({normalizeHeight:q('#normalize').checked,sameUniform:q('#same-kit').checked});image.src=comparison.dataURL;image.removeAttribute('aria-busy');q('#comparison-note').textContent=`${comparison.normalizeHeight?'גובה תצוגה משותף: 1.80 מ׳':'גבהים טבעיים: כדורגל 1.80 מ׳, רכז 1.78 מ׳'} · ${comparison.sameUniform?'אותה תלבושת וצבעים':'חולצת כדורגל לצד גופיית כדורסל'} · תנוחת מנוחה משותפת`;
}
function wireUI(){
 const bodyLabels=q('#body-labels');for(const info of getModels()){const d=document.createElement('div');const b=document.createElement('strong');b.textContent=BODY_LABELS[info.id];const span=document.createElement('span');const hairTriangles=getHair().find(h=>h.id===state.hair)?.triangles||0;span.textContent=`${Number(info.height||info.heightMeters).toFixed(2)} מ׳ · ${(info.triangles+hairTriangles).toLocaleString('he-IL')} משולשים`;d.append(b,span);bodyLabels.append(d);}
 const clipSelect=q('#clip');for(const library of [...new Set(motionManifest.clips.map(c=>c.library))]){const group=document.createElement('optgroup');group.label=library;for(const clip of motionManifest.clips.filter(c=>c.library===library)){const option=document.createElement('option');option.value=clip.id;option.textContent=clip.label||clip.id;group.append(option);}clipSelect.append(group);}
 clipSelect.addEventListener('change',()=>setClip(clipSelect.value));
 q('#play').addEventListener('click',()=>{state.playing=!state.playing;q('#play').textContent=state.playing?'השהיה':'ניגון';q('#play').setAttribute('aria-label',state.playing?'השהה תנועה':'נגן תנועה');});
 q('#timeline').addEventListener('input',()=>{state.time=Number(q('#timeline').value)/1000*activeClip.duration;renderMain();});
 document.querySelectorAll('[data-angle]').forEach(button=>button.addEventListener('click',()=>{state.angle=button.dataset.angle;document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderMain();}));
 document.querySelectorAll('[data-sport]').forEach(button=>button.addEventListener('click',async()=>{await setAppearance({sport:button.dataset.sport});document.querySelectorAll('[data-sport]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
 for(const field of ['primary','secondary','trim'])q(`#${field}`).addEventListener('input',()=>setAppearance({[field]:q(`#${field}`).value}));
 SKIN.forEach((tone,i)=>{const button=document.createElement('button');button.type='button';button.style.setProperty('--swatch',tone);button.setAttribute('aria-label',`גוון עור ${i+1}`);button.setAttribute('aria-pressed',String(i===state.skin));button.addEventListener('click',async()=>{await setAppearance({skin:i});q('#skin-options').querySelectorAll('button').forEach((b,k)=>b.setAttribute('aria-pressed',String(i===k)));});q('#skin-options').append(button);});
 for(const h of getHair()){const option=document.createElement('option');option.value=h.id;option.textContent=HAIR_LABELS[h.id]||h.label||h.id;q('#hair').append(option);}q('#hair').value=state.hair;q('#hair').addEventListener('change',()=>setAppearance({hair:q('#hair').value}));q('#hair-color').addEventListener('input',()=>setAppearance({hairColor:q('#hair-color').value}));
 q('#compare-refresh').addEventListener('click',refreshComparison);q('#normalize').addEventListener('change',refreshComparison);q('#same-kit').addEventListener('change',refreshComparison);
}
async function init(){
 [bodyManifest,motionManifest]=await Promise.all([fetchJson('body-manifest.json'),fetchJson('motion-manifest.json')]);
 const promises=[...getModels().map(async info=>bodySources.set(info.id,await loadAsset(info.path,'body',info.id))),...getHair().map(async info=>hairSources.set(info.id,await loadAsset(info.path,'hair',info.id))),...motionManifest.clips.map(async info=>clipSources.set(info.id,await loadAsset(info.path,'motion',info.id)))];
 await Promise.all(promises);stage=q('#stage');renderer=new THREE.WebGLRenderer({canvas:stage,antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
 scene=createScene();makeFloor(scene);camera=new THREE.OrthographicCamera(-4,4,1.6,-1.6,.01,100);
 const ordered=['soccer','guard','wing','center'];actors=ordered.map((id,i)=>{const actor=makeActor(id);actor.slot=(i-1.5)*1.4;scene.add(actor.outer);return actor;});
 activeClip=motionManifest.clips.find(v=>v.id==='soccer-v9/run')||motionManifest.clips[0];actors.forEach(a=>useActorClip(a,activeClip));wireUI();q('#clip').value=activeClip.id;resize();new ResizeObserver(resize).observe(stage.parentElement);q('#loading').hidden=true;resolveReady({models:actors.length,hair:hairSources.size,clips:clipSources.size});requestAnimationFrame(animate);await refreshComparison();
}
init().catch(error=>{q('#loading').classList.add('error');q('#loading').textContent=`טעינת התצוגה נכשלה\n${error.message}`;rejectReady(error);console.error(error);});
