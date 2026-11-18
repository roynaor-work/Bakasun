// SPDX-License-Identifier: CC0-1.0
// Independent serialized-asset, skinned-surface and C0/C1 measurements.
// This program only reports measurements. It never changes a motion or GLB.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Matrix4,Vector3,Quaternion} from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {unpack,readAccessor} from '../../soccer-header-v1/source/glb.mjs';
import {bones,I,fk} from './rig.mjs';
import {makeBridge,poseVelocity,slerp as normalizedSlerp} from '../runtime/player.mjs';

const base=new URL('../',import.meta.url),read=p=>readFile(new URL(p,base));
const hash=b=>createHash('sha256').update(b).digest('hex');
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.max(0,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
const max=values=>values.length?Math.max(...values):0;

/** Skin every POSITION using its actual inverse-bind matrix and normalized weights.
 * The copied model has an identity mesh transform. All primitives are included,
 * including shoe, hair and clothing surfaces that joint-only QA cannot inspect.
 */
export async function loadSkinProbe(relative='runtime/reference/idle_relaxed.glb'){
  const bytes=await read(relative),g=unpack(bytes),d=g.document,vertices=[];
  const parents=new Map();for(const [i,n]of d.nodes.entries())for(const c of n.children??[])parents.set(c,i);
  const boneNames=new Set(bones.map(b=>b.name));
  function localMatrix(n){return n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??I)),new Vector3(...(n.scale??[1,1,1])));}
  let primitiveCount=0;
  for(const [nodeIndex,node]of d.nodes.entries()){
    if(node.mesh===undefined)continue;
    if(node.skin===undefined){
      // Accessories such as the closed goalkeeper glove are rigid child meshes.
      // Bake every intervening node transform into the nearest canonical joint.
      let index=nodeIndex,transform=new Matrix4();
      while(index!==undefined&&!boneNames.has(d.nodes[index].name)){transform.premultiply(localMatrix(d.nodes[index]));index=parents.get(index);}
      const bone=index===undefined?'Root':d.nodes[index].name;
      for(const [primitiveIndex,p]of d.meshes[node.mesh].primitives.entries()){
        primitiveCount++;const positions=readAccessor(g,p.attributes.POSITION).values;
        for(let i=0;i<positions.length/3;i++)vertices.push({node:nodeIndex,primitive:primitiveIndex,vertex:i,material:d.materials?.[p.material]?.name??p.material,influences:[{bone,local:new Vector3(...positions.slice(i*3,i*3+3)).applyMatrix4(transform).toArray(),weight:1}]});
      }
      continue;
    }
    if(node.matrix||node.translation?.some(v=>v!==0)||node.rotation?.some((v,i)=>v!==I[i])||node.scale?.some(v=>v!==1))throw new Error('Skin probe expects the original identity mesh transform');
    const skin=d.skins[node.skin],inverse=readAccessor(g,skin.inverseBindMatrices).values;
    const matrices=skin.joints.map((_,i)=>new Matrix4().fromArray(inverse.slice(i*16,i*16+16)));
    for(const [primitiveIndex,p]of d.meshes[node.mesh].primitives.entries()){
      primitiveCount++;
      const positions=readAccessor(g,p.attributes.POSITION).values,joints=readAccessor(g,p.attributes.JOINTS_0).values,weightAccessor=readAccessor(g,p.attributes.WEIGHTS_0),weights=weightAccessor.values;
      const divisor=weightAccessor.accessor.normalized?({5121:255,5123:65535}[weightAccessor.accessor.componentType]??1):1;
      for(let i=0;i<positions.length/3;i++){
        const influences=[],sum=weights.slice(i*4,i*4+4).reduce((a,b)=>a+b/divisor,0);
        if(Math.abs(sum-1)>2e-5)throw new Error(`Non-normalized mesh skin weight at ${primitiveIndex}/${i}`);
        for(let j=0;j<4;j++){
          const weight=weights[i*4+j]/divisor;if(weight===0)continue;
          const joint=joints[i*4+j],bone=d.nodes[skin.joints[joint]].name;
          const local=new Vector3(...positions.slice(i*3,i*3+3)).applyMatrix4(matrices[joint]).toArray();
          influences.push({bone,local,weight});
        }
        vertices.push({node:nodeIndex,primitive:primitiveIndex,vertex:i,material:d.materials?.[p.material]?.name??p.material,influences});
      }
    }
  }
  const probe=p=>{
    const world=fk(p),transforms={};
    for(const bone of bones){
      const w=world[bone.name],m=new Matrix4().makeRotationFromQuaternion(new Quaternion(...w.rotation));m.setPosition(...w.position);transforms[bone.name]=m.elements;
    }
    let minimumY=Infinity,worst=null;
    for(const vertex of vertices){
      let y=0;
      for(const {bone,local,weight}of vertex.influences){const m=transforms[bone];y+=weight*(m[1]*local[0]+m[5]*local[1]+m[9]*local[2]+m[13]);}
      if(y<minimumY){minimumY=y;worst={node:vertex.node,primitive:vertex.primitive,vertex:vertex.vertex,material:vertex.material,bones:vertex.influences.map(i=>({bone:i.bone,weight:i.weight}))};}
    }
    if(!Number.isFinite(minimumY))throw new Error('Non-finite skinned surface result');
    return {minimumY,penetrationMeters:Math.max(0,-minimumY),worst};
  };
  return {probe,source:relative,sha256:hash(bytes),vertexCount:vertices.length,primitiveCount};
}

/** Parse native glTF LINEAR tracks, including omitted/default and constant channels. */
async function decode(relative){
  const bytes=await read(relative),g=unpack(bytes),d=g.document,a=d.animations?.[0];if(!a)throw new Error(`${relative}: no animation`);
  const tracks=a.channels.map(c=>{const s=a.samplers[c.sampler],v=readAccessor(g,s.output);if((s.interpolation??'LINEAR')!=='LINEAR')throw new Error(`${relative}: unsupported interpolation`);return {bone:d.nodes[c.target.node].name,path:c.target.path,times:readAccessor(g,s.input).values,width:v.width,values:v.values};});
  const nativeTimes=[...new Set(tracks.flatMap(t=>t.times))].sort((a,b)=>a-b),duration=nativeTimes.at(-1);
  function sampleTrack(track,t){
    const {times,values,width}=track;if(t<=times[0])return values.slice(0,width);if(t>=times.at(-1))return values.slice(-width);
    let lo=0,hi=times.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]>t)hi=m;else lo=m;}
    const u=(t-times[lo])/(times[hi]-times[lo]),x=values.slice(lo*width,lo*width+width),y=values.slice(hi*width,hi*width+width);return track.path==='rotation'?normalizedSlerp(x,y,u):x.map((v,i)=>v+(y[i]-v)*u);
  }
  const rest=Object.fromEntries(d.nodes.map(n=>[n.name,n]));
  function sample(time,{loop=false}={}){
    const t=loop&&duration?((time%duration)+duration)%duration:Math.min(duration,Math.max(0,time));
    const pose={hips:[...(rest.Hips?.translation??[0,.86,0])],rotations:Object.fromEntries(bones.map(b=>[b.name,[...(rest[b.name]?.rotation??I)]]))};
    for(const track of tracks){const v=sampleTrack(track,t);if(track.path==='rotation'&&pose.rotations[track.bone])pose.rotations[track.bone]=v;if(track.path==='translation'&&track.bone==='Hips')pose.hips=v;}
    return pose;
  }
  const rootTracks=tracks.filter(t=>t.bone==='Root'),otherTranslations=tracks.filter(t=>t.path==='translation'&&t.bone!=='Hips');
  const rootFixed=(rest.Root?.translation??[0,0,0]).every(v=>v===0)&&(rest.Root?.rotation??I).every((v,i)=>v===I[i])&&rootTracks.every(t=>t.values.every((v,i)=>Math.abs(v-(t.path==='rotation'?I[i%4]:t.path==='scale'?1:0))<1e-10));
  const scaleFixed=d.nodes.every(n=>(n.scale??[1,1,1]).every(v=>v===1))&&tracks.filter(t=>t.path==='scale').every(t=>t.values.every(v=>Math.abs(v-1)<1e-10));
  const offsetsFixed=bones.every(b=>distance(rest[b.name]?.translation??[0,0,0],b.rest)<1e-8)&&otherTranslations.every(t=>t.values.every((v,i)=>Math.abs(v-(rest[t.bone]?.translation??[0,0,0])[i%3])<1e-10));
  const parentIndices=new Map();for(const [i,n]of d.nodes.entries())for(const child of n.children??[])parentIndices.set(child,i);
  const hierarchyFixed=bones.every(b=>{const index=d.nodes.findIndex(n=>n.name===b.name),parent=parentIndices.get(index);return index>=0&&(b.parent===null?parent===undefined:d.nodes[parent]?.name===b.parent);});
  const compressionFree=!(d.extensionsUsed??[]).some(e=>/draco|meshopt/i.test(e))&&!d.bufferViews?.some(v=>v.extensions?.EXT_meshopt_compression);
  const dense30Hz=tracks.filter(t=>t.times.length>1&&!(t.path==='scale'&&t.values.every(v=>v===1))).every(t=>t.times.length===Math.round(duration*30)+1&&t.times.every((v,i)=>Math.abs(v-i/30)<1e-6));
  return {relative,sha256:hash(bytes),id:a.name,duration,nativeTimes,tracks,rootFixed,scaleFixed,offsetsFixed,hierarchyFixed,compressionFree,dense30Hz,sample};
}

function poseResidual(a,b){return {hipsMeters:distance(a.hips,b.hips),rotationDegrees:max(bones.map(bone=>angle(a.rotations[bone.name],b.rotations[bone.name]))) };}
function velocityResidual(a,b,p){
  let angular=0;for(const n of bones.map(b=>b.name)){const q=p.rotations[n],difference=a.rotations[n].map((v,i)=>v-b.rotations[n][i]),project=dot(difference,q)/dot(q,q);angular=Math.max(angular,2*Math.hypot(...difference.map((v,i)=>v-project*q[i])));}
  return {hipsMetersPerSecond:distance(a.hips,b.hips),rotationRadiansPerSecond:angular};
}
function canonicalCheck(motion){
  const frames=motion.frames,errors=[];let unitError=0,rootError=0,maxStepDegrees=0,maxSegmentError=0;
  if(frames.length!==Math.round(motion.duration*30)+1)errors.push('frame-count');
  const lengths={};
  for(let i=0;i<frames.length;i++){
    const p=frames[i];if(Math.abs(p.time-i/30)>1e-9)errors.push(`time-${i}`);
    if(Object.keys(p.rotations).length!==18)errors.push(`bones-${i}`);
    for(const b of bones){const q=p.rotations[b.name];if(!q?.every(Number.isFinite))throw new Error(`${motion.id}/${i}/${b.name}: invalid quaternion`);unitError=Math.max(unitError,Math.abs(Math.hypot(...q)-1));if(b.name==='Root')rootError=Math.max(rootError,distance(q,I));if(i)maxStepDegrees=Math.max(maxStepDegrees,angle(frames[i-1].rotations[b.name],q));}
    const world=fk(p);for(const b of bones){if(!b.parent||b.name==='Hips')continue;const l=distance(world[b.name].position,world[b.parent].position),key=b.name;lengths[key]??=l;maxSegmentError=Math.max(maxSegmentError,Math.abs(l-lengths[key]));}
  }
  return {frameCount:frames.length,fps:30,firstTime:frames[0].time,lastTime:frames.at(-1).time,unitError,rootError,maxStepDegrees,maxSegmentError,errors,pass:!errors.length&&unitError<1e-9&&rootError<1e-12&&maxSegmentError<1e-10};
}

async function main(){
  const data=JSON.parse(await read('runtime/motions.json')),catalog=JSON.parse(await read('runtime/catalog.json'));
  const skins={field:await loadSkinProbe(),keeper:await loadSkinProbe('runtime/keeper-open.glb'),keeperFist:await loadSkinProbe('runtime/keeper.glb')};
  const motions=data.clips,entries=new Map(catalog.clips.map(c=>[c.id,c]));
  const decoded=await Promise.all(motions.map(m=>decode(`runtime/${entries.get(m.id)?.asset??`clips/${m.id}.glb`}`))),byId=new Map(decoded.map((d,i)=>[motions[i].id,d]));
  const surfaces=[],clearance=[],checks=[];
  for(let j=0;j<motions.length;j++){
    const m=motions[j],d=decoded[j],skin=skins[m.id==='punch'?'keeperFist':(m.role??entries.get(m.id)?.role)==='keeper'?'keeper':'field'];checks.push({id:m.id,...canonicalCheck(m),serialized:{path:d.relative,sha256:d.sha256,rootFixed:d.rootFixed,scaleFixed:d.scaleFixed,bindOffsetsFixed:d.offsetsFixed,hierarchyFixed:d.hierarchyFixed,compressionFree:d.compressionFree,dense30Hz:d.dense30Hz,duration:d.duration}});
    let min=Infinity,worst=null,samples=0;
    const times=[...new Set([...m.frames.map(f=>f.time),...Array.from({length:Math.ceil(m.duration*60)+1},(_,i)=>Math.min(m.duration,i/60))])].sort((a,b)=>a-b);
    const perTime=[];
    for(const t of times){const p=d.sample(t),r=skin.probe(p);samples++;if(r.minimumY<min){min=r.minimumY;worst={time:t,...r.worst};}perTime.push({time:t,minimumY:r.minimumY,liftForOneMillimeter:Math.max(0,.001-r.minimumY)});}
    surfaces.push({id:m.id,skin:skin.source,samples,rate:60,minimumY:min,maximumPenetrationMeters:Math.max(0,-min),worst,pass:min>=-.002});clearance.push({id:m.id,skin:skin.source,perTime});
  }
  const seams=[];
  for(const m of motions){if(!m.next)continue;const a=byId.get(m.id),b=byId.get(m.next);if(!b)throw new Error(`Missing recovery ${m.next}`);const residual=poseResidual(a.sample(a.duration),b.sample(0));
    const av=poseVelocity(t=>a.sample(t),a.duration,{side:'left'}),bv=poseVelocity(t=>b.sample(t),0,{side:'right'}),vr=velocityResidual(av,bv,a.sample(a.duration));
    seams.push({from:m.id,to:m.next,...residual,velocity:vr,pass:residual.hipsMeters<1e-6&&residual.rotationDegrees<1e-3&&vr.hipsMetersPerSecond<.2&&vr.rotationRadiansPerSecond<2});
  }
  const references=await Promise.all(['idle_relaxed','run'].map(id=>decode(`runtime/reference/${id}.glb`))),bridges=[];
  for(const m of motions){
    const d=byId.get(m.id),entry=entries.get(m.id),skin=skins[m.id==='punch'?'keeperFist':(m.role??entry?.role)==='keeper'?'keeper':'field'];for(const reference of references)for(let phaseIndex=0;phaseIndex<8;phaseIndex++)for(const direction of ['entry','exit']){
      if(direction==='entry'&&(m.preceding??entry?.preceding))continue;
      if(direction==='exit'&&(m.next??entry?.next))continue;
      const phase=reference.duration*phaseIndex/8,rs=t=>reference.sample(t,{loop:true}),ms=t=>d.sample(t),from=direction==='entry'?rs:ms,to=direction==='entry'?ms:rs,fromTime=direction==='entry'?phase:d.duration,toTime=direction==='entry'?0:phase,duration=reference.id==='run'?.3:.2;
      const bridge=makeBridge({from,to,fromTime,toTime,duration}),start=bridge.sample(0),end=bridge.sample(duration),c0={start:poseResidual(start,from(fromTime)),end:poseResidual(end,to(toTime))},step=1e-7;
      const c1={start:velocityResidual(poseVelocity(bridge.sample,0,{side:'right',delta:step}),poseVelocity(from,fromTime,{side:'left'}),start),end:velocityResidual(poseVelocity(bridge.sample,duration,{side:'left',delta:step}),poseVelocity(to,toTime,{side:'right'}),end)};
      let rootFixed=true,finite=true,maxUnit=0,maxJointStep=0,maxRotationStep=0,minSkin=Infinity,previous=null;
      for(let i=0;i<=Math.ceil(duration*240);i++){
        const p=bridge.sample(Math.min(duration,i/240)),world=fk(p),skinValue=skin.probe(p);minSkin=Math.min(minSkin,skinValue.minimumY);
        finite&&=p.hips.every(Number.isFinite);for(const b of bones){const q=p.rotations[b.name];finite&&=q.every(Number.isFinite);maxUnit=Math.max(maxUnit,Math.abs(Math.hypot(...q)-1));if(previous){maxJointStep=Math.max(maxJointStep,distance(world[b.name].position,previous.world[b.name].position));maxRotationStep=Math.max(maxRotationStep,angle(q,previous.p.rotations[b.name]));}}
        rootFixed&&=p.rotations.Root.every((v,i)=>v===I[i]);previous={p,world};
      }
      const pass=Object.values(c0).every(r=>r.hipsMeters<1e-9&&r.rotationDegrees<1e-4)&&Object.values(c1).every(r=>r.hipsMetersPerSecond<1e-4&&r.rotationRadiansPerSecond<.01)&&finite&&rootFixed&&maxUnit<1e-12&&maxJointStep<.02&&maxRotationStep<10;
      bridges.push({clip:m.id,reference:reference.id,phaseIndex,phaseSeconds:phase,direction,duration,c0,c1,rootFixed,finite,maxUnitError:maxUnit,maximum240HzJointStepMeters:maxJointStep,maximum240HzRotationStepDegrees:maxRotationStep,minimumSkinnedVertexY:minSkin,skinFloorPass:minSkin>=-.002,pass});
    }
  }
  const summary={clips:motions.length,allSourceChecksPassed:checks.every(c=>c.pass&&c.serialized.rootFixed&&c.serialized.scaleFixed&&c.serialized.bindOffsetsFixed&&c.serialized.hierarchyFixed&&c.serialized.compressionFree&&c.serialized.dense30Hz),skinSamples:surfaces.reduce((a,c)=>a+c.samples,0),maximumSkinnedPenetrationMeters:max(surfaces.map(c=>c.maximumPenetrationMeters)),allSkinFloorsPassed:surfaces.every(c=>c.pass),seams:seams.length,allSeamsPassed:seams.every(s=>s.pass),bridges:bridges.length,allBridgesPassed:bridges.every(b=>b.pass),maximumBridgeSkinPenetrationMeters:max(bridges.map(b=>Math.max(0,-b.minimumSkinnedVertexY))),allBridgeSkinFloorsPassed:bridges.every(b=>b.skinFloorPass)};
  summary.pass=summary.allSourceChecksPassed&&summary.allSkinFloorsPassed&&summary.allSeamsPassed&&summary.allBridgesPassed&&summary.allBridgeSkinFloorsPassed;
  const skinEvidence=Object.fromEntries(Object.entries(skins).map(([role,s])=>[role,{source:s.source,sha256:s.sha256,vertices:s.vertexCount,primitives:s.primitiveCount}]));
  const evidence={schemaVersion:1,method:'Native serialized GLB FLOAT tracks sampled using glTF LINEAR/slerp; all vertices of every primitive skinned using the original inverse binds and WEIGHTS_0. No floor projection or runtime adjustment. Fixed bind offsets and limb lengths checked independently. C1 bridges use actual serialized idle/run tracks at eight cycle phases and displayed endpoint velocities.',scope:'Surface and seam measurements are independent of motion-qa-v1. Bridge C0/C1 is mathematical helper validation. Bridge skin-floor residuals are reported separately: the helper supplies local-pose continuity, and consuming world-space IK must preserve planted feet. No game code or phone hardware was exercised.',thresholds:{sourceUnitQuaternionError:1e-9,sourceRootError:1e-12,segmentLengthChangeMeters:1e-10,skinPenetrationMeters:.002,seamHipsMeters:1e-6,seamRotationDegrees:1e-3,seamVelocityHipsMetersPerSecond:.2,seamVelocityAngularRadiansPerSecond:2,bridgeEndpointHipsMeters:1e-9,bridgeEndpointRotationDegrees:1e-4,bridgeEndpointVelocityHipsMetersPerSecond:1e-4,bridgeEndpointVelocityAngularRadiansPerSecond:.01},skins:skinEvidence,summary,sourceChecks:checks,surfaceFloor:surfaces,seams,bridges};
  await mkdir(new URL('verification/',base),{recursive:true});await writeFile(new URL('verification/measurements.json',base),JSON.stringify(evidence,null,2)+'\n');await writeFile(new URL('verification/clearance.json',base),JSON.stringify({method:'Serialized native samples; suggested vertical corrections are measurements only, never applied here.',skins:skinEvidence,clips:clearance},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));if(!summary.pass)process.exitCode=1;
}
export {decode as decodeSerializedMotion};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
