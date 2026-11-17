import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {selectLod} from './tools/lod-policy.mjs';

const $ = id => document.getElementById(id), cards = [...document.querySelectorAll('article')];
const groupLabels = {'hoops-realism-v2':'כדורסל','soccer-crowd-people-v2':'כדורגל','tennis-crowd-people-v2':'טניס','city-citizens-v1':'עיר','catch-vehicles-v2':'מרדף','fire-rescue-people-v2':'חילוץ'};
const names = {guard:'רכז',power:'שחקן כוח',shooter:'קלע',wing:'כנף',bird:'ציפור',butterfly:'פרפר',cat:'חתול',dog:'כלב',fish:'דג',pigeon:'יונה','adult-man':'תושב','adult-woman':'תושבת',boy:'ילד',girl:'ילדה','elder-man':'אזרח ותיק','elder-woman':'אזרחית ותיקה',cleaner:'ניקיון',courier:'שליח',firefighter:'כבאי',gardener:'גנן',maintenance:'אחזקה',police:'משטרה','baby-stroller':'תינוק בעגלה',captain:'מפקד',father:'אבא','female-firefighter':'כבאית',grandfather:'סבא',grandmother:'סבתא',mother:'אמא','panicked-man':'אדם בבהלה','young-firefighter':'כבאי צעיר','fugitive-classic':'רכב קלאסי','fugitive-motorcycle':'אופנוע','fugitive-scooter':'קטנוע','fugitive-sport':'רכב ספורט','fugitive-suv':'רכב שטח','fugitive-taxi':'מונית','fugitive-truck':'משאית','fugitive-van':'טנדר','police-dirt-bike':'אופנוע שטח משטרתי','police-luxury':'ניידת יוקרה','police-sedan':'ניידת סדאן','police-suv':'ניידת שטח','police-touring-bike':'אופנוע משטרה','police-van':'מסחרית משטרה'};
const clipNames = {sit:'ישיבה',stand:'עמידה',clap:'מחיאות כפיים',jump:'קפיצה',disappointed:'אכזבה',shout:'עידוד',jump_cheer:'קפיצה בשמחה',wave_clap:'גל מחיאות',seated_idle:'ישיבה רגועה',polite_applause:'מחיאות עדינות',cheer:'עידוד',track_ball:'מעקב אחרי הכדור',stand_up:'קימה',idle:'מנוחה',walk:'הליכה',run:'ריצה',wave:'נפנוף',talk:'שיחה',work:'עבודה',fly:'תעופה',swim:'שחייה',ready:'מוכנות',panic_stand:'בהלה',cough:'שיעול',wave_help:'קריאה לעזרה',sit_floor:'ישיבה על הרצפה',carried_shoulder:'נישא על כתף',walk_happy:'הליכה שמחה',rescue_carry:'נשיאת ניצול',wheels_roll:'סיבוב גלגלים',beacons_flash:'אורות מהבהבים'};
const assetLabel = a => names[a.label] || (a.label.match(/^fan-(\d+)/) ? `אוהד ${Number(RegExp.$1)}` : names[a.label.replace(/-[abc]$/, '')] ? `${names[a.label.replace(/-[abc]$/, '')]} · ${{a:'א',b:'ב',c:'ג'}[a.label.at(-1)]}` : a.label);
const sceneLabel = (scene, i) => ({intact:'שלם',damaged:'פגוע',crushed:'מעוך'}[scene.name] || (scene.name?.startsWith('LOD') ? `סצנת מקור ${i}` : 'סצנה ראשית'));
let manifest, config, asset, viewers = [], playing = true, localTime = 0, duration = 0, yaw = 0.25, pitch = 0.12, selectedLevel = null, generation = 0, loaded = false;
let wire = false, bones = false, lastFrame = performance.now(), loadError = null;
let localFiles = null;
const loader = new GLTFLoader(), renderer = new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
const resize = new ResizeObserver(() => {renderer.setSize($('stage').clientWidth, $('stage').clientHeight, false); render();}); resize.observe($('stage'));
for(const e of document.querySelectorAll('.controls button,.controls select,footer input'))e.disabled=true;

async function readJSON(relative) {
  if(localFiles){const file=localFiles.get(relative);if(!file)throw Error(`קובץ חסר: ${relative}`);return JSON.parse(await file.text());}
  const response=await fetch(relative);if(!response.ok)throw Error(`${relative}: ${response.status}`);return response.json();
}

async function loadModel(relative) {
  if(!localFiles)return loader.loadAsync(relative);
  const file=localFiles.get(relative);if(!file)throw Error(`קובץ חסר: ${relative}`);
  const url=URL.createObjectURL(file);
  try{return await loader.loadAsync(url);}finally{URL.revokeObjectURL(url);}
}

async function selectLocalFolder() {
  $('status').textContent='פתחו את תיקיית החבילה שחולצה באמצעות הכפתור למעלה. אין צורך בשרת או באינטרנט.';
  $('folder-button').hidden=false;$('folder-button').onclick=()=>$('folder-input').click();
  $('download-link').hidden=true;
  await new Promise(resolve=>{$('folder-input').onchange=()=>{
    const files=[...$('folder-input').files],manifest=files.find(f=>f.name==='manifest.json'&&(/\/lod-pipeline-v1\/manifest\.json$/.test('/'+f.webkitRelativePath)||f.webkitRelativePath.split('/').length===2));
    if(!manifest){$('status').textContent='לא נמצא manifest.json. בחרו את תיקיית lod-pipeline-v1 שחולצה.';return;}
    const prefix=manifest.webkitRelativePath.slice(0,-'manifest.json'.length);
    localFiles=new Map(files.filter(f=>f.webkitRelativePath.startsWith(prefix)).map(f=>[f.webkitRelativePath.slice(prefix.length),f]));
    const report=localFiles.get('report.md');if(report)$('report-link').href=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
    $('folder-button').textContent='תיקייה מקומית נבחרה';resolve();
  };});
}

function dispose(viewer) {
  viewer.mixer.stopAllAction(); viewer.mixer.uncacheRoot(viewer.root);
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  viewer.scene.traverse(o => {if (o.geometry) geometries.add(o.geometry); if (o.skeleton) skeletons.add(o.skeleton); for (const m of o.material ? Array.isArray(o.material) ? o.material : [o.material] : []) {materials.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);}});
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => {t.source?.data?.close?.(); t.dispose();}); skeletons.forEach(s => s.dispose());
}

function buildViewer(gltf) {
  const scene = new THREE.Scene(), root = new THREE.Group();
  // All source scenes stay under the mixer root, including tennis's three rigs.
  gltf.scenes.forEach((s, i) => {root.add(s); s.visible = i === Number($('scene').value);}); scene.add(root);
  scene.add(new THREE.HemisphereLight(0xddeeff,0x647464,2.2));
  const key = new THREE.DirectionalLight(0xfff0da,3); key.position.set(3,5,5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa4c8ff,1.8); rim.position.set(-4,3,-3); scene.add(rim);
  const helper = new THREE.SkeletonHelper(root); helper.visible = bones; scene.add(helper);
  const mixer = new THREE.AnimationMixer(root), camera = new THREE.PerspectiveCamera(38,1,0.01,10000);
  const viewer = {scene,root,gltf,mixer,camera,helper};
  root.traverse(o => {if(o.isMesh) for(const m of Array.isArray(o.material)?o.material:[o.material]) m.wireframe = wire;});
  return viewer;
}

function updateMetrics() {
  const scene = Number($('scene').value), source = asset.variants[0].scenes[scene].sourceTriangles;
  cards.forEach((card, level) => {
    const metric = level ? asset.variants[level-1].scenes[scene] : null, triangles = metric?.triangles ?? source;
    card.querySelector('small').textContent = `${(triangles / source * 100).toFixed(level ? 1 : 0)}%`;
    const shape = metric ? `${(metric.hausdorff.lowerMetres * 100).toFixed(1)}–${(metric.hausdorff.upperMetres * 100).toFixed(1)} ס״מ` : 'קנה מידה משותף';
    card.querySelector('.card-metrics').innerHTML = `<div><strong>${triangles.toLocaleString('he-IL')}</strong> משולשים</div><div class="shape">${metric ? 'סטיית צורה: ' : ''}${shape}</div>`;
  });
}

function updateDistance(reset = false) {
  if (!asset || !config) return;
  const distance = Number($('distance').value), profile = config.assets?.[asset.id] || config.profiles[asset.profile];
  selectedLevel = selectLod(distance, profile, reset ? null : selectedLevel, config.hysteresisFraction);
  cards.forEach((c, i) => c.dataset.active = String(i === selectedLevel));
  $('distance-value').textContent = `${distance.toFixed(distance % 1 ? 1 : 0)} מ׳`;
  $('policy').textContent = `לפי המרחק: LOD${selectedLevel} · מעבר ${profile.enterMetres[1]}/${profile.enterMetres[2]} מ׳`;
}

function activateClip(reset = true) {
  if (reset) localTime = 0;
  duration = 0;
  for (const v of viewers) {
    v.mixer.stopAllAction();
    const clip = v.gltf.animations.find(c => c.name === $('clip').value);
    if (clip) {v.mixer.clipAction(clip).reset().play(); duration = Math.max(duration,clip.duration);}
  }
  $('play').disabled = !duration; $('time').disabled = !duration;
  render();
}

async function setAsset(id) {
  const next = manifest.assets.find(a => a.id === id); if (!next) throw Error(`Unknown asset ${id}`);
  const token = ++generation; loaded = false; loadError = null;
  $('status').hidden = false; $('status').dataset.error = 'false'; $('status').textContent = 'טוען שלוש רמות פירוט…';
  asset = next; $('group').value = asset.group; fillAssets(); $('asset').value = id;
  $('subtitle').textContent = `${manifest.summary.models} דגמים · ${groupLabels[asset.group]} · ${assetLabel(asset)}`;
  const sceneNames = asset.variants[0].scenes;
  $('scene').replaceChildren(...sceneNames.map((s,i) => new Option(sceneLabel(s,i), String(i))));
  $('scene').value = String(0); $('scene').disabled = sceneNames.length < 2;
  if(asset.group==='tennis-crowd-people-v2'){$('scene').disabled=true;$('scene').title='שלוש סצנות השלד נשמרו; ההשוואה היא מול רמת המקור הראשית';}
  $('clip').replaceChildren(...(asset.source.clips.length ? asset.source.clips.map(c => new Option(clipNames[c.name] || (c.name.startsWith('tire_burst_') ? 'פיצוץ צמיג ' + c.name.slice(-2) : c.name),c.name)) : [new Option('מנוחה · שלד תואם','')]));
  yaw = asset.profile === 'vehicle' ? 0.65 : 0.2; pitch = asset.profile === 'vehicle' ? 0.25 : 0.1;
  const thresholds=(config.assets?.[asset.id]||config.profiles[asset.profile]).enterMetres;
  $('distance').max=String(Math.ceil(Math.max(90,thresholds[2]*1.2)));
  updateMetrics(); updateDistance(true);
  const paths = [asset.copy,...asset.variants.map(v=>v.file)];
  const settled = await Promise.allSettled(paths.map(loadModel));
  const gltfs = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
  if (token !== generation || settled.some(r => r.status === 'rejected')) {
    gltfs.forEach(g => dispose(buildViewer(g)));
    if (token === generation) {
      loadError = settled.find(r=>r.status==='rejected').reason.message;
      $('status').dataset.error = 'true'; $('status').textContent = `טעינת הדגם נכשלה: ${loadError}`;
    }
    return;
  }
  viewers.forEach(dispose); viewers = gltfs.map(buildViewer);
  const sg = asset.variants[0].scenes[0].hausdorff;
  const box = new THREE.Box3().setFromObject(gltfs[0].scenes[0]);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  viewers.forEach(v => {v.center = center.clone(); v.size = size.clone(); v.diagonal = sg.diagonalMetres;});
  activateClip(); loaded = true; $('status').hidden = true;
  if(/^https?:$/.test(location.protocol))history.replaceState(null,'',`?asset=${encodeURIComponent(id)}${localFiles?'&local-folder=1':''}`); render();
}

function fillAssets() {
  $('asset').replaceChildren(...manifest.assets.filter(a=>a.group === $('group').value).map(a=>new Option(assetLabel(a),a.id)));
}

function render() {
  if (!viewers.length) return;
  const canvasRect = $('canvas').getBoundingClientRect();
  renderer.setScissorTest(false); renderer.setClearColor(0x000000,0); renderer.clear(); renderer.setScissorTest(true);
  viewers.forEach((v, i) => {
    v.mixer.setTime(duration ? localTime % duration : 0);
    v.root.updateMatrixWorld(true); v.helper.updateMatrixWorld(true);
    const rect = cards[i].getBoundingClientRect(), w = rect.width, h = rect.height, x = rect.left - canvasRect.left, y = canvasRect.bottom - rect.bottom;
    v.camera.aspect = w / h;
    const vertical = Math.max(v.size.y, v.size.z * .55), horizontal = Math.max(v.size.x, v.size.z * .65);
    const distance = Math.max(vertical, horizontal / v.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))) * 1.8;
    const target=v.center.clone();target.y-=v.size.y*.12;
    v.camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));
    v.camera.near = Math.max(0.001, distance / 1000); v.camera.far = distance * 20; v.camera.lookAt(target); v.camera.updateProjectionMatrix();
    renderer.setViewport(x,y,w,h); renderer.setScissor(x,y,w,h); renderer.render(v.scene,v.camera);
  });
  $('time').value = duration ? String((localTime % duration)/duration*1000) : '0';
  $('time-value').textContent = `${(duration ? localTime % duration : 0).toFixed(2)} ש׳`;
}

$('group').onchange = () => {fillAssets(); void setAsset($('asset').value);};
$('asset').onchange = () => void setAsset($('asset').value);
for (const [button, step] of [['previous',-1],['next',1]]) $(button).onclick = () => {const list=manifest.assets.filter(a=>a.group===asset.group),i=list.indexOf(asset); void setAsset(list[(i+step+list.length)%list.length].id);};
$('clip').onchange = () => activateClip();
$('scene').onchange = () => {viewers.forEach(v=>v.gltf.scenes.forEach((s,i)=>s.visible=i===Number($('scene').value))); updateMetrics(); render();};
$('play').onclick = () => {playing=!playing; $('play').textContent=playing?'||':'▶'; $('play').setAttribute('aria-label',playing?'השהיית התנועה':'ניגון התנועה');};
$('wire').onclick = () => {wire=!wire;$('wire').setAttribute('aria-pressed',String(wire));viewers.forEach(v=>v.root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=wire;}));render();};
$('bones').onclick = () => {bones=!bones;$('bones').setAttribute('aria-pressed',String(bones));viewers.forEach(v=>v.helper.visible=bones);render();};
$('distance').oninput = () => updateDistance();
$('time').oninput = () => {localTime=Number($('time').value)/1000*duration;render();};
let drag = null;
$('canvas').onpointerdown = e => {drag={x:e.clientX,y:e.clientY};$('canvas').setPointerCapture(e.pointerId);};
$('canvas').onpointermove = e => {if(drag){yaw+=(e.clientX-drag.x)*.009;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.006,-.55,1);drag={x:e.clientX,y:e.clientY};render();}};
$('canvas').onpointerup = $('canvas').onpointercancel = () => drag=null;
function frame(now) {if(playing&&loaded&&duration)localTime+=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;render();requestAnimationFrame(frame);}
requestAnimationFrame(frame);

window.lodPreview = {
  setAsset,
  setClip(name){$('clip').value=name;activateClip();},
  setScene(index){$('scene').value=String(index);$('scene').onchange();},
  setTime(time){playing=false;$('play').textContent='▶';$('play').setAttribute('aria-label','ניגון התנועה');localTime=time;render();},
  state(){
    const rigs=viewers.map(v=>{const values=[];v.root.traverse(o=>{if(o.isBone)values.push(...o.matrixWorld.elements);});return values;});
    const morphs=viewers.map(v=>{const values=[];v.root.traverse(o=>{if(o.morphTargetInfluences)values.push(...o.morphTargetInfluences);});return values;});
    const drift=arrays=>Math.max(0,...arrays.slice(1).map(values=>Math.max(0,...values.map((n,i)=>Math.abs(n-arrays[0][i])))));
    return {loaded,error:loadError,asset:asset?.id,scene:Number($('scene').value),clip:$('clip').value,time:localTime,duration,selectedLevel,view:{yaw,pitch,wire,bones},maxBoneMatrixDrift:drift(rigs),maxMorphWeightDrift:drift(morphs),triangles:viewers.map(v=>{let n=0;v.root.traverseVisible(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;}),renderer:{calls:renderer.info.render.calls,programs:renderer.info.programs.length}};
  }
};

try {
  if(location.protocol==='file:'||new URLSearchParams(location.search).has('local-folder'))await selectLocalFolder();
  [manifest,config]=await Promise.all(['manifest.json','lod-config.json'].map(readJSON));
  for(const e of document.querySelectorAll('.controls button,.controls select,footer input'))e.disabled=false;
  $('group').replaceChildren(...Object.entries(groupLabels).map(([id,label])=>new Option(label,id)));
  const requested=new URLSearchParams(location.search).get('asset'), initial=manifest.assets.find(a=>a.id===requested)||manifest.assets.find(a=>a.label==='guard')||manifest.assets[0];
  await setAsset(initial.id);
} catch(error) {loadError=error.message;$('status').dataset.error='true';$('status').textContent=`לא ניתן לפתוח את החבילה: ${error.message}. להרצה מקומית: node tools/serve.mjs`;$('status').hidden=false;console.error(error);}
