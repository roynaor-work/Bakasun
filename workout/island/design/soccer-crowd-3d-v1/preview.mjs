/** CC0. Review harness and reproducible RAF comparison. No production integration. */
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {createSoccerCrowd} from './runtime/crowd.mjs';
import {makeSeats,makeVenue,makeAtlasCrowd} from './scene.mjs';

const $=id=>document.getElementById(id), number=n=>Math.round(n).toLocaleString('he');
const seats=makeSeats(), scene=new T.Scene(), camera=new T.PerspectiveCamera(42,1,.1,240);
scene.background=new T.Color('#7d9592');
const renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
const venue=makeVenue(T,seats);scene.add(venue.root);
const [crowd,atlas]=await Promise.all([
  createSoccerCrowd({T,GLTFLoader,seats}),makeAtlasCrowd(T,seats)
]).catch(error=>{$('status').textContent=`טעינה נכשלה: ${error.message}`;throw error;});
scene.add(crowd.root,atlas.root);
const galleryRenderer=new T.WebGLRenderer({canvas:$('catalog'),antialias:true});
galleryRenderer.setPixelRatio(1);galleryRenderer.outputColorSpace=T.SRGBColorSpace;
const galleryScene=new T.Scene();galleryScene.background=new T.Color('#172a37');
const galleryCamera=new T.PerspectiveCamera(36,1,.05,30);galleryCamera.position.set(0,1.45,6);galleryCamera.lookAt(0,.9,0);
let galleryModels=[],mode='after',view='soccer',pose=-1,seconds=0,paused=false,measuring=false;
let lastTime=null,lastUI=0,goalUntil=-1,latestMeasurement=null,frameId=0,manualCelebration=null,manualBall=null;
for(let i=0;i<12;i++)$('variant').add(new Option(`${i+1} · ${i<6?'יושב':'עומד'}`,String(i)));

function setGallery() {
  for(const mesh of galleryModels){galleryScene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  galleryModels=[];
  const variant=Number($('variant').value),p=Number($('catalogPose').value),yaw=Number($('angle').value)*Math.PI/180;
  for(let level=0;level<3;level++) {
    const source=crowd.sources[level*12+variant],g=source.geometry.clone(),m=source.material.clone();
    // Bake shirt vertex colors for the native glTF gallery, independent of the
    // instancing shader. Skin/hair remain untouched. Native morphs stay active.
    const colors=g.attributes.color,shirt=g.attributes._shirt;
    const tint=new T.Color(level===1?$('away').value:$('home').value);
    const values=new Float32Array(colors.count*4);
    for(let i=0;i<colors.count;i++) {
      const c=shirt.getX(i)?tint:new T.Color(1,1,1);
      values.set([colors.getX(i)*c.r,colors.getY(i)*c.g,colors.getZ(i)*c.b,1],i*4);
    }
    g.setAttribute('color',new T.BufferAttribute(values,4));
    const mesh=new T.Mesh(g,m);mesh.position.x=(level-1)*1.65;mesh.rotation.y=yaw;
    mesh.morphTargetInfluences=[p===1?1:0,p===2?1:0];galleryScene.add(mesh);galleryModels.push(mesh);
  }
}

function setCamera() {
  const aspect=camera.aspect;
  if(view==='soccer') {
    const portrait=aspect<1,angle=(portrait?40:28)*Math.PI/180,d=portrait?21:15;
    camera.position.set(0,d*Math.sin(angle),-12+d*Math.cos(angle));camera.lookAt(0,0,-12);
  } else if(view==='overview') {camera.position.set(44,43,53);camera.lookAt(0,1,0);}
  else if(view==='close') {camera.position.set(2,3.7,-14.6);camera.lookAt(0,2.1,-19.2);}
  else {camera.position.set(4,6,-30);camera.lookAt(0,2,-19);}
  camera.updateMatrixWorld();crowd.setCamera(camera.position.toArray());
  $('viewLabel').textContent=view==='soccer'?`מצלמת המשחק · 42° · ${aspect<1?'40° גובה':'28° גובה'}`:
    {overview:'מבט על · כל 1,200 המושבים',close:'תקריב לבדיקת נפח ותנועה',rear:'בדיקת גב וראש עוקב'}[view];
}
function resize() {
  if(measuring)return;
  const canvas=$('view'),w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();setCamera();
  const g=$('catalog');galleryRenderer.setSize(g.clientWidth,g.clientHeight,false);
  galleryCamera.aspect=g.clientWidth/g.clientHeight;galleryCamera.updateProjectionMatrix();
}
function setMode(next) {mode=next;crowd.root.visible=mode==='after';atlas.root.visible=mode==='before';$('mode').value=next;}
function currentMetrics() {return mode==='after'?crowd.metrics:atlas.metrics;}
function renderAt(time,celebration) {
  const ball=paused&&!measuring&&manualBall?manualBall:[Math.sin(time*.55)*13,.28,-10+Math.cos(time*.43)*2.5];
  venue.ball.position.fromArray(ball);venue.marker.position.set(ball[0],.025,ball[2]);
  crowd.update({seconds:time,celebration,ballPosition:ball,pose});atlas.update(time,celebration);
  renderer.render(scene,camera);
}
function updateUI(fps) {
  const m=currentMetrics();$('instances').textContent=number(m.instances);$('triangles').textContent=number(m.triangles);
  $('draws').textContent=m.draws;$('fps').textContent=fps.toFixed(1);
  $('lod').textContent=mode==='after'?`LOD פעילים: ${m.submitted.join(' / ')} · בחפיפה: ${m.overlapping}`:'אטלס · 2 משולשים למופע';
}
function animate(now) {
  frameId=requestAnimationFrame(animate);
  if(measuring)return;
  const frameSeconds=lastTime===null?0:(now-lastTime)/1000,dt=Math.min(.25,frameSeconds);lastTime=now;
  if(!paused)seconds+=dt;
  renderAt(seconds,paused&&manualCelebration!==null?manualCelebration:seconds<goalUntil?1:0);
  if(!paused && Number($('catalogPose').value)===2) for(const m of galleryModels)m.morphTargetInfluences[1]=.68+.32*(.5+.5*Math.cos(seconds*11));
  galleryRenderer.render(galleryScene,galleryCamera);
  if(now-lastUI>500){updateUI(frameSeconds?1/frameSeconds:0);lastUI=now;}
}
function environment() {
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    canvas:[renderer.domElement.width,renderer.domElement.height],dpr:renderer.getPixelRatio(),
    camera:{preset:view,position:camera.position.toArray(),fov:camera.fov,aspect:camera.aspect}};
}
const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function summarize(samples) {
  const sorted=[...samples].sort((a,b)=>a-b),ms=samples.reduce((a,b)=>a+b,0);
  return {frames:samples.length,totalMs:ms,fps:samples.length*1000/ms,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]};
}
async function benchmark({frames=90,warmup=20}={}) {
  if(measuring)throw new Error('Measurement in progress');
  measuring=true;
  const previous={mode,view,pose,paused},controls=[...document.querySelectorAll('button,select,input')];
  const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  const runs=[],env=environment();
  try {
    // Freeze camera, use the same deterministic clock/goal strength each run.
    pose=-1;
    for(const kind of ['before','after','after','before']) {
      setMode(kind);$('status').textContent=`מודד ${kind==='before'?'אטלס':'תלת־ממד'} · סבב ${runs.length+1}/4`;
      for(let i=0;i<warmup;i++){renderAt(i/30,.75);await raf();}
      const samples=[],submit=[];
      let last=await raf();
      for(let i=0;i<frames;i++) {
        const start=performance.now();renderAt(i/30,.75);submit.push(performance.now()-start);
        const now=await raf();samples.push(now-last);last=now;
      }
      const m=structuredClone(currentMetrics());
      runs.push({mode:kind,...summarize(samples),crowd:m,
        sceneTriangles:renderer.info.render.triangles,sceneDraws:renderer.info.render.calls,
        rafMs:samples,submitMs:submit});
    }
    latestMeasurement={schema:1,date:new Date().toISOString(),fixture:'matched 1200-seat atlas / 3D asset preview; not the full game',
      environment:env,frames,warmup,order:'ABBA',celebration:.75,runs};
    $('results').replaceChildren();
    for(const kind of ['before','after']) {
      const selected=runs.filter(r=>r.mode===kind),all=selected.flatMap(r=>r.rafMs),sum=summarize(all),r=selected[0];
      const row=$('results').insertRow();
      for(const text of [kind==='before'?'לפני · אטלס':'אחרי · 3D',number(r.crowd.triangles),number(r.sceneTriangles),r.sceneDraws,sum.fps.toFixed(2),`${sum.p95Ms.toFixed(1)} ms`])row.insertCell().textContent=text;
    }
    return latestMeasurement;
  } finally {
    controls.forEach((c,i)=>c.disabled=disabled[i]);measuring=false;pose=previous.pose;paused=previous.paused;setMode(previous.mode);
    $('download').disabled=!latestMeasurement;$('status').textContent='המדידה הסתיימה. נתונים מלאים זמינים להורדה.';lastTime=null;resize();
  }
}

$('mode').onchange=()=>setMode($('mode').value);
$('camera').onchange=()=>{view=$('camera').value;setCamera();};
$('pose').onchange=()=>{pose=Number($('pose').value);};
$('goal').onclick=()=>{goalUntil=seconds+5;paused=false;manualCelebration=null;$('pause').textContent='עצירת תנועה';};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'המשך תנועה':'עצירת תנועה';};
for(const id of ['home','away'])$(id).oninput=()=>{crowd.setTeamColors($('home').value,$('away').value);setGallery();};
for(const id of ['variant','angle','catalogPose'])$(id).oninput=setGallery;
$('measure').onclick=()=>benchmark().catch(error=>{$('status').textContent=error.message;});
$('download').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(latestMeasurement,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='soccer-crowd-measurements.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('resize',resize);
setGallery();setMode('after');resize();
$('measure').disabled=false;$('status').textContent=`מוכן · ${number(crowd.manifest.payloadBytes)} בתים ב־36 מודלים · ללא מפענח`;
window.crowdPreview={ready:true,T,seats,crowd,atlas,renderer,camera,scene,galleryModels:()=>galleryModels,
  benchmark,environment,setMode,setView(next){view=next;$('camera').value=next;setCamera();},
  render(time=0,celebration=0,ballPosition=null){paused=true;seconds=time;manualCelebration=celebration;manualBall=ballPosition;renderAt(time,celebration);},
  metrics:()=>({mode,...structuredClone(currentMetrics()),sceneTriangles:renderer.info.render.triangles,sceneDraws:renderer.info.render.calls}),
  dispose(){cancelAnimationFrame(frameId);crowd.dispose();atlas.dispose();venue.dispose();galleryRenderer.dispose();renderer.dispose();}};
frameId=requestAnimationFrame(animate);
