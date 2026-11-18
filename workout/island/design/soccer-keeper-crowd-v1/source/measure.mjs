// SPDX-License-Identifier: CC0-1.0. Supplement unchanged QA with explicit support and atlas measurements.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {rotate,vadd} from './rig-ops.mjs';
const require=createRequire(import.meta.url),sharp=require('sharp'),root=new URL('../',import.meta.url);
const {sampleGLB}=await import(pathToFileURL((process.env.KEEPER_QA_DIR??'/tmp/bakasun-keeper-qa-v1')+'/workout/island/design/motion-qa-v1/glb.mjs'));
const catalog=JSON.parse(await readFile(new URL('runtime/catalog.json',root))),measurements=[];
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
for(const entry of catalog.clips){
 const bytes=await readFile(new URL(entry.animation,root)),native=sampleGLB(bytes,{animation:entry.id,fps:60,extraTimes:entry.metadata.supports.flatMap(s=>[s.start,s.end])});
 const supports=entry.metadata.supports.map(w=>{const points=native.frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6).map(f=>({t:f.t,point:vadd(f.joints[w.bone],rotate(w.local,f.rotations[w.bone]))}));return {...w,samples:points.length,maxAnchorErrorMeters:Math.max(...points.map(p=>dist(p.point,w.anchor))),maxHeightErrorMeters:Math.max(...points.map(p=>Math.abs(p.point[1]-w.anchor[1])))};});
 const first=native.frames[0],last=native.frames.at(-1),endpointJointDelta=Math.max(...Object.keys(first.joints).map(b=>dist(first.joints[b],last.joints[b])));
 const dense=JSON.parse(await readFile(new URL(`runtime/keyframes/${entry.id}.json`,root)));
 if(dense.poses.length!==Math.round(entry.duration*30)+1||dense.poses.some((p,i)=>Math.abs(p.t-i/30)>1e-9))throw Error('Non-uniform author samples');
 if(supports.some(s=>s.maxAnchorErrorMeters>.002))throw Error('Support misses anchor');
 measurements.push({id:entry.id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds:native.duration,authorFps:30,authorFrames:dense.poses.length,auditFrames:native.frames.length,boneCount:Object.keys(first.joints).length,supports,endpointJointDeltaMeters:endpointJointDelta,endpointVelocityDeltaMetersPerSecond:Math.max(...Object.keys(first.joints).map(b=>{const a=native.frames[1],z=native.frames.at(-2),v0=first.joints[b].map((v,i)=>(a.joints[b][i]-v)/(a.t-first.t)),v1=last.joints[b].map((v,i)=>(v-z.joints[b][i])/(last.t-z.t));return dist(v0,v1);})),maxRootHeightMeters:Math.max(...native.frames.map(f=>f.root[1]))});
}
const atlas=await sharp(new URL('runtime/crowd-atlas.png',root).pathname).ensureAlpha().raw().toBuffer(),source=await sharp(new URL('../../soccer-stadium-v8/runtime/crowd-atlas.webp',import.meta.url).pathname).ensureAlpha().raw().toBuffer();
const originalPixelsEqual=source.equals(atlas.subarray(0,source.length));if(!originalPixelsEqual)throw Error('Original atlas pixels changed');
const manifest=JSON.parse(await readFile(new URL('runtime/crowd-manifest.json',root))),variants=JSON.parse(await readFile(new URL('source/crowd-variants.json',root)));
const cellMargins=manifest.cells.filter(c=>c.pose==='hands_up').map(c=>{const{x,y,width,height}=c.pixelRect;let minX=256,minY=256,maxX=-1,maxY=-1;for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)if(atlas[((y+yy)*1024+x+xx)*4+3]){minX=Math.min(minX,xx);minY=Math.min(minY,yy);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,yy);}return {variant:c.variant,alphaBounds:[minX,minY,maxX,maxY],minimumGutterPixels:Math.min(minX,minY,255-maxX,255-maxY),supporters:variants[c.variant].people.length,raisedHands:variants[c.variant].people.length*2};});
if(cellMargins.some(c=>c.minimumGutterPixels<4))throw Error('Crowd cell gutter smaller than 4 px');
const result={pass:true,clips:measurements,crowd:{bytes:(await stat(new URL('runtime/crowd-atlas.png',root))).size,width:1024,height:2048,decodedBytes:1024*2048*4,sourceDecodedBytes:1024*1024*4,originalPixelsEqual,cells:32,raisedVariants:16,raisedHands:96,cellMargins},limitations:['Skeletal sole and palm points are measured, rather than every mesh vertex.','The 18-bone rig has no finger channels; the bundled model has a permanently closed right glove.','Native 30 Hz interpolation is audited at 60 Hz, without runtime IK or blending.']};
await writeFile(new URL('qa/measurements.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,minimumGutter:Math.min(...cellMargins.map(c=>c.minimumGutterPixels)),handSupportError:measurements[0].supports.find(s=>s.bone==='RightHand').maxAnchorErrorMeters}));
