// Supplemental previews and per-clip mesh-floor readings. This uses the same
// unmodified viewer, rig.apply(), contact windows, and 120 Hz sampling as checks.js.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function capturePreviews({viewer,packPath,output,playwrightPath,clips,executablePath='/usr/bin/chromium'}) {
  const source = await readFile(packPath,'utf8');
  const island=resolve(dirname(viewer),'../..');
  const models=new Map(await Promise.all(['soccer-player','basketball-player'].map(async name=>{
    const path=`/design/characters/${name}.glb`;
    return [path,await readFile(resolve(island,`.${path}`))];
  })));
  await mkdir(output,{recursive:true});
  const server = spawn(process.execPath,[viewer,'--serve'],{stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    const origin = await new Promise((accept,reject)=>{
      let log='';
      const timeout=setTimeout(()=>reject(Error('Preview server did not start')),10000);
      server.stdout.on('data',chunk=>{
        log+=chunk;
        const match=log.match(/Viewer: (http:\/\/127\.0\.0\.1:\d+)/);
        if(match){clearTimeout(timeout);accept(match[1]);}
      });
      server.once('exit',code=>{clearTimeout(timeout);reject(Error(`Preview server exited ${code}`));});
      server.once('error',reject);
    });
    const {chromium}=await import(pathToFileURL(playwrightPath).href);
    browser=await chromium.launch({headless:true,executablePath,
      args:['--use-gl=angle','--use-angle=swiftshader']});
    const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,serviceWorkers:'block'});
    const errors=[];
    await context.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
      const parsed=new URL(url);
      if(parsed.origin!==origin){errors.push(`External request ${url}`);return route.abort();}
      if(parsed.pathname==='/design/motion/hoops.json')return route.fulfill({status:200,contentType:'application/json',body:source});
      const model=models.get(parsed.pathname);
      if(model)return route.fulfill({status:200,contentType:'model/gltf-binary',
        headers:{'content-length':String(model.length)},body:model});
      return route.continue();
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('requestfailed',request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(origin+'/design/viewer/viewer.html');
    await page.waitForFunction(()=>Boolean(window.viewerTest));
    await page.evaluate(async()=>{
      await window.viewerTest.ready;window.viewerTest.pause();
      await window.viewerTest.selectGame('hoops');
      await window.viewerTest.selectCharacter('basketball-player');
    });
    const mesh = await page.evaluate(async names=>{
      const {sample}=await import('/design/viewer/animation.js');
      const data=await(await fetch('/design/motion/hoops.json')).json();
      const rig=window.viewerTest.rig;
      return names.map(name=>{
        const clip=data.states[name];
        const times=new Set([0,clip.durationSeconds,...clip.keyframes.map(key=>key.time*clip.durationSeconds),
          ...(clip.supportContacts||[]).flatMap(contact=>[contact.startTime,contact.endTime].map(time=>time*clip.durationSeconds))]);
        for(let time=0;time<clip.durationSeconds;time+=1/120)times.add(time);
        let minY=Infinity,maxAnchorErrorMeters=0;
        for(const time of [...times].sort((a,b)=>a-b)){
          const pose=sample(clip,time,false);
          const snapshot=rig.apply(pose,{referenceRoot:pose.referenceRootTranslationMeters,contacts:pose.contacts,floor:true});
          minY=Math.min(minY,snapshot.minY);
          maxAnchorErrorMeters=Math.max(maxAnchorErrorMeters,snapshot.maxSupportErrorMeters);
        }
        return {clip:name,minY,maxAnchorErrorMeters,samples:times.size,
          floorPass:minY>=-.001,supportPass:maxAnchorErrorMeters<=.02};
      });
    },clips.map(clip=>clip.name));
    await page.evaluate(async()=>{
      const THREE=await import('/vendor/three.module.js');
      const lookAt=THREE.PerspectiveCamera.prototype.lookAt;
      THREE.PerspectiveCamera.prototype.lookAt=function(...args){
        const result=lookAt.apply(this,args);
        this.fov=45;this.updateProjectionMatrix();
        return result;
      };
    });
    const pack=JSON.parse(source);
    const screenshots=[];
    const previewPhases={celebration:.4,crossover:.48,spin:.5,step_back:.82,shot_fake:.44,
      sprint:.13,sprint_ball:.15,defensive_run:.24,defensive_slide:.25,defensive_slide_right:.75,
      defensive_switch:.39,screen:.5,steal_fail:.42};
    for(const clip of clips){
      const state=pack.states[clip.name];
      const contact=state.ballContacts.find(contact=>/release|catch|receive|block|steal|contact/.test(contact.event||'')) || state.ballContacts[0];
      const event=state.events.find(event=>/release|point|screen|steal|miss|celebr|apex/.test(event.name)) || state.events[0];
      const time=(previewPhases[clip.name] ?? contact?.time ?? event?.time ?? .5)*state.durationSeconds;
      await page.evaluate(({name,time})=>{window.viewerTest.selectClip(name);window.viewerTest.seek(time);window.viewerTest.render();},{name:clip.name,time});
      const file=`${clip.name}.png`;
      await page.locator('#stage').screenshot({path:resolve(output,file)});
      screenshots.push({clip:clip.name,atSeconds:time,file});
    }
    const report={schemaVersion:1,character:'basketball-player',viewport:{width:844,height:390},
      screenshotCamera:{verticalFovDegrees:45,scope:'Supplemental previews only; measured CLI uses the original camera unchanged.'},
      meshFloor:{floorLimitMeters:.001,supportLimitMeters:.02,clips:mesh},screenshots,errors,
      pass:errors.length===0&&mesh.every(clip=>clip.floorPass&&clip.supportPass)};
    await writeFile(resolve(output,'previews.json'),JSON.stringify(report,null,2)+'\n');
    const imageArgs=['-font','DejaVu-Sans','-pointsize','13','-background','#111e29','-fill','white',
      '-label','%t',...screenshots.map(shot=>resolve(output,shot.file)),'-geometry','260x180+5+5',
      '-tile','5x',resolve(output,'contact-sheet.webp')];
    await new Promise((accept,reject)=>{
      const image=spawn('montage',imageArgs,{stdio:'inherit'});
      image.on('error',reject);image.on('exit',code=>code===0?accept():reject(Error(`montage exited ${code}`)));
    });
    return report;
  } finally {
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
}
