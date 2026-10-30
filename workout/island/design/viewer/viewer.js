import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from './draco/DRACOLoader.js';
import {Retargeter} from './retarget.js';
import {MotionPlayer} from './animation.js';
import {runChecks} from './checks.js';

const $=id=>document.getElementById(id);
const getJSON=async url=>{const r=await fetch(new URL(url,import.meta.url));if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.json();};
const scene=new THREE.Scene();scene.background=new THREE.Color('#111e29');scene.fog=new THREE.Fog('#111e29',8,25);
scene.add(new THREE.HemisphereLight(0xd9f4ff,0x58666b,2.5));
const light=new THREE.DirectionalLight(0xffe7d2,3);light.position.set(3,5,4);scene.add(light);
const fill=new THREE.DirectionalLight(0x94dfff,1.6);fill.position.set(-3,2,-2);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x203947,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;scene.add(floor);
const grid=new THREE.GridHelper(200,400,0x658b9b,0x294a59);grid.position.y=.0001;scene.add(grid);
const camera=new THREE.PerspectiveCamera(34,1,.01,200);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label','דמות תלת ממד מונפשת');$('stage').prepend(renderer.domElement);
const draco=new DRACOLoader();draco.setDecoderPath(new URL('./draco/',import.meta.url).href);draco.setDecoderConfig({type:'wasm'});draco.setWorkerLimit(1);
const loader=new GLTFLoader();loader.setDRACOLoader(draco);
const datasets=new Map();
let model,rig,player,data,rigJSON,map,helper,currentCharacter,currentGame,paused=false,busy=false,report=null,yaw=.42,pitch=.15;
function resize(){const s=$('stage');renderer.setSize(s.clientWidth,s.clientHeight);camera.aspect=s.clientWidth/s.clientHeight;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe($('stage'));
export function render(){
  if(!rig)return;
  const p=rig.snapshot().bones.Root;
  const target=new THREE.Vector3(p[0],.72,p[2]);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*4.3,.7+pitch*2,Math.cos(yaw)*4.3));camera.lookAt(target);
  if(helper)helper.updateMatrixWorld(true);
  renderer.render(scene,camera);
}
function refreshUI(){
  if(!player)return;
  $('clip').value=player.state;
  $('seek').value=player.display.normalizedTime ?? Math.min(1,player.time/data.states[player.state].durationSeconds);
  $('clipInfo').textContent=`${player.state} · ${player.time.toFixed(2)} שנ׳ · ${player.fade?'ערבוב '+player.fade.transition.visualBlendSeconds+' שנ׳':data.states[player.state].loop?'לולאה':'קליפ יחיד'}`;
  $('telemetry').textContent=`${currentCharacter}\n${currentGame} / ${player.state}\n18 → 20 bones · ${rig.snapshot().vertexCount} vertices\nsole error: ${rig.snapshot().maxSupportErrorMeters.toFixed(4)} m\nfloor min Y: ${rig.snapshot().minY.toFixed(5)} m`;
}
async function selectGame(id){
  if(!datasets.has(id))datasets.set(id,await getJSON(`../motion/${id}.json`));
  currentGame=id;data=datasets.get(id);$('game').value=id;
  $('clip').replaceChildren(...Object.keys(data.states).map(n=>new Option(n,n)));
  $('events').replaceChildren(...data.eventInputs.map(n=>{const b=document.createElement('button');b.textContent=n;b.onclick=()=>{const t=player.event(n);$('status').textContent=t?`${t.source} ← ${t.target} · ${t.visualBlendSeconds} שנ׳ ערבוב`:`האירוע ${n} לא תקף במצב ${player.state}`;};return b;}));
  rebuild();
}
async function selectCharacter(id){
  const fresh=(await loader.loadAsync(new URL(`../characters/${id}.glb`,import.meta.url).href)).scene;
  if(model){scene.remove(model);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}if(helper){scene.remove(helper);helper.dispose();}
  currentCharacter=id;model=fresh;scene.add(model);$('character').value=id;
  helper=new THREE.SkeletonHelper(model);helper.visible=$('skeleton').checked;scene.add(helper);rebuild();
}
function rebuild(){if(!model||!data)return;if(rig?.scene===model)rig.resetBind();rig=new Retargeter(model,rigJSON,data.skeleton,map);player=new MotionPlayer(data,rig);refreshUI();render();}
function selectClip(id){if(!data.states[id])throw Error(`Unknown clip ${id}`);player.reset(id);refreshUI();render();}
function seek(seconds){player.reset(player.state,seconds);refreshUI();render();}
function showReport(r){$('results').replaceChildren(...Object.entries(r.checks).map(([n,c])=>{const d=document.createElement('div');d.className=c.pass?'pass':'fail';d.textContent=`${c.pass?'✓':'✗'} ${n}${n==='cpu'?` · ${c.meanMs.toFixed(2)} ms CPU`:''}`;return d;}));$('download').disabled=false;}
async function runAllChecks(options={}){
  busy=true;$('checks').disabled=true;
  try{
    if(options.character && options.character!==currentCharacter)await selectCharacter(options.character);
    if(options.game && options.game!==currentGame)await selectGame(options.game);
    report=await runChecks({data,rig,render,character:currentCharacter,game:currentGame,onProgress:text=>$('status').textContent=text});
    showReport(report);$('status').textContent=report.pass?'כל הבדיקות עברו.':'נמצאו בדיקות שנכשלו — פרטים מלאים בדוח JSON.';
    selectClip(data.initialState);return report;
  }finally{busy=false;$('checks').disabled=false;}
}
$('character').onchange=()=>selectCharacter($('character').value).catch(fail);$('game').onchange=()=>selectGame($('game').value).catch(fail);$('clip').onchange=()=>selectClip($('clip').value);
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'ניגון':'השהיה';};$('restart').onclick=()=>selectClip(player.state);
$('seek').oninput=()=>{paused=true;$('pause').textContent='ניגון';seek(+$('seek').value*data.states[player.state].durationSeconds);};
$('skeleton').onchange=()=>{helper.visible=$('skeleton').checked;render();};
$('checks').onclick=()=>runAllChecks().catch(fail);
$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download=`viewer-${currentCharacter}-${currentGame}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
let drag=null;renderer.domElement.onpointerdown=e=>{drag=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointerup=()=>drag=null;renderer.domElement.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.01;pitch=Math.max(-.2,Math.min(.9,pitch+(e.clientY-drag[1])*.005));drag=[e.clientX,e.clientY];render();};
function fail(e){$('status').className='fail';$('status').textContent=`שגיאה: ${e.message}. יש להגיש את התיקייה משרת מקומי; אין צורך בחיבור לאינטרנט.`;console.error(e);}
const ready=(async()=>{
  [rigJSON,map]=await Promise.all([getJSON('../characters/rig.json'),getJSON('./retarget-map.json')]);
  await selectGame('soccer');await selectCharacter('soccer-player');resize();$('status').textContent='מוכן. אפשר לבחור קליפ או לשלוח אירוע למכונת המצבים.';
  let last=performance.now();
  function tick(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!busy&&!paused&&player){
    player.step(dt*+$('speed').value,{autoFinish:$('auto').checked,moving:$('moving').checked});
    // The viewer may follow the reference path; the game itself owns root motion.
    grid.visible=$('trajectory').checked;
    refreshUI();render();
  }requestAnimationFrame(tick);}requestAnimationFrame(tick);
})();
ready.catch(fail);
window.viewerTest={ready,selectCharacter,selectGame,selectClip,seek,render,runAllChecks,pause:()=>{paused=true;},get player(){return player;},get rig(){return rig;}};
