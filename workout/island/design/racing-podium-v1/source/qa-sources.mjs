// SPDX-License-Identifier: CC0-1.0. Input adapter for unchanged motion-qa-v1.
// Joint samples, rotations, root motion and support declarations are never repaired.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export const SOURCES=Object.freeze([{id:'racing-podium-v1'}]);
const FILES=['assets/driver-male.glb','assets/driver-female.glb'];
const EXPECTED=['exit_car','helmet_lift','wave','victory_dance','disappointment','handshake','podium_idle','trophy_lift'];
const rotate=([x,y,z,w],[a,b,c])=>{
  const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return[a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
};
function matrixPoint(m,p){return[p[0]*m[0]+p[1]*m[4]+p[2]*m[8]+m[12],p[0]*m[1]+p[1]*m[5]+p[2]*m[9]+m[13],p[0]*m[2]+p[1]*m[6]+p[2]*m[10]+m[14]];}
// Decode the real sole vertices in the uncompressed delivery. Include every
// vertex in the bottom 3 mm of either rest shoe, with all its skin weights.
function soleVertices(glb,readAccessor){
  const result=[],j=glb.json;
  for(const node of j.nodes??[]){
    if(node.mesh===undefined||node.skin===undefined)continue;
    const skin=j.skins[node.skin],names=skin.joints.map(i=>j.nodes[i].name);
    const inverse=Array.from(readAccessor(glb,skin.inverseBindMatrices));
    for(const p of j.meshes[node.mesh].primitives){
      const a=p.attributes;
      if(a.JOINTS_0===undefined||a.WEIGHTS_0===undefined)throw Error('Skin missing JOINTS_0/WEIGHTS_0');
      const pos=readAccessor(glb,a.POSITION),joint=readAccessor(glb,a.JOINTS_0),weight=readAccessor(glb,a.WEIGHTS_0);
      for(const foot of ['LeftFoot','RightFoot']){
        const candidates=[];
        for(let i=0;i<pos.length/3;i++){
          let influence=0;for(let k=0;k<4;k++)if(names[joint[4*i+k]]===foot)influence+=weight[4*i+k];
          if(influence>.5)candidates.push(i);
        }
        const low=Math.min(...candidates.map(i=>pos[i*3+1]));
        for(const i of candidates.filter(i=>pos[i*3+1]<=low+.003)){
          const bind=Array.from(pos.slice(i*3,i*3+3)),terms=[];
          for(let k=0;k<4;k++)if(weight[i*4+k]>0){
            const b=joint[i*4+k],name=names[b];
            terms.push({name,weight:weight[i*4+k],local:matrixPoint(inverse.slice(b*16,b*16+16),bind)});
          }
          result.push({foot,terms});
        }
      }
    }
  }
  if(!result.length)throw Error('No actual skinned sole vertices were decoded.');
  return result;
}
export async function loadLibraries({fps=60}={}){
  if(!process.env.PODIUM_QA_ROOT)throw Error('Run through source/run-qa.mjs.');
  const{parseGLB,sampleGLB,readAccessor}=await import(pathToFileURL(path.join(process.env.PODIUM_QA_ROOT,'glb.mjs')));
  const clips=[],inputs=[];
  for(const file of FILES){
    const bytes=await readFile(path.join(root,file)),glb=parseGLB(bytes),role=path.basename(file,'.glb');
    const names=glb.json.animations.map(a=>a.name);
    if(names.length!==8||EXPECTED.some(n=>!names.includes(n)))throw Error(`${file}: expected exactly the eight requested clips`);
    const soles=soleVertices(glb,readAccessor);
    const actor=(glb.json.nodes??[]).find(n=>Number.isFinite(n.extras?.heightMeters));
    const height=actor?.extras.heightMeters;
    if(!height)throw Error(`${file}: declare actual heightMeters in actor node extras`);
    inputs.push({path:file,bytes:bytes.length,sha256:hash(bytes),heightMeters:height,soleVertices:soles.length});
    for(const animation of glb.json.animations){
      const metadata={...animation.extras,role,profile:'canonical18',sourceLibrary:'racing-podium-v1',
        coordinateSpace:'Decoded delivered GLB world; baked root applied once',
        floorProbeKind:'All actual vertices in the bottom 3 mm of either rest shoe, skinned with delivered weights and inverse binds; all canonical joint centers'};
      if(!Array.isArray(metadata.supports)||!metadata.supports.length)throw Error(`${file}/${animation.name}: missing declared support windows`);
      const extraTimes=[...metadata.supports.flatMap(s=>[s.start,s.end]),...(metadata.events??[]).map(e=>e.time)];
      const sampled=sampleGLB(glb,{animation:animation.name,fps,extraTimes});
      for(const f of sampled.frames)f.floorPoints=soles.map(({foot,terms})=>{
        const position=[0,0,0];
        for(const term of terms){
          const scale=f.scales[term.name]??[1,1,1],local=term.local.map((v,i)=>v*scale[i]);
          const delta=rotate(f.rotations[term.name],local),origin=f.joints[term.name];
          for(let i=0;i<3;i++)position[i]+=term.weight*(origin[i]+delta[i]);
        }
        return{bone:foot,position};
      });
      clips.push({id:`${role}/${animation.name}`,motionId:animation.name,role,profile:'canonical18',height,
        duration:sampled.duration,frames:sampled.frames,metadata,
        source:{file,sha256:hash(bytes),animation:animation.name}});
    }
  }
  return[{id:'racing-podium-v1',sport:'racing-podium',version:1,title:'Racing podium drivers',clips,
    source:{ref:'codex/racing-podium-v1',commit:process.env.PODIUM_ASSET_COMMIT??'working-tree',
      path:'workout/island/design/racing-podium-v1',inputs,geometryDecoded:true,
      adapter:'source/qa-sources.mjs; unchanged upstream sampler/scoring; actual sole vertex probes'}}];
}
