/**
 * Original CC0-1.0 procedural preview athlete and basketball, authored for v9.
 * Every vertex is built here from cross-section surfaces and smooth primitives;
 * no third-party character mesh, image, animation or texture is used.
 * The 18 bind joints are the unchanged motion2 canonical skeleton.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {SKELETON} from '../runtime/skeleton.mjs';
export const PACKAGE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(process.env.HOOPS_TOOLS_DIR||'/tmp/hoops-v9-tools','package.json'));
const {Document,NodeIO,Accessor}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,prune,dedup}=require('@gltf-transform/functions');
const THREE=require('three');
const dm=require('draco3dgltf');
export async function createIO(){return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await dm.createEncoderModule(),'draco3d.decoder':await dm.createDecoderModule()});}
const boneIndex=Object.fromEntries(SKELETON.bones.map((b,i)=>[b.name,i]));
const world={};for(const b of SKELETON.bones)world[b.name]=b.restTranslationMeters.map((v,k)=>v+(b.parent?world[b.parent][k]:0));
const V=a=>new THREE.Vector3(...a);

/** Geometry is collected by material into one skinned mesh with smooth normals. */
export async function buildModel({write=true}={}){
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Canonical basketball motion stage');
 const colors={skin:[.48,.255,.14,1],jersey:[.025,.25,.38,1],trim:[.10,.78,.75,1],shorts:[.025,.085,.12,1],shoe:[.86,.91,.94,1],sole:[.065,.085,.10,1],hair:[.035,.028,.025,1],white:[.96,.98,1,1],eye:[.025,.035,.045,1],ball:[.83,.25,.025,1],seam:[.055,.035,.025,1]};
 const materials=Object.fromEntries(Object.entries(colors).map(([name,color])=>[name,doc.createMaterial(name).setBaseColorFactor(color).setRoughnessFactor(name==='ball'?.83:.75).setMetallicFactor(0)]));
 const groups={};
 function add(material,geometry,position=[0,0,0],scale=[1,1,1],joint='Root',quaternion=null,weightFn=null){
   const m=new THREE.Matrix4().compose(V(position),quaternion||new THREE.Quaternion(),V(scale));geometry.applyMatrix4(m);
   const g=groups[material]||(groups[material]={p:[],n:[],j:[],w:[],i:[]}),offset=g.p.length/3;
   const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
   for(let i=0;i<pos.count;i++){
     const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);g.p.push(x,y,z);g.n.push(normal.getX(i),normal.getY(i),normal.getZ(i));
     const weights=weightFn?weightFn([x,y,z]):[[joint,1]];
     for(let k=0;k<4;k++){g.j.push(boneIndex[weights[k]?.[0]||joint]);g.w.push(weights[k]?.[1]||0);}
   }
   const indices=geometry.getIndex();if(indices)for(const index of indices.array)g.i.push(offset+index);else for(let i=0;i<pos.count;i++)g.i.push(offset+i);
   geometry.dispose();
 }
 function sphere(mat,pos,radii,joint,segments=16){add(mat,new THREE.SphereGeometry(1,segments,12),pos,radii,joint);}
 function segment(mat,a,b,r1,r2,joint){
   const delta=V(b).sub(V(a)),mid=V(a).add(V(b)).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
   add(mat,new THREE.CylinderGeometry(r2,r1,delta.length(),16,3,false),mid.toArray(),[1,1,1],joint,q);
 }
 // Cross-sectioned athletic torso: waist, ribs and shoulders; weights blend along spine.
 const torsoRings=[[.845,.145,.09],[.90,.15,.095],[1.00,.145,.085],[1.10,.17,.098],[1.20,.192,.105],[1.27,.205,.105],[1.30,.18,.09]];
 const p=[],idx=[],ns=28;
 for(const [y,w,d] of torsoRings)for(let i=0;i<=ns;i++){const a=i/ns*Math.PI*2;p.push(Math.cos(a)*w,y,Math.sin(a)*d);}
 for(let r=0;r<torsoRings.length-1;r++)for(let i=0;i<ns;i++){const a=r*(ns+1)+i,b=a+ns+1;idx.push(a,b,a+1,a+1,b,b+1);}
 const torso=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(p,3)).setIndex(idx);torso.computeVertexNormals();
 add('jersey',torso,[0,0,0],[1,1,1],'Chest',null,([x,y])=>y<1.06?[['Hips',1-Math.max(0,(y-.9)/.16)],['Spine',Math.max(0,(y-.9)/.16)]]:[['Spine',Math.max(0,1-(y-1.06)/.18)],['Chest',Math.min(1,(y-1.06)/.18)]]);
 // Short solid neck and a shaped head with cropped hair, eyes, ears, nose and brows.
 segment('skin',[0,1.285,0],[0,1.405,0],.06,.055,'Neck');
 sphere('skin',[0,1.49,.005],[.104,.139,.103],'Head',24);
 sphere('hair',[0,1.565,-.008],[.106,.076,.102],'Head',24);
 sphere('skin',[.108,1.487,0],[.021,.036,.02],'Head');sphere('skin',[-.108,1.487,0],[.021,.036,.02],'Head');
 for(const x of [-.039,.039]){
   sphere('white',[x,1.512,.095],[.022,.012,.009],'Head');sphere('eye',[x,1.512,.103],[.009,.009,.004],'Head');
   segment('hair',[x-.019,1.535,.09],[x+.017,1.537,.092],.004,.004,'Head');
 }
 sphere('skin',[0,1.486,.109],[.018,.027,.018],'Head');
 segment('hair',[-.026,1.447,.096],[.026,1.447,.096],.003,.003,'Head');
 // Jersey collar and compact shoulder trim are original geometry.
 add('trim',new THREE.TorusGeometry(.065,.008,6,24,Math.PI*2),[0,1.30,.002],[1,.7,1],'Chest',new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0)));
 // Hips and the two separate shorts legs, with a thin waist band.
 sphere('shorts',[0,.84,-.005],[.165,.10,.103],'Hips');
 for(const sign of [-1,1]){
   const side=sign>0?'Left':'Right',x=sign*.1;
   segment('skin',[x,.82,0],[x,.46,.002],.075,.060,side+'UpLeg');
   segment('shorts',[x,.865,.002],[x,.655,.002],.091,.087,side+'UpLeg');
   segment('trim',[x,.658,.002],[x,.645,.002],.091,.090,side+'UpLeg');
   sphere('skin',[x,.45,.005],[.059,.061,.06],side+'Leg');
   segment('skin',[x,.44,.004],[x,.105,0],.055,.034,side+'Leg');
   sphere('skin',[x,.30,-.009],[.056,.125,.049],side+'Leg');
   // Compression sock above each shoe and broad ankle collar.
   segment('white',[x,.115,0],[x,.205,0],.036,.035,side+'Leg');
   sphere('shoe',[x,.07,.055],[.066,.063,.143],side+'Foot');
   sphere('sole',[x,.018,.061],[.067,.018,.145],side+'Foot');
   sphere('trim',[x,.091,.075],[.052,.015,.083],side+'Foot');
   // Shoulder mass, upper arm, forearm and articulated-looking rigid palm/fingers.
   const shoulder=world[side+'Arm'],elbow=world[side+'ForeArm'],wrist=world[side+'Hand'];
   sphere('skin',shoulder,[.074,.078,.074],side+'Arm');
   segment('skin',shoulder,elbow,.062,.047,side+'Arm');sphere('skin',elbow,[.046,.047,.046],side+'ForeArm');
   segment('skin',elbow,wrist,.044,.028,side+'ForeArm');
   sphere('skin',[wrist[0],wrist[1]-.048,wrist[2]+.003],[.043,.057,.024],side+'Hand');
   for(let j=0;j<4;j++){
     const fx=wrist[0]+(j-1.5)*.018,len=[.050,.062,.058,.044][j];
     segment('skin',[fx,wrist[1]-.075,.003],[fx,wrist[1]-.075-len,.008],.010,.008,side+'Hand');
     sphere('skin',[fx,wrist[1]-.075-len,.008],[.008,.010,.009],side+'Hand');
   }
   segment('skin',[wrist[0]+sign*.033,wrist[1]-.032,.002],[wrist[0]+sign*.058,wrist[1]-.078,.009],.013,.011,side+'Hand');
 }
 // Root bones follow canonical order, hierarchy and bind positions verbatim.
 const nodes={};for(const b of SKELETON.bones)nodes[b.name]=doc.createNode(b.name).setTranslation(b.restTranslationMeters);
 for(const b of SKELETON.bones)if(b.parent)nodes[b.parent].addChild(nodes[b.name]);scene.addChild(nodes.Root);
 const inverse=[];for(const b of SKELETON.bones)inverse.push(...new THREE.Matrix4().makeTranslation(...world[b.name].map(v=>-v)).elements);
 const inverseAccessor=doc.createAccessor('Canonical inverse bind matrices').setBuffer(buffer).setType(Accessor.Type.MAT4).setArray(new Float32Array(inverse));
 const skin=doc.createSkin('Canonical18').setSkeleton(nodes.Root).setInverseBindMatrices(inverseAccessor);for(const b of SKELETON.bones)skin.addJoint(nodes[b.name]);
 const mesh=doc.createMesh('Original athletic mannequin');
 function primitive(g,material,skinned){
   const access=(name,type,array)=>doc.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
   const pr=doc.createPrimitive().setAttribute('POSITION',access(material+' positions',Accessor.Type.VEC3,new Float32Array(g.p))).setAttribute('NORMAL',access(material+' normals',Accessor.Type.VEC3,new Float32Array(g.n))).setIndices(access(material+' indices',Accessor.Type.SCALAR,new Uint32Array(g.i))).setMaterial(materials[material]);
   if(skinned)pr.setAttribute('JOINTS_0',access(material+' joints',Accessor.Type.VEC4,new Uint16Array(g.j))).setAttribute('WEIGHTS_0',access(material+' weights',Accessor.Type.VEC4,new Float32Array(g.w)));
   return pr;
 }
 for(const [material,g]of Object.entries(groups))mesh.addPrimitive(primitive(g,material,true));
 scene.addChild(doc.createNode('Athlete').setMesh(mesh).setSkin(skin));
 // Basketball's visible seams use geometry, so no remote or raster texture is needed.
 for(const key of Object.keys(groups))delete groups[key];
 sphere('ball',[0,0,0],[.12,.12,.12],'Root',24);
 for(const rot of [[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]])add('seam',new THREE.TorusGeometry(.1201,.0017,5,64),[0,0,0],[1,1,1],'Root',new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
 const ballMesh=doc.createMesh('Original basketball');for(const [material,g]of Object.entries(groups))ballMesh.addPrimitive(primitive(g,material,false));
 scene.addChild(doc.createNode('Ball').setMesh(ballMesh).setTranslation([0,1,.35]));
 doc.getRoot().setDefaultScene(scene).setExtras({authorship:'original procedural geometry authored for hoops-motion-v9',license:'CC0-1.0',canonicalSkeletonSource:'../motion2/hoops.json',ballRadiusMeters:.12,palmGuideMeters:[0,-.08,.025],soleGuideMeters:[0,-.08,0]});
 await doc.transform(prune(),dedup(),draco({method:'edgebreaker',encodeSpeed:4,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeGeneric:16}));
 const io=await createIO(),bytes=await io.writeBinary(doc);
 if(write)await fs.writeFile(path.join(PACKAGE_ROOT,'source/preview-model.glb'),bytes);
 return {bytes,vertices:Object.values(groups).reduce((s,g)=>s+g.p.length/3,0),joints:18};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await buildModel();console.log(`Original canonical18 model: ${result.bytes.length} bytes`);}
