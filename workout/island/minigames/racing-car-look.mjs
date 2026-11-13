import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {RACING_NUMBERS} from './racing-physics.mjs?v=island-v2-20261107-12';
// racing-deep-m2 livery for twelve cars: one distinct paint per car (the podium and the leaderboard swatches use the same list by index), the cars pair up into six
// teams of our own that share an accent colour on the stripe decal and the stand-in's wings. No real teams, no brands.
export const CAR_COLORS=Object.freeze(['#d93228','#18b6bd','#d6aa3b','#566bd1','#b7c2ca','#e07b39','#7ac05a','#a05fc4','#e0c3a1','#4b6a88','#2b2f36','#e8e6d2']);
export const CAR_NUMBERS=RACING_NUMBERS;
export const TEAMS=Object.freeze([{name:'סער',accent:'#f4f5f2'},{name:'אופק',accent:'#14181c'},{name:'גל',accent:'#ffd166'},{name:'צוק',accent:'#06d6a0'},{name:'רקיע',accent:'#ef476f'},{name:'שחף',accent:'#8ecae6'}]);
export const teamOf=index=>TEAMS[Math.floor(index/2)%TEAMS.length];
// racing-look-v1: better looking formula cars. Same GLB (11.9K triangles), no new files: clear-coated metallic paint, carbon and rubber tuning, an env-map boost,
// generic number/stripe decals (canvas textures, no brands), brake lights that follow the braking, a motion-blur disc per front wheel, speed lines on the camera and cheap
// stand-ins for rivals that are far away. Every part is off with ?racingLook=0. Budget: about +2% triangles over the formula car, +0 textures per rival (5 shared canvases).
export function tunePaint(T,material,color,keep){
 const copy=keep(new T.MeshPhysicalMaterial({color:new T.Color(color),metalness:.62,roughness:.2,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.6,map:material.map||null,name:material.name}));
 return copy;
}
export function tuneMaterial(material){
 const n=material.name||'';
 if(/Graphite|Brake Carbon/.test(n)){material.metalness=.35;material.roughness=.38;material.envMapIntensity=1.2;}
 else if(/Slick Rubber/.test(n)){material.metalness=0;material.roughness=.92;material.envMapIntensity=.2;}
 else if(/Forged Alloy|Center Lock/.test(n)){material.envMapIntensity=1.5;}
 else if(/Visor/.test(n)){material.envMapIntensity=2.2;material.roughness=.08;}
}
function numberTexture(T,number,color,keep){
 const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d');
 x.fillStyle='rgba(0,0,0,0)';x.clearRect(0,0,128,64);x.fillStyle='#f4f5f2';x.beginPath();x.roundRect?x.roundRect(4,4,120,56,14):x.rect(4,4,120,56);x.fill();
 x.fillStyle=color;x.fillRect(4,46,120,10);x.fillStyle='#14181c';x.font='bold 44px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(number),64,26);
 const t=keep(new T.CanvasTexture(c));t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
function stripeTexture(T,color,keep,accent='#14181c'){
 const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.clearRect(0,0,256,64);
 x.fillStyle='#f4f5f2';x.beginPath();x.moveTo(0,64);x.lineTo(60,0);x.lineTo(110,0);x.lineTo(50,64);x.fill();
 x.fillStyle=accent;x.beginPath();x.moveTo(70,64);x.lineTo(130,0);x.lineTo(150,0);x.lineTo(90,64);x.fill();
 x.fillStyle=color;x.beginPath();x.moveTo(170,64);x.lineTo(230,0);x.lineTo(256,0);x.lineTo(256,64);x.lineTo(196,64);x.fill();
 const t=keep(new T.CanvasTexture(c));t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
/** Adds decals, brake lights and a wheel-blur disc to one formula car. `car` is the cloned model (rear at -Z, nose at +Z). Returns handles for per-frame updates. */
export function dressCar(T,car,{index,color,keep,player=false,number=index+1,accent=teamOf(index).accent}){
 const decals=new T.Group();decals.name='decals';car.add(decals);
 const flat=(map,w,h,x,y,z,ry=0,rx=0)=>{const m=new T.Mesh(keep(new T.PlaneGeometry(w,h)),keep(new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false})));m.position.set(x,y,z);m.rotation.set(rx,ry,0);decals.add(m);return m;};
 const num=numberTexture(T,number,color,keep),stripe=stripeTexture(T,color,keep,accent);
 // rear face of the rear wing (the camera sits behind): number left, stripe right; nose top: number; engine cover side stripes
 flat(num,.52,.26,-.26,.92,-2.312,Math.PI);flat(stripe,.62,.16,.3,.92,-2.312,Math.PI);
 const down=new T.Raycaster(),mesh=[];car.traverse(o=>{if(o.isMesh&&!decals.children.includes(o))mesh.push(o);});car.updateMatrixWorld(true);
 const rayY=(x,z)=>{down.set(new T.Vector3(x,3,z),new T.Vector3(0,-1,0));const hit=down.intersectObjects(mesh,false)[0];return hit?hit.point.y:null;};
 const noseY=rayY(0,1.35);if(noseY!=null)flat(num,.34,.17,0,noseY+.012,1.35,0,-Math.PI/2);
 const coverY=rayY(0,-.62);if(coverY!=null)flat(stripe,.3,.075,0,coverY+.012,-.62,0,-Math.PI/2);
 // brake lights: two emissive blocks on the wing endplates; intensity is set per frame
 const lampMaterial=keep(new T.MeshStandardMaterial({color:'#3a0808',emissive:'#ff1b10',emissiveIntensity:.25,roughness:.4}));
 const lamps=[-1,1].map(s=>{const m=new T.Mesh(keep(new T.BoxGeometry(.12,.1,.05)),lampMaterial);m.position.set(s*.62,.82,-2.3);car.add(m);return m;});
 return {lampMaterial,brake(on){lampMaterial.emissiveIntensity=on?2.6:.25;lampMaterial.color.set(on?'#ff2a1a':'#3a0808');},lamps};
}
/** A cheap silhouette (about 150 triangles) shown instead of the 11.9K-triangle car when a rival is more than ~70 m from the camera, and the whole car of the extra rivals.
 * racing-deep-m2: it reads as a formula car from behind: nose, sidepods, airbox with a helmet, rear wing with endplates in the team accent, four wheels. */
export function createStandIn(T,color,keep,accent='#15191d'){
 // one merged, vertex-coloured mesh (a single draw call per far car)
 const paint=new T.Color(color),dark=new T.Color('#15191d'),team=new T.Color(accent),parts=[];
 const add=(geo,col,x,y,z,rz=0)=>{const g=geo.toNonIndexed();g.deleteAttribute('uv');if(rz)g.rotateZ(rz);g.translate(x,y,z);const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}g.setAttribute('color',new T.BufferAttribute(c,3));parts.push(g);};
 add(new T.BoxGeometry(.6,.3,3.7),paint,0,.36,.1);add(new T.BoxGeometry(1.7,.26,1.5),paint,0,.34,-.2);     // monocoque and sidepods
 add(new T.BoxGeometry(.36,.26,.9),paint,0,.6,1.6);add(new T.BoxGeometry(2,.06,.6),paint,0,.2,1.9);          // nose and front wing
 add(new T.BoxGeometry(.5,.42,.9),paint,0,.72,-.5);add(new T.SphereGeometry(.22,6,4),dark,0,.78,.25);          // airbox and helmet
 add(new T.BoxGeometry(1.35,.06,.5),team,0,.95,-2.05);for(const sx of [-1,1])add(new T.BoxGeometry(.05,.4,.5),team,sx*.68,.78,-2.05);   // rear wing and endplates
 for(const sx of [-1,1])for(const [z,r] of [[1.28,.34],[-1.26,.36]])add(new T.CylinderGeometry(r,r,.32,8),dark,sx*.95,r,z,Math.PI/2);
 const merged=keep(mergeGeometries(parts)),g=new T.Group(),m=new T.Mesh(merged,keep(new T.MeshStandardMaterial({vertexColors:true,metalness:.4,roughness:.4})));g.add(m);g.visible=false;return g;
}
/** 28 streaks around the view axis, attached to the camera; only visible at speed. One draw call. */
export function createSpeedLines(T,camera,scene,keep){
 const n=28,pos=new Float32Array(n*6),seed=[];
 for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,r=.9+Math.random()*1.4;seed.push({a,r,z:-1-Math.random()*5,v:.6+Math.random()*.8});}
 const geo=keep(new T.BufferGeometry());geo.setAttribute('position',new T.BufferAttribute(pos,3));
 const mat=keep(new T.LineBasicMaterial({color:'#e9f6ff',transparent:true,opacity:0,depthWrite:false,depthTest:false,toneMapped:false}));
 const lines=new T.LineSegments(geo,mat);lines.frustumCulled=false;lines.renderOrder=20;camera.add(lines);if(!camera.parent)scene.add(camera);
 return {update(dt,speed01,boost){const level=Math.max(0,(speed01-.78)/.22)*(boost?1:.7);mat.opacity+=((level*.5)-mat.opacity)*(dt?1-Math.exp(-dt*6):1);lines.visible=mat.opacity>.02;if(!lines.visible)return;
  for(let i=0;i<n;i++){const s=seed[i];s.z+=dt*(12+speed01*30)*s.v;if(s.z>-.6){s.z=-5-Math.random()*2;s.a=Math.random()*Math.PI*2;s.r=.9+Math.random()*1.4;}
   const len=.5+speed01*1.8,x=Math.cos(s.a)*s.r*(-s.z)*.34,y=Math.sin(s.a)*s.r*(-s.z)*.2;pos.set([x,y,s.z,x,y,s.z-len],i*6);}
  geo.attributes.position.needsUpdate=true;}};
}
