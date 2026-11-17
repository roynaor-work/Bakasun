/** 14/11/2026 fire v24: the 3D room (three.js) the firefighter works in once the engine has reached the building.
 * Assets first, code second: rooms are the Codex fire-rooms-v1 GLBs (intact/burnt states, fire anchors), the friends to carry out are the
 * Codex fire-rescue-v1 characters (girl/cat/dog with clips), the firefighter is the island's rigged firefighter, flames/smoke/steam/water
 * are the Codex fire-fx-v1 sheets as animated sprites. The hallway and the stairwell have no Codex file yet, so they are simple rounded
 * shapes in the same palette (listed in the report as a Codex task). Everything here is drawing only: the model decides. */
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {fitModel} from '../view/local-models.mjs?v=island-v2-20261107-16';
import {createFireCrewRig} from './fire-crew.mjs?v=island-v2-20261107-16';
import {ROOMS,V24_TUNING} from './fire-v24.mjs?v=island-v2-20261107-16';
import {ROOM_HEIGHT,ROOM_WIDTH,ROOM_DEPTH,smokeLine} from './fire-v24-interior.mjs?v=island-v2-20261107-16';

const VERSION='island-v2-20261107-16';
const url=(path)=>new URL(path+'?v='+VERSION,import.meta.url).href;
export const V24_ASSETS=Object.freeze({
  rooms:'../assets/fire-v24/rooms/',friends:'../assets/fire-v24/friends/',fx:'../assets/fire-v23/fx/',firefighter:'../assets/models/firefighter-rigged-512.glb',
  sheets:{'flame-large':[4,2,8,12],'flame-medium':[4,2,8,12],'flame-extinguish':[4,2,8,14],'smoke-black':[4,4,16,12],'steam-white':[4,4,16,12],'water-impact':[3,2,6,15],'foam-bubbles':[3,2,6,10],sparks:[4,4,16,16]},
});
/** Every file the interior may fetch for a plan (for the offline list and the tests). */
export function v24AssetFiles(plan){const files=new Set(['assets/models/firefighter-rigged-512.glb','assets/fire-v24/rooms/palette-1024.png']);for(const id of Object.keys(V24_ASSETS.sheets))files.add('assets/fire-v23/fx/'+id+'.png');
  for(const r of plan?.rooms||[]){const room=ROOMS[r.room];if(room?.file)files.add('assets/fire-v24/rooms/'+room.file);files.add('assets/fire-v24/friends/'+r.friend+'.glb');}return [...files];}

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const PALETTE={wall:'#e9dccd',wall2:'#d9c7b6',floor:'#b98a62',trim:'#8d6b52',wood:'#a3714a',dark:'#5a4a44',metal:'#8f9aa3',green:'#6f9a7a',blue:'#5b7fa6',red:'#c5533f',cream:'#f3eadb',char:'#2a2422',glass:'#9fd3df'};

/** Canvas disc for the water drops and the soft rings (a shape, not a character: drawing it in code is fine). */
function discTexture(size=64,inner=0,color='#ffffff'){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),grd=g.createRadialGradient(size/2,size/2,size*inner,size/2,size/2,size/2);grd.addColorStop(0,color);grd.addColorStop(.6,color);grd.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grd;g.fillRect(0,0,size,size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
function ringTexture(size=128,width=.12,color='#ffffff'){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.strokeStyle=color;g.lineWidth=size*width;g.beginPath();g.arc(size/2,size/2,size*(.5-width),0,Math.PI*2);g.stroke();const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}

export function createInteriorScene({model,canvas,lite=false,createRenderer=o=>new T.WebGLRenderer(o),loader=new GLTFLoader(),textureLoader=new T.TextureLoader(),tuning=V24_TUNING}){
  const roomBarrier=new URLSearchParams(globalThis.location?.search||'').get('fireRoomBarrier')!=='0';
  const renderer=createRenderer({canvas,antialias:!lite,alpha:false,powerPreference:'low-power'});
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=false;
  const scene=new T.Scene();scene.background=new T.Color('#1d1a22');scene.fog=new T.Fog('#1d1a22',9,26);
  const camera=new T.PerspectiveCamera(36,16/9,.1,60);
  const cam={pos:new T.Vector3(.4,2.7,7.6),look:new T.Vector3(0,1.25,-.5),dolly:1,sway:0};
  camera.position.set(.4,2.9,10.8);camera.lookAt(cam.look);
  const disposables=new Set(),own=o=>(disposables.add(o),o);
  // ---- lights: warm hemisphere, a soft key from the open front, and flickering fire lights ----------------------------------------
  scene.add(new T.HemisphereLight('#ffd9b8','#3a2d2a',1.05));
  const key=new T.DirectionalLight('#fff1dc',.95);key.position.set(3,6.5,7);scene.add(key);
  const fill=new T.DirectionalLight('#9fb3d8',.35);fill.position.set(-5,3,2);scene.add(fill);
  const fireLights=Array.from({length:lite?1:3},()=>{const l=new T.PointLight('#ff7a2a',0,6.5,2);scene.add(l);return l;});
  // ---- textures (fx sheets, shared) --------------------------------------------------------------------------------------------------
  const sheets=new Map(),loading=[];
  function sheet(id){if(sheets.has(id))return sheets.get(id);const t=textureLoader.load(url(V24_ASSETS.fx+id+'.png'));t.colorSpace=T.SRGBColorSpace;t.minFilter=T.LinearFilter;t.generateMipmaps=false;sheets.set(id,own(t));return t;}
  /** A sprite showing one frame of a sheet; `frame(i)` moves its own texture window. */
  function sheetSprite(id,{add=false,centerY=.5,opacity=1}={}){const [cols,rows]=V24_ASSETS.sheets[id],tex=sheet(id).clone();own(tex);tex.repeat.set(1/cols,1/rows);
    const m=own(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,opacity,blending:add?T.AdditiveBlending:T.NormalBlending,fog:false}));const s=new T.Sprite(m);s.center.set(.5,centerY);s.frustumCulled=false;
    s.userData.frame=i=>{const n=i%V24_ASSETS.sheets[id][2];tex.offset.set((n%cols)/cols,1-(Math.floor(n/cols)+1)/rows);};s.userData.frame(0);scene.add(s);return s;}
  const disc=own(discTexture()),ringTex=own(ringTexture());
  // ---- room ---------------------------------------------------------------------------------------------------------------------------
  const roomRoot=new T.Group();scene.add(roomRoot);let roomVisual=null;const cache=new Map();
  const mats={};const mat=(name,color,extra={})=>mats[name]||(mats[name]=own(new T.MeshStandardMaterial({color,roughness:.95,metalness:0,...extra})));
  const charMat=()=>mat('char',PALETTE.char,{roughness:1});
  function box(parent,w,h,d,color,x,y,z,spot=null){const g=own(new T.BoxGeometry(w,h,d));const m=new T.Mesh(g,mat(color,color));m.position.set(x,y,z);if(spot)m.userData.spot=spot;parent.add(m);return m;}
  /** Hallway and stairwell: walls, floor, a door, and the items the plan can set on fire (hand placed, see ROOMS[..].spots.pos). */
  function buildRoom(kind){
    const g=new T.Group(),W=ROOM_WIDTH,D=ROOM_DEPTH,H=ROOM_HEIGHT;
    box(g,W,.1,D,PALETTE.floor,0,-.05,0);box(g,W,H,.12,kind==='stairwell'?PALETTE.wall2:PALETTE.wall,0,H/2,-D/2-.06);
    box(g,.12,H,D,PALETTE.wall2,-W/2-.06,H/2,0);box(g,.12,H,D,PALETTE.wall2,W/2+.06,H/2,0);
    box(g,W,.18,.14,PALETTE.trim,0,.09,-D/2);box(g,W,.1,.12,PALETTE.trim,0,H-.05,-D/2);
    // exit door on the back wall (the friend walks out through it)
    box(g,1.1,2.15,.08,PALETTE.wood,2.6,1.075,-D/2+.02);box(g,1.3,.1,.14,PALETTE.cream,2.6,2.2,-D/2+.03);box(g,.08,.08,.2,PALETTE.metal,2.2,1.05,-D/2+.1);
    const items={};const item=key=>items[key]||(items[key]=(()=>{const it=new T.Group();it.userData.spot=key;g.add(it);return it;})());
    if(kind==='hallway'){
      box(item('coat_rack'),.1,1.9,.1,PALETTE.wood,-2.5,.95,-1.9,'coat_rack');box(item('coat_rack'),.7,.1,.1,PALETTE.wood,-2.5,1.8,-1.9,'coat_rack');box(item('coat_rack'),.42,.9,.22,PALETTE.blue,-2.35,1.3,-1.86,'coat_rack');
      box(item('shoe_cabinet'),1.3,.9,.4,PALETTE.wood,-.4,.45,-2.05,'shoe_cabinet');box(item('shoe_cabinet'),1.3,.06,.44,PALETTE.cream,-.4,.93,-2.05,'shoe_cabinet');
      box(item('boxes'),.8,.6,.6,PALETTE.cream,1.9,.3,-1.6,'boxes');box(item('boxes'),.55,.45,.5,PALETTE.cream,1.75,.82,-1.55,'boxes');
      box(item('picture'),.9,.65,.06,PALETTE.green,-1.3,1.7,-2.22,'picture');box(item('picture'),1,.75,.04,PALETTE.wood,-1.3,1.7,-2.24,'picture');
      box(item('bench'),1.4,.1,.45,PALETTE.wood,-2.2,.45,.6,'bench');for(const dx of [-.6,.6])box(item('bench'),.1,.42,.4,PALETTE.wood,-2.2+dx,.21,.6,'bench');
      box(g,.35,.35,.35,PALETTE.red,2.6,.18,1.6);box(g,2.4,.05,1.2,PALETTE.red,-.2,.03,.6); // hydrant cabinet and a runner rug
    }else{
      for(let i=0;i<7;i++)box(g,2.2,.2,.42,PALETTE.wall2,1.4-i*.02,.1+i*.2,-.9-i*.34); // stairs rising toward the back wall
      const rail=item('stair_rail');for(let i=0;i<4;i++)box(rail,.06,1,.06,PALETTE.metal,.3,.6+i*.38,-.95-i*.6,'stair_rail');box(rail,.08,.08,2.3,PALETTE.wood,.3,1.45,-1.85,'stair_rail').rotation.x=-.52;
      const mb=item('mailboxes');for(let r=0;r<2;r++)for(let c=0;c<3;c++)box(mb,.32,.28,.14,PALETTE.metal,-2.95+c*.36,.85+r*.32,-2.1,'mailboxes');box(mb,1.15,.74,.06,PALETTE.dark,-2.6,1.02,-2.18,'mailboxes');
      const st=item('stroller');box(st,.55,.45,.8,PALETTE.blue,1.6,.55,.2,'stroller');box(st,.45,.3,.4,PALETTE.cream,1.6,.85,0,'stroller');for(const [dx,dz]of [[-.25,.3],[.25,.3],[-.25,-.3],[.25,-.3]])box(st,.1,.22,.22,PALETTE.dark,1.6+dx,.12,.2+dz,'stroller');
      box(item('bin'),.45,.7,.45,PALETTE.green,2.5,.35,-1.6,'bin');box(item('bin'),.5,.06,.5,PALETTE.dark,2.5,.73,-1.6,'bin');
      box(item('notice_board'),1.1,.8,.05,PALETTE.cream,-1.2,1.6,-2.22,'notice_board');box(item('notice_board'),1.2,.9,.03,PALETTE.wood,-1.2,1.6,-2.24,'notice_board');
      box(g,.5,.9,.3,PALETTE.red,-2.95,.45,1.6); // extinguisher cabinet
    }
    g.userData.built=true;return g;
  }
  function loadGLB(path){return new Promise((resolve,reject)=>loader.load(url(path),resolve,undefined,reject));}
  async function roomObject(def){
    const room=ROOMS[def.room];if(!room.file)return buildRoom(room.id);
    if(!cache.has(room.file)){
      const pending=loadGLB(V24_ASSETS.rooms+room.file).then(g=>{g.scene.traverse(o=>{if(o.isMesh){o.material.roughness=1;o.material.metalness=0;}});return g.scene;});cache.set(room.file,pending);
      if(roomBarrier)void pending.catch(()=>{if(cache.get(room.file)===pending)cache.delete(room.file);});
    }
    return cache.get(room.file);
  }
  const burnables=new Map();let pickables=[];
  function mountRoom(object,def){
    if(roomVisual){roomRoot.remove(roomVisual);if(roomVisual.userData.built){roomVisual.traverse(o=>{if(o.geometry){o.geometry.dispose();disposables.delete(o.geometry);}});}}
    roomVisual=object;roomRoot.add(object);burnables.clear();pickables=[];
    object.traverse(o=>{if(o.isMesh)pickables.push(o);
      if(o.name?.startsWith('burn_')){const intact=o.getObjectByName(o.userData.intactNode||'intact_'+o.name.slice(5)),burnt=o.getObjectByName(o.userData.burntNode||'burnt_'+o.name.slice(5));if(intact&&burnt){burnt.visible=false;burnt.scale.setScalar(0);intact.visible=true;burnables.set(o.name.slice(5),{intact,burnt,kind:'glb'});}}
      else if(object.userData.built&&o.userData.spot&&o.isGroup)burnables.set(o.userData.spot,{group:o,kind:'built',mats:null});});
    object.updateMatrixWorld(true);
  }
  /** Charred state for a put-out item: the Codex burnt node, or dark material on a built item. */
  function char(key){const b=burnables.get(key);if(!b||b.done)return;b.done=true;
    if(b.kind==='glb'){b.intact.visible=false;b.burnt.visible=true;b.burnt.scale.fromArray(b.burnt.userData.restScale||[1,1,1]);}
    else b.group.traverse(o=>{if(o.isMesh)o.material=charMat();});}
  // ---- fire, smoke, steam, water -------------------------------------------------------------------------------------------------------
  const flames=new Map(),glows=new Map(),rings=new Map();let flameSeed=0;
  const ringGeo=own(new T.RingGeometry(.42,.52,40)),ringMatFire=own(new T.MeshBasicMaterial({color:'#ff9a3c',transparent:true,opacity:.6,depthWrite:false,side:T.DoubleSide,fog:false})),ringMatFriend=own(new T.MeshBasicMaterial({color:'#7cf0a8',transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide,fog:false}));
  function flameFor(spot){let f=flames.get(spot.id);if(f)return f;const s=sheetSprite('flame-large',{add:true,centerY:.07});s.position.fromArray(spot.pos);const glow=new T.Sprite(own(new T.SpriteMaterial({map:disc,color:'#ff7a2a',transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false,fog:false})));glow.position.fromArray(spot.pos);glow.position.y+=.45;scene.add(glow);
    const ring=new T.Mesh(ringGeo,ringMatFire);ring.rotation.x=-Math.PI/2;ring.position.set(spot.pos[0],.03,spot.pos[2]);scene.add(ring);
    f={sprite:s,glow,ring,seed:(flameSeed++)*1.7,phase:Math.random()*8};flames.set(spot.id,f);return f;}
  const puffs=[],PUFFS=lite?12:28;for(let i=0;i<PUFFS;i++){const s=sheetSprite('smoke-black',{opacity:0});s.visible=false;puffs.push({s,life:0,max:1,vel:new T.Vector3(),kind:'smoke',size:1});}
  const steams=[];for(let i=0;i<(lite?8:14);i++){const s=sheetSprite('steam-white',{opacity:0});s.visible=false;steams.push({s,life:0,max:1,vel:new T.Vector3(),size:1});}
  const bursts=[];for(let i=0;i<4;i++){const s=sheetSprite('flame-extinguish',{add:true,centerY:.07});s.visible=false;bursts.push({s,t:-1});}
  const sparks=sheetSprite('sparks',{add:true});sparks.visible=false;sparks.scale.setScalar(1.1);
  const splash=sheetSprite('water-impact',{centerY:.2});splash.visible=false;splash.scale.set(.9,.9,1);
  const foam=sheetSprite('foam-bubbles',{centerY:.3});foam.visible=false;foam.scale.set(.8,.8,1);
  const reticle=new T.Sprite(own(new T.SpriteMaterial({map:ringTex,color:'#cfefff',transparent:true,opacity:.9,depthWrite:false,depthTest:false,fog:false})));reticle.scale.setScalar(.7);reticle.visible=false;scene.add(reticle);
  const friendRing=new T.Mesh(ringGeo,ringMatFriend);friendRing.rotation.x=-Math.PI/2;friendRing.visible=false;scene.add(friendRing);
  // smoke layer: two translucent planes that come down from the ceiling as the room fills; never below the smoke floor
  const smokeMat=own(new T.MeshBasicMaterial({color:'#15161a',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,fog:false}));
  const smokeTop=new T.Mesh(own(new T.PlaneGeometry(ROOM_WIDTH+1.2,ROOM_DEPTH+1.6)),smokeMat),smokeLow=new T.Mesh(smokeTop.geometry,own(new T.MeshBasicMaterial({color:'#20222a',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,fog:false})));
  smokeTop.rotation.x=smokeLow.rotation.x=-Math.PI/2;scene.add(smokeTop,smokeLow);
  // water: a dynamic tube from the nozzle to the impact (the street's technique) plus drops along it
  const SEG=18,SIDES=5,jetArray=new Float32Array((SEG+1)*SIDES*3),jetG=own(new T.BufferGeometry()),jetIdx=[];
  for(let i=0;i<SEG;i++)for(let j=0;j<SIDES;j++){const a=i*SIDES+j,b=i*SIDES+(j+1)%SIDES;jetIdx.push(a,b,a+SIDES,b,b+SIDES,a+SIDES);}
  jetG.setAttribute('position',new T.BufferAttribute(jetArray,3).setUsage(T.DynamicDrawUsage));jetG.setIndex(jetIdx);
  const jetMat=own(new T.MeshBasicMaterial({color:'#bfe9f7',transparent:true,opacity:.86,fog:false})),jet=new T.Mesh(jetG,jetMat);jet.frustumCulled=false;jet.visible=false;scene.add(jet);
  const DROPS=lite?24:48,dropPos=new Float32Array(DROPS*3),dropG=own(new T.BufferGeometry());dropG.setAttribute('position',new T.BufferAttribute(dropPos,3).setUsage(T.DynamicDrawUsage));
  const drops=new T.Points(dropG,own(new T.PointsMaterial({map:disc,color:'#dff6ff',size:.11,transparent:true,opacity:.9,depthWrite:false,sizeAttenuation:true,fog:false})));drops.frustumCulled=false;drops.visible=false;scene.add(drops);
  const nozzle=new T.Vector3(-1.5,1.1,2.8),impact=new T.Vector3(),tmp=new T.Vector3(),tmp2=new T.Vector3();
  // ---- firefighter and friend ------------------------------------------------------------------------------------------------------------
  let crew=null,crewRig=null,crewYaw=Math.PI,friend=null;const friends=new Map();
  const GRIP={elbowX:.3,elbowY:.95,elbowZ:.22,handX:.12,handY:.98,handZ:.55};
  async function loadCrew(){try{const g=await loadGLB(V24_ASSETS.firefighter);if(disposed)return;const visual=fitModel(g.scene,{path:'firefighter',rotationY:0,scale:1},{height:1.78});visual.position.set(-1.9,0,3.1);visual.rotation.y=Math.PI;scene.add(visual);crew=visual;crewRig=createFireCrewRig(g.scene,g.animations,GRIP);}catch{crew=null;}}
  async function friendObject(id){
    if(!friends.has(id)){
      const pending=loadGLB(V24_ASSETS.friends+id+'.glb').then(g=>{const clips=new Map();for(const c of g.animations){if(c.name==='walk_out'){const w=c.clone();w.tracks=w.tracks.filter(t=>!/^Root\.position/.test(t.name));clips.set('walk',w);}clips.set(c.name,c);}return {root:g.scene,clips};});friends.set(id,pending);
      if(roomBarrier)void pending.catch(()=>{if(friends.get(id)===pending)friends.delete(id);});
    }
    return friends.get(id);
  }
  function mountFriend(data,state){if(friend){scene.remove(friend.root);friend.mixer.stopAllAction();}
    const root=data.root,mixer=new T.AnimationMixer(root);root.position.fromArray(state.pos);root.rotation.y=0;root.visible=true;scene.add(root);
    const play=(name,once=false,speed=1)=>{const clip=data.clips.get(name);if(!clip)return;mixer.stopAllAction();const a=mixer.clipAction(clip);a.reset();a.setLoop(once?T.LoopOnce:T.LoopRepeat,Infinity);a.clampWhenFinished=once;a.timeScale=speed;a.play();};
    friend={root,mixer,play,mode:null,state};play('scared');friend.mode='waiting';}
  // ---- events from the model ---------------------------------------------------------------------------------------------------------
  let eventIndex=0,disposed=false,ready=false,loadFailed=false,time=0,width=1,height=1;
  const pending=[];let mountedRoomIndex=-1,roomRequest=0;
  async function prepare(){
    const plan=model.plan;try{
      const first=plan.rooms[0];const [object,friendData]=await Promise.all([roomObject(first),friendObject(first.friend),loadCrew()]);
      if(disposed)return;mountRoom(object,first);mountFriend(friendData,model.rooms[0].friend);mountedRoomIndex=0;ready=true;
      for(const def of plan.rooms.slice(1)){void roomObject(def).catch(()=>{});void friendObject(def.friend).catch(()=>{});}
    }catch{loadFailed=true;}
  }
  void prepare();
  async function switchRoom(index){
    if(roomBarrier&&mountedRoomIndex===index&&ready)return;
    const def=model.plan.rooms[index],request=++roomRequest;
    if(roomBarrier){ready=false;loadFailed=false;roomRoot.visible=false;pickables=[];friendRing.visible=false;if(friend)friend.root.visible=false;}
    try{
      const [object,data]=await Promise.all([roomObject(def),friendObject(def.friend)]);
      if(disposed||model.roomIndex!==index||(roomBarrier&&request!==roomRequest))return;
      mountRoom(object,def);mountFriend(data,model.rooms[index].friend);for(const f of flames.values()){scene.remove(f.sprite,f.glow,f.ring);}flames.clear();for(const b of burnables.values())b.done=false;cam.dolly=0;
      mountedRoomIndex=index;if(roomBarrier){roomRoot.visible=true;ready=true;}
    }catch{if(roomBarrier&&!disposed&&request===roomRequest)loadFailed=true;}
  }
  function burst(pos){const b=bursts.find(x=>x.t<0)||bursts[0];b.t=0;b.s.position.fromArray(pos);b.s.visible=true;b.s.scale.set(1.4,2.8,1);for(let i=0;i<4;i++)spawnSteam(pos,.9);}
  function spawnPuff(pos,heat){const p=puffs.find(x=>!x.s.visible);if(!p)return;p.s.visible=true;p.life=0;p.max=2.2+Math.random()*1.2;p.size=.5+heat*.5;p.s.position.set(pos[0]+(Math.random()-.5)*.3,pos[1]+.5,pos[2]+(Math.random()-.5)*.3);p.vel.set((Math.random()-.5)*.25,.55+Math.random()*.3,(Math.random()-.5)*.2);}
  function spawnSteam(pos,size=.6){const p=steams.find(x=>!x.s.visible);if(!p)return;p.s.visible=true;p.life=0;p.max=1+Math.random()*.6;p.size=size;p.s.position.set(pos[0]+(Math.random()-.5)*.4,pos[1]+.2,pos[2]+(Math.random()-.5)*.4);p.vel.set((Math.random()-.5)*.6,1+Math.random()*.6,(Math.random()-.5)*.6);}
  let puffAcc=0,steamAcc=0,sparkT=0;
  function consumeEvents(){const list=model.events;while(eventIndex<list.length){const e=list[eventIndex++];
      if(e.kind==='out'){const spot=model.room?.spots.find(s=>s.id===e.id);if(spot){burst(spot.pos);char(spot.id);}}
      else if(e.kind==='room'){void switchRoom(e.index);}
      else if(e.kind==='rescue'){friend?.play('rescued',true,1.7);if(friend)friend.mode='rescued';}
      else if(e.kind==='clear'){cam.zoomExit=1;}
      else if(e.kind==='feedback'&&e.key==='fire.v24.say.electric'){sparkT=.6;}
    }}
  // ---- per frame -----------------------------------------------------------------------------------------------------------------------
  function update(dt){
    if(disposed)return;time+=dt;consumeEvents();if(roomBarrier&&!ready)return;
    const room=model.room,inRoom=model.inRoom;
    // camera: dolly in on a new room, a slow breath, a lean toward the aim, a look at the exit when the room is clear
    cam.dolly=Math.min(1,cam.dolly+dt/.9);const d=smooth(cam.dolly);
    const sway=Math.sin(time*.55)*.08,bob=Math.sin(time*.8)*.035;const aimX=model.aim?clamp(model.aim[0]/3.2,-1,1)*.35:0;
    cam.sway=damp(cam.sway,aimX,3,dt);
    const exitPull=model.phase==='clear'?smooth(model.phaseTime/1.2):0;
    camera.position.set(cam.pos.x+sway+cam.sway*.4,cam.pos.y+bob,10.8+(cam.pos.z-10.8)*d-exitPull*.6);
    tmp.set(cam.look.x+cam.sway+exitPull*1.6,cam.look.y+exitPull*.2,cam.look.z-exitPull*.8);camera.lookAt(tmp);camera.fov=36-exitPull*3;camera.updateProjectionMatrix();
    // flames and lights
    const burning=[];
    if(room)for(const s of room.spots){const f=flameFor(s);const heat=s.done?0:clamp(s.heat/s.maxHeat*1.1);const flare=s.flare>0?1+.5*s.flare:1;
      f.sprite.visible=heat>0;f.glow.visible=heat>0;f.ring.visible=heat>0;
      if(heat>0){const h=.9+1.6*heat*flare,w=h*.5;f.sprite.scale.set(w*(1+.06*Math.sin(time*9+f.seed)),h*(1+.05*Math.sin(time*7+f.seed*2)),1);f.sprite.userData.frame(Math.floor(time*12+f.phase));f.glow.scale.setScalar(1.6+1.8*heat);f.glow.material.opacity=.22+.2*heat+.06*Math.sin(time*13+f.seed);
        f.ring.material.opacity=.35+.3*Math.abs(Math.sin(time*2.2+f.seed));f.ring.scale.setScalar(1+.12*Math.sin(time*2.2+f.seed)+(s.r-.6)*.6);burning.push({s,heat,f});
        puffAcc+=dt*(1.4+heat*1.8)*(lite?.6:1);while(puffAcc>=1){puffAcc-=1;spawnPuff(s.pos,heat);}
        if(model.hitSpot===s.id&&model.spraying&&model.tool!=='blanket'){steamAcc+=dt*8;while(steamAcc>=1){steamAcc-=1;spawnSteam(s.pos,.55+.3*heat);}}
      }
      if(s.done)char(s.id);
    }
    burning.sort((a,b)=>b.heat-a.heat);
    fireLights.forEach((l,i)=>{const b=burning[i];if(!b){l.intensity=damp(l.intensity,0,8,dt);return;}l.position.set(b.s.pos[0],b.s.pos[1]+.6,b.s.pos[2]+.2);l.intensity=damp(l.intensity,b.heat*(2.4+.7*Math.sin(time*17+b.f.seed)+.4*Math.sin(time*29+b.f.seed*3)),10,dt);});
    for(const p of puffs){if(!p.s.visible)continue;p.life+=dt;const u=p.life/p.max;if(u>=1){p.s.visible=false;continue;}p.s.position.addScaledVector(p.vel,dt);p.vel.y*=1-.4*dt;const sz=p.size*(.6+u*1.6);p.s.scale.set(sz,sz,1);p.s.material.opacity=.55*(1-u)*(u<.15?u/.15:1);p.s.userData.frame(Math.floor(u*15.99));}
    for(const p of steams){if(!p.s.visible)continue;p.life+=dt;const u=p.life/p.max;if(u>=1){p.s.visible=false;continue;}p.s.position.addScaledVector(p.vel,dt);const sz=p.size*(.5+u*1.5);p.s.scale.set(sz,sz,1);p.s.material.opacity=.7*(1-u);p.s.userData.frame(Math.floor(u*15.99));}
    for(const b of bursts){if(b.t<0)continue;b.t+=dt;const u=b.t/.6;if(u>=1){b.t=-1;b.s.visible=false;continue;}b.s.userData.frame(Math.floor(u*7.99));b.s.material.opacity=1-u*.6;}
    // smoke layer, fog
    if(room){const line=smokeLine(room,tuning),dense=clamp(room.smoke);smokeTop.position.y=line;smokeLow.position.y=Math.max(tuning.smokeFloor-.2,line-.45);smokeMat.opacity=.12+.62*dense;smokeLow.material.opacity=.3*dense;scene.fog.near=9-dense*3.5;scene.fog.far=26-dense*8;}
    // water / tool stream
    const spraying=model.spraying&&model.aim&&inRoom;let start=nozzle;
    if(crew){crew.position.y=Math.sin(time*1.6)*.015;if(model.aim){const dx=model.aim[0]-crew.position.x,dz=model.aim[2]-crew.position.z;const want=Math.atan2(dx,dz);crewYaw=damp(crewYaw,want,6,dt);}else crewYaw=damp(crewYaw,Math.PI,2,dt);crew.rotation.y=crewYaw;
      if(crewRig){crewRig.update(dt,false,Boolean(spraying));if(crewRig.hand(tmp2))start=tmp2;}}
    jet.visible=Boolean(spraying)&&model.tool!=='extinguisher';drops.visible=Boolean(spraying)&&model.tool==='water';splash.visible=Boolean(spraying)&&model.tool==='water';foam.visible=Boolean(spraying)&&model.tool==='foam';reticle.visible=Boolean(model.aim)&&inRoom;
    if(model.aim){impact.fromArray(model.aim);reticle.position.copy(impact);reticle.position.y+=.05;reticle.material.opacity=.6+.3*Math.sin(time*6);reticle.scale.setScalar(.6+.08*Math.sin(time*6));}
    if(spraying){
      const press=model.tanks[model.tool]??1,rise=Math.max(.3,start.distanceTo(impact)*.22);jetMat.color.set(model.tool==='foam'?'#f6f1dc':'#bfe9f7');
      const radius=(model.tool==='foam'?.075:.045)*(.5+.5*press);
      for(let i=0;i<=SEG;i++){const t=i/SEG,u=1-t;const cx=u*start.x+t*impact.x,cy=u*start.y+t*impact.y+4*u*t*rise,cz=u*start.z+t*impact.z;const taper=radius*(1+t*1.2);
        for(let j=0;j<SIDES;j++){const a=j/SIDES*Math.PI*2,k=(i*SIDES+j)*3;jetArray[k]=cx+Math.cos(a)*taper;jetArray[k+1]=cy+Math.sin(a)*taper;jetArray[k+2]=cz+Math.sin(a+1)*taper*.6;}}
      jetG.attributes.position.needsUpdate=true;
      for(let i=0;i<DROPS;i++){const t=((i/DROPS)+time*1.7)%1,u=1-t;const k=i*3;dropPos[k]=u*start.x+t*impact.x+Math.sin(i*7.1+time*9)*.08*t;dropPos[k+1]=u*start.y+t*impact.y+4*u*t*rise+Math.cos(i*3.3+time*8)*.07*t-t*t*.25;dropPos[k+2]=u*start.z+t*impact.z+Math.cos(i*5.7+time*7)*.08*t;}
      dropG.attributes.position.needsUpdate=true;
      splash.position.copy(impact);splash.position.y+=.02;splash.userData.frame(Math.floor(time*15));foam.position.copy(impact);foam.userData.frame(Math.floor(time*10));
      if(model.tool==='extinguisher'){steamAcc+=dt*14;while(steamAcc>=1){steamAcc-=1;const t=.55+Math.random()*.45;tmp.lerpVectors(start,impact,t);spawnSteam([tmp.x,tmp.y,tmp.z],.4+t*.5);}}
    }
    // sparks on an electric mistake
    if(sparkT>0){sparkT-=dt;const s=room?.spots.find(x=>x.spark>0)||room?.spots.find(x=>x.kind==='electric');if(s){sparks.visible=true;sparks.position.fromArray(s.pos);sparks.position.y+=.3;sparks.userData.frame(Math.floor(time*16));}}else sparks.visible=false;
    // friend: scared while waiting, jumps when rescued, walks out through the door, a ring under them when they can be reached
    if(friend&&room){const st=room.friend;friend.mixer.update(dt);
      if(st.state==='walking'||st.state==='team'){if(friend.mode!=='walking'){friend.play('walk',false,1.6);friend.mode='walking';}const t=smooth(st.t);friend.root.position.set(st.pos[0]+(st.exit[0]-st.pos[0])*t,0,st.pos[2]+(st.exit[2]-st.pos[2])*t);friend.root.rotation.y=Math.atan2(st.exit[0]-st.pos[0],st.exit[2]-st.pos[2]);friend.root.visible=st.t<.98;}
      else if(st.state==='out')friend.root.visible=false;
      const near=room.spots.find(x=>x.id===st.near);friendRing.visible=st.state==='waiting'&&inRoom&&Boolean(!near||near.done);
      if(friendRing.visible){friendRing.position.set(st.pos[0],.03,st.pos[2]);friendRing.scale.setScalar(1.15+.15*Math.sin(time*3));ringMatFriend.opacity=.5+.3*Math.sin(time*3);}}
  }
  // ---- picking and projection ----------------------------------------------------------------------------------------------------------
  const ray=new T.Raycaster(),ndc=new T.Vector2(),backWall=new T.Plane(new T.Vector3(0,0,1),ROOM_DEPTH/2),floor=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();
  function pick(x,y){if(roomBarrier&&!ready)return null;ndc.set(x/width*2-1,1-y/height*2);ray.setFromCamera(ndc,camera);
    const hits=ray.intersectObjects(pickables,false).filter(h=>h.object.visible&&h.object.parent?.visible!==false);
    if(hits.length){const p=hits[0].point;return [p.x,p.y,p.z];}
    if(ray.ray.intersectPlane(backWall,hit)&&hit.y>=0&&hit.y<=ROOM_HEIGHT+.5)return [hit.x,hit.y,hit.z];
    if(ray.ray.intersectPlane(floor,hit))return [hit.x,0,hit.z];return null;}
  function project(p){tmp.fromArray(p).project(camera);return {x:(tmp.x+1)*width/2,y:(1-tmp.y)*height/2};}
  function resize(w,h,dpr){width=Math.max(1,w);height=Math.max(1,h);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  function render(){if(disposed||(roomBarrier&&!ready))return;renderer.render(scene,camera);}
  function metrics(){const info=renderer.info.render;let triangles=0,draws=0;scene.traverseVisible(o=>{if(o.isMesh||o.isSprite||o.isPoints){const g=o.geometry;triangles+=g?Math.round((g.index?.count||g.attributes.position?.count||0)/3):2;draws++;}});return {triangles:info.triangles,drawCalls:info.calls,sceneTriangles:triangles,sceneObjects:draws,crew:Boolean(crew),friend:Boolean(friend),roomBuilt:Boolean(roomVisual?.userData.built),burnables:burnables.size,puffs:puffs.filter(p=>p.s.visible).length,lite,width,height,ready,loadFailed};}
  function dispose(){if(disposed)return;disposed=true;friend?.mixer.stopAllAction();crewRig?.dispose();scene.traverse(o=>{if(o.geometry&&!disposables.has(o.geometry))o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m&&!disposables.has(m)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});for(const d of disposables)d.dispose?.();disposables.clear();scene.clear();renderer.dispose();renderer.forceContextLoss?.();}
  return {get ready(){return ready;},get loadFailed(){return loadFailed;},scene,camera,update,render,resize,pick,project,metrics,dispose,retryRoom(){if(!roomBarrier||disposed||ready)return false;void switchRoom(model.roomIndex);return true;},get crewPosition(){return crew?crew.position:null;}};
}
