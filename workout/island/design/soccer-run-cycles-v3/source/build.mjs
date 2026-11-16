// SPDX-License-Identifier: CC0-1.0
// Deterministic authoring and packing. Writes only this new package.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bones} from './rig.mjs';
import {unpack,compact} from './glb.mjs';
import {buildLocomotion} from './locomotion.mjs';
import {buildKeeper} from './keeper.mjs';
import {buildBridges} from './bridges.mjs';

const base=new URL('../',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const locomotion=buildLocomotion();
const clips=[...locomotion,...buildKeeper(),...buildBridges(locomotion)];
if(new Set(clips.map(c=>c.id)).size!==clips.length)throw Error('Duplicate clip ID');
const data={schemaVersion:1,kind:'authored-canonical18-soccer-motion',version:'soccer-run-cycles-v3',
  units:'meters',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},
  rotationFormat:'parent-local absolute xyzw',rootMotion:false,
  authorship:{license:'CC0-1.0',capturedMocap:false,method:'Original trajectory-first authoring and analytic two-link IK'},
  skeleton:bones,clips};
await fs.mkdir(new URL('runtime/',base),{recursive:true});
await fs.mkdir(new URL('clips/',base),{recursive:true});
const source=Buffer.from(JSON.stringify(data)+'\n');
await fs.writeFile(new URL('runtime/motions.json',base),source);
const templateBytes=await fs.readFile(new URL('reference/mesh-template.glb',base));
const template=unpack(templateBytes),entries=[];
for(const motion of clips){
  const document=structuredClone(template.document),parts=[template.binary];
  let length=template.binary.length;
  function accessor(values,width){
    const bytes=Buffer.from(new Float32Array(values).buffer),padding=(4-length%4)%4;
    if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
    const bufferView=document.bufferViews.length;
    document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;
    const record={bufferView,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===3?'VEC3':'VEC4'};
    if(width===1){record.min=[Math.min(...values)];record.max=[Math.max(...values)];}
    document.accessors.push(record);return document.accessors.length-1;
  }
  const input=accessor(motion.frames.map(f=>f.time),1);
  const animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:motion.nativeRate,rootMotion:false,license:'CC0-1.0'}};
  function channel(name,path,values,width){
    const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw Error('Missing '+name);
    animation.channels.push({sampler:animation.samplers.length,target:{node,path}});
    animation.samplers.push({input,output:accessor(values,width),interpolation:'LINEAR'});
  }
  for(const {name}of bones){
    let previous;const values=[];
    for(const f of motion.frames){
      let q=f.rotations[name],n=Math.hypot(...q);q=q.map(v=>v/n);
      if(previous&&q.reduce((s,v,i)=>s+v*previous[i],0)<0)q=q.map(v=>-v);
      values.push(...q);previous=q;
    }
    channel(name,'rotation',values,4);
  }
  channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
  document.animations=[animation];document.buffers=[{byteLength:length}];
  document.asset.generator='soccer-run-cycles-v3 deterministic canonical18 120Hz';
  document.asset.copyright='CC0-1.0; fictional MakeHuman-derived repository mesh; see LICENSES.md';
  document.extras={library:data.version,id:motion.id,nativeRate:motion.nativeRate,canonicalBoneCount:18,rootMotion:false,compression:'none'};
  const bytes=compact(document,Buffer.concat(parts));
  await fs.writeFile(new URL(`clips/${motion.id}.glb`,base),bytes);
  const {frames,...entry}=motion;
  entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:hash(bytes),compression:'none'});
}
const {clips:unused,...header}=data;
const catalog={...header,sourceMotionSha256:hash(source),clips:entries,
  playback:{actorTranslation:'simulation-owned',rootMotion:false,referenceTravel:'Apply exactly once for validation/preview. Do not add it to simulation travel.',
    referee:'Playback rate = world speed / 5. Validated at 4, 5, 6 m/s.',
    bridges:'Use delivered start/stop clips with their matching external actor trajectory. See REPORT.md.'},
  sources:{baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    locomotionV2:'ec6c73949fb5820826b4c082972f5d4f1136641f',qa:'5eb4f093bc22523ee417a7f2345c3b813bffba24',
    mesh:{path:'reference/mesh-template.glb',sha256:hash(templateBytes),license:'CC0-1.0'}}};
await fs.writeFile(new URL('catalog.json',base),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({clips:entries.length,totalGlbBytes:entries.reduce((n,c)=>n+c.bytes,0),sourceMotionSha256:hash(source)}));
