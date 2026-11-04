/* Ready-to-open local preview. No network, module import, runtime build or CDN. */
(async()=>{
'use strict';
const {THREE:T,GLTFLoader,DRACOLoader}=TennisEngine;
const $=s=>document.querySelector(s),canvas=$('#court'),stage=$('.stage');
const config=window.TENNIS_CONFIG,actors=[],crowds=[],seatMeshes=[];
let lowSeats;
const params=new URLSearchParams(location.search);
const state={surface:params.get('surface')||'hard',light:params.get('light')||'day',view:params.get('view')||'wide',
 actor:Number(params.get('actor')||0),motion:params.get('motion')||'serve',focus:params.get('focus')||'body',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,
 quality:'balanced',autoQuality:true,time:0,orbit:0,zoom:1,ready:false};
const labels={hard:'קשיח',clay:'חימר',grass:'דשא',day:'אור יום',evening:'אור ערב',wide:'שידור',close:'תקריב',roster:'סגל',line:'על הקו',net:'רשת'};
const errors=[],frameSamples=[],requestLog=[];
let renderer,scene,camera,keyLight,fillLight,hemi,ball,ballHalo,ballShadow,landing,net,venue,crew,netShadow,courts={},lastFrame=0,lastAnimation=0,hiddenPlaying=false;
const floodGlows=[];
let width=1,height=1,renderCount=0,presentedFrames=0,animationSeconds=0,currentActionDuration=3.2,adaptiveFrames=0,manualPose=true,slowFrames=0;
const economyMaterials=new Map();
let lastShadowStats={calls:0,triangles:0};
const color=c=>new T.Color(c),V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
try{
 renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.info.autoReset=false;
 const renderShadows=renderer.shadowMap.render.bind(renderer.shadowMap);
 renderer.shadowMap.render=(...args)=>{const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;renderShadows(...args);lastShadowStats={calls:renderer.info.render.calls-calls,triangles:renderer.info.render.triangles-triangles};};
 scene=new T.Scene();scene.background=color('#E7E5D7');scene.fog=new T.Fog('#E7E5D7',60,135);
 camera=new T.PerspectiveCamera(40,1,.05,180);
 hemi=new T.HemisphereLight('#EEF4E9','#9E9A77',2.2);scene.add(hemi);
 keyLight=new T.DirectionalLight('#FFF0D4',3.2);keyLight.position.set(-13,22,9);keyLight.castShadow=true;
 keyLight.shadow.mapSize.set(1024,1024);Object.assign(keyLight.shadow.camera,{left:-23,right:23,top:27,bottom:-27,near:1,far:80});
 keyLight.shadow.bias=-.00022;keyLight.shadow.normalBias=.025;keyLight.shadow.radius=2;scene.add(keyLight);scene.add(keyLight.target);
 fillLight=new T.DirectionalLight('#B7D8DD',.5);fillLight.position.set(13,8,-12);scene.add(fillLight);
 const ground=new T.Mesh(new T.PlaneGeometry(500,500),new T.MeshStandardMaterial({color:'#DBDDC8',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.82;ground.receiveShadow=true;scene.add(ground);
 const draco=new DRACOLoader();draco.setDecoderConfig({type:'js'});draco.setWorkerLimit(2);
 draco._loadLibrary=async name=>{if(name!=='draco_decoder.js')throw Error('Unexpected decoder request '+name);return window.TENNIS_DRACO_SOURCE;};
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const ids=config.assets.map(a=>a.file.split('/').pop().replace('.glb',''));
 await Promise.all(ids.map(id=>window.TENNIS_BYTES[id]?Promise.resolve():new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='offline/'+id+'.js';script.onload=resolve;script.onerror=()=>reject(Error('Missing local asset '+id));document.head.append(script);
 })));
 function load(id){
  const binary=atob(window.TENNIS_BYTES[id]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Promise((resolve,reject)=>loader.parse(bytes.buffer,'',resolve,reject));
 }
 const loaded=await Promise.all(ids.map(async id=>[id,await load(id)]));const models=Object.fromEntries(loaded);
 delete window.TENNIS_BYTES;
 function prepare(group,cast=true){group.traverse(o=>{if(o.isMesh){o.castShadow=cast;o.receiveShadow=true;if(o.material?.map)o.material.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}});return group;}
 for(const kind of ['hard','clay','grass']){courts[kind]=prepare(models['court-'+kind].scene,false);scene.add(courts[kind]);}
 venue=prepare(models.venue.scene);scene.add(venue);crew=prepare(models.crew.scene);scene.add(crew);
 for(const g of [venue,crew])g.traverse(o=>{if(o.isMesh)o.userData.economyFlatBackground=true;});
 net=prepare(models.net.scene);scene.add(net);
 // Low-cost soft projection of the woven net onto the ground, aligned to the
 // key light. This keeps millimetre cords visible below shadow-map texel size.
 const weaveCanvas=document.createElement('canvas');weaveCanvas.width=512;weaveCanvas.height=512;
 const wc=weaveCanvas.getContext('2d');wc.strokeStyle='rgba(18,33,23,.85)';wc.lineWidth=1.3;
 for(let i=0;i<512;i+=32){wc.beginPath();wc.moveTo(i,0);wc.lineTo(i,512);wc.stroke();wc.beginPath();wc.moveTo(0,i);wc.lineTo(512,i);wc.stroke();}
 const weave=new T.CanvasTexture(weaveCanvas);weave.wrapS=weave.wrapT=T.RepeatWrapping;
 netShadow=new T.Mesh(new T.PlaneGeometry(1,1,64,8),new T.MeshBasicMaterial({map:weave,transparent:true,opacity:.65,depthWrite:false,side:T.DoubleSide}));netShadow.renderOrder=2;scene.add(netShadow);
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const gc=glowCanvas.getContext('2d'),gg=gc.createRadialGradient(32,32,0,32,32,32);gg.addColorStop(0,'rgba(255,228,170,.9)');gg.addColorStop(.15,'rgba(255,219,157,.38)');gg.addColorStop(1,'rgba(255,217,151,0)');gc.fillStyle=gg;gc.fillRect(0,0,64,64);
 const glowMap=new T.CanvasTexture(glowCanvas);
 for(const x of [-10.3,10.3])for(const z of [-17,17]){const sprite=new T.Sprite(new T.SpriteMaterial({map:glowMap,color:'#FFE0AD',transparent:true,depthWrite:false,blending:T.AdditiveBlending}));sprite.position.set(x,9.1,z);sprite.scale.set(3,1.5,1);scene.add(sprite);floodGlows.push(sprite);}
 for(const [i,id] of ['man-01','man-02','woman-01','woman-02'].entries()){
  const g=models[id],group=prepare(g.scene);const mixer=new T.AnimationMixer(group);const actions={};
  for(const clip of g.animations)actions[clip.name]=mixer.clipAction(clip);
  const meta=config.assets.find(a=>a.file==='models/'+id+'.glb');
  actors.push({id,group,mixer,actions,meta,lod0:group.getObjectByName('Body_LOD0'),lod1:group.getObjectByName('Body_LOD1'),lod2:group.getObjectByName('Body_LOD2'),racket0:group.getObjectByName('Racket_RightHand'),racket1:group.getObjectByName('Racket_LOD1'),bones:Object.fromEntries(config.rig.joints.map(j=>[j.name,group.getObjectByName(j.name)])),active:null});scene.add(group);
 }
 const proto=models['crowd-prototypes'].scene;
 // A single instanced draw per crowd LOD/pose. Uniform tint varies clothes while
 // source vertex colors preserve the original face, hair and trousers.
 const palette=['#E8E2CA','#8BA290','#BD8A6A','#53746E','#C9B783','#8E9CAC','#C5B7A3','#728273'];
 function makeCrowd(name,entries,economy=false){
  const source=proto.getObjectByName(name);let sourceMesh=source?.isMesh?source:null;if(!sourceMesh)source?.traverse(o=>{if(o.isMesh)sourceMesh=o;});
  const geometry=sourceMesh.geometry.clone(),mat=sourceMesh.material.clone();
  const tints=new Float32Array(entries.length*3),phases=new Float32Array(entries.length);
  for(let i=0;i<entries.length;i++){color(palette[entries[i].id%palette.length]).toArray(tints,i*3);phases[i]=entries[i].id*.713;}
  geometry.setAttribute('instanceTint',new T.InstancedBufferAttribute(tints,3));geometry.setAttribute('instancePhase',new T.InstancedBufferAttribute(phases,1));
  mat.onBeforeCompile=shader=>{
   shader.uniforms.crowdTime={value:0};mat.userData.shader=shader;
   shader.vertexShader='attribute vec3 instanceTint; attribute float instancePhase; uniform float crowdTime;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nfloat clothMask = step(0.63, position.y) * (1.0-step(1.10, position.y));\nvColor.xyz *= mix(vec3(1.0), instanceTint, clothMask);');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(crowdTime*1.1+instancePhase)*0.018*smoothstep(0.48,1.0,position.y);');
  };
  const mesh=new T.InstancedMesh(geometry,mat,entries.length);mesh.name=economy?'Crowd_Economy':name;mesh.frustumCulled=false;mesh.userData.economyFlatBackground=true;
  const matrix=new T.Matrix4();for(let i=0;i<entries.length;i++){
   const e=entries[i];matrix.compose(V(...e.position),new T.Quaternion().setFromAxisAngle(V(0,1,0),e.yaw),V(.91,.91,.91));mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);crowds.push({mesh,entries,name:mesh.name});
 }
 const entries=config.layout.instances;
 makeCrowd('Crowd_LOD0',entries.filter(e=>e.row<1&&e.id%11!==0));
 makeCrowd('Crowd_Cheer',entries.filter(e=>e.row<1&&e.id%11===0));
 makeCrowd('Crowd_LOD1',entries.filter(e=>e.row>=1));
 makeCrowd('Crowd_LOD1',entries,true);
 // Two reusable seat geometries, all seats instanced. Gaps are intentional aisles.
 for(const [size,offset] of [[[.54,.09,.53],[0,.49,.02]],[[.54,.49,.065],[0,.72,-.23]]]){
  const mesh=new T.InstancedMesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color:'#4B6B56',roughness:.78}),entries.length);
  const m=new T.Matrix4(),q=new T.Quaternion();
  for(let i=0;i<entries.length;i++){const e=entries[i];q.setFromAxisAngle(V(0,1,0),e.yaw);const p=V(...offset).applyQuaternion(q).add(V(...e.position));m.compose(p,q,V(1,1,1));mesh.setMatrixAt(i,m);}
  mesh.userData.economyFlatBackground=true;scene.add(mesh);seatMeshes.push(mesh);
 }
 const seatPoints=[[-.27,.49,.28],[.27,.49,.28],[.27,.49,-.23],[-.27,.49,-.23],[-.27,.49,-.23],[.27,.49,-.23],[.27,.97,-.23],[-.27,.97,-.23]];
 const seatGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(seatPoints.flat(),3)).setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);seatGeometry.computeVertexNormals();
 lowSeats=new T.InstancedMesh(seatGeometry,new T.MeshStandardMaterial({color:'#4B6B56',roughness:.78,side:T.DoubleSide}),entries.length);lowSeats.userData.economyFlatBackground=true;
 for(let i=0;i<entries.length;i++){const e=entries[i];lowSeats.setMatrixAt(i,new T.Matrix4().compose(V(...e.position),new T.Quaternion().setFromAxisAngle(V(0,1,0),e.yaw),V(1,1,1)));}scene.add(lowSeats);
 ball=prepare(models.ball.scene);scene.add(ball);
 ball.traverse(o=>{if(o.isMesh&&o.material.name.toLowerCase().includes('felt')){o.material.emissive.set('#ABC43E');o.material.emissiveIntensity=.13;}});
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;const ctx=shadowCanvas.getContext('2d'),grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(23,38,24,.50)');grad.addColorStop(.4,'rgba(23,38,24,.21)');grad.addColorStop(1,'rgba(23,38,24,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
 ballShadow=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;ballShadow.renderOrder=3;scene.add(ballShadow);
 const contactTexture=ballShadow.material.map;
 for(const a of actors){const shadow=new T.Mesh(new T.PlaneGeometry(.80,.49),new T.MeshBasicMaterial({map:contactTexture,transparent:true,opacity:.48,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.028,.03);shadow.renderOrder=2;shadow.userData.contactShadow=true;a.group.add(shadow);a.contactShadow=shadow;}
 ballHalo=new T.Sprite(new T.SpriteMaterial({map:glowMap,color:'#CADA68',transparent:true,opacity:.35,depthWrite:false}));scene.add(ballHalo);
 landing=new T.Group();const ring=new T.Mesh(new T.RingGeometry(.092,.112,40),new T.MeshBasicMaterial({color:'#EEF1B2',side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));ring.rotation.x=-Math.PI/2;landing.add(ring);
 const dot=new T.Mesh(new T.CircleGeometry(.025,24),new T.MeshBasicMaterial({color:'#DBDC8E',depthWrite:false}));dot.rotation.x=-Math.PI/2;landing.add(dot);landing.position.set(4.115,.035,-6.4);scene.add(landing);
 // A low transparent dust ribbon appears only during the braking portion on clay.
 const dust=new T.Group();scene.add(dust);
 for(let i=0;i<7;i++){
  const d=new T.Mesh(new T.SphereGeometry(.08,8,5),new T.MeshBasicMaterial({color:'#D49D6F',transparent:true,opacity:.14,depthWrite:false}));d.scale.set(1.7,.3,1);d.position.set(-.2-i*.13,.05,.12+Math.sin(i)*.08);dust.add(d);
 }
 window.TENNIS_DEBUG_DUST=dust;
 function clipDef(){return config.motions.clips.find(c=>c.id===state.motion);}
 function assignActions(){
  const def=clipDef();currentActionDuration=def.duration;
  actors.forEach((a,i)=>{
   a.mixer.stopAllAction();const id=(state.view==='roster'||state.view==='close'||i===state.actor)?state.motion:'idle';
   const action=a.actions[id];action.enabled=true;action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.reset().play();a.active=action;
  });
 }
 function layoutActors(){
  const match=[[-2.35,0,10.1,Math.PI],[2.35,0,-10.1,0],[2.35,0,9.4,Math.PI],[-2.35,0,-9.4,0]];
  actors.forEach((a,i)=>{
   a.group.visible=state.view==='close'?i===state.actor:!['line','net'].includes(state.view);
   if(state.view==='close'){a.group.position.set(0,0,3.5);a.group.rotation.y=0;}
   else if(state.view==='roster'){a.group.position.set((i-1.5)*1.45,0,3.5);a.group.rotation.y=.13;}
   else{const p=match[i];a.group.position.set(p[0],p[1],p[2]);a.group.rotation.y=p[3];}
   a.basePosition=a.group.position.clone();
  });
  manualPose=true;
 }
 function setLight(){
  const night=state.light==='evening';stage.classList.toggle('dark',night);
  scene.background.set(night?'#53666A':'#E7E5D7');scene.fog.color.copy(scene.background);
  keyLight.color.set(night?'#FFD4A2':'#FFF0D4');keyLight.intensity=night?1.7:2.7;
  keyLight.position.set(night?-10.3:-13,night?9.1:22,night?-17:9);
  hemi.color.set(night?'#A9C3D3':'#EEF4E9');hemi.groundColor.set(night?'#6D7569':'#9E9A77');hemi.intensity=night?.70:1.35;
  ground.material.color.set(night?'#384F50':'#DBDDC8');
  for(const s of floodGlows)s.visible=night;
  const p=netShadow.geometry.attributes.position,uv=netShadow.geometry.attributes.uv;
  for(let row=0;row<=8;row++)for(let c=0;c<=64;c++){
   const i=row*65+c,x=-6.4+c/64*12.8,y=.035+(.914+.156*(x/6.4)**2-.07)*row/8;
   p.setXYZ(i,x-keyLight.position.x/keyLight.position.y*y,.032,-keyLight.position.z/keyLight.position.y*y);uv.setXY(i,c/64*18,row/8*1.28);
  }
  p.needsUpdate=true;uv.needsUpdate=true;netShadow.geometry.computeBoundingSphere();
  fillLight.color.set(night?'#A8D1EB':'#B7D8DD');fillLight.intensity=night?1.1:.5;
  renderer.toneMappingExposure=night?1.0:1.10;
  for(const [original,m] of economyMaterials)if(m.isMeshBasicMaterial&&m.userData.flatBackdrop)m.color.copy(original.color).multiplyScalar(night?.85:1.65);
  renderer.shadowMap.needsUpdate=true;
  venue.traverse(o=>{if(o.isMesh&&o.material?.name==='Floodlight glass'){o.material.emissive.set(night?'#FFE1AE':'#000000');o.material.emissiveIntensity=night?3:0;}});
  $('#lighting').classList.toggle('evening',night);$('#lighting').setAttribute('aria-label',night?'החלפה לתאורת יום':'החלפה לתאורת ערב');
 }
 function fitCamera(){
  const aspect=width/height;camera.aspect=aspect;
  let target=V(),direction=V(1,1,1),distance=30,fov=40;
  if(state.view==='wide'){
   target.set(0,.2,-1);direction.set(.38,.78,1);distance=aspect<1?57:44;fov=aspect<1?38:42;
  }else if(state.view==='close'){
   const overhead=['serve','smash'].includes(state.motion);
   target.set(-.08+(actors[state.actor]?.group.position.x??0),overhead?1.30:1.0,3.55);direction.set(-.30,.12,1);distance=overhead?5.35:aspect<1?4.6:4.4;fov=aspect<1?37:34;
  }else if(state.view==='roster'){
   target.set(0,.90,3.5);direction.set(.08,.14,1);distance=(aspect<1?12.4:8.5);fov=36;
  }else if(state.view==='line'){
   target.set(4.115,.04,-6.4);direction.set(.75,.60,1);distance=aspect<1?3.6:4.3;fov=38;
  }else{
   target.set(2,.9,0);direction.set(.7,.37,1);distance=aspect<1?15:18;fov=40;
  }
  direction.normalize().applyAxisAngle(V(0,1,0),state.orbit);camera.fov=fov;camera.position.copy(target).addScaledVector(direction,distance*state.zoom);camera.lookAt(target);camera.updateProjectionMatrix();
  updateLOD();
 }
 function updateLOD(){
  const far=['wide','roster'].includes(state.view);actors.forEach(a=>{
   const lod=state.quality==='economy'||far,tiny=state.quality==='economy'&&far&&a.lod2;
   a.lod0.visible=!lod;a.lod1.visible=lod&&!tiny;if(a.lod2)a.lod2.visible=!!tiny;
   if(a.racket1){a.racket0.visible=!lod;a.racket1.visible=lod;}
   const dynamic=state.view==='close'&&state.focus==='body'&&state.quality!=='economy';
   a.group.traverse(o=>{if(o.isMesh&&!o.userData.contactShadow)o.castShadow=dynamic;});
   if(a.contactShadow)a.contactShadow.visible=!dynamic;
  });
  const environment=state.view!=='line',audience=environment&&!(state.view==='close'&&state.focus!=='body');
  crowds.forEach(c=>{c.mesh.visible=audience&&(state.quality==='economy'?c.name==='Crowd_Economy':c.name!=='Crowd_Economy');});
  for(const s of seatMeshes)s.visible=audience&&state.quality!=='economy';if(lowSeats)lowSeats.visible=audience&&state.quality==='economy';venue.visible=environment;crew.visible=audience;
  renderer.shadowMap.needsUpdate=true;
 }
 function syncUI(){
  document.body.dataset.view=state.view;document.body.dataset.focus=state.focus;$('#motion').value=state.motion;
  for(const b of document.querySelectorAll('[data-surface]')){const active=b.dataset.surface===state.surface;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
  for(const b of document.querySelectorAll('button[data-view]')){const active=b.dataset.view===state.view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
  for(const b of document.querySelectorAll('[data-actor]')){const active=Number(b.dataset.actor)===state.actor;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
  $('#roster-select').hidden=!['close','roster'].includes(state.view);
  $('#focus-switch').hidden=state.view!=='close';
  for(const b of document.querySelectorAll('button[data-focus]')){const active=b.dataset.focus===state.focus;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
  $('#surface-label').textContent=labels[state.surface];$('#light-label').textContent=labels[state.light];$('#view-label').textContent=labels[state.view];
  const captions={wide:['01 / CENTRE COURT','הנקודה הבאה.'],close:['02 / PLAYER STUDY','כל תנועה נחשבת.'],roster:['03 / FOUR ORIGINAL ATHLETES','ארבעה. משחק אחד.'],line:['04 / LINE CALL','מילימטרים של משחק.'],net:['05 / NET & OFFICIALS','בגובה הרשת.']};
  $('#view-kicker').textContent=captions[state.view][0];$('#view-title').textContent=captions[state.view][1];
  $('#line-call').hidden=state.view!=='line';$('#phase').hidden=state.motion!=='serve'||state.view!=='close'||state.focus!=='body';
  $('#phase').innerHTML=['הכנה','זריקה','העמסה','פגיעה ומעקב'].map(t=>'<span>'+t+'</span>').join('');
  $('#play').setAttribute('aria-label',state.playing?'השהיית תנועה':'ניגון תנועה');$('#play').innerHTML=state.playing?'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>':'<svg viewBox="0 0 24 24"><path d="m8 5 10 7-10 7Z"/></svg>';
  for(const [key,group] of Object.entries(courts))group.visible=key===state.surface;
 }
 function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);renderer.setSize(width,height,false);fitCamera();if(state.ready)renderAt(state.time);}
 function applyQuality(){
  const economical=state.quality==='economy';
  scene.traverse(o=>{
   if(!o.isMesh||Array.isArray(o.material))return;
   const original=o.userData.originalPBR??o.material;if(!original.isMeshStandardMaterial)return;
   o.userData.originalPBR=original;
   if(economical){
    if(!economyMaterials.has(original)){
     const flat=o.userData.economyFlatBackground&&original.name!=='Floodlight glass';
     const common={color:original.color,map:original.map,vertexColors:original.vertexColors,side:original.side,transparent:original.transparent,opacity:original.opacity,alphaTest:original.alphaTest};
     const m=flat?new T.MeshBasicMaterial(common):new T.MeshLambertMaterial({...common,emissive:original.emissive,emissiveIntensity:original.emissiveIntensity});
     m.name=original.name;m.userData={...original.userData,flatBackdrop:!!flat};
     m.onBeforeCompile=shader=>{const oldShader=original.userData.shader;original.onBeforeCompile(shader);m.userData.shader=shader;original.userData.shader=oldShader;
      if(flat)shader.vertexShader=shader.vertexShader.replace('transformed.x += sin(crowdTime*1.1+instancePhase)*0.018*smoothstep(0.48,1.0,position.y);','');};
     m.customProgramCacheKey=()=>original.uuid+':economy:'+flat;economyMaterials.set(original,m);
    }
    o.material=economyMaterials.get(original);
   }else o.material=original;
  });
  renderer.setPixelRatio(economical?1:Math.min(devicePixelRatio,1.4));renderer.shadowMap.enabled=!economical;
  $('#quality').innerHTML=economical?'▤':'▥';$('#quality-label').textContent='איכות '+(economical?'חסכונית':'מאוזנת');$('#quality').setAttribute('aria-label',$('#quality-label').textContent);
  updateLOD();setLight();
 }
 function setState(patch){
  const layoutChange=patch.view!==undefined||patch.actor!==undefined,actionChange=layoutChange||patch.motion!==undefined;
  Object.assign(state,patch);if(layoutChange){layoutActors();state.orbit=0;state.zoom=1;}
  if(patch.focus!==undefined){state.orbit=0;state.zoom=1;updateLOD();}
  if(actionChange){assignActions();state.time=patch.time??0;manualPose=true;}
  if(patch.light!==undefined)setLight();
  if(patch.quality!==undefined){applyQuality();slowFrames=0;}
  syncUI();resize();renderAt(state.time);return {...state};
 }
 function applyAnimation(time){
  for(let i=0;i<actors.length;i++){
   const a=actors[i],duration=a.active.getClip().duration;
   if(a.basePosition)a.group.position.copy(a.basePosition);
   if(state.motion==='slide'&&i===state.actor&&state.view!=='roster')a.group.position.x-=.85*Math.sin(Math.PI*time/currentActionDuration)**2;
   a.active.time=Math.min(duration-.000001,a.active.getClip().name==='idle'?time%duration:time);a.mixer.update(0);
  }
  scene.updateMatrixWorld(true);
 }
 function positionBall(time){
  const actor=actors[state.actor],def=clipDef(),u=time/def.duration;
  const hand=actor.bones.RightHand,grip=V(-.045,.44,-.014).applyMatrix4(hand.matrixWorld);
  const contact=def.events.find(e=>e.name==='contact')?.time??.52;
  let p;
  if(state.view==='line'){
   const phase=time/def.duration;p=V(4.115,.067+Math.abs(Math.sin(phase*Math.PI*2))*.32,-6.4);
  }else if(state.motion==='serve'&&u<contact){
   const left=actor.bones.LeftHand.getWorldPosition(V());
   if(u<.28)p=left.add(V(0,.05,.01));
   else{
    const f=Math.min(1,(u-.28)/(contact-.28));const cp=V(...def.contactSweetSpot).applyMatrix4(actor.group.matrixWorld);
    const start=V(.17,1.59,.30).applyMatrix4(actor.group.matrixWorld);p=start.lerp(cp,f);p.y+=Math.sin(f*Math.PI)*.75;
   }
  }else if(u<contact+.02){
   p=grip.clone().add(V(0,.006,.035));
  }else{
   const f=Math.min(1,(u-contact)/(.94-contact));
   const start=def.contactSweetSpot?V(...def.contactSweetSpot).applyMatrix4(actor.group.matrixWorld):grip;
   const end=state.view==='wide'?V(4.115,.067,-6.4):V(2.1,.067,3.1);
   p=start.clone().lerp(end,f);p.y+=Math.sin(f*Math.PI)*.6;
  }
  if(['idle','run','celebrate'].includes(state.motion)&&state.view!=='line')p=V(.08,.055,.08).applyMatrix4(actor.group.matrixWorld);
  ball.position.copy(p);ball.rotation.set(time*5,time*7,0);ball.scale.setScalar(state.view==='wide'?1.55:1.0);
  ballHalo.visible=state.view==='wide';ballHalo.position.copy(p);
  const haloSize=camera.position.distanceTo(p)*2*Math.tan(T.MathUtils.degToRad(camera.fov*.5))*5/height;ballHalo.scale.set(haloSize,haloSize,1);
  const s=.13+Math.min(2.5,p.y)*.033;ballShadow.position.set(p.x,.031,p.z);ballShadow.scale.set(s,s,1);ballShadow.material.opacity=Math.max(.28,1-p.y*.20);
  landing.visible=['wide','line'].includes(state.view);landing.scale.setScalar(state.view==='wide'?1.2:1);
  dust.visible=state.surface==='clay'&&state.motion==='slide'&&u>.22&&u<.83;
  dust.position.copy(actor.group.position);dust.rotation.y=actor.group.rotation.y;
 }
 function renderAt(time){
  state.time=Math.max(0,Math.min(currentActionDuration,time));applyAnimation(state.time);positionBall(state.time);
  if(state.view==='close'&&state.focus==='body'&&state.motion==='slide')fitCamera();
  if(state.view==='close'&&state.focus!=='body'){
   const a=actors[state.actor],isFace=state.focus==='face',bone=isFace?a.bones.Head:a.bones.RightHand,q=bone.getWorldQuaternion(new T.Quaternion());
   const target=V(...(isFace?[0,.068,.045]:[-.045,.035,-.014])).applyMatrix4(bone.matrixWorld);
   const direction=(isFace?V(-.15,.03,1):V(.25,.15,1).applyQuaternion(q)).normalize().applyAxisAngle(V(0,1,0),state.orbit);
   camera.fov=isFace?35:32;camera.position.copy(target).addScaledVector(direction,(isFace?.9:1.05)*state.zoom);camera.lookAt(target);camera.updateProjectionMatrix();
  }
  for(const c of crowds)if(c.mesh.material.userData.shader)c.mesh.material.userData.shader.uniforms.crowdTime.value=state.playing?lastAnimation*.001:state.time;
  $('#time').value=String(state.time/currentActionDuration);$('#time-label').textContent=state.time.toFixed(2)+' / '+currentActionDuration.toFixed(2);
  const phaseIndex=state.time/currentActionDuration<.28?0:state.time/currentActionDuration<.48?1:state.time/currentActionDuration<.64?2:3;
  for(const [i,s] of [...$('#phase').children].entries())s.classList.toggle('active',i===phaseIndex);
  renderer.shadowMap.autoUpdate=state.view==='close'&&state.focus==='body';
  renderer.info.reset();lastShadowStats={calls:0,triangles:0};renderer.render(scene,camera);renderCount++;
 }
 function diagnostics(){
  let visibleActors=0,bodyTriangles=0;for(const a of actors)if(a.group.visible){visibleActors++;const level=a.lod0.visible?0:a.lod1.visible?1:2;bodyTriangles+=a.meta.LODs[level].triangles+(a.racket1?.visible?a.meta.racketLODs[1].triangles:a.meta.racketTriangles);}
  return {state:{...state},threeRevision:T.REVISION,viewport:{width:innerWidth,height:innerHeight},stage:{width,height},pixelRatio:renderer.getPixelRatio(),
   render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    main:{calls:renderer.info.render.calls-lastShadowStats.calls,triangles:renderer.info.render.triangles-lastShadowStats.triangles},shadow:{...lastShadowStats},
    textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries},
   crowd:{total:config.layout.count,visible:crowds.filter(c=>c.mesh.visible).reduce((s,c)=>s+c.entries.length,0),instancedDraws:crowds.filter(c=>c.mesh.visible).length,seatDraws:seatMeshes.filter(s=>s.visible).length+(lowSeats?.visible?1:0)},
   actors:{visible:visibleActors,bodyAndRacketTriangles:bodyTriangles,canonicalBones:18},ball:ball.position.toArray(),landing:landing.position.toArray(),errors:[...errors],renderCount};
 }
 window.tennis={setState,seek:(seconds)=>{state.playing=false;manualPose=true;state.time=seconds;syncUI();renderAt(seconds);return diagnostics();},
  diagnostics,ready:true,config,scene,camera,renderer,actors,
  async measure(seconds=10){
   const start=performance.now(),first=presentedFrames,simulationStart=animationSeconds;const samples=[];let previous=start;
   while(performance.now()-start<seconds*1000){await new Promise(r=>requestAnimationFrame(r));if(presentedFrames!==first+samples.length){const now=performance.now();samples.push(now-previous);previous=now;}}
   const sorted=[...samples].sort((a,b)=>a-b),pick=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;
   const tail=samples.slice(-300),tailSeconds=tail.reduce((s,v)=>s+v,0)/1000;
   return {seconds:(performance.now()-start)/1000,simulatedSecondsAdvanced:animationSeconds-simulationStart,approximateCycles:(animationSeconds-simulationStart)/currentActionDuration,
    frames:presentedFrames-first,fps:(presentedFrames-first)/((performance.now()-start)/1000),frameMs:{p50:pick(.5),p95:pick(.95),max:sorted.at(-1)},
    tailWindow:{frames:tail.length,seconds:tailSeconds,fps:tailSeconds?tail.length/tailSeconds:0},diagnostics:diagnostics()};
  }};
 function tick(now){
  requestAnimationFrame(tick);if(document.hidden)return;
  if(!state.playing){lastAnimation=now;return;}
  if(now-lastFrame<1000/30-.7)return;
  const dt=Math.max(0,(now-lastAnimation)/1000);lastAnimation=now;lastFrame=now;
  if(state.playing){state.time+=dt;animationSeconds+=dt;if(state.time>currentActionDuration)state.time%=currentActionDuration;}
  const start=performance.now();
  renderAt(state.time);
  presentedFrames++;
  const cost=performance.now()-start;
  // GPU stalls can slow requestAnimationFrame while renderer.render() submits
  // quickly. Judge actual displayed cadence as well as CPU submission cost.
  slowFrames=Math.max(0,slowFrames+(cost>28||dt*1000>38.5?1:-2));
  if(state.autoQuality&&slowFrames>=18){
   if(state.quality==='balanced')setState({quality:'economy'});
   else if(renderer.getPixelRatio()>.72){renderer.setPixelRatio(Math.max(.7,renderer.getPixelRatio()*.85));slowFrames=0;resize();}
  }
 }
 for(const b of document.querySelectorAll('[data-surface]'))b.addEventListener('click',()=>setState({surface:b.dataset.surface}));
 for(const b of document.querySelectorAll('button[data-view]'))b.addEventListener('click',()=>setState({view:b.dataset.view}));
 for(const b of document.querySelectorAll('[data-actor]'))b.addEventListener('click',()=>setState({actor:Number(b.dataset.actor)}));
 for(const b of document.querySelectorAll('button[data-focus]'))b.addEventListener('click',()=>setState({focus:b.dataset.focus,playing:false}));
 $('#lighting').addEventListener('click',()=>setState({light:state.light==='day'?'evening':'day'}));
 $('#quality').addEventListener('click',()=>{setState({quality:state.quality==='balanced'?'economy':'balanced',autoQuality:false});});
 $('#motion').addEventListener('change',()=>setState({motion:$('#motion').value}));
 $('#play').addEventListener('click',()=>{state.playing=!state.playing;syncUI();});
 $('#time').addEventListener('input',()=>window.tennis.seek(Number($('#time').value)*currentActionDuration));
 $('#reset-camera').addEventListener('click',()=>{state.orbit=0;state.zoom=1;fitCamera();renderAt(state.time);});
 const pointers=new Map();let startX=0,startOrbit=0,pinch=0,startZoom=1;
 canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);startX=e.clientX;startOrbit=state.orbit;
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);startZoom=state.zoom;}});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1)state.orbit=startOrbit+(e.clientX-startX)*.006;
  else{const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);state.zoom=T.MathUtils.clamp(startZoom*pinch/Math.max(1,distance),.55,1.8);}
  fitCamera();renderAt(state.time);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>pointers.delete(e.pointerId));
 canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=T.MathUtils.clamp(state.zoom*Math.exp(e.deltaY*.001),.55,1.8);fitCamera();renderAt(state.time);},{passive:false});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','+','-','Home',' '].includes(e.key))e.preventDefault();
  if(e.key==='ArrowLeft')state.orbit-=.12;if(e.key==='ArrowRight')state.orbit+=.12;if(e.key==='+')state.zoom*=.92;if(e.key==='-')state.zoom*=1.08;
  if(e.key==='Home'){state.orbit=0;state.zoom=1;}if(e.key===' '){state.playing=!state.playing;syncUI();}fitCamera();renderAt(state.time);});
 new ResizeObserver(resize).observe(stage);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenPlaying=state.playing;state.playing=false;}else{state.playing=hiddenPlaying;lastAnimation=performance.now();syncUI();}});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();state.playing=false;$('#error').textContent='התצוגה נעצרה. משחזרים את המגרש…';$('#error').hidden=false;});
 canvas.addEventListener('webglcontextrestored',()=>{$('#error').hidden=true;resize();renderAt(state.time);});
 assignActions();layoutActors();syncUI();setLight();resize();state.ready=true;
 const initial=params.has('time')?Number(params.get('time')):1.64;if(params.has('time'))state.playing=false;
 renderAt(initial);$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').remove(),450);lastAnimation=performance.now();requestAnimationFrame(tick);
}catch(error){errors.push(String(error.stack||error));console.error(error);$('#error').textContent='לא ניתן להציג את המגרש. יש לוודא שכל קובצי התיקייה נמצאים יחד. '+error.message;$('#error').hidden=false;$('#loading').remove();window.tennis={ready:false,errors};}
})();
