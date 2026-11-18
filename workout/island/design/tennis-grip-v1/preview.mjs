// SPDX-License-Identifier: CC0-1.0
import * as T from 'three';
import {GLTFLoader} from '../soccer-motion-v8/runtime/vendor/GLTFLoader.js';
const $=s=>document.querySelector(s),canvas=$('#stage');
const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
const scene=new T.Scene();scene.background=new T.Color('#e7e8da');
scene.add(new T.HemisphereLight('#fff9e8','#778776',2.3));
for(const [p,intensity,color] of [[[2,5,4],3.1,'#fff4d9'],[[-3,3,-2],2.1,'#d8e8e4']]){const l=new T.DirectionalLight(color,intensity);l.position.set(...p);scene.add(l);}
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:'#dfe2d1',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.004;scene.add(floor);
const courtLine=new T.Mesh(new T.PlaneGeometry(6,.016),new T.MeshBasicMaterial({color:'#f8f6eb'}));courtLine.rotation.x=-Math.PI/2;courtLine.position.set(0,0,-.65);scene.add(courtLine);
const ring=new T.Mesh(new T.RingGeometry(.57,.575,80),new T.MeshBasicMaterial({color:'#a8b7a1',side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;scene.add(ring);
const shadowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(23,45,32,.35)');g.addColorStop(1,'rgba(23,45,32,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);})();
const shadow=new T.Mesh(new T.PlaneGeometry(1.15,.75),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;scene.add(shadow);
const camera=new T.PerspectiveCamera(31,1,.01,100);let target=new T.Vector3(0,1.0,0),azimuth=-.75,elevation=.15,distance=4.5,view='three';
const catalog=await fetch('runtime/catalog.json').then(r=>r.json());
const gltf=await new GLTFLoader().loadAsync('runtime/player.glb'),actor=gltf.scene;scene.add(actor);
const mixer=new T.AnimationMixer(actor),actions=Object.fromEntries(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
const head=actor.getObjectByName('head'),hand=actor.getObjectByName('RightHand');
let current=catalog.clips[0],time=0,playing=true,speed=1,ready=false;
const updateCamera=()=>{if(view==='grip'){hand.getWorldPosition(target);target.y+=.02;distance=.48;}camera.position.set(target.x+distance*Math.sin(azimuth)*Math.cos(elevation),target.y+distance*Math.sin(elevation),target.z+distance*Math.cos(azimuth)*Math.cos(elevation));camera.lookAt(target);};
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function render(){actor.updateMatrixWorld(true);updateCamera();renderer.render(scene,camera);}
function seek(t){time=Math.max(0,Math.min(current.duration,t));actions[current.id].time=time;mixer.update(0);$('#time').value=time/current.duration;$('#timestamp').textContent=time.toFixed(2)+' / '+current.duration.toFixed(2);render();}
function setView(name){view=name;target.set(0,current.id==='serve'?1.50:1.03,.04);distance=current.id==='serve'?6.4:4.5;elevation=.14;azimuth={three:-.75,front:0,side:-Math.PI/2,back:Math.PI,grip:-.80}[name]??-.75;if(name==='grip')elevation=.2;$('#views').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===name));render();}
function setClip(id){
 const next=catalog.clips.find(c=>c.id===id);if(!next)throw new Error('Unknown clip '+id);
 mixer.stopAllAction();current=next;const a=actions[id];a.reset().setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();setView(view);seek(0);
 $('#clip-title').textContent=current.label;$('#category').textContent=current.id.replaceAll('_',' ').toUpperCase();$('#status').textContent='אחיזה קבועה · '+current.duration.toFixed(1)+' שנ׳';
 $('#clips').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===id));
 $('#filmstrip').replaceChildren(...Array.from({length:8},(_,i)=>{const b=document.createElement('button'),im=document.createElement('img'),s=document.createElement('span');im.src='frames/'+id+'-'+i+'.webp';im.alt=current.label+' · פריים '+(i+1);s.textContent=(i*current.duration/7).toFixed(2)+' s';b.append(im,s);b.onclick=()=>{playing=false;$('#play').textContent='ניגון';seek(i*current.duration/7);};return b;}));
}
for(const clip of catalog.clips){const b=document.createElement('button');b.textContent=clip.label;b.dataset.id=clip.id;b.onclick=()=>setClip(clip.id);$('#clips').append(b);}
$('#views').onclick=e=>{if(e.target.dataset.view)setView(e.target.dataset.view);};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'עצירה':'ניגון';};
$('#time').oninput=e=>{playing=false;$('#play').textContent='ניגון';seek(Number(e.target.value)*current.duration);};$('#speed').onchange=e=>speed=Number(e.target.value);
let pointer=null;
canvas.onpointerdown=e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=()=>pointer=null;
canvas.onpointermove=e=>{if(!pointer)return;azimuth-=(e.clientX-pointer[0])*.007;elevation=T.MathUtils.clamp(elevation+(e.clientY-pointer[1])*.005,-.5,1.2);pointer=[e.clientX,e.clientY];render();};
canvas.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),.25,7);if(view==='grip')view='custom';render();};
new ResizeObserver(()=>{resize();render();}).observe(canvas);
const requestedClip=new URLSearchParams(location.search).get('clip')?.split('--').at(-1);
setClip(catalog.clips.some(c=>c.id===requestedClip)?requestedClip:'idle');resize();render();
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.08);last=now;if(playing)seek((time+dt*speed)%current.duration);});
window.tennisGrip={ready:true,actor,mixer,catalog,renderer,scene,camera,seek,setClip,setView,pause(){playing=false;$('#play').textContent='ניגון';},
 snapshot(){actor.updateMatrixWorld(true);let joints;actor.traverse(o=>{if(o.isSkinnedMesh)joints=o.skeleton.bones.map(b=>b.name);});return {clip:current.id,time,hand:hand.getWorldPosition(new T.Vector3()).toArray(),head:head.getWorldPosition(new T.Vector3()).toArray(),headInHand:hand.worldToLocal(head.getWorldPosition(new T.Vector3())).toArray(),racketScale:actor.getObjectByName('racket').getWorldScale(new T.Vector3()).toArray(),joints,drawCalls:renderer.info.render.calls};},
 renderAsset(width=384,height=440){const size=new T.Vector2();renderer.getSize(size);const ratio=renderer.getPixelRatio(),aspect=camera.aspect;renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();const url=canvas.toDataURL('image/webp',.89);renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();render();return url;}
};
