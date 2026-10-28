/** Island Pro Basketball — 3D presentation. Reads interpolated engine snapshots and events;
 * it never decides points, possession or time. Broadcast side camera in landscape, a closer
 * half-court camera in portrait. Instant replay plays back recorded snapshots only. */
import * as THREE from '../vendor/three.module.js';
import {buildArena,drawDisplays} from './hoops-arena.mjs?v=island-naval-aim-20261028-1';
import {loadPlayerAssets,createAvatar} from './hoops-players.mjs?v=island-naval-aim-20261028-1';
import {ballTexture} from './hoops-textures.mjs?v=island-naval-aim-20261028-1';

const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function lerpAngle(a,b,t){const d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;}

export async function createHoopsView(canvas,config,{court,teams,quality=2,assetBase,insets,onProgress}){
 const V=config.view,mobile=/Android|iPhone|iPad|Mobile/i.test(globalThis.navigator?.userAgent||'');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:quality>=2,powerPreference:'high-performance',preserveDrawingBuffer:!!V.preserve});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=V.exposure;
 renderer.shadowMap.enabled=quality>=1;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x05060a);scene.fog=new THREE.Fog(0x05060a,38,80);
 const camera=new THREE.PerspectiveCamera(V.fov,1,0.1,200);
 const looks=teams.map(t=>t.look);
 const {root:arena,dyn}=buildArena(court,{home:looks[0],away:looks[1],quality,anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
 scene.add(arena);
 // environment reflections from a dim copy of the arena lights
 const pm=new THREE.PMREMGenerator(renderer);
 const envScene=new THREE.Scene();envScene.background=new THREE.Color(0x0b0d14);
 const lamp=new THREE.Mesh(new THREE.BoxGeometry(30,0.5,18),new THREE.MeshBasicMaterial({color:0xfff2dd}));lamp.position.y=12;envScene.add(lamp);
 for(const s of [1,-1]){const strip=new THREE.Mesh(new THREE.BoxGeometry(40,3,0.5),new THREE.MeshBasicMaterial({color:new THREE.Color(looks[0].primary).multiplyScalar(0.6)}));strip.position.set(0,3,s*16);envScene.add(strip);}
 scene.environment=pm.fromScene(envScene,0.02).texture;scene.environmentIntensity=V.envIntensity;

 // crowd: instanced sprites from the spectator atlas (or plain silhouettes if it fails)
 let crowd=null;
 try{crowd=await buildCrowd(dyn.crowdSpots,new URL(config.assets.crowd,assetBase).href,config.assets.crowdGrid,quality);scene.add(crowd.mesh);}catch(e){crowd=null;}

 const assets=await loadPlayerAssets(config.assets,assetBase,onProgress);
 const avatars=new Map();
 for(const t of teams)for(const card of t.players){const av=createAvatar(assets,card,t.look,{baseHeights:config.assets.baseHeights});av.root.visible=false;scene.add(av.root);avatars.set(card.id,av);}

 // the ball
 const ballMat=new THREE.MeshStandardMaterial({map:ballTexture(512),roughness:0.62,metalness:0});
 const ball=new THREE.Mesh(new THREE.SphereGeometry(court.ballR,32,20),ballMat);ball.castShadow=true;scene.add(ball);
 const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(court.ballR*1.2,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.35,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);
 // controlled-player ring and pass target marker
 const ringMat=new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.9,depthWrite:false});
 const ring=new THREE.Mesh(new THREE.RingGeometry(0.42,0.5,40),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.012;scene.add(ring);
 const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.09,0.22,3),ringMat);arrow.rotation.x=Math.PI;scene.add(arrow);

 const state={camX:0,camZ:0,shake:0,replay:null,lastFrameMs:16,frames:0,slow:0,landscape:true,w:1,h:1,portraitT:1,ballVis:null};
 const v=new THREE.Vector3(),v2=new THREE.Vector3();

 function resize(w,h,dpr){
  state.w=w;state.h=h;state.landscape=w>=h*1.05;
  const cap=mobile?V.mobileDprCap:V.dprCap;
  renderer.setPixelRatio(Math.min(dpr||1,cap));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }

 function cameraFor(s,dt){
  // follow the ball, leaning towards the basket the team with the ball attacks (broadcast framing)
 const b=s.ball,attack=s.possession===0||s.possession===1?s.dir[s.possession]:0;
 const lead=attack?clamp((attack*court.rimX-b.x)*(V.leadToRim??0.3),-(V.leadMax??4),V.leadMax??4):0;
 const focusX=clamp(b.x*V.followX+lead,-court.hx+V.edgeX,court.hx-V.edgeX);
  const k=state.snap?1:1-Math.exp(-dt*V.followRate);
  state.camX=lerp(state.camX,focusX,k);state.camZ=lerp(state.camZ,clamp(b.z*(V.followZ??0.2),-(V.maxZ??2),V.maxZ??2),k);
  if(state.landscape){
   camera.fov=V.fov;camera.position.set(state.camX,V.height,-(court.hz+V.distance)+state.camZ*(V.dollyZ??0));camera.lookAt(state.camX*0.98,V.lookY,state.camZ+V.lookZ);
  } else {
   // portrait: look along the court towards the active basket, from behind mid-court
   const s0=Math.sign(b.x||1)||1,cx=s0*(court.hx-6.2);
   state.pX=state.snap?cx:lerp(state.pX??cx,cx,k*0.6);
   camera.fov=V.portraitFov;camera.position.set(state.pX-s0*V.portraitBack,V.portraitHeight,-court.hz*0.35+state.camZ*0.3);
   camera.lookAt(state.pX+s0*2.4,V.lookY,state.camZ*0.5);
  }
  state.snap=false;
  if(state.shake>0){camera.position.y+=Math.sin(performance.now()*0.05)*state.shake*0.06;state.shake=Math.max(0,state.shake-dt*2);}
  camera.updateProjectionMatrix();
 }

 function playerInterp(a,b,alpha){
  if(!a)return b;
  return {...b,x:lerp(a.x,b.x,alpha),z:lerp(a.z,b.z,alpha),y:lerp(a.y,b.y,alpha),vx:lerp(a.vx,b.vx,alpha),vz:lerp(a.vz,b.vz,alpha),face:lerpAngle(a.face,b.face,alpha),actT:a.act===b.act?lerp(a.actT,b.actT,alpha):b.actT};
 }

 function render(prev,cur,alpha,dt){
  const s=state.replay?replayFrame(dt):cur,p0=state.replay?s:prev;
  const t0=performance.now();
  const prevById=new Map((p0?.players||[]).map(p=>[p.id,p]));
  const seen=new Set();
  const handler=s.players.find(p=>p.hasBall);
  for(const pp of s.players){
   const p=state.replay?pp:playerInterp(prevById.get(pp.id),pp,alpha);
   const av=avatars.get(p.id);if(!av)continue;seen.add(p.id);
   av.root.visible=true;av.root.position.set(p.x,p.y*0.85,p.z);av.root.rotation.y=p.face;
   const defending=s.possession!==p.team&&s.ball.state==='held';
   const contest=handler&&handler.team!==p.team&&handler.act==='shoot'&&Math.hypot(handler.x-p.x,handler.z-p.z)<1.8?1:0;
   av.pose(p,{defending,dribbling:s.phase==='live',airU:p.air?clamp((p.y)/(0.7),0,1):0,contest},Math.min(0.05,dt));
  }
  for(const [id,av] of avatars)if(!seen.has(id))av.root.visible=false;
  // ball: the engine position, but held/dribbled balls follow the hands of the clip
  const b=s.ball,pb=p0?.ball;
  let bx=pb&&!state.replay?lerp(pb.x,b.x,alpha):b.x,by=pb&&!state.replay?lerp(pb.y,b.y,alpha):b.y,bz=pb&&!state.replay?lerp(pb.z,b.z,alpha):b.z;
  if(b.state==='held'&&handler){
   const av=avatars.get(handler.id);av.root.updateMatrixWorld(true);
   const r=av.hands.r,l=av.hands.l;
   if(handler.act==='shoot'||!s.phase||s.phase!=='live'||Math.hypot(handler.vx,handler.vz)<0.05&&!handler.act&&false){
    r.getWorldPosition(v);l.getWorldPosition(v2);v.add(v2).multiplyScalar(0.5);
    const fx=Math.sin(handler.face),fz=Math.cos(handler.face);bx=v.x+fx*0.1;by=v.y+0.02;bz=v.z+fz*0.1;
   } else if(handler.act==='pass'){
    r.getWorldPosition(v);l.getWorldPosition(v2);v.add(v2).multiplyScalar(0.5);bx=v.x;by=v.y;bz=v.z;
   } else {
    // dribble: the ball travels hand -> floor -> hand in rhythm with the dribbling hand
    r.getWorldPosition(v);
    const period=V.dribblePeriod/Math.max(0.6,Math.min(1.6,Math.hypot(handler.vx,handler.vz)/2.2+0.7));
    const u=((b.dribbleT/period)%1),h=Math.max(court.ballR,v.y-0.05);
    const fx=Math.sin(handler.face),fz=Math.cos(handler.face);
    bx=v.x+fx*0.18;bz=v.z+fz*0.18;by=court.ballR+(h-court.ballR)*Math.pow(Math.abs(1-2*u),0.85);
   }
  }
  // smooth the hand-off when the engine takes over (release, pass)
  if(state.ballVis&&b.state!=='held'&&state.ballVis.state==='held'){state.ballOffset={x:state.ballVis.x-bx,y:state.ballVis.y-by,z:state.ballVis.z-bz,t:0.18};}
  if(state.ballOffset&&state.ballOffset.t>0){const k=state.ballOffset.t/0.18;bx+=state.ballOffset.x*k;by+=state.ballOffset.y*k;bz+=state.ballOffset.z*k;state.ballOffset.t-=dt;}
  ball.position.set(bx,by,bz);ball.rotation.x+=dt*(b.state==='shot'?-12:b.state==='pass'?-9:0);
  state.ballVis={x:bx,y:by,z:bz,state:b.state};
  ball.visible=b.state!=='dead'||!!handler||s.phase==='inbound'||s.phase==='freethrow';
  ballShadow.position.set(bx,0.006,bz);ballShadow.material.opacity=clamp(0.42-by*0.08,0.08,0.42);ballShadow.visible=ball.visible;
  // controlled player marker
  const me=s.players.find(p=>p.controlled);
  if(me&&!state.replay){const mi=playerInterp(prevById.get(me.id),me,alpha);ring.visible=true;ring.position.x=mi.x;ring.position.z=mi.z;arrow.visible=true;arrow.position.set(mi.x,me.hasBall?2.75:2.6,mi.z);arrow.rotation.y+=dt*2;}
  else {ring.visible=false;arrow.visible=false;}
  // nets, LED, displays
  for(const n of dyn.nets){if(n.swing>0){n.swing=Math.max(0,n.swing-dt*1.6);const a=n.mesh.geometry.attributes.position,base=n.base,k=n.swing;for(let i=0;i<a.count;i++){const y=base[i*3+1];const d=-y/0.42;a.setXYZ(i,base[i*3]*(1-0.25*k*d),y*(1+0.35*k*Math.sin(performance.now()*0.03+i)),base[i*3+2]*(1-0.25*k*d));}a.needsUpdate=true;}}
  dyn.led.offset.x=(dyn.led.offset.x+dt*0.03)%1;
  drawDisplays(dyn,s,looks.map(l=>l.primary));
  if(crowd)crowd.update(dt,state.cheer||0);state.cheer=Math.max(0,(state.cheer||0)-dt*0.5);
  if(state.override){camera.position.copy(state.override.pos);camera.fov=state.override.fov||camera.fov;camera.updateProjectionMatrix();camera.lookAt(state.override.look);}else cameraFor(s,dt);
  renderer.render(scene,camera);
  state.lastFrameMs=performance.now()-t0;state.frames++;
 }

 function replayFrame(dt){
  const r=state.replay;r.t+=dt*r.speed;const i=Math.min(r.frames.length-1,Math.floor(r.t*config.replay.hz));
  if(i>=r.frames.length-1){const done=r.done;state.replay=null;done?.();}
  return r.frames[Math.max(0,i)];
 }

 function effects(events){
  for(const e of events){
   if(e.type==='score'){const n=dyn.nets.find(n=>Math.sign(n.side)===Math.sign((e.side)??1));for(const n2 of dyn.nets)n2.swing=1;state.cheer=1;if(e.shotType==='dunk')state.shake=1;}
   if(e.type==='block'||e.type==='contact'&&e.what==='rim'&&e.speed>3)state.shake=Math.max(state.shake,0.4);
  }
 }

 function screenBasis(){
  // court directions for the joystick: screen right / screen up projected on the floor
  camera.updateMatrixWorld();const e=camera.matrixWorld.elements;
  let rx=e[0],rz=e[2],ux=-e[8],uz=-e[10];
  const rl=Math.hypot(rx,rz)||1,ul=Math.hypot(ux,uz)||1;
  return {rx:rx/rl,rz:rz/rl,ux:ux/ul,uz:uz/ul};
 }
 function project(x,y,z){v.set(x,y,z).project(camera);return {x:(v.x+1)/2*state.w,y:(1-v.y)/2*state.h,visible:v.z<1};}
 function metrics(){const i=renderer.info.render;return {calls:i.calls,triangles:i.triangles,frameMs:+state.lastFrameMs.toFixed(2),players:[...avatars.values()].filter(a=>a.root.visible).length,crowd:crowd?.count||0,quality,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,landscape:state.landscape};}
 function startReplay(frames,done,speed=0.6){if(!frames?.length)return false;state.replay={frames,t:0,speed,done};return true;}
 function dispose(){for(const av of avatars.values())av.dispose();renderer.dispose();scene.traverse(o=>{o.geometry?.dispose?.();});pm.dispose();}
 function setCameraOverride(pos,look,fov){state.override=pos?{pos:new THREE.Vector3(pos.x,pos.y,pos.z),look:new THREE.Vector3(look.x,look.y,look.z),fov}:null;}
 return {snapCamera(){state.snap=true;},setCameraOverride,render,resize,effects,screenBasis,project,metrics,startReplay,dispose,get replaying(){return !!state.replay;},renderer,scene,camera,avatars};
}

async function buildCrowd(spots,url,grid,quality){
 const tex=await new THREE.TextureLoader().loadAsync(url);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
 const [cols,rows]=grid,people=cols*rows/2;
 const pick=quality>=2?spots:spots.filter((_,i)=>i%2===0);
 const geo=new THREE.PlaneGeometry(0.62,0.93);geo.translate(0,0.43,0);
 const mat=new THREE.MeshStandardMaterial({map:tex,transparent:false,alphaTest:0.5,roughness:0.9,side:THREE.DoubleSide});
 const cell=new Float32Array(pick.length*2);
 geo.setAttribute('cell',new THREE.InstancedBufferAttribute(cell,2));
 mat.onBeforeCompile=sh=>{
  sh.uniforms.uGrid={value:new THREE.Vector2(cols,rows)};sh.uniforms.uCheer={value:0};mat.userData.sh=sh;
  sh.vertexShader=sh.vertexShader.replace('#include <uv_pars_vertex>','#include <uv_pars_vertex>\nattribute vec2 cell;uniform vec2 uGrid;uniform float uCheer;varying vec2 vCellUv;')
   .replace('#include <uv_vertex>','#include <uv_vertex>\nfloat cheering=step(fract(cell.y*7.31),uCheer);float idx=cell.x*2.0+cheering;float col=mod(idx,uGrid.x);float row=floor(idx/uGrid.x);vCellUv=vec2((col+uv.x)/uGrid.x,1.0-(row+1.0-uv.y)/uGrid.y);');
  sh.fragmentShader=sh.fragmentShader.replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nvarying vec2 vCellUv;').replace('#include <map_fragment>','vec4 sampledDiffuseColor=texture2D(map,vCellUv);diffuseColor*=sampledDiffuseColor;');
 };
 const mesh=new THREE.InstancedMesh(geo,mat,pick.length);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),sc=new THREE.Vector3();
 let a=12345;const r=()=>{a=(a*1103515245+12345)>>>0;return a/4294967296;};
 pick.forEach((s,i)=>{
  e.set(0,s.face,0);q.setFromEuler(e);const k=0.92+r()*0.16;sc.set(k,k,k);
  m.compose(new THREE.Vector3(s.x+(r()-0.5)*0.08,s.y,s.z),q,sc);mesh.setMatrixAt(i,m);
  cell[i*2]=Math.floor(r()*people);cell[i*2+1]=r();
 });
 mesh.receiveShadow=false;mesh.castShadow=false;
 return {mesh,count:pick.length,update(dt,cheer){const sh=mat.userData.sh;if(sh)sh.uniforms.uCheer.value=cheer*0.85;}};
}
