/** Isolated authoring experiment; does not write the main viewer or assets. */
import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json'),{build}=require('esbuild');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out='/tmp/soccer-v7-world-inertia-prototype';await fs.mkdir(out,{recursive:true});
const original=await fs.readFile(path.join(root,'preview.js'),'utf8'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8')),snapshot=path.join(out,'snapshot'),inputs={};
for(const file of['preview.html','preview.css','vendor/data.js',...new Set(manifest.characters.flatMap(c=>(c.kits||[c]).flatMap(k=>[k.lod0,k.lod1])).map(model=>'offline/'+path.basename(model,'.glb')+'.js'))]){
  const bytes=await fs.readFile(path.join(root,file)),destination=path.join(snapshot,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);inputs[file]={bytes:bytes.length,sha256:hash(bytes)};
}
const functions=String.raw`
function prototypeWorldQuaternions(pose,actor,clip,seconds){
  const world={},modelQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.baseYaw+actor.curveAngle(pathAt(clip,seconds)));
  for(const bone of data.motion.skeleton.bones){const local=new THREE.Quaternion().fromArray(pose.rotations[bone.name]).normalize();world[bone.name]=(bone.parent?world[bone.parent].clone():modelQ.clone()).multiply(local).normalize();}
  return world;
}
function prototypeExp(vector){const length=vector.length();return length>1e-12?new THREE.Quaternion().setFromAxisAngle(vector.clone().multiplyScalar(1/length),length):new THREE.Quaternion();}
function inertialWorldPose(fade,target,clip,seconds,phaseRate,actor){
  const local=inertialPose(fade,target,clip,seconds,phaseRate),duration=poseFadeSeconds,worldTarget=prototypeWorldQuaternions(target,actor,clip,seconds);
  if(!fade.worldInertial){
    const epsilon=.0001,next=prototypeWorldQuaternions(sample(clip,seconds+epsilon*phaseRate),actor,clip,seconds+epsilon*phaseRate),offsets={},velocities={};
    const source=fade.sourceWorld||Object.fromEntries(Object.entries(prototypeWorldQuaternions(fade.pose,actor,clip,seconds)).map(([name,q])=>[name,q.toArray()]));
    for(const bone of data.motion.skeleton.bones){const name=bone.name;if(name==='Root')continue;
      const current=new THREE.Quaternion().fromArray(source[name]).normalize(),projected=current.clone();
      if(fade.previousWorld?.[name]&&fade.dt>0){const delta=current.clone().multiply(new THREE.Quaternion().fromArray(fade.previousWorld[name]).normalize().invert());if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);const velocity=new THREE.Vector3().fromArray(rotationLog(delta)).multiplyScalar(1/fade.dt);if(velocity.length()>16)velocity.setLength(16);projected.premultiply(prototypeExp(velocity.multiplyScalar(epsilon)));}
      const initial=current.clone().multiply(worldTarget[name].clone().invert()).normalize();if(initial.w<0)initial.set(-initial.x,-initial.y,-initial.z,-initial.w);
      const advanced=projected.multiply(next[name].clone().invert()).normalize();if(advanced.dot(initial)<0)advanced.set(-advanced.x,-advanced.y,-advanced.z,-advanced.w);
      const start=rotationLog(initial),later=rotationLog(advanced);offsets[name]=start;velocities[name]=later.map((value,index)=>(value-start[index])/epsilon);
    }
    fade.worldInertial={offsets,velocities};
  }
  const u=clamp(fade.elapsed/duration,0,1),h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,resultWorld={Root:worldTarget.Root},rotations={Root:target.rotations.Root.slice()};
  for(const bone of data.motion.skeleton.bones){const name=bone.name;if(name==='Root')continue;const offset=fade.worldInertial.offsets[name],velocity=fade.worldInertial.velocities[name],residual=new THREE.Vector3().fromArray(offset.map((value,index)=>h00*value+h10*duration*velocity[index]));const world=prototypeExp(residual).multiply(worldTarget[name]).normalize();resultWorld[name]=world;rotations[name]=resultWorld[bone.parent].clone().invert().multiply(world).normalize().toArray();}
  return{rotations,hipsOffsetMeters:local.hipsOffsetMeters};
}
`;
let variant=original;
const capture='    this.capturedVelocity=this.velocity.clone();';
if(!variant.includes(capture))throw Error('Capture instrumentation anchor changed');
variant=variant.replace(capture,"    if(this.fade){this.fade.sourceWorld=this.worldRotations&&structuredClone(this.worldRotations);this.fade.previousWorld=this.previousWorldRotations&&structuredClone(this.previousWorldRotations);}\n"+capture);
const poseEnd="    this.helper.visible=$('skeleton').checked;";
if(!variant.includes(poseEnd))throw Error('Displayed pose instrumentation anchor changed');
variant=variant.replace(poseEnd,"    this.previousWorldRotations=this.worldRotations;this.worldRotations=Object.fromEntries(Object.entries(this.bones).map(([name,bone])=>[name,bone.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]));\n"+poseEnd);
const call='pose=inertialPose(this.fade,target,c,this.sampleSeconds,entryRate);';
if(!variant.includes(call))throw Error('Inertia call anchor changed');variant=variant.replace(call,'pose=inertialWorldPose(this.fade,target,c,this.sampleSeconds,entryRate,this);');
variant=variant.replace('function duration(c=currentClip())',functions+'\nfunction duration(c=currentClip())');
await fs.writeFile(path.join(out,'world-preview.js'),variant);await fs.writeFile(path.join(out,'baseline-preview.js'),original);
for(const[name,contents]of[['baseline',original],['world',variant]]){const result=await build({stdin:{contents,resolveDir:root,sourcefile:'preview.js'},write:false,bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'eof',alias:{three:path.join(root,'vendor/three.module.js')},logLevel:'silent'});await fs.writeFile(path.join(out,name+'-runtime.js'),result.outputFiles[0].contents);}
let auditor=await fs.readFile(path.join(root,'source/audit-transitions.cjs'),'utf8');
auditor=auditor.replace('const root = path.resolve(__dirname, "..");','const root = '+JSON.stringify(root)+';');
const bytesRead='const bytes = fs.readFileSync(file);';
if(!auditor.includes(bytesRead))throw Error('Auditor byte-read anchor changed');
auditor=auditor.replace(bytesRead,'const relative = path.relative(root,file),snapshotFile=path.join('+JSON.stringify(snapshot)+',relative); const bytes = relative === "vendor/viewer-runtime.js" ? fs.readFileSync(process.env.MOTION_PROTOTYPE_RUNTIME) : fs.readFileSync(fs.existsSync(snapshotFile)?snapshotFile:file);');
await fs.writeFile(path.join(out,'audit-transitions.cjs'),auditor);
const metadata={schemaVersion:1,inputs,sourcePreviewSha256:hash(original),variantPreviewSha256:hash(variant),sourceAuditSha256:hash(await fs.readFile(path.join(root,'source/audit-transitions.cjs'))),out,method:'300ms one-time WORLD quaternion log/Hermite offsets; source+previous world quaternions captured after IK; target world quaternions from canonical parent chain/model yaw; Root authoritative; result converted to local under resulting parent; existing Hips positional inertia retained.',writesOutsideTemporaryDirectory:false};
await fs.writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata));
