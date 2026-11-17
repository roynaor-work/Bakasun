import * as THREE from 'three';
import {OrbitControls} from './vendor/addons/controls/OrbitControls.js';
import {RoomEnvironment} from './vendor/addons/environments/RoomEnvironment.js';
import {Reflector} from './vendor/addons/objects/Reflector.js';
import {loadArena} from './arena.mjs';

const canvas=document.querySelector('#court');
const status=document.querySelector('#status');
const views={
  broadcast:{eye:[13,13,-25],target:[0,3,0],fov:48,cutaway:true,title:'מבט שידור',description:'פרקט מייפל. אור של משחק.'},
  court:{eye:[-12.8,2.3,-7.8],target:[5.5,2.3,1.4],fov:60,cutaway:false,title:'על הפרקט',description:'סיבי עץ, צבע והשתקפות עדינה.'},
  hoop:{eye:[10.35,3.7,-2.75],target:[12.8,3.12,.1],fov:50,cutaway:false,title:'פרטים בגובה הטבעת',description:'זכוכית, מסגרת ורשת קלועה.'},
  ceiling:{eye:[-14,3,-8],target:[1,11.5,5],fov:64,cutaway:false,title:'האור שמעל המשחק',description:'קורות פלדה. עשרים גופי תאורה.'}
};
let renderer,scene,camera,controls,arena,reflection,probe,room,raf;
let currentView='broadcast',full=false,renderQueued=false,ready=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const stats={ready:false,errors:[],frames:0};
window.__arenaV2={stats,views};

function invalidate(){
  if(renderQueued||!ready||document.hidden)return;
  renderQueued=true;
  raf=requestAnimationFrame(()=>{
    renderQueued=false;
    controls.update();
    renderer.render(scene,camera);
    stats.frames++;
    stats.render={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  });
}

function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);
  const crossedOrientation=(w/h<1)!==(camera.aspect<1);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  if(crossedOrientation&&arena)setView(currentView);
  stats.viewport=[w,h];invalidate();
}

function setView(key){
  currentView=key;
  const view=views[key];
  full=!view.cutaway;
  arena.setCutaway(view.cutaway);
  camera.position.fromArray(view.eye);
  controls.target.fromArray(view.target);
  camera.fov=view.fov;
  if(camera.aspect<1&&key==='broadcast'){
    camera.position.set(25,38,-66);camera.fov=65;
  }
  camera.updateProjectionMatrix();controls.update();
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===key)));
  document.querySelector('#view-number').textContent=`0${Object.keys(views).indexOf(key)+1} / 04`;
  document.querySelector('#view-title').textContent=view.title;
  document.querySelector('#view-description').textContent=view.description;
  document.querySelector('#roof').setAttribute('aria-pressed',String(full));
  document.querySelector('#roof').textContent=full?'פתיחת האולם':'אולם מלא';
  stats.view=key;stats.cutaway=!full;invalidate();
}

function ceilingProbe(){
  const pmrem=new THREE.PMREMGenerator(renderer);
  room=new RoomEnvironment();
  probe=pmrem.fromScene(room,.03);
  pmrem.dispose();
  scene.environment=probe.texture;
}

function lighting(){
  scene.add(new THREE.HemisphereLight(0xc5dce5,0x343d49,1.35));
  const key=new THREE.DirectionalLight(0xfff2d6,2.3);
  key.position.set(-7,18,-4);key.target.position.set(0,0,0);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-29,right:29,top:25,bottom:-25,near:.5,far:65});
  key.shadow.bias=-.00035;key.shadow.normalBias=.035;key.shadow.radius=3;
  scene.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xbddce9,.8);fill.position.set(14,9,14);scene.add(fill);
  for(const x of [-10,10]){
    const spot=new THREE.SpotLight(0xffefda,600,40,1.05,.85,2);
    spot.position.set(x,12.3,3);spot.target.position.set(x*.3,0,0);
    scene.add(spot,spot.target);
  }
}

function floorReflection(){
  const shader=Reflector.ReflectorShader;
  const custom={uniforms:THREE.UniformsUtils.clone(shader.uniforms),vertexShader:shader.vertexShader,
    fragmentShader:shader.fragmentShader
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec2 uv = vUv.xy / vUv.w;
        vec2 d = vec2(2.5/768.0, 2.5/384.0);
        vec4 base = texture2D(tDiffuse,uv)*0.4;
        base += texture2D(tDiffuse,uv+d)*0.15;
        base += texture2D(tDiffuse,uv-d)*0.15;
        base += texture2D(tDiffuse,uv+vec2(d.x,-d.y))*0.15;
        base += texture2D(tDiffuse,uv+vec2(-d.x,d.y))*0.15;`)
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 0.045 );')};
  reflection=new Reflector(new THREE.PlaneGeometry(30.8,17.8),{
    clipBias:.005,textureWidth:768,textureHeight:384,color:0x8a8d85,shader:custom,multisample:0
  });
  reflection.rotation.x=-Math.PI/2;reflection.position.y=.018;
  reflection.material.transparent=true;reflection.material.depthWrite=false;
  reflection.name='Preview_lacquer_reflection';
  scene.add(reflection);
}

try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.info.autoReset=false;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x121e29);
  scene.fog=new THREE.FogExp2(0x121e29,.007);
  camera=new THREE.PerspectiveCamera(48,1,.08,150);
  controls=new OrbitControls(camera,canvas);
  controls.enableDamping=false;controls.minDistance=1.2;controls.maxDistance=72;
  controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.49;
  controls.enablePan=true;controls.listenToKeyEvents(canvas);
  controls.addEventListener('change',invalidate);
  ceilingProbe();lighting();
  arena=await loadArena();scene.add(arena.root);
  floorReflection();
  ready=true;resize();
  setView(new URLSearchParams(location.search).get('view') in views?new URLSearchParams(location.search).get('view'):'broadcast');
  const nativeRender=renderer.render.bind(renderer);
  let renderDepth=0;
  renderer.render=(s,c)=>{
    if(renderDepth===0)renderer.info.reset();
    renderDepth++;
    try{return nativeRender(s,c);}finally{renderDepth--;}
  };
  // Inspection API is also used by the repeatable browser checks.
  Object.assign(window.__arenaV2,{setView,arena,scene,camera,renderer,controls,
    setReflection(enabled){reflection.visible=enabled;invalidate();},
    render(){renderer.render(scene,camera);},
    dispose(){ready=false;cancelAnimationFrame(raf);controls.dispose();arena.dispose();reflection.geometry.dispose();reflection.dispose();room.dispose();probe.dispose();renderer.dispose();}
  });
  Object.assign(stats,{ready:true,three:THREE.REVISION,seats:arena.seats,reflection:'768x384 planar, blurred, 4.5% opacity, plus PBR varnish',reducedMotion:reduced});
  status.hidden=true;
  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('visibilitychange',invalidate);
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>setView(button.dataset.view));
  document.querySelector('#roof').addEventListener('click',()=>{
    full=!full;arena.setCutaway(!full);stats.cutaway=!full;
    document.querySelector('#roof').setAttribute('aria-pressed',String(full));
    document.querySelector('#roof').textContent=full?'פתיחת האולם':'אולם מלא';invalidate();
  });
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();stats.errors.push('WebGL context lost');stats.ready=false;
    status.hidden=false;status.innerHTML='<b>התצוגה נעצרה</b><span>יש לרענן את הדף כדי לחזור לאולם.</span>';
  });
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
}catch(error){
  stats.errors.push(String(error));console.error(error);
  status.innerHTML='<b>לא ניתן לפתוח את האולם</b><span>יש לפתוח את הדף דרך שרת HTTP בדפדפן שתומך ב־WebGL.</span>';
}
