/** Island Pro Basketball — 3D presentation. Reads interpolated engine snapshots and events;
 * it never decides points, possession or time. Broadcast side camera in landscape, a closer
 * half-court camera in portrait. Instant replay plays back recorded snapshots only. */
import * as THREE from '../vendor/three.module.js';
import {buildArena,drawDisplays} from './hoops-arena.mjs?v=island-ski-20261031-1';
import {loadPlayerAssets,createAvatar} from './hoops-players.mjs?v=island-ski-20261031-1';
import {replaceArenaAssets} from './hoops-models.mjs';
import {createHoopsVfx,smootherstep} from './hoops-vfx.mjs';
import {createInterpPool,approach,smoothstep} from './hoops-perf.mjs?v=island-ski-20261031-1';

function releaseScene(scene){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of (o.material?Array.isArray(o.material)?o.material:[o.material]:[])){materials.add(m);for(const x of Object.values(m))if(x?.isTexture)textures.add(x);}});
 for(const x of skeletons)x.dispose();for(const x of geometries)x.dispose();for(const x of materials)x.dispose();for(const x of textures)x.dispose();
}
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export async function createHoopsView(canvas,config,{court,teams,quality=2,assetBase,insets,onProgress}){
 const V=config.view,mobile=/Android|iPhone|iPad|Mobile/i.test(globalThis.navigator?.userAgent||'');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:quality>=2,powerPreference:'high-performance',preserveDrawingBuffer:!!V.preserve});
 let loadingScene,loadingModels,loadingAssets,loadingVfx,loadingPm,loadingEnv;
 try{
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=V.exposure;
 renderer.shadowMap.enabled=quality>=1;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();loadingScene=scene;scene.background=new THREE.Color(0x05060a);scene.fog=new THREE.Fog(0x05060a,38,80);
 const camera=new THREE.PerspectiveCamera(V.fov,1,0.1,200);
 const looks=teams.map(t=>t.look);
 const {root:arena,dyn}=buildArena(court,{home:looks[0],away:looks[1],quality,anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
 scene.add(arena);
 const models=await replaceArenaAssets(arena,dyn,court,{assetBase,quality,anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy())});
 loadingModels=models;
 // environment reflections from a dim copy of the arena lights
 const pm=new THREE.PMREMGenerator(renderer);loadingPm=pm;
 const envScene=new THREE.Scene();envScene.background=new THREE.Color(0x0b0d14);
 const lamp=new THREE.Mesh(new THREE.BoxGeometry(30,0.5,18),new THREE.MeshBasicMaterial({color:0xfff2dd}));lamp.position.y=12;envScene.add(lamp);
 for(const s of [1,-1]){const strip=new THREE.Mesh(new THREE.BoxGeometry(40,3,0.5),new THREE.MeshBasicMaterial({color:new THREE.Color(looks[0].primary).multiplyScalar(0.6)}));strip.position.set(0,3,s*16);envScene.add(strip);}
 const envTarget=pm.fromScene(envScene,0.02);loadingEnv=envTarget;releaseScene(envScene);scene.environment=envTarget.texture;scene.environmentIntensity=V.envIntensity;

 // crowd: instanced sprites from the spectator atlas (or plain silhouettes if it fails)
 let crowd=null;
 try{crowd=await buildCrowd(dyn.crowdSpots,new URL(config.assets.crowd,assetBase).href,config.assets.crowdGrid,quality);scene.add(crowd.mesh);}catch(e){crowd=null;}

 const assets=await loadPlayerAssets(config.assets,assetBase,onProgress);assets.engineAnim=config.anim;loadingAssets=assets;
 // avatars: the ten on the floor are built before the first frame; the bench is built one per
 // half second during stoppages (or on the spot when a substitute appears), not all 25 at load
 const avatars=new Map(),cards=new Map(),pending=[],kits=new Map();
 for(const t of teams)for(const card of t.players){cards.set(card.id,{card,look:t.look});pending.push(card.id);}
 function ensureAvatar(id){
  let av=avatars.get(id);if(av||!cards.has(id))return av;
  const {card,look}=cards.get(id);av=createAvatar(assets,card,look,{baseHeights:config.assets.baseHeights});av.root.visible=false;scene.add(av.root);avatars.set(id,av);for(let i=0;i<teams.length;i++)if(kits.has(i)&&teams[i].players.some(p=>p.id===id))av.applyKit(kits.get(i));
  const i=pending.indexOf(id);if(i>=0)pending.splice(i,1);
  return av;
 }
 for(const t of teams)for(const id of (t.lineup||t.players.slice(0,5).map(c=>c.id)))ensureAvatar(id);
 const interp=createInterpPool();

 // the ball
 const ball=models.ball;scene.add(ball);
 const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(court.ballR*1.2,24),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.35,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;scene.add(ballShadow);
 // controlled-player ring and pass target marker
 const ringMat=new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.9,depthWrite:false});
 const ring=new THREE.Mesh(new THREE.RingGeometry(0.5,0.68,48),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.012;scene.add(ring);
 const glow=new THREE.Mesh(new THREE.CircleGeometry(0.5,40),new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.22,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=0.011;scene.add(glow);
 const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.34,3),ringMat);arrow.rotation.x=Math.PI;scene.add(arrow);

 const state={camX:0,camZ:0,shake:0,replay:null,lastFrameMs:16,frames:0,slow:0,landscape:true,w:1,h:1,portraitT:1,ballVis:null};
 const v=new THREE.Vector3(),v2=new THREE.Vector3();
 const vfx=await createHoopsVfx(scene,assetBase,{quality,court});loadingVfx=vfx;
 const replayCam=new THREE.PerspectiveCamera(),replayTarget=new THREE.Vector3();

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
  if(state.landscape&&(V.mode||'broadcast')==='broadcast'){
   // TV sideline camera that never turns: right on the screen is always the same way on the
   // court, so running back on defence feels the same as attacking. Closer than a wide shot,
   // following the ball with a lead towards the basket being attacked.
   const h=s.players.find(p=>p.hasBall),fx=h?h.x:b.x,fz=h?h.z:b.z,side=attack||0;
   const lead2=side?clamp((side*court.rimX-fx)*(V.bLead??0.35),-(V.bLeadMax??4),V.bLeadMax??4):0;
   const tx=clamp(fx+lead2,-court.hx+(V.bEdge??5),court.hx-(V.bEdge??5));
   const kb=state.snap||state.bcX==null?1:1-Math.exp(-dt*(V.bRate??2.4));
   state.bcX=state.bcX==null?tx:lerp(state.bcX,tx,kb);state.bcZ=lerp(state.bcZ??0,clamp(fz,-court.hz,court.hz),kb);
   state.punch=Math.max(0,(state.punch||0)-dt/1.6);const pb=state.punch;
   // fixed spot above the near sideline; the lens zooms so the players keep the same size
   // wherever the ball is (near or far side), like a TV camera operator
   const cz=-(court.hz+(V.bDist??7)),cy=V.bHeight??7,lz=clamp(state.bcZ*(V.bFollowZ??0.75)+(V.bLookZ??0),-court.hz+(V.bNearZ??3),court.hz-1);
   const dist=Math.hypot(lz-cz,cy-(V.bLookY??1)),span=(V.bSpan??8)*(1-0.25*pb);
   camera.fov=clamp(2*Math.atan(span/2/dist)*180/Math.PI,V.bFovMin??16,V.bFovMax??40);
   camera.position.set(state.bcX,cy,cz);
   camera.lookAt(state.bcX,V.bLookY??1,lz);
  } else if(state.landscape&&V.mode==='behind'){
   // behind the play (2K / NBA Live mobile style): low behind the ball, facing the basket the
   // team with the ball attacks; it swings round smoothly when the ball changes hands
   const h=s.players.find(p=>p.hasBall),fx=h?h.x:b.x,fz=h?h.z:b.z;
   const side=attack||Math.sign(fx||1)||1,rimX=side*court.rimX;
   const kk=state.snap?1:1-Math.exp(-dt*(V.behindRate??2.2));
   // swing angle: 0 looks at the +x basket, PI at the -x one; halfway is the TV sideline view
   // far from the basket (bringing the ball up, transition) the camera eases round to the
   // sideline; in the half court it sits behind the play
   const far=clamp((Math.abs(rimX-fx)-(V.behindNear??12))/((V.behindFar??19)-(V.behindNear??12)),0,1),wf=far*far*(3-2*far);
   const goalA=side>0?wf*Math.PI/2:Math.PI-wf*Math.PI/2;
   state.bW=state.snap||state.bW==null?wf:lerp(state.bW,wf,1-Math.exp(-dt*(V.behindSwing??1.6)));
   state.bA=state.snap||state.bA==null?goalA:lerp(state.bA,goalA,1-Math.exp(-dt*(V.behindSwing??1.6)));
   // the ball holder stays in the lower third; never back beyond the far baseline wall
   const tx=clamp(fx,-court.hx+1,court.hx-1),tz=clamp(fz,-court.hz,court.hz);
   state.bX=state.snap||state.bX==null?tx:lerp(state.bX,tx,kk);state.bZ=state.snap||state.bZ==null?tz:lerp(state.bZ,tz,kk);
   // the camera stays in front of the backboard behind it; near that wall it rises instead
   state.punch=Math.max(0,(state.punch||0)-dt/1.6);const punch=state.punch*(1-state.bW);
   const ca=Math.cos(state.bA),sa=Math.sin(state.bA),back=((V.behindBack??8.5)+state.bW*(V.sideExtraBack??3.5))*(1-0.38*punch),lim=court.hx-(V.behindWall??2)-state.bW*2.5;
   const rawX=state.bX-ca*back,over=Math.max(0,Math.abs(rawX)-lim);
   const cx=clamp(rawX,-lim,lim),cz=clamp(state.bZ*(V.behindZ??0.55)-sa*back,-(court.hz+3),court.hz+3);
   const ahead=clamp(Math.abs(rimX-state.bX)*lerp(V.behindLook??0.45,0.55,state.bW),1.5,lerp(6,10,state.bW));
   const lx=state.bX+side*ahead,lz=state.bZ*(V.behindLookZ??0.25);
   camera.fov=lerp(V.behindFov??50,V.sideFov??36,state.bW)-8*punch;camera.position.set(cx,(V.behindHeight??3.8)+state.bW*(V.sideExtraHeight??1.6)+Math.min(3,over*0.55),cz);camera.lookAt(lx,lerp(V.behindLookY??1.4,1.1,state.bW),lz);
  } else if(state.landscape){
   camera.fov=V.fov;camera.position.set(state.camX,V.height,-(court.hz+V.distance)+state.camZ*(V.dollyZ??0));camera.lookAt(state.camX*0.98,V.lookY,state.camZ+V.lookZ);
  } else {
   // portrait: look along the court towards the active basket, from behind mid-court. The side
   // swings over in V.portraitSwing seconds when the ball crosses half court (no cut).
   const want=Math.sign(b.x||1)||1;
   state.pS=state.snap||state.pS==null?want:approach(state.pS,want,dt,V.portraitSwing??0.65);
   const s0=state.pS,w=smoothstep((s0+1)/2),ex=court.hx-6.2;
   const cx=lerp(-ex,ex,w);
   state.pX=state.snap?cx:lerp(state.pX??cx,cx,k*0.6);
   camera.fov=V.portraitFov;camera.position.set(state.pX-s0*V.portraitBack,V.portraitHeight+Math.abs(1-Math.abs(s0))*(V.portraitSwingRise??1.5),-court.hz*0.35+state.camZ*0.3);
   camera.lookAt(state.pX+s0*2.4,V.lookY,state.camZ*0.5);
  }
  state.snap=false;
  if(state.shake>0){camera.position.y+=Math.sin(performance.now()*0.05)*state.shake*0.06;state.shake=Math.max(0,state.shake-dt*2);}
  camera.updateProjectionMatrix();
 }

 const seen=new Set();
 function render(prev,cur,alpha,dt){
  const s=state.replay?replayFrame(dt):cur,p0=state.replay?s:prev;state.lastSnapshot=cur;
  const t0=performance.now();
  interp.index(p0?.players);
  seen.clear();
  let handler=null,me=null;for(const p of s.players){if(p.hasBall)handler=p;if(p.controlled)me=p;}
  // stoppages build the bench one avatar per half second, so a substitute is usually ready
  // before he appears and no live frame pays for it
  if(pending.length){if(s.phase!=='live'&&(state.warm=(state.warm||0)+1)>=30){state.warm=0;ensureAvatar(pending[0]);}}
  for(const pp of s.players){
   const p=state.replay?pp:interp.get(pp,alpha);
   const av=avatars.get(p.id)||ensureAvatar(p.id);if(!av)continue;seen.add(p.id);
   av.root.visible=true;av.root.position.set(p.x,p.y*0.85,p.z);av.root.rotation.y=p.face;
   const defending=s.possession!==p.team&&s.ball.state==='held';
   const contest=handler&&handler.team!==p.team&&handler.act==='shoot'&&Math.hypot(handler.x-p.x,handler.z-p.z)<1.8?1:0;
   const catching=s.ball.state==='pass'&&s.ball.passTo===p.id;
   av.pose(p,{defending,dribbling:s.phase==='live',airU:p.air?clamp((p.y)/(0.7),0,1):0,contest,catching},Math.min(0.05,dt));
  }
  for(const [id,av] of avatars)if(!seen.has(id))av.root.visible=false;
  // ball: the engine position, but held/dribbled balls follow the hands of the clip
  const b=s.ball,pb=p0?.ball;
  let bx=pb&&!state.replay?lerp(pb.x,b.x,alpha):b.x,by=pb&&!state.replay?lerp(pb.y,b.y,alpha):b.y,bz=pb&&!state.replay?lerp(pb.z,b.z,alpha):b.z;
  if(b.state==='held'&&handler){
   const av=avatars.get(handler.id);av.root.updateMatrixWorld(true);
   const r=av.hands.r,l=av.hands.l;
   if((handler.act==='shoot'||handler.act==='fake')||!s.phase||s.phase!=='live'||Math.hypot(handler.vx,handler.vz)<0.05&&!handler.act&&false){
    r.getWorldPosition(v);l.getWorldPosition(v2);v.add(v2).multiplyScalar(0.5);
    const fx=Math.sin(handler.face),fz=Math.cos(handler.face);bx=v.x+fx*0.1;by=v.y+0.02;bz=v.z+fz*0.1;
   } else if(handler.act==='pass'){
    r.getWorldPosition(v);l.getWorldPosition(v2);v.add(v2).multiplyScalar(0.5);bx=v.x;by=v.y;bz=v.z;
   } else {
    // dribble: the ball travels hand -> floor -> hand in rhythm with the dribbling hand
    r.getWorldPosition(v);
    if(handler.act==='cross'){l.getWorldPosition(v2);v.lerp(v2,Math.sin(clamp(handler.actT/.55,0,1)*Math.PI));}
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
  if(me&&!state.replay){const mi=interp.get(me,alpha);ring.visible=true;ring.position.x=mi.x;ring.position.z=mi.z;glow.visible=true;glow.position.x=mi.x;glow.position.z=mi.z;const pulse=1+Math.sin(performance.now()*0.008)*0.06;ring.scale.setScalar(pulse);arrow.visible=true;arrow.position.set(mi.x,me.hasBall?2.75:2.6,mi.z);arrow.rotation.y+=dt*2;}
  else {ring.visible=false;glow.visible=false;arrow.visible=false;}
  // nets, LED, displays
  for(const n of dyn.nets){if(n.swing>0){n.swing=Math.max(0,n.swing-dt*1.6);const a=n.mesh.geometry.attributes.position,base=n.base,k=n.swing;for(let i=0;i<a.count;i++){const y=base[i*3+1];const d=-y/0.42;a.setXYZ(i,base[i*3]*(1-0.25*k*d),y*(1+0.35*k*Math.sin(performance.now()*0.03+i)),base[i*3+2]*(1-0.25*k*d));}a.needsUpdate=true;}}
  dyn.led.offset.x=(dyn.led.offset.x+dt*0.03)%1;
  drawDisplays(dyn,s,looks.map(l=>l.primary));
  if(crowd)crowd.update(dt,state.cheer||0);state.cheer=Math.max(0,(state.cheer||0)-dt*0.5);
  if(state.override){camera.position.copy(state.override.pos);camera.fov=state.override.fov||camera.fov;camera.updateProjectionMatrix();camera.lookAt(state.override.look);}else cameraFor(s,dt);
  if(state.replay?.dunk&&!vfx.reducedMotion&&!state.override)replayCamera(state.replay,cur,dt);
  vfx.update(dt,{ball,camera,snapshot:s,replaying:!!state.replay});
  renderer.render(scene,camera);
  if(state.replay?.complete){const done=state.replay.done;state.replay=null;done?.();}
  state.lastFrameMs=performance.now()-t0;state.frames++;
 }

 function replayFrame(dt){
  const r=state.replay;r.elapsed+=dt;
  let i;
  if(r.dunk){
   const contact=vfx.cameraTrack.entry.durationSeconds+vfx.cameraTrack.replayContactPathTime;
   const end=vfx.cameraTrack.durationSeconds;
   i=r.elapsed<=contact?lerp(r.first,r.contact,clamp(r.elapsed/contact,0,1)):lerp(r.contact,r.frames.length-1,clamp((r.elapsed-contact)/(end-contact),0,1));
   r.complete=r.elapsed>=end;
  }else{r.t+=dt*r.speed;i=r.t*config.replay.hz;r.complete=i>=r.frames.length-1;}
  return r.frames[clamp(Math.floor(i),0,r.frames.length-1)];
 }
 function replayCamera(r,live,dt){
  cameraFor(live,dt);
  const track=vfx.cameraTrack,entry=track.entry.durationSeconds,exit=track.exit.durationSeconds;
  const pose=vfx.sampleDunkCamera(clamp(r.elapsed-entry,0,track.pathDurationSeconds),r.side);
  replayCam.position.fromArray(pose.position);replayTarget.fromArray(pose.target);replayCam.lookAt(replayTarget);
  const fov=state.landscape?pose.fov:Math.max(62,pose.fov);
  if(r.elapsed<entry){const w=smootherstep(r.elapsed/entry);camera.position.copy(r.entry.position).lerp(replayCam.position,w);camera.quaternion.copy(r.entry.quaternion).slerp(replayCam.quaternion,w);camera.fov=lerp(r.entry.fov,fov,w);}
  else if(r.elapsed>track.durationSeconds-exit){const w=smootherstep((r.elapsed-track.durationSeconds+exit)/exit);camera.position.lerp(replayCam.position,1-w);camera.quaternion.slerp(replayCam.quaternion,1-w);camera.fov=lerp(fov,camera.fov,w);}
  else{camera.position.copy(replayCam.position);camera.quaternion.copy(replayCam.quaternion);camera.fov=fov;}
  camera.updateProjectionMatrix();
 }

 function effects(events,snapshot){
  vfx.effects(events,snapshot||state.lastSnapshot);
  for(const e of events){
   if(e.type==='final'&&snapshot){const winner=e.won?0:1;for(const p of snapshot.players)if(p.team===winner)avatars.get(p.id)?.event('result_success');}
   if(!vfx.reducedMotion&&e.type==='shotStart'&&(e.shotType==='dunk'||e.shotType==='layup'))state.punch=e.shotType==='dunk'?1:0.6;
   if(e.type==='score'){const n=dyn.nets.find(n=>Math.sign(n.side)===Math.sign((e.side)??1));for(const n2 of dyn.nets)n2.swing=1;state.cheer=1;if(e.shotType==='dunk'&&!vfx.reducedMotion)state.shake=1;}
   if(!vfx.reducedMotion&&(e.type==='block'||e.type==='contact'&&e.what==='rim'&&e.speed>3))state.shake=Math.max(state.shake,0.4);
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
 function metrics(){const i=renderer.info.render;let vis=0;for(const a of avatars.values())if(a.root.visible)vis++;return {calls:i.calls,triangles:i.triangles,frameMs:+state.lastFrameMs.toFixed(2),players:vis,avatars:avatars.size,pending:pending.length,crowd:crowd?.count||0,quality,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,landscape:state.landscape,dpr:renderer.getPixelRatio(),bufferWidth:canvas.width,bufferHeight:canvas.height,style:'adult-broadcast',vfx:vfx.metrics(),motion:[...avatars.values()].filter(a=>a.root.visible).map(a=>a.motionState)};}
 function startReplay(frames,done,speed=0.6){
  if(!frames?.length)return false;
  let shooter=null,side=1,start=0,contact=0,best=Infinity;
  for(let i=0;i<frames.length;i++)for(const p of frames[i].players)if(p.act==='shoot'&&p.shotType==='dunk'){if(shooter!==p.id){shooter=p.id;start=i;best=Infinity;}side=frames[i].dir[p.team];const b=frames[i].ball,d=Math.hypot(b.x-side*court.rimX,b.y-court.rimY,b.z);if(d<best){best=d;contact=i;}}
  state.replay={frames,t:0,elapsed:0,speed,done,dunk:!!shooter&&!vfx.reducedMotion,contact,first:Math.max(start,contact-90),side,entry:{position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov}};return true;
 }
 function dispose(){
  for(const av of avatars.values())av.dispose();assets.dispose();models.dispose();vfx.dispose();
  releaseScene(scene);envTarget.dispose();renderer.dispose();pm.dispose();
 }
 function setCameraOverride(pos,look,fov){state.override=pos?{pos:new THREE.Vector3(pos.x,pos.y,pos.z),look:new THREE.Vector3(look.x,look.y,look.z),fov}:null;}
 return {setKit(team,kit){kits.set(team,kit);for(const p of teams[team].players)avatars.get(p.id)?.applyKit(kit);},snapCamera(){state.snap=true;},setCameraOverride,render,resize,effects,screenBasis,project,metrics,startReplay,dispose,get replaying(){return !!state.replay;},renderer,scene,camera,avatars,get celebrationSeconds(){return vfx.reducedMotion?0:vfx.celebrationSeconds;}};
 }catch(error){
  loadingVfx?.dispose();loadingAssets?.dispose();loadingModels?.dispose();releaseScene(loadingScene);loadingEnv?.dispose();loadingPm?.dispose();renderer.dispose();throw error;
 }
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
