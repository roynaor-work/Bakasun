// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {unpack,readAccessor} from './glb.mjs';
import {bones} from './rig.mjs';
const base=new URL('../',import.meta.url);
const require=createRequire(process.env.TENNIS_TOOLS_PACKAGE??'/tmp/tennis-motion-v2-tools/package.json');
const validator=require('gltf-validator');
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base)));
const reference=unpack(await fs.readFile(new URL('source/reference/grip-player.glb',base))).document;
const referenceMount=reference.nodes.find(n=>n.name==='racket_mount');
const referenceSkin=reference.skins[0];
const files=[];
const checks={exact24LogicalClips:catalog.clips.length===24,expectedAnimationInventory:true,fullBodyTracks:true,allWithinNewFolder:true,canonical18:true,canonicalRest:true,immutableGrip:true,noEquipmentAnimation:true,noBodyScaling:true,native30Hz:true,finiteChannels:true,quaternionUnit:true,sourceBindUnchanged:true};
for(const entry of Object.values(catalog.variants)){
 const bytes=await fs.readFile(new URL(entry.asset,base)),g=unpack(bytes),d=g.document;
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.asset,maxIssues:100});
 const names=d.skins[0].joints.map(i=>d.nodes[i].name);
 const expected=catalog.clips.map(c=>c.id).sort();
 checks.expectedAnimationInventory&&=JSON.stringify(d.animations.map(a=>a.name).sort())===JSON.stringify(expected);
 checks.canonical18&&=names.length===18&&names.every((name,i)=>name===bones[i].name);
 checks.sourceBindUnchanged&&=JSON.stringify(d.skins[0].joints)===JSON.stringify(referenceSkin.joints)&&JSON.stringify(readAccessor(g,d.skins[0].inverseBindMatrices).values)===JSON.stringify(readAccessor(unpack(await fs.readFile(new URL('source/reference/grip-player.glb',base))),referenceSkin.inverseBindMatrices).values);
 for(const b of bones){const n=d.nodes.find(x=>x.name===b.name),idx=d.nodes.indexOf(n),parent=d.nodes.find(x=>(x.children??[]).includes(idx))?.name??null;checks.canonicalRest&&=JSON.stringify(n.translation??[0,0,0])===JSON.stringify(b.rest)&&parent===b.parent&&JSON.stringify(n.rotation??[0,0,0,1])===JSON.stringify([0,0,0,1])&&JSON.stringify(n.scale??[1,1,1])===JSON.stringify([1,1,1]);}
 const mount=d.nodes.find(n=>n.name==='racket_mount');
 checks.immutableGrip&&=JSON.stringify(mount)===JSON.stringify(referenceMount);
 for(const animation of d.animations){
 const entryClip=catalog.clips.find(c=>c.id===animation.name);
 checks.fullBodyTracks&&=bones.every(b=>animation.channels.filter(c=>d.nodes[c.target.node].name===b.name&&c.target.path==='rotation').length===1)&&animation.channels.filter(c=>d.nodes[c.target.node].name==='Hips'&&c.target.path==='translation').length===1;
 for(const c of animation.channels){
  const n=d.nodes[c.target.node],s=animation.samplers[c.sampler],times=readAccessor(g,s.input).values,out=readAccessor(g,s.output);
  checks.native30Hz&&=times.length===Math.round(entryClip.duration*30)+1&&times.every((t,i)=>Math.abs(t-i/30)<2e-6);
  checks.noEquipmentAnimation&&=!/^(racket|grip$|head$|grip_hand_R)/.test(n.name);
  checks.noBodyScaling&&=c.target.path!=='scale'||n.name==='Ball';
  checks.finiteChannels&&=out.values.every(Number.isFinite);
  if(c.target.path==='rotation')for(let i=0;i<times.length;i++){
   const offset=(s.interpolation==='CUBICSPLINE'?i*3+1:i)*4;
   checks.quaternionUnit&&=Math.abs(Math.hypot(...out.values.slice(offset,offset+4))-1)<2e-6;
  }
 }}
 files.push({asset:entry.asset,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,animations:d.animations.length,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,issues:validation.issues.messages});
}
const trackedDiff=(await import('node:child_process')).execFileSync('git',['diff','--name-only'],{cwd:new URL('../../../../',base),encoding:'utf8'}).trim();
checks.allWithinNewFolder=!trackedDiff||trackedDiff.split('\n').every(f=>f.startsWith('workout/island/design/tennis-motion-v2/'));
const report={schemaVersion:1,validator:'Khronos glTF Validator 2.0.0-dev.3.10',checks,files,pass:Object.values(checks).every(Boolean)&&files.every(f=>f.errors===0)};
await fs.writeFile(new URL('verification/assets.json',base),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks,files:files.map(({issues,...f})=>f),pass:report.pass},null,2));
if(!report.pass)process.exitCode=1;
