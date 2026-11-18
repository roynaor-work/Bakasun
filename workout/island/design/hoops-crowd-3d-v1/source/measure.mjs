/** CC0 reproducible software-render measurement; no project/test changes.
 * Serve the repository root at localhost:8765 first. Optional argument:
 * absolute path to an installed Khronos gltf-validator package.
 */
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {planCrowd} from '../runtime/lod-policy.mjs';
import {makeSeats,cameraPose} from '../scene.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('assets.json',root))),config=JSON.parse(await readFile(new URL('lod-config.json',root)));
const evidence={baseCommit:'d759582c171600dd7c7df7906c2fb38ae7f8b88a',models:[],policy:{},browser:{}};
const assert=(value,message)=>{if(!value)throw Error(message);};
const validator=process.argv[2]?require(process.argv[2]):null;
for(const asset of manifest.assets){
  const bytes=await readFile(new URL(asset.file,root));
  assert(bytes.length===asset.bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256,`Hash/size ${asset.file}`);
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const triangles=doc.accessors[doc.meshes[0].primitives[0].indices].count/3;
  assert(triangles===[210,90,24][asset.level],`Triangle count ${asset.file}`);
  assert(!doc.extensionsUsed.some(n=>/draco|meshopt/i.test(n))&&!doc.buffers[0].uri,'Unexpected codec/buffer');
  let errors=null,warnings=null;
  if(validator){const r=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.file});errors=r.issues.numErrors;warnings=r.issues.numWarnings;assert(!errors&&!warnings,JSON.stringify(r.issues));}
  evidence.models.push({file:asset.file,triangles,errors,warnings});
}
const seats=makeSeats(),snapshots=[];
for(const name of ['game','wide','side','rear'])for(const portrait of name==='game'?[false,true]:[false]){
  const p=cameraPose(name,portrait),forward=p.target.map((v,i)=>v-p.position[i]),{assignments,...summary}=planCrowd(seats,p.position,config,forward);snapshots.push({camera:name+(portrait?'-portrait':''),...summary});
}
let seed=31,max=0,min=Infinity;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<500;i++){
  const camera=i<301?[35*Math.cos(i/300*Math.PI*2),2+12*i/300,35*Math.sin(i/300*Math.PI*2)]:i===301?[seats[0].x,seats[0].y,seats[0].z]:[(random()-.5)*100,random()*35,(random()-.5)*100];
  const forward=i%2?camera.map(v=>-v):[random()-.5,random()-.5,random()-.5];
  const p=planCrowd(seats,camera,config,forward);
  assert(p.instances===800&&p.dominant.reduce((a,b)=>a+b,0)===800&&p.triangles<=70000,'Policy budget/count');
  assert(p.assignments.every(a=>Math.abs(a.weights.reduce((s,w)=>s+w,0)-1)<1e-10),'Missing fan');
  max=Math.max(max,p.triangles);min=Math.min(min,p.triangles);
}
evidence.policy={samples:500,minTriangles:min,maxTriangles:max,cameras:snapshots,all800Preserved:true,overlapFullyCounted:true};
evidence.policy.guardCases=[];
for(const [name,points,camera] of [
  ['no-direction',seats,[0,4,0]],
  ['coincident',seats.map(s=>({...s,x:0,y:0,z:0})),[0,0,0]]
]){
  const p=planCrowd(points,camera,config);
  assert(p.instances===800&&p.triangles<=70000&&p.scale<1,'Budget guard did not handle close seats');
  evidence.policy.guardCases.push({name,triangles:p.triangles,scale:p.scale,instances:p.instances});
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1}),errors=[],failed=[],external=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>failed.push(r.url()));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/'))external.push(r.url());});
const measurements=[];
try{
  await page.goto('http://127.0.0.1:8765/workout/island/design/hoops-crowd-3d-v1/preview.html?capture=1');
  await page.waitForFunction(()=>window.hoopsCrowd,null,{timeout:60000});
  evidence.browser.version=browser.version();
  evidence.browser.models=await page.evaluate(async()=>{
    const {GLTFLoader}=await import('../../vendor/GLTFLoader.js'),T=await import('../../vendor/three.module.js'),app=window.hoopsCrowd;
    let clips=0;
    for(const asset of app.crowd.manifest.assets){
      const loaded=await new GLTFLoader().loadAsync(new URL(asset.file,location.href).href),mesh=loaded.scene.children[0];
      if(mesh.geometry.getAttribute('_part').itemSize!==4||loaded.animations.length!==2)throw Error('Missing semantics/clips');
      const mixer=new T.AnimationMixer(loaded.scene);
      for(const clip of loaded.animations){const action=mixer.clipAction(clip);action.play();mixer.update(.18);if(!mesh.morphTargetInfluences.some(v=>v>.9))throw Error('Inactive clip');action.stop();clips++;}
      mixer.uncacheRoot(loaded.scene);mesh.geometry.dispose();mesh.material.dispose();
    }
    return {loaded:36,clipsExercised:clips,partsAttribute:true};
  });
  const views=[];
  for(const name of ['game','wide','side','rear'])views.push(await page.evaluate(name=>{
    const a=window.hoopsCrowd,m=a.setView(name);a.renderer.render(a.crowd.root,a.camera);
    return {...m,actualCrowdTriangles:a.renderer.info.render.triangles,actualCrowdDraws:a.renderer.info.render.calls};
  },name));
  assert(views.every(m=>m.actualCrowdTriangles===m.triangles&&m.actualCrowdDraws===m.draws),'Submitted crowd metrics differ from WebGL counters');
  evidence.browser.views=views;
  await page.evaluate(()=>{window.hoopsCrowd.pause();window.hoopsCrowd.setView('game');window.hoopsCrowd.setTime(0);});
  evidence.browser.motion=await page.evaluate(()=>{
    const a=window.hoopsCrowd,draw=(ball,seconds=0)=>{a.crowd.update({seconds,ballPosition:ball,pose:2,reducedMotion:true});a.renderer.render(a.scene,a.camera);return a.renderer.domElement.toDataURL();};
    const headChanged=draw([-12,6,0])!==draw([12,6,0]);
    a.crowd.onBasket({seconds:0,team:0});const basketChanged=draw([0,1,0],.2)!==draw([0,1,0],4);
    return {headChanged,basketChanged};
  });
  assert(evidence.browser.motion.headChanged&&evidence.browser.motion.basketChanged,'No visible head/basket response');
  await page.evaluate(()=>{document.getElementById('reduced').checked=false;});
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>window.hoopsCrowd.setView('game'));
    const result=await page.evaluate(()=>window.hoopsCrowd.benchmark({warmup:10,samples:60}));
    assert(result.canvas.width===viewport.width&&result.canvas.height===viewport.height,'Wrong measurement canvas');
    measurements.push(result);console.log(JSON.stringify({viewport,result:result.summary}));
  }
  await page.setViewportSize({width:1100,height:630});
  for(const name of ['game','gallery','levels']){
    await page.evaluate(name=>{window.hoopsCrowd.setView(name);window.hoopsCrowd.setTime(1);},name);
    await page.screenshot({path:`/tmp/hoops-${name}.png`});
  }
  // Standard UI, mobile overflow, color controls and all three poses.
  await page.goto('http://127.0.0.1:8765/workout/island/design/hoops-crowd-3d-v1/preview.html');await page.waitForFunction(()=>window.hoopsCrowd);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal mobile overflow');
  for(const pose of ['0','1','2'])await page.selectOption('#pose',pose);
  await page.selectOption('#variant','11');await page.evaluate(()=>{const input=document.getElementById('home');input.value='#62a33b';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#reduced');await page.click('#basket');
  evidence.browser.mobileOverflow=false;evidence.browser.controls=true;
  const wasmBlocked=await page.evaluate(()=>{try{new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));return false;}catch{return true;}});
  evidence.browser.wasmBlocked=wasmBlocked;
  assert(wasmBlocked&&!errors.length&&!failed.length&&!external.length,JSON.stringify({errors,failed,external}));
}finally{await browser.close();}
evidence.browser.errors=errors;evidence.browser.failed=failed;evidence.browser.external=external;
// Keep interval samples while avoiding insignificant floating-point verbosity.
const round=(k,v)=>typeof v==='number'&&(!v||Math.abs(v)>=.001)?Math.round(v*1000)/1000:v;
await writeFile(new URL('measurements.json',root),JSON.stringify(measurements,round)+'\n');
await writeFile(new URL('verification.json',root),JSON.stringify(evidence,round,2)+'\n');
execFileSync('python3',['-c',`from PIL import Image
from pathlib import Path
root=Path(${JSON.stringify(fileURLToPath(root))})
for name in ['game','gallery','levels']:
 im=Image.open('/tmp/hoops-'+name+'.png');im.thumbnail((1000,600));im.save(root/(name+'.webp'),quality=45,method=6)
`]);
async function byteSize(dir){let n=0;for(const f of await readdir(dir,{withFileTypes:true})){const p=new URL(f.name+(f.isDirectory()?'/':''),dir);n+=f.isDirectory()?await byteSize(p):(await stat(p)).size;}return n;}
const bytes=await byteSize(root);assert(bytes<=500000,`Package ${bytes} > 500000 bytes`);console.log(JSON.stringify({bytes,errors:errors.length,measurements:measurements.length,validated:!!validator}));
