import {Art,T,fs,path,root,out,io,acc,paletteAtlas,draco,weld,prune,dedup,rgb,discardAnimation,resample} from './mesh.mjs';
import {Retargeter} from '../../viewer/retarget.js';
import {sample} from '../../viewer/animation.js';
import {repairSurfaceNormals} from './surface-normals.mjs';

const design=path.dirname(root);
const read=async p=>JSON.parse(await fs.readFile(path.join(design,p),'utf8'));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json'),motion=await read('motion/soccer.json');
const canon=(await read('motion2/soccer.json')).skeleton;
const oldNames=rig.joints.map(j=>j.name),names=canon.bones.map(b=>b.name);
const report=[];

function outfit(look){
  const a=new Art('gear');
  a.cylinder([0,1.294,-.004],.084,.060,'green',[0,0,0],24,.072);
  a.sphere([0,1.322,-.004],[.08,.039,.08],'green',24,10);
  a.box([0,1.274,.075],[.16,.012,.13],'green',.015);
  a.box([0,.918,.083],[.18,.18,.043],'sand',.015);
  for(const s of [-1,1]){
    a.box([s*.06,.865,.104],[.059,.055,.035],'wood',.008);
    a.tube([[s*.072,1.02,.056],[s*.073,.89,.107]],[.013,.014],'sand',6);
    a.box([s*.10,.67,.06],[.05,.06,.04],'wood',.006);
  }
  a.box([-.105,.98,.085],[.034,.06,.025],'dark',.005);
  a.tube([[-.105,1.01,.085],[-.105,1.06,.085]],.004,'dark',6);
  a.box([0,.705,.098],[.045,.027,.014],'gold',.004);
  return a;
}

async function make(look,index){
  const id=['guard-ranger','guard-lookout','guard-keeper'][index];
  const doc=await io.read(path.join(design,'soccer-v5/models/teal-'+look+'.glb'));
  const prim=doc.getRoot().listMeshes()[0].listPrimitives()[0],pos=prim.getAttribute('POSITION'),col=prim.getAttribute('COLOR_0');
  const colors=Array.from(col.getArray()),positions=Array.from(pos.getArray()),normals=Array.from(prim.getAttribute('NORMAL').getArray()),indices=Array.from(prim.getIndices().getArray());
  const joints=Array.from(prim.getAttribute('JOINTS_0').getArray()),w=prim.getAttribute('WEIGHTS_0'),weights=[];
  for(let i=0;i<w.getCount();i++)weights.push(...w.getElement(i,[]));
  // Repaint shirt, shorts, socks and exposed calves into continuous field clothing.
  // Face, hands and original authored surface geometry retain their source form.
  for(let i=0;i<pos.getCount();i++){
    const p=pos.getElement(i,[]),c=col.getElement(i,[]);let paint=null;
    if(p[1]>.08&&p[1]<.57)paint=p[1]<.17?'dark':'sand';
    if(p[1]>=.57&&p[1]<.73&&Math.abs(p[0])<.18)paint='sand';
    if(p[1]>=.73&&p[1]<1.06&&c[1]>c[0]*1.6)paint=index===1?'teal':'green';
    if(p[1]<.08)paint='dark';
    if(paint){const c2=rgb(paint);colors.splice(i*3,3,c2.r,c2.g,c2.b);}
  }
  const gear=outfit(look);
  for(const {geo}of gear.parts){
    const gp=geo.attributes.position,gn=geo.attributes.normal,gc=geo.attributes.color,start=positions.length/3;
    for(let i=0;i<gp.count;i++){
      positions.push(gp.getX(i),gp.getY(i),gp.getZ(i));normals.push(gn.getX(i),gn.getY(i),gn.getZ(i));colors.push(gc.getX(i),gc.getY(i),gc.getZ(i));
      const y=gp.getY(i),joint=names.indexOf(y>1.18?'Head':y>.81?'Chest':'Hips');
      joints.push(joint,0,0,0);weights.push(1,0,0,0);indices.push(start+i);
    }
  }
  for(const t of prim.listTargets())prim.removeTarget(t);
  for(const m of doc.getRoot().listMeshes())m.setWeights([]);
  for(const n of doc.getRoot().listNodes())n.setWeights([]);
  for(const [semantic,type,array]of [
    ['POSITION','VEC3',new Float32Array(positions)],['NORMAL','VEC3',new Float32Array(normals)],['COLOR_0','VEC3',new Float32Array(colors)],
    ['JOINTS_0','VEC4',new Uint16Array(joints)],['WEIGHTS_0','VEC4',new Float32Array(weights)]])prim.setAttribute(semantic,acc(doc,semantic,type,array));
  prim.setIndices(acc(doc,'Guard triangles','SCALAR',new Uint32Array(indices)));
  for(const animation of [...doc.getRoot().listAnimations()]){
    if(animation.getName()==='run')animation.setName('patrol');else discardAnimation(animation);
  }
  const actor=doc.getRoot().listNodes().find(n=>n.getMesh());actor.setName('Guard');
  actor.setExtras({fictional:true,role:id,units:'meters',heightMeters:1.36,canonicalSkeleton:'motion2 / 18',
    bindConvention:'soccer-v5 collapsed bind; retarget canonical motion through viewer retarget-map, never copy uncalibrated local rotations'});

  // Bake the same calibrated 20→18 bind conversion used by the repository's v5.
  const scene=new T.Group(),bones={};
  for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);b.scale.fromArray(j.scale);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else scene.add(b);}
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints.map(i=>oldNames.indexOf(names[i])),4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  const sm=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());scene.add(sm);scene.updateMatrixWorld(true);
  sm.bind(new T.Skeleton(oldNames.map(n=>bones[n]),rig.joints.map(j=>new T.Matrix4().fromArray(j.inverseBindMatrix))),new T.Matrix4());
  const adapter=new Retargeter(scene,rig,motion.skeleton,map);
  for(const def of [{name:'idle',duration:3},{name:'alert',duration:2.4}]){
    const times=Array.from({length:Math.round(def.duration*30)+1},(_,i)=>i/30);
    const channels=Object.fromEntries(names.map(n=>[n,{translation:[],rotation:[]}]))
    for(const t of times){
      const pose=sample(motion.states.idle,t,true);
      // Relaxed guard stance, rather than the athlete's crouched ready pose.
      for(const name of names)pose.rotations[name]=[0,0,0,1];
      pose.hipsOffsetMeters=[0,Math.sin(t/3*Math.PI*2)*.003,0];pose.contacts=[];
      for(const [name,angles]of [['LeftArm',[.03,0,.10]],['RightArm',[.03,0,-.10]],['LeftForeArm',[-.15,0,0]],['RightForeArm',[-.15,0,0]],['Chest',[Math.sin(t/3*Math.PI*2)*.012,0,0]],['Head',[0,Math.sin(t/3*Math.PI*2)*.045,0]]])pose.rotations[name]=new T.Quaternion().setFromEuler(new T.Euler(...angles)).toArray();
      if(def.name==='alert'){
        const k=Math.sin(Math.PI*Math.min(1,t/def.duration))**.6;
        for(const [name,angles]of [['LeftArm',[-.35,0,.54]],['LeftForeArm',[-1.86,0,0]],['LeftHand',[0,0,.12]],['Head',[0,-.20,0]]]){
          const q=new T.Quaternion().fromArray(pose.rotations[name]);q.slerp(new T.Quaternion().setFromEuler(new T.Euler(...angles)),k);pose.rotations[name]=q.toArray();
        }
      }
      const contacts=pose.contacts.map(c=>({...c,anchorMeters:c.anchorMeters.map((v,i)=>v-pose.referenceRootTranslationMeters[i])}));
      adapter.apply(pose,{referenceRoot:[0,0,0],contacts,floor:true});
      for(const b of canon.bones){
        const m=b.parent?bones[b.parent].matrixWorld.clone().invert().multiply(bones[b.name].matrixWorld):bones[b.name].matrixWorld;
        const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);
        channels[b.name].translation.push(...p.toArray());channels[b.name].rotation.push(...q.normalize().toArray());
      }
    }
    const animation=doc.createAnimation(def.name).setExtras({loop:def.name==='idle',rootMotion:false,bakedHz:30,source:'motion/soccer idle + authored alert; motion2 canonical names'});
    const input=acc(doc,def.name+' seconds','SCALAR',new Float32Array(times));
    for(const [name,c]of Object.entries(channels))for(const [property,values]of Object.entries(c)){
      if(def.name==='idle'){const size=property==='rotation'?4:3;values.splice(values.length-size,size,...values.slice(0,size));}
      if(property==='rotation')for(let i=4;i<values.length;i+=4)if(values.slice(i,i+4).reduce((s,v,k)=>s+v*values[i-4+k],0)<0)for(let j=0;j<4;j++)values[i+j]*=-1;
      const sampler=doc.createAnimationSampler().setInput(input).setOutput(acc(doc,def.name+' '+name+' '+property,property==='rotation'?'VEC4':'VEC3',new Float32Array(values))).setInterpolation('LINEAR');
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(doc.getRoot().listNodes().find(n=>n.getName()===name)).setTargetPath(property).setSampler(sampler));
    }
  }
  const atlasId=id;await paletteAtlas(doc,atlasId);
  await doc.transform(weld(),dedup(),resample({tolerance:1e-5}),prune());
  const repairedNormals=repairSurfaceNormals(doc);
  await doc.transform(weld(),dedup(),prune(),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:12,quantizeTexcoord:12}));
  await io.write(path.join(out,id+'.glb'),doc);
  // Far guards become rigid instanced crowd silhouettes. Close guards stay skinned.
  // A separate low-poly crowd model supplies the distant alternative.
  report.push({id,bytes:(await fs.stat(path.join(out,id+'.glb'))).size,triangles:prim.getIndices().getCount()/3,repairedNormals,joints:doc.getRoot().listSkins()[0].listJoints().map(j=>j.getName()),animations:doc.getRoot().listAnimations().map(a=>a.getName()),atlas:atlasId+'-atlas.png'});
  console.log(id,report.at(-1).triangles);
}
for(const [i,look]of ['quiff','curls','knot'].entries())await make(look,i);
const crowd=new Art('guard-crowd');
crowd.sphere([0,1.04,0],[.13,.17,.13],'sand',8,5);
crowd.add(new T.BoxGeometry(.31,.44,.20),'green',[0,.70,0]);
crowd.cylinder([0,1.17,0],.14,.06,'green',[0,0,0],8);
for(const s of [-1,1]){
  crowd.add(new T.BoxGeometry(.12,.48,.15),'sand',[s*.09,.26,0]);
  crowd.add(new T.BoxGeometry(.09,.36,.12),'green',[s*.20,.70,0]);
  crowd.add(new T.BoxGeometry(.14,.09,.23),'dark',[s*.09,.045,.025]);
}
report.push(await crowd.write());
await fs.writeFile(path.join(root,'verification/guards-authored.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(root,'skeleton.json'),JSON.stringify({source:'../motion2/soccer.json',skeleton:canon,bind:'soccer-v5 collapsed bind; same parent hierarchy and inverse bind matrices',guards:report.slice(0,3)},null,2));
