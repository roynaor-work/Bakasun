import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {DecalGeometry} from 'three/examples/jsm/geometries/DecalGeometry.js';
import {readGLB, decodeBase64} from '../runtime/glb.mjs';
import {createCustomizer} from '../runtime/customize.mjs';
import {createEffectPreview} from '../runtime/effects.mjs';

const pack = JSON.parse(document.getElementById('pack').textContent), manifest = pack.manifest;
const offlineHTML = '<!doctype html>\n' + document.documentElement.outerHTML;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const items = new Map(manifest.items.map(i => [i.id, i]));
const shortLabels = ['קדמית','אחורית','גלגלים','מדבקות','צבעים','אפקטים','קסדות'];
const categoryText = ['חזית מדויקת. הקו שלך.','הסיום שעושה את ההבדל.','פרטים קטנים. נוכחות גדולה.','סימן אישי, בכל פנייה.','שתי שכבות. מאה שילובים.','קצת יותר דרמה ביציאה.','הפרט האחרון לפני הזינוק.'];
const categorySlot = {'front-wings':'frontWing','rear-wings':'rearWing',wheels:'wheels',decals:'decal',effects:'effect',helmets:'helmet'};
const STORE = 'island.racing-customize-v1.design';
let activeCategory = 'front-wings', activeLayer = 'body', customizer, effects, renderer, camera, scene, car;
let orbit = .74, elevation = .36, zoom = 1, view = 'front', effectEnabled = true, dirty = false, drag = null, animationId, alive = true;
let busy = 0, noticeTimer, lastTime = 0, pause = false, initialized = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const assets = new Map(), textures = new Map();
const assetUrl = (path, type='image/svg+xml') => `data:${type};base64,${pack.assets[path]}`;
function notify(message) {$('#notice').textContent = message; $('#notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').classList.remove('show'), 2200);}
function texture(path) {
  if (!textures.has(path)) textures.set(path, new Promise((resolve,reject) => {
    new T.TextureLoader().load(assetUrl(path), result => {result.colorSpace = T.SRGBColorSpace; result.anisotropy = 2; resolve(result);}, undefined, reject);
  }));
  return textures.get(path);
}
function loadAsset(path) {
  if (!assets.has(path)) assets.set(path, readGLB(T,decodeBase64(pack.assets[path])));
  return assets.get(path);
}
function restoreState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE));
    const defaults = manifest.defaults, out = {...defaults};
    for (const key of Object.keys(defaults)) {
      const slot = key === 'bodyPaint' || key === 'stripePaint' ? 'paint' : key;
      if (items.get(value?.[key])?.slot === slot) out[key] = value[key];
    }
    return out;
  } catch {return {...manifest.defaults};}
}
function buildTabs() {
  manifest.categories.forEach((category,index) => {
    const button = document.createElement('button'); button.className = 'tab'; button.type = 'button';
    button.setAttribute('role','tab'); button.id = `tab-${category.id}`; button.dataset.category = category.id;
    button.setAttribute('aria-controls','items'); button.setAttribute('aria-label',category.label);
    const image = new Image(); image.src = assetUrl(category.icon); image.alt = ''; button.append(image);
    const label = document.createElement('span'); label.textContent = shortLabels[index]; button.append(label);
    button.addEventListener('click',() => selectCategory(category.id));
    button.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 6 : (index + (event.key === 'ArrowLeft' ? 1 : -1) + 7) % 7;
      selectCategory(manifest.categories[next].id); $$('.tab')[next].focus();
    });
    $('#tabs').append(button);
  });
}
function selectionId() {
  const state = customizer?.snapshot() || manifest.defaults;
  return activeCategory === 'paints' ? state[activeLayer === 'body' ? 'bodyPaint' : 'stripePaint'] : state[categorySlot[activeCategory]];
}
function renderCards() {
  const category = manifest.categories.find(c => c.id === activeCategory), selected = selectionId();
  $('#category-title').textContent = category.label;
  $('#category-count').textContent = `${category.count} לבחירה`;
  $('#items').setAttribute('aria-labelledby',`tab-${activeCategory}`);
  $('#items').replaceChildren();
  $('#layer-picker').classList.toggle('visible',activeCategory === 'paints');
  $$('.layer').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.layer === activeLayer)));
  for (const item of manifest.items.filter(i => i.category === activeCategory)) {
    const button = document.createElement('button'); button.className = 'item'; button.type = 'button'; button.dataset.item = item.id;
    button.setAttribute('aria-pressed',String(item.id === selected)); button.setAttribute('aria-label',item.label);
    const image = new Image(); image.src = assetUrl(item.icon); image.alt = ''; image.width = image.height = 96; button.append(image);
    const copy = document.createElement('span'), name = document.createElement('span'), tag = document.createElement('span');
    name.className = 'name'; name.textContent = item.label; tag.className = 'tag'; tag.textContent = item.id === selected ? 'על הרכב' : 'למדידה';
    copy.append(name,tag); button.append(copy);
    button.addEventListener('click',async() => {await choose(item.id);});
    $('#items').append(button);
  }
  $('#selected-name').textContent = items.get(selected)?.label || '';
  $('#save').textContent = dirty ? 'שמור עיצוב' : 'העיצוב שלי';
}
function selectCategory(id) {
  if (!manifest.categories.some(c => c.id === id)) throw new Error('Unknown category');
  activeCategory = id;
  $$('.tab').forEach(tab => {const selected = tab.dataset.category === id; tab.setAttribute('aria-selected',String(selected)); tab.tabIndex = selected ? 0 : -1;});
  $('#stage-copy').textContent = categoryText[manifest.categories.findIndex(c => c.id === id)];
  renderCards(); $('#items').scrollTop = 0;
  if (id === 'rear-wings' || id === 'effects') setView('rear');
  else if (id === 'helmets') setView('helmet');
  else setView('front');
}
async function choose(id, announce = true) {
  const item = items.get(id); if (!item) throw new Error('Unknown item');
  busy++;
  try {
    if (item.slot === 'paint') customizer.setPaint(activeLayer,id);
    else {
      const applied = await customizer.equip(item.slot,id);
      if (!applied) return;
      if (item.slot === 'effect') effects.select(item);
    }
    dirty = true; renderCards();
    if (announce) $('#live').textContent = `${item.label} על הרכב`;
  } catch(error) {notify('הפריט לא נטען. אפשר לנסות שוב.'); throw error;}
  finally {busy--;}
}
function setView(next) {
  view = next; orbit = next === 'rear' ? Math.PI + .74 : .74;
  elevation = next === 'helmet' ? .55 : .34; zoom = next === 'helmet' ? .55 : 1;
  $$('.view').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.view === next)));
}
function save() {
  try {localStorage.setItem(STORE,JSON.stringify(customizer.snapshot()));dirty=false;renderCards();notify('העיצוב נשמר במכשיר');}
  catch {notify('השמירה אינה זמינה בדפדפן הזה');}
}
function download() {
  // The document already contains every model, icon, mask and the renderer.
  const url = URL.createObjectURL(new Blob([offlineHTML],{type:'text/html;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href=url; anchor.download='racing-customize-v1.html'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);notify('קובץ התצוגה מוכן לאופליין');
}
function softShadow() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(0,12,19,.54)');gradient.addColorStop(.45,'rgba(0,12,19,.35)');gradient.addColorStop(1,'rgba(0,12,19,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const mesh=new T.Mesh(new T.PlaneGeometry(3.6,6.0),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=.009;scene.add(mesh);
}
function updateCamera() {
  const helmet = view === 'helmet', radius = (helmet ? 3.0 : 6.3)*zoom;
  const target = new T.Vector3(0,helmet ? .63 : .34,helmet ? -.08 : 0);
  camera.position.set(Math.sin(orbit)*radius,Math.max(.6,radius*Math.sin(elevation)),Math.cos(orbit)*radius);
  camera.lookAt(target);
}
function draw(now) {
  if (!alive) return;
  animationId=requestAnimationFrame(draw);
  const time = pause ? lastTime : now/1000; if (!pause) lastTime=time;
  updateCamera();
  if (effects) effects.update(time,customizer.effectRoot(),reduced.matches);
  renderer.render(scene,camera);
}
async function init() {
  const host=$('#stage'), canvas=$('#canvas');
  renderer = new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  scene=new T.Scene();camera=new T.PerspectiveCamera(40,1,.05,100);
  const pmrem=new T.PMREMGenerator(renderer), room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight('#d4eeed','#45545a',2.2));
  const key=new T.DirectionalLight('#fff1d8',3.0);key.position.set(3,6,4);scene.add(key);
  const rim=new T.DirectionalLight('#a2ded5',2);rim.position.set(-3,4,-4);scene.add(rim);
  const floor=new T.Mesh(new T.CircleGeometry(4.8,96),new T.MeshStandardMaterial({color:'#88a19d',roughness:.7,metalness:.1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.025;scene.add(floor);
  const ring=new T.Mesh(new T.RingGeometry(2.67,2.69,96),new T.MeshBasicMaterial({color:'#bfd8c9',transparent:true,opacity:.27}));
  ring.rotation.x=-Math.PI/2;ring.position.y=-.018;scene.add(ring);softShadow();
  car=loadAsset(manifest.compatibility.previewBase);scene.add(car);
  const mask=await texture(manifest.paint.stripeMask);
  customizer=createCustomizer({T,car,manifest,loadGLB:loadAsset,DecalGeometry,stripeTexture:mask,decalTexture:texture});
  effects=createEffectPreview(T,car.getObjectByName('Formula'));
  const state=restoreState();
  customizer.setPaint('body',state.bodyPaint);customizer.setPaint('stripes',state.stripePaint);
  for (const slot of ['frontWing','rearWing','wheels','helmet','effect','decal']) await customizer.equip(slot,state[slot]);
  effects.select(items.get(state.effect));
  const observer=new ResizeObserver(() => {const bounds=host.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height,false);camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();});observer.observe(host);
  canvas.addEventListener('pointerdown',event => {if (!event.isPrimary) return;drag={x:event.clientX,y:event.clientY,orbit,elevation};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event => {if (!drag) return;orbit=drag.orbit-(event.clientX-drag.x)*.012;elevation=T.MathUtils.clamp(drag.elevation+(event.clientY-drag.y)*.006,.13,.9);});
  for (const kind of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(kind,() => {drag=null;});
  canvas.addEventListener('wheel',event => {event.preventDefault();zoom=T.MathUtils.clamp(zoom+event.deltaY*.001,.65,1.35);},{passive:false});
  canvas.addEventListener('webglcontextlost',event => {event.preventDefault();cancelAnimationFrame(animationId);$('#error').classList.add('visible');});
  $('#reload').addEventListener('click',() => location.reload());
  document.addEventListener('visibilitychange',() => {if (document.hidden) cancelAnimationFrame(animationId);else if(alive) animationId=requestAnimationFrame(draw);});
  addEventListener('pagehide',() => {alive=false;cancelAnimationFrame(animationId);observer.disconnect();customizer.dispose();effects.dispose();
    const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isLineSegments){if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);}});
    for(const asset of assets.values())asset.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const pending of textures.values())pending.then(t=>t.dispose());environment.dispose();renderer.dispose();
  },{once:true});
  buildTabs();selectCategory(activeCategory);initialized=true;$('#loading').classList.add('hidden');animationId=requestAnimationFrame(draw);
}
$$('.view').forEach(button => button.addEventListener('click',() => setView(button.dataset.view)));
$$('.layer').forEach(button => button.addEventListener('click',() => {activeLayer=button.dataset.layer;renderCards();}));
$('#save').addEventListener('click',save);$('#download').addEventListener('click',download);
$('#effects-toggle').addEventListener('click',() => {effectEnabled=!effectEnabled;effects.setEnabled(effectEnabled);$('#effects-toggle').setAttribute('aria-pressed',String(effectEnabled));});
$('#reset-view').addEventListener('click',() => setView(view));
window.racingCustomize={manifest,selectCategory,choose,setView,
  setPaint(layer,id){customizer.setPaint(layer,id);dirty=true;renderCards();},
  freeze(value=true){pause=value;},
  inspect(){const state=customizer?.snapshot()||{};let meshes=0;car?.traverse(o=>{if(o.isMesh)meshes++;});
    const paint = [];car?.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(['Paint 1','Paint Stripes'].includes(m.name))paint.push({name:m.name,color:m.color.getHexString()});});
    return {ready:initialized,busy,state,view,paint,meshes,customizer:customizer?.metrics(),effects:effects?.metrics(),
      renderer:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}:null};},
  async reset(){for(const slot of ['frontWing','rearWing','wheels','helmet','effect','decal'])await customizer.equip(slot,manifest.defaults[slot]);customizer.setPaint('body',manifest.defaults.bodyPaint);customizer.setPaint('stripes',manifest.defaults.stripePaint);effects.select(items.get(manifest.defaults.effect));dirty=false;renderCards();},
  ready: null};
window.racingCustomize.ready=init().catch(error=>{console.error(error);$('#loading').classList.add('hidden');$('#error').classList.add('visible');throw error;});
