/** Actual phone renders comparing PBR environment balance across complexions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const round=process.argv[2]||'12';
if(!/^\d{2}$/.test(round))throw Error('Expected iteration number');
const out=path.join(root,'iterations',round,'surface-probes');await fs.mkdir(out,{recursive:true});
const initial=await fs.readFile(path.join(root,'vendor/viewer-runtime.js'));
const s=await openPreview({dpr:1.5}),records=[];
try{
  for(const id of ['player-01','player-02','player-04','player-05']){
    await s.page.evaluate(async id=>{await soccerV7.setCharacter(id);await soccerV7.setView('face');soccerV7.setOrbit(.13);},id);
    for(const spec of [
      {name:'baseline',front:8,skin:1,cloth:1,hair:1,eye:1},
      {name:'balanced',front:8,skin:.55,cloth:.7,hair:.85,eye:2},
      {name:'eye-key',front:16,skin:.45,cloth:.7,hair:.85,eye:2},
    ]){
      await s.page.evaluate(spec=>{
        const {actors,environment}=soccerV7.inspect();environment.setReflection(spec.front,0);
        for(const a of actors)a.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.envMapIntensity=({Skin:spec.skin,Cloth:spec.cloth,HairCards:spec.hair,Eyes:spec.eye})[m.name]??1;});
        soccerV7.seek(.15);
      },spec);
      const file=id+'-'+spec.name+'-390x844.png';await s.page.screenshot({path:path.join(out,file),scale:'css'});records.push({id,...spec,file});
    }
  }
  if(!(await fs.readFile(path.join(root,'vendor/viewer-runtime.js'))).equals(initial))throw Error('Runtime changed during probe');
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify({kind:'controlled-PBR-comparison',generatedAt:new Date().toISOString(),deviceScaleFactor:1.5,screenshotScale:'css',runtimeSha256:crypto.createHash('sha256').update(initial).digest('hex'),loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),records,errors:s.errors,remoteRequests:s.remoteRequests,limits:'Review-only material changes. A selected setting must be integrated and recaptured before claiming a delivered improvement.'},null,2)+'\n');
  console.log(JSON.stringify({captures:records.length,errors:s.errors,remoteRequests:s.remoteRequests,out}));
}finally{await s.close();}
