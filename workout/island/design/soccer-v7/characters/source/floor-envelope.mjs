/**
 * Full decoded-skinned-mesh clearance envelope, with planted soles preserved.
 * node .../source/floor-envelope.mjs
 * Optional: --model models/player-01-lod0.glb --clip idle --out /tmp/probe.json
 * Requires development tools outside the repository, selected by SOCCER_V7_TOOLS.
 * Exact clips only: the viewer must scan actual geometry during transitions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {sampleClip,contactsAt,applyPose,enforceContacts} from './motion-runtime.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
const output=arg('--out')?path.resolve(arg('--out')):path.join(root,'verification/floor-envelope.json');
const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const auditSourceSha256=hash(await fs.readFile(fileURLToPath(import.meta.url)));
const motionBytes=await fs.readFile(path.join(root,'animations.json')),motion=JSON.parse(motionBytes);
const runtimeSha256=hash(await fs.readFile(path.join(root,'source/motion-runtime.js')));
const motionSha256=hash(motionBytes),sampleRateHz=120,probeRateHz=240,clearanceMeters=.0015,numericalToleranceMeters=.00002,maximumAnchorErrorMeters=.002;
const names=new Set(motion.skeleton.bones.map(b=>b.name));
const files=(await fs.readdir(path.join(root,'models'))).filter(f=>f.endsWith('.glb')).sort().map(f=>'models/'+f).filter(f=>!arg('--model')||f===arg('--model'));
const clips=motion.clips.filter(c=>!arg('--clip')||c.id===arg('--clip'));
if(!files.length||!clips.length)throw Error('No matching models/clips');
const models={},modelSha256={},reports=[],failures=[];
const startedAt=new Date().toISOString();
let vertexEvaluations=0,totalSamples=0,totalMidpoints=0;

function sampler(doc) {
  const group=new THREE.Group(),nodes=doc.getRoot().listNodes(),jointSet=new Set(doc.getRoot().listSkins().flatMap(s=>s.listJoints()));
  const objects=new Map(nodes.map(node=>{
    const o=jointSet.has(node)?new THREE.Bone():new THREE.Object3D();o.name=node.getName();o.position.fromArray(node.getTranslation());o.quaternion.fromArray(node.getRotation());o.scale.fromArray(node.getScale());return[node,o];
  }));
  const parented=new Set();
  for(const node of nodes)for(const child of node.listChildren()){objects.get(node).add(objects.get(child));parented.add(child);}
  for(const node of nodes)if(!parented.has(node))group.add(objects.get(node));
  const bones=Object.fromEntries(nodes.filter(n=>names.has(n.getName())).map(n=>[n.getName(),objects.get(n)]));
  if(Object.keys(bones).length!==18)throw Error('Expected exact canonical18 bones');
  const pieces=[];
  for(const node of nodes) {
    const mesh=node.getMesh();if(!mesh)continue;
    const skin=node.getSkin(),joints=skin?.listJoints().map(j=>objects.get(j)),inverse=skin?.getInverseBindMatrices();
    const matrices=joints?.map((_,i)=>new THREE.Matrix4().fromArray(inverse.getElement(i,[])));
    for(const primitive of mesh.listPrimitives()) {
      const p=primitive.getAttribute('POSITION'),j=primitive.getAttribute('JOINTS_0'),w=primitive.getAttribute('WEIGHTS_0');
      const count=p.getCount(),positions=new Float64Array(count*3),indices=new Uint16Array(count*4),weights=new Float64Array(count*4),value=[];
      for(let i=0;i<count;i++) {
        p.getElement(i,value);positions.set(value.slice(0,3),i*3);
        if(j&&w){j.getElement(i,value);indices.set(value.slice(0,4),i*4);w.getElement(i,value);weights.set(value.slice(0,4),i*4);}
      }
      pieces.push({count,positions,indices,weights,joints,matrices,material:primitive.getMaterial()?.getName()||'unnamed',rows:joints?.map(()=>new Float64Array(4)),object:objects.get(node),skinned:!!(joints&&j&&w)});
    }
  }
  const scratch=new THREE.Matrix4();
  let maxResidual=0,maxSoleAnchorError=0,minimumByMaterial={};
  const update=()=>group.updateMatrixWorld(true);
  function minimumY() {
    update();let minimum=Infinity;minimumByMaterial={};
    for(const piece of pieces) {
      const p=piece.positions,j=piece.indices,w=piece.weights;let pieceMinimum=Infinity;
      if(piece.skinned) {
        const r=piece.rows;
        for(let i=0;i<piece.joints.length;i++){const e=scratch.multiplyMatrices(piece.joints[i].matrixWorld,piece.matrices[i]).elements;r[i][0]=e[1];r[i][1]=e[5];r[i][2]=e[9];r[i][3]=e[13];}
        for(let i=0;i<piece.count;i++) {
          const x=p[i*3],y=p[i*3+1],z=p[i*3+2],base=i*4;let sy=0;
          for(let k=0;k<4;k++){const weight=w[base+k];if(weight!==0){const row=r[j[base+k]];sy+=weight*(row[0]*x+row[1]*y+row[2]*z+row[3]);}}
          if(sy<pieceMinimum)pieceMinimum=sy;
        }
      }else{
        const e=piece.object.matrixWorld.elements;
        for(let i=0;i<piece.count;i++){const sy=e[1]*p[i*3]+e[5]*p[i*3+1]+e[9]*p[i*3+2]+e[13];if(sy<pieceMinimum)pieceMinimum=sy;}
      }
      minimum=Math.min(minimum,pieceMinimum);minimumByMaterial[piece.material]=Math.min(minimumByMaterial[piece.material]??Infinity,pieceMinimum);
      vertexEvaluations+=piece.count;
    }
    return minimum;
  }
  function prepare(pose,lift,contacts) {
    group.position.fromArray(pose.referenceRootTranslationMeters);group.position.y+=lift;
    applyPose(bones,pose);update();
    const residual=enforceContacts(THREE,bones,contacts);update();maxResidual=Math.max(maxResidual,residual);
    return residual;
  }
  function probe(clip,time,lift=0) {
    const pose=sampleClip(THREE,clip,time),contacts=contactsAt(clip,time).filter(c=>c.mode==='plant'&&/Foot$/.test(c.bone));
    const residual=prepare(pose,lift,contacts),minimum=minimumY();
    let anchorError=0;
    for(const c of contacts)anchorError=Math.max(anchorError,bones[c.bone].localToWorld(new THREE.Vector3(0,-.08,0)).distanceTo(new THREE.Vector3().fromArray(c.anchor)));
    maxSoleAnchorError=Math.max(maxSoleAnchorError,anchorError);
    return{minimum,residual,anchorError,minimumByMaterial};
  }
  function solve(clip,time,initialLift=0) {
    let lift=initialLift,minimum=-Infinity,result,previous=-Infinity;
    for(let iteration=0;iteration<8;iteration++) {
      result=probe(clip,time,lift);minimum=result.minimum;
      if(minimum>=clearanceMeters-numericalToleranceMeters) {
        const pass=result.residual<=maximumAnchorErrorMeters&&result.anchorError<=maximumAnchorErrorMeters;
        return{lift,minimum,residual:result.residual,anchorError:result.anchorError,pass,iterations:iteration+1,...(!pass?{reason:'Root lift breaks planted-foot reach/anchor tolerance'}:{})};
      }
      if(iteration>1&&minimum-previous<1e-8)break;
      previous=minimum;lift+=Math.max(.00003,clearanceMeters-minimum+.00002);
      if(lift>.35)break;
    }
    return{lift,minimum,residual:result?.residual,anchorError:result?.anchorError,pass:false,reason:'Ground clearance cannot be met while keeping specified sole anchors within lift budget'};
  }
  return{probe,solve,vertexCount:pieces.reduce((n,p)=>n+p.count,0),stats:()=>({maxReachResidualMeters:maxResidual,maxSoleAnchorErrorMeters:maxSoleAnchorError})};
}

for(const file of files) {
  const bytes=await fs.readFile(path.join(root,file)),doc=await io.readBinary(new Uint8Array(bytes)),evaluate=sampler(doc);
  modelSha256[file]=hash(bytes);models[file]={};
  const modelReport={file,sha256:modelSha256[file],vertices:evaluate.vertexCount,clips:[]};
  for(const clip of clips) {
    const intervals=Math.round(clip.duration*sampleRateHz),lifts=[];let failed=0,minimumFinal=Infinity,maxLift=0;
    const details=[];
    for(let i=0;i<=intervals;i++) {
      const time=i===intervals?clip.duration:i/sampleRateHz;
      const r=evaluate.solve(clip,time);lifts.push(r.lift);minimumFinal=Math.min(minimumFinal,r.minimum);maxLift=Math.max(maxLift,r.lift);totalSamples++;
      if(!r.pass){failed++;if(details.length<6)details.push({time,...r});}
    }
    let midpointFailed=0,midpointMinimum=Infinity,passes=0;
    // Test exactly between saved samples at 240Hz. Raise both neighbouring
    // saved values when interpolation needs more headroom, then re-probe.
    for(let pass=0;pass<3;pass++) {
      midpointFailed=0;midpointMinimum=Infinity;let changed=0;passes++;
      for(let i=0;i<intervals;i++) {
        const time=(i+.5)/sampleRateHz,lift=(lifts[i]+lifts[i+1])*.5,r=evaluate.probe(clip,time,lift);totalMidpoints++;
        midpointMinimum=Math.min(midpointMinimum,r.minimum);
        if(r.residual>maximumAnchorErrorMeters||r.anchorError>maximumAnchorErrorMeters) {
          midpointFailed++;if(details.length<6)details.push({time,...r,midpoint:true,reason:'Interpolated root lift breaks planted-foot anchor tolerance'});
        }else if(r.minimum<clearanceMeters-numericalToleranceMeters) {
          if(pass<2) {
            const solved=evaluate.solve(clip,time,lift);
            if(solved.pass) {const extra=solved.lift-lift+.00005;lifts[i]+=extra;lifts[i+1]+=extra;changed++;}
            else{midpointFailed++;if(details.length<6)details.push({time,...solved,midpoint:true});}
          }else midpointFailed++;
        }
      }
      if(changed===0)break;
    }
    // Recheck endpoints after neighbouring midpoint corrections because sole
    // constraints make a whole-character vertical shift nontrivial.
    let endpointFailures=0,maximumLiftPose;
    for(let i=0;i<=intervals;i++) {
      const time=i===intervals?clip.duration:i/sampleRateHz,r=evaluate.probe(clip,time,lifts[i]);
      minimumFinal=Math.min(minimumFinal,r.minimum);maxLift=Math.max(maxLift,lifts[i]);
      if(!maximumLiftPose||lifts[i]>maximumLiftPose.liftMeters)maximumLiftPose={timeSeconds:time,liftMeters:lifts[i],minimumByMaterialMeters:r.minimumByMaterial};
      if(r.minimum<clearanceMeters-numericalToleranceMeters||r.residual>maximumAnchorErrorMeters||r.anchorError>maximumAnchorErrorMeters)endpointFailures++;
    }
    const pass=failed===0&&midpointFailed===0&&endpointFailures===0;
    models[file][clip.id]=lifts.map(n=>Math.ceil(n*1e7)/1e7);
    const row={id:clip.id,samples:intervals+1,midpointPasses:passes,minimumAfterContactsMeters:minimumFinal,minimum240HzMeters:midpointMinimum,maximumLiftMeters:maxLift,maximumLiftPose,failedSourceSamples:failed,failedFinalEndpoints:endpointFailures,failedFinalMidpoints:midpointFailed,pass,...(details.length?{failureExamples:details}:{})};
    modelReport.clips.push(row);
    if(!pass)failures.push({file,clip:clip.id,failedSourceSamples:failed,failedFinalEndpoints:endpointFailures,failedFinalMidpoints:midpointFailed});
  }
  modelReport.contactMetrics=evaluate.stats();modelReport.pass=modelReport.clips.every(c=>c.pass);reports.push(modelReport);
  console.log(`${file}: ${modelReport.clips.length} clips, ${modelReport.pass?'PASS':'FAIL'}, min ${(Math.min(...modelReport.clips.map(c=>Math.min(c.minimumAfterContactsMeters,c.minimum240HzMeters)))*1000).toFixed(3)} mm, max lift ${(Math.max(...modelReport.clips.map(c=>c.maximumLiftMeters))*1000).toFixed(3)} mm`);
}

for(const [file,expected] of Object.entries(modelSha256))if(hash(await fs.readFile(path.join(root,file)))!==expected)failures.push({file,reason:'Model changed during audit'});
if(hash(await fs.readFile(path.join(root,'animations.json')))!==motionSha256)failures.push({reason:'Motion changed during audit'});
if(hash(await fs.readFile(path.join(root,'source/motion-runtime.js')))!==runtimeSha256)failures.push({reason:'Runtime helper changed during audit'});
if(hash(await fs.readFile(fileURLToPath(import.meta.url)))!==auditSourceSha256)failures.push({reason:'Audit source changed during audit'});

const result={schemaVersion:1,auditSource:{file:'source/floor-envelope.mjs',sha256:auditSourceSha256},kind:'canonical18-postIK-full-skinned-mesh-floor-envelope',startedAt,generatedAt:new Date().toISOString(),motionSha256,runtimeSha256,modelSha256,threeRevision:THREE.REVISION,sampleRateHz,independentProbeRateHz:probeRateHz,clearanceMeters,numericalToleranceMeters,maximumAnchorErrorMeters,method:'Every decoded mesh vertex after canonical animation, model-root lift and anchored-foot IK. Stored120Hz envelope independently re-probed at240Hz midpoints. Exact clips only; interrupted transitions require separate displayed-viewer checks.',runtimeUse:'Apply envelope model-root lift before contact IK; preserve sole anchors at worldY0. Verify motion, runtime helper and model SHA256. Do not use during blending, mesh replacement or changed IK/sole semantics.',pass:failures.length===0&&files.length>0,complete:files.length===16&&clips.length===motion.clips.length,totals:{models:files.length,clips:clips.length,sourceSamples:totalSamples,midpointProbes:totalMidpoints,vertexEvaluations},failures,reports,models};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,complete:result.complete,models:files.length,clips:clips.length,failures:failures.length,vertexEvaluations,output}));
if(!result.pass)process.exitCode=1;
