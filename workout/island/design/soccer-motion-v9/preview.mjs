import * as THREE from './runtime/vendor/three.module.js';
import {clips, loadClip, createPlayer, pathAt, disposeRuntime} from './runtime/library.mjs';
import {LEGAL_TRANSITIONS,createStateMachine} from './runtime/state-machine.mjs';
const $ = id => document.getElementById(id);
const ids = ['stage','loading','category','clip','index','note','duration','kind','travel','markers','autoplay','sheet','edges','title','camera','event','play','restart','speed','time','previous','next','timeline','events','status','brakeDemo'];
const ui = Object.fromEntries(ids.map(id => [id, $(id)]));
const labels = {plant:'נטיעה',contact:'מגע',release:'שחרור',takeoff:'המראה',land:'נחיתה'};
const state = {id: null, time: 0, playing: true, speed: 1, travel: true, markers: true, ready: false, pending: false, disposed: false, azimuth: -.55, elevation: .15, zoom: 1, errors: []};
const capture = new URLSearchParams(location.search).has('capture');
if (capture) {document.body.classList.add('capture'); state.playing = false;}
const scene = new THREE.Scene(); scene.background = new THREE.Color('#28423f');
scene.add(new THREE.HemisphereLight('#d6eee5','#37493c',2.3));
const sun = new THREE.DirectionalLight('#fff3d5',3);sun.position.set(3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.camera.far=35;sun.shadow.bias=-.0003;sun.shadow.normalBias=.015;scene.add(sun);scene.add(sun.target);
const rim = new THREE.DirectionalLight('#b2d9ef',1.5);rim.position.set(-4,3,-3);scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),new THREE.MeshStandardMaterial({color:'#38564a',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor);
const grid = new THREE.GridHelper(120,120,'#789480','#5a7864');grid.position.y=-.009;grid.material.transparent=true;grid.material.opacity=.18;scene.add(grid);
const centerCircle = [];
for (let i=0;i<=90;i++){const a=i/90*Math.PI*2;centerCircle.push(new THREE.Vector3(Math.sin(a)*1.7,.002,Math.cos(a)*1.7));}
scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(centerCircle),new THREE.LineBasicMaterial({color:'#b4ccb4',transparent:true,opacity:.4})));
const camera = new THREE.PerspectiveCamera(35,1,.03,250);
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
ui.stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','דמות כדורגל בתנועה');
const ball = new THREE.Group();
const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(.11,3),new THREE.MeshStandardMaterial({color:'#eee9d9',roughness:.85}));ball.add(shell);
for (const v of [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[.58,.58,.58],[-.58,.58,-.58],[.58,-.58,-.58],[-.58,-.58,.58]]) {
 const p=new THREE.Vector3(...v).normalize(),patch=new THREE.Mesh(new THREE.CircleGeometry(.03,5),new THREE.MeshStandardMaterial({color:'#1c2b27',roughness:1}));patch.position.copy(p).multiplyScalar(.1105);patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),p);ball.add(patch);
}
scene.add(ball);
const markers = new THREE.Group();scene.add(markers);
const markerMaterial=new THREE.MeshBasicMaterial({color:'#e6f5b5',transparent:true,opacity:.85});
const contactMaterial=new THREE.MeshBasicMaterial({color:'#ffc578'});
const bounds=new THREE.Box3(),target=new THREE.Vector3(),follow=new THREE.Vector3(),spherical=new THREE.Vector3();
let player=null,disposePending=null,brakeDemo=null,demoLoading=false,lastBrakeEvidence=null,loadEpoch=0,boxSize=new THREE.Vector3(1,2,1),lastTick=performance.now(),frame=0,drag=null;
function filtered(){return clips.filter(c=>ui.category.value==='all'||c.category===ui.category.value);}
function selectOptions(){const values=filtered();ui.clip.replaceChildren(...values.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;return o;}));if(values.some(c=>c.id===state.id))ui.clip.value=state.id;}
function heldBallAt(meta,time){
 const contacts=meta.events.filter(e=>e.type==='contact'),releases=meta.events.filter(e=>e.type==='release');
 return contacts.some(contact=>{const release=releases.find(e=>e.time>=contact.time-1e-7);return time>=contact.time-1e-7&&time<=(release?.time??meta.duration)+1e-7;});
}
function bodyBounds(p,out=new THREE.Box3()){
 out.makeEmpty();const one=new THREE.Box3();p.root.updateMatrixWorld(true);
 p.scene.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();one.copy(o.boundingBox).applyMatrix4(o.matrixWorld);}else{o.geometry.computeBoundingBox();one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);}out.union(one);});return out;
}
function frameBounds(){
 bounds.makeEmpty();const temp=new THREE.Box3();player.setTravel(true);
 const times=[...new Set([...Array.from({length:25},(_,i)=>player.meta.duration*i/24),...player.meta.events.map(e=>e.time)])].sort((a,b)=>a-b);
 for(const t of times){
  player.setTime(t);bodyBounds(player,temp);temp.translate(player.root.position.clone().multiplyScalar(-1));bounds.union(temp);
  if(heldBallAt(player.meta,t)){
   const center=new THREE.Vector3(...pathAt(player.meta.ball?.keys,t)),r=player.meta.ball?.radius||.11;
   bounds.expandByPoint(center.clone().addScalar(r));bounds.expandByPoint(center.clone().addScalar(-r));
  }
 }
 if(bounds.isEmpty())bounds.setFromCenterAndSize(new THREE.Vector3(0,.85,0),new THREE.Vector3(.8,1.8,.8));
 bounds.getSize(boxSize);bounds.getCenter(target);target.y=Math.max(.45,target.y);player.setTime(0);player.setTravel(state.travel);
}
function boxCorners(box){const values=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])values.push(new THREE.Vector3(x,y,z));return values;}
function framingProof(){
 const box=bodyBounds(player);if(ball.visible&&heldBallAt(player.meta,state.time)){const r=player.meta.ball?.radius||.11;box.expandByPoint(ball.position.clone().addScalar(r));box.expandByPoint(ball.position.clone().addScalar(-r));}
 const projected=boxCorners(box).map(v=>v.project(camera));
 const minX=Math.min(...projected.map(v=>(v.x+1)*ui.stage.clientWidth/2)),maxX=Math.max(...projected.map(v=>(v.x+1)*ui.stage.clientWidth/2));
 const minY=Math.min(...projected.map(v=>(1-v.y)*ui.stage.clientHeight/2)),maxY=Math.max(...projected.map(v=>(1-v.y)*ui.stage.clientHeight/2));
 return {minX,maxX,minY,maxY,width:ui.stage.clientWidth,height:ui.stage.clientHeight,allBodyAndHeldBallVisible:minX>=0&&maxX<=ui.stage.clientWidth&&minY>=0&&maxY<=ui.stage.clientHeight};
}
function updateCamera(){
 const width=ui.stage.clientWidth,height=ui.stage.clientHeight;if(width<2||height<2)return;
 renderer.setSize(width,height,false);camera.aspect=width/height;
 const verticalFov=THREE.MathUtils.degToRad(camera.fov),heightNeed=Math.max(boxSize.y*1.16,boxSize.x/camera.aspect*1.15,1.55);
 let distance=heightNeed/(2*Math.tan(verticalFov/2));
 const world=state.travel&&player?pathAt(player.meta.travel,state.time).map((v,i)=>v+player.worldOffset[i]):[0,0,0];
 follow.copy(target).add(new THREE.Vector3(...world));
 sun.position.set(3+world[0],6,5+world[2]);sun.target.position.set(world[0],0,world[2]);
 // Recenter a periodic world grid by exact whole metre tiles. The field
 // coordinates remain fixed; neither a planted foot nor its grid moves.
 grid.position.x=Math.floor(world[0]/10)*10;grid.position.z=Math.floor(world[2]/10)*10;
 const direction=new THREE.Vector3(Math.sin(state.azimuth)*Math.cos(state.elevation),Math.sin(state.elevation),Math.cos(state.azimuth)*Math.cos(state.elevation));
 camera.updateProjectionMatrix();
 for(let fit=0;fit<30;fit++){camera.position.copy(follow).addScaledVector(direction,distance);camera.lookAt(follow);camera.updateMatrixWorld(true);const projected=boxCorners(bounds).map(v=>v.add(new THREE.Vector3(...world)).project(camera));if(projected.every(v=>Math.abs(v.x)<=.9&&Math.abs(v.y)<=.9))break;distance*=1.055;}
 camera.position.copy(follow).addScaledVector(direction,distance*state.zoom);camera.lookAt(follow);camera.updateMatrixWorld(true);
}
function updateMarkers(){
 for(const mesh of [...markers.children]){markers.remove(mesh);mesh.geometry.dispose();}
 if(!state.markers||!player)return;
 const {meta}=player,travel=pathAt(meta.travel,state.time),offset=state.travel?player.worldOffset:travel.map(v=>-v);
 for(const s of meta.supports||[]){if(state.time+1e-5<s.start||state.time-1e-5>s.end)continue;const mesh=new THREE.Mesh(new THREE.RingGeometry(.065,.083,20),markerMaterial);mesh.rotation.x=-Math.PI/2;mesh.position.fromArray(s.anchor.map((v,i)=>v+offset[i]));mesh.position.y=.006;markers.add(mesh);}
 for(const e of meta.events||[]){if(!['contact','release'].includes(e.type)||Math.abs(e.time-state.time)>.07||!e.position)continue;const mesh=new THREE.Mesh(new THREE.SphereGeometry(.026,10,8),contactMaterial);mesh.position.fromArray(e.position);if(state.travel)mesh.position.add(new THREE.Vector3(...travel.map((v,i)=>v+player.worldOffset[i])));markers.add(mesh);}
}
function draw(){
 if(!player||state.disposed)return;
 player.setTime(state.time);player.setTravel(state.travel);
 const meta=player.meta,travel=pathAt(meta.travel,state.time);
 ball.visible=(meta.category==='ball'||meta.id==='slide_miss'||meta.events.some(e=>['contact','release'].includes(e.type)))&&meta.ball?.keys?.length>0;
 if(ball.visible){ball.position.fromArray(pathAt(meta.ball.keys,state.time));if(state.travel)ball.position.add(new THREE.Vector3(...travel.map((v,i)=>v+player.worldOffset[i])));ball.rotation.x=-state.time*3;}
 updateMarkers();updateCamera();renderer.render(scene,camera);
 ui.timeline.value=String(state.time/meta.duration);ui.time.textContent=`${state.time.toFixed(2)} / ${meta.duration.toFixed(2)}`;
 const close=(meta.events||[]).filter(e=>Math.abs(e.time-state.time)<.065);
 ui.event.textContent=[...new Set(close.map(e=>labels[e.type]||e.type))].join(' · ');
}
function cancelBrakeDemo(){brakeDemo?.nextPlayer?.dispose();brakeDemo=null;}
function updateMetaUI(meta){
 ui.clip.value=meta.id;ui.index.textContent=`${String(clips.indexOf(meta)+1).padStart(2,'0')} / ${clips.length}`;
 ui.title.textContent=meta.label;ui.duration.textContent=meta.duration.toFixed(2);ui.kind.textContent=meta.loop?'לולאה רציפה':'פעולה מלאה';
 const notes={free:'קצב צעדים, תמיכה והעברת משקל.',ball:'תמיכה, מגע וריכוך בתנועה מלאה.',slide:'גלישה, תמיכה והתאוששות מבוקרת.',keeper:'תנועה מתוזמנת עם מגע ושחרור.',celebration:'מחווה מקורית ותנועה מאוזנת.'};
 ui.note.textContent=meta.descriptionHe||notes[meta.category]||'תנועה מלאה עם תמיכה ומגע מתוזמן.';
 ui.sheet.href=`./verification/contact-sheets/${meta.id}.png`;
 ui.events.replaceChildren(...(meta.events||[]).filter(e=>e.type!=='plant').map(e=>{const b=document.createElement('button');b.textContent=`${labels[e.type]||e.type} ${e.time.toFixed(2)}`;b.addEventListener('click',()=>{cancelBrakeDemo();state.playing=false;state.time=e.time;syncPlay();draw();});return b;}));
 ui.edges.replaceChildren(...LEGAL_TRANSITIONS.filter(e=>e.from===meta.id).map(e=>{const li=document.createElement('li'),b=document.createElement('button');b.textContent=clips.find(c=>c.id===e.to)?.label||e.to;b.title=`${e.trigger} · ${e.blend}s`;b.addEventListener('click',()=>select(e.to));li.append(b);return li;}));
}
async function select(id,{keepPlaying=true}={}){
 if(state.disposed)throw new Error('Motion preview disposed');
 const meta=clips.find(c=>c.id===id);if(!meta)throw new RangeError(`Unknown clip ${id}`);
 if(brakeDemo?.nextPlayer)brakeDemo.nextPlayer.dispose();brakeDemo=null;
 const epoch=++loadEpoch;state.pending=true;ui.loading.hidden=false;ui.loading.textContent='טוען את התנועה…';
 const loaded=await loadClip(id);
 if(epoch!==loadEpoch||state.disposed){const stale=createPlayer(loaded);stale.dispose();return;}
 if(player)player.dispose();player=createPlayer(loaded,{travel:false});player.scene.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player.root);
 state.id=id;state.time=0;state.pending=false;if(!keepPlaying)state.playing=false;
 frameBounds();updateMetaUI(meta);
 ui.status.textContent=`${clips.length} קליפים · Draco מקומי · תצוגה מוכנה`;ui.loading.hidden=true;syncPlay();draw();
 return {id,animation:loaded.animation.name,bones:loaded.gltf.scene.getObjectByName('Hips')?.name,meshes:loaded.gltf.scene.children.length};
}
function poseWorld(p){
 const positions={},rotations={};p.root.updateMatrixWorld(true);
 for(const name of ['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']){
  const bone=p.scene.getObjectByName(name);positions[name]=bone.getWorldPosition(new THREE.Vector3()).toArray();rotations[name]=bone.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray();
 }
 return {root:p.root.position.toArray(),positions,rotations};
}
function advanceBrake(absoluteTime){
 if(!brakeDemo)throw new Error('Start the run-to-brake demo first');
 const d=brakeDemo;if(absoluteTime<d.elapsed-1e-7)throw new RangeError('Demo time must advance');d.elapsed=absoluteTime;
 if(d.phase==='running'&&absoluteTime+1e-7>=d.switchAt){
  const step=1/30,source=player;source.setTime(d.switchAt-step);const sourcePrevious=source.root.position.toArray();source.setTime(d.switchAt);const before=poseWorld(source);
  const destination=d.nextPlayer;destination.setTravel(true);destination.setTime(0);const destinationOrigin=destination.root.position.toArray();destination.setWorldOffset(before.root.map((v,i)=>v-destinationOrigin[i]));destination.setTime(0);const after=poseWorld(destination);
  destination.setTime(step);const destinationNext=destination.root.position.toArray();destination.setTime(0);
  const incoming=before.root.map((v,i)=>(v-sourcePrevious[i])/step),outgoing=destinationNext.map((v,i)=>(v-after.root[i])/step);
  const positionError=Math.max(...Object.keys(before.positions).map(n=>Math.hypot(...before.positions[n].map((v,i)=>v-after.positions[n][i]))));
  const angularError=Math.max(...Object.keys(before.rotations).map(n=>2*Math.acos(Math.min(1,Math.abs(before.rotations[n].reduce((sum,v,i)=>sum+v*after.rotations[n][i],0))))*180/Math.PI));
  const transition=d.machine.tick(d.switchAt);
  lastBrakeEvidence={from:'run',to:'run_brake',requestAt:d.requestAt,switchedAt:d.switchAt,alignBone:'LeftFoot',queuedState:d.request,transition,source:before,target:after,worldPositionJumpM:Math.hypot(...before.root.map((v,i)=>v-after.root[i])),maxBonePositionJumpM:positionError,maxBoneAngleJumpDeg:angularError,incomingVelocityMps:incoming,outgoingVelocityMps:outgoing,velocityDifferenceMps:Math.hypot(...incoming.map((v,i)=>v-outgoing[i]))};
  source.dispose();player=destination;d.nextPlayer=null;scene.add(player.root);d.phase='braking';state.id='run_brake';updateMetaUI(player.meta);
 }
 if(d.phase==='running'){state.time=absoluteTime;d.machine.tick(absoluteTime);}else{state.time=Math.min(player.meta.duration,absoluteTime-d.switchAt);if(state.time>=player.meta.duration){state.playing=false;syncPlay();ui.status.textContent='הבלימה הושלמה ברצף';brakeDemo=null;}}
 draw();return {state:state.id,time:state.time,evidence:lastBrakeEvidence};
}
async function startBrakeDemo({startTime=.07,playing=true}={}){
 await ready;if(state.disposed)return {cancelled:true};if(state.pending||demoLoading)return {pending:true};
 demoLoading=true;ui.brakeDemo.disabled=true;try {
 ui.category.value='all';selectOptions();state.playing=false;if(state.id!=='run'){const selected=await select('run',{keepPlaying:false});if(!selected||state.id!=='run'||state.pending||state.disposed)return {cancelled:true};}
 if(brakeDemo?.nextPlayer)brakeDemo.nextPlayer.dispose();brakeDemo=null;
 const epoch=loadEpoch,nextLoaded=await loadClip('run_brake'),nextPlayer=createPlayer(nextLoaded,{travel:true});if(epoch!==loadEpoch||state.disposed){nextPlayer.dispose();return {cancelled:true};}nextPlayer.scene.traverse(o=>{if(o.isMesh)o.castShadow=true;});
 state.travel=true;ui.travel.checked=true;player.setTravel(true);player.setWorldOffset([0,0,0]);
 state.time=Math.max(.001,Math.min(player.meta.duration-.001,startTime));player.setTime(state.time);
 const machine=createStateMachine('run');machine.tick(state.time);const request=machine.transition('run_brake',{trigger:'stop'});
 brakeDemo={machine,nextPlayer,phase:'running',request,requestAt:state.time,switchAt:request.queued.at,elapsed:state.time};lastBrakeEvidence=null;
 state.playing=playing;syncPlay();ui.status.textContent='ריצה ← נטיעת שמאל ← בלימה';draw();return {requestAt:state.time,switchAt:request.queued.at,request};
 }finally{demoLoading=false;ui.brakeDemo.disabled=false;}
}
function syncPlay(){ui.play.setAttribute('aria-pressed',String(state.playing));ui.play.textContent=state.playing?'השהיה':'ניגון';ui.play.setAttribute('aria-label',state.playing?'השהיית ניגון':'ניגון תנועה');}
function nextClip(delta=1){const subset=filtered(),index=subset.findIndex(c=>c.id===state.id);return select(subset[(index+delta+subset.length)%subset.length].id);}
ui.category.addEventListener('change',()=>{selectOptions();if(!filtered().some(c=>c.id===state.id))select(filtered()[0].id);});
ui.clip.addEventListener('change',()=>select(ui.clip.value));ui.play.addEventListener('click',()=>{state.playing=!state.playing;syncPlay();});
ui.restart.addEventListener('click',()=>{if(brakeDemo){select(state.id);return;}player.setWorldOffset([0,0,0]);state.time=0;draw();});ui.brakeDemo.addEventListener('click',()=>startBrakeDemo());ui.previous.addEventListener('click',()=>nextClip(-1));ui.next.addEventListener('click',()=>nextClip(1));
ui.speed.addEventListener('change',()=>{state.speed=Number(ui.speed.value);});ui.travel.addEventListener('change',()=>{state.travel=ui.travel.checked;draw();});ui.markers.addEventListener('change',()=>{state.markers=ui.markers.checked;draw();});
ui.timeline.addEventListener('input',()=>{cancelBrakeDemo();state.playing=false;state.time=Number(ui.timeline.value)*player.meta.duration;syncPlay();draw();});
ui.camera.addEventListener('click',()=>{state.azimuth=-.55;state.elevation=.15;state.zoom=1;draw();});
renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;state.azimuth+=(e.clientX-drag.x)*.009;state.elevation=Math.max(-.1,Math.min(.8,state.elevation+(e.clientY-drag.y)*.005));drag={x:e.clientX,y:e.clientY};draw();});
renderer.domElement.addEventListener('pointerup',()=>{drag=null;});renderer.domElement.addEventListener('pointercancel',()=>{drag=null;});
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.65,Math.min(1.8,state.zoom+e.deltaY*.0006));draw();},{passive:false});
ui.stage.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();state.playing=!state.playing;syncPlay();}if(e.key==='ArrowRight'){cancelBrakeDemo();state.time=Math.max(0,state.time-1/30);state.playing=false;draw();syncPlay();}if(e.key==='ArrowLeft'){cancelBrakeDemo();state.time=Math.min(player.meta.duration,state.time+1/30);state.playing=false;draw();syncPlay();}});
const resizeObserver=new ResizeObserver(()=>draw());resizeObserver.observe(ui.stage);
window.addEventListener('error',e=>state.errors.push(e.message));window.addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason)));
function animate(now){if(state.disposed)return;frame=requestAnimationFrame(animate);const delta=Math.min(.1,(now-lastTick)/1000);lastTick=now;if(!state.ready||state.pending||!state.playing)return;if(brakeDemo){advanceBrake(brakeDemo.elapsed+delta*state.speed);return;}state.time+=delta*state.speed;if(state.time>=player.meta.duration){if(ui.autoplay.checked){state.time=0;nextClip();return;}if(state.travel&&player.meta.loop){const cycles=Math.floor(state.time/player.meta.duration),start=pathAt(player.meta.travel,0),end=pathAt(player.meta.travel,player.meta.duration);player.setWorldOffset(player.worldOffset.map((v,i)=>v+cycles*(end[i]-start[i])));}
 state.time%=player.meta.duration;}draw();}
const ready=(async()=>{selectOptions();const requested=new URLSearchParams(location.search).get('clip');await select(clips.some(c=>c.id===requested)?requested:clips[0].id);if(state.disposed)return false;state.ready=true;frame=requestAnimationFrame(animate);return true;})().catch(error=>{state.errors.push(String(error));ui.loading.textContent=`טעינה נכשלה: ${error.message}`;ui.status.textContent='טעינה נכשלה';throw error;});
window.__motionV9={ready,state,clips,startBrakeDemo,renderBrakeAt:async seconds=>{state.playing=false;const result=advanceBrake(seconds);await new Promise(requestAnimationFrame);return result;},get brakeEvidence(){return lastBrakeEvidence;},select:async id=>{await ready;return select(id,{keepPlaying:false});},renderAt:async seconds=>{await ready;state.playing=false;state.time=Math.max(0,Math.min(player.meta.duration,seconds));syncPlay();draw();await new Promise(requestAnimationFrame);return {id:state.id,time:state.time,animation:player.loaded.animation.name,meshes:renderer.info.render.calls,framing:framingProof()};},setCamera:async({azimuth=-.55,elevation=.15,zoom=1}={})=>{state.azimuth=azimuth;state.elevation=elevation;state.zoom=zoom;draw();},setTravel:enabled=>{state.travel=!!enabled;ui.travel.checked=state.travel;draw();},get canvas(){return renderer.domElement;},get bounds(){return {min:bounds.min.toArray(),max:bounds.max.toArray()};},dispose(){if(disposePending)return disposePending;state.disposed=true;state.playing=false;++loadEpoch;cancelAnimationFrame(frame);resizeObserver.disconnect();brakeDemo?.nextPlayer?.dispose();player?.dispose();disposePending=disposeRuntime().then(()=>renderer.dispose());return disposePending;}};
window.addEventListener('pagehide',()=>window.__motionV9.dispose());
