// New non-human invaders: robot shark (water), flying manta (air), siege crab (heavy walker).
// Every builder returns {root, body, zones, legs, rotors, ...} like the boars; animation lives in game.js.
import * as THREE from './vendor/three.module.js';
import {mat,geo,rb,cyl,cylZ,cylX,sph,torus,mesh,plate,worn} from './kit.js';

const UP=new THREE.Vector3(0,1,0);
// Body of revolution along +z, coloured dark on the back and light on the belly (counter-shading).
function hull(key,profile,back,belly,seg=22){return geo('hull'+key,()=>{
  const pts=profile.map(([z,r])=>new THREE.Vector2(Math.max(.001,r),z));const g=new THREE.LatheGeometry(pts,seg);g.rotateX(Math.PI/2);g.scale(.82,1,1);g.computeVertexNormals();
  const n=g.attributes.normal,c=[],cb=new THREE.Color(back),cl=new THREE.Color(belly),t=new THREE.Color();
  for(let i=0;i<n.count;i++){const k=THREE.MathUtils.smoothstep(n.getY(i),-.35,.25);t.copy(cl).lerp(cb,k);c.push(t.r,t.g,t.b);}g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));return g;});}
function hullMat(key,metal=.6,rough=.38){return geo('hm'+key,()=>{const m=worn('#ffffff',metal,rough,{normal:'panel',ns:.3}).clone();m.vertexColors=true;return m;});}
const zone=(parent,pos,r,crit=false,extra={})=>{const o=new THREE.Object3D();o.position.set(...pos);parent.add(o);return {obj:o,r,crit,...extra};};

// ---------------- robot shark ----------------
export function makeShark(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const zones=[];
  const hm=hullMat('shark',.55,.35),dark=worn('#2c3a44',.8,.4),steel=worn('#9aa6a8',.9,.3),fin=worn('#3c5260',.6,.42,{ns:.3});
  const eyeMat=mat('#ffcf3a',.1,.3,'#ffb21c',3.2),gill=mat('#7ff0ff',.1,.3,'#29d3ff',2.4),mouth=mat('#ff6a2a',.1,.5,'#ff4a10',2.2),tooth=mat('#e8ecea',.6,.3);
  const front=new THREE.Group();body.add(front);
  mesh(front,hull('sf',[[-.2,.76],[.6,.8],[1.4,.72],[2.0,.55],[2.45,.33],[2.75,.1],[2.82,.001]],'#4b6575','#dfe6e6'),hm);
  for(let i=0;i<3;i++)mesh(front,rb(.42,.12,.5,.05),dark,[0,.72-i*.04,1.4-i*.55]);
  for(const s of [-1,1]){for(let i=0;i<3;i++)mesh(front,rb(.04,.32,.05,.02),gill,[s*.6,.0,1.05+i*.16],null,[0,s*.25,0]);mesh(front,sph(.13,12,8),eyeMat,[s*.4,.2,2.02]);mesh(front,rb(.24,.07,.2,.03),dark,[s*.4,.32,2.0],null,[0,0,s*.3]);
    mesh(front,rb(.05,.08,1.2,.02),dark,[s*.62,-.22,.9]);}
  const dorsal=mesh(front,plate('dorsal',[[-.55,0],[.35,1.25],[.55,1.32],[.5,.95],[.62,.45],[.95,0]],.12,.04),fin,[0,.62,.75],null,[0,Math.PI/2,0]);
  for(const s of [-1,1])mesh(front,plate('pect'+s,[[0,0],[s*1.25,-.75],[s*1.38,-.95],[s*.55,-.62],[0,-.5]].map(([x,y])=>[x,y]),.08,.03),fin,[s*.58,-.32,1.05],null,[Math.PI/2+.25,0,-s*.25]);
  for(let i=0;i<7;i++){const z=1.55+i*.13,x=(i-3)*.0;for(const s of [-1,1]){if(i>4)continue;mesh(front,geo('tooth',()=>new THREE.ConeGeometry(.045,.16,6).rotateX(Math.PI)),tooth,[s*(.36-i*.05),-.3,z]);}}
  mesh(front,rb(.62,.12,.9,.05),mouth,[0,-.36,1.85]);
  const jaw=new THREE.Group();jaw.position.set(0,-.36,1.25);front.add(jaw);mesh(jaw,rb(.8,.16,1.25,.07),mat('#cfd7d8',.5,.4),[0,-.06,.62]);for(let i=0;i<5;i++)for(const s of [-1,1])mesh(jaw,geo('toothU',()=>new THREE.ConeGeometry(.04,.14,6)),tooth,[s*(.3-i*.05),.06,.35+i*.17]);
  const tube=new THREE.Group();tube.position.set(0,.68,-.25);front.add(tube);mesh(tube,cylZ(.16,.16,.9,14),dark,[0,0,0]);const tubeGlow=new THREE.MeshStandardMaterial({color:'#ffae60',emissive:'#ff7b20',emissiveIntensity:1.2,roughness:.3});mesh(tube,cylZ(.13,.13,.04,14),tubeGlow,[0,0,.46]).userData.keep=true;
  const mid=new THREE.Group();body.add(mid);mesh(mid,hull('sm',[[-1.95,.42],[-1.1,.62],[-.1,.76],[0,.76]],'#4b6575','#dfe6e6'),hm);mesh(mid,plate('dorsal2',[[0,0],[.25,.45],[.4,.42],[.45,0]],.07,.02),fin,[0,.5,-1.2],null,[0,Math.PI/2,0]);mesh(mid,plate('anal',[[0,0],[.25,-.38],[.38,-.36],[.42,0]],.07,.02),fin,[0,-.45,-1.4],null,[0,Math.PI/2,0]);
  const tail=new THREE.Group();tail.position.z=-1.85;mid.add(tail);mesh(tail,hull('st',[[-1.4,.12],[-.7,.24],[.15,.44]],'#4b6575','#dfe6e6'),hm);
  mesh(tail,plate('caudU',[[0,0],[1.0,1.3],[1.32,1.36],[.85,.42],[.55,0]],.09,.03),fin,[0,.08,-1.25],null,[0,Math.PI/2,0]);
  mesh(tail,plate('caudL',[[0,0],[.55,0],[.88,-.62],[.68,-.66]],.09,.03),fin,[0,-.02,-1.25],null,[0,Math.PI/2,0]);
  zones.push({obj:front,r:.95,crit:false},zone(front,[0,0,1.6],.8),zone(mid,[0,0,-.9],.65));
  for(const s of [-1,1])zones.push(zone(front,[s*.4,.2,2.02],.3,true));
  zones.push(zone(tube,[0,0,.4],.28,true,{surfacedOnly:true}),zone(front,[0,1.75,1.1],.5,false,{fin:true}));
  return {root,body,zones,legs:[],rotors:[],front,mid,tail,jaw,tubeGlow,kindModel:'shark'};
}

// ---------------- flying manta ----------------
export function makeManta(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const zones=[];
  const skin=worn('#304454',.65,.38,{normal:'panel',ns:.35}),belly=worn('#cfd8dc',.45,.42),steel=worn('#9aa6a8',.9,.3),line=mat('#7ff0ff',.1,.3,'#29d3ff',2.6);
  const eyeMat=new THREE.MeshStandardMaterial({color:'#7cf3ff',emissive:'#3fd8ff',emissiveIntensity:3,roughness:.3});
  mesh(body,hull('mb',[[-1.7,.2],[-1.0,.95],[0,1.25],[1.0,1.05],[1.7,.5],[1.95,.001]],'#2f4353','#d6dee1',24),hullMat('manta',.6,.36),[0,0,0],[1.45,.36,1]);
  for(const s of [-1,1]){const lobe=mesh(body,torus(.28,.09,8,14,Math.PI*1.2),skin,[s*.55,-.02,1.8],null,[Math.PI/2,0,s>0?-.4:Math.PI+.4]);mesh(body,sph(.12,10,8),eyeMat,[s*.62,.12,1.45]).userData.keep=true;}
  const core=mesh(body,sph(.28,14,10),eyeMat,[0,.36,-.1],[1,.6,1]);core.userData.keep=true;mesh(body,torus(.32,.04,6,22),steel,[0,.34,-.1],null,[Math.PI/2,0,0]);
  for(const s of [-1,1]){mesh(body,cylZ(.12,.15,.5,12),steel,[s*.45,-.3,-.7]);mesh(body,cylZ(.1,.1,.02,12),mat('#ffae60',.1,.3,'#ff7b20',3),[s*.45,-.3,-.96]);}
  const wings=[];
  for(const s of [-1,1]){
    const inner=new THREE.Group();inner.position.set(s*1.2,0,.1);body.add(inner);
    const ip=[[0,1.05],[1.15,.62],[1.65,-.05],[1.05,-.58],[0,-.85]].map(([x,y])=>[x*s,y]);mesh(inner,plate('mwi'+s,ip,.12,.05),skin,[0,0,0],null,[Math.PI/2,0,0]);
    mesh(inner,rb(1.3,.03,.05,.01),line,[s*.75,.08,.2],null,[0,s*.35,0]);mesh(inner,rb(1.1,.03,.05,.01),line,[s*.65,.08,-.3],null,[0,-s*.2,0]);
    const outer=new THREE.Group();outer.position.set(s*1.55,0,0);inner.add(outer);
    const op=[[0,.62],[1.15,-.15],[1.95,-.95],[1.15,-.78],[0,-.25]].map(([x,y])=>[x*s,y]);mesh(outer,plate('mwo'+s,op,.08,.035),skin,[0,0,0],null,[Math.PI/2,0,0]);mesh(outer,rb(1.4,.025,.04,.01),line,[s*.85,.06,-.3],null,[0,s*.5,0]);
    wings.push({inner,outer,s});zones.push(zone(inner,[s*.8,0,0],.8));
  }
  const tailSegs=[];let parent=body,z=-1.7;for(let i=0;i<6;i++){const seg=new THREE.Group();seg.position.z=i?-.45:z;parent.add(seg);mesh(seg,cylZ(.09-i*.012,.1-i*.012,.48,8),i%2?steel:skin,[0,0,-.22]);tailSegs.push(seg);parent=seg;}
  const sting=mesh(parent,sph(.12,10,8),eyeMat,[0,0,-.5]);sting.userData.keep=true;
  zones.unshift({obj:body,r:1.35,crit:false});for(const s of [-1,1])zones.push(zone(body,[s*.62,.12,1.45],.3,true));zones.push(zone(body,[0,.36,-.1],.34,true));
  return {root,body,zones,legs:[],rotors:[],wings,tailSegs,eyeMat,sting,kindModel:'manta'};
}

// ---------------- siege crab ----------------
export function makeCrab(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const zones=[];
  const shell=worn('#b0532e',.55,.42,{normal:'panel',ns:.45}),shell2=worn('#8e3f24',.6,.4),under=worn('#3a2e2a',.5,.55),steel=worn('#9aa6a8',.9,.3),dark=worn('#2b3133',.75,.45),cream=worn('#e9d7bd',.3,.5);
  const eyeMat=mat('#c8ff4a',.1,.3,'#9cff1c',3);
  mesh(body,sph(1,22,12,),shell,[0,0,0],[2.0,.72,1.55]);mesh(body,sph(1,18,8),under,[0,-.22,0],[1.85,.4,1.4]);
  for(const [x,z,w,d] of [[0,.15,1.3,1.1],[-1.0,.05,.75,.95],[1.0,.05,.75,.95],[0,-.85,1.2,.5]])mesh(body,rb(w,.24,d,.1),shell2,[x,.7-Math.abs(x)*.22,z],null,[0,0,-x*.22]);
  mesh(body,torus(1,.09,8,40),shell2,[0,.05,0],[2.0,1.55,1],[Math.PI/2,0,0]);for(let i=0;i<10;i++){const a=i/10*Math.PI*2;mesh(body,sph(.07,6,4),cream,[Math.cos(a)*1.55,.42,Math.sin(a)*1.05]);}
  for(let i=0;i<7;i++){const a=(i/6-.5)*2.2;mesh(body,geo('cspike',()=>new THREE.ConeGeometry(.16,.6,6)),cream,[Math.sin(a)*1.9,.22,Math.cos(a)*1.38],null,[Math.cos(a)*.9,0,-Math.sin(a)*.9]);}
  for(const s of [-1,1]){const st=new THREE.Group();st.position.set(s*.38,.5,1.05);body.add(st);mesh(st,cyl(.05,.07,.7,8),dark,[0,.35,0]);mesh(st,sph(.15,12,8),eyeMat,[0,.75,0]).userData.keep=true;zones.push(zone(st,[0,.75,0],.28,true));}
  for(let i=0;i<3;i++)mesh(body,rb(.22,.12,.1,.03),cream,[-.3+i*.3,-.05,1.45]);
  // siege mortar on the back
  const gun=new THREE.Group();gun.position.set(0,.75,-.45);body.add(gun);mesh(gun,cyl(.45,.55,.3,16),dark,[0,0,0]);const tube=new THREE.Group();tube.rotation.x=-.6;gun.add(tube);mesh(tube,cyl(.22,.26,1.3,14),steel,[0,.6,0]);mesh(tube,cyl(.28,.28,.14,14),dark,[0,1.25,0]);const tip=new THREE.Object3D();tip.position.set(0,1.35,0);tube.add(tip);
  for(let i=0;i<3;i++)mesh(gun,cyl(.09,.09,.42,8),mat('#ffd36b',.2,.3,'#ffa020',1.6),[-.35+i*.35,.25,-.45]);
  // claws: big shield claw (right) and a small one (left)
  const claws=[];
  for(const s of [-1,1]){const big=s>0,k=big?1:.62;const sh=new THREE.Group();sh.position.set(s*1.3,.05,1.0);body.add(sh);
    mesh(sh,cylZ(.16*k,.2*k,.9*k,10),shell2,[s*.15,0,.4*k],null,[0,-s*.5,0]);const el=new THREE.Group();el.position.set(s*.3*k,0,.85*k);sh.add(el);mesh(el,sph(.2*k,10,8),dark);
    const fore=new THREE.Group();el.add(fore);fore.rotation.y=s*.9;mesh(fore,cylZ(.2*k,.24*k,.8*k,10),shell,[0,.05,.35*k]);
    const pin=new THREE.Group();pin.position.set(0,0,.8*k);fore.add(pin);mesh(pin,sph(1,14,10),shell,[0,0,.25*k],[.45*k,.38*k,.55*k]);
    const up=new THREE.Group();up.position.set(0,.12*k,.5*k);pin.add(up);mesh(up,geo('pincer',()=>new THREE.ConeGeometry(.2,.9,8).rotateX(Math.PI/2).translate(0,0,.4)),shell2,[0,0,0],[k,k*.7,k]);
    const lo=new THREE.Group();lo.position.set(0,-.12*k,.5*k);pin.add(lo);mesh(lo,geo('pincer',()=>new THREE.ConeGeometry(.2,.9,8).rotateX(Math.PI/2).translate(0,0,.4)),cream,[0,0,0],[k*.85,k*.6,k*.85]);
    claws.push({sh,el,fore,up,lo,s,big});if(big)zones.push(zone(pin,[0,0,.3],1.05,false,{shield:true}));}
  // legs: three per side, two joints each
  const legs=[];
  for(const s of [-1,1])for(const [z,i] of [[.55,0],[-.05,1],[-.65,2]]){const hip=new THREE.Group();hip.position.set(s*1.6,-.1,z);body.add(hip);hip.rotation.z=s*.5;hip.userData.baseZ=s*.5;
    mesh(hip,cylX(.14,.17,1.1,8),shell,[s*.55,0,0]);const knee=new THREE.Group();knee.position.set(s*1.1,0,0);knee.rotation.z=-s*2.0;hip.add(knee);mesh(knee,sph(.13,8,6),dark);
    mesh(knee,cylX(.08,.13,1.35,8),shell2,[s*.68,0,0]);mesh(knee,geo('ltip',()=>new THREE.ConeGeometry(.07,.3,6).rotateZ(-Math.PI/2)),cream,[s*1.48,0,0],null,[0,s>0?0:Math.PI,0]);
    legs.push({hip,knee,s,i});}
  body.position.y=1.07;
  zones.unshift({obj:body,r:1.55,crit:false});
  return {root,body,zones,legs,rotors:[],claws,tip,kindModel:'crab'};
}

// ---------------- boss: fortress turtle (wave 15) ----------------
// Armoured shell soaks bullets; three shell turrets have their own health; the head ducks in and out.
// When all three turrets are gone the back hatch opens and the reactor is exposed.
export function makeTurtle(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const zones=[];
  const shellM=worn('#5d6a3c',.55,.45,{normal:'panel',ns:.5}),scute=worn('#7d7442',.6,.4,{ns:.3}),rim=worn('#3e4530',.7,.42),skin=worn('#6c7a76',.7,.4,{normal:'panel',ns:.35}),
    belly=worn('#c8b98e',.45,.5),dark=worn('#262c2e',.75,.45),steel=worn('#9aa6a8',.9,.3),brass=mat('#c9a043',.9,.3);
  const eyeMat=new THREE.MeshStandardMaterial({color:'#ff9a3a',emissive:'#ff5a10',emissiveIntensity:3.2,roughness:.3});
  const coreMat=new THREE.MeshStandardMaterial({color:'#7ff0ff',emissive:'#29d3ff',emissiveIntensity:.4,roughness:.25});
  // shell: dome, rim, hexagonal plates, spikes
  mesh(body,sph(1,32,16),shellM,[0,0,0],[3.2,1.55,3.9]);mesh(body,sph(1,26,10),belly,[0,-.45,0],[3.0,.6,3.7]);
  mesh(body,torus(1,.16,8,48),rim,[0,-.12,0],[3.25,3.95,1],[Math.PI/2,0,0]);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;mesh(body,geo('tspike',()=>new THREE.ConeGeometry(.14,.5,6)),steel,[Math.cos(a)*3.25,-.08,Math.sin(a)*3.95],null,[Math.sin(a)*1.4,0,-Math.cos(a)*1.4]);}
  const hex=geo('thex',()=>new THREE.CylinderGeometry(.95,1.0,.22,6));
  for(const [x,z] of [[0,.2],[-1.65,.9],[1.65,.9],[-1.65,-1.2],[1.65,-1.2],[0,2.2],[0,-2.4],[-2.5,-.15],[2.5,-.15]]){
    const nx=x/3.2,nz=z/3.9,ny=Math.sqrt(Math.max(.05,1-nx*nx-nz*nz));const m=mesh(body,hex,scute,[x,ny*1.55+.02,z],[.9,1,.9]);m.lookAt(m.position.x+nx*.6,m.position.y+ny,m.position.z+nz*.6);m.rotateX(Math.PI/2);}
  // reactor under a back hatch (closed until the turrets are gone)
  const core=mesh(body,sph(.75,18,12),coreMat,[0,1.0,-1.7]);core.userData.keep=true;mesh(body,torus(.82,.1,8,24),brass,[0,1.05,-1.7],null,[Math.PI/2,0,0]);
  const hatch=new THREE.Group();hatch.position.set(0,1.42,-.8);body.add(hatch);mesh(hatch,rb(2.1,.2,1.8,.08),scute,[0,0,-.9]);for(const s of [-1,1])mesh(hatch,rb(.1,.12,1.7,.03),brass,[s*.85,.12,-.9]);
  // three turrets on the shell
  const turrets=[];
  for(const [x,z] of [[0,1.0],[-1.75,-.55],[1.75,-.55]]){const base=new THREE.Group();const nx=x/3.2,nz=z/3.9;base.position.set(x,Math.sqrt(1-nx*nx-nz*nz)*1.55+.12,z);body.add(base);
    mesh(base,cyl(.62,.72,.32,16),dark,[0,0,0]);const head=new THREE.Group();head.position.y=.3;base.add(head);
    mesh(head,rb(.95,.5,1.05,.12),worn('#4f5a3a',.7,.4,{normal:'panel',ns:.3}),[0,.12,0]);mesh(head,rb(.7,.1,.7,.04),dark,[0,.42,-.1]);
    for(const s of [-1,1]){mesh(head,cylZ(.08,.1,1.2,10),steel,[s*.2,.12,.95]);mesh(head,cylZ(.12,.12,.12,10),dark,[s*.2,.12,1.5]);}
    const lens=mesh(head,sph(.14,12,8),eyeMat,[0,.22,.53]);lens.userData.keep=true;
    const tip=new THREE.Object3D();tip.position.set(0,.12,1.6);head.add(tip);
    const z0=zone(base,[0,.35,0],.75,false,{part:true});turrets.push({base,head,tip,zone:z0,hp:1,maxHp:1,dead:false,timer:2+turrets.length*1.4});zones.push(z0);}
  // head on a neck that slides in and out
  const neck=new THREE.Group();neck.position.set(0,-.1,3.4);body.add(neck);
  mesh(neck,cylZ(.75,.9,1.6,16),skin,[0,0,.3]);for(let i=0;i<3;i++)mesh(neck,torus(.82-i*.03,.07,6,20),rim,[0,0,-.2+i*.45]);
  const head=new THREE.Group();head.position.set(0,.15,1.25);neck.add(head);
  mesh(head,sph(1,22,14),skin,[0,0,.4],[1.0,.8,1.2]);mesh(head,rb(1.5,.25,1.2,.1),scute,[0,.6,.35]);
  const beak=mesh(head,geo('tbeak',()=>new THREE.ConeGeometry(.55,.9,4).rotateX(Math.PI/2).scale(1.2,.7,1)),belly,[0,-.2,1.55]);
  const jaw=new THREE.Group();jaw.position.set(0,-.35,.6);head.add(jaw);mesh(jaw,rb(1.2,.22,1.3,.08),dark,[0,0,.5]);
  for(const s of [-1,1]){mesh(head,sph(.2,12,8),eyeMat,[s*.62,.28,.95]).userData.keep=true;mesh(head,rb(.4,.1,.3,.03),dark,[s*.6,.48,.92],null,[0,0,s*.35]);}
  // four flipper legs
  const legs=[];
  for(const [x,z,f] of [[-2.5,2.0,1],[2.5,2.0,1],[-2.4,-2.1,0],[2.4,-2.1,0]]){const s=Math.sign(x);const hip=new THREE.Group();hip.position.set(x,-.55,z);body.add(hip);
    mesh(hip,cylX(.42,.5,1.0,12),skin,[s*.35,0,0]);const knee=new THREE.Group();knee.position.set(s*.8,0,0);hip.add(knee);mesh(knee,cyl(.4,.48,1.35,12),skin,[0,-.6,0]);
    mesh(knee,rb(1.1,.25,f?1.4:1.0,.1),scute,[s*.1,-1.3,.15]);for(let k=0;k<3;k++)mesh(knee,geo('tclaw',()=>new THREE.ConeGeometry(.08,.3,6).rotateX(Math.PI/2)),belly,[s*.1-.3+k*.3,-1.35,f?.95:.7]);
    legs.push({hip,knee,s,front:!!f});}
  const tail=new THREE.Group();tail.position.set(0,-.3,-3.8);body.add(tail);mesh(tail,geo('ttail',()=>new THREE.ConeGeometry(.45,1.3,10).rotateX(-Math.PI/2)),skin,[0,0,-.5]);
  body.position.y=2.25;
  const headZ=zone(head,[0,0,.5],1.05,false,{when:e=>e.headOut>.6});
  zones.unshift({obj:body,r:3.3,crit:false,shield:true,enclosing:true},headZ); // the shell wraps the turrets: it only counts when nothing else on the turtle is under the crosshair
  for(const s of [-1,1])zones.push(zone(head,[s*.62,.28,.95],.36,true,{when:e=>e.headOut>.6}));
  zones.push(zone(body,[0,1.0,-1.7],.95,true,{when:e=>e.exposed}));
  return {root,body,zones,legs,rotors:[],turrets,neck,head,jaw,hatch,core,coreMat,eyeMat,tail,kindModel:'turtle'};
}

// ---------------- boss: steel leviathan (wave 20) ----------------
// A whale-sized machine. Under water only the armoured ridge can be hit; when it surfaces the jaw opens,
// the reactor in its mouth and the eyes glow, back hatches launch torpedoes and it releases sharks.
export function makeLeviathan(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);const zones=[];
  const hm=hullMat('lev',.6,.36),dark=worn('#1f2a31',.8,.42),steel=worn('#9aa6a8',.9,.3),ridgeM=worn('#33424c',.7,.4,{normal:'panel',ns:.4}),scar=worn('#c4473a',.3,.6),tooth=mat('#e8ecea',.6,.3);
  const glow=new THREE.MeshStandardMaterial({color:'#7ff0ff',emissive:'#29d3ff',emissiveIntensity:.6,roughness:.25});
  const eyeMat=new THREE.MeshStandardMaterial({color:'#ffcf3a',emissive:'#ffb21c',emissiveIntensity:.8,roughness:.3});
  const front=new THREE.Group();body.add(front);
  mesh(front,hull('lf',[[-1,3.0],[1.5,3.15],[4,2.9],[5.8,2.4],[7.0,1.7],[7.7,.9],[8.0,.001]],'#3b5262','#cfd8da',28),hm);
  // lower jaw hinged under the head
  const jaw=new THREE.Group();jaw.position.set(0,-1.2,2.6);front.add(jaw);
  mesh(jaw,hull('lj',[[0,1.9],[2.5,1.75],[4.2,1.2],[5.1,.45],[5.3,.001]],'#2d3f4c','#d9e0e1',22),hm,[0,-.55,0],[1,.45,1]);
  for(let i=0;i<9;i++)for(const s of [-1,1])mesh(jaw,geo('ltooth',()=>new THREE.ConeGeometry(.12,.45,6)),tooth,[s*(1.55-i*.15),.0,.6+i*.5]);
  for(let i=0;i<9;i++)for(const s of [-1,1])mesh(front,geo('ltoothU',()=>new THREE.ConeGeometry(.12,.45,6).rotateX(Math.PI)),tooth,[s*(1.65-i*.15),-1.25,3.2+i*.5]);
  // mouth reactor (only visible with the jaw open)
  const core=mesh(front,sph(.85,18,12),glow,[0,-1.2,4.2]);core.userData.keep=true;mesh(front,torus(.95,.12,8,24),steel,[0,-1.2,4.2]);
  // eyes and armour
  for(const s of [-1,1]){mesh(front,sph(.36,14,10),eyeMat,[s*2.05,.55,5.2]).userData.keep=true;mesh(front,rb(1.0,.2,.6,.06),dark,[s*2.0,.95,5.1],null,[0,0,s*.4]);
    for(let i=0;i<4;i++)mesh(front,rb(.08,1.3,.18,.03),glow,[s*2.55,-.3,2.6-i*.42],null,[0,s*.25,0]);
    mesh(front,plate('lpect'+s,[[0,0],[s*3.4,-1.6],[s*3.8,-2.3],[s*1.4,-1.5],[0,-1.1]],.25,.06),ridgeM,[s*2.4,-1.4,1.2],null,[Math.PI/2+.2,0,-s*.2]);}
  mesh(front,rb(2.2,.3,3.2,.12),ridgeM,[0,2.95,3.6],null,[-.18,0,0]);mesh(front,rb(1.2,.15,1.6,.05),scar,[1.2,2.3,5.4],null,[-.6,0,.3]);
  // blowhole and the back ridge with hatches
  const blow=new THREE.Object3D();blow.position.set(0,3.2,1.8);front.add(blow);mesh(front,cyl(.45,.55,.4,14),dark,[0,3.05,1.8]);
  const hatches=[];
  for(let i=0;i<4;i++){const z=-.4-i*1.25;mesh(front,rb(.5,.6,.9,.08),ridgeM,[0,3.0-i*.05,z+.6]);
    for(const s of [-1,1]){const h=new THREE.Group();h.position.set(s*.95,2.78-i*.08,z);h.rotation.z=s*.25;front.add(h);const lid=new THREE.Group();h.add(lid);mesh(lid,rb(.8,.12,.9,.04),ridgeM,[s*.4,0,0]);
      const tube=new THREE.Object3D();tube.position.set(s*.4,.3,0);h.add(tube);hatches.push({lid,tube,s});mesh(h,cyl(.3,.3,.2,12),mat('#ffae60',.1,.3,'#ff7b20',2.2),[s*.4,-.12,0]);}}
  const mid=new THREE.Group();mid.position.z=-1;body.add(mid);mesh(mid,hull('lm',[[-6,1.9],[-3.5,2.6],[-1,3.0],[0,3.0]],'#3b5262','#cfd8da',28),hm);
  for(let i=0;i<5;i++)mesh(mid,geo('lspine',()=>new THREE.ConeGeometry(.35,1.4,6)),ridgeM,[0,2.85-i*.22,-.8-i*1.1],null,[-.4,0,0]);
  const tail=new THREE.Group();tail.position.z=-6;mid.add(tail);mesh(tail,hull('lt',[[-4,.55],[-2,1.2],[0,1.95]],'#3b5262','#cfd8da',22),hm);
  const fluke=new THREE.Group();fluke.position.z=-4;tail.add(fluke);
  for(const s of [-1,1])mesh(fluke,plate('lfluke'+s,[[0,0],[s*2.8,-1.4],[s*4.2,-1.0],[s*3.2,.2],[s*.6,.6]],.22,.06),ridgeM,[0,0,0],null,[Math.PI/2,0,0]);
  body.scale.setScalar(1);
  zones.unshift({obj:front,r:3.1,crit:false},zone(front,[0,0,5.6],2.0),zone(mid,[0,0,-2.5],2.6));
  zones.push(zone(front,[0,2.9,0],1.4,false,{shield:true}),zone(mid,[0,2.6,-2.6],1.3,false,{shield:true}));
  zones.push(zone(front,[0,-1.2,4.2],1.0,true,{surfacedOnly:true}));for(const s of [-1,1])zones.push(zone(front,[s*2.05,.55,5.2],.5,true,{surfacedOnly:true}));
  return {root,body,zones,legs:[],rotors:[],front,mid,tail,fluke,jaw,hatches,blow,glow,eyeMat,core,kindModel:'leviathan'};
}
