// First-person weapon models with their own animation: rotary barrels and belt feed, pump and rotating drum,
// breech loading, capacitor charge and arcs. Each model exposes update(dt, state).
import * as THREE from './vendor/three.module.js';
import {rand,damp,mat,geo,rb,cyl,cylZ,cylX,sph,torus,mesh,T,worn,compactTree} from './kit.js';
import {refineWeapons} from './weapon-polish.mjs';

const add=THREE.AdditiveBlending;
export const WEAPON_KEYS=['mg','shotgun','cannon','tesla'];

export function createGuns(camera){
  const gunRig=new THREE.Group();camera.add(gunRig);gunRig.position.set(0,-1.3,-2.5);
  const yoke=new THREE.Group();yoke.rotation.order='YXZ';gunRig.add(yoke);const kick=new THREE.Group();yoke.add(kick);
  const M={
    olive:worn('#5c6849',.35,.55,{normal:'panel',ns:.45}),olive2:worn('#4c573d',.35,.58,{ns:.4}),
    gun:worn('#3a4446',.85,.4,{ns:.3}),dark:worn('#262d2f',.7,.48,{ns:.3}),blued:worn('#2a3337',.92,.32,{ns:.2}),
    steel:worn('#aab3b1',.95,.26,{ns:.15}),poly:worn('#2b3031',.15,.62,{ns:.4}),grip:worn('#1c2021',.1,.85,{normal:'knurl',ns:.9}),
    white:worn('#6f8088',.35,.55,{normal:'panel',ns:.35}),blue:worn('#2c6079',.5,.38),brass:mat('#d6a843',1,.28),copper:mat('#c27b3d',1,.3),
    shellRed:mat('#b8402f',.25,.5),gold:mat('#e3bf5c',1,.22),rubber:mat('#151819',0,.9),
    hazard:new THREE.MeshStandardMaterial({map:T('hazard'),roughness:.6,metalness:.2}),
    wood:new THREE.MeshStandardMaterial({color:'#b07a4a',map:T('wood'),roughness:.55,metalness:0}),
    glass:new THREE.MeshStandardMaterial({color:'#bfe6f2',transparent:true,opacity:.18,roughness:.05,metalness:.1,depthWrite:false}),
    lens:mat('#6fb6d6',.2,.08,'#2a6f9c',.6),
  };
  const perf=M.gun.clone();perf.alphaMap=T('perf').clone();perf.alphaMap.needsUpdate=true;perf.alphaMap.repeat.set(7,3);perf.alphaTest=.5;perf.side=THREE.DoubleSide;M.perf=perf;
  const heatMat=(base='#2a3337')=>new THREE.MeshStandardMaterial({color:base,metalness:.9,roughness:.35,emissive:'#ff4a10',emissiveIntensity:0});

  // ---------- shared mount: pedestal, cradle and spade grips ----------
  mesh(gunRig,cyl(.2,.28,2.4,14),M.gun,[0,-1.45,.35]);mesh(gunRig,cyl(.42,.42,.16,20),M.dark,[0,-.3,.35]);
  mesh(yoke,rb(.95,.24,.85,.08),M.gun,[0,-.32,.35]);
  for(const s of [-1,1]){mesh(yoke,rb(.08,.5,.6,.03),M.dark,[s*.74,-.08,.25]);mesh(yoke,cylX(.09,.09,.06,14),M.steel,[s*.78,0,.15]);}
  const grips=new THREE.Group();grips.position.set(0,-.12,1.0);yoke.add(grips);
  mesh(grips,rb(.95,.14,.12,.05),M.dark,[0,0,0]);
  for(const s of [-1,1]){const g=mesh(grips,cyl(.075,.085,.48,12),M.grip,[s*.42,-.02,.15],null,[Math.PI/2.4,0,0]);mesh(grips,cyl(.1,.1,.05,12),M.dark,[s*.42,.1,-.04],null,[Math.PI/2.4,0,0]);}
  mesh(grips,rb(.32,.14,.05,.03),M.steel,[0,.06,-.06],null,[-.3,0,0]); // butterfly trigger

  const models={};
  function model(key){const g=new THREE.Group();g.visible=false;kick.add(g);const m={key,group:g,muzzles:[],flashes:[],levelParts:[],muzzleIndex:0,port:new THREE.Object3D(),update:()=>{}};g.add(m.port);models[key]=m;return m;}
  function level(m,obj,min){m.levelParts.push({obj,min});obj.userData.keep=true;obj.visible=false;return obj;}
  function flash(m,muzzle,size=1,color='#ffd27a'){
    const f=new THREE.Group();muzzle.add(f);f.visible=false;
    const star=new THREE.MeshBasicMaterial({map:T('flashStar'),color,transparent:true,depthWrite:false,blending:add,side:THREE.DoubleSide,toneMapped:false});
    const side=new THREE.MeshBasicMaterial({map:T('flashSide'),color,transparent:true,depthWrite:false,blending:add,side:THREE.DoubleSide,toneMapped:false});
    const front=new THREE.Mesh(geo('flF',()=>new THREE.PlaneGeometry(1.5,1.5)),star);front.scale.setScalar(size);f.add(front);
    for(let i=0;i<3;i++){const p=new THREE.Mesh(geo('flS',()=>new THREE.PlaneGeometry(.9,2.1).translate(0,1.05,0).rotateX(-Math.PI/2)),side);p.rotation.z=i*Math.PI/3;p.scale.setScalar(size);f.add(p);}
    for(const s of [-1,1]){const p=new THREE.Mesh(geo('flX',()=>new THREE.PlaneGeometry(.5,1.1).translate(0,.55,0).rotateZ(-Math.PI/2)),side);p.position.x=0;p.rotation.y=s>0?0:Math.PI;p.scale.setScalar(size*.8);f.add(p);}
    m.flashes.push(f);
  }
  function bolts(parent,list){for(const [x,y,z] of list)mesh(parent,cylZ(.035,.035,.04,6),M.steel,[x,y,z]);}

  // =============== 1) twin rotary machine gun ===============
  {const m=model('mg'),g=m.group;
    mesh(g,rb(1.35,.5,1.5,.1),M.olive,[0,0,0]);mesh(g,rb(1.22,.11,1.32,.04),M.gun,[0,.3,.02]);
    mesh(g,cylX(.05,.05,1.3,10),M.steel,[0,.33,.66]); // cover hinge
    for(const s of [-1,1])for(let i=0;i<4;i++)mesh(g,sph(.028,6,4),M.steel,[s*.68,.12,.5-i*.32]);
    mesh(g,rb(.06,.12,.4,.02),M.steel,[.7,.04,.1]);mesh(g,sph(.06,8,6),M.dark,[.74,.04,-.08]); // cocking handle
    // reflex sight
    mesh(g,rb(.24,.08,.55,.03),M.dark,[0,.4,-.05]);
    const hood=new THREE.Group();hood.position.set(0,.55,-.12);g.add(hood);
    mesh(hood,rb(.38,.05,.12,.02),M.dark,[0,.15,0]);for(const s of [-1,1])mesh(hood,rb(.05,.32,.12,.02),M.dark,[s*.17,0,0]);mesh(hood,rb(.38,.04,.12,.02),M.dark,[0,-.15,0]);
    const glass=new THREE.Mesh(geo('glass',()=>new THREE.PlaneGeometry(.3,.27)),M.glass);hood.add(glass);
    const ret=new THREE.Mesh(geo('ret',()=>new THREE.PlaneGeometry(.17,.17)),new THREE.MeshBasicMaterial({map:T('reticle'),transparent:true,depthWrite:false,blending:add,toneMapped:false}));ret.position.z=.01;ret.userData.keep=true;hood.add(ret);
    const spinners=[],heat=heatMat('#30393c');
    for(const s of [-1,1]){
      const sp=new THREE.Group();sp.position.set(s*.42,.02,-.6);g.add(sp);spinners.push(sp);
      for(let k=0;k<6;k++){const a=k/6*Math.PI*2;mesh(sp,cylZ(.04,.04,2.45,10),M.blued,[Math.cos(a)*.12,Math.sin(a)*.12,-1.23]);mesh(sp,cylZ(.045,.045,.32,10),heat,[Math.cos(a)*.12,Math.sin(a)*.12,-2.32]);}
      mesh(sp,cylZ(.06,.06,2.5,10),M.dark,[0,0,-1.2]);
      for(const [z,r] of [[-.12,.2],[-1.2,.19],[-2.42,.2]])mesh(sp,cylZ(r,r,.08,6),M.steel,[0,0,z]);
      const shroud=mesh(g,cylZ(.23,.23,1.1,20),M.perf,[s*.42,.02,-1.05]);shroud.castShadow=false;
      mesh(g,torus(.23,.025,6,22),M.gun,[s*.42,.02,-.5]);mesh(g,torus(.23,.025,6,22),M.gun,[s*.42,.02,-1.6]);
      const mz=new THREE.Object3D();mz.position.set(s*.42,.02,-3.36);g.add(mz);m.muzzles.push(mz);flash(m,mz,.85);
      for(const z of [-.75,-1.0,-1.25,-1.45])level(m,mesh(g,torus(.25,.018,6,22),M.steel,[s*.42,.02,z]),2);
      level(m,mesh(g,torus(.3,.03,8,26),M.steel,[s*.42,.02,-2.55]),3);
      level(m,mesh(g,rb(.05,.05,1.3,.02),M.gold,[s*.69,.2,0]),4);
      level(m,mesh(g,cylZ(.03,.03,1.5,8),mat('#5fe3ff',.2,.3,'#29d3ff',2.2),[s*.62,-.15,-.7]),5);
    }
    level(m,mesh(g,rb(1.24,.03,.6,.02),M.gold,[0,.37,.4]),6);
    // ammo can + belt that feeds while firing
    mesh(g,rb(.52,.66,.88,.06),M.olive2,[-1.02,-.06,.1]);mesh(g,rb(.54,.1,.9,.03),M.dark,[-1.02,.3,.1]);mesh(g,rb(.535,.14,.4,.02),M.hazard,[-1.02,0,.1]);mesh(g,rb(.06,.06,.36,.02),M.steel,[-1.31,.08,.1]);
    const linkPath=t=>new THREE.Vector3(-.98+t*.45,.38+Math.sin(t*Math.PI)*.16,.05+t*.02);const links=[];
    for(let i=0;i<10;i++){const L=new THREE.Group();mesh(L,cylZ(.045,.045,.26,8),M.brass,[0,0,0]);mesh(L,geo('bullet',()=>new THREE.ConeGeometry(.045,.1,8).rotateX(-Math.PI/2)),M.copper,[0,0,-.18]);mesh(L,rb(.08,.03,.14,.01),M.dark,[0,.045,0]);L.userData.keep=true;g.add(L);links.push(L);}
    m.port.position.set(.75,.12,-.1);
    // armoured shield with a hazard edge
    for(const s of [-1,1]){const P=new THREE.Group();P.position.set(s*.98,.0,-.55);P.rotation.y=s*.32;g.add(P);mesh(P,rb(.58,.66,.07,.03),M.olive,[0,0,0]);mesh(P,rb(.58,.07,.075,.02),M.hazard,[0,.31,0]);bolts(P,[[-.22,-.24,.04],[.22,-.24,.04],[-.22,.2,.04],[.22,.2,.04]]);}
    m.spinners=spinners;let spin=0,belt=0;
    m.update=(dt,c)=>{spin=damp(spin,c.firing?34:0,c.firing?.18:.45,dt);for(const sp of spinners)sp.rotation.z+=spin*dt;
      belt=(belt+c.fired*.1)%.1;links.forEach((L,i)=>{const t=Math.min(1,(i*.1+belt)/1);L.position.copy(linkPath(t));L.visible=t<.98;});
      heat.emissiveIntensity=Math.pow(c.heat,1.5)*2.6;ret.material.opacity=c.overheated?.35:1;};
  }

  // =============== 2) drum-fed pump shotgun ===============
  {const m=model('shotgun'),g=m.group;
    mesh(g,rb(.95,.55,1.5,.12),M.poly,[0,0,0]);for(const s of [-1,1])mesh(g,rb(.04,.4,1.2,.02),M.steel,[s*.48,.02,0]);
    mesh(g,rb(.85,.18,1.2,.06),M.gun,[0,.34,0]);mesh(g,rb(.14,.06,2.5,.02),M.steel,[0,.48,-1.2]);
    mesh(g,torus(.075,.02,6,16),M.steel,[0,.6,.35]);mesh(g,rb(.04,.12,.04,.01),M.steel,[0,.55,.35]); // ghost ring
    mesh(g,sph(.035,8,6),mat('#ffb340',0,.3,'#ff9a1c',3),[0,.54,-2.38]); // fibre-optic bead
    const heat=heatMat();
    for(const s of [-1,1]){mesh(g,cylZ(.14,.14,2.1,18),M.blued,[s*.17,.15,-1.4]);mesh(g,cylZ(.165,.165,.18,18),M.steel,[s*.17,.15,-2.42]);mesh(g,cylZ(.145,.145,.3,18),heat,[s*.17,.15,-2.2]);
      const mz=new THREE.Object3D();mz.position.set(s*.17,.15,-2.56);g.add(mz);m.muzzles.push(mz);flash(m,mz,1.25,'#ffc070');}
    mesh(g,rb(.62,.13,1.15,.05),M.wood,[0,.32,-1.05]);for(let i=0;i<6;i++)mesh(g,rb(.5,.02,.05,.01),M.dark,[0,.39,-.6-i*.17]);mesh(g,rb(.66,.05,.3,.02),M.steel,[0,.3,-1.7]);
    const slide=new THREE.Group();g.add(slide);mesh(slide,rb(.62,.3,.95,.1),M.wood,[0,-.1,-1.45]);for(let i=0;i<5;i++)mesh(slide,rb(.64,.03,.04,.01),M.dark,[0,-.1,-1.15-i*.15]);slide.userData.keep=true;
    const drum=new THREE.Group();drum.position.set(-.62,.18,-.3);g.add(drum);mesh(g,rb(.3,.2,.5,.05),M.steel,[-.42,.05,-.3]);mesh(drum,cylZ(.42,.42,.46,24),M.dark,[0,0,0]);mesh(drum,cylZ(.44,.44,.05,24),M.steel,[0,0,.25]);mesh(drum,cylZ(.12,.12,.5,12),M.steel,[0,0,0]);
    const shells=[];for(let k=0;k<8;k++){const a=k/8*Math.PI*2;const S=new THREE.Group();S.position.set(Math.cos(a)*.27,Math.sin(a)*.27,.2);mesh(S,cylZ(.08,.08,.18,10),M.shellRed,[0,0,0]);mesh(S,cylZ(.085,.085,.06,10),M.brass,[0,0,.1]);S.userData.keep=true;drum.add(S);shells.push(S);}
    level(m,mesh(g,rb(.7,.06,1.5,.02),M.steel,[0,.42,-1.3]),2);level(m,mesh(g,rb(.98,.05,.12,.02),M.gold,[0,.29,.62]),4);
    const laser=new THREE.Group();g.add(laser);level(m,laser,5);mesh(laser,rb(.12,.12,.32,.03),M.dark,[.4,-.02,-1.85]);mesh(laser,sph(.04,8,6),mat('#ff3b3b',0,.3,'#ff2020',3),[.4,-.02,-2.02]);
    level(m,mesh(g,rb(.5,.06,.3,.02),M.gold,[0,.15,-2.42]),6);
    m.port.position.set(.55,.2,0);
    for(const s of [-1,1]){const P=new THREE.Group();P.position.set(s*.9,0,-.4);P.rotation.y=s*.32;g.add(P);mesh(P,rb(.52,.6,.06,.03),worn('#4d4136',.4,.55,{ns:.4}),[0,0,0]);mesh(P,rb(.52,.06,.065,.02),M.hazard,[0,.28,0]);}
    m.drum=drum;m.slideGroup=slide;let pump=1,drumA=0,drumT=0;
    m.update=(dt,c)=>{if(c.fired){pump=0;drumT-=Math.PI*2/8*c.fired;}pump=Math.min(1,pump+dt/.42);slide.position.z=Math.sin(Math.min(1,pump/.8)*Math.PI)*.34*(pump<.95?1:0);
      if(c.reload>=0)drumT-=dt*9;drumA=damp(drumA,drumT,.05,dt);drum.rotation.z=drumA;
      const n=c.reload>=0?Math.floor(c.reload*c.mag):c.ammo;shells.forEach((S,i)=>S.visible=i<Math.min(8,n));heat.emissiveIntensity=Math.pow(c.heat,1.5)*2;};
  }

  // =============== 3) breech-loading cannon ===============
  {const m=model('cannon'),g=m.group;
    mesh(g,rb(1.15,.72,1.3,.14),M.olive,[0,0,.05]);mesh(g,rb(1.18,.12,.5,.03),M.hazard,[0,.36,.45]);
    const barrel=new THREE.Group();g.add(barrel);barrel.userData.keep=true;
    mesh(barrel,cylZ(.24,.3,2.9,24),M.olive2,[0,.12,-1.65]);for(const z of [-.5,-2.0,-2.5])mesh(barrel,cylZ(.31,.31,.06,24),M.steel,[0,.12,z]);mesh(barrel,cylZ(.34,.34,.5,24),M.gun,[0,.12,-1.4]);
    m.slide=barrel; // muzzle brake comes from weapon-polish.mjs and recoils with the barrel
    for(const s of [-1,1])mesh(barrel,cylZ(.035,.035,1.2,8),M.steel,[s*.28,.5,-.6]); // piston rods
    for(const s of [-1,1])mesh(g,cylZ(.1,.1,1.0,14),M.gun,[s*.28,.5,.05]);
    const heat=heatMat();mesh(barrel,cylZ(.305,.305,.4,24),heat,[0,.12,-2.75]);
    const mz=new THREE.Object3D();mz.position.set(0,.12,-3.5);barrel.add(mz);m.muzzles.push(mz);flash(m,mz,1.8,'#ffb060');
    const breech=new THREE.Group();breech.position.set(0,.12,.75);g.add(breech);mesh(breech,rb(.62,.56,.3,.06),M.steel,[0,0,0]);mesh(breech,cylX(.04,.04,.5,8),M.dark,[.35,.12,.08]);mesh(breech,sph(.07,8,6),M.dark,[.6,.12,.08]);breech.userData.keep=true;
    const loader=new THREE.Group();g.add(loader);mesh(loader,cylZ(.13,.13,.55,12),M.brass,[0,0,0]);mesh(loader,geo('ctip',()=>new THREE.ConeGeometry(.13,.25,12).rotateX(-Math.PI/2)),mat('#8a3a2a',.4,.5),[0,0,-.4]);loader.visible=false;loader.userData.keep=true;
    const rack=[];for(let k=0;k<8;k++){const S=new THREE.Group();S.position.set(.88,-.05+(k%2)*.02,.55-k*.2);mesh(S,cyl(.085,.085,.42,10),M.brass,[0,0,0]);mesh(S,geo('stip',()=>new THREE.ConeGeometry(.085,.18,10)),mat('#8a3a2a',.4,.5),[0,.3,0]);S.userData.keep=true;g.add(S);rack.push(S);}
    mesh(g,rb(.3,.2,1.75,.05),M.olive2,[.88,-.28,-.15]);
    const scope=new THREE.Group();scope.position.set(-.55,.5,-.35);g.add(scope);mesh(scope,cylZ(.09,.09,.9,14),M.dark,[0,0,0]);for(const z of [-.42,.42])mesh(scope,cylZ(.11,.11,.12,14),M.dark,[0,0,z]);mesh(scope,cylZ(.08,.08,.01,14),M.lens,[0,0,-.49]);mesh(scope,rb(.08,.16,.3,.02),M.dark,[.06,-.12,0]);
    level(m,mesh(barrel,rb(.05,.5,1.5,.02),M.dark,[0,.44,-1.3]),3);level(m,mesh(barrel,cylZ(.315,.315,.07,24),M.gold,[0,.12,-.6]),4);
    level(m,mesh(barrel,cylZ(.31,.31,.05,24),mat('#ffae60',.3,.3,'#ff7b20',2.5),[0,.12,-1.95]),5);level(m,mesh(g,rb(1.25,.08,.25,.03),M.gold,[0,.39,-.5]),6);
    m.breech=breech;m.rack=rack;m.port.position.set(-.5,.25,.6);
    for(const s of [-1,1]){const P=new THREE.Group();P.position.set(s*1.0,.02,-.5);P.rotation.y=s*.32;g.add(P);mesh(P,rb(.58,.7,.08,.03),M.olive,[0,0,0]);mesh(P,rb(.58,.07,.085,.02),M.hazard,[0,.33,0]);bolts(P,[[-.22,-.26,.05],[.22,-.26,.05]]);}
    m.update=(dt,c)=>{barrel.position.z=Math.min(.75,c.recoil*.95);
      if(c.reload>=0){const r=c.reload;const open=r<.22?r/.22:r>.8?(1-r)/.2:1;breech.position.x=open*.5;
        const lr=(r-.22)/.55;loader.visible=lr>0&&lr<1;if(loader.visible){const from=new THREE.Vector3(.88,.2,.1),to=new THREE.Vector3(0,.12,.6);loader.position.lerpVectors(from,to,Math.min(1,lr*1.3));loader.position.y+=Math.sin(Math.min(1,lr*1.3)*Math.PI)*.25;}}
      else{breech.position.x=damp(breech.position.x,0,.05,dt);loader.visible=false;}
      const n=c.reload>=0?Math.floor(c.reload*c.mag):c.ammo;rack.forEach((S,i)=>S.visible=i<n);heat.emissiveIntensity=Math.pow(c.heat,1.5)*2;};
  }

  // =============== 4) tesla coil gun ===============
  {const m=model('tesla'),g=m.group;
    mesh(g,rb(1.15,.56,1.4,.14),M.white,[0,0,0]);for(const s of [-1,1])mesh(g,rb(.06,.4,1.3,.02),M.blue,[s*.58,0,0]);mesh(g,rb(.9,.18,1.0,.06),M.blue,[0,.34,0]);
    mesh(g,cylZ(.1,.1,2.75,14),M.steel,[0,.1,-1.45]);mesh(g,cylZ(.2,.24,.4,18),M.dark,[0,.1,-.6]);
    const coilMat=new THREE.MeshStandardMaterial({color:'#c27b3d',metalness:1,roughness:.25,emissive:'#4fdcff',emissiveIntensity:.25});
    const coils=[];for(let k=0;k<6;k++){const r=.34-k*.025;const c=mesh(g,torus(r,.07,10,28),coilMat,[0,.1,-.95-k*.32]);coils.push(c);if(k>=4)level(m,c,k===4?2:4);}
    const ring=new THREE.Group();ring.position.set(0,.1,-1.6);g.add(ring);ring.userData.keep=true;mesh(ring,torus(.46,.03,6,32),M.steel,[0,0,0]);for(let k=0;k<4;k++){const a=k/4*Math.PI*2;mesh(ring,rb(.06,.18,.06,.02),M.dark,[Math.cos(a)*.46,Math.sin(a)*.46,0],null,[0,0,a]);}
    const tipPts=[];for(let k=0;k<3;k++){const a=k/3*Math.PI*2+Math.PI/2;mesh(g,geo('prong',()=>new THREE.ConeGeometry(.05,.5,6).rotateX(-Math.PI/2)),M.steel,[Math.cos(a)*.22,.1+Math.sin(a)*.22,-2.95]);tipPts.push(new THREE.Vector3(Math.cos(a)*.22,.1+Math.sin(a)*.22,-3.2));}
    const mz=new THREE.Object3D();mz.position.set(0,.1,-3.1);g.add(mz);m.muzzles.push(mz);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:T('flashStar'),color:'#9ff0ff',transparent:true,depthWrite:false,blending:add,toneMapped:false}));glow.scale.setScalar(.45);mz.add(glow);m.glow=glow;
    const caps=[];for(const s of [-1,1]){mesh(g,cyl(.18,.18,.86,18),M.glass,[s*.82,0,.1],null,[Math.PI/2,0,0]);const inner=mesh(g,cyl(.12,.12,.8,14),new THREE.MeshStandardMaterial({color:'#9ff0ff',emissive:'#4fdcff',emissiveIntensity:1.6,roughness:.2}),[s*.82,0,.1],null,[Math.PI/2,0,0]);inner.userData.keep=true;caps.push(inner);for(const z of [-.36,.56])mesh(g,cyl(.2,.2,.08,18),M.steel,[s*.82,0,z],null,[Math.PI/2,0,0]);}
    const arcMat=new THREE.MeshBasicMaterial({color:'#a8f4ff',transparent:true,opacity:.9,depthWrite:false,blending:add,toneMapped:false});const arcs=[];
    for(let k=0;k<6;k++){const a=new THREE.Mesh(geo('arcseg',()=>new THREE.BoxGeometry(1,1,1)),arcMat);a.visible=false;a.userData.keep=true;g.add(a);arcs.push(a);}
    level(m,mesh(g,rb(1.2,.06,.2,.02),M.gold,[0,.3,.6]),5);level(m,mesh(g,torus(.55,.04,8,32),mat('#e4bf5d',1,.2,'#4fdcff',.6),[0,.1,-2.6]),6);
    for(const s of [-1,1]){const P=new THREE.Group();P.position.set(s*.98,.02,-.5);P.rotation.y=s*.32;g.add(P);mesh(P,rb(.5,.55,.06,.03),M.white,[0,0,0]);mesh(P,rb(.5,.05,.065,.02),M.blue,[0,.26,0]);}
    m.ring=ring;m.caps=caps;let spin=0,arcT=0;const A=new THREE.Vector3(),B=new THREE.Vector3(),D=new THREE.Vector3(),Z=new THREE.Vector3(0,0,1);
    m.update=(dt,c)=>{spin=damp(spin,c.firing?22:1.2,.25,dt);ring.rotation.z+=spin*dt;coilMat.emissiveIntensity=damp(coilMat.emissiveIntensity,c.firing?1.5:.3+c.heat*.8,.08,dt);
      coils.forEach((co,i)=>co.scale.setScalar(1+(c.firing?Math.sin(c.t*40+i)*.03:0)));const charge=1-c.heat;caps.forEach(k=>{k.scale.y=.15+charge*.85;k.position.z=.1-(1-(.15+charge*.85))*.4;k.material.emissiveIntensity=c.overheated?.3:1.2+Math.sin(c.t*9)*.4;});
      glow.visible=c.firing;if(c.firing)glow.scale.setScalar(rand(.45,.75));
      arcT-=dt;const show=c.firing||(arcT<0&&Math.random()<.05);if(arcT<0)arcT=.06;
      arcs.forEach((a,i)=>{a.visible=show&&!c.overheated;if(!a.visible)return;const p=tipPts[i%3],q=tipPts[(i+1)%3];A.copy(p).lerp(q,(i<3?0:.5));B.copy(p).lerp(q,i<3?.5:1);A.x+=rand(-.04,.04);B.y+=rand(-.05,.05);B.z-=rand(0,.15);D.copy(B).sub(A);a.position.copy(A).addScaledVector(D,.5);a.scale.set(.018,.018,D.length());a.quaternion.setFromUnitVectors(Z,D.normalize());});};
  }

  refineWeapons(models,{layout:'v03'}); // Coastal weapon polish package, adapted to the v0.3 models
  for(const k of WEAPON_KEYS){const gm=models[k];compactTree(gm.group,'gun-'+k);gm.group.traverse(o=>{if(o.isMesh)o.castShadow=false;});}
  yoke.traverse(o=>{if(o.isMesh)o.castShadow=false;});gunRig.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  return {gunRig,yoke,kick,models};
}
