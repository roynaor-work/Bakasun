// SPDX-License-Identifier: CC0-1.0
import * as T from '../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
import {clone} from '../soccer-motion-v8/runtime/vendor/SkeletonUtils.js';
import {mountEquipment} from './runtime/equipment.mjs';
const $=id=>document.getElementById(id),loader=new GLTFLoader();
const descriptions={
  idle_ready:'שתי ידיים מוכנות על הנחיר. נשימה קלה, קסדה צהובה ומעיל עם פסי החזרה.',
  walk:'הליכה יציבה קדימה. הרגליים מתחלפות והצינור הגמיש עוקב אחרי היד והתיק.',
  run:'ריצה קצרה אל המשימה, עם הרמת כפות הרגליים ותנועה מחזורית של הידיים.',
  crouch_walk:'הגוף יורד קדימה ולמטה כדי לעבור מתחת לשכבת העשן.',
  spray_stand:'הכבאי מתייצב, מחזיק את הנחיר בשתי ידיים ומרסס בקשת. בנחיר רטט קל.',
  spray_crouch:'ירידה הדרגתית למצב נמוך, ריסוס ממושך וחזרה לעמידת מוכנות.',
  open_door:'העברת משקל לרגל התומכת, הרמת הברך, בעיטה בדלת וחזרה לעמידה.',
  carry_child:'שתי הידיים יוצרות תמיכה לילד. צעדים קצרים ומדודים בדרך החוצה.',
  carry_cat:'נשיאה עדינה בשתי ידיים. החתול מניע מעט את הראש והזנב כשהוא נרגע.',
  wave_victory:'המשימה הושלמה. היד עולה ומנופפת לשלום; הנחיר מאוחסן ליד התיק.',
  rescued_handoff:'הידיים תומכות בדמות, נשלחות קדימה למסירה ומשתחררות בהדרגה.'
};
const eventLabels={spray_start:'תחילת ריסוס',spray_stop:'סיום ריסוס',door_kick:'מגע בדלת',recover:'רגל על הקרקע',wave:'נפנוף',celebrate:'ניצחון',receive_ready:'מוכנים לקבלה',handoff:'מסירה',hands_clear:'שחרור הידיים'};
let manifest,qa,bodyManifest,clips,hero,heroMixer,equipment,helper,child,childMixer,cat,catMixer;
let selected,time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,reactionTime=0,last=performance.now(),ready=false;
let heroAction,childAction,catAction,subject='none',bodyId='soccer',view='three';
let cameraNeedsFit=true;
const renderer=new T.WebGLRenderer({canvas:$('stage'),antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new T.Scene();scene.background=new T.Color('#cbdedb');scene.fog=new T.Fog('#cbdedb',8,17);
const camera=new T.PerspectiveCamera(34,1,.05,60);
scene.add(new T.HemisphereLight('#fff7de','#6a9999',2.4));
const key=new T.DirectionalLight('#fff4df',3.2);key.position.set(3,6,5);scene.add(key);
const rim=new T.DirectionalLight('#d4f7ff',2);rim.position.set(-4,3,-2);scene.add(rim);
function material(color){return new T.MeshStandardMaterial({color,roughness:.85});}
function box(size,position,color,parent=scene){const mesh=new T.Mesh(new T.BoxGeometry(...size),material(color));mesh.position.set(...position);parent.add(mesh);return mesh;}
const floor=new T.Mesh(new T.PlaneGeometry(200,200),material('#c4d5cf'));floor.rotation.x=-Math.PI/2;floor.position.y=-.007;scene.add(floor);
const platform=new T.Mesh(new T.CylinderGeometry(1.75,1.75,.08,48),material('#dbe5d9'));platform.position.set(-.45,-.052,.10);scene.add(platform);
const shadowTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(27,63,61,.28)');g.addColorStop(1,'rgba(27,63,61,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);})();
const shadow=new T.Mesh(new T.PlaneGeometry(1.1,.7),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(-.45,.003,.02);scene.add(shadow);
const doorGroup=new T.Group();scene.add(doorGroup);doorGroup.visible=false;doorGroup.position.set(-.595,0,.9355);
box([.08,2.10,.10],[-.55,1.05,0],'#647f7d',doorGroup);box([.08,2.10,.10],[.55,1.05,0],'#647f7d',doorGroup);box([1.18,.09,.10],[0,2.055,0],'#647f7d',doorGroup);
const doorPivot=new T.Group();doorPivot.position.x=.50;doorGroup.add(doorPivot);
box([1,1.98,.065],[-.50,.99,0],'#d59a65',doorPivot);box([.62,.54,.015],[-.50,1.43,-.042],'#d8ab7f',doorPivot);box([.06,.035,.07],[-.88,.94,-.065],'#314e56',doorPivot);
const target=new T.Group();scene.add(target);target.visible=false;
box([.56,.50,.45],[0,.25,0],'#637f80',target);box([.59,.04,.48],[0,.51,0],'#426569',target);
const flames=[];for(let i=0;i<3;i++){const flame=new T.Mesh(new T.ConeGeometry(.11,.42,6),new T.MeshBasicMaterial({color:i===1?'#ffe392':'#ed8a45'}));flame.position.set((i-1)*.10,.74,(i%2)*.07);target.add(flame);flames.push(flame);}
let effects,atlas;
function countTriangles(renderCost=false){let count=0;scene.traverseVisible(o=>{if(o.isMesh){const g=o.geometry,count0=g.index?.count??g.attributes.position?.count??0,m=o.material;
  const passes=renderCost&&m.transparent&&m.side===T.DoubleSide&&!m.forceSinglePass?2:1;count+=Math.min(count0,g.drawRange.count)/3*passes;
}else if(renderCost&&o.isSprite)count+=2;});return Math.round(count);}
function bodyInfo(id){return bodyManifest.models.find(m=>m.id===id);}
function bonesOf(actor){const out={};actor.traverse(o=>{if(o.isBone)out[o.name]=o;});return out;}
function paintChild(actor){actor.traverse(o=>{if(!o.isSkinnedMesh)return;o.geometry=o.geometry.clone();o.material=o.material.clone();o.material.map=null;const reg=o.geometry.attributes._region??o.geometry.attributes._REGION,col=o.geometry.attributes.color;
  for(let i=0;i<reg.count;i++){const id=reg.getX(i),color=id===1?'#36aeb1':id===2?'#245878':id===3?'#d8eee0':null;if(color){const c=new T.Color(color);col.setXYZ(i,c.r,c.g,c.b);}}col.needsUpdate=true;
});}
async function setHero(id){
  const [body,eq]=await Promise.all([loader.loadAsync(`../../assets/athlete-body-v22/models/${id}.glb`),loader.loadAsync(manifest.equipment.path)]);
  const newHero=body.scene;newHero.position.set(-.45,0,0);const info=bodyInfo(id);
  const newEquipment=mountEquipment(T,eq,newHero,{width:info.bodyShape.width,depth:info.bodyShape.depth});
  if(hero){scene.remove(hero);equipment.dispose();scene.remove(helper);helper.dispose();heroMixer.uncacheRoot(hero);}
  hero=newHero;equipment=newEquipment;heroMixer=new T.AnimationMixer(hero);scene.add(hero);bodyId=id;
  helper=new T.SkeletonHelper(hero);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.65;helper.renderOrder=10;helper.visible=$('skeleton').checked;scene.add(helper);
  const clip=clips.find(c=>c.name===selected.id);heroAction=heroMixer.clipAction(clip);heroAction.setLoop(T.LoopOnce,1);heroAction.clampWhenFinished=true;heroAction.play();
}
function select(id){
  selected=manifest.motions.clips.find(c=>c.id===id);time=0;
  for(const button of document.querySelectorAll('.clip-button'))button.setAttribute('aria-pressed',String(button.dataset.clip===id));
  $('clip-code').textContent=id.toUpperCase();$('clip-title').textContent=selected.label;$('clip-description').textContent=descriptions[id]??'';
  $('scrub').max=String(selected.frameCount-1);$('scrub').value='0';
  const result=qa?.libraries?.[0]?.clips.find(c=>c.id===id);$('score').textContent=result?.score??'—';
  $('events').replaceChildren();for(const event of selected.events){const b=document.createElement('button');b.type='button';b.textContent=`${eventLabels[event.type]??event.type} · ${event.time.toFixed(2)}`;b.addEventListener('click',()=>{time=event.time;setPlaying(false);renderFrame();});$('events').append(b);}
  if(heroMixer){heroMixer.stopAllAction();heroAction=heroMixer.clipAction(clips.find(c=>c.name===id));heroAction.reset().setLoop(T.LoopOnce,1);heroAction.clampWhenFinished=true;heroAction.play();}
  doorGroup.visible=id==='open_door';target.visible=Boolean(selected.sprayWindow);
  $('mode').textContent=selected.label;reactionTime=0;setCamera(view);if(ready)renderFrame();
}
function setCamera(which){
  view=which;cameraNeedsFit=true;
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===which));
}
function fitCamera(){
  const bounds=new T.Box3(),p=new T.Vector3();
  const add=root=>root.traverseVisible(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld);bounds.expandByPoint(p);}});
  add(hero);if(child.visible)add(child);if(cat.visible)add(cat);if(target.visible)add(target);if(doorGroup.visible)add(doorGroup);
  const center=bounds.getCenter(new T.Vector3()),mobile=innerWidth<651;
  const directions={three:mobile&&selected.sprayWindow?[1,.28,.44]:[.63,.28,.88],front:[0,.12,1],side:[1,.15,.02],back:[0,.15,-1]};
  const direction=new T.Vector3(...directions[view]).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
  const tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=0;
  const corners=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const corner=new T.Vector3(x,y,z),delta=corner.clone().sub(center),depth=delta.dot(direction);corners.push(corner);
    distance=Math.max(distance,Math.abs(delta.dot(right))/(tanH*.82)+depth,Math.abs(delta.dot(up))/(tanV*.76)+depth);
  }
  camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);camera.updateMatrixWorld(true);
  frameBounds=corners.map(p=>p.clone().project(camera).toArray());cameraNeedsFit=false;
}
let frameBounds=[];
function setPlaying(value){playing=value;$('play').textContent=playing?'השהיה':'ניגון';$('play').setAttribute('aria-label',playing?'השהיית התנועה':'ניגון התנועה');}
function setAtlasFrame(texture,row,frame){texture.repeat.set(1/8,1/4);texture.offset.set(frame/8,1-(row+1)/4);}
function spriteMaterial(texture){return new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});}
function createEffects(texture){const textures=Array.from({length:4},()=>{const t=texture.clone();t.needsUpdate=true;return t;});
  const jet=new T.Mesh(new T.PlaneGeometry(2.4,.9),spriteMaterial(textures[0])),drops=new T.Mesh(new T.PlaneGeometry(2.4,.9),spriteMaterial(textures[1]));
  jet.rotation.y=drops.rotation.y=-Math.PI/2;jet.renderOrder=3;drops.renderOrder=4;
  const splash=new T.Sprite(new T.SpriteMaterial({map:textures[2],transparent:true,depthWrite:false,toneMapped:false})),steam=new T.Sprite(new T.SpriteMaterial({map:textures[3],transparent:true,depthWrite:false,toneMapped:false}));
  splash.scale.set(.65,.40,1);steam.scale.set(.8,.58,1);for(const s of [jet,drops,splash,steam]){s.visible=false;scene.add(s);}return {textures,jet,drops,splash,steam};
}
function updateSubject(){
  child.visible=false;cat.visible=false;
  const allowed=$('reactions').checked,limit=Number($('budget').value)||0,baseCount=countTriangles(true);
  const wanted=selected.carried==='cat'?'cat':'child',subjectTriangles=wanted==='cat'?manifest.optionalRescue.cat.triangles:5080;
  const canShow=allowed&&baseCount+subjectTriangles<=limit;
  subject=canShow?wanted:'none';$('budget-note').textContent=!allowed?'דמויות החילוץ מוסתרות.':canShow?'דמות החילוץ מוצגת בתוך תקציב הסצנה שנבחר.':'דמות החילוץ מוסתרת: אין די מקום בתקציב הסצנה שנבחר.';
  if(!canShow){$('subject-status').textContent='הכבאי והציוד';return;}
  const isCarry=Boolean(selected.carried),victim=wanted==='cat'?cat:child;
  victim.visible=true;
  if(isCarry){
    const chest=equipment.bones.Chest;
    chest.add(victim);
    if(wanted==='cat'){victim.position.set(0,-.06,.34);victim.rotation.set(0,0,-.05);victim.scale.setScalar(1);}
    else {victim.position.set(-.28,-.15,.33);victim.rotation.set(0,0,-65*Math.PI/180);victim.scale.setScalar(.43);}
    if(selected.id==='rescued_handoff'){
      const u=Math.max(0,Math.min(1,(time-1)/.9));victim.position.z+=.17*(u*u*(3-2*u));
      if(time>2.2){
        chest.updateMatrixWorld(true);scene.attach(victim);
        const v=Math.min(1,(time-2.2)/.6);victim.position.lerp(new T.Vector3(.30,0,1.18),v);victim.quaternion.slerp(new T.Quaternion(),v);
      }
    }
    if(wanted==='child'){childAction=childMixer.clipAction(clips.find(c=>c.name==='idle_ready'));childMixer.stopAllAction();childAction.reset().play();childAction.time=0;childMixer.update(0);}
  }else{
    scene.add(victim);victim.position.set(.63,0,.15);victim.rotation.set(0,Math.atan2(hero.position.x-victim.position.x,hero.position.z-victim.position.z),0);victim.scale.setScalar(.43);
    childMixer.stopAllAction();childAction=childMixer.clipAction(clips.find(c=>c.name==='child_reassured'));childAction.reset().play();childAction.time=reactionTime%3.2;childMixer.update(0);
  }
  catAction.time=reactionTime%2.4;catMixer.update(0);
  $('subject-status').textContent=isCarry?(wanted==='cat'?'נושאים את החתול יחד':'שתי ידיים תומכות בילד'):'הילד נרגע ומגיב לכבאי';
}
function renderFrame(){
  if(!ready)return;
  heroAction.enabled=true;heroAction.paused=false;heroAction.time=Math.max(0,Math.min(selected.duration-.000001,time));heroMixer.update(0);
  const spray=selected.sprayWindow&&time>=selected.sprayWindow[0]&&time<=selected.sprayWindow[1];
  const hose=equipment.update({time,spray:Boolean(spray),stow:selected.nozzle==='backpack',mask:$('mask').checked,showLine:$('hose-line').checked});
  const p=new T.Vector3(...hose.emitter);
  for(const v of [effects.jet,effects.drops,effects.splash,effects.steam])v.visible=Boolean(spray);
  effects.jet.position.copy(p).add(new T.Vector3(1e-3,.225,1.05));effects.drops.position.copy(effects.jet.position).add(new T.Vector3(.002,0,0));
  effects.splash.position.copy(p).add(new T.Vector3(0,0,2.08125));effects.steam.position.copy(effects.splash.position).add(new T.Vector3(0,.22,0));
  const elapsed=spray?time-selected.sprayWindow[0]:0;
  setAtlasFrame(effects.textures[0],0,Math.floor(elapsed*16)%8);setAtlasFrame(effects.textures[1],1,Math.floor(elapsed*16)%8);
  setAtlasFrame(effects.textures[2],2,Math.floor(elapsed*20)%8);setAtlasFrame(effects.textures[3],3,Math.min(5,Math.floor(elapsed*10)));
  effects.steam.material.opacity=Math.max(0,1-Math.max(0,elapsed-.4)*2);
  target.position.set(p.x,Math.max(0,p.y-.53),p.z+2.08125);
  for(const [i,f]of flames.entries())f.scale.setScalar(spray?Math.max(.20,1-elapsed*.43)*(1+.09*Math.sin(time*8+i)):1);
  doorPivot.rotation.y=time<31/30?0:-Math.PI*.55*Math.min(1,(time-31/30)/.45);
  updateSubject();scene.updateMatrixWorld(true);helper.visible=$('skeleton').checked;helper.updateMatrixWorld(true);
  if(cameraNeedsFit)fitCamera();
  $('scrub').value=String(Math.round(time*30));$('clock').textContent=`${time.toFixed(2)} / ${selected.duration.toFixed(2)}`;
  $('triangle-count').textContent=`${manifest.equipment.triangles.toLocaleString('en-US')} / 1,500 ציוד`;
  renderer.render(scene,camera);
}
new ResizeObserver(()=>{const {width,height}=$('stage').getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();setCamera(view);if(ready)renderFrame();}).observe($('stage'));
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{setCamera(b.dataset.view);renderFrame();});
$('play').addEventListener('click',()=>setPlaying(!playing));$('restart').addEventListener('click',()=>{time=0;reactionTime=0;renderFrame();});
$('scrub').addEventListener('input',()=>{time=Number($('scrub').value)/30;setPlaying(false);renderFrame();});
for(const id of ['mask','hose-line','skeleton','reactions','budget'])$(id).addEventListener('input',()=>{cameraNeedsFit=true;renderFrame();});
$('coat-color').addEventListener('input',()=>{equipment.recolor(0,$('coat-color').value);renderFrame();});
$('reaction-play').addEventListener('click',()=>{reactionTime=0;$('reactions').checked=true;setPlaying(true);renderFrame();});
$('body').addEventListener('change',async()=>{ready=false;$('load-status').textContent='מחליפים גוף…';try{await setHero($('body').value);ready=true;$('load-status').textContent='מוכן';renderFrame();}catch(e){showError(e);}});
function showError(error){$('error').hidden=false;$('error').textContent='לא ניתן לטעון את התצוגה. יש לפתוח את הקובץ דרך שרת HTTP מקומי משורש המאגר. '+error.message;$('load-status').textContent='טעינה נכשלה';console.error(error);}
try{
  [manifest,qa,bodyManifest]=await Promise.all(['manifest.json','verification/qa/report.json','../../assets/athlete-body-v22/body-manifest.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error(url+' '+r.status);return r.json();})));
  const [motionData,childBody,catData,texture]=await Promise.all([loader.loadAsync(manifest.motions.path),loader.loadAsync('../../assets/athlete-body-v22/models/soccer.glb'),loader.loadAsync(manifest.optionalRescue.cat.path),new T.TextureLoader().loadAsync(manifest.sprites.atlas)]);
  clips=motionData.animations;atlas=texture;atlas.colorSpace=T.SRGBColorSpace;atlas.minFilter=T.LinearFilter;atlas.magFilter=T.LinearFilter;atlas.generateMipmaps=false;effects=createEffects(atlas);
  child=clone(childBody.scene);paintChild(child);scene.add(child);child.visible=false;childMixer=new T.AnimationMixer(child);
  cat=catData.scene;scene.add(cat);cat.visible=false;catMixer=new T.AnimationMixer(cat);catAction=catMixer.clipAction(catData.animations[0]);catAction.play();
  for(const [i,id]of manifest.motions.requiredClips.entries()){
    const c=manifest.motions.clips.find(c=>c.id===id),b=document.createElement('button');b.type='button';b.className='clip-button';b.dataset.clip=id;b.setAttribute('aria-pressed','false');
    const number=document.createElement('span');number.className='clip-number';number.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.className='clip-label';label.textContent=c.label;const dot=document.createElement('span');dot.className='clip-dot';b.append(number,label,dot);b.addEventListener('click',()=>select(id));$('clip-list').append(b);
  }
  const requested=new URLSearchParams(location.search).get('clip');select(manifest.motions.requiredClips.includes(requested)?requested:'idle_ready');await setHero('soccer');setCamera('three');ready=true;setPlaying(playing);$('load-status').textContent='מוכן';renderFrame();
  // Read-only browser diagnostics used by the delivery audit, plus deterministic scrubbing.
  window.firefighterPreview={select(id){select(id);},seek(t){time=t;setPlaying(false);renderFrame();},setView(which){setCamera(which);renderFrame();},
    inspect(){const start=equipment.bones.Chest.localToWorld(new T.Vector3(0,-.24,-.24)),end=equipment.nozzle.localToWorld(new T.Vector3(0,-.045,.035)),a=new T.Vector3().fromBufferAttribute(equipment.nodes.hose_surface.geometry.attributes.position,0);equipment.scaleRoot.localToWorld(a);
      const ringCenter=k=>{const center=new T.Vector3(),point=new T.Vector3();for(let r=0;r<5;r++)center.add(point.fromBufferAttribute(equipment.nodes.hose_surface.geometry.attributes.position,k*6+r));center.multiplyScalar(1/5);return equipment.scaleRoot.localToWorld(center);};
      return {ready,clip:selected.id,time,body:bodyId,requiredClips:manifest.motions.requiredClips,subject,sceneTriangles:countTriangles(),renderTriangleCost:countTriangles(true),renderedTriangles:renderer.info.render.triangles,equipmentTriangles:manifest.equipment.triangles,
        boneCount:Object.keys(equipment.bones).length,hoseStart:start.toArray(),hoseSurfaceFirstVertex:a.toArray(),emitter:equipment.emitter.getWorldPosition(new T.Vector3()).toArray(),spraying:effects.jet.visible,
        maskVisible:equipment.nodes.oxygen_mask.visible,stowed:equipment.nozzle.parent.name==='Chest',optionalVisible:child.visible||cat.visible,budget:Number($('budget').value),camera:view,
        hoseAttachmentErrorMeters:{start:ringCenter(0).distanceTo(start),end:ringCenter(18).distanceTo(end)},vibrationMeters:Math.abs(equipment.nozzle.position.y-(equipment.nozzle.parent.name==='Chest'?-.12:0)),
        childWorld:child.getWorldPosition(new T.Vector3()).toArray(),framingCornersNDC:frameBounds,maxTextureSize:renderer.capabilities.maxTextureSize};}}
  ;
}catch(e){showError(e);}
function animate(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(ready&&playing){time+=dt*Number($('speed').value);reactionTime+=dt*Number($('speed').value);if(time>selected.duration){time=selected.loop?time%selected.duration:0;}renderFrame();}requestAnimationFrame(animate);}requestAnimationFrame(animate);
