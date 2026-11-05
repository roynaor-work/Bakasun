/** Controlled lighting/material comparisons, separate from claimed final renders. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const iteration=process.argv[2]||'06';
if(!/^\d{2}$/.test(iteration))throw Error('Expected iteration number');
const out=path.join(root,'iterations',iteration,'look-probes');await fs.mkdir(out,{recursive:true});
const session=await openPreview();
const {page}=session;
const captures=[];
try{
  await page.evaluate(async()=>{await soccerV7.setView('face');soccerV7.seek(.15);});
  for(const variant of ['baseline','hair-no-receive','hair-no-cast','eye-front-light','reflection-sharp','cornea-box-6','cornea-box-12']){
    await page.evaluate(variant=>{
      const {actors,scene,camera,environment}=soccerV7.inspect();
      if(environment.setReflection)environment.setReflection(variant==='cornea-box-6'?6:variant==='cornea-box-12'?12:8,0);
      for(const a of actors)a.model.traverse(o=>{if(o.isMesh&&o.material?.name==='HairCards'){o.receiveShadow=variant!=='hair-no-receive';o.castShadow=variant!=='hair-no-cast';}});
      const existing=scene.getObjectByName('Probe corneal key');if(existing)scene.remove(existing,existing.target);
      if(variant==='eye-front-light'){
        const rig=scene.getObjectByName('Camera-following light rig'),key=rig.children.find(o=>o.isDirectionalLight);
        const light=key.clone();light.name='Probe corneal key';light.castShadow=false;light.intensity=.22;
        light.position.copy(camera.position);light.position.x-=.12;light.position.y+=.1;
        light.target.position.copy(actors[0].bones.Head.getWorldPosition(scene.position.clone()));light.target.position.y+=.12;
        scene.add(light,light.target);
      }
      soccerV7.seek(.15);
    },variant);
    for(const [angle,yaw] of [['front',.13],['three-quarter',-.7]]){
      await page.evaluate(yaw=>soccerV7.setOrbit(yaw),yaw);
      const file=variant+'-'+angle+'-390x844.png';await page.screenshot({path:path.join(out,file)});captures.push({variant,file,state:await page.evaluate(()=>soccerV7.state())});
    }
  }
  await page.evaluate(async()=>{await soccerV7.setView('cloth');soccerV7.seek(.15);soccerV7.setOrbit(.13);});
  for(const scale of [.5,1.0,1.5]){
    await page.evaluate(scale=>{for(const a of soccerV7.inspect().actors)a.model.traverse(o=>{if(o.isMesh&&o.material?.name==='Cloth')o.material.normalScale.set(scale,-scale);});soccerV7.seek(.15);},scale);
    const file='cloth-normal-'+scale+'-390x844.png';await page.screenshot({path:path.join(out,file)});captures.push({normalScale:scale,file,state:await page.evaluate(()=>soccerV7.state())});
  }
  const loadedHashes=await page.evaluate(()=>soccerV7.inspect().data.hashes);
  const bytes=await fs.readFile(path.join(root,'vendor/viewer-runtime.js'));
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify({generatedAt:new Date().toISOString(),captures,loadedHashes,runtimeSha256:crypto.createHash('sha256').update(bytes).digest('hex'),errors:session.errors,remoteRequests:session.remoteRequests,purpose:'Controlled comparisons; not final asset quality evidence until a chosen change is integrated and recaptured.'},null,2)+'\n');
  console.log(JSON.stringify({captures:captures.length,errors:session.errors,remoteRequests:session.remoteRequests,out}));
}finally{await session.close();}
