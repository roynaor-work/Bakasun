/** Cold-source phone poses with an explicit RAM-only animation-data override. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const motionPath=process.argv[2]||'/tmp/soccer-v7-motion-coherent/animations.json';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),motionRaw=await fs.readFile(motionPath),motion=JSON.parse(motionRaw);
const dataRaw=await fs.readFile(path.join(root,'vendor/data.js'),'utf8'),runtime=await fs.readFile(path.join(root,'vendor/viewer-runtime.js'));
const payload=JSON.parse(dataRaw.slice(dataRaw.indexOf('globalThis.SOCCER_V7_DATA=')+'globalThis.SOCCER_V7_DATA='.length).trim().replace(/;$/,''));
payload.motion=motion;payload.floor=null;payload.hashes.motion=digest(motionRaw);
const override='globalThis.SOCCER_V7_DATA='+JSON.stringify(payload)+';';
const out=path.join(root,'iterations/21/motion-preflight/phone-poses');await fs.mkdir(out,{recursive:true});
const plans=[
  {id:'slide_tackle',character:'player-01',times:[7/30,.3,.4,17/30]},
  {id:'fall',character:'player-01',times:[0,1/12,1/6,7/30]},
  {id:'keeper_dive_right',character:'goalkeeper',times:[1/3,.4,.9,1.066667]},
  {id:'keeper_dive_high',character:'goalkeeper',times:[.9,1.033333,1.066667]},
];
const records=[],s=await openPreview({dpr:1.5,resourceOverrides:{'/vendor/data.js':override}});
try{
  for(const plan of plans){
    const clip=motion.clips.find(c=>c.id===plan.id);
    await s.page.evaluate(async p=>{soccerV7.setPlaying(false);await soccerV7.setCharacter(p.character);await soccerV7.setLOD(0);await soccerV7.setView('body');soccerV7.setClip(p.id);},plan);
    for(const size of[{width:390,height:844},{width:844,height:390}]){
      await s.page.setViewportSize(size);
      for(const seconds of plan.times){
        await s.page.evaluate(({seconds,duration})=>{soccerV7.seek(seconds/duration);soccerV7.setOrbit(-.9,0,1);},{seconds,duration:clip.duration});
        const file=plan.id+'-'+seconds.toFixed(6).replace('.','-')+'-'+size.width+'x'+size.height+'.png';await s.page.screenshot({path:path.join(out,file),scale:'css'});
        records.push({id:plan.id,character:plan.character,seconds,size,file,state:await s.page.evaluate(()=>soccerV7.state())});
      }
    }
  }
  if(!(await fs.readFile(path.join(root,'vendor/viewer-runtime.js'))).equals(runtime)||digest(await fs.readFile(motionPath))!==digest(motionRaw))throw Error('Motion/runtime snapshot changed during capture');
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify({kind:'cold-motion-source-candidate-phones',complete:false,generatedAt:new Date().toISOString(),motionSha256:digest(motionRaw),runtimeSha256:digest(runtime),actualDataSha256:digest(override),baseDataSha256:digest(dataRaw),loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),deviceScaleFactor:1.5,screenshotScale:'css',records,errors:s.errors,remoteRequests:s.remoteRequests,limits:'New authored motion is supplied only through an in-memory data response. Native15 meshes and native GLB animation tracks are unchanged; final reembedding/full-roster floor/controller verification remain mandatory. Cold poses do not prove natural continuous recovery, measured FPS, or a transition.'},null,2)+'\n');
  console.log(JSON.stringify({captures:records.length,out,errors:s.errors,remoteRequests:s.remoteRequests}));
}finally{await s.close();}
