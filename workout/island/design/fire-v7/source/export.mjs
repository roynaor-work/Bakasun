// Authoring only. The delivered viewer never invokes Node, npm, or a build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/fire-v7-tools/package.json');
const {Document,NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression,KHRMaterialsUnlit}=require('@gltf-transform/extensions');
const {weld,prune}=require('@gltf-transform/functions');
const draco=require('draco3dgltf');
const THREE=require('three');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression,KHRMaterialsUnlit])
  .registerDependencies({'draco3d.encoder':await draco.createEncoderModule(),'draco3d.decoder':await draco.createDecoderModule()});
const skeleton=JSON.parse(await fs.readFile(path.join(root,'skeleton.json'),'utf8'));
const world={};for(const b of skeleton.bones)world[b.name]=b.restTranslationMeters.map((v,i)=>v+(b.parent?world[b.parent][i]:0));
const hashes=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=(await fs.readdir('/tmp/fire-v7-raw')).filter(f=>f.endsWith('.json')).sort();
const records=[];
for(const file of files){
  const raw=JSON.parse(await fs.readFile(path.join('/tmp/fire-v7-raw',file),'utf8'));
  const doc=new Document(),buffer=doc.createBuffer('embedded');
  doc.getRoot().getAsset().generator='Fire v7 original surface modeller / glTF Transform 4.2.1';
  doc.getRoot().getAsset().copyright='Original fictional assets. CC0-1.0. See LICENSES.md.';
  const acc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const texture=doc.createTexture(raw.atlas+' atlas').setImage(await fs.readFile(path.join(root,'textures',raw.atlas+'-atlas.png'))).setMimeType('image/png');
  const attributes={
    POSITION:acc('surface positions','VEC3',new Float32Array(raw.positions.flat())),
    NORMAL:acc('authored normals','VEC3',new Float32Array(raw.normals.flat())),
    TEXCOORD_0:acc('guttered palette UV','VEC2',new Float32Array(raw.uv.flat())),
    COLOR_0:acc('bounded cavity tint','VEC4',new Float32Array(raw.colors.flat())),
  };
  if(raw.joints){
    attributes.JOINTS_0=acc('canonical joint indices','VEC4',new Uint8Array(raw.joints.flat()));
    const packed=[];
    for(const ws of raw.weights){
      const scaled=ws.map(w=>w*65535),out=scaled.map(Math.floor);
      const order=[0,1,2,3].sort((a,b)=>(scaled[b]-out[b])-(scaled[a]-out[a]));
      for(let i=0,n=65535-out.reduce((a,b)=>a+b,0);i<n;i++)out[order[i%4]]++;
      packed.push(...out);
    }
    attributes.WEIGHTS_0=acc('exact normalized weights','VEC4',new Uint16Array(packed)).setNormalized(true);
  }
  const mesh=doc.createMesh(raw.name),asset=doc.createNode(raw.name).setMesh(mesh).setExtras({assetId:raw.name,...raw.metadata});
  const scene=doc.createScene('asset').addChild(asset);
  let primitives=0;
  for(const [surface,indices] of Object.entries(raw.groups)){
    if(!indices.length)continue;
    const mat=doc.createMaterial(raw.atlas+'/'+surface).setBaseColorTexture(texture).setRoughnessFactor(surface==='glass'?.20:surface==='metal'?.42:.82)
      .setMetallicFactor(surface==='glass'?.30:surface==='metal'?.56:0).setDoubleSided(false);
    if(surface==='light')mat.setExtension('KHR_materials_unlit',doc.createExtension(KHRMaterialsUnlit).createUnlit());
    if(surface==='decal')mat.setAlphaMode('BLEND').setRoughnessFactor(1);
    const p=doc.createPrimitive().setMaterial(mat).setIndices(acc(surface+' indices','SCALAR',new Uint32Array(indices)));
    for(const [key,value] of Object.entries(attributes))p.setAttribute(key,value);
    mesh.addPrimitive(p);primitives++;
  }
  const bones={};
  if(raw.joints){
    for(const b of skeleton.bones){
      bones[b.name]=doc.createNode(b.name).setTranslation(b.restTranslationMeters);
      if(b.parent)bones[b.parent].addChild(bones[b.name]);else scene.addChild(bones[b.name]);
    }
    const skin=doc.createSkin('motion2 canonical 18').setSkeleton(bones.Root);
    for(const b of skeleton.bones)skin.addJoint(bones[b.name]);
    const matrices=skeleton.bones.flatMap(b=>{
      const [x,y,z]=world[b.name];return [1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1];
    });
    skin.setInverseBindMatrices(acc('canonical inverse binds','MAT4',new Float32Array(matrices)));asset.setSkin(skin);
    for(const [name,a] of Object.entries(raw.anchors)){
      bones[a.bone].addChild(doc.createNode(name).setTranslation(a.translation).setExtras({direction:a.direction||[0,0,1],socket:true}));
    }
    for(const clip of ['idle','hose','tool','command','walk']){
      const anim=doc.createAnimation(clip).setExtras({rootMotion:false,presentationOnly:true,loop:true});
      const count=25,duration=clip==='walk'?1:2.4,times=Array.from({length:count},(_,i)=>i/(count-1)*duration);
      const input=acc(clip+' time','SCALAR',new Float32Array(times));
      for(const bone of skeleton.bones){
        if(bone.name==='Root')continue;
        const quats=[];
        for(const t of times){
          const phase=t/duration*Math.PI*2,swing=Math.sin(phase),breath=Math.sin(phase)*.013;
          let x=0,y=0,z=0;const left=bone.name.startsWith('Left'),sign=left?1:-1;
          if(bone.name==='Spine')x=clip==='hose'?.07+breath:breath*.5;
          if(bone.name==='Chest')x=clip==='hose'?.045:breath*.3;
          if(bone.name==='Head'){y=clip==='command'?.12+Math.sin(phase)*.05:Math.sin(phase)*.025;x=clip==='hose'?.035:0;}
          if(bone.name.endsWith('Arm')&&!bone.name.endsWith('ForeArm')){
            x=clip==='hose'?-1.05+breath:clip==='command'&&!left?-1.18:clip==='walk'?Math.cos(phase)*.35*sign:clip==='tool'?.12*sign:.04;
            z=clip==='hose'?-sign*.23:clip==='command'&&!left?.20:sign*.07;
          }
          if(bone.name.endsWith('ForeArm'))x=clip==='hose'?-.62-breath:clip==='command'&&!left?-1.58:clip==='walk'?-.13-Math.max(0,swing*sign)*.25:clip==='tool'&&!left?-.27:-.07;
          if(bone.name.endsWith('Hand'))x=clip==='hose'?.08:clip==='command'&&!left?-.18:0;
          if(clip==='walk'){
            // Analytic sagittal two-bone IK keeps stance soles at y=0, with
            // lifted swing feet. There is no Root translation or foot skating
            // caused by a second, implicit locomotion path.
            const p=phase+(left?0:Math.PI),hips=.825+.006*Math.sin(phase*2);
            const lift=Math.max(0,Math.sin(p))*.055,footY=.08+lift,footZ=Math.cos(p)*.14;
            const dy=footY-hips,dz=footZ,d=Math.min(.7799,Math.hypot(dy,dz)),l1=.41,l2=.37;
            const aim=Math.atan2(-dz,-dy),upper=aim-Math.acos(THREE.MathUtils.clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
            const knee=Math.PI-Math.acos(THREE.MathUtils.clamp((l1*l1+l2*l2-d*d)/(2*l1*l2),-1,1));
            if(bone.name.endsWith('UpLeg'))x=upper;
            if(bone.name==='LeftLeg'||bone.name==='RightLeg')x=knee;
            if(bone.name.endsWith('Foot'))x=-upper-knee;
          }
          const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ')).normalize();quats.push(...q.toArray());
        }
        const sampler=doc.createAnimationSampler().setInput(input).setOutput(acc(clip+'/'+bone.name,'VEC4',new Float32Array(quats))).setInterpolation('LINEAR');
        anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(bones[bone.name]).setTargetPath('rotation').setSampler(sampler));
      }
      if(clip==='walk'){
        const positions=times.flatMap(t=>[0,.825+.006*Math.sin(t/duration*Math.PI*4),0]);
        const sampler=doc.createAnimationSampler().setInput(input).setOutput(acc('walk supported hips','VEC3',new Float32Array(positions))).setInterpolation('LINEAR');
        anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(bones.Hips).setTargetPath('translation').setSampler(sampler));
      }
    }
  }else{
    for(const [name,pos]of Object.entries(raw.anchors))asset.addChild(doc.createNode(name).setTranslation(pos).setExtras({socket:true}));
  }
  await doc.transform(weld({tolerance:.00001}),prune({keepExtras:true}));
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,
    quantizationBits:{POSITION:14,NORMAL:10,TEX_COORD:14,COLOR:8,GENERIC:16}
  });
  const bytes=await io.writeBinary(doc);
  if(bytes.length>1500000)throw new Error(raw.name+': over 1.5 MB');
  const dest='models/'+raw.name+'.glb';await fs.writeFile(path.join(root,dest),bytes);
  const decoded=await io.readBinary(bytes);
  let triangles=0,vertices=0;
  for(const mesh of decoded.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;vertices+=p.getAttribute('POSITION').getCount();
  }
  records.push({id:raw.name,file:dest,bytes:bytes.length,mb:Number((bytes.length/1e6).toFixed(4)),sha256:hashes(bytes),
    triangles,vertices,primitives,texture:'textures/'+raw.atlas+'-atlas.png',textureCount:1,textureDimensions:[512,512],
    ...raw.metadata,anchors:raw.anchors,animations:raw.joints?['idle','hose','tool','command','walk']:[]});
  console.log(raw.name,bytes.length,triangles,flush());
}
function flush(){return 'bytes / triangles';}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:1,package:'fire-v7',engine:'three.js r160',
  coordinates:{units:'metres',up:'+Y',forward:'+Z'},maxGlbBytes:1500000,maxTextureSide:1024,
  canonicalSkeletonSource:'workout/island/design/motion2/soccer.json',assets:records},null,2)+'\n');
