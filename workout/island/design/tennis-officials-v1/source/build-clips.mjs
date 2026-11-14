import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createBaker,BALL_RADIUS} from './motions.mjs';
const require=createRequire('/tmp/tennis-officials-tools/package.json');
const T=require('three'),{NodeIO}=require('@gltf-transform/core');
const {prune}=require('@gltf-transform/functions');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),io=new NodeIO();
const rig=JSON.parse(await fs.readFile(root+'/rig.json','utf8')),{clips}=createBaker(rig);
const ids=[['chair-umpire','chair'],['line-judge-01','line'],['line-judge-02','line'],...['01','02','03','04'].map(n=>['ball-kid-'+n,'kid'])];
const summaries=[];
for(const [id,role] of ids){
 const d=await io.read(root+'/models/'+id+'.glb'),buffer=d.getRoot().listBuffers()[0],nodes=Object.fromEntries(d.getRoot().listNodes().map(n=>[n.getName(),n]));
 for(const a of [...d.getRoot().listAnimations()])a.dispose();
 const acc=(name,type,array)=>d.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
 let ball=nodes.Ball;
 if(role==='kid'&&!ball){
  const g=new T.IcosahedronGeometry(BALL_RADIUS,1),p=d.createPrimitive().setAttribute('POSITION',acc('felt ball','VEC3',new Float32Array(g.attributes.position.array))).setAttribute('NORMAL',acc('ball normals','VEC3',new Float32Array(g.attributes.normal.array)));
  p.setMaterial(d.createMaterial('Tennis felt').setBaseColorFactor([.67,.9,.09,1]).setRoughnessFactor(.95));
  ball=d.createNode('Ball').setMesh(d.createMesh('Independent tennis ball').addPrimitive(p)).setTranslation([0,-10,0]);d.getRoot().listScenes()[0].addChild(ball);
 }
 for(const c of clips.filter(c=>c.role===role)){
  const a=d.createAnimation(c.id).setExtras({label:c.label,loop:c.loop,fps:30,rootMotion:c.locomotion??false,idle:c.idle,events:c.events,motionQA:c.motionQA});
  const input=acc(c.id+' 30Hz seconds','SCALAR',new Float32Array(c.times));
  const track=(node,property,type,data)=>{
   if(type==='VEC4')for(let i=4;i<data.length;i+=4)if(data.slice(i,i+4).reduce((s,v,k)=>s+v*data[i-4+k],0)<0)for(let k=0;k<4;k++)data[i+k]*=-1;
   const s=d.createAnimationSampler().setInput(input).setOutput(acc(c.id+' '+node.getName()+' '+property,type,new Float32Array(data))).setInterpolation('LINEAR');a.addSampler(s).addChannel(d.createAnimationChannel().setTargetNode(node).setTargetPath(property).setSampler(s));
  };
  for(const j of rig.joints)for(const p of ['translation','rotation'])track(nodes[j.name],p,p==='rotation'?'VEC4':'VEC3',c.samples.flatMap(s=>s.values[j.name][p]));
  if(ball){track(ball,'translation','VEC3',c.samples.flatMap(s=>s.ball));track(ball,'scale','VEC3',c.samples.flatMap(s=>Array(3).fill(s.ballVisible?1:0)));}
 }
 d.getRoot().getAsset().generator='Tennis officials v1 / original 30Hz IK clips / CC0';
 await d.transform(prune());
 await io.write(root+'/models/'+id+'.glb',d);
 summaries.push({id,file:'models/'+id+'.glb',clips:clips.filter(c=>c.role===role).map(c=>({id:c.id,label:c.label,duration:c.duration,frames:c.times.length,fps:30,loop:c.loop,rootMotion:!!c.locomotion,idle:c.idle,events:c.events,motionQA:c.motionQA,maxReachClampMeters:Math.max(...c.samples.map(s=>s.maxReachClamp))}))});
 console.log(id,summaries.at(-1).clips.length+' clips');
}
await fs.writeFile(root+'/motions.json',JSON.stringify({schemaVersion:1,sampleRate:30,rig:'rig.json',ballRadius:BALL_RADIUS,authorship:'Original keyframing; independent sphere paths drive author-time hand IK; no runtime IK required.',models:summaries},null,2)+'\n');
