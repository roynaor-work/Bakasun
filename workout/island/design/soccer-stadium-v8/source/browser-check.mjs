// Runtime contracts and lifecycle, against the shipped files in a real browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const lines=[],errors=[],external=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page.setDefaultTimeout(45_000);
  page.on('console',message=>{if(message.text().startsWith('CHECK '))console.log(message.text());});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==base)external.push(r.url());});
  await page.goto(`${base}/preview.html?capture=1`,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  const contracts=await page.evaluate(async()=>{
    const {THREE,loadStadium}=await import('/runtime/stadium.mjs'),{createBroadcastHUD}=await import('/runtime/broadcast.mjs');
    const {LEVELS,crowdPlacements}=await import('/runtime/layout.mjs');
    const r=window.stadiumReview;r.stop();const results=[],check=(truth,message)=>{if(!truth)throw new Error(message);results.push(message);};
    for(let i=0;i<3;i++){
      r.setView('main',{lod:i});r.render(0);const m=r.metrics();
      check(r.stadium.levels.filter(g=>g.visible).length===1,`LOD${i}: exactly one visible group`);
      check(m.runtime.total<=40_000&&m.submitted<=m.runtime.total,`LOD${i}: renderer submissions within conservative complete count`);
      r.stadium.root.updateMatrixWorld(true);let floor;
      r.stadium.levels[i].traverse(node=>{if(node.isMesh&&node.userData.part==='Bowl'&&node.material.name==='Seats')floor=node;});
      check(!!floor,`LOD${i}: a continuous bank supports the audience`);
      const cards=crowdPlacements(LEVELS[i]),stride=Math.max(1,Math.floor(cards.length/96)),ray=new THREE.Raycaster();
      for(let n=0;n<cards.length;n+=stride){
        const card=cards[n];ray.set(new THREE.Vector3(card.x,100,card.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(floor,false)[0];
        if(!hit||card.y+card.height*.72<hit.point.y+.2)throw new Error(`LOD${i}: crowd head buried in or outside the actual decoded tread at card ${n}`);
      }
      check(true,`LOD${i}: sampled crowd heads remain above the actual decoded tier surfaces`);
    }
    // Verify the shader actually selects distinct atlas cells. Merely storing
    // an instance attribute would not catch an obsolete r160 shader hook.
    let crowdSource;r.stadium.levels[0].traverse(node=>{if(!crowdSource&&node.isInstancedMesh&&node.userData.part==='Crowd')crowdSource=node;});
    const probeGeometry=crowdSource.geometry.clone(),probeMaterial=crowdSource.material.clone();
    probeGeometry.setAttribute('atlasVariant',new THREE.InstancedBufferAttribute(new Float32Array([0]),1));
    probeGeometry.setAttribute('wavePhase',new THREE.InstancedBufferAttribute(new Float32Array([0]),1));
    probeMaterial.onBeforeCompile=crowdSource.material.onBeforeCompile;probeMaterial.customProgramCacheKey=crowdSource.material.customProgramCacheKey;
    const probeMesh=new THREE.InstancedMesh(probeGeometry,probeMaterial,1);probeMesh.setMatrixAt(0,new THREE.Matrix4().makeScale(1.2,1.8,1));
    const probeScene=new THREE.Scene();probeScene.background=new THREE.Color('#010203');probeScene.add(probeMesh);
    const probeCamera=new THREE.OrthographicCamera(-.75,.75,.95,-.95,.1,20);probeCamera.position.set(0,.9,5);probeCamera.lookAt(0,.9,0);
    const probeTarget=new THREE.WebGLRenderTarget(96,128),imageA=new Uint8Array(96*128*4),imageB=new Uint8Array(96*128*4);
    try{
      r.renderer.setRenderTarget(probeTarget);r.renderer.render(probeScene,probeCamera);r.renderer.readRenderTargetPixels(probeTarget,0,0,96,128,imageA);
      probeGeometry.attributes.atlasVariant.setX(0,7);probeGeometry.attributes.atlasVariant.needsUpdate=true;
      r.renderer.render(probeScene,probeCamera);r.renderer.readRenderTargetPixels(probeTarget,0,0,96,128,imageB);
      let different=0;for(let n=0;n<imageA.length;n+=4)if(Math.abs(imageA[n]-imageB[n])+Math.abs(imageA[n+1]-imageB[n+1])+Math.abs(imageA[n+2]-imageB[n+2])>12)different++;
      check(different>64,'Crowd atlas variants render as different individual cells on the GPU');
    }finally{r.renderer.setRenderTarget(null);probeGeometry.dispose();probeMaterial.dispose();probeTarget.dispose();r.render(0);}
    r.stadium.setLOD(0);
    for(const [distance,expected]of [[109,0],[121,1],[189,1],[196,2],[185,2],[184,1],[109,0]]){
      r.camera.position.set(0,distance,0);r.stadium.update(r.camera,0);check(r.stadium.lod===expected,`Automatic LOD at ${distance} metres = ${expected}`);
    }
    for(const invalid of [-1,3,1.5,NaN]){
      let caught=false;try{r.stadium.setLOD(invalid);}catch{caught=true;}check(caught,'Invalid LOD rejected: '+invalid);
    }
    const dom=document.createElement('div');Object.assign(dom.style,{position:'absolute',inset:'0'});document.body.append(dom);
    const hud=createBroadcastHUD(dom,{home:'בדיקת שם ארוך ארוך ארוך',away:'<img src=x onerror=alert(1)>',reducedMotion:true});await hud.ready;
    hud.update({homeScore:1.9,awayScore:2,seconds:90,phase:'live'});
    check(hud.element.shadowRoot.querySelector('time').textContent==='01:30','Host time renders 01:30');
    check(hud.element.shadowRoot.querySelector('.home-score').textContent==='1','Scores are finite nonnegative whole numbers');
    let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);
    observer.observe(hud.element.shadowRoot,{attributes:true,childList:true,characterData:true,subtree:true});
    for(let i=0;i<120;i++)hud.update({homeScore:1.9,awayScore:2,seconds:90,phase:'live'});
    await Promise.resolve();observer.disconnect();check(mutations===0,'120 unchanged match frames produce zero HUD DOM mutations');
    check(!hud.element.shadowRoot.querySelector('img'),'Names render as text, never HTML');
    const box=hud.element.shadowRoot.querySelector('.scorebug').getBoundingClientRect();
    check(box.left>=0&&box.right<=innerWidth,'Long team names fit the portrait viewport');
    hud.update({homeScore:-1,awayScore:Infinity,seconds:NaN,phase:'opening'});
    check(hud.element.shadowRoot.querySelector('time').textContent==='00:00','Invalid host time is bounded');
    check(!hud.element.shadowRoot.querySelector('.opening').hidden,'Opening state is controlled by host');hud.dispose();dom.remove();
    const preaborted=new AbortController();preaborted.abort();let caught=false;
    try{await loadStadium({scene:new THREE.Scene(),signal:preaborted.signal});}catch{caught=true;}check(caught,'Already-aborted load rejected');
    const scene=new THREE.Scene(),oldBG=new THREE.Color('#123456'),oldFog=new THREE.Fog('#223344',10,40);scene.background=oldBG;scene.fog=oldFog;
    const metrics=[];
    // Reuse one renderer while replacing the stadium. This catches GPU-resource
    // leaks that page reloads and renderer.dispose() would hide.
    for(let cycle=0;cycle<12;cycle++){
      console.log('CHECK load/dispose cycle '+(cycle+1));
      const stadium=await loadStadium({scene});
      for(let lod=0;lod<3;lod++){stadium.setLOD(lod);r.renderer.render(scene,r.camera);}
      stadium.root.position.set(10,0,2);stadium.root.scale.setScalar(.2);stadium.root.updateMatrixWorld(true);
      const target=stadium.lights.key.target.getWorldPosition(new THREE.Vector3());check(target.distanceTo(stadium.root.position)<1e-6,`Cycle ${cycle+1}: lighting follows transformed root`);
      stadium.dispose();stadium.dispose();r.renderer.render(scene,r.camera);
      check(scene.background===oldBG&&scene.fog===oldFog,`Cycle ${cycle+1}: original scene state restored`);
      check(scene.children.length===0,`Cycle ${cycle+1}: root and lights detached`);
      metrics.push({...r.renderer.info.memory,programs:r.renderer.info.programs.length});
    }
    check(metrics.every(m=>m.geometries===metrics[0].geometries&&m.textures===metrics[0].textures&&m.programs===metrics[0].programs),'12 complete load/render/dispose cycles: stable GPU geometry, texture and shader program counts');
    const newerBG=new THREE.Color('#998877'),newerFog=new THREE.Fog('#556677',20,80),last=await loadStadium({scene});
    scene.background=newerBG;scene.fog=newerFog;last.dispose();check(scene.background===newerBG&&scene.fog===newerFog,'Dispose preserves scene state replaced by the host');
    r.setView('main',{lod:0,angle:0});r.render(0);
    return {results,memory:metrics};
  });
  lines.push(...contracts.results,'GPU geometry/texture/program counts after each dispose: '+contracts.memory.map(m=>m.geometries+'/'+m.textures+'/'+m.programs).join(', '));
  console.log('CHECK runtime contracts passed; checking context restoration');
  // Context loss/restoration is a practical mobile tab-switching failure mode.
  const restored=await page.evaluate(async()=>{
    const r=window.stadiumReview,canvas=r.renderer.domElement;
    const lost=new Promise(resolve=>canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();resolve();},{once:true}));
    r.renderer.forceContextLoss();await lost;await new Promise(resolve=>setTimeout(resolve,1000));
    const back=new Promise(resolve=>canvas.addEventListener('webglcontextrestored',resolve,{once:true}));
    r.renderer.forceContextRestore();await Promise.race([back,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Context restore timed out')),15_000))]);r.render(0);
    return {lost:r.renderer.getContext().isContextLost(),metrics:r.metrics()};
  });
  assert.equal(restored.lost,false);assert.ok(restored.metrics.submitted>0);lines.push('WebGL context lost/restored: scene renders again');
  for(const [width,height]of [[844,390],[390,844],[844,390],[390,844]]){
    await page.setViewportSize({width,height});
    const m=await page.evaluate(()=>{window.stadiumReview.setView('main',{lod:0});window.stadiumReview.render(0);return window.stadiumReview.metrics();});
    assert.equal(m.runtime.lod,0);assert.ok(m.runtime.total<=40_000);lines.push(`Rotation ${width}x${height}: rendering within budget`);
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);lines.push('No external requests or uncaught browser errors');
}finally{await browser.close();}
await fs.mkdir(path.join(root,'verification'),{recursive:true});
await fs.writeFile(path.join(root,'verification','browser-check.txt'),`PASS: ${new Date().toISOString()}\n`+lines.join('\n')+'\n');
console.log(`PASS: ${lines.length} browser contract and lifecycle checks`);
