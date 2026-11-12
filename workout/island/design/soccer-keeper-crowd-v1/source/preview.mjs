// SPDX-License-Identifier: CC0-1.0. Decode-free native GLB playback on the canonical keeper.
import * as T from 'three';
import {GLTFLoader} from '../../../vendor/GLTFLoader.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#dce4df');
const camera=new T.PerspectiveCamera(34,1,.05,30);const views={threeQuarter:[2.5,1.65,3.7],front:[0,1.45,4.4],side:[4.2,1.4,.1]};
function setView(name){camera.position.fromArray(views[name]);camera.lookAt(0,.85,.12);}
setView('threeQuarter');scene.add(new T.HemisphereLight(0xffffff,0x566c5c,2.1));
const light=new T.DirectionalLight(0xfff6df,3);light.position.set(-2,5,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=3;light.shadow.camera.bottom=-2;scene.add(light);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x8da99a,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const line=new T.Mesh(new T.PlaneGeometry(1.8,.018),new T.MeshBasicMaterial({color:0xe9eddb}));line.rotation.x=-Math.PI/2;line.position.set(0,.001,.43);scene.add(line);
const loader=new GLTFLoader(),root=new URL('../',import.meta.url),errors=[];let model,mixer,action,current,time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=performance.now(),ready=false;
const catalog=await fetch(new URL('runtime/catalog.json',root)).then(r=>{if(!r.ok)throw Error('Catalog '+r.status);return r.json();});
const cache=new Map();
function resize(){const{width,height}=canvas.getBoundingClientRect();if(canvas.width!==Math.round(width*renderer.getPixelRatio())||canvas.height!==Math.round(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}}
function render(){resize();if(mixer){mixer.setTime(time);model.updateMatrixWorld(true);}renderer.render(scene,camera);$('time').textContent=`${time.toFixed(2)} / ${current?.duration.toFixed(2)??'0.00'} s`;$('seek').value=current?time/current.duration:0;}
async function select(id){ready=false;current=catalog.clips.find(c=>c.id===id);if(!current)throw Error('Unknown clip '+id);$('clip').value=id;time=0;
 if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(current.animation,root).href));const loaded=await cache.get(id);mixer.stopAllAction();action=mixer.clipAction(loaded.animations[0]);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 $('clip-info').textContent=`${current.duration} שנ׳ · ${current.frameCount} דגימות · 30 הרץ${current.metadata.loop?' · לולאה':''}`;$('events').textContent=current.metadata.events.filter(e=>!['plant'].includes(e.type)).map(e=>`${e.type} ${e.time.toFixed(2)}s`).join(' · ');$('status').textContent='';ready=true;render();}
function setTime(t){time=Math.max(0,Math.min(current.duration,t));if(action){action.reset().play();}render();}
$('clip').innerHTML=catalog.clips.map(c=>`<option value="${c.id}">${c.metadata.label}</option>`).join('');
$('clip').addEventListener('change',()=>select($('clip').value).catch(fail));$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'השהיה':'ניגון';};$('restart').onclick=()=>setTime(0);$('seek').oninput=()=>{playing=false;$('play').textContent='ניגון';setTime(Number($('seek').value)*current.duration);};$('view').onchange=()=>{setView($('view').value);render();};
function fail(e){errors.push(e.message);$('status').textContent='שגיאת טעינה: '+e.message;console.error(e);}
try{const loaded=await loader.loadAsync(new URL('runtime/keeper.glb',root).href);model=loaded.scene;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});scene.add(model);mixer=new T.AnimationMixer(model);const requested=(new URLSearchParams(location.search).get('clip')??'').replace('soccer-keeper-crowd-v1--','');await select(catalog.clips.some(c=>c.id===requested)?requested:catalog.clips[0].id);}catch(e){fail(e);}
const crowd=await fetch(new URL('runtime/crowd-manifest.json',root)).then(r=>r.json());
for(let i=0;i<16;i++){const figure=document.createElement('figure');figure.className='crowd-pair';figure.innerHTML=`<figcaption>וריאציה ${String(i).padStart(2,'0')}</figcaption><div class="pair"></div><div class="caption"><span>מקור</span><span>ידיים למעלה</span></div>`;
 for(const pose of ['original','hands_up']){const entry=crowd.cells.find(c=>c.variant===i&&c.pose===pose),div=document.createElement('div');div.className='cell';div.role='img';div.setAttribute('aria-label',`וריאציה ${i} ${pose==='original'?'מקור':'שתי ידיים למעלה'}`);div.style.backgroundPosition=`${entry.pixelRect.x/768*100}% ${entry.pixelRect.y/1792*100}%`;figure.querySelector('.pair').append(div);}$('crowd-grid').append(figure);}
window.keeperPreview={get ready(){return ready;},get errors(){return errors;},catalog,select,setTime,setView(name){setView(name);render();},pause(){playing=false;$('play').textContent='ניגון';},get matrices(){const bones=[];model?.traverse(o=>{if(o.isBone)bones.push({name:o.name,position:new T.Vector3().setFromMatrixPosition(o.matrixWorld).toArray(),matrix:o.matrixWorld.elements});});return bones;}};
function tick(now){if(playing&&ready){time+=(now-last)/1000;if(time>current.duration){time=0;action.reset().play();}}last=now;render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
