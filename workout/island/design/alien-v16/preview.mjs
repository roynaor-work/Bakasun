// Original CC0-1.0 review UI. Imports existing repository libraries; no runtime integration.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
const manifest=await (await fetch('./animations.json')).json();
const animated=[];
function card(section,title){const el=document.createElement('article');el.className='card';const h=document.createElement('h3');h.textContent=title;el.append(h);document.querySelector(section).append(el);return el;}
for(const [name,a] of Object.entries(manifest.animations)){
 if(name==='timer-ring')continue;
 const el=card(name.startsWith('plasma')?'#plasma':'#player',name);
 const im=new Image();im.className='sprite';im.alt=name;im.src=a.frames[0];
 el.append(im);animated.push({im,a});
 for(const path of a.frames){const preload=new Image();preload.src=path;}
}
for(const name of ['spread','laser','rapid','shield','wing','nova']){
 const figure=document.createElement('figure');const im=new Image();im.src=`icons/bonus-${name}.png`;im.alt=`${name} token`;
 const caption=document.createElement('figcaption');caption.textContent=name;figure.append(im,caption);document.querySelector('#tokens').append(figure);
}
function timer(){const i=Number(document.querySelector('#timer-step').value);document.querySelector('#timer').src=manifest.animations['timer-ring'].frames[i];document.querySelector('#timer-label').textContent=`Step ${i+1} / 12`;}
document.querySelector('#timer-step').addEventListener('input',timer);timer();
for(const name of ['laser-zap','laser-hum-loop','plasma-shot','boss-alarm']){
 const el=card('#sounds',name),audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.volume=.55;audio.loop=name==='laser-hum-loop';audio.src=`audio/${name}.ogg`;el.append(audio);
}
const names=['boss-01-scout','boss-02-heavy','boss-03-weaver','boss-04-splitter','boss-05-carrier','boss-06-carrier-elite'];
const loader=new GLTFLoader(),views=[];const errors=[];
window.assetReview={loaded:[],errors,frames:0};
for(const name of names){
 try{
  const gltf=await loader.loadAsync(`models/${name}.glb`);
  const el=card('#bosses',name.replace('boss-',''));
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(320,220,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.className='ship';renderer.domElement.setAttribute('aria-label',name);el.append(renderer.domElement);
  const scene=new THREE.Scene();scene.add(gltf.scene);
  scene.add(new THREE.HemisphereLight(0xe1f3ff,0x253249,2.4));
  for(const [pos,power] of [[[4,8,6],3],[[-6,3,-3],2]]){const l=new THREE.DirectionalLight(0xe5f8ff,power);l.position.set(...pos);scene.add(l);}
  const camera=new THREE.PerspectiveCamera(35,320/220,.1,100);camera.position.set(8,11,12);camera.lookAt(0,.6,0);
  const button=document.createElement('button');button.textContent='Rotate';el.append(button);
  const v={renderer,scene,camera,root:gltf.scene,rotating:false,core:gltf.scene.getObjectByName('Core')};button.onclick=()=>{v.rotating=!v.rotating;button.textContent=v.rotating?'Stop rotation':'Rotate';};views.push(v);
  window.assetReview.loaded.push({name,nodes:['Core','Turret_L','Turret_R'].map(n=>Boolean(gltf.scene.getObjectByName(n)))});
 }catch(e){errors.push(`${name}: ${e.message}`);}
}
document.querySelector('#status').textContent=errors.length?errors.join('\n'):`${views.length} / 6 GLBs loaded`;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,last=0,time=0;
addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();paused=!paused;}});
function draw(ms){const dt=Math.min(.05,(ms-last)/1000);last=ms;if(!paused)time+=dt;
 for(const {im,a} of animated){const i=Math.floor(time*a.fps)%a.count;if(im.dataset.frame!==String(i)){im.src=a.frames[i];im.dataset.frame=String(i);}}
 for(const v of views){if(v.rotating&&!paused)v.root.rotation.y+=dt*.5;if(v.core)v.core.rotation.y=time*.5;v.renderer.render(v.scene,v.camera);}
 window.assetReview.frames++;requestAnimationFrame(draw);
}requestAnimationFrame(draw);
