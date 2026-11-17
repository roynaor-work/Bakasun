/** CC0-1.0. Build-only imports; the shipped classic-script bundle is local. */
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';
import {createCustomization} from './runtime/customization.mjs';

const $=id=>document.getElementById(id);
const embedded=window.__AVATAR_EMBEDDED__;
const sources=new Map(), bodies=new Map();
let manifest, state, avatar, customization, stats, category='hair', focus='hair';
let yaw=.18, pitch=.04, dirty=true, busy=false;
const regionLabels={skin:'עור',primary:'ראשי',secondary:'משני',trim:'פסים',shoe:'נעל',sole:'סוליה',eyeWhite:'לבן העין',hair:'שיער',sock:'גרב',iris:'עיניים',brow:'גבות',mouth:'שפתיים',accessory:'אביזר',accent:'פרטים'};
const categoryRegions={hair:['hair','accent','primary','secondary'],faces:['iris','brow','mouth'],skin:[],outfits:['primary','secondary','trim','accent'],shoes:['shoe','sole','trim','accent'],accessories:['accessory','accent','secondary','trim']};
const choices=['#362920','#956341','#d6b674','#efebe0','#233f50','#4c9995','#a65647','#c69b54'];
const manager=new T.LoadingManager();
if (embedded) manager.setURLModifier(url=>{
  const key=Object.keys(embedded).find(k=>k.endsWith('athlete-atlas.png') && url.endsWith('athlete-atlas.png'));
  return key ? `data:${embedded[key].mime};base64,${embedded[key].data}` : url;
});
const loader=new GLTFLoader(manager);
async function read(path,type='text') {
  let bytes;
  if (embedded) {
    const data=embedded[path];if(!data)throw Error('Missing offline asset '+path);
    bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
  } else {
    const response=await fetch(path);
    if(!response.ok)throw Error(path+': '+response.status);
    bytes=new Uint8Array(await response.arrayBuffer());
  }
  return type==='bytes' ? bytes : new TextDecoder().decode(bytes);
}
async function gltf(path) {
  const bytes=await read(path,'bytes');
  return new Promise((resolve,reject)=>loader.parse(bytes.buffer,path.slice(0,path.lastIndexOf('/')+1),resolve,reject));
}
function showMessage(message){$('message-text').textContent=message;$('message').showModal();}
function persist(){try{localStorage.setItem('island.avatar-customization.v1',JSON.stringify(state));}catch{/* Preview also works without storage permission. */}}
function sanitize(saved) {
  const clean=structuredClone(manifest.defaults);
  if(!saved||typeof saved!=='object')return clean;
  const categories={hair:'hair',face:'faces',outfit:'outfits',shoes:'shoes'};
  for(const [key,cat] of Object.entries(categories))if(manifest.items.some(i=>i.id===saved[key]&&i.category===cat))clean[key]=saved[key];
  if(manifest.bodies.some(b=>b.id===saved.body))clean.body=saved.body;
  if(Number.isInteger(saved.skin)&&saved.skin>=0&&saved.skin<6)clean.skin=saved.skin;
  clean.accessories=Array.isArray(saved.accessories)?[...new Set(saved.accessories.filter(id=>manifest.items.some(i=>i.id===id&&i.category==='accessories')))]:[];
  for(const region of manifest.colorRegions)if(/^#[\da-f]{6}$/i.test(saved.colors?.[region.name]))clean.colors[region.name]=saved.colors[region.name];
  return clean;
}
const renderer=new T.WebGLRenderer({canvas:$('stage'),alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(28,1,.01,30);
scene.add(new T.HemisphereLight(0xffffff,0x6b806d,2.5));
const sun=new T.DirectionalLight(0xffedcf,3.1);sun.position.set(3,5,5);scene.add(sun);
const fill=new T.DirectionalLight(0xd7e9f3,1.4);fill.position.set(-4,3,-2);scene.add(fill);
const pivot=new T.Group();scene.add(pivot);
// Soft radial ground contact. This texture is computed locally, not downloaded.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,31);
gradient.addColorStop(0,'rgba(36,66,43,.30)');gradient.addColorStop(1,'rgba(36,66,43,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
const shadow=new T.Mesh(new T.PlaneGeometry(.77,.59),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=.001;scene.add(shadow);

function buildAvatar() {
  if(avatar){pivot.remove(avatar);customization.dispose();}
  const info=manifest.bodies.find(b=>b.id===state.body);
  avatar=clone(bodies.get(state.body).scene);pivot.add(avatar);
  customization=createCustomization(T,avatar,info,manifest,sources);
  stats=customization.update(state);$('body').value=state.body;
}
function apply() {
  stats=customization.update(state);dirty=true;persist();updateButtons();
  $('selection-note').textContent=stats.hairSuppressed?'הכובע מכסה את השיער. הסרתו תחזיר את התסרוקת.':category==='accessories'?'אפשר לשלב כמה אביזרים. לחיצה נוספת מסירה פריט.':'בחרו פריט, וסובבו כדי לראות מכל כיוון.';
  const key={hair:'hair',faces:'face',outfits:'outfit',shoes:'shoes'}[category];
  $('view-label').textContent=key?manifest.items.find(i=>i.id===state[key]).label:category==='skin'?'גוון '+(state.skin+1):state.accessories.length+' אביזרים';
}
function selected(item) {
  if(category==='skin')return state.skin===item.index;
  if(item.category==='accessories')return state.accessories.includes(item.id);
  return state[{hair:'hair',faces:'face',outfits:'outfit',shoes:'shoes'}[item.category]]===item.id;
}
function updateButtons() {
  for(const button of $('items').querySelectorAll('button')) {
    const item=category==='skin'?{index:Number(button.dataset.id)}:manifest.items.find(i=>i.id===button.dataset.id);
    button.setAttribute('aria-pressed',String(selected(item)));
  }
  $('color').value=state.colors[$('region').value]||'#362920';
  for(const b of $('swatches').children)b.setAttribute('aria-pressed',String(b.dataset.color.toLowerCase()===$('color').value));
}
function select(id) {
  if(category==='skin'){state.skin=Number(id);apply();return;}
  const item=manifest.items.find(i=>i.id===id);if(!item)throw Error('Unknown item');
  if(item.category==='accessories') {
    state.accessories=state.accessories.includes(id)?state.accessories.filter(i=>i!==id):[...state.accessories,id];
    focus=item.id;
  } else {
    state[{hair:'hair',faces:'face',outfits:'outfit',shoes:'shoes'}[item.category]]=id;
    if(item.defaults)Object.assign(state.colors,item.defaults);
  }
  apply();
}
function imageURL(path) {
  const entry=embedded?.[path];return entry?`data:${entry.mime};base64,${entry.data}`:path;
}
function setCategory(id) {
  category=id;focus=id;dirty=true;
  const spec=manifest.categories.find(c=>c.id===id);
  const titles={hair:'מה הסגנון שלך?',faces:'איזה חיוך היום?',skin:'הגוון שלך',outfits:'מתלבשים להרפתקה',shoes:'יוצאים לדרך',accessories:'הפרטים שעושים אותך'};
  $('category-title').textContent=titles[id];$('category-count').textContent=spec.count+' אפשרויות';
  for(const b of $('categories').children)b.setAttribute('aria-pressed',String(b.dataset.id===id));
  $('items').replaceChildren();$('items').className='items'+(id==='skin'?' skin-items':'');
  const list=id==='skin'?manifest.skinTones.map((tone,index)=>({id:String(index),tone,index,label:'גוון '+(index+1)})):manifest.items.filter(i=>i.category===id);
  for(const item of list){
    const button=document.createElement('button');button.type='button';button.className='item';button.dataset.id=item.id;
    button.setAttribute('aria-label',item.label);button.setAttribute('aria-pressed',String(selected(item)));
    if(item.tone){const swatch=document.createElement('span');swatch.className='tone';swatch.style.background=item.tone;button.append(swatch);}
    else {const img=document.createElement('img');img.src=imageURL(item.thumbnail);img.alt='';img.width=96;img.height=96;button.append(img);}
    const label=document.createElement('span');label.className='item-name';label.textContent=item.label;button.append(label);
    button.addEventListener('click',()=>select(item.id));$('items').append(button);
  }
  $('region').replaceChildren();
  for(const name of categoryRegions[id]){const opt=document.createElement('option');opt.value=name;opt.textContent=regionLabels[name];$('region').append(opt);}
  $('color-bar').style.visibility=id==='skin'?'hidden':'visible';apply();
}
function pose(at) {
  const b=customization.bones;
  for(const bone of Object.values(b))bone.quaternion.identity();
  b.Hips.position.set(0,.86,0);
  const kind=$('pose').value;
  if(kind==='run'){
    const t=at*.006;
    b.LeftUpLeg.rotation.x=Math.sin(t)*.54;b.RightUpLeg.rotation.x=-Math.sin(t)*.54;
    b.LeftLeg.rotation.x=Math.max(0,-Math.sin(t))*.95;b.RightLeg.rotation.x=Math.max(0,Math.sin(t))*.95;
    b.LeftArm.rotation.x=-Math.sin(t)*.55;b.RightArm.rotation.x=Math.sin(t)*.55;
    b.LeftForeArm.rotation.x=b.RightForeArm.rotation.x=-.65;
    b.Hips.position.y+=Math.abs(Math.sin(t))*.025;
  }else if(kind==='reach'){
    b.LeftArm.rotation.z=2.65;b.RightArm.rotation.z=-2.65;
    b.LeftForeArm.rotation.z=.15;b.RightForeArm.rotation.z=-.15;
  }else{
    b.LeftArm.rotation.z=.22;b.RightArm.rotation.z=-.22;
  }
  avatar.updateMatrixWorld(true);customization.bodyMesh.skeleton.update();
}
function cameraFrame(width,height,targetFocus=focus) {
  const info=manifest.bodies.find(b=>b.id===state.body),s=info.height/1.73050057888031;
  let y=.90*s,span=2.55*s,x=0,z=0;
  if(['hair','faces','glasses','bucket-hat','hair-ties'].includes(targetFocus)){y=1.61*s;span=.56*s;z=.035;}
  else if(targetFocus==='shoes'){y=.135*s;span=.49*s;z=.045;}
  else if(['watch','bracelet','gloves'].includes(targetFocus)){y=.78*s;span=.49*s;x=.14*s;}
  else if(targetFocus==='scarf'){y=1.36*s;span=.69*s;}
  else if(targetFocus==='backpack'){y=1.19*s;span=.90*s;}
  camera.aspect=width/height;
  const distance=span/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*Math.max(1,.80/camera.aspect);
  const angle=targetFocus==='backpack'?yaw+Math.PI:yaw;
  camera.position.set(x+Math.sin(angle)*distance,y+pitch*distance,Math.cos(angle)*distance+z);
  camera.lookAt(x,y,z);camera.updateProjectionMatrix();
}
function render(at=0) {
  if(!avatar)return;
  const rect=$('stage').parentElement.getBoundingClientRect();
  const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
  renderer.setSize(width,height,false);cameraFrame(width,height);pose(at);
  renderer.setClearColor(0x000000,0);renderer.render(scene,camera);dirty=false;
}
function animate(at){if(dirty||$('pose').value==='run')render(at);requestAnimationFrame(animate);}
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function offlineDownload(){
  if(busy)return;busy=true;$('download').disabled=true;
  try{
    const files=manifest.offlineFiles;
    const packageData={};let count=0;
    for(const file of files){
      if(['preview.html','preview.css','preview.bundle.js'].includes(file))continue;
      const bytes=await read(file,'bytes');let value='';
      for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));
      packageData[file]={mime:file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':file.endsWith('.glb')?'model/gltf-binary':'text/plain',data:btoa(value)};
      $('status').textContent='מכין תצוגה לאופליין… '+Math.round(++count/files.length*100)+'%';
    }
    const [html,css,js]=await Promise.all([read('preview.html'),read('preview.css'),read('preview.bundle.js')]);
    const safe=s=>s.replace(/<\/script/gi,'<\\/script');
    const output=html.replace('<link rel="stylesheet" href="preview.css">',()=>'<style>'+css+'</style>')
      .replace('<script defer src="preview.bundle.js"></script>',()=>'<script>window.__AVATAR_EMBEDDED__='+safe(JSON.stringify(packageData))+';<\/script><script>window.addEventListener("DOMContentLoaded",()=>{'+safe(js)+'});<\/script>');
    downloadBlob(new Blob([output],{type:'text/html;charset=utf-8'}),'avatar-customization-v1-offline.html');
    $('status').textContent='התצוגה מוכנה לאופליין';
  }catch(error){showMessage('ההורדה נכשלה: '+error.message);}
  finally{busy=false;$('download').disabled=false;}
}
function captureThumbnail(id){
  const before=structuredClone(state),beforeFocus=focus,beforeYaw=yaw,beforePose=$('pose').value;
  const item=manifest.items.find(i=>i.id===id);
  state=structuredClone(manifest.defaults);state.body=before.body;
  if(item.category==='accessories'){state.accessories=[id];focus=id;}
  else{state[{hair:'hair',faces:'face',outfits:'outfit',shoes:'shoes'}[item.category]]=id;focus=item.category;if(item.defaults)Object.assign(state.colors,item.defaults);}
  if(focus==='outfits')focus='full';
  yaw=item.category==='hair'?.75:.14;$('pose').value='idle';customization.update(state);
  renderer.setPixelRatio(1);renderer.setSize(160,160,false);cameraFrame(160,160);pose(0);
  renderer.setClearColor(0xeeeee5,1);renderer.render(scene,camera);
  const data=renderer.domElement.toDataURL('image/webp',.85);
  state=before;focus=beforeFocus;yaw=beforeYaw;$('pose').value=beforePose;
  customization.update(state);renderer.setPixelRatio(Math.min(devicePixelRatio,2));dirty=true;
  return data;
}

async function start(){
  manifest=JSON.parse(await read('manifest.json'));
  state=structuredClone(manifest.defaults);
  try{state=sanitize(JSON.parse(localStorage.getItem('island.avatar-customization.v1')));}catch{/* Defaults are valid on file:// too. */}
  let loaded=0;
  await Promise.all([...manifest.bodies.map(async b=>{bodies.set(b.id,await gltf(b.path));loaded++;}),
    ...manifest.items.map(async i=>{sources.set(i.id,await gltf(i.path));$('status').textContent=`טוען פריטים… ${++loaded}/50`;})]);
  for(const info of manifest.bodies){const opt=document.createElement('option');opt.value=info.id;opt.textContent=info.label;$('body').append(opt);}
  for(const cat of manifest.categories){const button=document.createElement('button');button.type='button';button.textContent=cat.label;button.dataset.id=cat.id;button.setAttribute('aria-pressed',String(cat.id===category));button.addEventListener('click',()=>setCategory(cat.id));$('categories').append(button);}
  for(const hex of choices){const b=document.createElement('button');b.className='swatch';b.type='button';b.dataset.color=hex;b.style.background=hex;b.setAttribute('aria-label','צבע '+hex);b.addEventListener('click',()=>{state.colors[$('region').value]=hex;apply();});$('swatches').append(b);}
  buildAvatar();setCategory(category);render(0);requestAnimationFrame(animate);
  $('body').addEventListener('change',()=>{state.body=$('body').value;buildAvatar();apply();});
  $('region').addEventListener('change',updateButtons);
  $('color').addEventListener('input',()=>{state.colors[$('region').value]=$('color').value;apply();});
  $('pose').addEventListener('change',()=>{dirty=true;});
  $('frame').addEventListener('click',()=>{focus=focus==='full'?category:'full';$('frame').textContent=focus==='full'?'תקריב':'דמות מלאה';dirty=true;});
  $('turn-right').addEventListener('click',()=>{yaw-=Math.PI/4;dirty=true;});
  $('turn-left').addEventListener('click',()=>{yaw+=Math.PI/4;dirty=true;});
  $('reset').addEventListener('click',()=>{state=structuredClone(manifest.defaults);buildAvatar();yaw=.18;pitch=.04;$('pose').value='idle';setCategory(category);});
  $('save-look').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({schemaVersion:1,package:manifest.id,...state},null,2)],{type:'application/json'}),'avatar-look.json'));
  $('download').disabled=false;$('download').addEventListener('click',offlineDownload);
  if(embedded){$('download').hidden=true;$('report-link').href=imageURL('REPORT.md');$('report-link').download='REPORT.md';}
  let drag;
  $('stage').addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};$('stage').setPointerCapture(e.pointerId);});
  $('stage').addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.012;pitch=T.MathUtils.clamp(pitch+(e.clientY-drag.y)*.002,-.32,.38);drag={x:e.clientX,y:e.clientY};dirty=true;});
  $('stage').addEventListener('pointerup',()=>{drag=null;});$('stage').addEventListener('pointercancel',()=>{drag=null;});
  $('stage').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();yaw+=(e.key==='ArrowLeft'?1:-1)*Math.PI/8;dirty=true;}});
  new ResizeObserver(()=>{dirty=true;}).observe($('stage').parentElement);
  $('status').textContent='מוכן · 46 פריטים · 6 גוני עור';
  window.avatarPreview={ready:true,manifest,get state(){return structuredClone(state);},get stats(){return stats;},get customization(){return customization;},get renderer(){return renderer;},get sources(){return sources;},get avatar(){return avatar;},
    setCategory,select,captureThumbnail,render,
    setState(next){const oldBody=state.body;state=sanitize({...state,...next,colors:{...state.colors,...next.colors}});if(oldBody!==state.body)buildAvatar();apply();},
    setView(next){focus=next;dirty=true;},setAngle(value){yaw=value;dirty=true;},setPose(value){$('pose').value=value;dirty=true;},
    downloadOffline:offlineDownload};
}
start().catch(error=>{$('status').textContent='לא הצלחנו לטעון את הסטודיו';showMessage('שגיאה בטעינה: '+error.message+'. לפתיחת תיקיית המקור הפעילו שרת מקומי; קובץ האופליין נפתח ישירות.');console.error(error);});
