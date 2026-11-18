/* Independent browser exercise of the delivered GLB viewer at its requested viewport. */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const base=process.env.FIRE_PREVIEW_URL||'http://127.0.0.1:8769/workout/island/design/fire-rescue-people-v2/preview.html';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
const errors=[],requests=[],checks=[],clips=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));page.on('request',r=>requests.push(r.url()));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.goto(base,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.FireRescuePreview?.ready,{timeout:30000});
await page.evaluate(()=>window.FireRescuePreview.setPlaying(false));
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)console.error(name,detail);};
check('eleven selectable character buttons',await page.locator('#roster button').count()===11);
check('no document overflow at 844x390',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
for(const def of manifest.characters){
  await page.locator(`#roster button[data-id="${def.id}"]`).click();
  for(const clip of def.clips){
    await page.selectOption('#clip',clip.name);
    const samples=[];
    for(const phase of [0,.25,.5,.75,1]){
      await page.evaluate(time=>window.FireRescuePreview.seek(time),clip.duration*phase);
      const snapshot=await page.evaluate(()=>window.FireRescuePreview.snapshot());
      const bounds=await page.evaluate(()=>window.FireRescuePreview.frameBounds());
      samples.push({phase,actorCount:snapshot.actorCount,time:snapshot.actors[0].time,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,errors:snapshot.errors,bounds});
    }
    clips.push({id:def.id,clip:clip.name,samples});
    check(`${def.id}/${clip.name} seek samples`,samples.every(s=>s.errors.length===0&&(Math.abs(s.time-clip.duration*s.phase)<.0002||(clip.loop&&s.phase===1&&s.time<.0002))),samples.some(s=>s.errors.length)?samples:undefined);
    check(`${def.id}/${clip.name} animated framing`,samples.every(s=>s.bounds.every(b=>b.inside)),samples.filter(s=>s.bounds.some(b=>!b.inside)));
  }
}
await page.locator('#skeleton').click();check('skeleton toggle enabled',await page.locator('#skeleton').getAttribute('aria-pressed')==='true');await page.locator('#skeleton').click();
await page.locator('[data-environment="balcony"]').click();check('balcony switch',await page.evaluate(()=>window.FireRescuePreview.snapshot().environment==='balcony'));
await page.locator('[data-environment="outdoors"]').click();check('outdoor switch',await page.evaluate(()=>window.FireRescuePreview.snapshot().environment==='outdoors'));
await page.locator('#play').click();await page.waitForFunction(()=>window.FireRescuePreview.snapshot().playing&&window.FireRescuePreview.snapshot().time>0,{timeout:5000});check('play control advances time',await page.evaluate(()=>window.FireRescuePreview.snapshot().time>0));await page.locator('#play').click();
await page.locator('#timeline').fill('0.5');check('timeline scrub pauses animation',await page.evaluate(()=>!window.FireRescuePreview.snapshot().playing));
const beforeOrbit=await page.evaluate(()=>window.FireRescuePreview.snapshot().camera);await page.locator('#scene').focus();await page.keyboard.press('ArrowLeft');const afterOrbit=await page.evaluate(()=>window.FireRescuePreview.snapshot().camera);check('keyboard camera orbit',Math.abs(afterOrbit.yaw-beforeOrbit.yaw)>.1);
await page.mouse.move(280,180);await page.mouse.wheel(0,100);await page.waitForTimeout(50);const afterZoom=await page.evaluate(()=>window.FireRescuePreview.snapshot().camera);check('mouse wheel camera zoom',afterZoom.radius>afterOrbit.radius);
const screenshots=[];
for(const shot of [
  {name:'844x390-mother-wave',id:'mother',clip:'wave_help',time:1.7,environment:'balcony'},
  {name:'844x390-firefighter-hose',id:'young-firefighter',clip:'hose',time:2.0,environment:'outdoors'},
  {name:'844x390-rescue-pair',id:'boy',clip:'carried_shoulder',time:3.0,environment:'balcony'},
  {name:'844x390-baby-stroller',id:'baby-stroller',clip:'wave_help',time:2,environment:'balcony'},
  {name:'844x390-baby-rescue',id:'baby-stroller',clip:'carried_shoulder',time:3,environment:'balcony'},
  {name:'844x390-floor-seated',id:'mother',clip:'sit_floor',time:2.8,environment:'balcony'},
  {name:'844x390-baby-floor-seated',id:'baby-stroller',clip:'sit_floor',time:2.8,environment:'balcony'},
  {name:'844x390-all-characters',all:true,time:1.7,environment:'outdoors'},
]){
  await page.evaluate(async shot=>{if(shot.all)await window.FireRescuePreview.setAll(true);else{await window.FireRescuePreview.setCharacter(shot.id);await window.FireRescuePreview.setClip(shot.clip);}window.FireRescuePreview.setEnvironment(shot.environment);window.FireRescuePreview.seek(shot.time);window.FireRescuePreview.setPlaying(false);},shot);
  await page.waitForTimeout(90);
  const file=`verification/${shot.name}.jpg`;await fs.mkdir(path.join(root,'verification'),{recursive:true});await page.screenshot({path:path.join(root,file),type:'jpeg',quality:84});screenshots.push({file,...shot,snapshot:await page.evaluate(()=>window.FireRescuePreview.snapshot())});
}
await page.locator('#home').click();check('reset camera remains interactive',true);
check('all assets same-origin and local',requests.every(url=>url.startsWith('http://127.0.0.1:8769/')||url.startsWith('data:')||url.startsWith('blob:')));
check('no browser errors',errors.length===0,errors);
const hashes={};for(const file of ['preview.html','preview.css','preview.mjs','source/browser-qa.mjs','manifest.json',...manifest.characters.map(c=>c.file)])hashes[file]=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
const report={schemaVersion:1,testedAt:new Date().toISOString(),viewport:{width:844,height:390,deviceScaleFactor:1},browser:await browser.version(),renderer:'Chromium SwiftShader software WebGL; no physical-device FPS claim',hashes,characterCount:manifest.characters.length,clipCount:clips.length,passed:checks.every(c=>c.pass),checks,errors,clips,screenshots,requests:requests.map(url=>url.replace('http://127.0.0.1:8769/','/'))};
await fs.writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,characters:report.characterCount,clips:report.clipCount,checks:checks.length,errors,screenshots:screenshots.map(s=>s.file)}));
await browser.close();if(!report.passed)process.exitCode=1;
