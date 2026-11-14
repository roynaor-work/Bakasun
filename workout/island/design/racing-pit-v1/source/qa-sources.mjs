// Original CC0-1.0. Read actual delivered GLBs with the upstream diagnostic sampler.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = Object.freeze([{id: 'racing-pit-v1'}]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function rotate([x,y,z,w], [a,b,c]) {
  const tx=2*(y*c-z*b), ty=2*(z*a-x*c), tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export async function loadLibraries({fps=60}={}) {
  if (!process.env.PIT_QA_ROOT) throw new Error('Set PIT_QA_ROOT to the untouched motion-qa-v1 directory.');
  const {parseGLB,sampleGLB} = await import(pathToFileURL(path.join(process.env.PIT_QA_ROOT, 'glb.mjs')));
  const catalog=JSON.parse(await readFile(path.join(assetRoot,'source/model-catalog.json'),'utf8'));
  const clips=[], inputs=[];
  for(const actor of catalog.crew) {
    const bytes=await readFile(path.join(assetRoot,actor.file));
    const glb=parseGLB(bytes);
    inputs.push({path:actor.file,bytes:bytes.length,sha256:sha(bytes)});
    for(const animation of glb.json.animations) {
      const metadata={...animation.extras,role:actor.id,profile:'canonical18',
        floorProbeKind:'four actual sole corners per shoe plus all canonical joint centers',
        sourceLibrary:'racing-pit-v1',coordinateSpace:'decoded GLB world; baked root applied once'};
      const extraTimes=[...metadata.supports.flatMap(s=>[s.start,s.end]),...metadata.events.map(e=>e.time)];
      const sampled=sampleGLB(glb,{animation:animation.name,fps,extraTimes});
      // The stock sampler supplies an ankle probe. Add all four real shoe corners;
      // never alter any sampled joint, rotation, root, or support interval.
      for(const frame of sampled.frames) {
        frame.floorPoints=[];
        for(const bone of ['LeftFoot','RightFoot']) for(const x of [-.082,.082]) for(const z of [-.085,.175]) {
          const delta=rotate(frame.rotations[bone],[x,-.08,z]);
          frame.floorPoints.push({bone,position:frame.joints[bone].map((v,i)=>v+delta[i])});
        }
      }
      clips.push({id:`${actor.id}/${animation.name}`,motionId:animation.name,role:actor.id,profile:'canonical18',
        height:actor.heightMeters,duration:sampled.duration,frames:sampled.frames,metadata,
        source:{file:actor.file,sha256:sha(bytes),animation:animation.name}});
    }
  }
  return [{id:'racing-pit-v1',sport:'racing-pit',version:1,title:'Original canonical pit crew',clips,
    source:{ref:'codex/racing-pit-v1',commit:process.env.PIT_ASSET_COMMIT??'working-tree',
      path:'workout/island/design/racing-pit-v1',inputs,geometryDecoded:false,
      adapter:'source/qa-sources.mjs; stock sampler and all stock scoring thresholds unchanged'}}];
}
