import * as T from './vendor/three.module.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { buildCharacter,applyPose,applyBlend,groundModel,animationClips,countModel,numericalSnapshot,POSE_EXPRESSIONS,applyExpression,blendExpression,setExpressionWeights,expressionWeights } from './rig.mjs';

import { EXPRESSION_IDS,EXPRESSION_LIST } from './parts/expressions.mjs';

const params=new URLSearchParams(location.search);const capture=params.has('capture');
if(capture)document.body.classList.add('capture');
const canvas=document.querySelector('#stage'),scene=new T.Scene();scene.background=new T.Color('#eae7e2');
// Phone buffers already scale to .6; avoid an additional multisample resolve.
// Full-resolution comparison captures retain MSAA for both before and after.
const comparisonBuffer=innerWidth>=600||params.get('resolution')==='full';
const renderer=new T.WebGLRenderer({canvas,antialias:comparisonBuffer,preserveDrawingBuffer:comparisonBuffer});
renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const camera=new T.OrthographicCamera();camera.position.set(0,1.33,7);camera.lookAt(0,1.33,0);camera.near=.1;camera.far=30;
scene.add(new T.HemisphereLight('#fff5eb','#9da8be',1));
for(const [p,c,i]of [[[-3,4.5,5],'#fff2e1',3.10],[[3,2,3],'#e3edff',1.35],[[1,3,-4],'#fff5e5',2]]){
 const light=new T.DirectionalLight(c,i);light.position.set(...p);scene.add(light);
}
// One deterministic soft contact shadow. No per-frame shadow pass competes
// with phone skinning; this identical floor is used in every quality and GLB.
const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=128;
const ctx=textureCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,3,64,64,62);gradient.addColorStop(0,'rgba(45,52,64,.20)');gradient.addColorStop(1,'rgba(45,52,64,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
const shadow=new T.Mesh(new T.PlaneGeometry(1.45,.9),new T.MeshBasicMaterial({map:new T.CanvasTexture(textureCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.003;scene.add(shadow);
const holder=new T.Group();scene.add(holder);let source,loaded,current,clips,mixer,playing=false,frame=0,pose='stand',view='front',quality=params.get('quality')||'mobile',transition,expression=params.get('expression')||'neutral';
const label=document.querySelector('#source-label');
function render(){current.root.updateMatrixWorld(true);current.skeleton.update();renderer.render(scene,camera);}
function resize(){const {width,height}=canvas.getBoundingClientRect(),aspect=width/height,vertical=Math.max(3.05,1.65/aspect);camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;camera.updateProjectionMatrix();renderer.setPixelRatio(width<600&&params.get('resolution')!=='full'?.6:1);renderer.setSize(width,height,false);if(current)render();}
function linkedExpressions(){return document.querySelector('#pose-expression')?.checked??true;}
function expressionChanged(id){expression=id;const select=document.querySelector('#expression');if(select)select.value=id;document.dispatchEvent(new CustomEvent('expressionchange',{detail:{expression:id,weights:expressionWeights(current.root)}}));}
function syncExpression(){const weights=expressionWeights(current.root),id=EXPRESSION_IDS.find(id=>weights[id]>.999999)||(Object.values(weights).every(v=>v<1e-8)?'neutral':'blend');if(expression!==id)expressionChanged(id);}
function metrics(){const counts=countModel(current.root),meta=current.root.userData.buildMs?current.root.userData:current.root.getObjectByName('Kid')?.userData;return {...counts,buildMs:meta?.buildMs,detail:quality,bones:current.bones.length,renderCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,headHeight:1,viewport:{cssWidth:canvas.getBoundingClientRect().width,cssHeight:canvas.getBoundingClientRect().height,width:canvas.width,height:canvas.height,dpr:devicePixelRatio,renderScale:renderer.getPixelRatio(),antialias:renderer.getContext().getContextAttributes().antialias,preserveDrawingBuffer:renderer.getContext().getContextAttributes().preserveDrawingBuffer},camera:{position:camera.position.toArray(),target:[0,1.33,0],vertical:camera.top*2},source:current===source?'procedural':'GLB',expression,expressionWeights:expressionWeights(current.root)};}
function stats(){const m=metrics();document.querySelector('#stats').textContent=`${m.modelTriangles.toLocaleString('he-IL')} משולשים · ${m.bones} עצמות · ${m.renderCalls} קריאות ציור\nזמן בנייה: ${m.buildMs?.toFixed(1)??'—'} ms`;}
function dispose(root){const g=new Set(),m=new Set(),t=new Set();root.traverse(o=>{if(!o.isMesh)return;g.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material]){m.add(mat);if(mat.map)t.add(mat.map);}});g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());t.forEach(x=>x.dispose());}
function stop(){const active=playing||transition;playing=false;transition=null;cancelAnimationFrame(frame);if(active)document.querySelector('#play').textContent='ניגון התנוחה';}
function setQuality(detail){const face=current?expressionWeights(current.root):{};stop();if(source){holder.remove(source.root);dispose(source.root);}if(loaded){holder.remove(loaded.root);dispose(loaded.root);loaded=null;}quality=detail;source=buildCharacter({detail,experiment:params.get('experiment')||'final'});current=source;holder.add(source.root);clips=animationClips(source);mixer=new T.AnimationMixer(source.root);applyPose(current,pose);setExpressionWeights(current.root,face);syncExpression();document.querySelector('#quality').value=detail;label.textContent='מודל מקור';render();stats();return metrics();}
function setView(id){if(!{front:1,side:1,back:1,threeQuarter:1}[id])throw Error('Invalid view');view=id;holder.rotation.y={front:0,side:-Math.PI/2,back:-Math.PI,threeQuarter:-Math.PI/4}[id];for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',b.dataset.view===id);render();}
function setPose(id,immediate=true){
 stop();pose=id;for(const b of document.querySelectorAll('[data-pose]'))b.setAttribute('aria-pressed',b.dataset.pose===id);
 const faceStart=expressionWeights(current.root),targetExpression=linkedExpressions()?POSE_EXPRESSIONS[id]:expression;
 if(immediate){applyPose(current,id);if(linkedExpressions())applyExpression(current.root,targetExpression);else setExpressionWeights(current.root,faceStart);syncExpression();render();return;}
 // Capture the actual current state so a second click during a transition,
 // or a click after a manual blend, continues smoothly from that state.
 const start=current.bones.map(b=>b.quaternion.clone()),ballStart=current.ball.scale.x;
 applyPose(current,id);if(linkedExpressions())applyExpression(current.root,targetExpression);else setExpressionWeights(current.root,faceStart);const faceEnd=expressionWeights(current.root);expressionChanged(targetExpression);const target=current.bones.map(b=>b.quaternion.clone()),ballEnd=current.ball.scale.x;
 current.bones.forEach((b,i)=>b.quaternion.copy(start[i]));current.ball.scale.setScalar(ballStart);setExpressionWeights(current.root,faceStart);groundModel(current);
 const started=performance.now();transition={id,started};
 function tick(now){if(!transition)return;const x=Math.min((now-started)/850,1),s=x*x*(3-2*x);
  current.bones.forEach((b,i)=>b.quaternion.copy(start[i]).slerp(target[i],s));current.ball.scale.setScalar(T.MathUtils.lerp(ballStart,ballEnd,s));
  setExpressionWeights(current.root,Object.fromEntries(EXPRESSION_IDS.map(id=>[id,T.MathUtils.lerp(faceStart[id],faceEnd[id],s)])));
  current.byName.Hips.position.y=.88*.93;groundModel(current);render();if(x<1)frame=requestAnimationFrame(tick);else transition=null;
 }
 frame=requestAnimationFrame(tick);
}
function setBlend(from,to,t,draw=true){stop();const face=expressionWeights(current.root);applyBlend(current,from,to,t);if(!linkedExpressions())setExpressionWeights(current.root,face);if(draw){syncExpression();render();}}
function setExpression(id,immediate=true){
 if(id!=='neutral'&&!EXPRESSION_IDS.includes(id))throw Error('Invalid expression: '+id);
 stop();const start=expressionWeights(current.root);applyExpression(current.root,id);const end=expressionWeights(current.root);expressionChanged(id);
 if(immediate){render();return;}
 setExpressionWeights(current.root,start);const started=performance.now();transition={started,expression:id};
 function tick(now){if(!transition)return;const t=Math.min((now-started)/850,1),s=t*t*(3-2*t);setExpressionWeights(current.root,Object.fromEntries(EXPRESSION_IDS.map(id=>[id,T.MathUtils.lerp(start[id],end[id],s)])));render();if(t<1)frame=requestAnimationFrame(tick);else transition=null;}
 frame=requestAnimationFrame(tick);
}
function setExpressionBlend(from,to,t,draw=true){stop();blendExpression(current.root,from,to,t);if(draw){syncExpression();render();}}
async function exportGLB(){
 stop();const savedFace=expressionWeights(source.root);applyPose(source,'stand');
 // Build clips while their face meshes and bones still belong to source.root.
 // Detaching first empties the traversal and silently drops every weight track.
 const exportClips=animationClips(source);
 // Skin nodes belong directly to the glTF scene. This avoids an extra parent
 // transform, which glTF defines differently for skinned and rigid meshes.
 const exporting=new T.Scene();exporting.name='Kid';exporting.userData={...source.root.userData};
 const children=[...source.root.children];for(const child of children)exporting.add(child);
 exporting.updateMatrixWorld(true);source.skeleton.update();
 try{return await new GLTFExporter().parseAsync(exporting,{binary:true,animations:exportClips,onlyVisible:false});}
 finally{for(const child of children)source.root.add(child);applyPose(current,pose);setExpressionWeights(source.root,savedFace);syncExpression();render();}
}
async function loadGLB(url){const savedFace=expressionWeights(current.root);stop();const loader=new GLTFLoader(),data=typeof url==='string'?await loader.loadAsync(url):await loader.parseAsync(url,'');if(loaded){holder.remove(loaded.root);dispose(loaded.root);}const root=data.scene,byName={},bones=[];root.traverse(o=>{if(o.isBone){byName[o.name]=o;bones.push(o);}});const skin=root.getObjectByProperty('isSkinnedMesh',true);if(!skin)throw Error('GLB has no skin');loaded={root,byName,bones,skeleton:skin.skeleton,ball:root.getObjectByName('Ball'),getExpressionWeights(){return expressionWeights(root);},setExpressionWeights(weights){return setExpressionWeights(root,weights);},get expressionMeshes(){const meshes=[];root.traverse(m=>{if(m.morphTargetInfluences)meshes.push(m);});return meshes;},setExpression(id){applyExpression(root,id);},setExpressionBlend(from,to,t){blendExpression(root,from,to,t);}};holder.remove(source.root);current=loaded;holder.add(root);mixer=new T.AnimationMixer(root);clips=data.animations;applyPose(current,pose);setExpressionWeights(current.root,savedFace);syncExpression();label.textContent='GLB שנטען מחדש';render();stats();return {clips:clips.map(c=>c.name),bones:bones.length,...countModel(root)};}
function useSource(){const savedFace=expressionWeights(current.root);stop();if(loaded)holder.remove(loaded.root);current=source;holder.add(source.root);clips=animationClips(source);mixer=new T.AnimationMixer(source.root);applyPose(source,pose);setExpressionWeights(source.root,savedFace);syncExpression();label.textContent='מודל מקור';render();stats();}
function play(){if(playing){stop();return;}stop();playing=true;const action=mixer.clipAction(clips.find(c=>c.name===pose));mixer.stopAllAction();action.reset().play();let last=performance.now();document.querySelector('#play').textContent='עצירה';function tick(now){if(!playing)return;const face=expressionWeights(current.root);mixer.update(Math.min((now-last)/1000,.1));if(!linkedExpressions())setExpressionWeights(current.root,face);last=now;render();frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);}
function sampleClip(id,seconds){stop();mixer.stopAllAction();mixer.clipAction(clips.find(c=>c.name===id)).reset().play();mixer.setTime(seconds);syncExpression();render();}
window.lab={scene,renderer,camera,get model(){return current;},get activeRoot(){return current.root;},setView,setQuality,setPose,setBlend,setExpression,setExpressionBlend,render,metrics,exportGLB,loadGLB,useSource,snapshot:()=>numericalSnapshot(current),clips:()=>clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),sampleClip,play,stop,expressions:()=>EXPRESSION_LIST};
window.labReady=Promise.resolve().then(()=>{resize();setQuality(quality);setView(params.get('view')||'front');setPose(params.get('pose')||'stand');if(params.has('expression'))setExpression(params.get('expression'));return true;});
for(const b of document.querySelectorAll('[data-pose]'))b.onclick=()=>setPose(b.dataset.pose,matchMedia('(prefers-reduced-motion:reduce)').matches);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>setView(b.dataset.view);
document.querySelector('#quality').onchange=e=>setQuality(e.target.value);
document.querySelector('#blend').oninput=e=>setBlend(document.querySelector('#from').value,document.querySelector('#to').value,Number(e.target.value)/100);
document.querySelector('#play').onclick=play;document.querySelector('#load').onclick=()=>loadGLB('./kid-full.glb').catch(e=>{document.querySelector('#stats').textContent='טעינת הקובץ נכשלה: '+e.message;});document.querySelector('#original').onclick=useSource;
new ResizeObserver(resize).observe(canvas.parentElement);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',stop);
window.addEventListener('pagehide',()=>{stop();if(source)dispose(source.root);if(loaded)dispose(loaded.root);renderer.dispose();});

const expressionSelect=document.querySelector('#expression');
if(expressionSelect)expressionSelect.onchange=e=>{const linked=document.querySelector('#pose-expression');if(linked)linked.checked=false;setExpression(e.target.value,matchMedia('(prefers-reduced-motion:reduce)').matches);};
const expressionBlend=document.querySelector('#expression-blend');
if(expressionBlend)expressionBlend.oninput=e=>{const linked=document.querySelector('#pose-expression');if(linked)linked.checked=false;setExpressionBlend(document.querySelector('#expression-from').value,document.querySelector('#expression-to').value,Number(e.target.value)/100);};
const poseExpression=document.querySelector('#pose-expression');
if(poseExpression)poseExpression.onchange=()=>{if(poseExpression.checked)setExpression(POSE_EXPRESSIONS[pose],matchMedia('(prefers-reduced-motion:reduce)').matches);};
