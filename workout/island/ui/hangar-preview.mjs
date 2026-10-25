import * as T from '../vendor/three.module.js';
import {LocalModels} from '../view/local-models.mjs?v=island-cityplay-20261025-1';

/** Local studio for the authored Meshy ship. Original materials, texture sizes
 * and geometry stay intact; selected paint is the docking-bay accent. */
export function hangarPreview(canvas,balance,color){
 let renderer,frame,disposed=false,ship,started,last=0;
 const models=new LocalModels(),geometries=new Set(),materials=new Set();
 try{renderer=new T.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'low-power'});}
 catch{canvas.dataset.mode='fallback';models.dispose();return {dispose(){}};}
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,50);
 scene.background=new T.Color('#050b15');scene.fog=new T.FogExp2('#050b15',.038);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.75));
 const geo=g=>(geometries.add(g),g),mat=m=>(materials.add(m),m);
 const metal=mat(new T.MeshStandardMaterial({color:'#182637',metalness:.78,roughness:.48}));
 const dark=mat(new T.MeshStandardMaterial({color:'#101b2a',metalness:.5,roughness:.65}));
 const glow=mat(new T.MeshBasicMaterial({color:color||'#78cfe5',toneMapped:false}));
 const pale=mat(new T.MeshBasicMaterial({color:'#b5e7fa',toneMapped:false}));
 const mesh=(g,m,x,y,z)=>{const o=new T.Mesh(geo(g),m);o.position.set(x,y,z);scene.add(o);return o;};
 scene.add(new T.HemisphereLight('#b7d5ed','#171d29',1.25));
 for(const [tint,intensity,position]of [['#fff2dc',4,[3,6,4]],['#7bc9ff',3,[-4,3,-3]],['#e5f6ff',1.5,[1,2,-5]]]){
  const light=new T.DirectionalLight(tint,intensity);light.position.set(...position);scene.add(light);
 }
 // Broad luminous panels supply soft metal reflections without a network HDRI.
 const studio=new T.Scene();studio.background=new T.Color('#43566c');
 const shell=new T.Mesh(new T.BoxGeometry(24,16,24),new T.MeshBasicMaterial({color:'#1b2839',side:T.BackSide}));studio.add(shell);
 for(const [x,y,z,sx,sy,sz,tint]of [[0,7,0,8,.1,7,'#ffffff'],[-7,2,0,.1,5,7,'#78b5e9'],[6,2,-4,.1,5,4,'#ffe6bf']]){
  const panel=new T.Mesh(new T.BoxGeometry(sx,sy,sz),new T.MeshBasicMaterial({color:tint}));panel.position.set(x,y,z);studio.add(panel);
 }
 let environment;
 try{const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.08,.1,40);scene.environment=environment.texture;pmrem.dispose();}catch{}
 studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});studio.clear();
 mesh(new T.PlaneGeometry(34,34),dark,0,-.31,0).rotation.x=-Math.PI/2;
 mesh(new T.CylinderGeometry(3.45,3.65,.24,80),metal,0,-.16,0);
 mesh(new T.CylinderGeometry(3.28,3.28,.025,80),dark,0,-.025,0);
 for(const [radius,tube,m]of [[3.37,.025,glow],[2.8,.013,metal],[3.6,.012,metal]]){
  mesh(new T.TorusGeometry(radius,tube,6,96),m,0,.004,0).rotation.x=-Math.PI/2;
 }
 // Dock seams and recessed guides give scale while staying below the ship.
 const seams=[];
 for(let i=-6;i<=6;i++)seams.push(i*1.3,-.295,-9,i*1.3,-.295,9,-9,-.295,i*1.3,9,-.295,i*1.3);
 const seamGeo=geo(new T.BufferGeometry());seamGeo.setAttribute('position',new T.Float32BufferAttribute(seams,3));
 scene.add(new T.LineSegments(seamGeo,mat(new T.LineBasicMaterial({color:'#263b50',transparent:true,opacity:.42}))));
 for(const side of [-1,1]){
  for(let i=0;i<4;i++)mesh(new T.BoxGeometry(.09,.015,.7),i===0?glow:pale,side*4.2,-.28,2-i*1.6);
  mesh(new T.BoxGeometry(.26,5,.32),metal,side*6.3,2,-6);
  mesh(new T.BoxGeometry(.07,3.2,.04),pale,side*6.15,2,-5.8);
 }
 mesh(new T.BoxGeometry(15,7,.3),dark,0,2.6,-8);
 for(let i=-3;i<=3;i++)mesh(new T.BoxGeometry(.035,5,.08),metal,i*1.8,2,-7.8);
 mesh(new T.BoxGeometry(9,.035,.06),pale,0,4.65,-7.8);
 // Contact shadow is a presentation texture; model maps are never resampled.
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
 const p=shadowCanvas.getContext('2d'),gradient=p.createRadialGradient(64,64,4,64,64,64);
 gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(1,'rgba(0,0,0,0)');p.fillStyle=gradient;p.fillRect(0,0,128,128);
 const shadowTexture=new T.CanvasTexture(shadowCanvas),shadowMaterial=mat(new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
 mesh(new T.PlaneGeometry(5.8,4.7),shadowMaterial,0,.025,0).rotation.x=-Math.PI/2;
 canvas.setAttribute('role','img');canvas.setAttribute('aria-label','החללית המקורית בתצוגת האנגר תלת־ממדית');canvas.dataset.materials='source';
 models.load(balance.models.player).then(ok=>{
  if(disposed)return;if(!ok){canvas.dataset.mode='fallback';return;}
  ship=models.create(balance.models.player,{length:4.05});
  if(ship){ship.position.y=.25;ship.rotation.y=.48;scene.add(ship);canvas.dataset.mode='three';}
 });
 function resize(){
  if(disposed)return;const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width||balance.hangar.previewSize),height=Math.max(1,rect.height||balance.hangar.previewSize);
  renderer.setSize(width,height,false);camera.aspect=width/height;
  const fit=Math.max(1,1.1/camera.aspect);camera.position.set(5.2*fit,4.3*fit,7.5*fit);camera.lookAt(0,.5,0);camera.updateProjectionMatrix();
 }
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function draw(at){
  if(disposed)return;started??=at;
  // Measured turntable keeps the nose, wings and surface detail readable.
  if(at-last>=33&&!document.hidden){if(ship){ship.rotation.y=.48+(reduced?0:Math.sin((at-started)/13000)*.42);ship.position.y=.25+(reduced?0:Math.sin((at-started)/1700)*.025);}renderer.render(scene,camera);last=at;}
  frame=requestAnimationFrame(draw);
 }
 frame=requestAnimationFrame(draw);
 return {dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();models.dispose();environment?.dispose();shadowTexture.dispose();
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.clear();renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=0;
 }};
}
