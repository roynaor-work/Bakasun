import * as T from '../../vendor/three.module.js';
import {createCourt} from './runtime/court.mjs';

const $=id=>document.getElementById(id),canvas=$('view');
const state={ready:false,surface:'clay',time:'day',lod:'high',camera:'game',paused:matchMedia('(prefers-reduced-motion: reduce)').matches,crowd:false,errors:[]};
window.courtsPreview={state};
let renderer,scene,camera,court,crowd,ball,elapsed=0,last=performance.now(),lastImpact=-1,token=0,crowdToken=0;
const manifest=await fetch('manifest.json').then(r=>{if(!r.ok)throw new Error(`Manifest ${r.status}`);return r.json()});
const descriptions={clay:'חימר חם, קווים נקיים ואבק קפיצה.',grass:'פסי כיסוח, קווים בהירים ונתזי עשב.',hard:'משטח כחול, אחיזה נקייה וצל כדור רך.'};
const views={game:[[0,12.8,25],[0,.4,-.7],40.3],court:[[0,21,23],[0,0,0],40.3],side:[[22,10,15],[0,1,0],46]};
function error(e){state.errors.push(String(e));$('error').textContent=`טעינת התצוגה נכשלה: ${e.message||e}`;$('error').hidden=false;state.ready=false;}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function view(name){state.camera=name;const [position,target,fov]=views[name];camera.position.fromArray(position);camera.lookAt(...target);camera.fov=fov;camera.updateProjectionMatrix();$('camera').value=name;}
function metrics(){return {...state,pngBytes:manifest.sets.find(s=>s.id===state.surface).payloadBytes,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,seats:court?.seats.length,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,viewport:[canvas.width,canvas.height]};}
function label(){const bytes=manifest.sets.find(s=>s.id===state.surface).payloadBytes;$('status').textContent=`${Math.ceil(bytes/1000)} KB לערכה · שני מפלסי יציע · CC0`;}
async function attachCrowd(){
  const mine=++crowdToken;crowd?.dispose();crowd=null;
  if(!state.crowd||!court)return;
  $('status').textContent='טוען 600 אוהדים מחבילת הקהל הקיימת…';
  try {
    const [{GLTFLoader},{createCrowd}]=await Promise.all([import('../../vendor/GLTFLoader.js'),import('../tennis-crowd-3d-v1/runtime/crowd.mjs')]);
    const next=await createCrowd({T,GLTFLoader,seats:court.seats,base:new URL('../tennis-crowd-3d-v1/',import.meta.url)});
    if(mine!==crowdToken||!state.crowd){next.dispose();return;}
    crowd=next;scene.add(crowd.root);label();
  }catch(e){if(mine===crowdToken){state.crowd=false;$('crowd').checked=false;$('status').textContent='חבילת הקהל אינה זמינה בעותק זה; המגרש מוכן.';}}
}
async function select(options={}){
  const mine=++token;state.ready=false;
  const nextState={surface:state.surface,time:state.time,lod:state.lod,...options};
  $('status').textContent='מכינים את המגרש…';
  try {
    const next=await createCourt({T,...nextState});
    if(mine!==token){next.dispose();return;}
    court?.dispose();court=next;scene.add(court.root);Object.assign(state,nextState);state.ready=true;
    $('time').value=state.time;$('lod').value=state.lod;$('description').textContent=descriptions[state.surface];
    document.querySelectorAll('[data-surface]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===state.surface)));
    label();await attachCrowd();render(elapsed);return metrics();
  }catch(e){if(mine===token)error(e);throw e;}
}
function render(seconds){
  if(!court)return;
  const phase=seconds%2,flight=phase/2;
  ball.position.set(Math.sin(seconds*.5)*2.4,.13+Math.sin(flight*Math.PI)*2.3,6-flight*12);
  const bounce=Math.floor(seconds/2);
  if(bounce!==lastImpact){court.impact(ball.position.x,ball.position.z);lastImpact=bounce;}
  court.update({seconds,ballPosition:ball.position.toArray(),camera});
  crowd?.update({seconds,celebration:0,ballPosition:ball.position.toArray()});renderer.render(scene,camera);
}
try {
  renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  scene=new T.Scene();scene.background=new T.Color('#648c9d');camera=new T.PerspectiveCamera(40.3,1,.1,180);
  ball=new T.Mesh(new T.IcosahedronGeometry(.13,2),new T.MeshStandardMaterial({color:'#e5ed72',roughness:.9}));scene.add(ball);
  view('game');resize();new ResizeObserver(resize).observe(canvas);
  window.courtsPreview={state,select,view,render,metrics,impact:()=>{court.impact(ball.position.x,ball.position.z);render(elapsed)},seats:()=>court.seats};
  document.querySelectorAll('[data-surface]').forEach(b=>b.addEventListener('click',()=>select({surface:b.dataset.surface}).catch(()=>{})));
  $('time').addEventListener('change',()=>select({time:$('time').value}).catch(()=>{}));
  $('lod').addEventListener('change',()=>select({lod:$('lod').value}).catch(()=>{}));
  $('camera').addEventListener('change',()=>view($('camera').value));
  $('pause').setAttribute('aria-pressed',String(state.paused));$('pause').textContent=state.paused?'המשך':'השהיה';
  $('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').setAttribute('aria-pressed',String(state.paused));$('pause').textContent=state.paused?'המשך':'השהיה';});
  $('impact').addEventListener('click',()=>{court.impact(ball.position.x,ball.position.z);render(elapsed+.12);});
  $('crowd').addEventListener('change',()=>{state.crowd=$('crowd').checked;attachCrowd().then(()=>render(elapsed));});
  await select();
  function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(!state.paused&&!document.hidden)elapsed+=dt;render(elapsed);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  addEventListener('pagehide',()=>{crowdToken++;token++;court?.dispose();crowd?.dispose();ball.geometry.dispose();ball.material.dispose();renderer.dispose();},{once:true});
}catch(e){error(e);}
