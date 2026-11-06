import * as THREE from './runtime/vendor/three.module.js';
import { mergeGeometries } from './runtime/vendor/BufferGeometryUtils.js';
import { loadLibrary, createController } from './runtime/controller.mjs';
import { clips, transitions } from './runtime/catalog.mjs';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['stage','loading','clipSelect','clipCount','clipNumber','duration','loopBadge','clipNote','zonePanel','zoneToggle','goalZones','clipTitle','clipKind','stageIndex','fieldTab','keeperTab','nearCamera','farCamera','playPause','playIcon','playLabel','restart','speed','scrub','eventTicks','eventButtons','frameLink','currentTime','totalTime','status','eventStatus','transitionList','transitionDock'].map(id => [id, $(id)]));
const eventLabels = { contact:'מגע', release:'שחרור', plant:'תמיכה', land:'נחיתה', takeoff:'המראה' };
const info = new Map(clips.map(c => [c.id,c]));
const clipIndex = new Map(clips.map((c,i) => [c.id,i+1]));
// View the striking side rather than foreshortening a leg toward the lens.
const controlledIds = new Set(['first_touch_moving','dribble','turn_with_ball','cut','receive_foot','receive_chest','shield']);
const possessedAtStart = new Set(['dribble','turn_with_ball','cut','shield']);
const viewDegrees = {pass_short:-30,pass_long:-65,pass_loft:-65,shot:-68,slide:-60,receive_foot:-50,first_touch_moving:-50,shield:-55,receive_chest:-40,dribble:-35,turn_with_ball:-45,cut:-45,block:-38};
const errors = [];
const state = { role:'field', id:'pass_short', camera:'near', azimuth:.34, elevation:.20, speed:1, playing:true, dragging:false, ready:false, zonesOpen:false, raf:0, previous:0, disposed:false };
const scene = new THREE.Scene();
scene.background = new THREE.Color('#14232d');
scene.fog = new THREE.Fog('#14232d',12,28);
const camera = new THREE.PerspectiveCamera(34,1,.05,90);
let renderer, library, controller;
const controllers = {};
const measured = new Map(), criticalFrames = new Map(), controlledFrames = new Map();
const stageSize = new THREE.Vector2();
const ballPosition = new THREE.Vector3();
const cameraBasePosition = new THREE.Vector3(), cameraBaseTarget = new THREE.Vector3(), cameraFollow = new THREE.Vector3();
const hebrewNotes = {
  idle:'עמידה מאוזנת ונשימה קלה. שתי הרגליים נשארות בתמיכה.',
  keeper_ready:'עמידת שוער נמוכה: ברכיים כפופות, ידיים מוכנות לפני הגוף.',
  pass_short:'מסירה בחלק הפנימי של כף הרגל, עם צעד תמיכה והמשך תנועה קצר.',
  pass_long:'מסירה חזקה בטווח ארוך, עם סיבוב אגן והמשך תנועה דרך הכדור.',
  pass_loft:'כניסה מתחת לכדור ושחרור גבוה, עם הטיית גוף מבוקרת לאחור.',
  shot:'טעינה, תמיכה לצד הכדור ובעיטה מלאה לשער.',
  receive_chest:'ריכוך הכדור בחזה, הורדתו והכנה לפעולה הבאה.',
  receive_foot:'ריכוך המגע בכף הרגל והורדת הכדור לקרקע בשליטה.',
  first_touch_moving:'קבלת הכדור תוך התקדמות ומגע שמכוון אותו להמשך הריצה.',
  dribble:'נגיעות קצרות מתחלפות תוך ריצה. המצלמה מלווה את ההתקדמות הרציפה.',
  turn_with_ball:'פנייה עם הכדור, שינוי כיוון ושמירה עליו קרוב לרגל.',
  shield:'הגנה על הכדור בעזרת הגוף, בסיס רחב וידיים לאיזון.',
  block:'צעד סגירה לרוחב, ידיים צמודות ובלימת הכדור בגוף לפני הסטתו.',
  cut:'הטעיית גוף, תמיכה חזקה ושינוי חד בכיוון הכדור.',
  slide:'החלקה אל הכדור, מגע צד מבוקר וקימה הדרגתית בתמיכת הידיים.',
  keeper_throw:'אחיזה, טעינה ביד אחת ושחרור הכדור מעל הכתף.'
};
function noteFor(clip){return hebrewNotes[clip.id] || (clip.zone ? `${clip.zone.label}: דחיפה, זינוק למגע, נחיתה והתאוששות לעמידת מוצא.` : 'תנועה מלאה עם סמני מגע, שחרור ותמיכה.');}
const ambient = new THREE.HemisphereLight('#c5e8f4','#293a31',2.15);
scene.add(ambient);
const key = new THREE.DirectionalLight('#fff5db',3.25);
key.position.set(3.5,7,5);
scene.add(key);
const rim = new THREE.DirectionalLight('#9bd9ff',1.6);
rim.position.set(-4,4,-3);
scene.add(rim);

// A lightweight pitch gives the gestures scale without adding another asset.
const floorMaterial = new THREE.MeshStandardMaterial({ color:'#2c5948',roughness:1,metalness:0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(36,36),floorMaterial);
floor.rotation.x=-Math.PI/2;
floor.position.y=-.012;
scene.add(floor);
const lines=[];
for(let x=-12;x<=12;x+=3) lines.push(x,.002,-14,x,.002,14);
for(let z=-12;z<=12;z+=3) lines.push(-14,.002,z,14,.002,z);
const gridGeo = new THREE.BufferGeometry();
gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
const pitchGrid = new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({ color:'#7aaf90',transparent:true,opacity:.11 }));
scene.add(pitchGrid);
const lineMaterial = new THREE.LineBasicMaterial({ color:'#c8e2cc',transparent:true,opacity:.38 });
const linePoints = [[-3.66,.008,-.9],[3.66,.008,-.9],[3.66,.008,4.2],[-3.66,.008,4.2],[-3.66,.008,-.9]].map(p=>new THREE.Vector3(...p));
const pitchLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints),lineMaterial);
scene.add(pitchLine);
const arc=[];
for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;arc.push(new THREE.Vector3(Math.sin(a)*1.25,.009,Math.cos(a)*1.25));}
const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc),new THREE.LineBasicMaterial({color:'#c8e2cc',transparent:true,opacity:.2}));
scene.add(circle);
const goal=new THREE.Group();
const postMaterial = new THREE.MeshStandardMaterial({ color:'#d5ddd8',roughness:.65 });
function bar(a,b,r=.035){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),postMaterial);mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());goal.add(mesh);}
bar([-3.66,0,-.9],[-3.66,2.44,-.9]);bar([3.66,0,-.9],[3.66,2.44,-.9]);bar([-3.66,2.44,-.9],[3.66,2.44,-.9]);
bar([-3.66,0,-2],[-3.66,2.44,-.9],.02);bar([3.66,0,-2],[3.66,2.44,-.9],.02);
const net=[];
for(let x=-3.6;x<=3.61;x+=.24)net.push(x,0,-2,x,2.44,-.9);
for(let y=0;y<=2.45;y+=.22)net.push(-3.66,y,-2+y/2.44*1.1,3.66,y,-2+y/2.44*1.1);
const netGeo=new THREE.BufferGeometry();netGeo.setAttribute('position',new THREE.Float32BufferAttribute(net,3));
goal.add(new THREE.LineSegments(netGeo,new THREE.LineBasicMaterial({color:'#91a4ae',transparent:true,opacity:.13})));
scene.add(goal);

const ball = new THREE.Group();
// Bake the ivory shell and dark pentagonal panels into one mesh. Vertex colours
// retain the same linear colours and surface normals without eleven draw calls.
function coloured(geometry,hex){
  const result=geometry.index?geometry.toNonIndexed():geometry;
  if(result!==geometry)geometry.dispose();
  const colour=new THREE.Color(hex),array=new Float32Array(result.attributes.position.count*3);
  for(let i=0;i<array.length;i+=3){array[i]=colour.r;array[i+1]=colour.g;array[i+2]=colour.b;}
  result.setAttribute('color',new THREE.Float32BufferAttribute(array,3));
  return result;
}
const ballPieces=[coloured(new THREE.IcosahedronGeometry(.11,2),'#f1eadb')];
const panelDirs=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[.58,.58,.58],[-.58,.58,-.58],[.58,-.58,-.58],[-.58,-.58,.58]];
for(const values of panelDirs){
  const normal=new THREE.Vector3(...values).normalize();
  const geometry=coloured(new THREE.CircleGeometry(.031,5),'#18342d');
  const matrix=new THREE.Matrix4().compose(normal.clone().multiplyScalar(.1105),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal),new THREE.Vector3(1,1,1));
  ballPieces.push(geometry.applyMatrix4(matrix));
}
const ballGeometry=mergeGeometries(ballPieces,false);
for(const geometry of ballPieces)geometry.dispose();
ball.add(new THREE.Mesh(ballGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.8})));
scene.add(ball);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(.27,32),new THREE.MeshBasicMaterial({color:'#071712',transparent:true,opacity:.20,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=.003;scene.add(shadow);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(.12,20),new THREE.MeshBasicMaterial({color:'#081b13',transparent:true,opacity:.25,depthWrite:false}));
ballShadow.rotation.x=-Math.PI/2;ballShadow.position.y=.004;scene.add(ballShadow);

function active(){return info.get(state.id);}
function setText(id,text){elements[id].textContent=text;}
function setPlaying(playing){state.playing=playing;if(controller){if(playing)controller.resume();else controller.pause();}elements.playIcon.className=playing?'pause-icon':'play-icon';setText('playLabel',playing?'השהיה':'ניגון');elements.playPause.setAttribute('aria-label',playing?'השהיית תנועה':'ניגון תנועה');}
function fillSelect(){const subset=clips.filter(c=>c.role===state.role);elements.clipSelect.replaceChildren(...subset.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.label;return option;}));elements.clipSelect.value=state.id;elements.fieldTab.setAttribute('aria-pressed',state.role==='field');elements.keeperTab.setAttribute('aria-pressed',state.role==='keeper');elements.zonePanel.hidden=state.role!=='keeper'||!state.zonesOpen;elements.zoneToggle.hidden=state.role!=='keeper';elements.loopBadge.hidden=state.role==='keeper';elements.zoneToggle.setAttribute('aria-expanded',!elements.zonePanel.hidden);}
function currentBounds(){const box=new THREE.Box3();const one=new THREE.Box3();controller.root.updateMatrixWorld(true);controller.root.traverse(object=>{if(!object.isMesh)return;if(object.isSkinnedMesh){object.skeleton.update();object.computeBoundingBox();one.copy(object.boundingBox).applyMatrix4(object.matrixWorld);}else if(object.geometry){object.geometry.computeBoundingBox();one.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);}else return;box.union(one);});return box;}
function controlledStart(clip){
  if(!controlledIds.has(clip.id))return null;
  if(possessedAtStart.has(clip.id))return 0;
  const contacts=clip.events.filter(event=>event.type==='contact').map(event=>event.time);
  return contacts.length?Math.min(...contacts):null;
}
function interpolatePath(keys,time,out=new THREE.Vector3()){
  if(!keys?.length)return out.set(0,0,0);
  if(time<=keys[0].time)return out.fromArray(keys[0].position);
  if(time>=keys.at(-1).time)return out.fromArray(keys.at(-1).position);
  let lo=0,hi=keys.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid].time<=time)lo=mid;else hi=mid;}
  return out.fromArray(keys[lo].position).lerp(new THREE.Vector3().fromArray(keys[hi].position),(time-keys[lo].time)/(keys[hi].time-keys[lo].time));
}
function controlledSampleTimes(clip,start){
  const times=[start,clip.duration,...(clip.ball?.keys||[]).map(key=>key.time),...(clip.travel||[]).map(key=>key.time)];
  for(let frame=0;start+frame/30<clip.duration;frame++)times.push(start+frame/30);
  return [...new Set(times.filter(time=>time>=start-1e-8&&time<=clip.duration+1e-8).map(time=>Math.max(start,Math.min(clip.duration,time))))].sort((a,b)=>a-b);
}
function analyticBallPoint(clip,time){
  const cycles=clip.loop?Math.floor(time/clip.duration):0,local=clip.loop?time%clip.duration:Math.min(time,clip.duration);
  const point=interpolatePath(clip.ball?.keys,local);
  if(clip.travel?.length){point.add(interpolatePath(clip.travel,local));if(cycles)point.addScaledVector(new THREE.Vector3().fromArray(clip.travel.at(-1).position),cycles);}
  return controller.root.localToWorld(point);
}
function measureClip(){
  if(measured.has(state.id))return measured.get(state.id);
  const old=controller.time,clip=active(),bounds=new THREE.Box3(),critical=[];
  const times=new Set([0,clip.duration,...clip.events.map(e=>e.time),...Array.from({length:17},(_,i)=>i/16*clip.duration)]);
  for(const time of times){
    controller.seek(time);bounds.union(currentBounds());
    const cues=clip.events.filter(e=>['contact','release'].includes(e.type)&&Math.abs(e.time-time)<1e-7);
    if(!cues.length)continue;
    const radius=clip.ball?.radius||.11,centre=controller.root.localToWorld(controller.ballPosition(new THREE.Vector3()));
    // Flight after release is intentionally excluded from the framing envelope.
    // The entire ball and the contacting hand/boot remain visible at each cue.
    bounds.union(new THREE.Box3().setFromCenterAndSize(centre,new THREE.Vector3(2*radius,2*radius,2*radius)));
    const points=[{kind:'ball',type:'ball',bone:null,centre:centre.clone(),radius}];
    for(const cue of cues){
      if(!cue.position)continue;
      const centre=controller.actor.localToWorld(new THREE.Vector3().fromArray(cue.position));
      points.push({kind:`${cue.type}:${cue.bone}`,type:cue.type,bone:cue.bone,centre,radius:cue.bone?.includes('Foot') ? .075 : .065});
    }
    critical.push({time,types:[...new Set(cues.map(cue=>cue.type))],points});
  }
  controller.seek(old);
  const held=[],start=controlledStart(clip);
  if(start!==null){
    const radius=clip.ball?.radius||.11;
    // Ball/travel paths are sampled analytically. Even a120Hz path never
    // triggers extra skinning or body-envelope scans during clip selection.
    for(const time of controlledSampleTimes(clip,start)){
      const centre=analyticBallPoint(clip,time);
      bounds.union(new THREE.Box3().setFromCenterAndSize(centre,new THREE.Vector3(2*radius,2*radius,2*radius)));
      held.push({time,points:[{kind:'controlled-ball',type:'controlled',bone:null,centre,radius}]});
    }
  }
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-.6,0,-.5),new THREE.Vector3(.6,1.9,.5));
  measured.set(state.id,bounds);criticalFrames.set(state.id,critical);controlledFrames.set(state.id,held);
  return bounds;
}
function overlayRects(){
  const selectors=[['camera','.camera-switch'],['title','.stage-caption h2'],['index','.stage-index'],['subtitle','.stage-caption div>span'],['hint','.view-hint'],['kicker','.stage-kicker']];
  return selectors.map(([name,selector])=>{const r=document.querySelector(selector).getBoundingClientRect();return{name,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}).filter(r=>r.width&&r.height);
}
function projectDisk(centre,radius,stage=elements.stage.getBoundingClientRect()){
  const view=centre.clone().applyMatrix4(camera.matrixWorldInverse),ndc=centre.clone().project(camera);
  const r=radius*stage.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.max(.001,-view.z-radius));
  return{x:stage.left+(ndc.x+1)*stage.width/2,y:stage.top+(1-ndc.y)*stage.height/2,r};
}
function intersectedOverlays(disk,overlays){
  return overlays.filter(rect=>{const x=THREE.MathUtils.clamp(disk.x,rect.left-4,rect.right+4),y=THREE.MathUtils.clamp(disk.y,rect.top-4,rect.bottom+4);return(disk.x-x)**2+(disk.y-y)**2<=(disk.r+3)**2;}).map(rect=>rect.name);
}
function outsideStage(disk,r=elements.stage.getBoundingClientRect()){return disk.x-disk.r<r.left+5||disk.x+disk.r>r.right-5||disk.y-disk.r<r.top+5||disk.y+disk.r>r.bottom-5;}
function criticalFrameClear(overlays,stage){
  for(const frame of [...(criticalFrames.get(state.id)||[]),...(controlledFrames.get(state.id)||[])])for(const point of frame.points){const disk=projectDisk(point.centre,point.radius,stage);if(outsideStage(disk,stage)||intersectedOverlays(disk,overlays).length)return false;}
  return true;
}
function fitCamera(){
  if(!controller||!renderer)return;
  const stage=elements.stage.getBoundingClientRect();
  if(stage.width>0&&stage.height>0){if(stageSize.x!==stage.width||stageSize.y!==stage.height){stageSize.set(stage.width,stage.height);renderer.setSize(stage.width,stage.height,false);}camera.aspect=stage.width/stage.height;}
  const bounds=measureClip(),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const margin=state.camera==='near'?(state.id==='slide'&&camera.aspect<1.5?1.45:1.26):1.93;
  const vertical=Math.max(1.65,size.y+.35),horizontal=Math.max(.9,size.x+.26,size.z*.7),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
  let distance=Math.max(vertical/(2*tan),horizontal/(2*tan*camera.aspect))*margin;
  const direction=new THREE.Vector3(Math.sin(state.azimuth),state.elevation,Math.cos(state.azimuth)).normalize(),overlays=overlayRects();
  cameraBaseTarget.set(center.x,center.y-.12,center.z);
  // Camera controls and captions occupy real pixels. Reserve room for the ball
  // and contacting glove/boot across all cues, rather than only the actor box.
  for(let attempt=0;attempt<28;attempt++){
    camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(cameraBaseTarget);camera.updateMatrixWorld();camera.updateProjectionMatrix();
    if(criticalFrameClear(overlays,stage))break;
    distance*=1.035;
  }
  cameraBasePosition.copy(camera.position);
}
function currentCriticalContacts(){
  const clip=active(),time=clip.loop?controller.time%clip.duration:Math.min(controller.time,clip.duration),cycles=clip.loop?Math.floor(controller.time/clip.duration):0;
  const offset=new THREE.Vector3();if(cycles&&clip.travel?.length)offset.fromArray(clip.travel.at(-1).position.map((v,i)=>v-clip.travel[0].position[i])).multiplyScalar(cycles);
  const overlays=overlayRects(),points=[];
  for(const frame of criticalFrames.get(state.id)||[])if(Math.abs(frame.time-time)<1e-5)for(const point of frame.points){const centre=point.centre.clone().add(offset),disk=projectDisk(centre,point.radius);points.push({time:frame.time,kind:point.kind,type:point.type,bone:point.bone,markerTypes:frame.types,world:centre.toArray(),radius:point.radius,disk,occludedBy:intersectedOverlays(disk,overlays),outsideStage:outsideStage(disk)});}
  return points;
}
function currentControlledContacts(){
  const clip=active(),start=controlledStart(clip),time=clip.loop?controller.time%clip.duration:Math.min(controller.time,clip.duration);
  if(start===null||time<start-1e-7)return [];
  const centre=controller.root.localToWorld(controller.ballPosition(new THREE.Vector3())),radius=clip.ball?.radius||.11,disk=projectDisk(centre,radius),overlays=overlayRects();
  return [{time,kind:'controlled-ball',type:'controlled',bone:null,markerTypes:['controlled'],world:centre.toArray(),radius,disk,occludedBy:intersectedOverlays(disk,overlays),outsideStage:outsideStage(disk)}];
}
function resize(){
  const details=$('transitionDetails');
  const compact=matchMedia('(max-height:510px) and (orientation:landscape)').matches;
  if(compact && details.parentElement!==elements.transitionDock)elements.transitionDock.append(details);
  else if(!compact && details.parentElement===elements.transitionDock)document.querySelector('.footer').insertBefore(details,document.querySelector('.footer-code'));
  if(!renderer)return;const rect=elements.stage.getBoundingClientRect();if(rect.width<1||rect.height<1)return;stageSize.set(rect.width,rect.height);renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;fitCamera();render();}
function syncTime(){if(!controller)return;const c=active();const time=c.loop?controller.time%c.duration:Math.min(c.duration,controller.time);elements.scrub.value=String(time);elements.scrub.style.setProperty('--progress',`${time/c.duration*100}%`);setText('currentTime',time.toFixed(2));setText('totalTime',c.duration.toFixed(2));}
function updateBall(){if(!controller)return;controller.ballPosition(ballPosition);ball.position.copy(ballPosition);const c=active();ball.visible=Boolean(c.ball?.keys?.length);ballShadow.visible=ball.visible;ballShadow.position.set(ball.position.x,.004,ball.position.z);const height=Math.max(0,ball.position.y-.11);ballShadow.material.opacity=Math.max(.05,.28/(1+height*2));ballShadow.scale.setScalar(1+Math.min(2,height*.4));const hips=controller.root.getObjectByName('Hips');if(hips){const p=hips.getWorldPosition(new THREE.Vector3());shadow.position.set(p.x,.003,p.z);shadow.scale.set(1+Math.min(.5,Math.abs(p.y-.86)),.8,1);}ball.rotation.set(state.id.includes('dribble')?controller.time*3:controller.time*1.5,controller.time*2,0);}
function followTravel(){
  cameraFollow.set(0,0,0);
  const c=active();
  // Preserve a fixed camera for the first complete loop. Thereafter follow
  // cumulative travel continuously, so the player never exits the stage and
  // the wrap cannot cause a camera jump. Ground lines still scroll beneath him.
  if(c.loop && c.travel?.length && controller.time>c.duration){
    const stride=c.travel.at(-1).position.map((v,i)=>v-c.travel[0].position[i]);
    const excess=controller.time/c.duration-1;
    const followCycles=excess<1?excess*excess*(3.5-2*excess):excess+.5;
    cameraFollow.fromArray(stride).multiplyScalar(followCycles);
  }
  camera.position.copy(cameraBasePosition).add(cameraFollow);
  camera.lookAt(cameraBaseTarget.clone().add(cameraFollow));camera.updateMatrixWorld();
  // Repeating three-metre tiles are rebased beyond the viewport, while the
  // original pitch markings remain in world space and demonstrate progress.
  const x=Math.round(cameraFollow.x/3)*3,z=Math.round(cameraFollow.z/3)*3;
  floor.position.set(x,-.012,z);pitchGrid.position.set(x,0,z);
}
function render(){if(!renderer||!controller)return;followTravel();updateBall();renderer.render(scene,camera);syncTime();}
function setCamera(mode){state.camera=mode==='far'?'far':'near';elements.nearCamera.setAttribute('aria-pressed',state.camera==='near');elements.farCamera.setAttribute('aria-pressed',state.camera==='far');fitCamera();render();}
function showEvents(){const c=active();elements.eventTicks.replaceChildren();elements.eventButtons.replaceChildren();const ordered=[...c.events].sort((a,b)=>Number(!['contact','release'].includes(a.type))-Number(!['contact','release'].includes(b.type)));for(const e of ordered){const tick=document.createElement('i');tick.className=`event-tick ${e.type}`;tick.style.left=`${e.time/c.duration*100}%`;elements.eventTicks.append(tick);const button=document.createElement('button');button.type='button';button.className=['contact','release'].includes(e.type)?'main-event':'';button.textContent=`${eventLabels[e.type]||e.type} ${e.time.toFixed(2)}`;button.setAttribute('aria-label',`${eventLabels[e.type]||e.type} בזמן ${e.time.toFixed(2)} שניות`);button.addEventListener('click',()=>{setPlaying(false);seek(e.time);});elements.eventButtons.append(button);}}
function showTransitions(){elements.transitionList.replaceChildren();for(const edge of transitions.filter(t=>t.from===state.id)){const item=document.createElement('div');item.className='transition-item';const title=document.createElement('b');title.textContent=`${info.get(edge.to)?.label||edge.to} ← ${active().label}`;const detail=document.createElement('span');detail.textContent=`${edge.trigger} · ערבוב ${edge.blend.toFixed(2)} ש׳`;detail.dir='auto';item.append(title,detail);elements.transitionList.append(item);}}
function select(id){if(!info.has(id))throw new Error(`Unknown clip ${id}`);const c=info.get(id);state.id=id;state.role=c.role;state.azimuth=THREE.MathUtils.degToRad(viewDegrees[id]??20);state.elevation=.20;for(const [role,other]of Object.entries(controllers)){other.pause();other.root.visible=role===c.role;}controller=controllers[c.role];controller.reset(id);if(state.playing)controller.resume();else controller.pause();api.controller=controller;fillSelect();setText('clipTitle',c.label);setText('stageIndex',String(clipIndex.get(id)).padStart(2,'0'));setText('clipNumber',`${String(clipIndex.get(id)).padStart(2,'0')} / ${clips.length}`);setText('duration',c.duration.toFixed(2));setText('loopBadge',c.loop?'תנועה מחזורית':'פעולה מלאה');setText('clipNote',noteFor(c));setText('clipKind',c.zone?'קריאה. זינוק. התאוששות.':c.role==='keeper'?'תזמון. ביטחון. שחרור.':'דיוק. קצב. שליטה.');elements.scrub.max=String(c.duration);elements.frameLink.href=`./iterations/07/frames/${id}-390x844-near.webp`;elements.frameLink.setAttribute('aria-label',`שמונה פריימים: ${c.label}`);elements.eventStatus.textContent='';for(const button of elements.goalZones.children)button.setAttribute('aria-pressed',button.dataset.clip===id);goal.visible=c.role==='keeper';circle.visible=c.role==='field';showEvents();showTransitions();fitCamera();render();return id;}
function seek(seconds){if(!controller)return;controller.seek(Math.max(0,Math.min(active().duration,seconds)));render();return controller.time;}
function snapshot(){if(!controller)return{ready:false,errors:[...errors]};render();const bounds=currentBounds();const min=bounds.min.toArray(),max=bounds.max.toArray();const corners=[];for(const x of[min[0],max[0]])for(const y of[min[1],max[1]])for(const z of[min[2],max[2]])corners.push(new THREE.Vector3(x,y,z).project(camera).toArray());const meta=active();return{ready:true,id:state.id,role:state.role,time:controller.time,playing:state.playing,cameraMode:state.camera,stage:{width:stageSize.x,height:stageSize.y},viewport:{width:innerWidth,height:innerHeight},metrics:{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries},bounds:{min,max,projected:corners},ball:ball.position.toArray(),criticalContacts:currentCriticalContacts(),controlledContacts:currentControlledContacts(),overlayRects:overlayRects(),events:meta.events.map(e=>({time:e.time,type:e.type,bone:e.bone})),errors:[...errors]};}
const api={ready:false,select,seek,setCamera,setPlaying,render,snapshot,controller:null,scene,renderer:null,camera,library:null,errors};
window.motionPreview=api;
function frame(now){if(state.disposed)return;const dt=state.previous?Math.min((now-state.previous)/1000,.1):0;state.previous=now;if(state.ready&&state.playing&&!document.hidden&&!state.dragging){controller.update(dt*state.speed);const c=active();if(!c.loop&&controller.time>=c.duration){controller.seek(0);controller.resume();}render();}state.raf=requestAnimationFrame(frame);}
function onEvent(e){const name=eventLabels[e.type]||e.type;elements.eventStatus.textContent=`${name} · ${e.time.toFixed(2)} ש׳`;}
function installControls(){elements.zoneToggle.addEventListener('click',()=>{state.zonesOpen=!state.zonesOpen;fillSelect();resize();});elements.clipSelect.addEventListener('change',e=>select(e.target.value));elements.fieldTab.addEventListener('click',()=>select('pass_short'));elements.keeperTab.addEventListener('click',()=>select('keeper_ready'));elements.nearCamera.addEventListener('click',()=>setCamera('near'));elements.farCamera.addEventListener('click',()=>setCamera('far'));elements.playPause.addEventListener('click',()=>setPlaying(!state.playing));elements.restart.addEventListener('click',()=>seek(0));elements.speed.addEventListener('change',e=>state.speed=Number(e.target.value));elements.scrub.addEventListener('input',e=>{setPlaying(false);seek(Number(e.target.value));});elements.stage.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();setPlaying(!state.playing);}else if(e.code==='ArrowLeft'){state.azimuth-=.14;fitCamera();render();}else if(e.code==='ArrowRight'){state.azimuth+=.14;fitCamera();render();}else if(e.key==='+'||e.key==='=')setCamera('near');else if(e.key==='-')setCamera('far');});let px=0,py=0;elements.stage.addEventListener('pointerdown',e=>{if(e.target!==elements.stage&&e.target!==renderer.domElement)return;state.dragging=true;px=e.clientX;py=e.clientY;elements.stage.setPointerCapture(e.pointerId);});elements.stage.addEventListener('pointermove',e=>{if(!state.dragging)return;state.azimuth+=(px-e.clientX)*.008;state.elevation=THREE.MathUtils.clamp(state.elevation+(e.clientY-py)*.003,-.04,.65);px=e.clientX;py=e.clientY;fitCamera();render();});const endDrag=()=>{state.dragging=false;};elements.stage.addEventListener('pointerup',endDrag);elements.stage.addEventListener('pointercancel',endDrag);elements.stage.addEventListener('wheel',e=>{e.preventDefault();setCamera(e.deltaY>0?'far':'near');},{passive:false});document.addEventListener('visibilitychange',()=>{state.previous=0;});window.addEventListener('resize',resize);new ResizeObserver(resize).observe(elements.stage);}
function makeZones(){for(const row of['high','middle','low'])for(const col of['right','center','left']){const id=`keeper_dive_${row}_${col}`,c=info.get(id);if(!c)continue;const button=document.createElement('button');button.type='button';button.dataset.clip=id;const rowLabel={high:'גבוה',middle:'אמצע',low:'נמוך'}[row],colLabel={right:'ימין',center:'מרכז',left:'שמאל'}[col];button.textContent=`${colLabel} · ${rowLabel}`;button.title=c.label;button.setAttribute('aria-label',c.label);button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{if(innerHeight<600||innerWidth<650)state.zonesOpen=false;select(id);});elements.goalZones.append(button);}}
function dispose(){if(state.disposed)return;state.disposed=true;cancelAnimationFrame(state.raf);for(const c of Object.values(controllers))c.dispose();library?.dispose();const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer?.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;
  renderer.domElement.setAttribute('aria-hidden','true');elements.stage.prepend(renderer.domElement);api.renderer=renderer;
  library=await loadLibrary();api.library=library;
  for(const role of['field','keeper']){const c=createController(library,{role,start:role==='keeper'?'keeper_ready':'idle',onEvent,autoReturn:false,applyTravel:true});controllers[role]=c;scene.add(c.root);}
  controller=controllers.field;api.controller=controller;
  setText('clipCount',String(clips.filter(c=>!['idle','keeper_ready'].includes(c.id)).length));makeZones();installControls();resize();select(state.id);elements.loading.hidden=true;setText('status','כל הקליפים זמינים');state.ready=true;api.ready=true;state.raf=requestAnimationFrame(frame);
}catch(error){errors.push(String(error.stack||error));elements.loading.replaceChildren(document.createTextNode('הטעינה לא הושלמה. פתחו את התצוגה דרך שרת מקומי ובדקו את הקבצים.'));setText('status','שגיאת טעינה');console.error(error);}
