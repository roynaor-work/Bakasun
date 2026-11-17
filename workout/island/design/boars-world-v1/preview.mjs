import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const $=id=>document.getElementById(id),canvas=$('world'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={ready:false,view:'world',day:'morning',clip:'walk',selected:null,paused:reduced,manual:false,elapsed:0,zoom:1,yaw:0,pitch:0};
const api={state,assets:new Map(),actors:[],error:null};window.boarsWorld=api;
const ready=(async()=>{
  const [manifest,layout]=await Promise.all(['manifest.json','scene.json'].map(async f=>{const r=await fetch(f);if(!r.ok)throw Error(f);return r.json();}));
  api.manifest=manifest;api.layout=layout;
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  api.renderer=renderer;const scene=new T.Scene();api.scene=scene;
  const camera=new T.OrthographicCamera(-10,10,5,-5,.1,170);api.camera=camera;
  const hemi=new T.HemisphereLight('#e1eed7','#a2a179',1.5);scene.add(hemi);
  const sun=new T.DirectionalLight('#ffdfb0',2.1);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-12,right:12,top:10,bottom:-10,near:.5,far:60});sun.shadow.bias=-.0005;sun.shadow.normalBias=.025;
  sun.shadow.radius=3;sun.target.position.set(0,0,0);scene.add(sun,sun.target);
  const fill=new T.DirectionalLight('#e7efd5',.45);fill.position.set(7,6,-10);scene.add(fill);
  const world=new T.Group(),actors=new T.Group(),studio=new T.Group();scene.add(world,actors,studio);studio.visible=false;
  const loader=new GLTFLoader();
  await Promise.all(manifest.assets.map(async spec=>{
    const gltf=await loader.loadAsync(spec.file);
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=spec.category!=='sky'&&spec.category!=='ground'&&spec.category!=='mud';o.receiveShadow=spec.category!=='sky';}});
    api.assets.set(spec.id,{spec,gltf});
  }));
  for(const item of layout.instances){
    const mesh=api.assets.get(item.asset).gltf.scene.clone(true);mesh.position.fromArray(item.position);mesh.rotation.y=item.rotationY;mesh.scale.setScalar(item.scale);world.add(mesh);
  }
  for(const item of layout.boars){
    // Each delivered file is a separate actor with its own skeleton and mixer.
    const {gltf,spec}=api.assets.get(item.asset),model=gltf.scene,parent=new T.Group();
    parent.add(model);actors.add(parent);parent.position.fromArray(item.position);parent.rotation.y=item.rotationY;parent.scale.setScalar(item.scale);
    const mixer=new T.AnimationMixer(model),actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    for(const name of ['fall','panic']){actions[name].setLoop(T.LoopOnce,1);actions[name].clampWhenFinished=true;}
    api.actors.push({id:item.asset,spec,parent,model,mixer,actions,layout:item});
  }
  const studioFloor=new T.Mesh(new T.CircleGeometry(12,64),new T.MeshStandardMaterial({color:'#e8e2c8',roughness:1}));studioFloor.rotation.x=-Math.PI/2;studioFloor.position.y=-.012;studioFloor.receiveShadow=true;studio.add(studioFloor);
  // Contact shadows soften the lightweight real-time shadow map.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const ctx=shadowCanvas.getContext('2d'),grad=ctx.createRadialGradient(32,32,2,32,32,30);grad.addColorStop(0,'rgba(58,61,39,.23)');grad.addColorStop(1,'rgba(58,61,39,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(shadowCanvas),shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false});
  for(const actor of api.actors){const shadow=new T.Mesh(new T.PlaneGeometry(1.3,1.9),shadowMaterial.clone());shadow.rotation.x=-Math.PI/2;shadow.position.y=.009;actor.parent.add(shadow);actor.shadow=shadow;}
  let skyModel;
  function setDay(id){
    const asset=api.assets.get('sky-'+id);if(!asset)throw Error('Unknown day '+id);
    if(skyModel)scene.remove(skyModel);skyModel=asset.gltf.scene;scene.add(skyModel);
    const s=asset.spec.lighting;sun.color.set(s.light);sun.intensity=s.intensity;sun.position.fromArray(s.sunPosition);hemi.intensity=s.ambient;
    state.day=id;document.querySelectorAll('[data-day]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.day===id)));render();
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);const aspect=w/h,base=layout.cameras[state.view].orthographicHeight;
    const height=base*Math.max(1,(state.view==='world'?1.9:1.8)/aspect)*state.zoom;
    camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();updateCamera();
  }
  function updateCamera(){
    const preset=layout.cameras[state.view],target=new T.Vector3(...preset.target),offset=new T.Vector3(...preset.position).sub(target),spherical=new T.Spherical().setFromVector3(offset);
    spherical.theta+=state.yaw;spherical.phi=T.MathUtils.clamp(spherical.phi+state.pitch,.25,Math.PI/2-.05);offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);camera.lookAt(target);render();
  }
  function render(){renderer.render(scene,camera);}
  function setClip(name,reset=true){
    if(!api.actors[0].actions[name])throw Error('Unknown clip '+name);
    state.clip=name;
    for(const actor of api.actors){
      actor.mixer.stopAllAction();const action=actor.actions[name];action.reset().setEffectiveWeight(1).play();
      if(name==='walk'||name==='run')action.time=actor.layout.phaseSeconds%action.getClip().duration;
      actor.mixer.update(0);
    }
    if(reset)state.elapsed=0;
    document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name)));
    $('caption').textContent={walk:'חמישה חברים. יום קטן בחוץ.',run:'מי מגיע ראשון לשלולית?',fall:'לפעמים נופלים. הכול בסדר.',panic:'רק פרפר. אפשר להירגע.'}[name];render();
  }
  function setView(view,id=state.selected){
    state.view=view;state.selected=view==='studio'?(id||api.actors[0].id):null;world.visible=view==='world';studio.visible=view==='studio';
    for(const actor of api.actors){
      actor.parent.visible=view==='world'||actor.id===state.selected;
      if(view==='world'){actor.parent.position.fromArray(actor.layout.position);actor.parent.rotation.y=actor.layout.rotationY;actor.parent.scale.setScalar(actor.layout.scale);}
      else{actor.parent.position.set(0,0,0);actor.parent.rotation.y=-.25;actor.parent.scale.setScalar(1);}
    }
    document.body.dataset.view=view;$('view-world').setAttribute('aria-pressed',String(view==='world'));$('view-studio').setAttribute('aria-pressed',String(view==='studio'));
    document.querySelectorAll('[data-boar]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.boar===state.selected)));
    $('character-card').hidden=view==='world';if(view==='studio'){const spec=api.actors.find(a=>a.id===state.selected).spec;$('character-name').textContent=spec.name;$('character-personality').textContent=spec.personality;}
    state.zoom=1;state.yaw=0;state.pitch=0;resize();
  }
  function setPaused(value){state.paused=value;$('pause').setAttribute('aria-pressed',String(value));$('pause').setAttribute('aria-label',value?'הפעלת התנועה':'השהיית התנועה');$('pause').innerHTML=value?'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2l8 5-8 5z" fill="currentColor"/></svg>':'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2v10M10 2v10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';render();}
  function step(dt){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid time step');state.elapsed+=dt;
    for(const actor of api.actors){actor.mixer.update(dt);const root=actor.model.getObjectByName('Root');actor.shadow.material.opacity=1-T.MathUtils.clamp(root.position.y*1.5,0,.7);}
    render();
  }
  // Deterministic time controls are also used by the shipped audit script.
  Object.assign(api,{render,step,setClip,setDay,setView,setPaused,resize,seek:(name,t)=>{setClip(name);for(const a of api.actors){a.actions[name].time=0;a.mixer.update(0);}step(t);},setManual:value=>{state.manual=value;}});
  for(const [i,actor]of api.actors.entries()){
    const button=document.createElement('button');button.dataset.boar=actor.id;button.style.setProperty('--color',actor.spec.color);button.textContent=actor.spec.name[0];button.title=actor.spec.name+' — '+actor.spec.personality;button.setAttribute('aria-label','מבט מקרוב על '+actor.spec.name);button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>setView('studio',actor.id));$('characters').append(button);
  }
  document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>setDay(b.dataset.day)));
  document.querySelectorAll('[data-clip]').forEach(b=>b.addEventListener('click',()=>setClip(b.dataset.clip)));
  $('view-world').addEventListener('click',()=>setView('world'));$('view-studio').addEventListener('click',()=>setView('studio'));
  $('pause').addEventListener('click',()=>setPaused(!state.paused));$('reset').addEventListener('click',()=>{state.yaw=0;state.pitch=0;state.zoom=1;resize();});
  let pointer=null;canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;state.yaw-=(e.clientX-pointer.x)*.008;state.pitch-=(e.clientY-pointer.y)*.005;pointer.x=e.clientX;pointer.y=e.clientY;updateCamera();});
  const release=()=>pointer=null;canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=T.MathUtils.clamp(state.zoom*Math.exp(e.deltaY*.001),.6,1.6);resize();},{passive:false});
  document.addEventListener('keydown',e=>{if(e.target.tagName==='BUTTON')return;if(e.code==='Space'){e.preventDefault();setPaused(!state.paused);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){state.yaw+=e.key==='ArrowLeft'?.1:-.1;updateCamera();}});
  window.addEventListener('resize',resize);
  setDay('morning');setClip('walk');setView('world');setPaused(reduced);$('loading').hidden=true;state.ready=true;
  let last=performance.now(),accumulator=0;
  function tick(now){
    requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.1);last=now;
    if(state.paused||state.manual||document.hidden){accumulator=0;return;}
    accumulator+=dt;if(accumulator>=1/30){const stepSize=Math.floor(accumulator*30)/30;accumulator-=stepSize;step(stepSize);}
  }
  requestAnimationFrame(tick);return api;
})();
api.ready=ready;
ready.catch(error=>{api.error=String(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent='לא הצלחנו לפתוח את האחו. יש להגיש את התיקייה דרך שרת מקומי בדפדפן שתומך בתלת־ממד.';console.error(error);});
