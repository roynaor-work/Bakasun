// אי החזירים — הגנת החווה · v0.4
// Fixed first-person beach turret vs. robot boars. All models, textures and sounds are generated in code.
import * as THREE from './vendor/three.module.js';
import {clamp,rand,damp,TOUCH,QUALITY,HIGH,setQuality,shoreZ,groundY,seaWave,setRenderer,mat,geo,rb,cyl,cylZ,sph,mesh,radial,compact,compactTree,T,worn} from './kit.js';
import {createWorld} from './world.js';
import {createGuns} from './guns.js';
import {makeShark,makeManta,makeCrab,makeTurtle,makeLeviathan} from './creatures.js';
import {createWeather} from './weather.js';
import {freshSave,sanitizeSave,stats,weaponStats,WEAPONS,WEAPON_ORDER,WEAPON_MAX,UPGRADE_DEFS,PERKS,ENEMIES,buyUpgrade,upgradeCost,buyWeapon,weaponCost,wavePlan,enemyStats,tickHeat,computeDamage,waveBonus,sustainedDps,isBoss,waveWeather,WEATHER} from './core.mjs';

const $=id=>document.getElementById(id);
const QA=new URLSearchParams(location.search).has('qa');
const ISLAND=new URLSearchParams(location.search).has('island');
let islandPaused=false,islandDisposed=false,islandFrame,islandReady=false;
const SAVE_KEY='boar-island-v1';
let save;try{save=sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY)));}catch{save=freshSave();}
function persist(){if(benchActive)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{$('save-note').textContent='השמירה אינה זמינה בדפדפן הזה';}}

// ---------- state ----------
let world,renderer,scene,camera,sea,sun,gunRig,yoke,kick,explosionLight,muzzleLight,turrets=[];
const gunModels={};
let mode='menu',previousMode='menu',wave=save.nextWave,hp=100,fury=0,furyTimer=0;
let elapsed=0,waveTime=0,spawnIndex=0,plan=[],killed=0,roundCoins=0,roundShots=0,roundHits=0,roundCrits=0,damageTaken=0,clearTimer=-1;
let rocketCooldown=0,frostCooldown=0,frostTimer=0,trauma=0,perk='',selectedPerk='',shopFrom='menu',shopTab='weapons',slowmo=0;
let pointer={x:0,y:-.05,down:false},touchAim=null,keys=new Set(),visible=true,soundEnabled=true;
let enemies=[],shells=[],projectiles=[],showcase=[],lastTime=0,lastHud=0,bannerUntil=0,toastUntil=0,hitUntil=0,damageUntil=0;
let current='mg',wstate={},wsCache={},swapTimer=0,recoil=0,recoilRot=0,shotCount=0,boss=null,aimInfo=null,turretTimers=[0,0];
let benchActive=false,bot=false,timeScale=1,timers=[],lastShotAt=-9,firedSince=0,sandbox=false,weather,weatherKind='clear';
function later(sec,fn){timers.push({t:sec,fn});}
const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),tmp3=new THREE.Vector3(),projected=new THREE.Vector3(),raycaster=new THREE.Raycaster(),UP=new THREE.Vector3(0,1,0),ZAX=new THREE.Vector3(0,0,1);

// ---------- terrain (shapes live in kit.js) ----------
function seaY(x,z,t=elapsed){return seaWave(x,z,t);}
const surfaceY=(x,z)=>Math.max(groundY(x,z),seaY(x,z));

// ---------- audio (synthesised) ----------
const sfx={ctx:null,master:null,noise:null,last:{},teslaNode:null,
  init(){if(this.ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=5;this.master=this.ctx.createGain();this.master.gain.value=.75;this.master.connect(comp);comp.connect(this.ctx.destination);
    const len=this.ctx.sampleRate;const b=this.ctx.createBuffer(1,len,this.ctx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;this.noise=b;},
  noiseHit(t,dur,type,f0,f1,gain,q=.8){const c=this.ctx,s=c.createBufferSource();s.buffer=this.noise;s.playbackRate.value=rand(.9,1.1);const f=c.createBiquadFilter();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);const g=c.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0008,t+dur);s.connect(f);f.connect(g);g.connect(this.master);s.start(t,rand(0,.5));s.stop(t+dur+.02);},
  tone(t,dur,type,f0,f1,gain){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0008,t+dur);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);},
  rain(level){if(!this.ctx||!soundEnabled){if(this.rainGain)this.rainGain.gain.value=0;return;}if(!this.rainGain){const s=this.ctx.createBufferSource();s.buffer=this.noise;s.loop=true;const f=this.ctx.createBiquadFilter();f.type='highpass';f.frequency.value=1400;const f2=this.ctx.createBiquadFilter();f2.type='lowpass';f2.frequency.value=7000;this.rainGain=this.ctx.createGain();this.rainGain.gain.value=0;s.connect(f);f.connect(f2);f2.connect(this.rainGain);this.rainGain.connect(this.master);s.start();}
    this.rainGain.gain.value=.11*level;},
  play(type,vol=1){
    if(!soundEnabled)return;try{this.init();if(!this.ctx)return;if(this.ctx.state==='suspended')this.ctx.resume();const t=this.ctx.currentTime;
      const gap={mg:.045,hit:.04,ping:.05,tesla:.06,splash:.08,crit:.05}[type]||0;if(gap&&t-(this.last[type]||0)<gap)return;this.last[type]=t;const p=rand(.92,1.08);
      switch(type){
        case 'mg':this.noiseHit(t,.07,'bandpass',2200*p,700,.42*vol,.7);this.tone(t,.08,'sine',140*p,45,.38*vol);this.noiseHit(t,.025,'highpass',5000,3000,.12*vol);break;
        case 'shotgun':this.noiseHit(t,.32,'lowpass',3200,420,.85*vol);this.tone(t,.2,'sine',95,32,.7*vol);this.noiseHit(t+.32,.03,'highpass',2600,2000,.25);this.noiseHit(t+.42,.035,'highpass',1900,1500,.25);break;
        case 'cannon':this.tone(t,.55,'sine',70,24,.95*vol);this.noiseHit(t,.5,'lowpass',1400,160,.75*vol);this.noiseHit(t,.04,'highpass',6000,4000,.3*vol);break;
        case 'tesla':this.noiseHit(t,.05,'highpass',3200*p,6000,.13*vol);this.tone(t,.06,'sawtooth',90*p,60,.06*vol);break;
        case 'ping':this.tone(t,.22,'sine',2300*p,2100,.11*vol);this.tone(t,.16,'sine',3400*p,3300,.06*vol);break;
        case 'hit':this.tone(t,.06,'triangle',320*p,120,.12*vol);break;
        case 'crit':this.tone(t,.09,'square',880*p,1500,.06*vol);this.tone(t,.12,'sine',1320,1800,.07*vol);break;
        case 'boom':this.noiseHit(t,1.0,'lowpass',1600,120,.9*vol);this.tone(t,.7,'sine',62,26,.8*vol);break;
        case 'small-boom':this.noiseHit(t,.45,'lowpass',2200,200,.5*vol);this.tone(t,.3,'sine',90,35,.45*vol);break;
        case 'reload':this.noiseHit(t,.03,'highpass',3000,2500,.22);this.noiseHit(t+.28,.04,'highpass',2000,1600,.25);this.tone(t+.3,.05,'square',420,300,.04);break;
        case 'empty':this.noiseHit(t,.02,'highpass',4000,3500,.2);break;
        case 'overheat':this.noiseHit(t,.8,'highpass',5200,2600,.18);break;
        case 'swap':this.noiseHit(t,.05,'bandpass',1200,800,.2);this.noiseHit(t+.12,.04,'highpass',2600,2400,.18);break;
        case 'hurt':this.tone(t,.35,'sine',75,30,.65);this.noiseHit(t,.3,'lowpass',700,150,.4);break;
        case 'splash':this.noiseHit(t,.18,'lowpass',900,300,.1*vol);break;
        case 'whistle':this.tone(t,1.1,'sine',1500,520,.035);break;
        case 'alarm':for(let i=0;i<3;i++){this.tone(t+i*.42,.32,'sawtooth',520,380,.07);}break;
        case 'torpedo':this.noiseHit(t,.9,'lowpass',500,160,.45);this.tone(t,.8,'sine',140,70,.18);break;
        case 'screech':this.tone(t,.5,'sawtooth',700,1500,.06);this.tone(t+.05,.45,'square',1050,1900,.03);break;
        case 'thunder':this.noiseHit(t,2.6,'lowpass',420,60,.9*vol,.6);this.tone(t,1.8,'sine',48,28,.6*vol);this.noiseHit(t+.08,.5,'lowpass',1600,200,.35*vol);break;
        case 'roar':this.tone(t,1.4,'sawtooth',62,38,.22*vol);this.tone(t,1.2,'sine',95,50,.4*vol);this.noiseHit(t,1.3,'lowpass',600,120,.45*vol);break;
        case 'geyser':this.noiseHit(t,1.4,'bandpass',900,300,.35*vol,.5);break;
        case 'buy':this.tone(t,.09,'sine',620,620,.08);this.tone(t+.08,.14,'sine',930,930,.08);break;
        case 'coin':this.tone(t,.06,'square',1300,1300,.03);this.tone(t+.05,.09,'square',1750,1750,.03);break;
        default:this.tone(t,.16,'sine',340,900,.06);
      }
    }catch{soundEnabled=false;}
  }
};

// ---------- UI helpers ----------
function setMode(next){
  mode=next;$('game').dataset.mode=next;for(const id of ['menu','shop','pause-screen','gameover','help-screen'])$(id).hidden=true;
  const map={menu:'menu',shop:'shop',paused:'pause-screen',dead:'gameover',help:'help-screen'};if(map[next])$(map[next]).hidden=false;
  $('battle-ui').hidden=!['battle','paused'].includes(next);$('pause').hidden=next!=='battle';$('crosshair').hidden=next!=='battle';$('boss-hud').hidden=next!=='battle'||!boss;
  pointer.down=false;touchAim=null;keys.clear();updateHud();
}
function announce(title,subtitle='',time=3){$('banner').innerHTML=`${title}<small>${subtitle}</small>`;bannerUntil=elapsed+time;$('banner').style.opacity=1;}
function toast(text){$('toast').textContent=text;$('toast').style.opacity=1;toastUntil=elapsed+2.4;}

let TEX={};

// ---------- pooled effects ----------
const particles=[],sprites=[],tracers=[],debris=[],floaters=[],rings=[];
const PGEO=new THREE.BoxGeometry(1,1,1),add=THREE.AdditiveBlending;
const PMAT={};
function initEffectMaterials(){
  const basic=(color,blend=true,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:blend?add:THREE.NormalBlending,toneMapped:false});
  Object.assign(PMAT,{spark:basic('#ffd27a'),hot:basic('#fff2c0'),blue:basic('#a8e6ff'),crit:basic('#ff8a3c'),foam:basic('#f2fbff',false,.9),sand:basic('#d9c08c',false,.85),ice:basic('#bff3ff'),oil:basic('#2b3135',false,.9),tracer:basic('#ffd88a'),tracerTesla:basic('#7fe3ff',true,.85),tracerRed:basic('#ff6a4a'),brass:new THREE.MeshStandardMaterial({color:'#d7a843',metalness:.9,roughness:.3}),shellRed:new THREE.MeshStandardMaterial({color:'#b8402f',metalness:.3,roughness:.5})});
}
function emit(kind,pos,vx,vy,vz,life,size,gravity=0,stretch=0){
  if(particles.length>520)return;const m=new THREE.Mesh(PGEO,PMAT[kind]);m.position.copy(pos);m.scale.setScalar(size);scene.add(m);
  particles.push({m,vx,vy,vz,life,max:life,size,gravity,stretch});
}
function sparks(pos,n,kind='spark',force=8,size=.09){for(let i=0;i<n;i++)emit(kind,pos,rand(-force,force),rand(-force*.3,force*1.1),rand(-force,force*.6),rand(.15,.35),size*rand(.7,1.3),18,.5);}
function sprite(tex,pos,size,life,{additive=true,grow=1.8,rise=0,opacity=1,color='#ffffff',rot=0}={}){
  if(sprites.length>140)return;const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color,transparent:true,depthWrite:false,blending:additive?add:THREE.NormalBlending,opacity,rotation:rot||rand(0,6.28)}));
  m.position.copy(pos);m.scale.setScalar(size);scene.add(m);sprites.push({m,life,max:life,size,grow,rise,opacity});
}
function ring(pos,radius,life,color='#ffffff',opacity=.8){
  const m=new THREE.Mesh(geo('ring',()=>new THREE.RingGeometry(.82,1,40).rotateX(-Math.PI/2)),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));
  m.position.copy(pos);m.scale.setScalar(.2);scene.add(m);rings.push({m,life,max:life,radius,opacity});
}
function tracer(from,to,{speed=320,len=7,width=.07,kind='tracer',life=1}={}){
  const dir=tmp.copy(to).sub(from);const dist=dir.length();if(dist<.5)return;dir.normalize();
  const m=new THREE.Mesh(PGEO,PMAT[kind]);m.quaternion.setFromUnitVectors(ZAX,dir);scene.add(m);
  tracers.push({m,sx:from.x,sy:from.y,sz:from.z,dx:dir.x,dy:dir.y,dz:dir.z,dist,travel:0,speed,len,width,life});
}
function bolt(from,to,kind='tracerTesla',width=.09){ // jagged lightning made of short glowing segments, lives one tick
  const n=7;let prev=from.clone();const dist=from.distanceTo(to);
  for(let i=1;i<=n;i++){const p=from.clone().lerp(to,i/n);if(i<n)p.add(new THREE.Vector3(rand(-1,1),rand(-1,1),rand(-1,1)).multiplyScalar(dist*.035));tracer(prev,p,{speed:1e5,len:999,width,kind,life:.07});prev=p;}
}
function floatText(pos,text,cls=''){
  const el=document.createElement('div');el.className='dmg '+cls;el.textContent=text;$('enemy-labels').append(el);
  floaters.push({el,pos:pos.clone(),life:.8,max:.8,vx:rand(-.6,.6)});if(floaters.length>36){const f=floaters.shift();f.el.remove();}
}
function explode(pos,size=1,{sound=true,light=true}={}){
  for(let i=0;i<3+size*1.5;i++)sprite(TEX.fire,tmp.copy(pos).add(new THREE.Vector3(rand(-1,1),rand(-.3,1),rand(-1,1)).multiplyScalar(size*.9)),size*rand(2,3.2),rand(.25,.45),{grow:2,opacity:.8});
  for(let i=0;i<3+size*2;i++)sprite(TEX.smoke,tmp.copy(pos).add(new THREE.Vector3(rand(-1,1),rand(0,1),rand(-1,1)).multiplyScalar(size)),size*rand(2.4,3.8),rand(.9,1.6),{additive:false,grow:2.4,rise:2.2,opacity:.55,color:'#6f7378'});
  sparks(pos,Math.min(26,8+size*7),'hot',9+size*3,.12);
  if(light){explosionLight.position.copy(pos).add(new THREE.Vector3(0,2,0));explosionLight.intensity=24*size;explosionLight.distance=26*size;}
  const g=groundY(pos.x,pos.z);if(Math.abs(pos.y-g)<2.5||pos.y<1)ring(new THREE.Vector3(pos.x,Math.max(g,seaY(pos.x,pos.z))+.15,pos.z),4*size,.5,'#fff1cf',.6);
  trauma=Math.min(1,trauma+.12*size*clamp(30/Math.max(8,pos.distanceTo(camera.position)),0,1.5));if(sound)sfx.play(size>1.6?'boom':'small-boom',clamp(1.2-pos.distanceTo(camera.position)/180,.35,1));
}
function splash(pos,big=false){
  const n=big?14:6;for(let i=0;i<n;i++)emit('foam',pos,rand(-2,2),rand(4,big?11:7),rand(-2,2),rand(.4,.8),rand(.12,.26),20);
  ring(new THREE.Vector3(pos.x,seaY(pos.x,pos.z)+.06,pos.z),big?3:1.6,.6,'#eefcff',.7);
}
function sandPuff(pos){for(let i=0;i<5;i++)emit('sand',pos,rand(-2.5,2.5),rand(2,5),rand(-2.5,2.5),rand(.3,.6),rand(.1,.22),14);sprite(TEX.smoke,pos,1.4,.6,{additive:false,grow:2,rise:.6,opacity:.45,color:'#d9c391'});}

// ---------- init ----------
function init(){
  renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'});setRenderer(renderer);
  basePR=Math.min(devicePixelRatio,HIGH?1.75:1.25);renderer.setPixelRatio(basePR);renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.0;renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,1600);camera.position.set(0,8.6,24);camera.rotation.order='YXZ';camera.rotation.set(-.075,0,0);scene.add(camera);
  TEX={fire:radial([[0,'rgba(255,214,120,.95)'],[.25,'rgba(255,150,60,.75)'],[.55,'rgba(210,70,20,.35)'],[1,'rgba(0,0,0,0)']]),smoke:radial([[0,'rgba(255,255,255,.9)'],[.5,'rgba(255,255,255,.45)'],[1,'rgba(255,255,255,0)']]),flash:T('flashStar'),glow:radial([[0,'rgba(170,240,255,1)'],[.4,'rgba(90,200,255,.45)'],[1,'rgba(0,0,0,0)']])};
  initEffectMaterials();
  world=createWorld(scene,renderer);sun=world.sun;sea=world.sea;
  weather=createWeather({scene,world,camera,renderer,sfx});
  explosionLight=new THREE.PointLight('#ffb070',0,30,1.6);scene.add(explosionLight);
  muzzleLight=new THREE.PointLight('#ffcf7a',0,14,1.8);camera.add(muzzleLight);muzzleLight.position.set(0,-.6,-5);
  const G=createGuns(camera);gunRig=G.gunRig;yoke=G.yoke;kick=G.kick;Object.assign(gunModels,G.models);showWeapon(current);
  createTurrets();buildWeaponBar();
  {const warm=new THREE.Group();for(const k of Object.keys(ENEMIES)){const e=makeEnemy(k);e.root.position.set(0,-40,-30);warm.add(e.root);}scene.add(warm);try{renderer.compile(scene,camera);}catch{}scene.remove(warm);}
  for(const [x,z,k,y] of [[-8,-3,'scout'],[0,-8,'crab'],[7.5,-4,'runner'],[5,-18,'manta',9.5]]){const e=makeEnemy(k);e.root.position.set(x,y??groundY(x,z),z);e.baseX=x;e.root.rotation.y=-x*.03;scene.add(e.root);showcase.push(e);}
  updateQualityLabel();
  setMode('menu');resize();updateStartLabel();
  if(QA)installQA();
  if(window.BOAR_BENCH||location.hash==='#bench')installBench();
  islandFrame=requestAnimationFrame(frame);
}
function updateStartLabel(){$('start').innerHTML=`${save.nextWave>1?'ממשיכים לגל '+save.nextWave:'הגנו על האי'} <span>←</span>`;}

let shownWeapon='mg';
function showWeapon(key){shownWeapon=key;for(const k of WEAPON_ORDER){const m=gunModels[k];m.group.visible=k===key;const lv=save.weapons[k];for(const p of m.levelParts)p.obj.visible=lv>=p.min;}}
function createTurrets(){
  for(const x of [-8.6,8.6]){const t=new THREE.Group(),head=new THREE.Group();const z=11;mesh(t,cyl(1,1.3,1,14),mat('#56635b',.6,.5),[0,.5,0]);head.position.y=1.4;t.add(head);mesh(head,sph(.8,16,10),mat('#3e5656',.8,.35),[0,0,0],[1,.75,1]);mesh(head,cylZ(.12,.15,2.4,12),mat('#283f46',.9,.3),[0,.1,-1.3]);mesh(head,rb(.3,.25,.4,.05),mat('#c8b26a',.6,.4),[0,.55,0]);
    t.position.set(x,groundY(x,z),z);t.userData.head=head;scene.add(t);turrets.push(t);}
}

// ---------- enemies ----------
const PAL={
  scout:{skin:'#d49a7c',plate:'#5f7a84',dark:'#2f3d44',trim:'#c9b27a',snout:'#e2ae95',nose:'#9c5d55',eye:'#ff5a2c'},
  runner:{skin:'#d9a85f',plate:'#8a5f3c',dark:'#3b2f28',trim:'#f0d08a',snout:'#e8c08a',nose:'#8a5a3c',eye:'#ffd23c'},
  heavy:{skin:'#7d8e8a',plate:'#3c5960',dark:'#25343a',trim:'#d1b46a',snout:'#93a29d',nose:'#4b5b5e',eye:'#ff3b2b'},
  mortar:{skin:'#9aa66f',plate:'#55663e',dark:'#2e3828',trim:'#d7c37a',snout:'#b5bf8a',nose:'#5e6a40',eye:'#ff8a2b'},
  drone:{skin:'#cfd6d8',plate:'#3e6f8a',dark:'#22323b',trim:'#ffcf5a',snout:'#e1e6e7',nose:'#6b7c86',eye:'#48e1ff'},
  king:{skin:'#5b6670',plate:'#2c3640',dark:'#171f26',trim:'#e4c063',snout:'#6c7782',nose:'#2c3640',eye:'#ff4a1c'}
};
function boarBody(kind,withLegs=true){
  const P=PAL[kind]||PAL.scout;const root=new THREE.Group(),body=new THREE.Group();root.add(body);const parts=[],zones=[];
  const A=(m)=>{parts.push(m);return m;};
  const skin=worn(P.skin,.5,.42,{ns:.3}),plate=worn(P.plate,.75,.36,{normal:'panel',ns:.4}),dark=worn(P.dark,.7,.45,{ns:.3}),trim=worn(P.trim,.85,.3,{ns:.2});
  A(mesh(body,geo('torso',()=>new THREE.CapsuleGeometry(.8,1.45,6,16).rotateX(Math.PI/2)),skin,[0,0,0],[1,.92,1]));
  A(mesh(body,rb(1.2,.32,1.9,.12),dark,[0,-.62,0]));
  A(mesh(body,rb(1.72,.42,2.05,.16),plate,[0,.7,-.1]));
  for(let j=0;j<4;j++)A(mesh(body,rb(.14,.3,.3,.05),trim,[0,1.02,.65-j*.5]));
  for(const s of [-1,1]){A(mesh(body,rb(.12,.7,1.5,.05),plate,[s*.85,.1,-.1]));for(let r=0;r<3;r++)mesh(body,sph(.05,6,4),trim,[s*.92,.3,.4-r*.5]);}
  A(mesh(body,cyl(.12,.15,.5,10),dark,[.35,.95,-.95],null,[-.4,0,0]));
  const tail=A(mesh(body,geo('tail',()=>new THREE.TorusGeometry(.2,.06,6,12,Math.PI*1.6)),trim,[0,.25,-1.62],null,[0,Math.PI/2,0]));
  const head=new THREE.Group();head.position.set(0,.2,1.55);body.add(head);
  A(mesh(head,rb(1.18,1.0,1.0,.26),skin,[0,0,.1]));A(mesh(head,rb(1.26,.22,.72,.08),plate,[0,.48,.12]));
  A(mesh(head,geo('snout',()=>new THREE.CylinderGeometry(.42,.46,.55,20).rotateX(Math.PI/2)),mat(P.snout,.4,.5),[0,-.15,.78]));
  mesh(head,geo('nose',()=>new THREE.CylinderGeometry(.36,.36,.06,20).rotateX(Math.PI/2)),mat(P.nose,.3,.6),[0,-.15,1.07]);
  for(const s of [-1,1])mesh(head,geo('nostril',()=>new THREE.CircleGeometry(.08,10)),mat('#151a1d',0,.9),[s*.14,-.15,1.105]);
  const eyeMat=mat(P.eye,.1,.3,P.eye,2.6);for(const s of [-1,1]){mesh(head,sph(.14,12,8),eyeMat,[s*.32,.2,.58]);mesh(head,rb(.36,.08,.12,.03),dark,[s*.32,.36,.6],null,[0,0,s*.25]);}
  for(const s of [-1,1]){const ear=A(mesh(head,geo('ear',()=>new THREE.ConeGeometry(.3,.7,4).scale(1,1,.35)),plate,[s*.5,.66,-.05]));ear.rotation.set(-.3,0,-s*.55);}
  for(const s of [-1,1]){const t=A(mesh(head,geo('tusk',()=>new THREE.ConeGeometry(.1,.55,10)),mat('#ece0bb',.3,.35),[s*.36,-.4,.86]));t.rotation.set(.9,0,-s*.5);}
  const eyeC=new THREE.Object3D();eyeC.position.set(0,.2,.6);head.add(eyeC);
  zones.push({obj:body,r:1.15,crit:false},{obj:head,r:.66,crit:false},{obj:eyeC,r:.4,crit:true});
  const legs=[];if(withLegs)for(const [x,z] of [[-.58,.85],[.58,.85],[-.58,-.85],[.58,-.85]]){
    const hip=new THREE.Group();hip.position.set(x,-.4,z);body.add(hip);A(mesh(hip,geo('thigh',()=>new THREE.CapsuleGeometry(.2,.32,4,10)),plate,[0,-.28,0]));
    const knee=new THREE.Group();knee.position.set(0,-.6,0);hip.add(knee);A(mesh(knee,cyl(.11,.13,.5,10),dark,[0,-.25,0]));A(mesh(knee,rb(.34,.16,.42,.06),dark,[0,-.55,.05]));
    legs.push({hip,knee});}
  body.position.y=withLegs?1.63:0;
  return {root,body,head,parts,zones,legs,rotors:[],P};
}
function makeEnemy(kind){
  let e;
  if(kind==='raft')e=makeRaft();else if(kind==='hive')e=makeHive();else if(kind==='shark')e=makeShark();else if(kind==='manta')e=makeManta();else if(kind==='crab'){e=makeCrab();e.root.scale.setScalar(1.25);}else if(kind==='turtle'){e=makeTurtle();e.root.scale.setScalar(1.2);}else if(kind==='leviathan'){e=makeLeviathan();e.root.scale.setScalar(1.8);}
  else{
    e=boarBody(kind==='king'?'king':kind,kind!=='drone');const {body,head,parts,zones,P}=e;const plate=worn(P.plate,.75,.36,{normal:'panel',ns:.4}),trim=worn(P.trim,.85,.3,{ns:.2}),dark=worn(P.dark,.7,.45,{ns:.3});const A=m=>{parts.push(m);return m;};
    if(kind==='runner'){e.root.scale.setScalar(.8);for(const s of [-1,1]){A(mesh(body,cyl(.16,.2,.7,12),dark,[s*.38,.85,-.8],null,[Math.PI/2.4,0,0]));mesh(body,cyl(.12,.05,.1,12),mat('#ffb347',0,.4,'#ff8a1c',3),[s*.38,.72,-1.15],null,[Math.PI/2.4,0,0]);}}
    if(kind==='heavy'||kind==='king'){for(const s of [-1,1]){A(mesh(body,rb(.22,1.2,2.3,.08),plate,[s*1.0,.05,-.15]));A(mesh(body,rb(.5,.4,.7,.1),plate,[s*.75,.75,.75],null,[0,0,s*.3]));for(let k=0;k<2;k++)A(mesh(body,geo('spike',()=>new THREE.ConeGeometry(.12,.55,6)),trim,[s*.55,1.05,.3-k*.7]));}A(mesh(head,rb(1.0,.3,.25,.08),plate,[0,-.48,.75]));}
    if(kind==='heavy')e.root.scale.setScalar(1.32);
    if(kind==='mortar'){const tube=new THREE.Group();tube.position.set(0,1.0,-.4);tube.rotation.x=-.75;body.add(tube);A(mesh(tube,cyl(.24,.28,1.5,14),dark,[0,.6,0]));mesh(tube,cyl(.3,.3,.14,14),trim,[0,1.3,0]);const tip=new THREE.Object3D();tip.position.set(0,1.45,0);tube.add(tip);e.tip=tip;A(mesh(body,rb(1.1,.3,.6,.06),plate,[0,.92,.4]));for(let k=0;k<3;k++)mesh(body,cyl(.09,.09,.4,8),mat('#c9a043',.9,.3),[-.3+k*.3,1.2,.4]);e.root.scale.setScalar(1.05);}
    if(kind==='drone'){e.root.scale.setScalar(.78);const bladeMat=mat('#1c2a31',.7,.4),discMat=new THREE.MeshBasicMaterial({color:'#cfe6ee',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
      for(const [x,z] of [[-1.5,1.1],[1.5,1.1],[-1.5,-1.1],[1.5,-1.1]]){A(mesh(body,rb(Math.abs(x)*.9,.14,.2,.05),plate,[x*.5,.55,z*.6],null,[0,Math.atan2(z,x)*-1,0]));A(mesh(body,cyl(.18,.22,.35,10),dark,[x,.6,z]));const r=new THREE.Group();r.position.set(x,.82,z);body.add(r);mesh(r,rb(1.6,.04,.16,.02),bladeMat,[0,0,0]);mesh(r,rb(.16,.04,1.6,.02),bladeMat,[0,0,0]);const d=new THREE.Mesh(geo('rotordisc',()=>new THREE.CircleGeometry(.85,20).rotateX(-Math.PI/2)),discMat);r.add(d);e.rotors.push(r);}
      const blink=mesh(body,sph(.09,8,6),mat('#ff3030',0,.3,'#ff2020',4),[0,1.0,-.6]);blink.userData.keep=true;e.blink=blink;}
    if(kind==='king'){e.root.scale.setScalar(2.5);
      for(let k=0;k<5;k++)A(mesh(head,geo('crown',()=>new THREE.ConeGeometry(.13,.55,5)),mat('#e4c063',1,.22),[-.44+k*.22,.82,.1]));A(mesh(head,rb(1.1,.12,.5,.04),mat('#e4c063',1,.22),[0,.62,.1]));
      const reactor=mesh(body,sph(.34,16,12),mat('#7ff0ff',.1,.2,'#3fd8ff',3.2),[0,1.02,-.55]);mesh(body,geo('reactorRing',()=>new THREE.TorusGeometry(.38,.07,8,20)),trim,[0,1.02,-.55],null,[Math.PI/2,0,0]);const rc=new THREE.Object3D();reactor.add(rc);zones.push({obj:rc,r:.42,crit:true});
      e.guns=[];for(const s of [-1,1]){const gg=new THREE.Group();gg.position.set(s*.62,1.05,.1);body.add(gg);A(mesh(gg,cylZ(.13,.16,1.4,12),dark,[0,0,.4]));const tip=new THREE.Object3D();tip.position.set(0,0,1.15);gg.add(tip);e.guns.push(tip);}}
  }
  compactTree(e.root,kind);e.parts=[];e.root.traverse(o=>{if(o.isMesh){o.receiveShadow=false;if(!o.userData.keep&&o.material.opacity===1)e.parts.push(o);}});
  e.kind=kind;return e;
}
function makeRaft(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const parts=[],zones=[];const A=m=>{parts.push(m);return m;};
  A(mesh(body,rb(4.2,.32,5.4,.12),mat('#5e7166',.6,.5),[0,.3,0]));for(let j=0;j<6;j++)mesh(body,rb(4.0,.06,.5,.02),mat('#9c8a62',.2,.8),[0,.5,-2.2+j*.88]);
  for(const s of [-1,1])A(mesh(body,geo('pontoon',()=>new THREE.CapsuleGeometry(.55,4.4,6,14).rotateX(Math.PI/2)),mat('#d06a3a',.25,.55),[s*1.9,0,0]));
  A(mesh(body,rb(.8,.9,.7,.1),mat('#2f3d44',.7,.4),[0,.9,-2.6]));const prop=new THREE.Group();prop.position.set(0,.1,-3.1);body.add(prop);mesh(prop,rb(1,.08,.18,.03),mat('#c9b27a',.8,.3),[0,0,0]);mesh(prop,rb(.18,.08,1,.03),mat('#c9b27a',.8,.3),[0,0,0],null,[0,0,0]);prop.rotation.x=Math.PI/2;
  const exhaust=mesh(body,sph(.18,10,8),mat('#ffb347',0,.4,'#ff7a1c',3),[0,1.35,-2.6]);const ec=new THREE.Object3D();exhaust.add(ec);
  A(mesh(body,rb(.08,1.6,.08,.02),mat('#2f3d44',.7,.4),[1.5,1.2,-1.8]));A(mesh(body,rb(.9,.6,.04,.02),mat('#c4473a',.1,.7),[1.95,1.7,-1.8]));
  const driver=boarBody('scout',false);driver.root.scale.setScalar(.75);driver.root.position.set(0,1.1,-1.6);body.add(driver.root);parts.push(...driver.parts.slice(0,6));
  const passengers=[];for(const x of [-1,1]){const p=boarBody('runner',false);p.root.scale.setScalar(.62);p.root.position.set(x,1.0,1.0);body.add(p.root);passengers.push(p);}
  zones.push({obj:body,r:2.4,crit:false},{obj:ec,r:.55,crit:true});
  return {root,body,parts,zones,legs:[],rotors:[prop],passengers,P:PAL.scout};
}
function makeHive(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const parts=[],zones=[];const A=m=>{parts.push(m);return m;};
  const hull=mat('#6d4a5c',.55,.45),plate=mat('#3b2d38',.75,.4),trim=mat('#e4c063',.95,.25),dark=mat('#1f1a20',.6,.5);
  A(mesh(body,geo('envelope',()=>new THREE.CapsuleGeometry(3,7,10,24).rotateX(Math.PI/2)),hull,[0,0,0],[1,.85,1]));
  for(const z of [-3,0,3])A(mesh(body,geo('band',()=>new THREE.TorusGeometry(3.02,.14,8,40)),plate,[0,0,z],[1,.85,1]));
  A(mesh(body,rb(1.4,.5,7,.2),plate,[0,2.55,0]));for(const s of [-1,1]){A(mesh(body,rb(.2,2.2,2.2,.08),plate,[s*1.4,1.6,-5.2]));}A(mesh(body,rb(3.6,.2,2,.08),plate,[0,0,-5.6]));
  const face=new THREE.Group();face.position.set(0,0,5.6);body.add(face);
  A(mesh(face,geo('hsnout',()=>new THREE.CylinderGeometry(1.1,1.25,1.2,24).rotateX(Math.PI/2)),mat('#9c6f80',.4,.5),[0,-.4,.6]));mesh(face,geo('hnose',()=>new THREE.CylinderGeometry(.95,.95,.1,24).rotateX(Math.PI/2)),mat('#4f3340',.3,.6),[0,-.4,1.22]);
  for(const s of [-1,1])mesh(face,geo('hnostril',()=>new THREE.CircleGeometry(.2,12)),mat('#120c10',0,.9),[s*.36,-.4,1.28]);
  const eyeMat=mat('#ffe14a',.1,.3,'#ffb21c',3);for(const s of [-1,1]){mesh(face,sph(.38,14,10),eyeMat,[s*1.1,.8,-.1]);const ear=A(mesh(face,geo('hear',()=>new THREE.ConeGeometry(.8,1.8,4).scale(1,1,.35)),plate,[s*1.6,2.2,-.9]));ear.rotation.set(-.3,0,-s*.5);}
  const eyeC=new THREE.Object3D();eyeC.position.set(0,.8,-.1);face.add(eyeC);
  for(const s of [-1,1]){const t=A(mesh(face,geo('htusk',()=>new THREE.ConeGeometry(.25,1.2,10)),mat('#ece0bb',.3,.35),[s*.9,-1.1,.9]));t.rotation.set(1,0,-s*.5);}
  A(mesh(body,rb(2.4,1.2,4.5,.3),dark,[0,-3.1,.4]));for(let k=0;k<4;k++)mesh(body,rb(.4,.3,.05,.05),mat('#ffd76a',.1,.4,'#ffb21c',2),[-.6+k*.4,-3.0,2.66]);const hatch=new THREE.Object3D();hatch.position.set(0,-3.8,.4);body.add(hatch);
  const rotors=[],pods=[];for(const [x,y,z] of [[-3.6,-.6,2.2],[3.6,-.6,2.2],[-3.6,-.6,-2.6],[3.6,-.6,-2.6]]){
    A(mesh(body,rb(1.4,.25,.5,.1),plate,[x*.75,y,z]));const pod=new THREE.Group();pod.position.set(x,y,z);body.add(pod);A(mesh(pod,cylZ(.55,.65,1.8,16),mat('#4b4f55',.8,.35)));mesh(pod,cylZ(.45,.45,.1,16),mat('#ffae60',.1,.3,'#ff7b20',3.2),[0,0,-.92]);
    const r=new THREE.Group();r.position.z=1.0;pod.add(r);mesh(r,rb(2.4,.12,.25,.04),trim);mesh(r,rb(.25,.12,2.4,.04),trim);r.rotation.x=Math.PI/2;rotors.push(r);
    const pc=new THREE.Object3D();pod.add(pc);pods.push(pc);zones.push({obj:pc,r:.95,crit:true});}
  zones.unshift({obj:body,r:3.4,crit:false},{obj:face,r:2.2,crit:false},{obj:eyeC,r:.9,crit:true});const back=new THREE.Object3D();back.position.z=-4;body.add(back);zones.push({obj:back,r:3,crit:false});
  return {root,body,parts,zones,legs:[],rotors,hatch,P:PAL.scout};
}

// ---------- spawning & enemy updates ----------
function clearBattlefield(){
  timers=[];for(const p of projectilesFx)scene.remove(p.m);projectilesFx.length=0;
  for(const e of enemies){scene.remove(e.root);e.label?.remove();}enemies=[];for(const s of shells)scene.remove(s.mesh);shells=[];for(const p of projectiles)scene.remove(p.mesh);projectiles=[];
  boss=null;$('boss-hud').hidden=true;
}
function spawn(kind,at=null){
  const e=makeEnemy(kind),s=enemyStats(kind,wave);
  Object.assign(e,s,{maxHp:s.hp,phase:rand(0,6.28),chill:0,attack:1.2,baseX:rand(-26,26),stride:0,fireTimer:rand(2,4),dmgAcc:0,lastNum:0,hurtUntil:0,state:'advance'});
  if(e.turrets)for(const t of e.turrets)t.hp=t.maxHp=e.maxHp*.08;
  const sc=e.root.scale.x;e.stopZ=kind==='mortar'?rand(-36,-28):kind==='drone'?rand(-16,-8):kind==='king'?-6:kind==='shark'?rand(-34,-24):kind==='manta'?rand(-46,-36):kind==='crab'?rand(-2.5,.5):kind==='turtle'?-9:kind==='leviathan'?-62:rand(-.5,1.5);
  if(at){e.root.position.copy(at);e.baseX=at.x/Math.max(.22,clamp((24-at.z)/110,.22,1));}
  else e.root.position.set(e.baseX,0,isBoss(kind)?-115:rand(-104,-84));
  if(kind==='drone')e.root.position.y=at?at.y:rand(14,20);
  if(kind==='hive'){e.baseX=0;e.root.position.y=17;e.stopZ=-58;}
  if(kind==='turtle'){e.baseX=0;e.headOut=1;e.headCycle=0;}
  if(kind==='leviathan'){e.baseX=0;e.root.position.set(0,seaY(0,-118)-4.5,-118);e.state='approach';e.st=0;e.goalX=0;}
  if(kind==='shark'){e.depth=.62;e.root.position.y=seaY(e.root.position.x,e.root.position.z)-.62;e.baseX=rand(-22,22);}
  if(kind==='manta'){e.alt=rand(16,22);e.root.position.y=at?at.y:e.alt;}
  e.label=document.createElement('div');const named={};e.label.className='enemy-label'+(named[kind]?'':' quiet');
  e.label.innerHTML=`<span>${named[kind]?ENEMIES[kind].name:''}</span><div class="bar"><i></i></div>`;if(isBoss(kind))e.label.style.display='none';
  $('enemy-labels').append(e.label);scene.add(e.root);enemies.push(e);
  if(isBoss(kind)){boss=e;$('boss-name').textContent=ENEMIES[kind].name;$('boss-hud').hidden=false;$('boss-hud').classList.remove('enraged');sfx.play('alarm');
    const [t1,t2]=BOSS_INTRO[kind];announce(t1,t2,3.5);}
  return e;
}
const BOSS_INTRO={king:['מלך הברזל עולה מהים','כוונו לכור הזוהר שעל הגב ולעיניים'],hive:['ספינת הכוורת באופק','הפילו את ארבעת המנועים הזוהרים'],
  turtle:['צב המבצר יוצא מהים','השריון בולע כדורים · הפילו את שלושת הצריחים, ואז את הכור'],leviathan:['לווייתן הפלדה מתחת למים','כשהוא עולה ופותח את הפה · כוונו לכור ולעיניים']};
function laneX(e,z){return e.baseX*clamp((24-z)/110,.22,1);}
function updateEnemy(e,dt){
  const frozen=frostTimer>0||e.chill>0;e.chill=Math.max(0,e.chill-dt);const slow=frozen?.4:1;const r=e.root,pos=r.position,k=e.kind;
  let speed=e.speed*slow*(e.enraged>0?2.3:1);if(e.enraged>0)e.enraged-=dt;
  if(k==='hive'){updateHive(e,dt,speed);return;}
  if(k==='shark'){updateShark(e,dt,slow,speed);return;}
  if(k==='manta'){updateManta(e,dt,slow,speed);return;}
  if(k==='crab'){updateCrab(e,dt,slow,speed);return;}
  if(k==='turtle'){updateTurtle(e,dt,slow,speed);return;}
  if(k==='leviathan'){updateLeviathan(e,dt,slow,speed);return;}
  if(e.state==='retreat'){e.sink=(e.sink||0)+dt;pos.y=seaY(pos.x,pos.z)-.15-e.sink*e.sink*.5;e.body.rotation.x=e.sink*.12;if(Math.random()<dt*8)splashSmall(pos,1.5);if(e.sink>2.6)removeEnemy(e);return;}
  if(pos.z<e.stopZ){pos.z=Math.min(e.stopZ,pos.z+speed*dt);e.stride+=speed*dt;}
  const x=laneX(e,pos.z)+Math.sin(elapsed*(k==='runner'?2.4:.9)+e.phase)*(k==='runner'?2.2:k==='drone'?3:.8);pos.x=x;
  if(k==='drone'){const ty=pos.z>-40?9+Math.sin(e.phase)*2:16;pos.y=damp(pos.y,ty+Math.sin(elapsed*2+e.phase)*.5,.6,dt);for(const rt of e.rotors)rt.rotation.y+=dt*45;e.body.rotation.x=damp(e.body.rotation.x,pos.z<e.stopZ?.18:0,.3,dt);e.blink.visible=(elapsed*2+e.phase)%1<.5;}
  else if(k==='raft'){pos.y=seaY(pos.x,pos.z)-.15;e.body.rotation.z=Math.sin(elapsed*1.3+e.phase)*.05;e.body.rotation.x=Math.cos(elapsed*1.1+e.phase)*.04;e.rotors[0].rotation.y+=dt*30;
    if(e.stopZ>-1)e.stopZ=shoreZ(pos.x)-5;if(Math.random()<dt*6)emit('foam',tmp.set(pos.x+rand(-2,2),pos.y+.2,pos.z-3),rand(-1,1),rand(1,3),rand(-3,-1),.5,.18,10);}
  else{
    const g=Math.max(groundY(pos.x,pos.z),-1.55);pos.y=g;const inWater=groundY(pos.x,pos.z)<seaY(pos.x,pos.z)-.2;
    const sc=r.scale.x,cyc=e.stride/(1.15*sc)*Math.PI*1.25+e.phase;const moving=pos.z<e.stopZ-.01;
    for(let i=0;i<e.legs.length;i++){const ph=cyc+((i===0||i===3)?0:Math.PI);const L=e.legs[i];L.hip.rotation.x=moving?Math.sin(ph)*.55:damp(L.hip.rotation.x,0,.15,dt);L.knee.rotation.x=moving?Math.max(0,-Math.cos(ph))*.9:damp(L.knee.rotation.x,0,.15,dt);}
    e.body.position.y=1.63+(moving?Math.abs(Math.sin(cyc))*.07:Math.sin(elapsed*2+e.phase)*.03);e.body.rotation.z=damp(e.body.rotation.z,0,.12,dt);
    if(inWater&&moving&&Math.random()<dt*5)splashSmall(pos,sc);
  }
  r.rotation.y=damp(r.rotation.y,Math.atan2(-pos.x*.04,1)+Math.sin(elapsed*.7+e.phase)*.06,.4,dt);
  if(k==='raft'&&pos.z>=e.stopZ-.1&&e.state!=='retreat'){unloadRaft(e);return;}
  // attacks
  if(k==='mortar'&&pos.z>=e.stopZ-.1){e.fireTimer-=dt*slow;if(e.fireTimer<=0){e.fireTimer=rand(3.8,4.8);e.tip.getWorldPosition(tmp);launchShell(tmp.clone(),'shell',e.damage);}}
  else if(k==='drone'&&pos.z>=e.stopZ-.1){e.fireTimer-=dt*slow;if(e.fireTimer<=0){e.fireTimer=rand(2.2,3);droneShot(e);}}
  else if(k==='king'){updateKing(e,dt,slow);}
  else if(pos.z>=e.stopZ-.01&&k!=='raft'){e.attack-=dt*slow;const l=Math.max(0,.35-Math.max(0,e.attack))*3;e.body.position.z=Math.sin(Math.min(1,l)*Math.PI)*.55;
    if(e.attack<=0){e.attack=rand(2,2.6);hurtPlayer(e.damage,pos);sparks(tmp.set(pos.x,pos.y+1.2,pos.z+1.2),8,'spark',6,.08);}}
}
function updateKing(e,dt,slow){
  const pos=e.root.position;const frac=e.hp/e.maxHp;
  for(const th of [.66,.33])if(frac<th&&!e['rage'+th]){e['rage'+th]=true;e.enraged=2.6;$('boss-hud').classList.add('enraged');announce('מלך הברזל משתולל','הוא מזעיק תגבורת · טילים עכשיו',2.6);sfx.play('alarm');trauma=Math.min(1,trauma+.3);
    for(let i=0;i<3;i++){const sp=spawn('runner',new THREE.Vector3(pos.x+rand(-5,5),0,pos.z+rand(-2,3)));sp.label.classList.add('quiet');}}
  e.fireTimer-=dt*slow;if(e.fireTimer<=0&&pos.z>-90){e.fireTimer=rand(5,6.5);for(const g of e.guns){g.getWorldPosition(tmp);launchShell(tmp.clone(),'shell',10);}sparks(tmp,10,'hot',6,.15);}
  if(pos.z>=e.stopZ-.01){e.attack-=dt*slow;e.body.position.z=Math.sin(Math.max(0,.4-Math.max(0,e.attack))/.4*Math.PI)*.4;if(e.attack<=0){e.attack=1.6;hurtPlayer(e.damage,pos);ring(tmp.set(pos.x,groundY(pos.x,pos.z)+.2,pos.z+2),12,.6,'#ffd7a0',.7);trauma=Math.min(1,trauma+.35);}}
}
function updateHive(e,dt,speed){
  const pos=e.root.position;if(pos.z<e.stopZ)pos.z=Math.min(e.stopZ,pos.z+speed*dt);
  pos.x=Math.sin(elapsed*.25+e.phase)*15;pos.y=17+Math.sin(elapsed*.8)*1.2;e.body.rotation.z=Math.sin(elapsed*.25+e.phase)*-.08;e.root.rotation.y=Math.cos(elapsed*.25+e.phase)*.15;for(const r of e.rotors)r.rotation.z+=dt*24;
  const frac=e.hp/e.maxHp;if(frac<.5&&!e.rage){e.rage=true;$('boss-hud').classList.add('enraged');announce('הכוורת פותחת את כל הפתחים','רחפנים בכל מקום · ברק עובד עליהם מצוין',2.6);sfx.play('alarm');}
  e.spawnTimer=(e.spawnTimer??3)-dt;if(e.spawnTimer<=0){e.spawnTimer=e.rage?3.2:5;e.hatch.getWorldPosition(tmp);for(let i=0;i<(e.rage?3:2);i++){const d=spawn('drone',tmp.clone().add(new THREE.Vector3(rand(-2,2),-1,rand(-1,1))));d.reward=Math.round(d.reward*.5);d.hp=d.maxHp=Math.round(d.maxHp*.7);}}
  e.fireTimer-=dt;if(e.fireTimer<=0&&pos.z>-80){e.fireTimer=rand(2.6,3.4);e.hatch.getWorldPosition(tmp);launchShell(tmp.clone(),'bomb',e.damage);}
}
function unloadRaft(e){
  for(const p of e.passengers){p.root.getWorldPosition(tmp);p.root.removeFromParent();const r=spawn('runner',new THREE.Vector3(tmp.x,0,tmp.z+1.5));splash(tmp,true);}
  e.passengers=[];e.state='retreat';e.label.classList.add('quiet');toast('רפסודה פרקה שני רצים · היא שוקעת');
}
function splashSmall(pos,sc){emit('foam',tmp.set(pos.x+rand(-.8,.8)*sc,seaY(pos.x,pos.z)+.1,pos.z+rand(.5,1.5)*sc),rand(-1.5,1.5),rand(2,4.5),rand(0,2),rand(.35,.6),rand(.1,.2)*sc,16);}
function launchShell(from,type,dmg,to=null){
  to=to||new THREE.Vector3(rand(-5,5),groundY(0,14)+rand(1,3),rand(12,17));
  const m=new THREE.Group();
  if(type==='torpedo'){mesh(m,geo('torp',()=>new THREE.CapsuleGeometry(.2,1.2,4,12).rotateX(Math.PI/2)),worn('#2e3a40',.8,.35));for(const r of [0,Math.PI/2])mesh(m,rb(.6,.04,.25,.01),worn('#2e3a40',.8,.35),[0,0,-.7],null,[0,0,r]);mesh(m,cylZ(.13,.13,.05,10),mat('#ffae60',.1,.3,'#ff7b20',3),[0,0,-.82]);m.position.copy(from);m.lookAt(to.x,from.y,to.z);}
  else{mesh(m,geo('mshell',()=>new THREE.CapsuleGeometry(.28,.5,4,10)),worn(type==='bomb'?'#3a2f36':type==='siege'?'#6a3222':'#3d4a3a',.6,.4),[0,0,0],type==='siege'?[1.4,1.4,1.4]:null);const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.fire,color:'#ff8040',transparent:true,depthWrite:false,blending:add}));glow.scale.setScalar(type==='siege'?2.2:1.6);m.add(glow);m.position.copy(from);}
  scene.add(m);const dist=from.distanceTo(to);
  const T=type==='torpedo'?dist/15:type==='bomb'?2.2+dist/90:2.6+dist/80;
  shells.push({mesh:m,from,to,t:0,T,arc:type==='torpedo'?0:type==='bomb'?2:Math.min(type==='siege'?30:26,dist*.38),dmg,type,trail:0});if(type!=='torpedo')sfx.play('whistle');
}
function droneShot(e){e.root.getWorldPosition(tmp);const to=new THREE.Vector3(rand(-1.5,1.5),camera.position.y-1.5,camera.position.z-3);tracer(tmp.clone(),to,{speed:110,len:4,width:.12,kind:'tracerRed'});later(tmp.distanceTo(to)/110,()=>hurtPlayer(e.damage,null));}
function hurtPlayer(d,from){if(mode!=='battle')return;hp=Math.max(0,hp-d);damageTaken+=d;$('damage-flash').style.opacity=.42;damageUntil=elapsed+.18;trauma=Math.min(1,trauma+.22);sfx.play('hurt');if(hp<=0)defeat();}
function removeEnemy(e){scene.remove(e.root);e.label.remove();const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);if(e===boss){boss=null;$('boss-hud').hidden=true;}}

// ---------- new invaders: shark (water), manta (air), siege crab (ground) ----------
function faceMotion(e,dt,half=.25){const p=e.root.position;if(e.prev){const vx=p.x-e.prev.x,vz=p.z-e.prev.z;if(vx*vx+vz*vz>1e-6)e.root.rotation.y=dampAngle(e.root.rotation.y,Math.atan2(vx,vz),half,dt);}else e.prev=new THREE.Vector3();e.prev.copy(p);}
function dampAngle(a,b,half,dt){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return b-d*Math.pow(2,-dt/half);}
function sharkWag(e,f,a){const t=elapsed*f+e.phase;e.mid.rotation.y=Math.sin(t)*.16*a;e.tail.rotation.y=Math.sin(t-1)*.42*a;e.front.rotation.y=-Math.sin(t)*.05*a;}
function updateShark(e,dt,slow,speed){
  const pos=e.root.position;e.st=(e.st||0)+dt*slow;const sea=seaY(pos.x,pos.z);
  if(e.state==='advance'){pos.z=Math.min(e.stopZ,pos.z+speed*dt);pos.x=laneX(e,pos.z)+Math.sin(elapsed*.8+e.phase)*3;pos.y=sea-e.depth;
    e.root.rotation.x=damp(e.root.rotation.x,0,.3,dt);sharkWag(e,9*slow,1);faceMotion(e,dt);
    const fin=e.zones.find(z=>z.fin).obj.getWorldPosition(tmp);if(Math.random()<dt*14)emit('foam',tmp.set(fin.x+rand(-.3,.3),sea+.12,fin.z-rand(.3,1.4)),rand(-1.4,1.4),rand(1,2.6),rand(-2.5,-.5),rand(.35,.6),rand(.1,.2),10);
    if(!e.breached&&pos.z>-80&&pos.z<-58&&Math.random()<dt*.55){e.state='breach';e.st=0;e.breached=true;splash(pos,true);sfx.play('splash');}
    if(pos.z>=e.stopZ-.05){e.state='surface';e.st=0;}}
  else if(e.state==='breach'){const u=Math.min(1,e.st/1.3);pos.z+=speed*.8*dt;pos.y=sea-.6+Math.sin(u*Math.PI)*5.4;e.root.rotation.x=-.95*Math.cos(u*Math.PI);e.root.rotation.z=Math.sin(u*Math.PI)*.4;sharkWag(e,15,1.3);
    if(u>=1){e.state='advance';e.root.rotation.z=0;splash(pos,true);sfx.play('splash');}}
  else if(e.state==='surface'){pos.y=damp(pos.y,sea+.08,.15,dt);e.root.rotation.x=damp(e.root.rotation.x,-.2,.2,dt);e.root.rotation.y=dampAngle(e.root.rotation.y,Math.atan2(-pos.x*.03,1),.25,dt);
    e.jaw.rotation.x=damp(e.jaw.rotation.x,e.st>.7?.6:0,.07,dt);e.tubeGlow.emissiveIntensity=1.2+Math.min(1,e.st/1.2)*4.5;sharkWag(e,4,.5);
    if(e.st>1.3&&!e.fired){e.fired=true;const from=e.zones[1].obj.getWorldPosition(new THREE.Vector3());from.y=sea+.1;launchShell(from,'torpedo',e.damage,new THREE.Vector3(pos.x*.55+rand(-2,2),0,shoreZ(pos.x)+2));sfx.play('torpedo');splash(from);}
    if(e.st>2.3){e.state='dive';e.st=0;e.fired=false;e.tubeGlow.emissiveIntensity=1.2;}}
  else if(e.state==='dive'){pos.y=damp(pos.y,sea-1.9,.35,dt);e.root.rotation.x=damp(e.root.rotation.x,.12,.3,dt);e.jaw.rotation.x=damp(e.jaw.rotation.x,0,.1,dt);
    e.circle=(e.circle||0)+dt*.9*slow;pos.x+=Math.cos(e.circle+e.phase)*dt*5*slow;pos.z=e.stopZ+Math.sin(e.circle+e.phase)*3;sharkWag(e,7*slow,1);faceMotion(e,dt,.15);
    if(e.st>3.4){e.state='surface';e.st=0;}}
}
function updateManta(e,dt,slow,speed){
  const pos=e.root.position;e.st=(e.st||0)+dt*slow;const diving=e.state==='dive';const f=(diving?2.2:4)*slow,t=elapsed*f+e.phase;
  for(const w of e.wings){const fold=diving?-.3:0;w.inner.rotation.z=w.s*(Math.sin(t)*.42+fold);w.outer.rotation.z=w.s*(Math.sin(t-.8)*.5+fold*.6);}
  e.tailSegs.forEach((sg,i)=>sg.rotation.y=Math.sin(elapsed*2.2+e.phase-i*.6)*.18);
  if(e.state==='advance'){pos.z+=speed*dt;pos.x=laneX(e,pos.z)+Math.sin(elapsed*.6+e.phase)*6;pos.y=damp(pos.y,e.alt+Math.sin(elapsed*1.1+e.phase)*1.2-Math.sin(t)*.2,.4,dt);
    e.body.rotation.z=-Math.cos(elapsed*.6+e.phase)*.28;e.body.rotation.x=damp(e.body.rotation.x,0,.3,dt);faceMotion(e,dt,.4);
    if(pos.z>=e.stopZ){e.state='mark';e.st=0;e.eyeMat.color.set('#ff6a4a');e.eyeMat.emissive.set('#ff2a10');sfx.play('screech');e.target=new THREE.Vector3(rand(-2.5,2.5),camera.position.y-2.4,camera.position.z-5);}}
  else if(e.state==='mark'){pos.y+=dt*2.5*slow;e.body.rotation.x=damp(e.body.rotation.x,-.55,.2,dt);e.body.rotation.z=damp(e.body.rotation.z,0,.2,dt);e.eyeMat.emissiveIntensity=2+Math.sin(elapsed*30)*2;
    e.root.rotation.y=dampAngle(e.root.rotation.y,Math.atan2(e.target.x-pos.x,e.target.z-pos.z),.15,dt);if(e.st>1.0){e.state='dive';e.st=0;}}
  else if(e.state==='dive'){const dir=tmp.copy(e.target).sub(pos);const d=dir.length();dir.normalize();pos.addScaledVector(dir,26*slow*dt);
    e.root.rotation.y=dampAngle(e.root.rotation.y,Math.atan2(dir.x,dir.z),.08,dt);e.body.rotation.x=damp(e.body.rotation.x,Math.asin(clamp(-dir.y,-1,1)),.08,dt);
    if(Math.random()<dt*20)sprite(TEX.smoke,e.sting.getWorldPosition(tmp2),.6,.4,{additive:true,grow:1.5,opacity:.6,color:'#7fe3ff'});
    if(d<2.6){explode(pos.clone(),1.3);hurtPlayer(e.damage,pos);trauma=Math.min(1,trauma+.35);toast('מנטה התרסקה בעמדה · הפילו אותן לפני הצלילה');removeEnemy(e);}}
}
function updateCrab(e,dt,slow,speed){
  const pos=e.root.position,moving=pos.z<e.stopZ-.01;if(moving){pos.z=Math.min(e.stopZ,pos.z+speed*dt);e.stride+=speed*dt;}
  pos.x=laneX(e,pos.z)+Math.sin(elapsed*.5+e.phase)*1.8;pos.y=Math.max(groundY(pos.x,pos.z),-1.4);
  const cyc=e.stride*2.6+e.phase;crabLegs(e,dt,moving,cyc);
  e.body.position.y=1.07+(moving?Math.abs(Math.sin(cyc))*.05:Math.sin(elapsed*1.6+e.phase)*.02);e.body.rotation.z=moving?Math.sin(cyc)*.035:damp(e.body.rotation.z,0,.2,dt);
  for(const c of e.claws){const open=Math.max(0,Math.sin(elapsed*1.4+e.phase+c.s))*.4;c.up.rotation.x=-.1-open;c.lo.rotation.x=.1+open*.6;c.sh.rotation.x=damp(c.sh.rotation.x,(!moving&&c.big)?-.35:0,.3,dt);}
  e.root.rotation.y=dampAngle(e.root.rotation.y,Math.atan2(-pos.x*.03,1)+Math.sin(elapsed*.5+e.phase)*.12,.4,dt);
  if(moving&&groundY(pos.x,pos.z)<seaY(pos.x,pos.z)-.2&&Math.random()<dt*6)splashSmall(pos,1.6);
  if(!moving){e.fireTimer-=dt*slow;if(e.fireTimer<=0){e.fireTimer=rand(4.6,5.6);e.tip.getWorldPosition(tmp);launchShell(tmp.clone(),'siege',e.damage);sparks(tmp,10,'hot',6,.14);sprite(TEX.smoke,tmp,2,.9,{additive:false,grow:2.2,rise:1.5,opacity:.5,color:'#9a9a9a'});sfx.play('cannon',.55);trauma=Math.min(1,trauma+.06);}}
}
// ---------- bosses of chapter 2 ----------
const TV=new THREE.Vector3();
function updateTurtle(e,dt,slow,speed){
  const pos=e.root.position,moving=pos.z<e.stopZ-.01;if(moving){pos.z=Math.min(e.stopZ,pos.z+speed*dt);e.stride+=speed*dt;}
  pos.x=Math.sin(elapsed*.16+e.phase)*3.5;pos.y=Math.max(groundY(pos.x,pos.z),-1.9);
  const cyc=e.stride*1.15;for(const L of e.legs){const ph=cyc+(L.front?0:Math.PI)+(L.s>0?Math.PI:0);
    L.hip.rotation.x=moving?Math.sin(ph)*.42:damp(L.hip.rotation.x,0,.2,dt);L.hip.rotation.z=moving?Math.max(0,Math.cos(ph))*.22*L.s:damp(L.hip.rotation.z,0,.2,dt);}
  e.body.position.y=2.25+(moving?Math.abs(Math.sin(cyc))*.09:Math.sin(elapsed*1.2)*.04);e.body.rotation.z=moving?Math.sin(cyc)*.03:damp(e.body.rotation.z,0,.2,dt);e.tail.rotation.y=Math.sin(elapsed*1.3)*.25;
  if(moving&&groundY(pos.x,pos.z)<seaY(pos.x,pos.z)-.2&&Math.random()<dt*9)splashSmall(pos,3.2);
  // the head ducks into the shell for a moment every few seconds (eyes can't be hit then)
  e.headCycle+=dt*slow;const hidden=!e.exposed&&(e.headCycle%8.2)>5.6;e.headOut=damp(e.headOut,hidden?0:1,.1,dt);e.neck.position.z=2.15+1.25*e.headOut;e.neck.scale.setScalar(.75+.25*e.headOut);
  e.camLocal=e.root.worldToLocal(TV.copy(camera.position));e.head.rotation.y=damp(e.head.rotation.y,clamp(Math.atan2(e.camLocal.x,e.camLocal.z),-.6,.6),.3,dt);e.jaw.rotation.x=damp(e.jaw.rotation.x,(e.roar||0)>0?.5:.05,.08,dt);e.roar=Math.max(0,(e.roar||0)-dt);
  // shell turrets track the player and lob shells
  for(const t of e.turrets){if(t.dead)continue;const l=t.base.worldToLocal(TV.copy(camera.position));t.head.rotation.y=dampAngle(t.head.rotation.y,Math.atan2(l.x,l.z),.25,dt);
    t.timer-=dt*slow*(e.headOut<.4?1.7:1);if(t.timer<=0&&pos.z>-100){t.timer=rand(4.4,5.8)*(e.rage?.72:1);t.tip.getWorldPosition(TV);launchShell(TV.clone(),'shell',Math.round(e.damage*.4));sparks(TV,8,'hot',5,.12);sfx.play('cannon',.35);}}
  e.hatch.rotation.x=damp(e.hatch.rotation.x,e.exposed?-1.25:0,.25,dt);e.coreMat.emissiveIntensity=e.exposed?3+Math.sin(elapsed*6)*1.2:.4;
  if(!e.rage&&e.hp/e.maxHp<.5){e.rage=true;e.roar=1.2;$('boss-hud').classList.add('enraged');announce('צב המבצר בזעם','מטח מצור בדרך · הפילו את הפגזים באוויר',2.6);sfx.play('roar');trauma=Math.min(1,trauma+.3);
    for(let i=0;i<5;i++)later(.4+i*.45,()=>{if(e.dead||mode!=='battle')return;e.head.getWorldPosition(TV);TV.y+=2;launchShell(TV.clone(),'siege',Math.round(e.damage*.35));});
    for(let i=0;i<3;i++){const sp=spawn('runner',new THREE.Vector3(pos.x+rand(-5,5),0,pos.z+rand(1,4)));sp.label.classList.add('quiet');}}
  if(!moving){e.attack-=dt*slow;if(e.attack<=0){e.attack=2.4;e.roar=.6;hurtPlayer(e.damage,pos);ring(TV.set(pos.x,groundY(pos.x,pos.z)+.2,pos.z+4),13,.6,'#ffd7a0',.7);trauma=Math.min(1,trauma+.35);sfx.play('small-boom');}}
  e.root.rotation.y=damp(e.root.rotation.y,Math.atan2(-pos.x*.03,1),.5,dt);
}
// Turrets have their own health; a turret takes the damage of any hit landing on it.
function hitTurret(e,point,dealt,explosive){const sc=e.root.scale.x;
  for(const t of e.turrets){if(t.dead)continue;t.zone.obj.getWorldPosition(TV);if(TV.distanceTo(point)>t.zone.r*sc*(explosive?2.4:1.3))continue;t.hp-=dealt*(explosive?1.2:1);
    if(t.hp<=0){t.dead=true;t.zone.dead=true;t.head.visible=false;explode(TV.clone(),1.6);sparks(TV,18,'hot',9,.16);trauma=Math.min(1,trauma+.25);e.hp-=e.maxHp*.05;
      const left=e.turrets.filter(x=>!x.dead).length;
      if(left)toast(`צריח הושמד · נשארו ${left}`);else{e.exposed=true;e.armor=.18;e.roar=1.5;sfx.play('roar');announce('השריון נפתח','הכור חשוף על הגב · כל הנשקים עליו',2.6);}}
    break;}
}
function updateLeviathan(e,dt,slow,speed){
  const pos=e.root.position;e.st+=dt*slow;const sea=seaY(pos.x,pos.z);
  if(!e.rage&&e.hp/e.maxHp<.5){e.rage=true;$('boss-hud').classList.add('enraged');announce('הלווייתן משתולל','מנטות יוצאות מהגב · הוא עולה לעתים קרובות יותר',2.6);sfx.play('alarm');}
  const swim=f=>{const t=elapsed*f+e.phase;e.mid.rotation.x=Math.sin(t)*.03;e.tail.rotation.x=Math.sin(t-1)*.1;e.fluke.rotation.x=Math.sin(t-1.8)*.32;};
  const S=e.root.scale.x,depthTo=(d,half)=>{pos.y=damp(pos.y,sea-d*S,half,dt);};
  const ridgeFoam=()=>{if(Math.random()<dt*16){const z=pos.z+rand(-10,7);emit('foam',TV.set(pos.x+rand(-1.2,1.2),seaY(pos.x,z)+.12,z),rand(-1.5,1.5),rand(1,2.6),rand(-2.5,-.5),rand(.4,.7),rand(.14,.24),10);}};
  const st=e.state;
  if(st==='approach'){pos.z=Math.min(e.stopZ,pos.z+speed*dt);pos.x=Math.sin(elapsed*.22+e.phase)*9*clamp((-pos.z-50)/40,0,1);depthTo(2.5,.4);swim(1.4);ridgeFoam();e.root.rotation.x=damp(e.root.rotation.x,0,.3,dt);
    if(pos.z>=e.stopZ-.05){e.state='rise';e.st=0;}}
  else if(st==='cruise'){const dx=e.goalX-pos.x;pos.x+=clamp(dx,-1,1)*speed*.9*dt;pos.z=damp(pos.z,e.stopZ,.8,dt);depthTo(2.6,.4);swim(1.6);ridgeFoam();e.root.rotation.y=dampAngle(e.root.rotation.y,clamp(dx*.05,-.35,.35),.4,dt);
    if(e.st>(e.rage?3.0:4.6)){e.state='rise';e.st=0;}}
  else if(st==='rise'){depthTo(-1.3,.35);swim(.9);e.root.rotation.x=damp(e.root.rotation.x,-.07,.3,dt);e.root.rotation.y=dampAngle(e.root.rotation.y,(pos.x>0?-1:1)*.45,.4,dt);
    if(e.st>1.4){e.state='surface';e.st=0;e.shots=0;e.spawned=false;sfx.play('roar');splash(TV.set(pos.x,sea,pos.z+6),true);splash(TV.set(pos.x+4,sea,pos.z-2),true);trauma=Math.min(1,trauma+.15);}}
  else if(st==='surface'){depthTo(-1.5,.25);swim(.6);e.root.rotation.y=dampAngle(e.root.rotation.y,(pos.x>0?-1:1)*.45,.5,dt);e.jaw.rotation.x=damp(e.jaw.rotation.x,.55,.12,dt);for(const h of e.hatches)h.lid.rotation.z=damp(h.lid.rotation.z,-h.s*1.25,.12,dt);
    e.glow.emissiveIntensity=damp(e.glow.emissiveIntensity,3.6+Math.sin(elapsed*8)*.8,.15,dt);e.eyeMat.emissiveIntensity=damp(e.eyeMat.emissiveIntensity,3.4,.15,dt);
    if(e.st<.9&&Math.random()<dt*30){e.blow.getWorldPosition(TV);emit('foam',TV,rand(-1.5,1.5),rand(10,16),rand(-1.5,1.5),rand(.9,1.4),rand(.25,.45),14);}
    if(e.st<.05)sfx.play('geyser');
    const volley=e.rage?4:3;if(e.shots<volley&&e.st>1.1+e.shots*1.1){const h=e.hatches[(e.shots*3)%e.hatches.length];h.tube.getWorldPosition(TV);const from=TV.clone();from.y=sea+.1;from.z+=3;
      launchShell(from,'torpedo',e.damage,new THREE.Vector3(pos.x*.5+rand(-4,4),0,shoreZ(pos.x*.5)+2));sfx.play('torpedo');splash(from);e.shots++;}
    if(!e.spawned&&e.st>2.2){e.spawned=true;const sharks=enemies.filter(x=>x.kind==='shark'&&!x.dead).length;
      for(const s of [-1,1])if(sharks<4){const sp=spawn('shark',new THREE.Vector3(pos.x+s*10,0,pos.z+9));sp.reward=Math.round(sp.reward*.5);}
      if(e.rage)for(const s of [-1,1]){e.hatches[s>0?0:1].tube.getWorldPosition(TV);const m=spawn('manta',TV.clone().add(new THREE.Vector3(0,4,0)));m.reward=Math.round(m.reward*.5);}}
    if(e.st>(e.rage?6.8:7.6)){e.state='dive';e.st=0;}}
  else if(st==='dive'){depthTo(3.4,.4);swim(1.4);e.root.rotation.x=damp(e.root.rotation.x,.06,.3,dt);e.jaw.rotation.x=damp(e.jaw.rotation.x,0,.1,dt);for(const h of e.hatches)h.lid.rotation.z=damp(h.lid.rotation.z,0,.1,dt);
    e.glow.emissiveIntensity=damp(e.glow.emissiveIntensity,.6,.2,dt);e.eyeMat.emissiveIntensity=damp(e.eyeMat.emissiveIntensity,.8,.2,dt);
    if(e.st>1.6){e.state='cruise';e.st=0;e.goalX=clamp(-Math.sign(pos.x||1)*rand(8,24),-24,24);}}
}
function crabLegs(e,dt,moving,cyc){for(const L of e.legs){const ph=cyc+((L.i+(L.s>0?0:1))%2?Math.PI:0);L.hip.rotation.y=moving?Math.sin(ph)*.32:damp(L.hip.rotation.y,0,.15,dt);L.hip.rotation.z=L.hip.userData.baseZ+(moving?Math.max(0,Math.cos(ph))*.28*L.s:0);}}
// menu pose: gentle idle animation for the showcase line-up
function idlePose(e,dt){const t=elapsed+e.baseX;
  if(e.head){e.body.position.y=1.63+Math.sin(t*2)*.04;e.head.rotation.y=Math.sin(t*.7)*.25;e.head.rotation.x=Math.sin(t*1.3)*.06;}
  else if(e.kindModel==='crab'){crabLegs(e,dt,false,0);e.body.position.y=1.07+Math.sin(t*1.6)*.03;for(const c of e.claws){const o=Math.max(0,Math.sin(t*1.2+c.s))*.45;c.up.rotation.x=-.1-o;c.lo.rotation.x=.1+o*.6;}}
  else if(e.kindModel==='manta'){const f=t*3.4;for(const w of e.wings){w.inner.rotation.z=w.s*Math.sin(f)*.42;w.outer.rotation.z=w.s*Math.sin(f-.8)*.5;}e.tailSegs.forEach((sg,i)=>sg.rotation.y=Math.sin(t*2-i*.6)*.18);e.root.position.y=9.5+Math.sin(t*1.1)*.6;e.root.rotation.y=Math.sin(t*.3)*.5+.2;e.body.rotation.z=Math.sin(t*.3)*.15;}}

// ---------- damage & death ----------
function damageEnemy(e,amount,{crit=false,explosive=false,point=null,quiet=false,shield=false}={}){
  if(e.dead)return 0;if(shield)amount*=explosive?.7:.25;const critMul=perk==='eagle'?3:2;const dealt=computeDamage(amount*(perk==='pierce'?1.3:1),{armor:e.armor,crit,explosive,critMul});
  e.hp-=dealt;e.hurtUntil=elapsed+2.5;if(perk==='chill')e.chill=1.6;if(e.body&&!isBoss(e.kind))e.body.rotation.z=rand(-.12,.12);
  if(e.turrets&&point)hitTurret(e,point,dealt,explosive);
  e.dmgAcc+=dealt;const p=point||e.root.position;if(!quiet&&(crit||elapsed-e.lastNum>.14||e.hp<=0)){floatText(p,Math.round(e.dmgAcc).toString(),crit?'crit':(e.armor>.3&&!explosive)?'armor':'');e.dmgAcc=0;e.lastNum=elapsed;}
  if(e.hp<=0)kill(e);return dealt;
}
function kill(e){
  e.dead=true;const reward=Math.round(e.reward*(perk==='bounty'?1.35:1));save.coins+=reward;save.kills++;roundCoins+=reward;killed++;fury=clamp(fury+(perk==='charge'?16:8)*(isBoss(e.kind)?3:1),0,100);
  const big=isBoss(e.kind);const center=new THREE.Vector3();e.zones[0].obj.getWorldPosition(center);
  explode(center,big?3:e.kind==='heavy'||e.kind==='raft'?1.6:1.05);shatter(e,center,big?14:7);
  floatText(center.clone().add(new THREE.Vector3(0,3.2*e.root.scale.x,0)),`+${reward} ◆`,'coin');sfx.play('coin');
  if(e.kind==='raft')for(const p of e.passengers||[])shatter(p,center,6);
  if(big){slowmo=1.1;for(let i=1;i<4;i++)later(i*.22,()=>explode(center.clone().add(new THREE.Vector3(rand(-6,6),rand(-2,4),rand(-4,4))),2.2));trauma=1;announce({king:'מלך הברזל הופל',hive:'ספינת הכוורת התרסקה',turtle:'צב המבצר התפרק',leviathan:'לווייתן הפלדה שוקע'}[e.kind],`+${reward} מטבעות`,2.6);}
  if(e.kind==='raft'||(e.root.position.y<seaY(e.root.position.x,e.root.position.z)+.5&&e.kind!=='drone'))splash(center,true);
  removeEnemy(e);persist();
}
function shatter(e,center,force){
  const list=e.parts.slice(0,e.kind==='drone'?7:18);
  for(const m of list){if(!m.parent)continue;scene.attach(m);const dir=m.getWorldPosition(tmp).sub(center).normalize();
    debris.push({m,vx:dir.x*force*rand(.6,1.2)+rand(-2,2),vy:Math.abs(dir.y)*force+rand(4,9),vz:dir.z*force*rand(.6,1.2)+rand(-2,2),ax:rand(-8,8),az:rand(-8,8),life:rand(1.3,2.1)});}
  if(debris.length>220)for(const d of debris.splice(0,debris.length-220))scene.remove(d.m);
}

// ---------- shooting ----------
function aimRay(spread=0){raycaster.setFromCamera(pointer,camera);const r=raycaster.ray.clone();if(spread){r.direction.add(new THREE.Vector3(rand(-1,1),rand(-1,1),rand(-1,1)).multiplyScalar(spread)).normalize();}return r;}
const tmpZ=new THREE.Vector3();
// A zone can be hit unless it is under the water surface, or it is a weak point that only opens in a certain state.
function zoneHittable(e,z){if(z.dead||(z.when&&!z.when(e)))return false;if(z.surfacedOnly&&e.state!=='surface')return false;z.obj.getWorldPosition(tmpZ);const w=seaY(tmpZ.x,tmpZ.z);return !(tmpZ.y<w-.3&&groundY(tmpZ.x,tmpZ.z)<w);}
function aimPoint(e){const zs=e.zones.filter(z=>zoneHittable(e,z));const z=zs.find(z=>z.crit)||zs.find(z=>z.part)||zs.find(z=>!z.shield)||zs[0];return z?z.obj.getWorldPosition(new THREE.Vector3()):null;}
function castShot(ray,assist=1){
  let best=null;
  for(const e of enemies){if(e.dead)continue;const sc=e.root.scale.x;let ed=Infinity,ec=false,ez=null,shellD=Infinity,shellZ=null;
    for(const z of e.zones){if(!zoneHittable(e,z))continue;z.obj.getWorldPosition(tmp);const along=tmp2.copy(tmp).sub(ray.origin).dot(ray.direction);if(along<=0)continue;const rr=z.r*sc*(z.crit?Math.min(assist,1.15):assist);const d2=ray.distanceSqToPoint(tmp);
      if(d2<rr*rr){const hd=along-Math.sqrt(rr*rr-d2);if(z.enclosing){if(hd<shellD){shellD=hd;shellZ=z;}continue;}if(z.crit){ec=true;}if(hd<ed){ed=hd;ez=z;}}}
    if(!ez&&shellZ){ez=shellZ;ed=shellD;}
    if(ez&&(!best||ed<best.dist))best={e,dist:ed,crit:ec&&!ez.shield,shield:!!ez.shield};}
  for(const s of shells){const along=tmp2.copy(s.mesh.position).sub(ray.origin).dot(ray.direction);if(along<=0)continue;const rr=1.5*assist;const d2=ray.distanceSqToPoint(s.mesh.position);if(d2<rr*rr&&(!best||along<best.dist))best={shell:s,dist:along};}
  if(best){best.point=ray.at(best.dist,new THREE.Vector3());return best;}
  // miss: find water or sand under the ray
  if(ray.direction.y<-.002){let t=-ray.origin.y/ray.direction.y;const p=ray.at(t,new THREE.Vector3());for(let i=0;i<4;i++){const gy=surfaceY(p.x,p.z);t=(gy-ray.origin.y)/ray.direction.y;ray.at(t,p);}
    return {miss:true,point:p,water:groundY(p.x,p.z)<seaY(p.x,p.z)};}
  return {miss:true,point:ray.at(220,new THREE.Vector3()),sky:true};
}
function muzzleWorld(model,i){return model.muzzles[i%model.muzzles.length].getWorldPosition(new THREE.Vector3());}
function flashMuzzle(model,i,scale=1){const f=model.flashes[i%Math.max(1,model.flashes.length)];if(f){f.visible=true;f.rotation.z=rand(0,6.28);f.scale.setScalar(scale*rand(.8,1.2));f.userData.until=elapsed+.045;}muzzleLight.intensity=18*scale;model.muzzles[i%model.muzzles.length].getWorldPosition(tmp);camera.worldToLocal(muzzleLight.position.copy(tmp));}
function ejectCasing(model,type){
  if(particles.length>500)return;const m=new THREE.Mesh(geo(type==='shell'?'casingS':'casing',()=>type==='shell'?new THREE.CylinderGeometry(.06,.06,.22,8):new THREE.CylinderGeometry(.03,.03,.12,6)),type==='shell'?PMAT.shellRed:PMAT.brass);
  model.port.getWorldPosition(tmp);m.position.copy(camera.worldToLocal(tmp.clone()));camera.add(m);particles.push({m,vx:(model.port.position.x>0?1:-1)*rand(1.6,2.6),vy:rand(1.8,2.8),vz:rand(-.2,.6),life:.55,max:.55,size:1,gravity:9,spin:true,local:true});
}
function impactFx(hit,kind){
  const p=hit.point;
  if(hit.shell){explode(p,.6,{light:false});destroyShell(hit.shell,true);return;}
  if(hit.e){if(hit.crit){sparks(p,8,'crit',7,.1);sprite(TEX.flash,p,1.4,.08);sfx.play('crit');roundCrits++;$('hit-marker').className='crit';}
    else if((hit.shield||hit.e.armor>.3)&&kind!=='cannon'){sparks(p,6,'blue',8,.07);sfx.play('ping');$('hit-marker').className='armor';}
    else{sparks(p,kind==='shotgun'?2:4,'spark',6,.08);sfx.play('hit');$('hit-marker').className='';}
    $('hit-marker').style.opacity=1;hitUntil=elapsed+.1;return;}
  if(hit.sky)return;if(hit.water){if(Math.random()<.6)splash(p);sfx.play('splash',.6);}else sandPuff(p);
}
function fireWeapon(){
  const ws=wsCache[current],model=gunModels[current],st=wstate[current];shotCount++;roundShots++;lastShotAt=elapsed;firedSince++;
  const furyMul=furyTimer>0?1.5:1;const assist=TOUCH?1.35:1;
  if(current==='cannon'){
    const ray=aimRay(ws.spread);const from=muzzleWorld(model,0);const target=castShot(ray,assist).point;const dir=target.clone().sub(from).normalize();
    const shell=new THREE.Group();mesh(shell,geo('cshell',()=>new THREE.CapsuleGeometry(.14,.35,4,8).rotateX(Math.PI/2)),mat('#ffcf7a',.4,.3,'#ff8a2a',2.5));shell.position.copy(from);scene.add(shell);
    projectiles.push({mesh:shell,vel:dir.multiplyScalar(170),life:0,ws,furyMul});
    flashMuzzle(model,0,1.6);recoil+=.55;recoilRot+=.12;trauma=Math.min(1,trauma+.18);sfx.play('cannon');ejectCasing(model,'shell');
    return;
  }
  if(current==='tesla'){teslaTick(ws,furyMul,assist);return;}
  const pellets=ws.pellets;let anyHit=false;const perEnemy=new Map();
  const mi=model.muzzleIndex++;const from=muzzleWorld(model,mi);
  for(let i=0;i<pellets;i++){
    const ray=aimRay(ws.spread*(pellets>1?1:1+heatSpread()));const hit=castShot(ray,assist);
    if(current==='mg'||i%2===0)tracer(from,hit.point,{speed:pellets>1?260:340,len:pellets>1?3.5:7,width:pellets>1?.05:.07});
    if(hit.e){anyHit=true;const prev=perEnemy.get(hit.e)||{dmg:0,crit:false,point:hit.point};prev.dmg+=ws.damage*furyMul*(hit.shield?.25:1);prev.crit=prev.crit||hit.crit;perEnemy.set(hit.e,prev);}
    if(i<4||hit.e||hit.shell)impactFx(hit,current);
  }
  for(const [e,v] of perEnemy){const tgt=e;damageEnemy(e,v.dmg,{crit:v.crit,point:v.point});fury=clamp(fury+(perk==='charge'?2.4:1.2),0,100);
    if(perk==='chain'&&shotCount%4===0&&!tgt.dead){const n=enemies.find(o=>o!==tgt&&!o.dead&&o.root.position.distanceTo(tgt.root.position)<22);if(n){bolt(v.point,n.zones[0].obj.getWorldPosition(new THREE.Vector3()));damageEnemy(n,v.dmg*.8,{quiet:true});}}}
  if(anyHit)roundHits++;
  flashMuzzle(model,mi,current==='shotgun'?1.4:1);
  if(current==='mg'){recoil+=.07;recoilRot+=.012;trauma=Math.min(1,trauma+.035);sfx.play('mg');ejectCasing(model,'brass');}
  else{recoil+=.38;recoilRot+=.09;trauma=Math.min(1,trauma+.15);sfx.play('shotgun');ejectCasing(model,'shell');}
}
function heatSpread(){const s=wstate[current];return s?s.heat/100*1.6:0;}
function teslaTick(ws,furyMul,assist){
  const model=gunModels.tesla;const ray=aimRay(0);let hit=castShot(ray,assist*2.3);let target=hit.e;
  if(!target){let bestA=.07;for(const e of enemies){if(e.dead)continue;e.zones[0].obj.getWorldPosition(tmp);const a=tmp.sub(ray.origin).normalize().angleTo(ray.direction);if(a<bestA){bestA=a;target=e;}}if(target){target.zones[0].obj.getWorldPosition(tmp);hit={e:target,point:tmp.clone(),crit:false};}}
  const from=muzzleWorld(model,0);model.glow.scale.setScalar(rand(.5,.8));
  if(!target||hit.shell){const end=hit.point.clone();if(from.distanceTo(end)>40)end.copy(from).add(ray.direction.clone().multiplyScalar(40));bolt(from,end,'tracerTesla',.03);if(hit.shell){destroyShell(hit.shell,true);explode(hit.point,.6,{light:false});}sfx.play('tesla',.6);return;}
  roundHits++;bolt(from,hit.point,'tracerTesla',.045);bolt(from,hit.point,'tracerTesla',.022);sparks(hit.point,3,'blue',5,.07);
  const done=new Set([target]);damageEnemy(target,ws.damage*furyMul,{crit:hit.crit,point:hit.point,shield:hit.shield&&Math.random()<.5});fury=clamp(fury+(perk==='charge'?1.6:.8),0,100);
  let src=hit.point.clone();let srcE=target;for(let c=0;c<ws.chain;c++){let n=null,nd=18;for(const e of enemies){if(e.dead||done.has(e))continue;const d=e.root.position.distanceTo(srcE.root.position);if(d<nd){nd=d;n=e;}}if(!n)break;done.add(n);const np=n.zones[0].obj.getWorldPosition(new THREE.Vector3());bolt(src,np,'tracerTesla',.05);damageEnemy(n,ws.damage*.6*furyMul,{point:np});src=np;srcE=n;}
  if(hit.crit)sfx.play('crit');sfx.play('tesla');$('hit-marker').className=hit.crit?'crit':'';$('hit-marker').style.opacity=1;hitUntil=elapsed+.08;
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];const prev=p.mesh.position.clone();p.vel.y-=6*dt;p.mesh.position.addScaledVector(p.vel,dt);p.mesh.lookAt(tmp.copy(p.mesh.position).add(p.vel));p.life+=dt;
    if(Math.random()<.7)sprite(TEX.smoke,prev,.7,.35,{additive:false,grow:1.6,opacity:.35,color:'#d8d8d8'});
    const seg=new THREE.Ray(prev,p.vel.clone().normalize());const segLen=prev.distanceTo(p.mesh.position);let hitE=null,crit=false,hitShell=null;
    for(const e of enemies){if(e.dead)continue;const sc=e.root.scale.x;for(const z of e.zones){z.obj.getWorldPosition(tmp);const along=tmp2.copy(tmp).sub(prev).dot(seg.direction);if(along<-1||along>segLen+1)continue;if(seg.distanceSqToPoint(tmp)<(z.r*sc*1.1)**2){hitE=e;crit=crit||z.crit;}}if(hitE)break;}
    if(!hitE)for(const s of shells)if(s.mesh.position.distanceTo(p.mesh.position)<2){hitShell=s;break;}
    const pos=p.mesh.position;const below=pos.y<surfaceY(pos.x,pos.z);
    if(hitE||hitShell||below||p.life>3){
      const ws=p.ws;explode(pos.clone(),1.5);if(below&&groundY(pos.x,pos.z)<seaY(pos.x,pos.z))splash(pos,true);
      if(hitShell)destroyShell(hitShell,true);let hits=0;
      for(const e of [...enemies]){if(e.dead)continue;e.zones[0].obj.getWorldPosition(tmp);const d=Math.max(0,tmp.distanceTo(pos)-e.zones[0].r*e.root.scale.x);if(e===hitE||d<ws.splash){hits++;const fall=e===hitE?1:1-.5*d/ws.splash;damageEnemy(e,ws.damage*p.furyMul*fall,{explosive:true,crit:e===hitE&&crit,point:e===hitE?pos.clone():tmp.clone()});}}
      if(hits)roundHits++;if(hitE&&crit)roundCrits++;scene.remove(p.mesh);projectiles.splice(i,1);}
  }
}
function updateShells(dt){
  for(let i=shells.length-1;i>=0;i--){const s=shells[i];s.t+=dt*(frostTimer>0?.45:1);const u=Math.min(1,s.t/s.T);
    s.mesh.position.lerpVectors(s.from,s.to,u);
    if(s.type==='torpedo'){const p=s.mesh.position;p.y=Math.max(seaY(p.x,p.z),groundY(p.x,p.z))+.05;s.trail-=dt;if(s.trail<=0){s.trail=.04;emit('foam',tmp.set(p.x+rand(-.3,.3),p.y+.1,p.z-.8),rand(-1.2,1.2),rand(1.5,3.5),rand(-2,-.5),rand(.4,.7),rand(.12,.22),12);}}
    else{s.mesh.position.y+=s.arc*4*u*(1-u);s.mesh.rotation.x+=dt*4;s.trail-=dt;if(s.trail<=0){s.trail=.06;sprite(TEX.smoke,s.mesh.position,s.type==='siege'?1.3:.9,.5,{additive:false,grow:1.8,opacity:.4,color:'#8a8f93'});}}
    if(u>=1){explode(s.to,s.type==='siege'?1.6:1.1);if(s.type==='torpedo')splash(s.to,true);hurtPlayer(s.dmg,s.to);scene.remove(s.mesh);shells.splice(i,1);}}
}
function destroyShell(s,reward){const i=shells.indexOf(s);if(i<0)return;scene.remove(s.mesh);shells.splice(i,1);if(reward){save.coins+=3;roundCoins+=3;floatText(s.mesh.position,'+3 ◆','crit');}}

// ---------- abilities ----------
function rocket(){
  if(mode!=='battle'||rocketCooldown>0)return;const st=stats(save);rocketCooldown=st.rocketCd;const ray=aimRay();
  let target=null,d=Infinity;for(const e of enemies){if(e.dead)continue;const dist=ray.distanceToPoint(e.root.position)/Math.max(1,e.root.position.distanceTo(ray.origin)*.02);if(dist<d){d=dist;target=e;}}
  const hit=castShot(ray,1.5);const impact=hit.e?hit.e.root.position.clone():target&&d<8?target.root.position.clone():hit.point.clone();
  for(let i=0;i<6;i++)later(i*.09,()=>{if(mode!=='battle')return;const from=new THREE.Vector3(i%2?3:-3,-1+rand(-.3,.3),-1);camera.localToWorld(from);const to=impact.clone().add(new THREE.Vector3(rand(-1,1)*st.radius*.35,0,rand(-1,1)*st.radius*.35));to.y=surfaceY(to.x,to.z)+.6;missile(from,to,st);});
  sfx.play('swap');toast('מטח טילים נורה');
}
function missile(from,to,st){
  const m=new THREE.Group();mesh(m,geo('missile',()=>new THREE.CapsuleGeometry(.12,.6,4,8).rotateX(Math.PI/2)),mat('#e8e2d0',.4,.4));const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.fire,transparent:true,depthWrite:false,blending:add}));fl.scale.setScalar(1);fl.position.z=-.5;m.add(fl);
  m.position.copy(from);scene.add(m);const T=from.distanceTo(to)/90+.15;let t=0;const mid=from.clone().lerp(to,.5).add(new THREE.Vector3(rand(-6,6),12,0));
  projectilesFx.push({m,from,to,mid,t,T,st});
}
const projectilesFx=[];
function updateMissiles(dt){
  for(let i=projectilesFx.length-1;i>=0;i--){const p=projectilesFx[i];p.t+=dt;const u=Math.min(1,p.t/p.T);const a=p.from.clone().lerp(p.mid,u),b=p.mid.clone().lerp(p.to,u);const pos=a.lerp(b,u);p.m.lookAt(pos);p.m.position.copy(pos);
    sprite(TEX.smoke,pos,1.1,.6,{additive:false,grow:2,opacity:.45,color:'#e0e0e0'});
    if(u>=1){scene.remove(p.m);projectilesFx.splice(i,1);explode(p.to,1.4);if(groundY(p.to.x,p.to.z)<seaY(p.to.x,p.to.z))splash(p.to,true);
      for(const e of [...enemies]){if(e.dead)continue;e.zones[0].obj.getWorldPosition(tmp);const d=Math.max(0,tmp.distanceTo(p.to)-e.zones[0].r*e.root.scale.x);const R=p.st.radius*.6;if(d<R)damageEnemy(e,p.st.rocket*.38*(1-.4*d/R),{explosive:true,point:tmp.clone()});}
      for(const s of [...shells])if(s.mesh.position.distanceTo(p.to)<p.st.radius)destroyShell(s,true);}}
}
function frost(){if(mode!=='battle'||frostCooldown>0)return;const st=stats(save);frostCooldown=st.frostCd;frostTimer=st.frostTime;for(const e of enemies){e.root.getWorldPosition(tmp);for(let i=0;i<6;i++)emit('ice',tmp.clone().add(new THREE.Vector3(rand(-1.5,1.5),rand(0,3),rand(-1.5,1.5))),rand(-1,1),rand(1,3),rand(-1,1),rand(.6,1.2),rand(.12,.25),2);}sfx.play('start');toast(`הפלישה הוקפאה ל־${st.frostTime} שניות`);}
function activateFury(){if(mode!=='battle'||fury<100||furyTimer>0)return;fury=0;furyTimer=7;for(const k of WEAPON_ORDER){wstate[k].heat=0;wstate[k].overheated=false;}announce('כוח אש','7 שניות · קצב כפול · בלי התחממות',2);sfx.play('buy');}

// ---------- weapons state ----------
// Adaptive resolution (v0.4): measured on a laptop with integrated graphics the game ran at 18-42 FPS at 1920 wide.
// The renderer now lowers its internal resolution until it holds ~50+ FPS, and raises it back when there is headroom.
// As a last step it turns off sun shadows. The menu shows the current render scale.
let shadowTick=0,basePR=1,resScale=1,adaptMs=0,adaptN=0,adaptCalm=0,shadowsOff=false;const ADAPT=!QA||new URLSearchParams(location.search).has('adapt');
function adapt(ms){if(!ADAPT||ms>2500)return;adaptMs+=ms;adaptN++;if(adaptMs<1500)return;const fps=adaptN*1000/adaptMs;adaptMs=0;adaptN=0;if(adaptCalm>0){adaptCalm--;return;}
  if(fps<50&&resScale>.5){resScale=Math.max(.5,resScale*(fps<35?.8:.9));applyRes();}
  else if(fps<42&&resScale<=.5&&!shadowsOff){shadowsOff=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;adaptCalm=2;updateQualityLabel();}
  else if(fps>58&&resScale<1){resScale=Math.min(1,resScale*1.06);applyRes();}}
function applyRes(){renderer.setPixelRatio(basePR*resScale);renderer.setSize(innerWidth,innerHeight);adaptCalm=1;updateQualityLabel();}
function updateQualityLabel(){$('quality').textContent=`איכות גרפיקה: ${HIGH?'גבוהה':'רגילה'}${resScale<.99?` · חדות ${Math.round(resScale*100)}%`:''}${shadowsOff?' · צללים חסכוניים':''}`;}
function refreshWeaponCache(){for(const k of WEAPON_ORDER){wsCache[k]=weaponStats(save,k);if(wsCache[k].chain)wsCache[k].chain+=WEATHER[weatherKind].chain;}}
function resetWeaponState(){refreshWeaponCache();for(const k of WEAPON_ORDER)wstate[k]={heat:0,overheated:false,ammo:wsCache[k].mag,reload:0,cool:0};}
function switchWeapon(k){if(!save.weapons[k]||k===current||mode!=='battle'&&mode!=='paused')return;current=k;swapTimer=.32;sfx.play('swap');buildWeaponBar();}
function startReload(k=current){const s=wstate[k],ws=wsCache[k];if(ws.mode!=='mag'||s.reload>0||s.ammo>=ws.mag)return;s.reload=ws.reload*(perk==='cool'?.75:1)/(furyTimer>0?3:1);s.reloadMax=s.reload;if(k===current)sfx.play('reload');}
function updateWeapons(dt){
  const st=stats(save);const firingInput=(pointer.down||keys.has('KeyF'))&&swapTimer<=0;
  for(const k of WEAPON_ORDER){const s=wstate[k],ws=wsCache[k];if(!save.weapons[k])continue;s.cool-=dt;
    if(ws.mode==='heat'){const firing=k===current&&firingInput&&!s.overheated;const ht=tickHeat(s.heat,dt,firing,st.cooling*WEATHER[weatherKind].cooling,furyTimer>0,perk,ws.heatPerShot*ws.rate);s.heat=ht.heat;
      if(ht.overheated&&!s.overheated){s.overheated=true;if(k===current){toast('הנשק התחמם · תנו לו להתקרר');sfx.play('overheat');for(let i=0;i<8;i++)sprite(TEX.smoke,muzzleWorld(gunModels[k],i),.6,.8,{additive:false,grow:2.5,rise:1.5,opacity:.4,color:'#cfd6da'});}}
      if(s.overheated&&s.heat<25)s.overheated=false;}
    else if(s.reload>0){s.reload-=dt;if(s.reload<=0){s.reload=0;s.ammo=ws.mag;}}
  }
  const s=wstate[current],ws=wsCache[current];
  if(firingInput&&s.cool<=0){
    if(ws.mode==='heat'&&!s.overheated){fireWeapon();s.cool=1/(ws.rate*(furyTimer>0?2:1));}
    else if(ws.mode==='mag'){if(s.reload<=0&&s.ammo>0){fireWeapon();s.ammo--;s.cool=1/(ws.rate*(furyTimer>0?2:1));if(s.ammo===0)startReload();}else if(s.reload<=0&&s.ammo===0){startReload();}}
  }

}

// ---------- battle loop ----------
function beginWave(){
  sandbox=false;
  clearBattlefield();for(const e of showcase)e.root.visible=false;wave=save.nextWave;hp=stats(save).hp;fury=0;furyTimer=0;rocketCooldown=0;frostCooldown=0;frostTimer=0;waveTime=0;spawnIndex=0;killed=0;roundCoins=0;roundShots=0;roundHits=0;roundCrits=0;damageTaken=0;clearTimer=-1;turretTimers=[1,1.5];
  perk=selectedPerk;selectedPerk='';plan=wavePlan(wave);if(!save.weapons[current])current='mg';resetWeaponState();showWeapon(current);buildWeaponBar();setMode('battle');
  camera.position.set(0,8.6,24);$('scene').focus({preventScroll:true});
  $('battle-hint').hidden=wave>2;
  weatherKind=waveWeather(wave);weather.set(weatherKind);refreshWeaponCache();
  announce(`גל ${String(wave).padStart(2,'0')}`,plan.some(p=>isBoss(p.kind))?'פלישת בוס · החזיקו את קו ההגנה':waveHint(wave));sfx.play('start');
  const wk=weatherKind;if(wk!=='clear')later(3.4,()=>{if(mode==='battle'&&weatherKind===wk)toast(`${WEATHER[wk].name} · ${WEATHER[wk].rule}`);});
}
function waveHint(w){return {1:'זוהתה פלישה · כוונו לעיניים הזוהרות',2:'רצים מהירים בדרך',3:'רחפנים באוויר',4:'רפסודות ומשוריינים · נסו את התותח',6:'כרישי פלדה במים · הפילו את הטורפדו לפני החוף',7:'סרטני מצור · הצבת בולעת כדורים, כוונו לעיניים',8:'מנטות צוללות לעמדה · הפילו אותן באוויר',9:'כל הכוחות יחד',11:'פרק 2 · כרישים ורפסודות מתוך הערפל',12:'מצור בגשם · סרטנים ומרגמות',13:'נחיל מהיר · רצים, רחפנים ומנטות',14:'סערה ראשונה · הכול בבת אחת',16:'האוויר מלא · מנטות ורחפנים בערפל',17:'קו מצור כבד · התותח עובר את הצבתות',18:'להקת כרישים בסערה · הפילו טורפדו',19:'הגל האחרון לפני הלווייתן'}[w]||'זוהתה פלישה · הגנו על החוף';}
function returnToMenu(){clearBattlefield();weatherKind='clear';weather.set('clear');refreshWeaponCache();for(const e of showcase)e.root.visible=true;setMode('menu');updateStartLabel();}
function completeWave(){const bonus=waveBonus(wave);save.coins+=bonus;roundCoins+=bonus;save.bestWave=Math.max(save.bestWave,wave);save.nextWave=wave+1;persist();sfx.play('buy');openShop('win');}
function defeat(){pointer.down=false;save.bestWave=Math.max(save.bestWave,wave-1);persist();$('result').textContent=`הפלתם ${killed} רובוטים בגל ${wave} וצברתם ${roundCoins} מטבעות. המטבעות והשדרוגים נשמרו. נסו לשדרג נשק או לפתוח את התותח.`;setMode('dead');sfx.play('boom');}
function remaining(){return plan.length-spawnIndex+enemies.filter(e=>!e.dead&&e.state!=='retreat').length;}
function updateBattle(dt){
  for(let i=timers.length-1;i>=0;i--){timers[i].t-=dt;if(timers[i].t<=0){const f=timers[i].fn;timers.splice(i,1);f();}}
  waveTime+=dt;rocketCooldown=Math.max(0,rocketCooldown-dt);frostCooldown=Math.max(0,frostCooldown-dt);frostTimer=Math.max(0,frostTimer-dt);furyTimer=Math.max(0,furyTimer-dt);swapTimer=Math.max(0,swapTimer-dt);
  while(spawnIndex<plan.length&&waveTime>=plan[spawnIndex].time){const it=plan[spawnIndex++];if(it.pulse){toast(`מתקפה ${it.pulse} מתוך 3`);sfx.play('ping');}spawn(it.kind);}
  if(keys.has('ArrowLeft'))pointer.x=clamp(pointer.x-dt*.9,-.95,.95);if(keys.has('ArrowRight'))pointer.x=clamp(pointer.x+dt*.9,-.95,.95);if(keys.has('ArrowUp'))pointer.y=clamp(pointer.y+dt*.8,-.85,.85);if(keys.has('ArrowDown'))pointer.y=clamp(pointer.y-dt*.8,-.85,.85);
  if(bot)runBot(dt);
  updateWeapons(dt);updateProjectiles(dt);updateShells(dt);updateMissiles(dt);
  // support turrets
  const tl=save.upgrades.turret;for(let i=0;i<turrets.length;i++){const active=tl>=(i===0?1:3);turrets[i].visible=active;if(!active)continue;turretTimers[i]-=dt;const t=turrets[i];
    const tgt=enemies.filter(e=>!e.dead&&e.state!=='retreat').sort((a,b)=>b.root.position.z-a.root.position.z)[0];if(tgt){tgt.zones[0].obj.getWorldPosition(tmp);t.userData.head.rotation.y=damp(t.userData.head.rotation.y,Math.atan2(-(tmp.x-t.position.x),-(tmp.z-t.position.z)),.08,dt);
      if(turretTimers[i]<=0){const stt=stats(save);turretTimers[i]=stt.turretGap*(i?1.4:1);const from=t.userData.head.localToWorld(new THREE.Vector3(0,.1,-2.6));tracer(from,tmp.clone(),{speed:300,len:5,width:.08,kind:'tracerTesla'});sparks(tmp,3,'blue',5,.07);damageEnemy(tgt,stats(save).turretDamage,{point:tmp.clone()});}}}
  for(const e of [...enemies]){if(mode!=='battle')break;updateEnemy(e,dt);}
  if(mode!=='battle')return;
  if(!sandbox&&spawnIndex===plan.length&&enemies.length===0&&shells.length===0){if(clearTimer<0)clearTimer=1.2;clearTimer-=dt;if(clearTimer<=0)completeWave();}
}
function updateLabels(){
  for(const e of enemies){const fr=frostTimer>0||e.chill>0;e.label.classList.toggle('frozen',fr);e.label.classList.toggle('hurt',elapsed<e.hurtUntil);e.label.querySelector('i').style.width=`${Math.max(0,e.hp/e.maxHp*100)}%`;
    e.zones[0].obj.getWorldPosition(tmp);tmp.y+=(e.kind==='raft'?2.6:1.9)*e.root.scale.x;positionLabel(e.label,tmp);}
  if(boss)$('boss-fill').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;
}
function positionLabel(el,pos){projected.copy(pos).project(camera);el.style.left=`${(projected.x*.5+.5)*innerWidth}px`;el.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;el.hidden=projected.z>1||projected.z<0;}
function updateEffects(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.vy-=p.gravity*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
    if(p.spin){p.m.rotation.x+=dt*14;p.m.rotation.z+=dt*9;}else if(p.stretch){p.m.lookAt(tmp.set(p.m.position.x+p.vx,p.m.position.y+p.vy,p.m.position.z+p.vz));const sp=Math.hypot(p.vx,p.vy,p.vz);p.m.scale.set(p.size*.6,p.size*.6,p.size*(1+sp*.12));}else p.m.scale.setScalar(p.size*Math.max(.05,p.life/p.max));
    if(p.life<=0){p.m.removeFromParent();particles.splice(i,1);}}
  for(let i=sprites.length-1;i>=0;i--){const s=sprites[i];s.life-=dt;const u=1-s.life/s.max;s.m.scale.setScalar(s.size*(1+(s.grow-1)*u));s.m.position.y+=s.rise*dt;s.m.material.opacity=s.opacity*Math.max(0,1-u*u);if(s.life<=0){scene.remove(s.m);s.m.material.dispose();sprites.splice(i,1);}}
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.life-=dt;const u=1-r.life/r.max;r.m.scale.setScalar(.2+r.radius*u);r.m.material.opacity=r.opacity*(1-u);if(r.life<=0){scene.remove(r.m);r.m.material.dispose();rings.splice(i,1);}}
  for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];t.travel+=t.speed*dt;t.life-=dt;const head=Math.min(t.travel,t.dist),tail=Math.max(0,head-t.len);const L=Math.max(.01,head-tail),mid=(head+tail)/2;
    t.m.position.set(t.sx+t.dx*mid,t.sy+t.dy*mid,t.sz+t.dz*mid);t.m.scale.set(t.width,t.width,L);if(tail>=t.dist||t.life<=0){scene.remove(t.m);tracers.splice(i,1);}}
  for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.life-=dt;d.vy-=24*dt;d.m.position.x+=d.vx*dt;d.m.position.y+=d.vy*dt;d.m.position.z+=d.vz*dt;d.m.rotation.x+=d.ax*dt;d.m.rotation.z+=d.az*dt;
    const gy=surfaceY(d.m.position.x,d.m.position.z)+.1;if(d.m.position.y<gy){d.m.position.y=gy;d.vy=Math.abs(d.vy)*.3;d.vx*=.55;d.vz*=.55;d.ax*=.5;d.az*=.5;}
    if(d.life<.4)d.m.scale.multiplyScalar(Math.max(0,1-dt*6));if(d.life<=0){scene.remove(d.m);debris.splice(i,1);}}
  for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.life-=dt;f.pos.y+=dt*2.6;f.pos.x+=f.vx*dt;positionLabel(f.el,f.pos);f.el.style.opacity=clamp(f.life/.35,0,1);if(f.life<=0){f.el.remove();floaters.splice(i,1);}}
  explosionLight.intensity=Math.max(0,explosionLight.intensity-dt*260);muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*400);
}

// ---------- HUD ----------
function buildWeaponBar(){
  const bar=$('weapons');bar.replaceChildren();
  WEAPON_ORDER.forEach((k,i)=>{const w=WEAPONS[k],lv=save.weapons[k];const b=document.createElement('button');b.className='wslot'+(k===current?' active':'')+(lv?'':' locked');b.dataset.key=k;b.setAttribute('aria-label',`${w.name}${lv?'':' · נעול'}`);
    b.innerHTML=`<kbd>${i+1}</kbd><b>${w.icon}</b><strong>${w.short}</strong><small>${lv?'דרגה '+lv:'נעול'}</small>`;b.onclick=()=>{if(lv)switchWeapon(k);else toast(`${w.name} נפתח במוסך`);};bar.append(b);});
}
function updateHud(){
  const st=stats(save);$('coins').textContent=save.coins.toLocaleString('he-IL');$('wave').textContent=String(mode==='menu'||mode==='shop'?save.nextWave:wave).padStart(2,'0');
  $('hp-text').textContent=`${Math.ceil(hp)} / ${st.hp}`;$('hp-fill').style.width=`${clamp(hp/st.hp,0,1)*100}%`;$('hp-fill').style.background=hp/st.hp<.3?'#ed876a':'#70d9ab';
  $('progress').textContent=mode==='battle'||mode==='paused'?`נותרו ${remaining()}`:'מוכנים לפלישה';
  const ws=wsCache[current]||weaponStats(save,current),s=wstate[current];
  if(s){const panel=document.querySelector('.ammo-panel');$('weapon-name').textContent=`${ws.name} · דרגה ${ws.level}`;
    if(ws.mode==='heat'){$('heat-fill').parentElement.hidden=false;$('heat-fill').style.width=`${s.heat}%`;$('heat-fill').style.background=s.overheated?'#ed7451':s.heat>70?'#ffb067':'#ffd06b';$('heat-text').textContent=s.overheated?'מתקרר…':furyTimer>0?'כוח אש פעיל':`חום ${Math.round(s.heat)}%`;$('ammo-pips').replaceChildren();panel.classList.remove('reloading');}
    else{$('heat-fill').parentElement.hidden=s.reload<=0;$('heat-fill').style.width=`${s.reload>0?(1-s.reload/s.reloadMax)*100:0}%`;$('heat-fill').style.background='#ffb067';$('heat-text').textContent=s.reload>0?'טוען…':`${s.ammo} / ${ws.mag}`;panel.classList.toggle('reloading',s.reload>0);
      const pips=$('ammo-pips');if(pips.childElementCount!==ws.mag)pips.replaceChildren(...Array.from({length:ws.mag},()=>document.createElement('i')));[...pips.children].forEach((p,i)=>p.classList.toggle('empty',i>=s.ammo));}
    for(const b of $('weapons').children){const k=b.dataset.key,ws2=wsCache[k],s2=wstate[k];if(!save.weapons[k]||!s2)continue;b.querySelector('small').textContent=ws2.mode==='mag'?(s2.reload>0?'טוען':`${s2.ammo}/${ws2.mag}`):(s2.overheated?'חם':`${Math.round(s2.heat)}%`);}
  }
  $('rocket-cd').textContent=rocketCooldown>0?`${Math.ceil(rocketCooldown)} שנ׳`:'מוכן';$('frost-cd').textContent=frostCooldown>0?`${Math.ceil(frostCooldown)} שנ׳`:'מוכן';$('rocket').disabled=rocketCooldown>0;$('frost').disabled=frostCooldown>0;
  $('rocket').querySelector('i').style.width=`${(1-rocketCooldown/st.rocketCd)*100}%`;$('frost').querySelector('i').style.width=`${(1-frostCooldown/st.frostCd)*100}%`;
  $('fury-text').textContent=furyTimer>0?`${Math.ceil(furyTimer)} שנ׳`:fury>=100?'מוכן':`${Math.floor(fury)}%`;$('fury').disabled=fury<100||furyTimer>0;$('fury').classList.toggle('ready',fury>=100);$('fury').querySelector('i').style.width=`${furyTimer>0?furyTimer/7*100:fury}%`;
  $('frost-veil').style.opacity=frostTimer>0?1:0;
}

// ---------- shop ----------
function openShop(from){
  shopFrom=from;selectedPerk='';setMode('shop');refreshWeaponCache();
  $('shop-title').textContent=from==='win'?`גל ${wave} הושלם`:'מוסך החוף';$('shop-eyebrow').textContent=from==='win'?'החוף שלנו · לעת עתה':'חוזרים לקרב חזקים יותר';
  $('shop-subtitle').textContent=from==='win'?`בחרו שדרוגים ויתרון לגל ${save.nextWave}.`:'נשקים ושדרוגים קבועים ונשמרים במכשיר הזה.';
  $('wave-stats').hidden=from!=='win';if(from==='win'){const acc=roundShots?Math.round(roundHits/roundShots*100):0;$('wave-stats').innerHTML=`<div><b>${killed}</b><small>רובוטים הופלו</small></div><div><b>${acc}%</b><small>דיוק</small></div><div><b>${roundCrits}</b><small>פגיעות בעין</small></div><div><b>+${roundCoins}</b><small>מטבעות</small></div><div><b>${Math.round(damageTaken)}</b><small>נזק שספגנו</small></div>`;}
  $('perk-section').hidden=from!=='win';$('next-wave').textContent=`לגל ${save.nextWave} ←`;$('shop-back').hidden=from==='win';
  if(from==='win'){const choices=[...PERKS].sort(()=>Math.random()-.5).slice(0,3);$('perks').replaceChildren();for(const p of choices){const b=document.createElement('button');b.className='perk';b.innerHTML=`<strong>${p.name}</strong><small>${p.desc}</small>`;b.onclick=()=>{selectedPerk=p.id;for(const c of $('perks').children)c.classList.toggle('selected',c===b);$('shop-message').textContent=`${p.name} פעיל בגל הבא`;$('next-wave').disabled=false;};$('perks').append(b);}$('next-wave').disabled=true;$('shop-message').textContent='בחרו יתרון אחד כדי להמשיך';}
  else{$('next-wave').disabled=false;$('shop-message').textContent='כל שדרוג נשמר אוטומטית';}
  setShopTab(shopTab);
}
function setShopTab(t){shopTab=t;$('tab-weapons').classList.toggle('active',t==='weapons');$('tab-upgrades').classList.toggle('active',t!=='weapons');$('tab-weapons').setAttribute('aria-selected',t==='weapons');$('tab-upgrades').setAttribute('aria-selected',t!=='weapons');$('weapon-grid').hidden=t!=='weapons';$('upgrade-grid').hidden=t==='weapons';renderShop();}
function renderShop(){
  $('shop-coins').textContent=save.coins.toLocaleString('he-IL');const st=stats(save);
  const wg=$('weapon-grid');wg.replaceChildren();const maxDps=320;
  for(const k of WEAPON_ORDER){const w=WEAPONS[k],lv=save.weapons[k],cost=weaponCost(save,k);const ws=weaponStats(save,k);const dps=Math.round(sustainedDps(ws,st.cooling));const hit=Math.round(ws.damage*ws.pellets);
    const card=document.createElement('article');card.className='weapon-card'+(lv?'':' locked');
    const label=lv>=WEAPON_MAX?'דרגה מרבית':lv===0?`פתיחה · ${cost} ◆`:`שדרוג לדרגה ${lv+1} · ${cost} ◆`;
    card.innerHTML=`<span class="wicon">${w.icon}</span><h3>${w.name}<small>${lv?`דרגה ${lv} / ${WEAPON_MAX}`:'נעול'}</small></h3><p>${w.desc}</p>
      <div class="wstats"><span>נזק לשנייה</span><div class="bar"><i style="width:${Math.min(100,dps/maxDps*100)}%"></i></div><span>נזק לירייה</span><div class="bar"><i style="width:${Math.min(100,hit/250*100)}%"></i></div><span>${w.mode==='mag'?`מחסנית ${ws.mag}`:'התחממות'}</span><div class="bar"><i style="width:${w.mode==='mag'?Math.min(100,ws.mag/10*100):Math.min(100,ws.heatPerShot*ws.rate/40*100)}%"></i></div></div>
      <button ${lv>=WEAPON_MAX||save.coins<cost?'disabled':''}>${label}</button>`;
    card.querySelector('button').onclick=()=>{if(buyWeapon(save,k)){persist();sfx.play('buy');refreshWeaponCache();showWeapon(current);buildWeaponBar();renderShop();toast(lv===0?`${w.name} נפתח · מקש ${WEAPON_ORDER.indexOf(k)+1} בקרב`:`${w.name} · דרגה ${save.weapons[k]}`);if(lv===0){current=k;showWeapon(k);buildWeaponBar();}}};
    wg.append(card);}
  const ug=$('upgrade-grid');ug.replaceChildren();
  for(const [key,d] of Object.entries(UPGRADE_DEFS)){const lv=save.upgrades[key],cost=upgradeCost(save,key),max=lv>=d.max;const card=document.createElement('article');card.className='upgrade-card';
    card.innerHTML=`<div class="upgrade-top"><span class="upgrade-icon">${d.icon}</span><span class="upgrade-level">דרגה ${lv} / ${d.max}</span></div><h3>${d.name}</h3><p>${d.desc}</p><button ${max||save.coins<cost?'disabled':''} aria-label="שדרוג ${d.name}, ${cost} מטבעות">${max?'מקסימום':`שדרוג · ${cost} ◆`}</button>`;
    card.querySelector('button').onclick=()=>{if(buyUpgrade(save,key)){persist();sfx.play('buy');renderShop();toast(`השדרוג נרכש · ${d.name} · דרגה ${save.upgrades[key]}`);}};ug.append(card);}
  updateHud();
}

// ---------- frame ----------
let shakeT=0,basePitch=-.075,frozenCam=false;
function frame(t){
  if(islandDisposed)return;
  islandFrame=requestAnimationFrame(frame);
  if(islandPaused){lastTime=t;return;}
  if(visible&&lastTime)adapt(t-lastTime);const raw=Math.min(.05,(t-lastTime)/1000||.016);lastTime=t;if(!visible)return;
  slowmo=Math.max(0,slowmo-raw);const dt=raw*(slowmo>0?.35:1);elapsed+=dt;world.update(elapsed);weather.update(raw);
  if(mode==='battle'){for(let i=0;i<timeScale;i++){updateBattle(dt);if(mode!=='battle')break;}}
  if(!['paused','help'].includes(mode))updateEffects(dt);
  if(frozenCam){}else if(mode==='menu'){camera.rotation.x=damp(camera.rotation.x,basePitch+.015,.6,dt);camera.rotation.y=damp(camera.rotation.y,Math.sin(elapsed*.08)*.05,.6,dt);
    for(const e of showcase)idlePose(e,dt);}
  if(mode==='battle'){camera.rotation.y=damp(camera.rotation.y,-pointer.x*.1,.12,dt);camera.rotation.x=damp(camera.rotation.x,basePitch+pointer.y*.045,.12,dt);}
  // trauma-based shake (amount = trauma²), capped and smooth
  trauma=Math.max(0,trauma-dt*1.7);shakeT+=dt*30;const sh=trauma*trauma;if(!frozenCam){camera.position.x=Math.sin(shakeT*1.3)*.32*sh;camera.position.y=8.6+Math.sin(shakeT*1.7+1)*.26*sh;camera.rotation.z=Math.sin(shakeT*1.1+2)*.012*sh;}
  updateGunRig(dt);
  // crosshair state
  const cx=(pointer.x*.5+.5)*innerWidth,cy=(-pointer.y*.5+.5)*innerHeight;for(const id of ['crosshair','hit-marker']){$(id).style.left=`${cx}px`;$(id).style.top=`${cy}px`;}
  if(mode==='battle'&&Math.floor(elapsed*20)!==Math.floor((elapsed-dt)*20)){const h=castShot(aimRay(),TOUCH?1.35:1);$('crosshair').classList.toggle('on-target',!!(h.e||h.shell));$('crosshair').classList.toggle('crit',!!h.crit);}
  if(elapsed>bannerUntil)$('banner').style.opacity=0;if(elapsed>toastUntil)$('toast').style.opacity=0;if(elapsed>hitUntil)$('hit-marker').style.opacity=0;if(elapsed>damageUntil)$('damage-flash').style.opacity=0;
  if(mode==='battle'||mode==='paused')updateLabels();
  if(elapsed-lastHud>.08){updateHud();lastHud=elapsed;}
  if(shadowsOff&&(++shadowTick%4===0))renderer.shadowMap.needsUpdate=true;
  renderer.render(scene,camera);
}
// gun aim, recoil, swap and the weapon model's own animation
function updateGunRig(dt){
  if(gunRig){
    raycaster.setFromCamera(pointer,camera);const tg=raycaster.ray.at(70,tmp3);gunRig.updateMatrixWorld();const l=gunRig.worldToLocal(tg.clone());
    yoke.rotation.y=damp(yoke.rotation.y,clamp(Math.atan2(-l.x,-l.z),-.55,.55),.035,dt);yoke.rotation.x=damp(yoke.rotation.x,clamp(Math.atan2(l.y,Math.hypot(l.x,l.z)),-.1,.24),.035,dt);
    recoil=damp(recoil,0,.05,dt);recoilRot=damp(recoilRot,0,.07,dt);kick.position.z=Math.min(.6,recoil);kick.rotation.x=Math.min(.25,recoilRot);
    const m=gunModels[current];if(m){const s=wstate[current],ws=wsCache[current]||weaponStats(save,current);
      m.update(dt,{firing:mode==='battle'&&elapsed-lastShotAt<.14,fired:firedSince,heat:s?s.heat/100:0,overheated:!!s?.overheated,reload:s&&s.reload>0?1-s.reload/s.reloadMax:-1,ammo:s?s.ammo:ws.mag,mag:ws.mag,recoil,t:elapsed});firedSince=0;
      for(const f of m.flashes)if(f.visible&&elapsed>f.userData.until)f.visible=false;}
    const sw=swapTimer>0?Math.sin((1-swapTimer/.32)*Math.PI):0;if(shownWeapon!==current&&swapTimer<=.16){showWeapon(current);}
    const reloadDip=wstate[current]?.reload>0?.12:0;gunRig.position.y=(camera.aspect<.8?-1.5:-1.3)-sw*1.1-reloadDip+Math.sin(elapsed*1.5)*.01;gunRig.rotation.z=reloadDip?Math.sin(elapsed*6)*.03+.08:0;
    gunRig.visible=mode!=='menu'&&!frozenCam;
  }
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.fov=camera.aspect<.8?66:camera.aspect<1.2?54:44;camera.updateProjectionMatrix();basePitch=camera.aspect<.8?-.15:-.075;if(gunRig){const s=camera.aspect<.8?.5:.75;gunRig.scale.setScalar(s);}}

// ---------- input ----------
function pointAbs(e){const r=$('scene').getBoundingClientRect();pointer.x=clamp((e.clientX-r.left)/r.width*2-1,-1,1);pointer.y=clamp(-((e.clientY-r.top)/r.height)*2+1,-1,1);}
$('scene').addEventListener('pointermove',e=>{if(mode!=='battle')return;
  if(e.pointerType==='touch'){if(!touchAim||touchAim.id!==e.pointerId)return;const r=$('scene').getBoundingClientRect();pointer.x=clamp(pointer.x+(e.clientX-touchAim.x)/r.width*2*1.5,-.95,.95);pointer.y=clamp(pointer.y-(e.clientY-touchAim.y)/r.height*2*1.5,-.85,.85);touchAim.x=e.clientX;touchAim.y=e.clientY;}
  else pointAbs(e);});
$('scene').addEventListener('pointerdown',e=>{if(mode!=='battle')return;e.preventDefault();sfx.init();
  if(e.pointerType==='touch'){if(touchAim)return;touchAim={id:e.pointerId,x:e.clientX,y:e.clientY};}else pointAbs(e);
  pointer.down=true;try{$('scene').setPointerCapture(e.pointerId);}catch{}});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(ev,e=>{if(touchAim&&e.pointerId!==touchAim.id)return;pointer.down=false;touchAim=null;});
$('scene').addEventListener('wheel',e=>{if(mode!=='battle')return;const owned=WEAPON_ORDER.filter(k=>save.weapons[k]);const i=owned.indexOf(current);switchWeapon(owned[(i+(e.deltaY>0?1:-1)+owned.length)%owned.length]);},{passive:true});
window.addEventListener('blur',()=>{if(QA)return;pointer.down=false;touchAim=null;keys.clear();if(!ISLAND&&mode==='battle')setMode('paused');});
document.addEventListener('visibilitychange',()=>{if(QA)return;visible=!document.hidden;if(!visible&&!ISLAND&&mode==='battle')setMode('paused');lastTime=performance.now();});
window.addEventListener('resize',()=>{if(renderer)resize();});
window.addEventListener('keydown',e=>{if(e.target.closest('button,input'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyP'||e.code==='Escape'){if(ISLAND){window.__boarIsland?.onPause?.();return;}if(mode==='battle')setMode('paused');else if(mode==='paused')setMode('battle');}
  if(mode!=='battle')return;if(e.code==='KeyQ')rocket();if(e.code==='KeyE')frost();if(e.code==='Space')activateFury();if(e.code==='KeyR')startReload();
  const n=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);if(n>=0){const k=WEAPON_ORDER[n];if(save.weapons[k])switchWeapon(k);else toast(`${WEAPONS[k].name} נפתח במוסך`);}});
window.addEventListener('keyup',e=>keys.delete(e.code));
$('start').onclick=beginWave;$('garage').onclick=()=>openShop('menu');$('next-wave').onclick=beginWave;$('shop-back').onclick=returnToMenu;$('pause').onclick=()=>setMode('paused');$('resume').onclick=()=>{setMode('battle');$('scene').focus();};$('exit').onclick=returnToMenu;$('retry').onclick=beginWave;$('death-shop').onclick=()=>openShop('dead');$('rocket').onclick=rocket;$('frost').onclick=frost;$('fury').onclick=activateFury;
$('tab-weapons').onclick=()=>setShopTab('weapons');$('tab-upgrades').onclick=()=>setShopTab('upgrades');
$('help').onclick=()=>{previousMode=mode;setMode('help');};
$('quality').onclick=()=>{setQuality(HIGH?'normal':'high');location.reload();};$('help-close').onclick=()=>setMode(previousMode);
$('sound').onclick=()=>{soundEnabled=!soundEnabled;$('sound').textContent=soundEnabled?'♫':'♪';$('sound').setAttribute('aria-label',soundEnabled?'כיבוי צליל':'הפעלת צליל');$('sound').style.opacity=soundEnabled?1:.5;};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch{toast('אפשר להגדיל את חלון הדפדפן');}};

// ---------- QA hooks (only with ?qa in the URL): used by the automated playtests ----------
function runBot(dt){
  const live=enemies.filter(e=>!e.dead);let pick=null,score=-Infinity;bot.react=(bot.react||0)-dt;if(bot.react>0&&bot.pick&&(bot.pick.shell?shells.includes(bot.pick.shell):!bot.pick.e.dead)){pick=bot.pick;}else{bot.react=bot.reaction||0;
  for(const s of shells){const sc=100+s.t;if(sc>score){score=sc;pick={shell:s};}}
  for(const e of live){if(!aimPoint(e))continue;const sc=e.root.position.z+(isBoss(e.kind)?40:0)+(e.zones.some(z=>z.part&&!z.dead)?60:0)+(e.state==='retreat'?-200:0)+(e.kind==='manta'&&e.state!=='advance'?160:0);if(sc>score){score=sc;pick={e};}}
  bot.pick=pick;}
  if(!pick){pointer.down=false;return;}
  const p=pick.shell?pick.shell.mesh.position.clone():(aimPoint(pick.e)||pick.e.root.position.clone());projected.copy(p).project(camera);
  const err=bot.error||0;pointer.x=clamp(projected.x+rand(-err,err),-.98,.98);pointer.y=clamp(projected.y+rand(-err,err),-.98,.98);pointer.down=true;
  const s=wstate[current];if(bot.stay){}else if(wsCache[current].mode==='heat'&&s.overheated){const alt=WEAPON_ORDER.find(k=>k!==current&&save.weapons[k]&&(wsCache[k].mode==='mag'?wstate[k].reload<=0:!wstate[k].overheated));if(alt)switchWeapon(alt);}
  if(!bot.stay&&wsCache[current].mode==='mag'&&s.reload>0){const alt=WEAPON_ORDER.find(k=>k!==current&&save.weapons[k]&&(wsCache[k].mode==='heat'?!wstate[k].overheated:wstate[k].ammo>0));if(alt)switchWeapon(alt);}
  if(bot.abilities){if(live.length>=4&&rocketCooldown<=0)rocket();if(live.filter(e=>e.root.position.z>-25).length>=3&&frostCooldown<=0)frost();if(fury>=100)activateFury();}
}
// ---------- built-in speed test (v0.4.1) ----------
// Opens with #bench (or window.BOAR_BENCH). One click runs ~3 minutes on its own: menu, wave 1, 14, 15, 20,
// each after 15 s to let the adaptive resolution settle, then 10 s of measuring. The player's save is untouched.
const BENCH_KEY='boar-island-bench';
function benchGpu(){try{const gl=renderer.getContext();const x=gl.getExtension('WEBGL_debug_renderer_info');return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch{return 'לא ידוע';}}
function benchRows(){try{return JSON.parse(localStorage.getItem(BENCH_KEY))||[];}catch{return [];}}
function benchDraw(){const rows=benchRows();const t=$('bench-table');t.hidden=!rows.length;
  t.querySelector('tbody').innerHTML=rows.map(r=>`<tr><td>${r.q}</td><td>${r.name}</td><td class="${r.fps>=50?'ok':r.fps>=35?'mid':'bad'}">${r.fps.toFixed(1)}</td><td>${r.worst}</td><td>${r.res}%</td><td>${r.sh}</td></tr>`).join('');}
function installBench(){
  const box=document.createElement('section');box.id='bench';box.setAttribute('aria-live','polite');
  box.innerHTML=`<h2>מדידת מהירות</h2><p id="bench-msg">לחיצה אחת, והמדידה רצה לבד כשלוש דקות: תפריט, גל 1, גל 14 בסערה, גל 15 עם הצב וגל 20 עם הלווייתן. בזמן המדידה לא נוגעים במחשב ולא עוברים לחלון אחר.</p>
    <div class="bench-actions"><button id="bench-go" type="button">התחלת מדידה · איכות ${HIGH?'גבוהה':'רגילה'}</button><button id="bench-q" type="button" hidden></button><button id="bench-clear" type="button" hidden>מחיקת התוצאות</button><button id="bench-hide" type="button">הסתרה</button></div>
    <div class="bench-scroll"><table id="bench-table" hidden><thead><tr><th>איכות</th><th>מצב</th><th>פריימים בשנייה</th><th>הפריים האיטי, מ״ש</th><th>חדות</th><th>צללים</th></tr></thead><tbody></tbody></table></div>
    <p id="bench-env"></p>`;
  document.body.append(box);
  $('bench-env').textContent=`כרטיס מסך: ${benchGpu()} · חלון ${innerWidth}×${innerHeight} · יחס פיקסלים ${devicePixelRatio}`;
  $('bench-go').onclick=runBench;$('bench-hide').onclick=()=>{box.classList.toggle('mini');$('bench-hide').textContent=box.classList.contains('mini')?'הצגה':'הסתרה';};
  $('bench-clear').onclick=()=>{try{localStorage.removeItem(BENCH_KEY);}catch{}benchDraw();$('bench-clear').hidden=true;};
  const q=$('bench-q');q.textContent=`מעבר לאיכות ${HIGH?'רגילה':'גבוהה'}`;q.onclick=()=>{setQuality(HIGH?'normal':'high');location.reload();};
  const had=benchRows().length;q.hidden=!had;$('bench-clear').hidden=!had;benchDraw();
}
const benchWait=ms=>new Promise(r=>setTimeout(r,ms));
function benchMeasure(sec){return new Promise(res=>{let n=0,t0=0,last=0,worst=0;const f=t=>{if(!t0){t0=last=t;}else{n++;worst=Math.max(worst,t-last);last=t;}if(t-t0<sec*1000)requestAnimationFrame(f);else res({fps:n*1000/(t-t0),worst:Math.round(worst)});};requestAnimationFrame(f);});}
function benchSave(w){const s=freshSave();s.nextWave=w;s.bestWave=w-1;s.coins=0;Object.assign(s.weapons,{mg:4,shotgun:4,cannon:4,tesla:4});Object.assign(s.upgrades,{armor:3,cooling:3,rocket:3,frost:2,turret:2});return s;}
async function runBench(){
  const box=$('bench'),msg=$('bench-msg');box.classList.add('running');for(const id of ['bench-go','bench-q','bench-clear'])$(id).hidden=true;
  soundEnabled=true;sfx.play('buy');try{await document.getElementById('scene').focus({preventScroll:true});}catch{}
  const backup=JSON.parse(JSON.stringify(save)),q=HIGH?'גבוהה':'רגילה';benchActive=true;
  const rows=benchRows().filter(r=>r.q!==q);
  const steps=[['תפריט',0],['גל 1 · מקלע',1],['גל 14 · סערה',14],['גל 15 · צב המבצר',15],['גל 20 · לווייתן הפלדה',20]];
  for(let i=0;i<steps.length;i++){const [name,w]=steps[i];
    if(w){save=benchSave(w);refreshWeaponCache();beginWave();sandbox=true;hp=99999;switchWeapon('mg');bot={abilities:true,error:.05,reaction:.35};}
    else{bot=false;returnToMenu();}
    for(let k=15;k>0;k--){msg.textContent=`${i+1} מתוך ${steps.length}: ${name} · המדידה מתחילה בעוד ${k} שניות`;await benchWait(1000);if(w)hp=99999;}
    msg.textContent=`${i+1} מתוך ${steps.length}: ${name} · מודד 10 שניות`;
    const r=await benchMeasure(10);rows.push({q,name,fps:+r.fps.toFixed(1),worst:r.worst,res:Math.round(resScale*100),sh:shadowsOff?'חסכוניים':'רגילים'});
    try{localStorage.setItem(BENCH_KEY,JSON.stringify(rows));}catch{}benchDraw();}
  bot=false;pointer.down=false;returnToMenu();save=backup;benchActive=false;persist();refreshWeaponCache();buildWeaponBar();showWeapon(current);updateStartLabel();
  box.classList.remove('running');const both=new Set(rows.map(r=>r.q)).size>1;
  msg.textContent=both?'המדידה הסתיימה בשתי האיכויות. צלמו את המסך ושלחו לקלוד.':`המדידה באיכות ${q} הסתיימה. עכשיו לחצו על המעבר לאיכות ${HIGH?'רגילה':'גבוהה'} ואז שוב על התחלת מדידה.`;
  $('bench-q').hidden=both;$('bench-clear').hidden=false;$('bench-go').hidden=false;$('bench-go').textContent=`מדידה חוזרת · איכות ${q}`;
}
function installQA(){
  window.__three={scene,renderer,camera,sea,sun};
  window.__boar={get state(){return {mode,wave,hp,coins:save.coins,killed,remaining:remaining(),enemies:enemies.map(e=>({kind:e.kind,hp:Math.round(e.hp),z:+e.root.position.z.toFixed(1)})),current,heat:wstate[current]?.heat,ammo:wstate[current]?.ammo,boss:boss?.kind||null,shells:shells.length,shots:roundShots,hits:roundHits,crits:roundCrits,fury,sound:soundEnabled,audio:sfx.ctx?.state||'none',save:JSON.parse(JSON.stringify(save))};},
    setSave(o){save=sanitizeSave(o);persist();refreshWeaponCache();buildWeaponBar();showWeapon(current);updateStartLabel();},
    start(n){save.nextWave=n;beginWave();},spawn(k,z){const e=spawn(k);if(z!==undefined)e.root.position.z=z;return enemies.length;},
    aim(x,y){pointer.x=x;pointer.y=y;},fire(on){pointer.down=on;},weapon(k){switchWeapon(k);},
    bot(on,opts={}){bot=on?{...opts}:false;if(!on)pointer.down=false;},speed(n){timeScale=n;},
    rocket,frost,fury:()=>{fury=100;activateFury();},killAll(){for(const e of [...enemies])damageEnemy(e,1e6,{explosive:true});},
    sim(sec,step=1/30){camera.updateMatrixWorld();let n=Math.round(sec/step);while(n-->0&&mode==='battle'){elapsed+=step;updateBattle(step);updateEffects(step);}return mode;},
    buy(t,k){const ok=t==='w'?buyWeapon(save,k):buyUpgrade(save,k);if(ok){persist();refreshWeaponCache();showWeapon(current);buildWeaponBar();}return ok;},
    prices(){return {w:Object.fromEntries(WEAPON_ORDER.map(k=>[k,weaponCost(save,k)])),u:Object.fromEntries(Object.keys(UPGRADE_DEFS).map(k=>[k,save.upgrades[k]>=UPGRADE_DEFS[k].max?Infinity:upgradeCost(save,k)]))};},
    perk(id){selectedPerk=id;},
    sandbox(n=6){save.nextWave=n;beginWave();plan=[];spawnIndex=0;sandbox=true;hp=999;},
    aimZone(type){const e=enemies.find(x=>!x.dead);if(!e)return null;const z=e.zones.find(z=>type==='shield'?z.shield:type==='crit'?z.crit:!z.crit&&!z.shield&&!z.fin);z.obj.getWorldPosition(tmp);projected.copy(tmp).project(camera);pointer.x=projected.x;pointer.y=projected.y;return {hp:e.hp,kind:e.kind};},
    cast(){camera.updateMatrixWorld();const h=castShot(aimRay(),1);return {kind:h.e?.kind,crit:h.crit,shield:h.shield,shell:!!h.shell,dist:h.dist};},
    step(n=30,dt=1/30){camera.updateMatrixWorld();for(let i=0;i<n&&mode==='battle';i++){elapsed+=dt;updateBattle(dt);updateEffects(dt);updateGunRig(dt);}},
    gunProbe(){const g=gunModels;camera.updateMatrixWorld();return {current,shown:shownWeapon,visible:WEAPON_ORDER.filter(k=>g[k].group.visible),mgSpin:+g.mg.spinners[0].rotation.z.toFixed(3),drum:+g.shotgun.drum.rotation.z.toFixed(3),pump:+g.shotgun.slideGroup.position.z.toFixed(3),barrel:+g.cannon.slide.position.z.toFixed(3),breech:+g.cannon.breech.position.x.toFixed(3),rack:g.cannon.rack.filter(r=>r.visible).length,ring:+g.tesla.ring.rotation.z.toFixed(3),cap:+g.tesla.caps[0].scale.y.toFixed(3),levelVisible:WEAPON_ORDER.map(k=>g[k].levelParts.filter(p=>p.obj.visible).length),polished:WEAPON_ORDER.every(k=>g[k].group.userData.coastalWeaponPolishV1)};},
    hittable(){return enemies.map(e=>({kind:e.kind,state:e.state,n:e.zones.filter(z=>zoneHittable(e,z)).length,fin:e.zones.some(z=>z.fin&&zoneHittable(e,z))}));},
    shellTypes(){return shells.map(s=>s.type);},
    perf(){return {resScale,shadowsOff,basePR,adapt:ADAPT};},
    wx(){return {kind:weather.kind,set:weatherKind,fog:+scene.fog.density.toFixed(4),flash:weather.flash,chain:wsCache.tesla?.chain,cool:WEATHER[weatherKind].cooling,rain:renderer.info.render.calls};},
    weather(k){weatherKind=k;weather.set(k,true);refreshWeaponCache();},strike(){weather.strike();},
    bossInfo(){const e=boss;if(!e)return null;return {kind:e.kind,state:e.state,hp:Math.round(e.hp),maxHp:Math.round(e.maxHp),z:+e.root.position.z.toFixed(1),y:+e.root.position.y.toFixed(2),headOut:e.headOut!==undefined?+e.headOut.toFixed(2):null,
      turrets:e.turrets?e.turrets.filter(t=>!t.dead).length:null,exposed:!!e.exposed,armor:e.armor,rage:!!e.rage,crits:e.zones.filter(z=>z.crit&&zoneHittable(e,z)).length,hittable:e.zones.filter(z=>zoneHittable(e,z)).length};},
    hitTurret(i,amount){const e=boss;const t=e.turrets[i];t.zone.obj.getWorldPosition(tmp);return damageEnemy(e,amount,{point:tmp.clone()});},
    aimBoss(type){const e=boss;if(!e)return false;if(type==='shellside'){e.body.localToWorld(tmp.set(2.6,.4,-.6));projected.copy(tmp).project(camera);pointer.x=projected.x;pointer.y=projected.y;return true;}const z=e.zones.find(z=>zoneHittable(e,z)&&(type==='crit'?z.crit:type==='part'?z.part:type==='shield'?z.shield:!z.crit&&!z.shield&&!z.part));if(!z)return false;z.obj.getWorldPosition(tmp);projected.copy(tmp).project(camera);pointer.x=projected.x;pointer.y=projected.y;return true;},
    aimAtFirst(){const e=enemies.find(x=>!x.dead);if(!e)return false;e.zones.find(z=>z.crit).obj.getWorldPosition(tmp);projected.copy(tmp).project(camera);pointer.x=projected.x;pointer.y=projected.y;return true;},
    shop(){openShop('menu');},
    // photo set-ups for the documentation (not used in play)
    showroom(key,lv=6){document.body.classList.add('shot');gunRig.visible=false;const src=gunModels[key].group;const g=src.clone(true);g.traverse(o=>{o.visible=true;});
      for(const k of WEAPON_ORDER)for(const p of gunModels[k].levelParts)p.obj.visible=save.weapons[k]>=p.min;scene.add(g);g.position.set(0,7.2,8);g.rotation.set(.05,Math.PI*.78,0);g.scale.setScalar(1.25);
      const f=g.children.filter(c=>c.isGroup&&c.children.some(m=>m.material?.blending===THREE.AdditiveBlending));f.forEach(x=>x.visible=false);
      g.traverse(o=>{if(o.material?.blending===THREE.AdditiveBlending)o.visible=false;}); // hide flashes, arcs and glow in the photo
      for(const e of showcase)e.root.visible=false;camera.position.set(1.2,8.6,14.4);camera.lookAt(-.6,6.9,7.6);frozenCam=true;},
    lineup(){document.body.classList.add('shot');gunRig.visible=false;for(const e of showcase)e.root.visible=false;
      const L=[['runner',-9,1],['scout',-5.5,0],['heavy',-1.5,-.5],['crab',3.5,-1],['mortar',8.5,0]];for(const [k,x,z] of L){const e=makeEnemy(k);e.root.position.set(x,groundY(x,z),z);e.root.rotation.y=-x*.05;scene.add(e.root);if(e.kindModel==='crab'){e.baseX=0;}}
      const sh=makeShark();sh.root.position.set(-15,seaY(-15,-34)+.2,-34);sh.root.rotation.set(-.15,.6,0);sh.jaw.rotation.x=.5;scene.add(sh.root);
      const mt=makeManta();mt.root.position.set(4,7.5,-9);mt.root.rotation.set(0,-.5,0);mt.body.rotation.z=.25;mt.wings.forEach(w=>{w.inner.rotation.z=w.s*.25;w.outer.rotation.z=w.s*.3;});scene.add(mt.root);
      camera.position.set(0,6.2,15);camera.lookAt(0,1.8,-3);frozenCam=true;},
tab:setShopTab,menu:returnToMenu,info(){let meshes=0;scene.traverse(o=>{if(o.isMesh&&o.visible)meshes++;});return {calls:renderer.info.render.calls,tris:renderer.info.render.triangles,meshes,geos:renderer.info.memory.geometries};}};
}

try{init();islandReady=true;}catch(e){console.error(e);$('error-screen').hidden=false;$('error-message').textContent='הדפדפן לא הצליח להפעיל את זירת התלת־ממד. נסו דפדפן עדכני עם האצת חומרה.';}

// Local island adapter only: the campaign, weapons and economy above stay intact.
if(ISLAND){
  document.documentElement.dataset.island='true';
  window.__boarIsland={
    get ready(){return islandReady;},
    get snapshot(){return {mode,wave,time:waveTime,hp,coins:save.coins,bestWave:save.bestWave,nextWave:save.nextWave,muted:!soundEnabled,paused:islandPaused};},
    setPaused(value){islandPaused=Boolean(value);pointer.down=false;touchAim=null;keys.clear();lastTime=performance.now();if(islandPaused&&sfx.ctx?.state==='running')void sfx.ctx.suspend().catch(()=>{});else if(!islandPaused&&soundEnabled&&sfx.ctx?.state==='suspended')void sfx.ctx.resume().catch(()=>{});},
    setMuted(value){soundEnabled=!value;if(sfx.master)sfx.master.gain.value=value?0:.75;if(value&&sfx.rainGain)sfx.rainGain.gain.value=0;},
    dispose(){if(islandDisposed)return;islandDisposed=true;islandPaused=true;pointer.down=false;touchAim=null;keys.clear();cancelAnimationFrame(islandFrame);persist();void sfx.ctx?.close().catch(()=>{});renderer?.dispose();renderer?.forceContextLoss();},
    onExit:null,onPause:null
  };
  const back=document.createElement('button');back.className='text-btn';back.id='island-back';back.textContent='חזרה לאי';back.onclick=()=>window.__boarIsland.onExit?.();document.querySelector('.menu-links').append(back);
}
