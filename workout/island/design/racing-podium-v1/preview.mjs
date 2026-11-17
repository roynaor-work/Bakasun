import * as THREE from '../racing-v7/vendor/three.module.js';
import { GLTFLoader } from '../racing-v7/vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from '../racing-v7/vendor/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const info = {
  exit_car: ['ירידה מהרכב', 'מהמושב אל החגיגה'],
  helmet_lift: ['הרמת קסדה', 'המרוץ נגמר. החיוך מתחיל.'],
  wave: ['נפנוף ידיים', 'תודה לכל מי שהיה בדרך'],
  victory_dance: ['ריקוד שמחה', 'לתת לשמחה לקחת את ההגה'],
  disappointment: ['אכזבה', 'נושמים. המרוץ הבא כבר מחכה.'],
  handshake: ['לחיצת יד', 'כבוד לדרך. כבוד למתחרים.'],
  podium_idle: ['עמידה על הפודיום', 'שלושה מקומות. רגע אחד.'],
  trophy_lift: ['הרמת גביע', 'כל הדרך למקום הראשון']
};
const order = Object.keys(info);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0e272d, 0.024);
const camera = new THREE.OrthographicCamera(-5, 5, 2.2, -2.2, .1, 80);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
scene.add(new THREE.HemisphereLight(0xd3ebe4, 0x304a43, 2.0));
const sun = new THREE.DirectionalLight(0xffeccb, 3.1);
sun.position.set(-3, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {left:-5,right:5,top:5,bottom:-5,near:.5,far:20});
sun.shadow.bias = -.00015;
sun.shadow.normalBias = .012;
sun.shadow.radius = 3;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x73d9d1, 2.6);
rim.position.set(4, 4, -4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xf6ad84, .75);
fill.position.set(-5, 2, 2);
scene.add(fill);

const standard = (color, roughness=.6, metalness=.15) => new THREE.MeshStandardMaterial({color, roughness, metalness});
const floorMat = standard(0x122e31,.77,.15);
const goldMat = standard(0xd7bc7f,.32,.75);
const darkMat = standard(0x0c1b21,.5,.25);
const stage = new THREE.Group();
scene.add(stage);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.8,4.92,.14,96),floorMat);
floor.position.y = -.09;
floor.receiveShadow = true;
stage.add(floor);
const edge = new THREE.Mesh(new THREE.TorusGeometry(4.82,.018,6,128),goldMat);
edge.rotation.x = Math.PI/2;
edge.position.y = -.025;
stage.add(edge);
const inner = new THREE.Mesh(new THREE.TorusGeometry(3.48,.012,4,96),standard(0x698a7c,.5,.45));
inner.rotation.x=Math.PI/2;
inner.position.y=-.012;
stage.add(inner);
const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.56,2.7,.16,64),darkMat);
platform.position.set(0,-.04,-.1);
platform.receiveShadow=true;
stage.add(platform);
const platformRim = new THREE.Mesh(new THREE.TorusGeometry(2.57,.014,5,96),goldMat);
platformRim.rotation.x=Math.PI/2;
platformRim.position.set(0,.043,-.1);
stage.add(platformRim);

const seat = new THREE.Group();
seat.name='RacingSeatContext';
seat.visible=false;
scene.add(seat);
function box(w,h,d,x,y,z,mat,parent=seat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
const seatBlack=standard(0x101a1e,.78,.08), seatRed=standard(0xc85e4e,.78,.06);
box(.52,.13,.46,-.4,.46,-.12,seatBlack);
const seatBack=box(.48,.72,.13,-.4,.85,-.36,seatBlack);seatBack.rotation.x=-.12;
box(.13,.55,.21,-.65,.80,-.32,seatRed);
box(.13,.55,.21,-.15,.80,-.32,seatRed);
box(.29,.20,.15,-.4,1.29,-.38,seatRed);
box(.052,.54,.028,-.49,.85,-.265,darkMat);
box(.052,.54,.028,-.31,.85,-.265,darkMat);
box(.65,.06,.61,-.4,.12,-.12,standard(0x273c41,.42,.6));
box(.09,.19,.87,-.76,.23,-.14,seatRed);
box(.08,.1,.88,-.02,.18,-.14,seatRed);

const confettiCount=168;
const confettiGeo=new THREE.PlaneGeometry(.025,.058);
const confettiMat=new THREE.MeshStandardMaterial({roughness:.4,metalness:.3,side:THREE.DoubleSide});
const confetti=new THREE.InstancedMesh(confettiGeo,confettiMat,confettiCount);
confetti.name='CelebrationConfetti';
confetti.frustumCulled=false;
scene.add(confetti);
const piece=new THREE.Object3D();
const palettes=[0xf1cf7f,0xe66b54,0x72d4c3,0xf8efd8];
const noise=n=>{const a=Math.sin(n*73.53+17.31)*43758.5453;return a-Math.floor(a);};
for(let i=0;i<confettiCount;i++) confetti.setColorAt(i,new THREE.Color(palettes[i%4]));

const loader=new GLTFLoader();
const load=name=>loader.loadAsync(new URL(`assets/${name}.glb`,import.meta.url).href);
const data={};
const actors=[];
const flags=[];
const flagMixers=[];
const state={ready:false,clip:'trophy_lift',gender:'male',time:0,duration:3,playing:true,effects:true,sprayFrame:0,error:null};
let podium,partner,spray,bottle,clockTime=0,last=performance.now(),metadata={};
const scratch=new THREE.Vector3();

function prepare(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true; if(o.material) {o.material=o.material.clone();o.material.envMapIntensity=.65;}}});return root;}
function prop(name){return prepare(data[name].scene.clone(true));}
function driver(gender,primary,secondary){
  const gltf=data[`driver-${gender}`];
  const root=prepare(cloneSkeleton(gltf.scene));
  root.name=`PreviewDriver-${gender}-${actors.length}`;
  const bones={};
  root.traverse(o=>{
    if(o.isBone) bones[o.name]=o;
    if(o.isMesh && o.geometry){
      o.geometry=o.geometry.clone();
      const colors=o.geometry.getAttribute('color');
      const mask=o.geometry.getAttribute('_team_mask')||o.geometry.getAttribute('_TEAM_MASK');
      if(colors&&mask){
        const updated=colors.clone(), p=new THREE.Color(primary),s=new THREE.Color(secondary);
        for(let i=0;i<colors.count;i++){
          const m=mask.getX(i);
          if(m>.5){const c=m<1.5?p:s;updated.setXYZ(i,c.r,c.g,c.b);}
        }
        o.geometry.setAttribute('color',updated);
      }
    }
  });
  scene.add(root);
  const actor={root,bones,gender,mixer:new THREE.AnimationMixer(root),clips:gltf.animations,action:null,props:{},floor:0,floorY:0};
  actors.push(actor);
  return actor;
}
function animate(actor,id){
  actor.mixer.stopAllAction();
  const clip=actor.clips.find(c=>c.name===id);
  if(!clip) throw new Error(`Missing animation ${id}`);
  const action=actor.mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
  action.play();actor.action=action;
  actor.clip=id;actor.duration=clip.duration;
}
function socket(actor,name,asset,position=[0,0,0],rotation=[0,0,0]){
  const root=prop(asset);
  root.position.fromArray(position);root.rotation.fromArray(rotation);
  actor.bones[name].add(root);
  actor.props[asset]=root;
  return root;
}
function rebuildActors(){
  for(const actor of actors){scene.remove(actor.root);actor.mixer.stopAllAction();actor.root.traverse(o=>{if(o.isMesh&&o.geometry)o.geometry.dispose();});}
  actors.length=0;
  const main=driver(state.gender,0xe66d59,0x263844);
  const left=driver(state.gender==='male'?'female':'male',0x45afa6,0x243943);
  const right=driver(state.gender,0xd3ae58,0x3b3440);
  partner=driver(state.gender==='male'?'female':'male',0x45afa6,0x243943);
  partner.root.visible=false;
  socket(main,'RightHand','trophy',[-.035,0,-.014]);
  socket(main,'RightHand','helmet',[-.035,0,-.014]);
  for(const [actor,asset] of [[main,'gold-medal'],[left,'silver-medal'],[right,'bronze-medal']]) socket(actor,'Neck',asset,[0,.005,.125]);
  bottle=socket(right,'LeftHand','champagne',[.02,.01,.02],[0,0,-.6]);
  applyClip(state.clip);
  api.actors=actors;
}
function applyClip(id){
  if(!info[id]||!actors.length)return;
  state.clip=id;state.time=0;
  $('clip').value=id;$('clip-title').textContent=info[id][0];$('clip-note').textContent=info[id][1];
  $('clip-number').textContent=String(order.indexOf(id)+1).padStart(2,'0');
  const solo=id==='exit_car'||id==='handshake';
  const [main,left,right]=actors;
  podium.visible=!solo;platform.visible=!solo;platformRim.visible=!solo;
  for(const flag of flags)flag.visible=!solo;
  main.root.position.set(0,solo?0:.82,solo?.36:0);main.root.rotation.set(0,0,0);main.floor=solo?0:.82;
  left.root.position.set(-1.18,.56,0);left.floor=.56;
  right.root.position.set(1.18,.36,0);right.floor=.36;
  left.root.visible=right.root.visible=!solo;
  partner.root.visible=id==='handshake';partner.root.position.set(-.39,0,1.192);partner.root.rotation.y=Math.PI;partner.floor=0;
  for(const actor of actors)actor.floorY=actor.floor;
  seat.visible=id==='exit_car';seat.position.set(0,0,.36);
  for(const actor of actors){for(const p of Object.values(actor.props))p.visible=true;}
  main.props.trophy.visible=id==='trophy_lift';
  main.props.helmet.visible=id==='helmet_lift';
  main.props['gold-medal'].visible=!solo&&id!=='helmet_lift';
  animate(main,id);
  animate(left,'wave');animate(right,'podium_idle');animate(partner,'handshake');
  state.duration=main.duration;
  document.querySelectorAll('.place-label').forEach(e=>e.hidden=solo);
  updateCamera();
  setTime(0);
}
function sampleActor(actor,time){
  actor.action.reset();actor.action.play();
  actor.mixer.setTime(Math.min(Math.max(time,0),actor.duration));
  actor.root.updateMatrixWorld(true);
}
function sample(time){
  if(!state.ready)return;
  state.time=Math.min(Math.max(time,0),state.duration);
  sampleActor(actors[0],state.time);
  sampleActor(actors[1],state.time%actors[1].duration);
  sampleActor(actors[2],state.time%actors[2].duration);
  sampleActor(partner,state.time);
  for(let i=0;i<flagMixers.length;i++)flagMixers[i].setTime(state.time%2);
  const fxTime=state.time;
  for(let i=0;i<confettiCount;i++){
    const phase=(noise(i+9)*4.7+fxTime*(.45+noise(i+300)*.55))%4.7;
    const x=(noise(i+31)-.5)*7.2+Math.sin(fxTime*1.7+i)*.18;
    piece.position.set(x,4.25-phase,(noise(i+57)-.5)*3.8-.1);
    piece.rotation.set(fxTime*2+i,fxTime*1.4+i*.27,fxTime*3+i);
    piece.scale.setScalar(.55+noise(i+400)*.9);
    piece.updateMatrix();confetti.setMatrixAt(i,piece.matrix);
  }
  confetti.instanceMatrix.needsUpdate=true;
  confetti.visible=state.effects&&state.clip!=='disappointment'&&state.clip!=='exit_car'&&state.clip!=='handshake';
  if(spray){
    state.sprayFrame=Math.floor(fxTime*12)%8;
    spray.material.map.offset.x=state.sprayFrame/8;
    spray.visible=state.effects&&bottle.parent.parent.parent.visible&&actors[2].root.visible&&state.clip!=='disappointment';
    bottle.updateWorldMatrix(true,false);
    spray.position.copy(bottle.localToWorld(scratch.set(0,.215,0)));
  }
  $('timeline').value=String(Math.round(state.time/state.duration*1000));
  $('timeline').style.setProperty('--progress',`${state.time/state.duration*100}%`);
  $('time').textContent=`${state.time.toFixed(1)} / ${state.duration.toFixed(1)}`;
  scene.updateMatrixWorld(true);
}
function setTime(time){sample(Number(time));render();return getState();}
function setPlaying(value){state.playing=!!value;$('play').setAttribute('aria-label',value?'השהיה':'ניגון');$('play').title=value?'השהיה':'ניגון';$('play-icon').setAttribute('d',value?'M6 4h3v12H6zm5 0h3v12h-3z':'M6 3l11 7-11 7z');return state.playing;}
function setEffects(value){state.effects=!!value;$('effects').checked=state.effects;sample(state.time);render();}
function selectGender(gender){if(!['male','female'].includes(gender)||!state.ready)return;const t=state.time;state.gender=gender;rebuildActors();$('male').setAttribute('aria-pressed',gender==='male');$('female').setAttribute('aria-pressed',gender==='female');setTime(Math.min(t,state.duration));}
function getState(){return {...state,activeActors:actors.filter(a=>a.root.visible).map(a=>({gender:a.gender,clip:a.clip,floor:a.floor,position:a.root.position.toArray(),bones:Object.keys(a.bones)})),triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls};}
function updateCamera(){
  const w=canvas.clientWidth,h=canvas.clientHeight,aspect=w/h;
  const solo=state.clip==='exit_car'||state.clip==='handshake';
  const height=Math.max(solo?3.85:4.12,6.3/aspect);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
  camera.position.set(state.clip==='handshake'?7:solo?3.6:2.5,solo?3.15:3.7,12);
  camera.lookAt(0,solo?.86:1.26,0);
  camera.updateProjectionMatrix();
  for(const [id,x,y] of [[1,0,.09],[2,-1.18,.1],[3,1.18,.1]]){
    const p=new THREE.Vector3(x,y,.74).project(camera);
    $(`label-${id}`).style.left=`${(p.x*.5+.5)*w}px`;
    $(`label-${id}`).style.top=`${(-p.y*.5+.5)*h+5}px`;
  }
}
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);updateCamera();render();}
function render(){renderer.render(scene,camera);}
const api={ready:false,actors,scene,camera,renderer,selectClip:id=>{applyClip(id);return getState();},selectGender,setTime,setPlaying,setEffects,getState};
window.__podium=api;
$('clip').addEventListener('change',e=>{applyClip(e.target.value);setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);});
$('male').addEventListener('click',()=>selectGender('male'));
$('female').addEventListener('click',()=>selectGender('female'));
$('play').addEventListener('click',()=>{if(state.time>=state.duration)setTime(0);setPlaying(!state.playing);});
$('restart').addEventListener('click',()=>setTime(0));
$('effects').addEventListener('change',e=>setEffects(e.target.checked));
$('timeline').addEventListener('input',e=>{setPlaying(false);setTime(+e.target.value/1000*state.duration);});
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{last=performance.now();});

async function boot(){
  const names=['driver-male','driver-female','podium','trophy','helmet','gold-medal','silver-medal','bronze-medal','champagne','checkered-flag'];
  await Promise.all(names.map(async name=>{data[name]=await load(name);}));
  metadata=await fetch(new URL('motions.json',import.meta.url)).then(r=>r.json());
  podium=prop('podium');stage.add(podium);
  for(const [x,flip] of [[-2.62,false],[2.62,true]]){
    const gltf=data['checkered-flag'];const flag=prepare(gltf.scene.clone(true));
    flag.position.set(x,0,-.84);flag.rotation.y=flip?Math.PI:.08;flag.scale.setScalar(.87);
    scene.add(flag);flags.push(flag);
    if(gltf.animations.length){const mixer=new THREE.AnimationMixer(flag);mixer.clipAction(gltf.animations[0]).play();flagMixers.push(mixer);}
  }
  const texture=await new THREE.TextureLoader().loadAsync(new URL('assets/champagne-spray.png',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.repeat.set(1/8,1);
  const sprayMat=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,rotation:.52,opacity:.8});
  spray=new THREE.Sprite(sprayMat);spray.center.set(.055,.5);spray.scale.set(1.4,.7,1);spray.name='ChampagneSpray8Frames';scene.add(spray);
  rebuildActors();
  state.ready=api.ready=true;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setPlaying(!reduce);
  resize();setTime(state.clip==='trophy_lift'?state.duration*.67:0);
  $('loading').hidden=true;
  function frame(now){requestAnimationFrame(frame);const delta=Math.min((now-last)/1000,.05);last=now;if(!state.ready||document.hidden)return;clockTime+=delta;if(state.playing){let next=state.time+delta;if(next>state.duration){const clip=metadata.clips?.find(c=>c.id===state.clip);if(clip?.loop)next%=state.duration;else{next=state.duration;setPlaying(false);}}sample(next);}render();}
  requestAnimationFrame(frame);
}
boot().catch(err=>{console.error(err);state.error=String(err);$('loading').hidden=true;$('error').hidden=false;$('error').textContent='התצוגה לא נטענה. יש לפתוח אותה משרת מקומי ולוודא שכל קובצי החבילה זמינים.';});
