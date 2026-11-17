// CC0-1.0. Browser checks exercise the delivered preview and decoded GLB skeletons.
// Usage: node source/verify-browser.mjs (Playwright in PODIUM_NODE_MODULES or /tmp/racing-podium-tools/node_modules).
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const pack=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(pack,'../../../..');
const out=path.join(pack,'verification');
const dependencies=process.env.PODIUM_NODE_MODULES??'/tmp/racing-podium-tools/node_modules';
const {chromium}=await import(pathToFileURL(path.join(dependencies,'playwright/index.mjs')));
const ids=['exit_car','helmet_lift','wave','victory_dance','disappointment','handshake','podium_idle','trophy_lift'];
const report={schemaVersion:1,viewport:{width:844,height:390},browser:'Chromium with ANGLE SwiftShader',
  source:'Actual delivered preview, GLTFLoader skinning, world matrices and DOM controls',
  errors:[],failedRequests:[],httpErrors:[],externalRequests:[],clips:[],controls:{},screenshots:[],passed:false};
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json',
  '.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(requested==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(repo,'.'+requested);
    if(!file.startsWith(repo+path.sep))throw Error('Outside repository');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});
    res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});
const shots=await mkdtemp(path.join(tmpdir(),'podium-browser-shots-'));
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('requestfailed',r=>report.failedRequests.push({url:r.url().replace(origin,''),failure:r.failure()?.errorText,
  resourceType:r.resourceType(),timing:r.timing()}));
page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))report.externalRequests.push(r.url());});
page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.httpErrors.push({url:r.url().replace(origin,''),status:r.status()});});
const check=(value,message)=>{if(!value)throw Error(message);};
const captureInputs=async()=>{
  const names=['preview.html','preview.mjs','style.css','motions.json','rig.json','props.json','source/verify-browser.mjs',
    ...(await readdir(path.join(pack,'assets'))).sort().map(file=>`assets/${file}`)];
  const inputs=[];
  for(const name of names){const bytes=await readFile(path.join(pack,name));inputs.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  return inputs;
};
const frame=async()=>page.evaluate(()=>{
  const p=window.__podium;
  p.scene.updateMatrixWorld(true);
  const state=p.getState();
  const actors=p.actors.filter(a=>a.root.visible).map(a=>{
    const bones=[];a.root.traverse(o=>{if(o.isBone)bones.push(o);});
    const position=o=>[o.matrixWorld.elements[12],o.matrixWorld.elements[13],o.matrixWorld.elements[14]];
    let finite=true;let matrices=0;
    a.root.traverse(o=>{matrices++;if(!o.matrixWorld.elements.every(Number.isFinite))finite=false;});
    const world=Object.fromEntries(bones.map(b=>[b.name,position(b)]));
    const rightHand=bones.find(b=>b.name==='RightHand');
    const rightPalm=rightHand?rightHand.localToWorld(rightHand.position.clone().set(-.035,0,-.014)).toArray():null;
    const soles={LeftFoot:{vertices:0,minY:Infinity},RightFoot:{vertices:0,minY:Infinity}};
    a.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const attributes=mesh.geometry.attributes,indices=attributes.skinIndex,weights=attributes.skinWeight;
      if(!indices||!weights)return;
      const targets=new Map(mesh.skeleton.bones.map((bone,index)=>[index,bone.name]));
      const v=mesh.position.clone();
      for(let i=0;i<attributes.position.count;i++){
        const joints=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)];
        const influences=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
        const dominant=joints.find((joint,slot)=>soles[targets.get(joint)]&&influences[slot]>.5);
        const bone=targets.get(dominant);if(!bone)continue;
        v.fromBufferAttribute(attributes.position,i);mesh.applyBoneTransform(i,v);mesh.localToWorld(v);
        soles[bone].vertices++;soles[bone].minY=Math.min(soles[bone].minY,v.y);
        if(![v.x,v.y,v.z].every(Number.isFinite))finite=false;
      }
    });
    const floorY=a.floorY??position(a.root)[1];
    const propRoots=[];
    for(const [id,object] of Object.entries(a.props??{}))if(object?.isObject3D&&object.visible){
      let visible=true;for(let n=object;n;n=n.parent)if(!n.visible)visible=false;
      if(visible){
        const here=position(object);
        const sockets=['LeftHand','RightHand','Head','Neck'].filter(id=>world[id]).map(id=>({bone:id,
          distance:Math.hypot(...world[id].map((value,index)=>value-here[index]))})).sort((a,b)=>a.distance-b.distance);
        propRoots.push({id,name:object.name,position:here,parent:object.parent?.name,nearestSocket:sockets[0],
          userData:object.userData});
      }
    }
    return {gender:a.gender,boneCount:bones.length,boneNames:bones.map(b=>b.name),finite,matrices,floorY,soles,rightPalm,
      joints:Object.fromEntries(['Head','LeftHand','RightHand','LeftFoot','RightFoot'].map(id=>[id,world[id]])),
      poseSignature:JSON.stringify(bones.map(b=>[b.name,...position(b).map(v=>Math.round(v*1e4))])),props:propRoots};
  });
  const stage=document.querySelector('canvas')?.getBoundingClientRect();
  return {state,actors,canvas:stage?{x:stage.x,y:stage.y,width:stage.width,height:stage.height}:null,
    overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
});
try{
  await mkdir(out,{recursive:true});
  report.inputs=await captureInputs();
  await page.goto(`${origin}/workout/island/design/racing-podium-v1/preview.html`,{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.__podium?.ready===true,null,{timeout:60000});
  await page.evaluate(()=>window.__podium.setPlaying(false));
  const initial=await frame();
  report.initial={...initial,state:initial.state,actors:initial.actors.map(a=>({...a,poseSignature:undefined}))};
  check(!initial.overflow,'844x390 page overflows viewport');
  check(initial.canvas?.width>400&&initial.canvas?.height>150,'Canvas is too small or missing');
  const listed=await page.locator('#clip option').evaluateAll(options=>options.map(o=>o.value));
  check(ids.every(id=>listed.includes(id)),'Eight clip selectors are not available');
  report.controls.clipOptions=listed;
  for(const gender of ['male','female']){
    await page.locator(`#${gender}`).click();
    await page.evaluate(()=>window.__podium.setPlaying(false));
    for(const id of ids){
      await page.locator('#clip').selectOption(id);
      await page.evaluate(()=>window.__podium.setPlaying(false));
      const state=await page.evaluate(()=>window.__podium.getState());
      const duration=state.duration;
      check(duration>0&&Number.isFinite(duration),`${gender}/${id}: invalid duration`);
      const sampled=[];
      for(const fraction of [0,.25,.5,.75,1]){
        await page.evaluate(time=>window.__podium.setTime(time),duration*fraction);
        const snap=await frame();
        check(!snap.overflow,`${gender}/${id}: viewport overflow`);
        check(snap.actors.length>0,`${gender}/${id}: no visible actors`);
        for(const actor of snap.actors){
          check(actor.boneCount===18,`${gender}/${id}: ${actor.boneCount} bones`);
          check(actor.finite,`${gender}/${id}: nonfinite matrix`);
          for(const [bone,sole] of Object.entries(actor.soles)){
            check(sole.vertices>0,`${gender}/${id}: no actual skinned shoe vertices for ${bone}`);
            check(sole.minY>=actor.floorY-.018,`${gender}/${id}: actual ${bone} sole penetrates floor by ${actor.floorY-sole.minY}m`);
          }
        }
        sampled.push({fraction,time:duration*fraction,state:snap.state,actors:snap.actors});
      }
      check(new Set(sampled.map(f=>f.actors[0].poseSignature)).size>1,`${gender}/${id}: static animation`);
      const filename=`${gender}-${id}.jpg`;
      await page.evaluate(time=>window.__podium.setTime(time),duration*(id==='trophy_lift'?.78:id==='exit_car'?.15:.5));
      await page.screenshot({path:path.join(shots,filename),type:'jpeg',quality:72});
      const contact=id==='handshake'?sampled.map(s=>({fraction:s.fraction,
        rightHandsDistance:s.actors.length>1?Math.hypot(...s.actors[0].joints.RightHand.map((v,i)=>v-s.actors[1].joints.RightHand[i])):null,
        palmGripDistance:s.actors.length>1?Math.hypot(...s.actors[0].rightPalm.map((v,i)=>v-s.actors[1].rightPalm[i])):null})):undefined;
      if(contact){
        const hold=contact.find(s=>s.fraction===.5);
        check(hold.rightHandsDistance!==null&&hold.rightHandsDistance<.08,`${gender}/handshake: palms do not meet at hold (${hold.rightHandsDistance}m)`);
        check(hold.palmGripDistance!==null&&hold.palmGripDistance<.02,`${gender}/handshake: actual palm grips do not meet (${hold.palmGripDistance}m)`);
      }
      if(id==='trophy_lift'||id==='helmet_lift'){
        const held=sampled.find(s=>s.fraction===.75).actors[0].props.filter(p=>p.id.includes(id==='trophy_lift'?'trophy':'helmet'));
        check(held.length>0,`${gender}/${id}: requested held prop is not visible`);
        check(held.every(p=>['LeftHand','RightHand'].includes(p.nearestSocket.bone)&&p.nearestSocket.distance<.1),`${gender}/${id}: prop grip does not follow a hand`);
      }
      report.clips.push({id,gender,duration,samples:sampled.map(s=>({...s,actors:s.actors.map(a=>({...a,poseSignature:undefined}))})),contact,
        animated:true,finiteMatrices:true,canonicalBones:18});
    }
  }
  await page.locator('#male').click();
  await page.locator('#clip').selectOption('podium_idle');
  await page.evaluate(()=>{window.__podium.setPlaying(false);window.__podium.setTime(.7);});
  await page.locator('#restart').click();
  const restart=await page.evaluate(()=>window.__podium.getState());
  check(restart.time<.25,'Restart does not return to beginning');
  report.controls.restart=true;
  await page.evaluate(()=>window.__podium.setPlaying(false));
  await page.locator('#timeline').evaluate(el=>{el.value=String(Number(el.max)*.65);el.dispatchEvent(new Event('input',{bubbles:true}));});
  const scrub=await page.evaluate(()=>window.__podium.getState());
  check(scrub.time>.3,'Timeline input does not scrub animation');
  report.controls.scrub=true;
  await page.locator('#play').click();
  await page.waitForFunction(previous=>window.__podium.getState().time!==previous,scrub.time,{timeout:10000});
  await page.locator('#play').click();
  const paused=await page.evaluate(()=>window.__podium.getState());
  report.controls.playPause=true;
  await page.evaluate(()=>window.__podium.setPlaying(false));
  await page.locator('label.fx').click();
  report.controls.effectsOff=await page.evaluate(()=>window.__podium.getState().effects===false);
  await page.locator('label.fx').click();
  report.controls.effectsOn=await page.evaluate(()=>window.__podium.getState().effects===true);
  check(report.controls.effectsOff&&report.controls.effectsOn,'Effects checkbox does not control effects');
  await page.locator('#effects').focus();
  await page.keyboard.press('Space');
  check(await page.evaluate(()=>window.__podium.getState().effects===false),'Effects checkbox is not keyboard operable');
  await page.keyboard.press('Space');
  check(await page.evaluate(()=>window.__podium.getState().effects===true),'Effects checkbox keyboard toggle cannot be restored');
  report.controls.effectsKeyboard=true;
  const sprayFrames=[];
  const atlasOffsets=[],flagPoses=[];
  for(let i=0;i<8;i++){
    await page.evaluate(time=>window.__podium.setTime(time),(i+.05)/12);
    sprayFrames.push(await page.evaluate(()=>window.__podium.getState().sprayFrame));
    const effects=await page.evaluate(()=>{
      const atlases=[],flags=[];
      window.__podium.scene.traverse(object=>{
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){const map=material?.map;if(map?.image?.width===1024&&map.image.height===128)atlases.push({visible:object.visible,offset:map.offset.x,repeat:map.repeat.x});}
        if(object.name.includes('Checkered')&&object.morphTargetInfluences)flags.push([...object.morphTargetInfluences]);
      });
      return {atlases,flags};
    });
    atlasOffsets.push(effects.atlases);flagPoses.push(effects.flags);
  }
  report.controls.sprayFrames=sprayFrames;
  check(new Set(sprayFrames).size===8&&sprayFrames.every(n=>Number.isInteger(n)&&n>=0&&n<8),'Spray does not advance through eight distinct atlas frames');
  report.controls.sprayAtlasOffsets=atlasOffsets;
  check(atlasOffsets.every((maps,i)=>maps.some(map=>map.visible&&map.offset===sprayFrames[i]/8&&map.repeat===.125)),'Actual visible spray texture does not use the eight atlas frames');
  report.controls.flagMorphs=flagPoses;
  check(flagPoses.every(poses=>poses.length>0)&&new Set(flagPoses.map(value=>JSON.stringify(value))).size>1,'Actual checkered cloth morph animation is static or missing');
  await page.locator('#clip').selectOption('trophy_lift');
  await page.evaluate(()=>{window.__podium.setPlaying(false);window.__podium.setTime(2.45);});
  await page.evaluate(()=>document.activeElement?.blur());
  const screenshot=path.join(out,'browser-844x390.jpg');
  await page.screenshot({path:screenshot,type:'jpeg',quality:86});
  report.screenshots.push({file:'verification/browser-844x390.jpg',bytes:(await stat(screenshot)).size});
  await page.setViewportSize({width:390,height:844});
  const portrait=await frame();
  report.portrait={viewport:{width:390,height:844},overflow:portrait.overflow,canvas:portrait.canvas};
  check(!portrait.overflow,'390x844 page overflows viewport');
  await exec('python3',['-c',`
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
root=Path(${JSON.stringify(shots)})
names=${JSON.stringify(['male','female'].flatMap(g=>ids.map(id=>`${g}-${id}`)))}
sheet=Image.new('RGB',(4*422,4*222),(10,17,30));draw=ImageDraw.Draw(sheet)
for i,name in enumerate(names):
    x=(i%4)*422;y=(i//4)*222
    image=Image.open(root/(name+'.jpg'));image.thumbnail((422,195),Image.Resampling.LANCZOS)
    sheet.paste(image,(x,y+25));draw.text((x+9,y+7),name,fill=(236,227,202))
sheet.save(${JSON.stringify(path.join(out,'browser-contact-sheet.webp'))},quality=76,method=6)
`]);
  const sheet=path.join(out,'browser-contact-sheet.webp');
  report.screenshots.push({file:'verification/browser-contact-sheet.webp',bytes:(await stat(sheet)).size});
  report.inputsUnchanged=JSON.stringify(await captureInputs())===JSON.stringify(report.inputs);
  check(report.inputsUnchanged,'Preview, assets, contracts or verifier changed during the browser run');
  report.passed=report.clips.length===16&&report.errors.length===0&&report.failedRequests.length===0&&report.httpErrors.length===0&&report.externalRequests.length===0;
  check(report.passed,'Browser recorded errors or incomplete animation coverage');
}catch(error){report.failure=error.stack;throw error;}
finally{
  // Keep complete measured coordinates while respecting the asset pack's 4 MB ceiling.
  await writeFile(path.join(out,'browser.json'),JSON.stringify(report)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));await rm(shots,{recursive:true,force:true});
}
console.log(JSON.stringify({passed:report.passed,clips:report.clips.length,errors:report.errors.length,screenshots:report.screenshots},null,2));
