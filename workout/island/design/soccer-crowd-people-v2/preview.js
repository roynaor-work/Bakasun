import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';

const $=id=>document.getElementById(id);
const state={lod:0,fan:4,clip:'stand',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,time:0,yaw:0,face:false};
const cache=new Map(),loader=new GLTFLoader(),mixers=[],crowdActors=[];
let manifest,renderer,selected,selectedMixer,scene,camera,detailScene,detailCamera,inspectionChair,loadVersion=0,selectionVersion=0,last=0,request=0,renders=0,ready=false;
const canvas=$('view');
const api=window.crowd={ready:false,state,seek,setState,diagnostics:()=>({ready,state:{...state},loaded:cache.size,renderCount:renders,
  visibleFans:crowdActors.length,triangles:16*[210,90,24][state.lod],selectedTriangles:[210,90,24][state.lod],renderer:renderer?.info.render})};
api.poseMetrics=()=>crowdActors.map((actor,index)=>{
  actor.root.updateMatrixWorld(true);const inverse=actor.root.matrixWorld.clone().invert();
  let minimumY=Infinity,maximumY=-Infinity,finite=true,footMinimumY=Infinity;
  actor.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
    const p=mesh.geometry.attributes.position,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<p.count;i++){
      const v=new T.Vector3().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      finite&&=v.toArray().every(Number.isFinite);minimumY=Math.min(minimumY,v.y);maximumY=Math.max(maximumY,v.y);
      if([0,1,2,3].some(k=>w.getComponent(i,k)>.99&&mesh.skeleton.bones[j.getComponent(i,k)].name.endsWith('Foot')))footMinimumY=Math.min(footMinimumY,v.y);
    }
  });
  const centers=['Left','Right'].map((side,i)=>{
    const b=actor.root.getObjectByName(side+'Hand'),q=b.getWorldQuaternion(new T.Quaternion()),v=b.getWorldPosition(new T.Vector3());
    return v.add(new T.Vector3((i===0?1:-1)*manifest.fans[index].heightM*.029,0,0).applyQuaternion(q));
  });
  return {id:manifest.fans[index].id,minimumY,maximumY,footMinimumY,finite,palmDistance:centers[0].distanceTo(centers[1])};
});

function lights(s){s.add(new T.HemisphereLight(0xfff7e8,0x52686a,2.1));const key=new T.DirectionalLight(0xffeed2,2.6);key.position.set(-3,5,6);s.add(key);const fill=new T.DirectionalLight(0xd8ecf1,.9);fill.position.set(3,2,-2);s.add(fill);}
function solid(s,geometry,color,x,y,z){const obj=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.95}));obj.position.set(x,y,z);s.add(obj);return obj;}
function setup(){
  renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.autoClear=false;
  scene=new T.Scene();scene.background=new T.Color('#29454b');lights(scene);
  detailScene=new T.Scene();detailScene.background=new T.Color('#e8e7df');lights(detailScene);
  camera=new T.OrthographicCamera();detailCamera=new T.OrthographicCamera();
  for(let row=0;row<2;row++){
    solid(scene,new T.BoxGeometry(6.65,.12,.58),'#536e6c',0,row*.79+.36,-row*.98-.05);
    solid(scene,new T.BoxGeometry(6.9,.08,1.07),'#3b585a',0,row*.79-.065,-row*.98);
    for(let col=0;col<8;col++){
      const x=(col-3.5)*.83;
      solid(scene,new T.BoxGeometry(.42,.08,.38),'#9a9d80',x,row*.79+.40,-row*.98);
    }
  }
  solid(detailScene,new T.CylinderGeometry(.52,.52,.018,48),'#c4ccc1',0,-.018,0);
  inspectionChair=new T.Group();detailScene.add(inspectionChair);inspectionChair.visible=false;
  solid(inspectionChair,new T.BoxGeometry(.42,.05,.37),'#7d8b7f',0,.46,.065);
  solid(inspectionChair,new T.BoxGeometry(.42,.34,.035),'#7d8b7f',0,.65,-.10);
  for(const x of [-.17,.17])for(const z of [-.09,.22])solid(inspectionChair,new T.BoxGeometry(.025,.44,.025),'#62716e',x,.22,z);
  resize();new ResizeObserver(resize).observe($('stage'));
}

function resize(){
  if(!renderer)return;
  const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);const split=w<450?.37:.31,closeW=w*split,rosterW=w-closeW;
  const halfHeight=Math.max(state.face?.29:1.24,(state.face?.16:.62)*h/closeW);
  detailCamera.left=-halfHeight*closeW/h;detailCamera.right=halfHeight*closeW/h;
  detailCamera.top=halfHeight;detailCamera.bottom=-halfHeight;detailCamera.near=.01;detailCamera.far=100;
  detailCamera.position.set(0,state.face?1.68:1.18,5);
  detailCamera.lookAt(0,state.face?1.68:1.10,0);detailCamera.updateProjectionMatrix();
  const vertical=Math.max(1.90,3.62*h/rosterW),halfWidth=vertical*rosterW/h;
  camera.left=-halfWidth;camera.right=halfWidth;camera.top=vertical;camera.bottom=-vertical;camera.near=.01;camera.far=100;
  camera.position.set(0,4.0,10);camera.lookAt(0,1.37,-.5);camera.updateProjectionMatrix();render();
}

async function asset(fan,lod){
  const file=manifest.fans[fan].lods[lod].file;
  if(!cache.has(file))cache.set(file,loader.loadAsync(new URL(file,import.meta.url).href));
  return cache.get(file);
}

function makeActor(gltf){
  const root=clone(gltf.scene);
  root.traverse(n=>{if(n.isSkinnedMesh){n.frustumCulled=false;n.castShadow=false;}});
  const mixer=new T.AnimationMixer(root);
  return {root,mixer,clips:gltf.animations,action:null};
}

function animateActor(actor,offset=0){
  actor.mixer.stopAllAction();actor.action=actor.mixer.clipAction(actor.clips.find(c=>c.name===state.clip));
  actor.action.setLoop(T.LoopRepeat,Infinity).play();actor.offset=offset;
}

async function loadLOD(lod){
  const version=++loadVersion,savedTime=state.time;ready=false;api.ready=false;$('loading').hidden=false;
  const assets=await Promise.all(manifest.fans.map((_,i)=>asset(i,lod)));
  if(version!==loadVersion)return;
  for(const a of crowdActors){scene.remove(a.root);a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);}
  crowdActors.length=0;mixers.length=0;
  for(let i=0;i<16;i++){
    const a=makeActor(assets[i]);a.root.position.set(((i%8)-3.5)*.83,Math.floor(i/8)*.79,-Math.floor(i/8)*.98);
    scene.add(a.root);crowdActors.push(a);mixers.push(a.mixer);
  }
  await selectFan(state.fan);changeClip(state.clip);ready=true;api.ready=true;$('loading').hidden=true;
  $('budget').textContent=`16 × ${[210,90,24][state.lod]} △ · ${manifest.glbCount} GLB`;
  seek(savedTime);schedule();
}

async function selectFan(index){
  const version=++selectionVersion;state.fan=index;
  const gltf=await asset(index,state.lod);if(version!==selectionVersion)return;
  if(selected){detailScene.remove(selected.root);selected.mixer.stopAllAction();selected.mixer.uncacheRoot(selected.root);}
  selected=makeActor(gltf);selectedMixer=selected.mixer;
  // Normalize only the inspection view, retaining the real stature in the stand.
  selected.root.scale.setScalar(1.8/manifest.fans[index].heightM);
  selected.root.rotation.y=state.yaw;inspectionChair.rotation.y=state.yaw;detailScene.add(selected.root);animateActor(selected);
  const fan=manifest.fans[index];
  $('identity').textContent=`${fan.label} · גיל ${fan.age}`;
  $('details').textContent=`${Math.round(fan.heightM*100)} ס״מ · ${fan.scarf?'צעיף · ':''}${fan.cap?'כובע · ':''}${fan.glasses?'משקפיים':'בגדי אוהדים'}`;
  document.querySelectorAll('#fans button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  seek(state.time);
}

function changeClip(id){
  state.clip=id;state.time=0;$('motion').value=id;
  inspectionChair.visible=id==='sit';
  for(let i=0;i<crowdActors.length;i++)animateActor(crowdActors[i],id==='wave_clap'?i*.12:(id==='stand'||id==='sit'?i*.17:0));
  if(selected)animateActor(selected);
  $('motion-note').textContent=id==='wave_clap'?'גל בין הכיסאות · הפרש 0.12 שניות':'קנה מידה אנושי · מופעים עצמאיים';
  seek(0);schedule();
}

function seek(normalized){
  state.time=Math.max(0,Math.min(1,Number(normalized)));
  const clip=manifest?.clips.find(c=>c.id===state.clip);if(!clip)return;
  for(const actor of crowdActors){actor.mixer.setTime((state.time*clip.duration+actor.offset)%clip.duration);actor.root.updateMatrixWorld(true);}
  if(selected){selectedMixer.setTime(state.time===1?clip.duration-1e-7:state.time*clip.duration);selected.root.updateMatrixWorld(true);}
  if(state.face&&selected){const center=selected.root.getObjectByName('Head').getWorldPosition(new T.Vector3());center.y+=.04;detailCamera.position.set(center.x,center.y,5);detailCamera.lookAt(center);}
  $('time').value=state.time;render();
}

async function setState(patch){
  if('playing'in patch)state.playing=Boolean(patch.playing);
  if('face'in patch){state.face=Boolean(patch.face);$('focus').setAttribute('aria-pressed',String(state.face));$('focus').textContent=state.face?'גוף':'פנים';resize();}
  if('lod'in patch&&Number(patch.lod)!==state.lod){state.lod=Number(patch.lod);$('lod').value=state.lod;await loadLOD(state.lod);}
  if('fan'in patch&&patch.fan!==state.fan)await selectFan(Number(patch.fan));
  if('clip'in patch&&patch.clip!==state.clip)changeClip(patch.clip);
  if('yaw'in patch){state.yaw=Number(patch.yaw);inspectionChair.rotation.y=state.yaw;if(selected)selected.root.rotation.y=state.yaw;}
  $('play').textContent=state.playing?'עצירה':'ניגון';$('play').setAttribute('aria-pressed',String(state.playing));$('play').setAttribute('aria-label',state.playing?'עצירת האנימציה':'ניגון האנימציה');
  seek('time'in patch?patch.time:state.time);schedule();
}

function render(){
  if(!renderer||renderer.getContext().isContextLost())return;
  const w=canvas.clientWidth,h=canvas.clientHeight,split=Math.round(w*(w<450?.37:.31));
  renderer.setScissorTest(true);
  renderer.setViewport(0,0,split,h);renderer.setScissor(0,0,split,h);renderer.render(detailScene,detailCamera);
  renderer.setViewport(split,0,w-split,h);renderer.setScissor(split,0,w-split,h);renderer.render(scene,camera);
  renderer.setScissorTest(false);renders++;
}
function schedule(){
  if(request||!ready||!state.playing||document.hidden)return;
  last=performance.now();request=requestAnimationFrame(tick);
}
function tick(now){
  request=0;if(!ready||!state.playing||document.hidden)return;
  const duration=manifest.clips.find(c=>c.id===state.clip).duration;
  const dt=Math.min(.05,(now-last)/1000);last=now;seek((state.time+dt/duration)%1);
  request=requestAnimationFrame(tick);
}

try{
  manifest=await(await fetch(new URL('manifest.json',import.meta.url))).json();setup();
  for(const c of manifest.clips)$('motion').add(new Option(c.label,c.id));$('motion').value=state.clip;
  manifest.fans.forEach((fan,i)=>{const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.style.setProperty('--shirt',fan.shirt);b.setAttribute('aria-label',`${fan.label}, גיל ${fan.age}`);b.setAttribute('aria-pressed',String(i===state.fan));b.addEventListener('click',()=>setState({fan:i}));$('fans').append(b);});
  $('motion').addEventListener('change',e=>setState({clip:e.target.value}));
  $('lod').addEventListener('change',e=>setState({lod:Number(e.target.value)}));
  $('play').addEventListener('click',()=>setState({playing:!state.playing}));
  $('focus').addEventListener('click',()=>setState({face:!state.face}));
  $('time').addEventListener('input',e=>setState({playing:false,time:Number(e.target.value)}));
  let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,yaw:state.yaw};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag)setState({yaw:drag.yaw+(e.clientX-drag.x)*.012});});
  canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home',' '].includes(e.key)){e.preventDefault();if(e.key===' ')setState({playing:!state.playing});else setState({yaw:e.key==='Home'?0:state.yaw+(e.key==='ArrowLeft'?-.2:.2)});}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error').textContent='התצוגה נעצרה. משחזרים את החיבור הגרפי…';$('error').hidden=false;});
  canvas.addEventListener('webglcontextrestored',()=>{$('error').hidden=true;render();schedule();});
  await loadLOD(0);await setState({playing:state.playing});
}catch(error){$('loading').hidden=true;$('error').hidden=false;$('error').textContent='לא ניתן לפתוח את התצוגה. יש להגיש את התיקייה בשרת HTTP עם WebGL זמין.';console.error(error);}
