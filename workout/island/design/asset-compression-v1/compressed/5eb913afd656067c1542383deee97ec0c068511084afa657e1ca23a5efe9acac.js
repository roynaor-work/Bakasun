// Shared helpers: math, terrain, quality, material/geometry caches, procedural textures, mesh merging.
import * as THREE from './vendor/three.module.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

export const clamp=THREE.MathUtils.clamp, rand=(a,b)=>a+Math.random()*(b-a);
export const damp=(a,b,half,dt)=>b+(a-b)*Math.pow(2,-dt/half); // frame-rate independent smoothing
export const TOUCH=matchMedia('(pointer:coarse)').matches;

// ---------- quality ----------
const QKEY='boar-island-quality';
// Default when the player never chose: normal on phones and on built-in laptop graphics (measured 28/10/2026 on Intel UHD:
// normal holds 60 FPS in every wave, high drops to 40-50 in storms and boss waves even at half resolution).
export function gpuName(){try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');const x=gl&&gl.getExtension('WEBGL_debug_renderer_info');const n=gl?(x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)):'';gl?.getExtension('WEBGL_lose_context')?.loseContext();return String(n||'');}catch{return '';}}
const WEAK_GPU=/Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i;
function readQuality(){try{const q=localStorage.getItem(QKEY);if(q==='high'||q==='normal')return q;}catch{}return (TOUCH||innerWidth<700||(!/[?&]qa\b/.test(location.search)&&WEAK_GPU.test(gpuName())))?'normal':'high';}
export const QUALITY=readQuality();
export function setQuality(q){try{localStorage.setItem(QKEY,q);}catch{}}
export const HIGH=QUALITY==='high';

// ---------- terrain (shared by meshes, shaders and gameplay) ----------
export const shoreZ=x=>-12+Math.sin(x*.07)*3+Math.sin(x*.19+1.3)*1.2;
export function groundY(x,z){const d=z-shoreZ(x);let y=d>0?d*.075:d*.09;y+=Math.sin(x*.31+z*.17)*.08+Math.max(0,z-14)*.05;return Math.max(-3.5,y);}
export function seaWave(x,z,t){return Math.sin(x*.14+t*1.3)*.22+Math.cos(z*.18-t)*.2+Math.sin(x*.4+z*.24+t*1.9)*.06;}

// ---------- caches ----------
let R=null;export function setRenderer(r){R=r;}
const materials=new Map(),geometries=new Map();
export function mat(color,metal=.2,rough=.6,emissive=null,ei=1.8){const key=[color,metal,rough,emissive,ei].join();if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,...(emissive?{emissive,emissiveIntensity:ei}:{})}));return materials.get(key);}
export function geo(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
export const rb=(w,h,d,r=.08)=>geo(`rb${w}-${h}-${d}-${r}`,()=>new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/2-.001,h/2-.001,d/2-.001)));
export const cyl=(r1,r2,h,s=14)=>geo(`cy${r1}-${r2}-${h}-${s}`,()=>new THREE.CylinderGeometry(r1,r2,h,s));
export const cylZ=(r1,r2,h,s=14)=>geo(`cz${r1}-${r2}-${h}-${s}`,()=>new THREE.CylinderGeometry(r1,r2,h,s).rotateX(Math.PI/2));
export const cylX=(r1,r2,h,s=14)=>geo(`cx${r1}-${r2}-${h}-${s}`,()=>new THREE.CylinderGeometry(r1,r2,h,s).rotateZ(Math.PI/2));
export const sph=(r,w=14,h=10)=>geo(`sp${r}-${w}-${h}`,()=>new THREE.SphereGeometry(r,w,h));
export const torus=(r,t,rs=8,ts=24,arc=Math.PI*2)=>geo(`to${r}-${t}-${rs}-${ts}-${arc}`,()=>new THREE.TorusGeometry(r,t,rs,ts,arc));
export function mesh(parent,geometry,material,pos=[0,0,0],scale=null,rot=null){const m=new THREE.Mesh(geometry,material);m.position.set(...pos);if(scale)m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
// Flat shape extruded into a thin rounded plate (fins, wings, blades). pts in the XY plane.
export function plate(key,pts,depth=.1,bevel=.03){return geo('pl'+key,()=>{const s=new THREE.Shape();pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:8});g.translate(0,0,-depth/2);g.computeVertexNormals();return g;});}

// ---------- procedural textures ----------
export function canvasTex(size,draw,{repeat=false,color=true}={}){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}if(R)t.anisotropy=Math.min(8,R.capabilities.getMaxAnisotropy());return t;}
export const radial=(stops,size=128)=>canvasTex(size,(x,s)=>{const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);for(const [o,c] of stops)g.addColorStop(o,c);x.fillStyle=g;x.fillRect(0,0,s,s);});
// Tileable height field from integer-frequency waves (seamless when repeated).
function tileHeight(size,waves,fn=null){const h=new Float32Array(size*size);const W=[];let s=1;const r=()=>((s=(s*16807)%2147483647)/2147483647);
  for(let i=0;i<waves;i++){const fx=Math.round((r()*2-1)*(2+i*1.6)),fy=Math.round((r()*2-1)*(2+i*1.6));W.push([fx||1,fy,r()*6.28,1/(1+i*.55)]);}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){let v=0;const u=x/size*6.2832,w=y/size*6.2832;for(const [a,b,p,amp] of W)v+=Math.sin(a*u+b*w+p)*amp;h[y*size+x]=fn?fn(v,x/size,y/size):v;}
  let mn=Infinity,mx=-Infinity;for(const v of h){mn=Math.min(mn,v);mx=Math.max(mx,v);}for(let i=0;i<h.length;i++)h[i]=(h[i]-mn)/(mx-mn||1);return h;}
function heightToNormal(h,size,strength){return canvasTex(size,(x)=>{const img=x.createImageData(size,size);for(let y=0;y<size;y++)for(let i=0;i<size;i++){const L=h[y*size+(i-1+size)%size],Rr=h[y*size+(i+1)%size],U=h[((y-1+size)%size)*size+i],D=h[((y+1)%size)*size+i];let nx=(L-Rr)*strength,ny=(D-U)*strength,nz=1;const l=Math.hypot(nx,ny,nz);const k=(y*size+i)*4;img.data[k]=(nx/l*.5+.5)*255;img.data[k+1]=(ny/l*.5+.5)*255;img.data[k+2]=(nz/l*.5+.5)*255;img.data[k+3]=255;}x.putImageData(img,0,0);},{repeat:true,color:false});}
function heightToGray(h,size,lo,hi,color=false){return canvasTex(size,(x)=>{const img=x.createImageData(size,size);for(let i=0;i<h.length;i++){const v=(lo+(hi-lo)*h[i])*255;img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=v;img.data[i*4+3]=255;}x.putImageData(img,0,0);},{repeat:true,color});}
const texCache={};
export function T(name){if(texCache[name])return texCache[name];const make=MAKERS[name];return texCache[name]=make();}
const MAKERS={
  // painted / worn metal: light albedo variation (tinted by material colour), roughness variation, fine normal
  wearMap:()=>canvasTex(256,(x,s)=>{x.fillStyle='#e8e8e8';x.fillRect(0,0,s,s);for(let i=0;i<2200;i++){const v=rand(170,255)|0;x.fillStyle=`rgba(${v},${v},${v},.25)`;x.beginPath();x.arc(rand(0,s),rand(0,s),rand(1,7),0,7);x.fill();}
    x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=1;for(let i=0;i<70;i++){const a=rand(0,6.28),l=rand(4,26),px=rand(0,s),py=rand(0,s);x.beginPath();x.moveTo(px,py);x.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l);x.stroke();}
    x.fillStyle='rgba(60,50,40,.18)';for(let i=0;i<40;i++){x.beginPath();x.ellipse(rand(0,s),rand(0,s),rand(4,18),rand(2,7),rand(0,3),0,7);x.fill();}},{repeat:true}),
  wearRough:()=>canvasTex(256,(x,s)=>{x.fillStyle='#bdbdbd';x.fillRect(0,0,s,s);for(let i=0;i<1600;i++){const v=rand(110,255)|0;x.fillStyle=`rgba(${v},${v},${v},.3)`;x.fillRect(rand(0,s),rand(0,s),rand(2,10),rand(1,4));}x.strokeStyle='rgba(60,60,60,.7)';for(let i=0;i<70;i++){const a=rand(0,6.28),l=rand(4,26),px=rand(0,s),py=rand(0,s);x.beginPath();x.moveTo(px,py);x.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l);x.stroke();}},{repeat:true,color:false}),
  microNormal:()=>heightToNormal(tileHeight(128,10),128,2.2),
  panelNormal:()=>{const s=256,h=new Float32Array(s*s);for(let y=0;y<s;y++)for(let x=0;x<s;x++){let v=.6;if(x%128<3||y%96<3)v=.15;const cx=(x%64)-32,cy=(y%48)-24;if(Math.hypot(cx-26,cy-18)<3)v=1;h[y*s+x]=v;}return heightToNormal(h,s,6);},
  knurlNormal:()=>{const s=64,h=new Float32Array(s*s);for(let y=0;y<s;y++)for(let x=0;x<s;x++)h[y*s+x]=(Math.abs(Math.sin((x+y)*.39))+Math.abs(Math.sin((x-y)*.39)))/2;return heightToNormal(h,s,5);},
  wood:()=>canvasTex(256,(x,s)=>{x.fillStyle='#9a6a3e';x.fillRect(0,0,s,s);for(let i=0;i<120;i++){x.strokeStyle=`rgba(${rand(50,90)|0},${rand(25,45)|0},10,${rand(.15,.4)})`;x.lineWidth=rand(.5,3);x.beginPath();const y0=rand(0,s);x.moveTo(0,y0);for(let px=0;px<=s;px+=16)x.lineTo(px,y0+Math.sin(px*.03+i)*rand(2,6));x.stroke();}},{repeat:true}),
  hazard:()=>canvasTex(128,(x,s)=>{x.fillStyle='#e6b72c';x.fillRect(0,0,s,s);x.fillStyle='#1d1f20';for(let i=-s;i<s*2;i+=32){x.beginPath();x.moveTo(i,0);x.lineTo(i+16,0);x.lineTo(i+16-s,s);x.lineTo(i-s,s);x.fill();}},{repeat:true}),
  perf:()=>canvasTex(128,(x,s)=>{x.fillStyle='#fff';x.fillRect(0,0,s,s);x.fillStyle='#000';for(let r=0;r<8;r++)for(let c=0;c<8;c++){x.beginPath();x.ellipse(c*16+8+(r%2)*8,r*16+8,4.6,3.6,0,0,7);x.fill();}},{repeat:true,color:false}),
  reticle:()=>canvasTex(128,(x,s)=>{x.clearRect(0,0,s,s);x.strokeStyle='rgba(255,60,40,.95)';x.lineWidth=3;x.beginPath();x.arc(64,64,30,0,7);x.stroke();x.fillStyle='rgba(255,80,50,1)';x.beginPath();x.arc(64,64,5,0,7);x.fill();for(const [a,b,c,d] of [[64,20,64,32],[64,96,64,108],[20,64,32,64],[96,64,108,64]]){x.beginPath();x.moveTo(a,b);x.lineTo(c,d);x.stroke();}}),
  flashStar:()=>canvasTex(128,(x,s)=>{const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,240,1)');g.addColorStop(.2,'rgba(255,230,150,.9)');g.addColorStop(.5,'rgba(255,150,50,.35)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=i%2?18:64*rand(.7,1);x.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}x.closePath();x.fill();}),
  flashSide:()=>canvasTex(128,(x,s)=>{const g=x.createLinearGradient(0,0,0,s);g.addColorStop(0,'rgba(255,250,220,1)');g.addColorStop(.35,'rgba(255,200,90,.8)');g.addColorStop(1,'rgba(255,120,30,0)');x.fillStyle=g;x.beginPath();x.moveTo(64,0);x.quadraticCurveTo(110,50,64,128);x.quadraticCurveTo(18,50,64,0);x.fill();}),
  // vegetation cut-outs
  frond:()=>canvasTex(256,(x,s)=>{x.clearRect(0,0,s,s);x.strokeStyle='#6b7a38';x.lineWidth=5;x.beginPath();x.moveTo(128,s);x.lineTo(128,4);x.stroke();
    for(let i=0;i<34;i++){const y=s-10-i*7,len=(1-Math.abs(i/34-.42)*1.25)*118;for(const d of [-1,1]){const g=x.createLinearGradient(128,y,128+d*len,y-26);g.addColorStop(0,i%3?'#3f7f3d':'#4a8b40');g.addColorStop(1,'#6fa94e');x.fillStyle=g;x.beginPath();x.moveTo(128,y);x.quadraticCurveTo(128+d*len*.5,y-14,128+d*len,y-30);x.quadraticCurveTo(128+d*len*.55,y-6,128,y+5);x.fill();}}}),
  grass:()=>canvasTex(128,(x,s)=>{x.clearRect(0,0,s,s);for(let i=0;i<26;i++){const bx=rand(10,118),h=rand(60,124),lean=rand(-26,26);x.strokeStyle=`hsl(${rand(70,95)},${rand(35,55)}%,${rand(30,48)}%)`;x.lineWidth=rand(2,4);x.beginPath();x.moveTo(bx,s);x.quadraticCurveTo(bx+lean*.3,s-h*.6,bx+lean,s-h);x.stroke();}}),
  leaves:()=>canvasTex(128,(x,s)=>{x.clearRect(0,0,s,s);for(let i=0;i<46;i++){const cx=rand(14,114),cy=rand(14,114);if(Math.hypot(cx-64,cy-64)>56)continue;x.fillStyle=`hsl(${rand(95,130)},${rand(35,55)}%,${rand(24,42)}%)`;x.save();x.translate(cx,cy);x.rotate(rand(0,6.28));x.beginPath();x.ellipse(0,0,rand(7,13),rand(3,6),0,0,7);x.fill();x.restore();}}),
  // sand and rock
  sandMap:()=>canvasTex(256,(x,s)=>{x.fillStyle='#ffffff';x.fillRect(0,0,s,s);for(let i=0;i<20000;i++){const v=rand(150,255)|0;x.fillStyle=`rgba(${v},${v-8},${v-24},.22)`;x.fillRect(rand(0,s),rand(0,s),rand(1,2.4),rand(1,2.4));}for(let i=0;i<60;i++){x.fillStyle=`rgba(${rand(120,170)|0},${rand(110,150)|0},${rand(90,120)|0},.35)`;x.beginPath();x.arc(rand(0,s),rand(0,s),rand(.8,2),0,7);x.fill();}},{repeat:true}),
  sandNormal:()=>heightToNormal(tileHeight(256,9,(v,u,w)=>Math.sin((w*8+Math.sin(u*6.2832*2)*.35+v*.06)*6.2832)*.7+v*.08),256,3.2),
  rockNormal:()=>heightToNormal(tileHeight(256,16),256,4),
  rockMap:()=>heightToGray(tileHeight(256,14),256,.62,1,true),
  burlapNormal:()=>{const s=64,h=new Float32Array(s*s);for(let y=0;y<s;y++)for(let x=0;x<s;x++)h[y*s+x]=((Math.sin(x*.8)>0)^(Math.sin(y*.8)>0))?.8:.3;return heightToNormal(h,s,2.5);},
  // water
  waterNormal:()=>heightToNormal(tileHeight(256,22),256,6),
  foam:()=>heightToGray(tileHeight(256,18,(v)=>v),256,0,1,false),
};
// Worn painted metal material.
export function worn(color,metal=.6,rough=.5,{normal='micro',ns=.35,repeat=1,emissive=null,ei=1}={}){
  const key=['w',color,metal,rough,normal,ns,repeat,emissive,ei].join();if(materials.has(key))return materials.get(key);
  const m=new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,map:T('wearMap'),roughnessMap:T('wearRough'),normalMap:normal?T(normal==='panel'?'panelNormal':normal==='knurl'?'knurlNormal':'microNormal'):null,normalScale:new THREE.Vector2(ns,ns),...(emissive?{emissive,emissiveIntensity:ei}:{})});
  materials.set(key,m);return m;
}

// ---------- draw-call reduction ----------
export function plainGeo(g,matrix){const q=g.index?g.toNonIndexed():g.clone();const out=new THREE.BufferGeometry();out.setAttribute('position',q.getAttribute('position'));out.setAttribute('normal',q.getAttribute('normal'));out.setAttribute('uv',q.getAttribute('uv')||new THREE.Float32BufferAttribute(new Float32Array(q.getAttribute('position').count*2),2));if(q.getAttribute('color'))out.setAttribute('color',q.getAttribute('color'));if(matrix)out.applyMatrix4(matrix);return out;}
const lambertCache=new Map();
// Rough, non-metal, untextured surfaces look the same with Lambert and cost far less per pixel.
export function toLambert(m){if(!m.isMeshStandardMaterial||m.metalness>.35||m.roughness<.75||m.normalMap||m.userData.keepPBR)return m;if(!lambertCache.has(m))lambertCache.set(m,new THREE.MeshLambertMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,flatShading:m.flatShading,side:m.side,emissive:m.emissive,emissiveIntensity:m.emissiveIntensity,alphaTest:m.alphaTest,transparent:m.transparent}));return lambertCache.get(m);}
export function mergeStatic(root,target){root.updateMatrixWorld(true);const buckets=new Map();
  root.traverse(o=>{if(!o.isMesh)return;if(!HIGH)o.material=toLambert(o.material);const hasColor=!!o.geometry.getAttribute('color');const k=o.material.uuid+(o.castShadow?'s':'')+(o.receiveShadow?'r':'')+(hasColor?'c':'');if(!buckets.has(k))buckets.set(k,{mat:o.material,cast:o.castShadow,recv:o.receiveShadow,depthMat:o.customDepthMaterial,list:[]});const g=plainGeo(o.geometry,o.matrixWorld);buckets.get(k).list.push(g);});
  const out=[];for(const b of buckets.values()){const m=new THREE.Mesh(mergeGeometries(b.list),b.mat);m.castShadow=b.cast;m.receiveShadow=b.recv;if(b.depthMat)m.customDepthMaterial=b.depthMat;target.add(m);out.push(m);}return out;}
const mergeCache=new Map();
export function compact(group,key){
  const kids=group.children.filter(c=>c.isMesh&&!c.children.length&&!c.userData.keep&&!c.isSprite);if(kids.length<2)return;
  const by=new Map();for(const c of kids){if(!by.has(c.material))by.set(c.material,[]);by.get(c.material).push(c);}
  for(const [m,list] of by){if(list.length<2)continue;const ck=key+'|'+m.uuid+'|'+list.length;let g=mergeCache.get(ck);if(!g){g=mergeGeometries(list.map(c=>{c.updateMatrix();return plainGeo(c.geometry,c.matrix);}));mergeCache.set(ck,g);}
    for(const c of list)group.remove(c);const mm=new THREE.Mesh(g,m);mm.castShadow=true;group.add(mm);}
}
export function compactTree(root,key){const walk=(g,path)=>{g.children.filter(c=>!c.isMesh&&c.children.length).forEach((c,i)=>walk(c,path+'/'+i));compact(g,key+path);};walk(root,'');}
