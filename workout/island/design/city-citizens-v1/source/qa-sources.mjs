// Original CC0-1.0. Native delivered GLBs, read by the unchanged upstream sampler.
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SOURCES=Object.freeze([{id:'city-citizens-v1'}]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function rotate([x,y,z,w],[a,b,c]){const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];}
export async function loadLibraries({fps=120,onlyFirst=false}={}){
  const upstream=process.env.CITY_QA_ROOT;if(!upstream)throw Error('CITY_QA_ROOT required');
  const {parseGLB,sampleGLB}=await import(pathToFileURL(path.join(upstream,'glb.mjs')).href);
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  const clips=[],inputs=[];
  const assets=manifest.assets.filter(a=>a.category==='citizen');
  for(const asset of onlyFirst?assets.slice(0,1):assets){
    const file=asset.file??asset.path,bytes=await readFile(path.join(root,file)),glb=parseGLB(bytes),assetId=`${asset.identity}-${asset.variant}`;
    inputs.push({path:file,bytes:bytes.length,sha256:sha(bytes)});
    for(const animation of glb.json.animations){
      const metadata={...animation.extras,role:assetId,profile:'canonical18',sourceLibrary:'city-citizens-v1',
        ballVisible:false,ballContactExpected:false,checkHingeDirection:true,soleLocal:[0,-.08,0],
        floorProbeKind:'decoded canonical sole points plus skeletal joint centers; separate full skinned mesh floor audit',
        coordinateSpace:'decoded GLB plus explicit simulation reference travel applied once',events:animation.extras?.events??[],supports:animation.extras?.supports??[]};
      if(!metadata.supports.length&&['both-feet','seat-and-feet'].includes(metadata.support))metadata.supports=['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:metadata.duration,local:[0,-.08,0]}));
      if(!metadata.supports.length)throw Error(`Missing authored supports ${file}/${animation.name}`);
      const locomotion=['walk','run'].includes(animation.name),speed=metadata.speed??metadata.expectedRootSpeed??0;
      metadata.locomotion=locomotion;metadata.symmetryMode=locomotion?'gait':'structural';
      if(locomotion&&!(speed>0))throw Error(`Missing in-place travel speed ${file}/${animation.name}`);
      const sampled=sampleGLB(glb,{animation:animation.name,fps,extraTimes:[...metadata.supports.flatMap(s=>[s.start,s.end]),...metadata.events.map(e=>e.time)]});
      for(const f of sampled.frames){
        f.rawJoints=structuredClone(f.joints);f.rawRotations=structuredClone(f.rotations);f.assetRoot=[...f.root];
        const reference=[0,0,locomotion?speed*f.t:0];f.referenceRoot=reference;
        f.joints=Object.fromEntries(Object.entries(f.joints).map(([n,p])=>[n,add(p,reference)]));f.root=add(f.root,reference);
        // Upstream sole offsets are defined in unscaled canonical metres.
        f.floorPoints=['LeftFoot','RightFoot'].map(bone=>({bone,position:add(f.joints[bone],rotate(f.rotations[bone],[0,-.08*(f.scales?.[bone]?.[1]??1),0]))}));
      }
      const height=asset.bounds?asset.bounds.max[1]-asset.bounds.min[1]:sampled.height;
      clips.push({id:`${assetId}/${animation.name}`,motionId:animation.name,role:assetId,profile:'canonical18',height,duration:sampled.duration,frames:sampled.frames,metadata,
        source:{file,sha256:sha(bytes),animation:animation.name}});
    }
  }
  return [{id:'city-citizens-v1',sport:'city-citizens',version:1,title:'City citizens native GLB motion',clips,
    source:{ref:'codex/city-citizens-v1',commit:process.env.CITY_ASSET_COMMIT??'working-tree',path:'workout/island/design/city-citizens-v1',inputs,geometryDecoded:false,
      adapter:'native GLB poses; all scoring thresholds unchanged; explicit +Z in-place travel scenario, raw poses preserved for continuity'}}];
}
