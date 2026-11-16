// SPDX-License-Identifier: CC0-1.0
// Validate the delivered native files, independently of authored pose JSON.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {unpack,readAccessor} from './glb.mjs';
import {fk} from './rig.mjs';
import {sampleMotion} from '../runtime/player.mjs';
const base=new URL('../',import.meta.url),require=createRequire(`${process.env.KEEPER_TOOLS_DIR??'/tmp/keeper-tools'}/package.json`);
const validator=require('gltf-validator');
const catalog=JSON.parse(await readFile(new URL('catalog.json',base),'utf8'));
const expected=[['Root',null,[0,0,0]],['Hips','Root',[0,.86,0]],['Spine','Hips',[0,.2,0]],['Chest','Spine',[0,.18,0]],['Neck','Chest',[0,.1,0]],['Head','Neck',[0,.13,0]],
  ['LeftArm','Chest',[.16,.06,0]],['LeftForeArm','LeftArm',[0,-.27,0]],['LeftHand','LeftForeArm',[0,-.24,0]],['RightArm','Chest',[-.16,.06,0]],['RightForeArm','RightArm',[0,-.27,0]],['RightHand','RightForeArm',[0,-.24,0]],
  ['LeftUpLeg','Hips',[.1,0,0]],['LeftLeg','LeftUpLeg',[0,-.41,0]],['LeftFoot','LeftLeg',[0,-.37,0]],['RightUpLeg','Hips',[-.1,0,0]],['RightLeg','RightUpLeg',[0,-.41,0]],['RightFoot','RightLeg',[0,-.37,0]]];
const eq=(a,b,tolerance=1e-7)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
function skinFloor(glb,animation){
 const d=glb.document,joints=d.skins[0].joints,names=joints.map(j=>d.nodes[j].name);
 const binds=readAccessor(glb,d.skins[0].inverseBindMatrices).values;
 const tracks=animation.channels.map(c=>{const s=animation.samplers[c.sampler];return{name:d.nodes[c.target.node].name,path:c.target.path,times:readAccessor(glb,s.input).values,values:readAccessor(glb,s.output).values};});
 const times=tracks[0].times,frames=times.map((time,i)=>({time,hips:tracks.find(t=>t.name==='Hips'&&t.path==='translation').values.slice(i*3,i*3+3),
  rotations:Object.fromEntries(tracks.filter(t=>t.path==='rotation').map(t=>[t.name,t.values.slice(i*4,i*4+4)]))}));
 const vertices=[];
 for(let m=0;m<d.meshes.length;m++)for(let p=0;p<d.meshes[m].primitives.length;p++){
  const primitive=d.meshes[m].primitives[p],position=readAccessor(glb,primitive.attributes.POSITION),joint=readAccessor(glb,primitive.attributes.JOINTS_0),weight=readAccessor(glb,primitive.attributes.WEIGHTS_0);
  const divisor=weight.accessor.normalized?({5121:255,5123:65535}[weight.accessor.componentType]??1):1;
  for(let i=0;i<position.accessor.count;i++){
   const [x,y,z]=position.values.slice(i*3,i*3+3),influences=[];
   for(let k=0;k<4;k++){
    const w=weight.values[i*4+k]/divisor;if(w<=0)continue;const j=joint.values[i*4+k],b=binds.slice(j*16,j*16+16);
    influences.push({j,w,x:b[0]*x+b[4]*y+b[8]*z+b[12],y:b[1]*x+b[5]*y+b[9]*z+b[13],z:b[2]*x+b[6]*y+b[10]*z+b[14]});
   }
   vertices.push({mesh:m,primitive:p,vertex:i,influences});
  }
 }
 const duration=times.at(-1),sampleCount=Math.round(duration*60)+1;let minimumY=Infinity,worst;
 for(let i=0;i<sampleCount;i++){
  const time=Math.min(duration,i/60),world=fk(sampleMotion({frames,loop:false},time));
  const matrices=names.map(name=>{const {position:p,rotation:q}=world[name],[x,y,z,w]=q;return[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),p[1]];});
  for(const v of vertices){let y=0;for(const j of v.influences){const r=matrices[j.j];y+=j.w*(r[0]*j.x+r[1]*j.y+r[2]*j.z+r[3]);}
   if(y<minimumY){minimumY=y;worst={time,mesh:v.mesh,primitive:v.primitive,vertex:v.vertex,influences:v.influences.map(j=>({bone:names[j.j],weight:j.w}))};}
  }
 }
 return{sampleRate:60,sampleCount,vertices:vertices.length,minimumYMeters:minimumY,maximumDepthMeters:Math.max(0,-minimumY),worst,
  method:'Every skinned vertex, actual FLOAT tracks interpolated LINEAR/slerp at 60Hz; inverse binds and weights from final GLB. Supplemental diagnostic independent of motion-qa-v1 skeletal/probe score; excludes unsampled instants and inter-body collisions.'};
}
const records=[];
for(const entry of catalog.clips){
 const bytes=await readFile(new URL(entry.asset,base)),glb=unpack(bytes),d=glb.document,checks=[];
 const check=(id,pass,details)=>checks.push({id,pass:!!pass,...(details===undefined?{}:{details})});
 const sha256=createHash('sha256').update(bytes).digest('hex');
 check('catalog-sha256',sha256===entry.sha256);
 check('catalog-byte-count',bytes.length===entry.bytes);
 check('self-contained',!d.buffers.some(b=>b.uri)&&!(d.images??[]).some(i=>i.uri));
 check('no-geometry-compression',!(d.extensionsUsed??[]).some(e=>/draco|meshopt/i.test(e)));
 check('one-canonical-skin',d.skins?.length===1&&d.skins[0].joints.length===18);
 const joints=d.skins?.[0]?.joints??[];
 const canonical=joints.length===18&&joints.every((j,i)=>{
   const n=d.nodes[j],[name,parent,rest]=expected[i];
   const actualParent=d.nodes.find(p=>p.children?.includes(j))?.name??null;
   return n.name===name&&actualParent===parent&&eq(n.translation??[0,0,0],rest)&&eq(n.rotation??[0,0,0,1],[0,0,0,1])&&eq(n.scale??[1,1,1],[1,1,1]);
 });check('canonical-names-order-parents-rest',canonical);
 const animation=d.animations?.[0];
 check('single-named-animation',d.animations?.length===1&&animation?.name===entry.id);
 check('nineteen-native-channels',animation?.channels.length===19);
 const rotations=animation?.channels.filter(c=>c.target.path==='rotation')??[];
 check('all-eighteen-rotations',rotations.length===18&&expected.every(([name])=>rotations.some(c=>d.nodes[c.target.node].name===name)));
 const translations=animation?.channels.filter(c=>c.target.path==='translation')??[];
 check('only-hips-translation',translations.length===1&&d.nodes[translations[0].target.node].name==='Hips');
 let maxTimeError=0,maxNormError=0,finite=true,rootFixed=true,frameCount=0,timeArraysEqual=true;
 let referenceTimes;
 for(const channel of animation?.channels??[]){
   const sampler=animation.samplers[channel.sampler],times=readAccessor(glb,sampler.input).values,values=readAccessor(glb,sampler.output).values;
   check(`linear:${d.nodes[channel.target.node].name}:${channel.target.path}`,sampler.interpolation==='LINEAR');
   if(!referenceTimes)referenceTimes=times;
   else timeArraysEqual&&=eq(times,referenceTimes,0);
   frameCount=times.length;
   times.forEach((t,i)=>{maxTimeError=Math.max(maxTimeError,Math.abs(t-i/30));});
   finite&&=times.every(Number.isFinite)&&values.every(Number.isFinite);
   if(channel.target.path==='rotation')for(let i=0;i<values.length;i+=4){
     const q=values.slice(i,i+4);maxNormError=Math.max(maxNormError,Math.abs(Math.hypot(...q)-1));
     if(d.nodes[channel.target.node].name==='Root')rootFixed&&=eq(q,[0,0,0,1],0);
   }
 }
 check('uniform-30Hz-time',maxTimeError<1e-6&&timeArraysEqual,{maximumFloat32TimeErrorSeconds:maxTimeError});
 check('catalog-frame-count',entry.frameCount===frameCount);
 check('catalog-duration',Math.abs((entry.durationSeconds??entry.duration)-referenceTimes.at(-1))<1e-6);
 check('finite-native-values',finite);
 check('normalized-quaternions',maxNormError<1e-6,{maximumNormError:maxNormError});
 const root=d.nodes.find(n=>n.name==='Root');
 check('root-fixed',rootFixed&&eq(root.translation??[0,0,0],[0,0,0],0)&&eq(root.rotation??[0,0,0,1],[0,0,0,1],0));
 const result=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.asset,format:'glb',writeTimestamp:false,maxIssues:100});
 check('khronos-no-errors',result.issues.numErrors===0,{errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos});
 const skinnedFloor=skinFloor(glb,animation);
 check('sampled-skinned-mesh-above-floor',skinnedFloor.maximumDepthMeters<1e-6,{maximumDepthMeters:skinnedFloor.maximumDepthMeters});
 records.push({id:entry.id,asset:entry.asset,bytes:bytes.length,sha256,frameCount,duration:referenceTimes.at(-1),checks,validator:result,skinnedFloor,pass:checks.every(c=>c.pass)});
}
const output={schemaVersion:1,validatorVersion:validator.version(),canonicalBoneCount:18,nativeRate:30,scope:'Fourteen delivered GLBs; native data validation is not a full skinned-mesh collision audit.',
 summary:{clips:records.length,passed:records.filter(r=>r.pass).length,errors:records.reduce((s,r)=>s+r.validator.issues.numErrors,0),warnings:records.reduce((s,r)=>s+r.validator.issues.numWarnings,0),maximumSkinnedDepthMeters:Math.max(...records.map(r=>r.skinnedFloor.maximumDepthMeters)),allPassed:records.length===14&&records.every(r=>r.pass)},clips:records};
await mkdir(new URL('verification/',base),{recursive:true});
await writeFile(new URL('verification/assets.json',base),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.summary,null,2));
if(!output.summary.allPassed)process.exitCode=1;
