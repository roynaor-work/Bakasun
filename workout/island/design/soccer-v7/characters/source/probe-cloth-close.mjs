/** Controlled phone-size cloth-normal comparison; delivered maps stay untouched. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const out=path.join(root,'iterations/16/cloth-probes');await fs.mkdir(out,{recursive:true});
const runtime=await fs.readFile(path.join(root,'vendor/viewer-runtime.js'));
const s=await openPreview({dpr:1.5}),records=[];
try{
  for(const id of ['player-01','player-06']){
    await s.page.evaluate(async id=>{await soccerV7.setCharacter(id);await soccerV7.setView('cloth');soccerV7.setClip('idle');soccerV7.seek(.15);soccerV7.setOrbit(.13);},id);
    for(const scale of [.5,.8,1.1]){
      await s.page.evaluate(scale=>{for(const a of soccerV7.inspect().actors)a.model.traverse(o=>{if(o.isMesh&&o.material?.name==='Cloth')o.material.normalScale.set(scale,-scale);});soccerV7.seek(.15);},scale);
      const file=id+'-normal-'+scale+'-390x844.png';await s.page.screenshot({path:path.join(out,file),scale:'css'});records.push({id,normalScale:[scale,-scale],file});
    }
  }
  if(!(await fs.readFile(path.join(root,'vendor/viewer-runtime.js'))).equals(runtime))throw Error('Viewer changed during comparison');
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify({kind:'controlled-cloth-PBR-comparison',generatedAt:new Date().toISOString(),viewport:[390,844],deviceScaleFactor:1.5,screenshotScale:'css',runtimeSha256:crypto.createHash('sha256').update(runtime).digest('hex'),loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),records,errors:s.errors,remoteRequests:s.remoteRequests,limits:'Candidate material settings in memory; only an integrated, recaptured setting counts as a delivered change.'},null,2)+'\n');
  console.log(JSON.stringify({captures:records.length,errors:s.errors,out}));
}finally{await s.close();}
