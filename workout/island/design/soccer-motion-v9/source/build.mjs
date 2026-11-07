/** Reproducible v9 build. Original motion only; unchanged CC0 v8 mesh streams.
 * Run node source/build.mjs from any directory. No existing files are written. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bones,point,rotate,add,mul,sub,mix,unit,fk} from './rig.mjs';
import {pack,unpack,compactGLB} from './compact-glb.mjs';
import {definitions as free} from './locomotion.mjs';
import {definitions as ball} from './ball-motions.mjs';
import {definitions as other} from './keeper-misc.mjs';
import {calibrate} from './calibrate.mjs';
import {pathFor} from './ball-paths.mjs';
const base=new URL('../',import.meta.url), runtime=new URL('runtime/',base);
const authoringNames=['rig.mjs','locomotion.mjs','ball-motions.mjs','keeper-misc.mjs','build.mjs','calibrate.mjs','ball-paths.mjs','compact-glb.mjs'];
const authoringHashes=()=>Promise.all(authoringNames.map(async name=>[`source/${name}`,createHash('sha256').update(await fs.readFile(new URL(name,import.meta.url))).digest('hex')])).then(Object.fromEntries);
const authoringFiles=await authoringHashes();
const definitions=[...free,...ball,...other];
if(definitions.length!==48||new Set(definitions.map(d=>d.id)).size!==48)throw Error('Expected exactly 48 unique new clips');
const sources={field:new URL('../soccer-motion-v8/runtime/player.glb',base),keeper:new URL('../soccer-motion-v8/runtime/keeper.glb',base)};
await fs.mkdir(new URL('clips/',runtime),{recursive:true});
const sourceBuffers=Object.fromEntries(await Promise.all(Object.entries(sources).map(async([role,url])=>[role,await fs.readFile(url)])));
const originalIds=(await import('../../soccer-motion-v8/runtime/catalog.mjs')).clips.map(d=>d.id);
const baked=[];
for(const d of definitions){
 if(originalIds.includes(d.id))throw Error(`Existing v8 id reused: ${d.id}`);
 const count=Math.round(d.duration*30);if(Math.abs(count/30-d.duration)>1e-8)throw Error(`${d.id} duration must be integer frames`);
 const frames=Array.from({length:count+1},(_,i)=>({time:i/30,...d.sample(i/30)}));
 if(d.loop){const a=frames[0],b=frames.at(-1);let error=Math.hypot(...sub(a.hips,b.hips));for(const bone of bones){const q=a.rotations[bone.name],r=b.rotations[bone.name];error=Math.max(error,Math.min(Math.hypot(...sub(q,r)),Math.hypot(...add(q,r))));}if(error>1e-5)throw Error(`${d.id} nonidentical loop endpoints: ${error}`);frames[frames.length-1]={...structuredClone(a),time:d.duration};}
 // Maintain a continuous quaternion hemisphere; glTF LINEAR uses shortest slerp.
 for(let i=1;i<frames.length;i++)for(const b of bones){let q=frames[i].rotations[b.name],previous=frames[i-1].rotations[b.name];if(q.reduce((v,x,j)=>v+x*previous[j],0)<0)frames[i].rotations[b.name]=q.map(v=>-v);}
 const events=(d.events||[]).map(e=>({...e,time:Math.max(0,Math.min(d.duration,Math.round(e.time*30)/30)),local:e.local||[0,0,0]}));
 const metadata={id:d.id,label:d.label,category:d.category,role:d.role||'field',asset:`clips/${d.id}.glb`,glb:`runtime/clips/${d.id}.glb`,duration:d.duration,durationSeconds:d.duration,loop:!!d.loop,events,supports:d.supports||[],rootMotion:false,travel:frames.map(f=>({time:f.time,position:d.travel?.(f.time)||[0,0,0]})),notes:d.notes||'',ballKind:d.ballKind||'none',metricsTargets:d.metricsTargets||{},source:`source/${free.includes(d)?'locomotion':ball.includes(d)?'ball-motions':'keeper-misc'}.mjs#${d.id}`,license:'CC0-1.0'};
 baked.push({d,frames,metadata});
}
const calibration=await calibrate(baked,sources);
for(const motion of baked){
 const {d,frames,metadata}=motion;metadata.ball=pathFor(motion);metadata.events=metadata.events.map(({time,type,bone,local,position})=>({time,type,bone,local,position}));
 const {document:json,binary}=unpack(sourceBuffers[metadata.role]);json.animations=[];
 const parts=[binary];let size=binary.length;
 const accessor=(values,width,type)=>{const padding=(4-size%4)%4;if(padding){parts.push(Buffer.alloc(padding));size+=padding;}const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeFloatLE(v,i*4));const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:size,byteLength:bytes.length});size+=bytes.length;parts.push(bytes);const index=json.accessors.length,a={bufferView:view,componentType:5126,count:values.length/width,type};if(type==='SCALAR'){a.min=[values[0]];a.max=[values.at(-1)];}json.accessors.push(a);return index;};
 const input=accessor(frames.map(f=>f.time),1,'SCALAR'),animation={name:d.id,samplers:[],channels:[],extras:{nativeRate:30,canonicalSkeleton:'motion2-18',loop:metadata.loop,rootMotion:false,license:'CC0-1.0',events:metadata.events}};
 for(const bone of bones){const index=json.nodes.findIndex(n=>n.name===bone.name),output=accessor(frames.flatMap(f=>f.rotations[bone.name]),4,'VEC4');animation.channels.push({sampler:animation.samplers.length,target:{node:index,path:'rotation'}});animation.samplers.push({input,output,interpolation:'LINEAR'});}
 const hips=json.nodes.findIndex(n=>n.name==='Hips'),output=accessor(frames.flatMap(f=>f.hips),3,'VEC3');animation.channels.push({sampler:animation.samplers.length,target:{node:hips,path:'translation'}});animation.samplers.push({input,output,interpolation:'LINEAR'});json.animations=[animation];
 json.asset.generator='Soccer Motion v9 · original procedural canonical-18 clips';json.asset.copyright='Original v9 motion CC0-1.0; CC0 fictional geometry retained from soccer-motion-v8; see LICENSES.md';json.extras={library:'soccer-motion-v9',id:d.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,externalTravel:true};json.buffers[0].byteLength=size;
 const bytes=compactGLB(pack(json,Buffer.concat(parts))).bytes;if(bytes.length>1500000)throw Error(`${d.id} exceeds 1.5MB`);
 await fs.writeFile(new URL(metadata.asset,runtime),bytes);metadata.bytes=bytes.length;metadata.sha256=createHash('sha256').update(bytes).digest('hex');
 metadata.events=metadata.events.map(({time,type,bone,local,position})=>({time,type,bone,local,position}));
}
const clips=baked.map(m=>m.metadata),idle='idle_relaxed';
const transitions=[];
for(const c of clips){const home=c.role==='keeper'?'goalkeeper_ready':idle;if(c.id!==home){transitions.push({from:home,to:c.id,trigger:`play:${c.id}`,blend:.18,earliest:0});if(c.id!=='slide_miss')transitions.push({from:c.id,to:home,trigger:'finished',blend:.18,earliest:c.loop?0:Math.max(0,c.duration-.2),latest:c.duration});}}
for(const c of clips.filter(c=>c.category==='free'&&c.id!==idle))for(const to of clips.filter(x=>x.category==='free'&&x.id!==c.id)){if(!transitions.some(e=>e.from===c.id&&e.to===to.id))transitions.push({from:c.id,to:to.id,trigger:to.id==='run_brake'?'stop':`move:${to.id}`,blend:to.id==='run_brake'?0:.16,earliest:0,...(c.id==='run'&&to.id==='run_brake'?{phase:0,grounded:true}:{} )});}
transitions.push({from:'slide_miss',to:'quick_getup',trigger:'recover',blend:0,earliest:clips.find(c=>c.id==='slide_miss').duration-.03333334});
const catalog=`/** Generated v9 data; geometry is CC0, all 48 motion tracks newly authored. */\nexport const bones=${JSON.stringify(bones)};\nexport const clips=${JSON.stringify(clips)};\nexport const transitions=${JSON.stringify(transitions)};\nexport const initial=${JSON.stringify(idle)};\nexport const CATALOG=clips;\nexport const CLIPS=Object.freeze(Object.fromEntries(clips.map(c=>[c.id,c])));\nexport const CLIP_IDS=Object.freeze(clips.map(c=>c.id));\nexport const CANONICAL_BONE_NAMES=Object.freeze(bones.map(b=>b.name));\n`;
await fs.writeFile(new URL('catalog.mjs',runtime),catalog);
const currentAuthoring=await authoringHashes();if(JSON.stringify(currentAuthoring)!==JSON.stringify(authoringFiles))throw Error('Authoring files changed during build; rebuild from stable inputs');
await fs.writeFile(new URL('verification/build.json',base),JSON.stringify({clipCount:clips.length,rate:30,authoringFiles,ballPathAudit:baked.map(m=>m.ballAudit).filter(Boolean),sourceHashes:Object.fromEntries(Object.entries(sourceBuffers).map(([role,b])=>[role,createHash('sha256').update(b).digest('hex')])),clips:baked.map(({d,frames,metadata:m})=>({id:d.id,bytes:m.bytes,sha256:m.sha256,frames:frames.length,maxTargetReachError:Math.max(...frames.map(f=>f.reachError||0))})),calibration},null,2)+'\n');
console.log(`Built ${clips.length} original clips, ${clips.reduce((s,c)=>s+c.bytes,0)} bytes; max file ${Math.max(...clips.map(c=>c.bytes))} bytes`);
