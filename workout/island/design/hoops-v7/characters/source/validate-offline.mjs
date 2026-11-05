/** Verify the self-contained HTML with the browser network switched off.
 * The local server serves exactly one document and no asset endpoints.
 * Run after source/package-offline.mjs; output stays inside verification/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-v7-tools/package.json');
const {chromium}=require('playwright');
const sharp=require('sharp');
const bytes=await fs.readFile(path.join(root,'standalone.html'));
const reportBytes=await fs.readFile(path.join(root,'REPORT.md')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const errors=[],requests=[],rejectedRequests=[],checks=[],screenshots=[];
const startedAt=new Date().toISOString();
const server=http.createServer((request,response)=>{if(request.url!=='/standalone.html'){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(bytes);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const documentURL=`http://127.0.0.1:${server.address().port}/standalone.html`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'he-IL'});
await context.route('**/*',route=>{const url=route.request().url();requests.push(url);if(url===documentURL||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();rejectedRequests.push(url);return route.abort();});
const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
function check(name,pass,details){checks.push({name,pass:Boolean(pass),details});}
async function screenshot(name){await page.evaluate(()=>window.__hoopsLab.render());const buffer=await sharp(await page.screenshot({timeout:120000})).webp({quality:94}).toBuffer();const file=`offline-${name}.webp`;await fs.writeFile(path.join(root,'verification',file),buffer);screenshots.push({file,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});}
let diagnostics=null,reportDownload={present:false};
try{
  await page.goto(documentURL,{waitUntil:'load'});await page.evaluate(async()=>await window.__hoopsLab.ready);await context.setOffline(true);
  check('document is the self-contained build',await page.evaluate(()=>window.__hoopsLab.diagnostics().offline));
  if(reportBytes){if(await page.locator('#offline-report').count()!==1)throw Error('The current REPORT.md is not embedded; regenerate standalone.html');const[download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.click('#offline-report')]);const saved=await fs.readFile(await download.path()),expectedSha256=createHash('sha256').update(reportBytes).digest('hex'),downloadedSha256=createHash('sha256').update(saved).digest('hex');reportDownload={present:true,filename:download.suggestedFilename(),bytes:saved.length,expectedSha256,downloadedSha256,pass:download.suggestedFilename()==='REPORT.md'&&expectedSha256===downloadedSha256};if(!reportDownload.pass)throw Error('The embedded report download differs from REPORT.md');}
  await page.evaluate(()=>{const api=window.__hoopsLab;api.pause(true);api.selectAction('hold',{immediate:true});api.seek(.25);api.setView('near');});
  await page.click('#play');
  await page.waitForFunction(()=>window.__hoopsLab.actors[0].controller.getDiagnostics().phase>.26,null,{timeout:15000});
  await page.click('#play');
  check('play and pause controls update the animation',await page.evaluate(()=>!window.__hoopsLab.state.playing&&window.__hoopsLab.actors[0].controller.getDiagnostics().phase>.26));
  await page.click('#hold-toggle');await page.waitForFunction(()=>window.__hoopsLab.actors[0].controller.getDiagnostics().transition?.from==='idle_hold',null,{timeout:15000});
  check('dribble/hold touch control blends when resumed from a paused pose',await page.evaluate(()=>{const api=window.__hoopsLab,d=api.actors[0].controller.getDiagnostics();return api.state.playing&&d.action==='dribble_right'&&d.transition?.to==='dribble_right'&&d.transition.progress<1;}));
  await page.evaluate(()=>{const api=window.__hoopsLab;api.pause(true);api.selectAction('hold',{immediate:true});api.seek(.25);});
  await page.selectOption('#speed','0.5');check('speed control updates playback rate',await page.evaluate(()=>window.__hoopsLab.state.speed===.5));
  await page.locator('#timeline').evaluate(element=>{element.value='0.37';element.dispatchEvent(new Event('input',{bubbles:true}));});
  check('timeline seeks and pauses',await page.evaluate(()=>!window.__hoopsLab.state.playing&&Math.abs(window.__hoopsLab.actors[0].controller.getDiagnostics().phase-.37)<.001));
  await page.click('[data-team="ivory"]');
  const ivory=await page.evaluate(()=>{let color;window.__hoopsLab.actors[0].root.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name==='team_primary')color=material.color.getHexString();});return {selected:window.__hoopsLab.state.team,color};});
  await page.click('[data-team="teal"]');
  const teal=await page.evaluate(()=>{let color;window.__hoopsLab.actors[0].root.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name==='team_primary')color=material.color.getHexString();});return {selected:window.__hoopsLab.state.team,color};});
  check('team controls change uniform colors',ivory.selected==='ivory'&&teal.selected==='teal'&&ivory.color!==teal.color,{ivory,teal});
  await page.locator('.advanced summary').click();await page.selectOption('#lod','low');
  check('manual LOD control selects the reduced mesh',await page.evaluate(()=>window.__hoopsLab.actors[0].currentLevel===1));
  await page.selectOption('#lod','high');check('manual LOD control restores the full mesh',await page.evaluate(()=>window.__hoopsLab.actors[0].currentLevel===0));
  await page.locator('.advanced summary').click();
  const zoomLOD=await page.evaluate(()=>{const api=window.__hoopsLab;api.setLOD('auto');api.setCamera({zoom:2.2});const zoomedOut=api.actors[0].currentLevel;api.setCamera({zoom:1});return {zoomedOut,reset:api.actors[0].currentLevel};});
  check('automatic LOD follows camera zoom and restores detail on reset',zoomLOD.zoomedOut===1&&zoomLOD.reset===0,zoomLOD);
  const actualOptions=await page.locator('#action option').evaluateAll(options=>options.map(option=>option.value));
  const uiActionResults=[];for(const id of actualOptions){await page.selectOption('#action',id);await page.locator('#timeline').evaluate(element=>{element.value='0.46';element.dispatchEvent(new Event('input',{bubbles:true}));});uiActionResults.push(await page.evaluate(()=>({selected:document.getElementById('action').value,action:window.__hoopsLab.actors[0].controller.getDiagnostics().action})));}
  check('every authored action is accessible through the action selector',uiActionResults.length===27&&uiActionResults.every(result=>result.selected===result.action),uiActionResults);
  const allActors=await page.evaluate(()=>window.__hoopsLab.actors.map(actor=>{
    const highBones=new Map();actor.roots[0].traverse(object=>{if(object.isBone)highBones.set(object.name,object);});
    let meshes=0,sharedBones=0,skinBones=0;actor.roots[1].traverse(object=>{if(!object.isSkinnedMesh)return;meshes++;for(const bone of object.skeleton.bones){skinBones++;if(highBones.get(bone.name)===bone)sharedBones++;}});
    return {id:actor.id,meshes,sharedBones,skinBones,uniqueControllers:new Set(actor.controllers).size};
  }));
  check('each LOD uses the same 18-bone actor rig',allActors.every(actor=>actor.meshes>0&&actor.sharedBones===actor.skinBones),allActors);
  check('one motion solve per actor',allActors.every(actor=>actor.uniqueControllers===1),allActors.map(actor=>({id:actor.id,controllers:actor.uniqueControllers})));
  const textures=await page.evaluate(()=>{const maps=new Set(),normals=new Set();for(const actor of window.__hoopsLab.actors)for(const root of actor.roots)root.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){if(material.map)maps.add(material.map.uuid);if(material.normalMap)normals.add(material.normalMap.uuid);}});return {baseColorAtlases:maps.size,normalAtlases:normals.size};});
  check('GPU maps share six role atlases and one cloth normal atlas',textures.baseColorAtlases===6&&textures.normalAtlases===1,textures);
  const roleResults=[];
  for(const id of ['pg','sg','sf','pf','c','referee']){
    for(const lod of ['high','low']){
      const result=await page.evaluate(({id,lod})=>{const api=window.__hoopsLab;api.selectRole(id);api.setLOD(lod);api.seek(.25);api.render();const d=api.diagnostics(),actor=api.actors.find(actor=>actor.id===id);return {id,lod,triangles:d.actors[0]?.triangles,expectedTriangles:lod==='high'?actor.profile.authoredTriangles:actor.profile.authoredLOD1Triangles,drawCalls:d.renderer.calls,boneCount:actor.root.children.length};},{id,lod});
      roleResults.push(result);
    }
  }
  check('all roles render in both LODs while offline',roleResults.every(result=>result.triangles>1000&&result.drawCalls>0),roleResults);
  check('embedded viewer geometry matches the delivered model triangle counts',roleResults.every(result=>result.triangles===result.expectedTriangles),roleResults.map(result=>({id:result.id,lod:result.lod,triangles:result.triangles,expected:result.expectedTriangles})));
  const animationResults=await page.evaluate(()=>{const api=window.__hoopsLab;api.selectRole('pg');api.setLOD('high');return api.actions.map(action=>{api.selectAction(action.id,{immediate:true});api.seek(.46);api.render();const d=api.diagnostics().actors[0].motion;return {id:action.id,action:d.action,phase:d.phase,finite:d.ballPosition.every(Number.isFinite)};});});
  check('all authored actions can be selected and sought offline',animationResults.every(result=>result.id===result.action&&result.finite),animationResults);
  // Regression: the high-detail rig can be posed at the origin, then hidden
  // while its shared reduced mesh is moved into a comparison slot. Its GPU
  // palette must follow the outer wrapper as well as the anatomical pose.
  const paletteAlignment=await page.evaluate(()=>{const api=window.__hoopsLab;api.setView('near');api.setLOD('high');api.selectRole('pg');api.selectAction('dunk_one_hand',{immediate:true});api.seek(.56);api.selectAction('hold',{immediate:true});api.seek(.25);api.setLOD('auto');api.setView('far');api.render();return api.actors.map(actor=>{const skeletons=new Set();actor.root.traverse(object=>{if(object.isSkinnedMesh)skeletons.add(object.skeleton);});let maxError=0;for(const skeleton of skeletons)for(let index=0;index<skeleton.bones.length;index++){const expected=skeleton.bones[index].matrixWorld.clone().multiply(skeleton.boneInverses[index]).elements;for(let component=0;component<16;component++)maxError=Math.max(maxError,Math.abs(expected[component]-skeleton.boneMatrices[index*16+component]));}return {id:actor.id,lod:actor.currentLevel,maxError};});});
  check('shared LOD skin palettes follow near-to-lineup placement after aerial motion',paletteAlignment.every(result=>result.lod===1&&result.maxError<1e-5),paletteAlignment);
  await page.evaluate(()=>{const api=window.__hoopsLab;api.selectRole('pg');api.selectAction('hold',{immediate:true});api.seek(.25);api.setLOD('auto');api.setView('near');api.setTeam('teal');});
  await screenshot('390x844-near');
  await page.evaluate(()=>window.__hoopsLab.setView('face'));await screenshot('390x844-face');
  await page.setViewportSize({width:844,height:390});await page.evaluate(()=>window.__hoopsLab.setView('far'));await screenshot('844x390-far');
  const overflow=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  check('landscape document has no page overflow',overflow.scrollWidth===overflow.width&&overflow.scrollHeight===overflow.height,overflow);
  diagnostics=await page.evaluate(()=>window.__hoopsLab.diagnostics());
  check('no external asset requests',rejectedRequests.length===0,rejectedRequests);
  check('no JavaScript or console errors',errors.length===0,errors);
}catch(error){errors.push(String(error));check('offline interaction completed',false,String(error));}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
await fs.mkdir(path.join(root,'verification'),{recursive:true});
const result={schemaVersion:1,startedAt,completedAt:new Date().toISOString(),pass:checks.every(item=>item.pass)&&errors.length===0,document:{file:'standalone.html',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},reportDownload,method:'The server exposes only the standalone HTML document. Once loaded, the browser network is disabled. Every role, LOD and action is exercised using embedded GLBs and the embedded Draco decoder. Only document/blob/data requests are allowed.',fileProtocolObservation:'Direct file:// navigation was blocked by managed Chromium with ERR_BLOCKED_BY_ADMINISTRATOR in this environment. The same self-contained markup also executed successfully from about: via setContent. Physical-browser double-click verification remains separate.',checks,requests:requests.map(url=>url===documentURL?'standalone document':url.split(':')[0]+':'),rejectedRequests,errors,screenshots,diagnostics};
await fs.writeFile(path.join(root,'verification','offline.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,checks:checks.length,errors,bytes:bytes.length,screenshots:screenshots.length}));if(!result.pass)process.exitCode=1;
