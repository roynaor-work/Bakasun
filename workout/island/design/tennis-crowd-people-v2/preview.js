/* Actual delivered GLBs; one active core scene / LOD per person. */
const T = window.CrowdThree;
const $ = id => document.getElementById(id);
const status = { ready:false, playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,
  lod:0, clip:'seated_idle', view:'crowd', selected:0, time:0, errors:[], loads:0 };
let renderer, camera, controls, scene, manifest, people = [], last=performance.now(), raf=0;
let resolveReady, rejectReady;
const ready = new Promise((resolve,reject) => {resolveReady=resolve;rejectReady=reject;});
ready.catch(()=>{});
const fail = error => {status.errors.push(String(error));$('error').hidden=false;$('error').textContent=`התצוגה לא נטענה. יש לפתוח דרך שרת מקומי ולבדוק שכל קובצי החבילה זמינים. ${String(error)}`;rejectReady(error);};
function box(w,h,d,color,x,y,z) {
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.94}));
  mesh.position.set(x,y,z);return mesh;
}
function chair(asset) {
  const group=new T.Group(),scale=asset.height/1.666,seat=asset.seatHeightMeters;
  const timber='#bba180',frame='#677b6c';
  group.add(box(.49*scale,.035,.42*scale,timber,0,seat,-.12*scale));
  for (const y of [seat+.19*scale,seat+.28*scale]) group.add(box(.49*scale,.067*scale,.025,timber,0,y,-.31*scale));
  for(const x of [-.215,.215])for(const z of [-.29,.04]){
    group.add(box(.022,seat,.022,frame,x*scale,seat/2,z*scale));
    if(z<0)group.add(box(.022,.33*scale,.022,frame,x*scale,seat+.16*scale,z*scale));
  }
  return group;
}
function environment() {
  scene.background=new T.Color('#ebeedd');
  scene.add(new T.HemisphereLight('#fff8e9','#7b8e74',2.1));
  const sun=new T.DirectionalLight('#fff0d7',2.5);sun.position.set(-3,6,5);scene.add(sun);
  const fill=new T.DirectionalLight('#e0eef1',.75);fill.position.set(4,3,-4);scene.add(fill);
  scene.add(box(100,.04,100,'#d9deca',0,-.045,0));
  scene.add(box(12,.024,2.3,'#708e77',0,-.01,2.6));
  scene.add(box(11.6,.008,.025,'#eae8cc',0,.005,1.48));
  scene.add(box(.025,.008,2.1,'#eae8cc',-4.4,.005,2.55));
  scene.add(box(.025,.008,2.1,'#eae8cc',4.4,.005,2.55));
  scene.add(box(8,.12,.72,'#c3cdb3',0,.04,-1.22));
  scene.add(box(12,.55,.28,'#7f9979',0,.24,-2.3));
  scene.add(box(12,.25,.28,'#91a683',0,.60,-2.34));
  // Soft contact shadow, decorative geometry only. Never part of the GLB budget.
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(39,58,32,.26)');gradient.addColorStop(1,'rgba(39,58,32,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false});
}
function mountLOD(person) {
  if(person.body){person.mixer.stopAllAction();person.mixer.uncacheRoot(person.body);}
  else {person.body=new T.Group();person.body.add(...person.gltf.scenes);person.wrapper.add(person.body);}
  person.gltf.scenes.forEach((s,index)=>s.visible=index===status.lod);
  person.mixer=new T.AnimationMixer(person.body);
  person.action=person.mixer.clipAction(person.gltf.animations.find(c=>c.name===status.clip));
  person.action.setLoop(T.LoopRepeat,Infinity).play();
  person.mixer.setTime(status.time+(status.view==='crowd'?person.index*.173:0));
}
function updateInfo() {
  const item=manifest.models[status.selected];
  $('person-title').textContent=status.view==='crowd'?'מקומות טובים ליד המגרש':item.label;
  $('person-detail').textContent=status.view==='crowd'?'14 אנשים · לבוש טניס ופיקניק · קיץ באי':`דמות ${status.selected+1} · גיל ${item.age} · גובה ${item.height.toFixed(2)} מ׳`;
  $('lod-label').textContent=`LOD ${status.lod} / ${manifest.lodTriangles[status.lod]} TRI`;
}
function frame() {
  const crowd=status.view==='crowd';
  people.forEach((p,i)=>{
    p.wrapper.visible=crowd||i===status.selected;
    if(crowd){const row=Math.floor(i/7),col=i%7;p.wrapper.position.set((col-3)*.83,row*.15,-row*1.03);}
    else p.wrapper.position.set(0,0,0);
    p.mixer.setTime(status.time+(crowd?p.index*.173:0));
  });
  const ratio=$('stage').clientWidth/$('stage').clientHeight;
  const height=crowd?Math.max(2.55,6.7/ratio):2.13;
  camera.left=-height*ratio/2;camera.right=height*ratio/2;camera.top=height/2;camera.bottom=-height/2;
  camera.position.set(crowd?1.4:1.35,crowd?2.5:1.66,crowd?8.2:4.8);
  controls.target.set(0,crowd?.77:.83,crowd?-.28:.07);camera.zoom=1;camera.updateProjectionMatrix();controls.update();
  updateInfo();
}
function setView(view) {
  status.view=view;$('crowd').setAttribute('aria-pressed',String(view==='crowd'));
  $('close').setAttribute('aria-pressed',String(view==='close'));frame();render();
}
function setClip(clip) {
  if(!manifest.clips.some(c=>c.name===clip))throw Error(`Unknown clip ${clip}`);
  status.clip=clip;status.time=0;$('clip').value=clip;people.forEach(mountLOD);render();
}
function setLOD(lod) {
  if(![0,1,2].includes(lod))throw Error(`Unknown LOD ${lod}`);
  status.lod=lod;$('lod').value=String(lod);people.forEach(mountLOD);updateInfo();render();
}
function selectFan(index) {
  if(index<0||index>=people.length)throw Error('Unknown fan');
  status.selected=index;$('fan').value=String(index);if(status.view==='close')frame();else updateInfo();render();
}
function setPlaying(playing) {
  status.playing=Boolean(playing);$('pause').textContent=playing?'השהיה':'ניגון';
  $('pause').setAttribute('aria-pressed',String(!playing));$('pause').setAttribute('aria-label',playing?'השהיית אנימציה':'ניגון אנימציה');last=performance.now();render();
}
function setTime(time) {
  status.time=time;
  people.forEach(p=>p.mixer.setTime(time+(status.view==='crowd'?p.index*.173:0)));render();
}
function render() {
  if(!status.ready)return;
  const duration=manifest.clips.find(c=>c.name===status.clip).durationSeconds;
  $('progress').style.width=`${status.time%duration/duration*100}%`;
  renderer.render(scene,camera);
}
function tick(now) {
  raf=requestAnimationFrame(tick);
  const delta=Math.min(.05,(now-last)/1000);last=now;
  if(status.ready&&status.playing&&!document.hidden){status.time+=delta;people.forEach(p=>{if(p.wrapper.visible)p.mixer.update(delta);});render();}
}
async function init() {
  if(!T)throw Error('Missing local Three.js bundle');
  renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.domElement.tabIndex=0;$('stage').appendChild(renderer.domElement);
  scene=new T.Scene();camera=new T.OrthographicCamera(-4,4,2,-2,.01,150);
  controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  controls.minPolarAngle=.45;controls.maxPolarAngle=1.58;controls.minZoom=.6;controls.maxZoom=5;
  controls.addEventListener('change',render);
  const shadowMaterial=environment();
  const response=await fetch('manifest.json');if(!response.ok)throw Error(`Manifest HTTP ${response.status}`);
  manifest=await response.json();
  const loader=new T.GLTFLoader();
  people=await Promise.all(manifest.models.map(async(asset,index)=>{
    const gltf=await loader.loadAsync(asset.file);status.loads++;
    if(gltf.scenes.length!==3||gltf.animations.length!==5)throw Error(`Incomplete GLB: ${asset.file}`);
    const wrapper=new T.Group();scene.add(wrapper);wrapper.add(chair(asset));
    const shadow=new T.Mesh(new T.PlaneGeometry(.95,.95),shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.002,.08);wrapper.add(shadow);
    const person={gltf,wrapper,index};mountLOD(person);return person;
  }));
  manifest.models.forEach((item,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`${String(index+1).padStart(2,'0')} · ${item.label}`;$('fan').appendChild(option);});
  function resize(){renderer.setSize($('stage').clientWidth,$('stage').clientHeight);frame();render();}
  new ResizeObserver(resize).observe($('stage'));
  $('pause').onclick=()=>setPlaying(!status.playing);$('clip').onchange=e=>setClip(e.target.value);
  $('lod').onchange=e=>setLOD(Number(e.target.value));$('fan').onchange=e=>{selectFan(Number(e.target.value));setView('close');};
  $('crowd').onclick=()=>setView('crowd');$('close').onclick=()=>setView('close');
  document.addEventListener('keydown',event=>{if(event.code==='Space'&&event.target.tagName!=='SELECT'&&event.target.tagName!=='BUTTON'){event.preventDefault();setPlaying(!status.playing);}});
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlaying(false);});
  renderer.domElement.addEventListener('webglcontextrestored',()=>render());
  status.ready=true;resize();setPlaying(status.playing);raf=requestAnimationFrame(tick);resolveReady();
}
window.crowdPreview={ready,setView,setClip,setLOD,selectFan,setPlaying,setTime,
  getState:()=>({...status,triangles:manifest?.lodTriangles[status.lod],
    visiblePeople:people.filter(p=>p.wrapper.visible).length,
    renderer:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}:null}),
  inspectPose:()=>people.map(p=>{p.body.updateMatrixWorld(true);const result={};
    for(const name of ['Hips','Head','Hand_L','Hand_R','Foot_L','Foot_R']){
      const bone=p.body.getObjectByName(`L${status.lod}_${name}`);result[name]=bone.getWorldPosition(new T.Vector3()).toArray();}
    return result;}),
  inspectDeformations:()=>people.map(p=>{
    p.body.updateMatrixWorld(true);let mesh;
    p.gltf.scenes[status.lod].traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
    mesh.skeleton.update();const positions=mesh.geometry.getAttribute('position'),box=new T.Box3();
    for(let i=0;i<positions.count;i++){
      const vertex=new T.Vector3().fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,vertex);box.expandByPoint(vertex);
    }
    return {id:manifest.models[p.index].id,triangles:positions.count/3,min:box.min.toArray(),max:box.max.toArray()};}),
  dispose:()=>{cancelAnimationFrame(raf);controls?.dispose();renderer?.dispose();}};
init().catch(fail);
