#!/usr/bin/env node
/**
 * Interactive smoke test and representative 844×390 review frames.
 * Serve repository root on http://localhost:8765, then run this script.
 * Requires Playwright and Chromium; CHROMIUM_PATH/FIRE_PREVIEW_URL override defaults.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'evidence');
await fs.mkdir(destination,{recursive:true});
const url=process.env.FIRE_PREVIEW_URL || 'http://localhost:8765/workout/island/design/fire-multifloor-v2/preview.html';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[],networkFailures=[],externalRequests=[],checks=[],screenshots=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('requestfailed',request=>networkFailures.push({url:request.url(),error:request.failure()?.errorText}));
page.on('request',request=>{if(new URL(request.url()).origin!==new URL(url).origin)externalRequests.push(request.url());});
page.on('response',response=>{if(response.status()>=400)networkFailures.push({url:response.url(),status:response.status()});});
const assert=(id,condition,detail)=>checks.push({id,pass:Boolean(condition),detail});
const sameTransform=(a,b)=>b && ['position','quaternion','scale'].every(key=>a[key].every((v,i)=>Math.abs(v-b[key][i])<1e-5));
const state=()=>page.evaluate(()=>window.firePreview.getState());
const frames=count=>page.evaluate(async count=>{for(let i=0;i<count;i++)await new Promise(requestAnimationFrame);},count);
const snap=async name=>{
  await frames(2);
  const file=`${name}-844x390.webp`;
  await page.screenshot({path:path.join(destination,file),type:'webp',quality:84});
  screenshots.push({file:`evidence/${file}`,width:844,height:390,bytes:(await fs.stat(path.join(destination,file))).size});
};
const click=async selector=>{await page.locator(selector).click();await frames(2);};

try {
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.firePreview?.ready,undefined,{timeout:60000});
  // Read the actual scene and mixers through the review page's inspection hook.
  // The Three module is already loaded by the app; this adds no network origin.
  await page.evaluate(async()=>{
    const THREE=await import('/workout/island/vendor/three.module.js');
    const audit=window.__fireAudit={THREE,...window.firePreview.inspect()};
    audit.pose=()=>{
      const out={};
      audit.scene.traverse(n=>{if(/^(wheel_\d_(left|right)|ladder_elevation|ladder_stage_[123]|outrigger_-?1_[01]|blanket_unfold|beacon_flash_-?1)$/.test(n.name))out[n.name]={position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()};});
      return out;
    };
    audit.projected=()=>{
      const {THREE,scene,camera}=audit;
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const model=scene.children.find(n=>n.isGroup && n.children.length);
      const bounds={min:[Infinity,Infinity],max:[-Infinity,-Infinity],meshes:0};
      model.traverse(n=>{
        if(!n.isMesh)return;
        for(let p=n;p;p=p.parent)if(!p.visible || p.scale.toArray().some(v=>Math.abs(v)<1e-8))return;
        n.geometry.computeBoundingBox();const box=n.geometry.boundingBox;
        bounds.meshes++;
        for(let corner=0;corner<8;corner++) {
          const p=new THREE.Vector3(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).applyMatrix4(n.matrixWorld).project(camera);
          for(let axis=0;axis<2;axis++){bounds.min[axis]=Math.min(bounds.min[axis],p.getComponent(axis));bounds.max[axis]=Math.max(bounds.max[axis],p.getComponent(axis));}
        }
      });
      return bounds;
    };
    audit.active=()=>audit.mixers.flatMap(m=>(m._actions || []).filter(a=>a.isScheduled()).map(a=>({name:a.getClip().name,time:a.time,duration:a.getClip().duration,paused:a.paused,root:m.getRoot().name})));
  });
  await frames(3);
  const initial=await state();
  assert('ready',initial.view==='truck' && initial.sceneModels===1 && initial.tools===5 && initial.burnables===96,initial);
  const fits=async id=>{const b=await page.evaluate(()=>window.__fireAudit.projected());assert(id,b.meshes>0 && b.min.every(v=>v>=-.995) && b.max.every(v=>v<=.995),b);};
  const pose=()=>page.evaluate(()=>window.__fireAudit.pose());
  const finish=async name=>{
    await page.waitForFunction(name=>window.__fireAudit.active().some(a=>a.name===name && a.time>=a.duration-1e-4 && a.paused),name,{timeout:30000,polling:'raf'});
    await frames(2);
  };
  await fits('truck:stowed-in-frame');await snap('truck-stowed');
  const driveBefore=await pose();
  await click('[data-clip="drive"]');await frames(9);
  const driveAfter=await pose();
  assert('truck:drive-moves-wheels',Object.entries(driveBefore).filter(([name])=>name.startsWith('wheel_')).every(([name,v])=>JSON.stringify(v.quaternion)!==JSON.stringify(driveAfter[name]?.quaternion)),{before:driveBefore,after:driveAfter});
  await click('[data-clip="lights"]');
  const lightSamples=[];
  for(let i=0;i<14;i++){await frames(1);lightSamples.push(await page.evaluate(()=>Object.entries(window.__fireAudit.pose()).filter(([n])=>n.startsWith('beacon_flash_')).map(([n,v])=>[n,v.scale])));}
  assert('truck:alternating-lights',new Set(lightSamples.map(JSON.stringify)).size>1,lightSamples);
  await click('[data-clip="ladder_extend"]');await finish('ladder_extend');
  const extended=await pose();
  assert('truck:extended-stages',Object.entries(extended).filter(([n])=>/^ladder_stage_[23]$/.test(n)).every(([,p])=>p.position.some(v=>Math.abs(v)>2)),extended);
  await fits('truck:extended-in-frame');await snap('truck-extended');
  await click('[data-clip="ladder_retract"]');await finish('ladder_retract');
  const retracted=await pose();
  assert('truck:retracted-rest',Object.entries(driveBefore).filter(([n])=>/ladder_|outrigger_/.test(n)).every(([name,v])=>sameTransform(v,retracted[name])),{before:driveBefore,after:retracted});
  await click('#reset-camera');await fits('truck:retracted-in-frame');

  await click('[data-view="building"]');
  await click('[data-state="intact"]');
  let current=await state();assert('building:intact',current.visibleIntact===96 && current.visibleBurnt===0,current);
  await fits('building:overview-in-frame');await snap('building-overview');
  for(const selected of ['1','2','3','all']) {
    await click(`[data-floor="${selected}"]`);
    current=await state();assert(`building:floor:${selected}`,current.floor===selected,current);
    await fits(`building:floor-${selected}-in-frame`);
  }
  for(const selected of ['intact','burning','burnt']) {
    await click(`[data-state="${selected}"]`);
    current=await state();
    assert(`building:state:${selected}`,current.state===selected && (selected==='burnt' ? current.visibleBurnt===96 && current.visibleIntact===0 : current.visibleIntact===96 && current.visibleBurnt===0),current);
  }
  await click('[data-state="burning"]');
  await page.locator('#pause').click();await frames(2);
  await page.locator('#smoke').evaluate(input=>{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await frames(2);
  current=await state();
  assert('smoke:zero',current.smoke===0 && current.smokeCount===0,current);
  await page.locator('#smoke').evaluate(input=>{input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));});await frames(2);
  current=await state();assert('smoke:full',current.smoke===1 && current.smokeCount===63,current);
  await page.locator('#smoke').evaluate(input=>{input.value='35';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const smokePaused=(await state()).smoke;await frames(8);
  assert('pause:holds-smoke',(await state()).smoke===smokePaused,{before:smokePaused,after:(await state()).smoke});
  await click('#pause');
  const beforeSmoke=(await state()).smoke;await frames(10);const afterSmoke=(await state()).smoke;
  assert('smoke:accumulates',afterSmoke>beforeSmoke,{before:beforeSmoke,after:afterSmoke});
  await click('[data-state="burnt"]');const beforeDecay=(await state()).smoke;await frames(10);const afterDecay=(await state()).smoke;
  assert('smoke:dissipates',afterDecay<beforeDecay,{before:beforeDecay,after:afterDecay});
  await click('[data-floor="2"]');await click('[data-state="burnt"]');await snap('building-floor-burnt');
  await click('[data-state="burning"]');await snap('building-floor-burning');

  await click('[data-view="equipment"]');
  for(const tool of ['extinguisher-powder','extinguisher-foam','wall-hose','hydrant','fire-blanket']) {
    await click(`[data-tool="${tool}"]`);await fits(`equipment:${tool}:rest-in-frame`);
    await click('#use-tool');
    const actions=await page.evaluate(()=>window.__fireAudit.active());
    assert(`equipment:${tool}:use-started`,actions.some(a=>a.name==='use'),actions);
    assert(`equipment:${tool}:effect-visible`,await page.locator('#effect-preview').isVisible(),'8-frame effect inset visible on use');
    await finish('use');await fits(`equipment:${tool}:use-end-in-frame`);
    if(tool==='fire-blanket')await snap('equipment-blanket');
  }
  await click('[data-view="truck"]');await click('[data-clip="drive"]');await frames(3);
  await click('#pause');const pausedPose=await pose();await frames(8);const stillPose=await pose();
  assert('pause:holds-pose',JSON.stringify(pausedPose)===JSON.stringify(stillPose),{pausedPose,stillPose});
  await click('#pause');await frames(7);assert('pause:resumes-pose',JSON.stringify(stillPose)!==JSON.stringify(await pose()),'Drive wheel pose changes after resume');
  assert('layout:landscape',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight),await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})));
  await page.setViewportSize({width:390,height:844});await frames(3);await click('#reset-camera');await fits('layout:portrait-truck-in-frame');
  assert('layout:portrait',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight),await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})));
  assert('runtime:no-errors',errors.length===0,errors);
  assert('network:no-failures',networkFailures.length===0,networkFailures);
  assert('network:local-only',externalRequests.length===0,externalRequests);
} catch(error) {
  assert('browser:completed',false,{message:error.message,stack:error.stack});
} finally {
  const result={passed:checks.every(c=>c.pass),browser:await browser.version(),viewport:{width:844,height:390},checks,errors,networkFailures,externalRequests,screenshots,screenshotBytes:screenshots.reduce((s,a)=>s+a.bytes,0)};
  await fs.writeFile(path.join(destination,'browser-checks.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.pass),screenshots,screenshotBytes:result.screenshotBytes},null,2));
  await browser.close();
  if(!result.passed)process.exitCode=1;
}
