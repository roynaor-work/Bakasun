// Input adapter for unmodified motion-qa-v1. Samples the actual delivered GLB.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = Object.freeze([{id:'coach-mascot-v1'}]);
function rotate([x,y,z,w],[a,b,c]) {
  const tx=2*(y*c-z*b), ty=2*(z*a-x*c), tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export async function loadLibraries({fps=60}={}) {
  if (!process.env.COACH_QA_ROOT) throw new Error('Set COACH_QA_ROOT to the unmodified motion-qa-v1 directory.');
  const {parseGLB,sampleGLB} = await import(pathToFileURL(path.join(process.env.COACH_QA_ROOT,'glb.mjs')));
  const settings=JSON.parse(await readFile(path.join(assetRoot,'source/qa-input.json'),'utf8'));
  const bytes=await readFile(path.join(assetRoot,settings.model));
  const hash=createHash('sha256').update(bytes).digest('hex');
  const glb=parseGLB(bytes);
  const clips=[];
  for(const animation of glb.json.animations) {
    const spec=settings.clips[animation.name];
    if(!spec) throw new Error(`Missing authored metadata for ${animation.name}`);
    const metadata={...spec, role:'coach',profile:'canonical18',sourceLibrary:'coach-mascot-v1',floorY:settings.floorY,soleLocal:settings.soleLocal,ballVisible:false,locomotion:false,coordinateSpace:'decoded GLB world'};
    const extraTimes=(metadata.supports??[]).flatMap(s=>[s.start,s.end]);
    const sampled=sampleGLB(glb,{animation:animation.name,fps,extraTimes});
    // Replace the stock single ankle probe with the authored shoe sole corners;
    // this affects the supplied floor probes only, not any joint or animation.
    metadata.floorProbeKind='four authored sole corners per shoe plus all joint centers';
    for (const frame of sampled.frames) frame.floorPoints=['LeftFoot','RightFoot'].flatMap(bone=>settings.soleCorners.map(local=>({bone,position:frame.joints[bone].map((v,i)=>v+rotate(frame.rotations[bone],local)[i])})));
    clips.push({id:animation.name,motionId:animation.name,role:'coach',profile:'canonical18',height:settings.heightMeters,duration:sampled.duration,frames:sampled.frames,metadata,source:{file:settings.model,sha256:hash,animation:animation.name}});
  }
  if(clips.length!==Object.keys(settings.clips).length) throw new Error('GLB and authored clip metadata differ');
  return [{id:'coach-mascot-v1',sport:'coach',version:1,title:'Coach mascot',clips,source:{ref:'working-tree',commit:'working-tree',path:'coach-mascot-v1',inputs:[{path:settings.model,bytes:bytes.length,sha256:hash}],geometryDecoded:false,adapter:'source/qa-sources.mjs; stock sampler and scoring thresholds unchanged'}}];
}
