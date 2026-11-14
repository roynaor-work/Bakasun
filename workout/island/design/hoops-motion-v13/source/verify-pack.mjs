// SPDX-License-Identifier: CC0-1.0
// Verify the actual compact v12-shaped deliverable, including quantization.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANON_NAMES,normaliseTallClip} from '../../../minigames/athletes-core.mjs';
import {unpack} from '../../soccer-header-v1/source/glb.mjs';
const base=new URL('../',import.meta.url);
const motions=JSON.parse(await readFile(new URL('runtime/motions.json',base))),pack=JSON.parse(await readFile(new URL('runtime/motion.json',base)));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const checks=[];
if(pack.version!==1||pack.fps!==30||pack.bones.join()!==CANON_NAMES.join()||!pack.profiles.canonical)throw Error('Noncanonical tall-shaped pack.');
for(const motion of motions.clips){
  const encoded=pack.clips[motion.id];if(!encoded)throw Error('Missing packed clip '+motion.id);
  const decoded=normaliseTallClip(motion.id,encoded,30);
  let maxHipsMeters=0,maxQuaternionComponentError=0,maxBallMeters=0;
  for(const [i,f]of motion.frames.entries()){
    const d=decoded.frames[i];
    maxHipsMeters=Math.max(maxHipsMeters,distance(d.hips,f.hips.map((v,k)=>v-[0,.86,0][k])));
    for(const name of CANON_NAMES){const raw=f.rotations[name],q=raw.map(v=>v/Math.hypot(...raw));maxQuaternionComponentError=Math.max(maxQuaternionComponentError,Math.min(distance(d.rot[name],q),distance(d.rot[name],q.map(v=>-v))));}
  }
  const ballExpected=motion.id==='idle_ball'||motion.id.startsWith('dribble_');
  if(ballExpected){
    const raw=Buffer.from(encoded.ball??'','base64'),ball=new Int16Array(raw.buffer,raw.byteOffset,raw.length/2);
    if(ball.length!==motion.frames.length*3)throw Error('Packed ball length mismatch '+motion.id);
    for(const [i,f]of motion.frames.entries()){
      const keys=motion.ball.samples;let j=keys.findIndex(k=>k.time>=f.time);if(j<0)j=keys.length-1;
      const b=keys[j],a=keys[Math.max(0,j-1)],u=b.time>a.time?(f.time-a.time)/(b.time-a.time):0,expected=a.position.map((v,k)=>v+(b.position[k]-v)*u);
      maxBallMeters=Math.max(maxBallMeters,distance(expected,[ball[i*3]/10000,ball[i*3+1]/10000,ball[i*3+2]/10000]));
    }
  }
  const events=(motion.events??[]).every(e=>(encoded.events[e.type??e.name]??[]).includes(e.time??e.timeSeconds??e.atSeconds));
  const passed=encoded.frames===motion.frames.length&&Math.abs(encoded.duration-(encoded.frames-1)/30)<1e-7&&maxHipsMeters<.00009&&maxQuaternionComponentError<.00007&&maxBallMeters<.00009&&events&&(ballExpected?!!encoded.ball:encoded.ball===null);
  checks.push({id:motion.id,frames:encoded.frames,maxHipsMeters,maxQuaternionComponentError,maxBallMeters,eventsPreserved:events,ballTrackEncoded:!!encoded.ball,passed});
}
const result={schemaVersion:1,format:'hoops-tall v12 version1/fps30/int16 canonical18',profile:'canonical',scope:'Encoding/round-trip verification for canonical proportions. Original tall guard/wing/center retargeting is not applied by this pack.',clips:checks.length,maxHipsQuantizationMeters:Math.max(...checks.map(c=>c.maxHipsMeters)),maxBallQuantizationMeters:Math.max(...checks.map(c=>c.maxBallMeters)),checks,passed:checks.length===32&&checks.every(c=>c.passed)};
const catalog=JSON.parse(await readFile(new URL('runtime/catalog.json',base))),modelBytes=await readFile(new URL('runtime/'+catalog.sharedModel.asset,base)),model=unpack(modelBytes).document;
result.sharedModel={
  sha256:createHash('sha256').update(modelBytes).digest('hex'),
  canonical18:CANON_NAMES.every(n=>model.skins[0].joints.some(i=>model.nodes[i].name===n))&&model.skins[0].joints.length===18,
  noCompression:!(/KHR_draco_mesh_compression|EXT_meshopt_compression/.test(JSON.stringify(model))),
  selfContained:!model.buffers.some(b=>b.uri)&&!(model.images??[]).some(i=>i.uri),
};
result.passed&&=result.sharedModel.sha256===catalog.sharedModel.sha256&&result.sharedModel.canonical18&&result.sharedModel.noCompression&&result.sharedModel.selfContained;
await writeFile(new URL('verification/pack.json',base),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({clips:result.clips,passed:result.passed,maxHipsQuantizationMeters:result.maxHipsQuantizationMeters,maxBallQuantizationMeters:result.maxBallQuantizationMeters}));
if(!result.passed)process.exitCode=1;
