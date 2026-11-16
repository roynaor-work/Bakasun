import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {createAlpineEffects} from './effects/runtime.mjs';

const $=id=>document.getElementById(id),loader=new GLTFLoader(),captureMode=new URL(location.href).searchParams.has('capture');
window.addEventListener('unhandledrejection',event=>{$('failure').hidden=false;$('failure').textContent=`לא ניתן להשלים את הטעינה: ${event.reason?.message||event.reason}`;});
const manifest=await fetch('manifest.json').then(r=>{if(!r.ok)throw Error('manifest missing');return r.json();});
const canvas=$('view'),renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
const captureRenderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});captureRenderer.setSize(320,320);captureRenderer.setPixelRatio(1);captureRenderer.outputColorSpace=T.SRGBColorSpace;captureRenderer.toneMapping=T.ACESFilmicToneMapping;captureRenderer.toneMappingExposure=1.2;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,1,.1,230),ambient=new T.HemisphereLight(0xfff8df,0x829b9b,2.6);scene.add(ambient);
const sun=new T.DirectionalLight(0xffedcb,3.1);sun.position.set(-18,28,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:40,bottom:-40,near:1,far:100});sun.shadow.bias=-.0006;scene.add(sun);
const course=new T.Group(),inspect=new T.Group(),mountains=new T.Group();scene.add(course,inspect,mountains);inspect.visible=false;
let selected=manifest.assets[0],mode='scene',playing=false,angle=0,themeIndex=0,request=0,model=null,mixer=null,modelSize=1,modelCenter=new T.Vector3(),time=0;
const courseMixers=[],cache=new Map(),courseModels=new Map(),trackSkier={value:null};
const presets=manifest.style.themePalettes;
const floorMaterial=new T.MeshStandardMaterial({color:presets[0].palette.snow,roughness:.98});
// Shape coordinates become world (x, -shapeY). The pit opens at world (-4, -26).
const floorShape=new T.Shape();floorShape.moveTo(-75,-25);floorShape.lineTo(75,-25);floorShape.lineTo(75,115);floorShape.lineTo(-75,115);floorShape.closePath();const pit=new T.Path();pit.absarc(-4,26,1.08,0,Math.PI*2,true);floorShape.holes.push(pit);
const floor=new T.Mesh(new T.ShapeGeometry(floorShape,32),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
for(let i=0;i<13;i++){
  const h=10+(i%4)*4,x=(i-6)*15;const g=new T.Group(),base=new T.Mesh(new T.ConeGeometry(13,h,4),new T.MeshStandardMaterial({color:0x9dbab9,roughness:1})),cap=new T.Mesh(new T.ConeGeometry(6,h*.46,4),new T.MeshStandardMaterial({color:0xf4f1df,roughness:1}));base.position.y=h/2;cap.position.y=h*.79;g.add(base,cap);g.position.set(x,0,-103-(i%3)*5);g.rotation.y=.3+(i%2)*.5;mountains.add(g);
}
const treeMaterials=[new T.MeshStandardMaterial({color:0x628775,roughness:1}),new T.MeshStandardMaterial({color:0xf4f1df,roughness:1})];
for(let i=0;i<20;i++){
  const g=new T.Group(),side=i%2?1:-1,z=-i*4.5-5,scale=.7+(i%4)*.18;
  for(let j=0;j<3;j++){const cone=new T.Mesh(new T.ConeGeometry(1.3-j*.24,1.8-j*.15,6),treeMaterials[0]);cone.position.y=1.7+j*.7;cone.castShadow=true;g.add(cone);const snow=new T.Mesh(new T.ConeGeometry(.97-j*.22,1.35-j*.13,6),treeMaterials[1]);snow.position.y=2+j*.7;g.add(snow);}
  const trunk=new T.Mesh(new T.CylinderGeometry(.1,.16,1.5,6),new T.MeshStandardMaterial({color:0x987250,roughness:1}));trunk.position.y=.75;g.add(trunk);g.position.set(side*(8+(i%3)*2),0,z);g.scale.setScalar(scale);course.add(g);
}
const particleTexture=await new T.TextureLoader().loadAsync('effects/powder-particle.png'),trailTexture=await new T.TextureLoader().loadAsync('effects/trail-strip.png');particleTexture.colorSpace=T.SRGBColorSpace;trailTexture.colorSpace=T.SRGBColorSpace;
const fx=createAlpineEffects(T,{scene,particleTexture,trailTexture,seed:54});fx.setIntensity(1);
async function load(asset){if(!cache.has(asset.id))cache.set(asset.id,loader.loadAsync(asset.glb));return cache.get(asset.id);}
function shadows(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});}
const layout=[['falling-tree',-3,0,-6],['boulder',4,0,-3],['deep-snow',-2,0,-16],['fence',-5,0,-18],['warning-sign',6,0,-15],['ice-patch',2.5,0,-11],['snow-hole',-4,0,-26],['spring-pad',1,0,-21],['high-ramp',3,0,-35],['trick-ramp',-4,0,-39],['narrow-passage',0,0,-49],['bridge',0,0,-62],['bear',-6,0,-10],['deer',6,0,-26],['snowman',-5,0,-32],['rival-skier',0,0,3]];
for(const [i,a] of manifest.assets.filter(a=>a.category==='bonus').entries())layout.push([a.id,(i%2?1:-1)*.8,1.1,-4-i*5]);
await Promise.all(layout.map(async([id,x,y,z])=>{const a=manifest.assets.find(a=>a.id===id),gltf=await load(a),root=gltf.scene.clone(true);root.position.set(x,y,z);shadows(root);course.add(root);courseModels.set(id,root);if(id==='rival-skier')trackSkier.value=root;if(gltf.animations.length&&!['falling-tree','spring-pad'].includes(id)){const m=new T.AnimationMixer(root);m.clipAction(gltf.animations[0]).play();courseMixers.push({m,root,base:[x,y,z],id});}}));
function resize(){const box=canvas.getBoundingClientRect();renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();frame();}new ResizeObserver(resize).observe(canvas);
function frame(){
  if(mode==='scene'){const positions=camera.aspect<1?[[0,10,19],[-5,11,20],[5,12,22]]:[[7,6.8,14],[-8,7.5,11],[0,11,18]];camera.position.fromArray(positions[angle%3]);camera.lookAt(0,.3,-17);}
  else{const a=[.65,-2.5,0][angle%3]+(selected.category==='enemy'?Math.PI:0),d=modelSize*(camera.aspect<1?2.05:1.55);camera.position.copy(modelCenter).add(new T.Vector3(Math.sin(a)*d,modelSize*.65,Math.cos(a)*d));camera.lookAt(modelCenter);}
}
function setTheme(index){themeIndex=index;const p=presets[index].palette;floorMaterial.color.set(p.snow);scene.background=new T.Color(p.sky[0]);scene.fog=new T.Fog(p.fog,48,165);ambient.color.set(index===3?0xd8eafa:0xfff8df);mountains.children.forEach(g=>{g.children[0].material.color.set(p.rock);g.children[1].material.color.set(p.snow);});treeMaterials[1].color.set(p.snow);}
function sync(){
  course.visible=mode==='scene';inspect.visible=mode==='asset';mountains.visible=mode==='scene';floor.visible=mode==='scene';fx.reset();
  $('scene-mode').setAttribute('aria-pressed',mode==='scene');$('asset-mode').setAttribute('aria-pressed',mode==='asset');$('downloads').hidden=mode!=='asset';
  $('scene-kicker').textContent=mode==='scene'?'מסלול של הפתעות':({obstacle:'מכשול חדש בדרך',bonus:'עוד סיבה לאסוף',enemy:'חברים על המסלול',effect:'תנועה בשלג'}[selected.category]);
  $('asset-title').textContent=mode==='scene'?'בכל פנייה, משהו חדש.':selected.name;
  $('asset-detail').textContent=mode==='scene'?'שלג רך, צבע חם והרפתקה קטנה בדרך לפסגה.':({obstacle:'צללית ברורה, צבע רך וקנה מידה של הרפתקה.',bonus:'בונוס קטן ובולט, גם כשגולשים מהר.',enemy:'תנועה ידידותית, בקצב של המסלול.',effect:'קל, תחום וחוזר לשקט בסיום.'}[selected.category]);
  $('model-stats').textContent=mode==='scene'?'מט / אלמוג / טורקיז':`${selected.triangles} △ · ${(selected.bytes/1024).toFixed(1)} KB`;
  $('glb-link').href=selected.glb;$('png-link').href=selected.png;frame();
}
async function selectAsset(id,{switchMode=true}={}){
  const ticket=++request;selected=manifest.assets.find(a=>a.id===id);const gltf=await load(selected);if(ticket!==request)return;
  if(mixer){mixer.stopAllAction();mixer.uncacheRoot(model);}inspect.clear();model=gltf.scene.clone(true);shadows(model);inspect.add(model);mixer=gltf.animations.length?new T.AnimationMixer(model):null;
  if(mixer){const action=mixer.clipAction(gltf.animations[0]);if(selected.animationMode==='once-clamp'){action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;}action.play();}
  const box=new T.Box3().setFromObject(model);if(selected.animationBounds)box.union(new T.Box3(new T.Vector3(...selected.animationBounds.min),new T.Vector3(...selected.animationBounds.max)));const size=box.getSize(new T.Vector3());modelCenter=box.getCenter(new T.Vector3());modelSize=Math.max(size.x,size.y,size.z,1.15);
  if(switchMode)mode='asset';sync();renderList();$('status').textContent='28 דגמים מקומיים · מוכן';
}
function renderList(){
  $('asset-list').replaceChildren(...manifest.assets.filter(a=>a.category===$('category').value).map(a=>{const b=document.createElement('button');b.className='asset-row';b.dataset.asset=a.id;b.setAttribute('aria-pressed',a.id===selected.id);b.innerHTML=`<img ${captureMode?'':`src="${a.png}"`} alt="" width="42" height="39"><span>${a.name}</span><small>${a.triangles} △</small>`;b.onclick=()=>selectAsset(a.id);return b;}));
}
$('category').onchange=()=>{const first=manifest.assets.find(a=>a.category===$('category').value);renderList();selectAsset(first.id);};
$('scene-mode').onclick=()=>{mode='scene';sync();};$('asset-mode').onclick=()=>selectAsset(selected.id);$('theme').onchange=()=>setTheme(Number($('theme').value));
$('motion').onclick=()=>{playing=!playing;$('motion').textContent=playing?'עצירה':'תנועה';$('motion').setAttribute('aria-pressed',playing);if(playing&&mixer){mixer.stopAllAction();const clips=cache.get(selected.id);clips.then(g=>mixer?.clipAction(g.animations[0]).reset().play());}};
$('angle').onclick=()=>{angle++;frame();};$('intensity').onchange=()=>fx.setIntensity(Number($('intensity').value));
function draw(dt){if(playing){time+=dt;if(mode==='asset')mixer?.update(dt);else{for(const {m,root,base,id} of courseMixers){m.update(dt);if(id==='rival-skier'){root.position.set(Math.sin(time*.65)*.7,base[1],base[2]-time*1.25%7);}}
  const skier=trackSkier.value,p=skier.position;fx.update(dt,{moving:true,position:p,heading:0,leftSki:new T.Vector3(p.x-.21,.015,p.z+.18),rightSki:new T.Vector3(p.x+.21,.015,p.z+.18)});}}renderer.render(scene,camera);}
let previous=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-previous)/1000,.05);previous=now;draw(dt);});
setTheme(0);renderList();await selectAsset(selected.id,{switchMode:false});resize();
// Small, explicit interface for deterministic captures and independent verification.
window.alpinePreview={manifest,selectAsset,scene:()=>{mode='scene';sync();},setTheme,step:dt=>{mixer?.update(dt);renderer.render(scene,camera);},boundsAt(t){mixer?.setTime(t);model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model);return {min:box.min.toArray(),max:box.max.toArray()};},state:()=>({mode,selected:selected.id,playing,themeIndex,fx:fx.stats(),loaded:cache.size}),
  async capture(id){await selectAsset(id);const item=manifest.assets.find(a=>a.id===id),g=await load(item),s=new T.Scene();s.add(new T.HemisphereLight(0xfff8df,0x829b9b,3));const light=new T.DirectionalLight(0xffedcb,3.2);light.position.set(-3,7,item.category==='enemy'?-5:5);s.add(light);const object=g.scene.clone(true);s.add(object);const box=new T.Box3().setFromObject(object),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),max=Math.max(size.x,size.y,size.z,1),cam=new T.OrthographicCamera(-max*.76,max*.76,max*.76,-max*.76,.01,100);cam.position.copy(center).add(new T.Vector3(max*.95,max*.75,max*(item.category==='enemy'?-1.3:1.3)));cam.lookAt(center);captureRenderer.render(s,cam);return captureRenderer.domElement.toDataURL('image/png');},
  runtimeTest(){const result=[];for(let intensity=0;intensity<3;intensity++){fx.reset();fx.setIntensity(intensity);for(let i=0;i<240;i++)fx.update(1/60,{moving:true,position:new T.Vector3(0,0,-i*.03),leftSki:new T.Vector3(-.2,0,-i*.03),rightSki:new T.Vector3(.2,0,-i*.03)});result.push(fx.stats());for(let i=0;i<100;i++)fx.update(1/60,{});const empty=fx.stats();if(empty.particles||empty.trailSegments)throw Error('effects did not expire');}fx.reset();return result;}
};
document.documentElement.dataset.ready='true';
