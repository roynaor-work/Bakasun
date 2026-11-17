/** Original realism-v2 adaptation of repository MakeHuman/MPFB v7 humans.
 * Authoring deps are installed OUTSIDE the repository; see players/NOTES.md.
 * Rebuild: HOOPS_REALISM_TOOLS=/tmp/hoops-realism-tools node source/players-build.mjs
 * The rest-space warp changes geometry, never the canonical18 contract.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {CANON_BONES} from '../../../minigames/athletes-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire(path.join(process.env.HOOPS_REALISM_TOOLS||'/tmp/hoops-realism-tools','package.json'));
const {NodeIO,Accessor}=req('@gltf-transform/core');
const {ALL_EXTENSIONS}=req('@gltf-transform/extensions');
const {dequantize,dedup,prune,weld,simplifyPrimitive}=req('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptSimplifier}=req('meshoptimizer');
const draco=req('draco3dgltf'),sharp=req('sharp'),T=req('three');
await MeshoptDecoder.ready;await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});
const profiles=[
 {id:'guard',source:'pg',label:'רכז זריז',bodyType:'compact-lean',number:'07',heightMeters:1.78,width:.98,depth:.96,primary:'#47b8bf',secondary:'#123f52',trim:'#f4dfba'},
 {id:'shooter',source:'sg',label:'קלע ארוך',bodyType:'long-lean',number:'12',heightMeters:1.90,width:.97,depth:.96,primary:'#667bce',secondary:'#253557',trim:'#f4dfba'},
 {id:'wing',source:'sf',label:'פורוורד אתלטי',bodyType:'balanced-athletic',number:'24',heightMeters:2.00,width:1.02,depth:1.035,primary:'#d96848',secondary:'#512c37',trim:'#f4dfba'},
 {id:'power',source:'pf',label:'פאוור רחב',bodyType:'broad-muscular',number:'35',heightMeters:2.10,width:1.065,depth:1.07,primary:'#5e9e78',secondary:'#183e3c',trim:'#f4dfba'},
];
const canonicalWorld={};for(const b of CANON_BONES)canonicalWorld[b.name]=b.rest.map((v,i)=>v+(b.parent?canonicalWorld[b.parent][i]:0));
const V=a=>new T.Vector3(...a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const child={Hips:'Spine',Spine:'Chest',Chest:'Neck',Neck:'Head',LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
const names=CANON_BONES.map(b=>b.name);
function warpMatrices(old,profile){
 const out={};
 for(const name of names){
  let from=child[name],ancestor=name;
  if(name.endsWith('Hand')){ancestor=name.replace('Hand','ForeArm');from=name;}
  let a,b;if(from){a=V(old[from]).sub(V(old[ancestor]));b=V(canonicalWorld[from]).sub(V(canonicalWorld[ancestor]));}
  else {a=new T.Vector3(0,1,0);b=a.clone();}
  const axial=from?clamp(b.length()/a.length(),.72,1.20):.88;
  const q=new T.Quaternion().setFromUnitVectors(a.clone().normalize(),b.clone().normalize());
  const rotation=new T.Matrix4().makeRotationFromQuaternion(q);
  const axis=a.clone().normalize(),radial=.89;
  // S = r I + (axial-r) uu^T, then align old segment to canonical segment.
  const s=new T.Matrix4();s.set(
   radial+(axial-radial)*axis.x*axis.x,(axial-radial)*axis.x*axis.y,(axial-radial)*axis.x*axis.z,0,
   (axial-radial)*axis.y*axis.x,radial+(axial-radial)*axis.y*axis.y,(axial-radial)*axis.y*axis.z,0,
   (axial-radial)*axis.z*axis.x,(axial-radial)*axis.z*axis.y,radial+(axial-radial)*axis.z*axis.z,0,
   0,0,0,1);
  const m=new T.Matrix4().makeTranslation(...canonicalWorld[name]).multiply(rotation).multiply(s).multiply(new T.Matrix4().makeTranslation(...old[name].map(v=>-v)));
  out[name]={m,n:new T.Matrix3().getNormalMatrix(m)};
 }
 return out;
}
async function maps(profile,doc){
 let atlas=doc.getRoot().listTextures().find(t=>t.getName().includes('atlas'));
 const image=await sharp(atlas.getImage()).resize(512,512).ensureAlpha().raw().toBuffer();
 const mask=Buffer.alloc(512*512*4);
 const protectedPrint=new Uint8Array(512*512);
 // Protect the entire printed numeral including its pale antialias / outline.
 for(let y=386;y<510;y++)for(let x=1;x<511;x++){
  const i=(y*512+x)*4;if((image[i]+image[i+1]+image[i+2])/3>145)continue;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(y+dy>=384&&y+dy<512&&x+dx>=0&&x+dx<512)protectedPrint[(y+dy)*512+x+dx]=1;
 }
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4,r=image[i],g=image[i+1],b=image[i+2],lum=(r+g+b)/3;
  // Original restrained fabric microcontrast: one-pixel weave, deterministic.
  if(y>=384){const weave=((x+2*y)%4===0?-2:1);for(let c=0;c<3;c++)image[i+c]=clamp(image[i+c]+weave,0,255);}
  // Background-only team masks. Dark numerals, pale outlines and printed seams stay protected.
  if(y>=386&&y<510&&lum>190&&Math.max(r,g,b)-Math.min(r,g,b)<20&&!protectedPrint[y*512+x]){mask[i+(x<256?0:1)]=255;}
  if(x>=256&&x<320&&y>=352&&y<384)mask[i+2]=255;
  mask[i+3]=255;
 }
 const png=await sharp(image,{raw:{width:512,height:512,channels:4}}).png({compressionLevel:9,palette:true,colours:224,dither:.15}).toBuffer();
 atlas.setImage(png).setMimeType('image/png').setName(profile.id+'-human-cloth-atlas');
 const maskPng=await sharp(mask,{raw:{width:512,height:512,channels:4}}).png({compressionLevel:9,palette:true}).toBuffer();
 await fs.writeFile(path.join(root,'players/masks',profile.id+'-team.png'),maskPng);
 // High-frequency original cloth normal detail is unnecessary at mobile scale;
 // keep a small normal map so the weave survives close inspection.
 for(const tex of doc.getRoot().listTextures())if(tex!==atlas){tex.setImage(await sharp(tex.getImage()).resize(128,128).png({compressionLevel:9}).toBuffer()).setMimeType('image/png');}
 return {atlasBytes:png.length,maskBytes:maskPng.length};
}
async function build(profile){
 const source=path.join(root,'../hoops-v7/characters/models',profile.source+'.glb');
 const sourceBytes=await fs.readFile(source),sourceSha256=createHash('sha256').update(sourceBytes).digest('hex');
 const d=await io.readBinary(sourceBytes);await d.transform(dequantize());
 for(const a of d.getRoot().listAnimations()){for(const c of a.listChannels())c.dispose();for(const s of a.listSamplers())s.dispose();a.dispose();}
 const skin=d.getRoot().listSkins()[0],joints=skin.listJoints();
 if(joints.map(j=>j.getName()).join()!==names.join())throw Error('source joint order changed');
 const old=Object.fromEntries(joints.map(j=>[j.getName(),Array.from(j.getWorldTranslation())]));
 const warp=warpMatrices(old,profile);
 let focusVertices=0;
 for(const mesh of d.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  for(const t of p.listTargets())p.removeTarget(t);mesh.setWeights([]);
  const pos=p.getAttribute('POSITION'),norm=p.getAttribute('NORMAL'),ja=p.getAttribute('JOINTS_0'),wa=p.getAttribute('WEIGHTS_0');
  // Keep head/face triangles separately, preserving their topology under simplification.
  const headIDs=[],bodyIDs=[],indices=p.getIndices().getArray();
  if(p.getMaterial().getName()==='human_surface')for(let k=0;k<indices.length;k+=3){const ids=Array.from(indices.slice(k,k+3));const head=ids.every(id=>pos.getElement(id,[])[1]>old.Neck[1]+.012);(head?headIDs:bodyIDs).push(...ids);}
  for(let i=0;i<pos.getCount();i++){
   const a=pos.getElement(i,[]),n=norm.getElement(i,[]),js=ja.getElement(i,[]),ws=wa.getElement(i,[]),out=new T.Vector3(),nn=new T.Vector3();
   let sum=0;for(let k=0;k<4;k++){if(ws[k]<=0)continue;const w=warp[names[js[k]]];out.addScaledVector(V(a).applyMatrix4(w.m),ws[k]);nn.addScaledVector(V(n).applyMatrix3(w.n),ws[k]);sum+=ws[k];}
   if(sum>0){out.multiplyScalar(1/sum);nn.normalize();}
   // Body types alter radial muscle volume around canonical joints, never bone lengths.
   const torso=clamp(1-Math.abs(out.y-1.19)/.33,0,1),leg=clamp(1-Math.abs(out.y-.58)/.26,0,1);
   if(p.getMaterial().getName()!=='eyes'&&out.y<1.39){out.x*=1+(profile.width-1)*(.7+.3*torso);out.z*=1+(profile.depth-1)*(.6+.4*torso);}
   // Canonical shoulder centres are 0.16m from the midline. The realistic chest
   // is wider than that: retain anatomical shoulder/arm clearance in the mesh,
   // rather than burying a humerus inside the torso or changing the contract.
   let armWeight=0,armSide=0;for(let k=0;k<4;k++)if(js[k]>=6&&js[k]<=11){armWeight+=ws[k];armSide+=(js[k]<=8?1:-1)*ws[k];}
   if(armWeight>.001){const side=Math.sign(armSide)||Math.sign(out.x);out.x+=side*.035*armWeight+(out.x-side*.16)*.15*armWeight;out.z*=1+.15*armWeight;}
   // Authored focused expression: brows drawn inward/down, lip corners gently compressed.
   // The field is smooth and millimetric; head anatomy remains the source human mesh.
   if(p.getMaterial().getName()==='human_surface'&&a[1]>old.Head[1]&&a[2]>.045){
    const rel=a[1]-old.Head[1],x=a[0]-old.Head[0];
    const brow=Math.exp(-(((rel-.103)/.020)**2))*Math.exp(-(((Math.abs(x)-.040)/.025)**2));
    const lip=Math.exp(-(((rel-.003)/.013)**2))*Math.exp(-(((Math.abs(x)-.025)/.018)**2));
    out.y-=.0026*brow;out.x-=Math.sign(x)*.0018*brow;out.y-=.0012*lip;
    if(brow>.1||lip>.1)focusVertices++;
   }
   pos.setElement(i,out.toArray());norm.setElement(i,nn.toArray());
  }
  if(headIDs.length&&bodyIDs.length){const head=p.clone().setIndices(d.createAccessor('face-indices').setType(Accessor.Type.SCALAR).setArray(new Uint32Array(headIDs)).setBuffer(d.getRoot().listBuffers()[0]));head.setExtras({part:'protected-human-face'});p.setIndices(d.createAccessor('body-indices').setType(Accessor.Type.SCALAR).setArray(new Uint32Array(bodyIDs)).setBuffer(d.getRoot().listBuffers()[0]));mesh.addPrimitive(head);}
 }
 // Strip all source compression; final package needs only a core glTF2 loader.
 for(const ext of d.getRoot().listExtensionsUsed())ext.dispose();
 for(const [i,b]of CANON_BONES.entries())joints[i].setTranslation(b.rest).setRotation([0,0,0,1]).setScale([1,1,1]);
 const ibm=new Float32Array(names.length*16);names.forEach((name,i)=>ibm.set(new T.Matrix4().makeTranslation(...canonicalWorld[name].map(v=>-v)).toArray(),i*16));
 skin.setName('Canonical18').setInverseBindMatrices(d.createAccessor('canonical18-inverse-bind').setType(Accessor.Type.MAT4).setArray(ibm).setBuffer(d.getRoot().listBuffers()[0]));
 for(const node of d.getRoot().listNodes())if(node.getMesh())node.setName(profile.id+'-human-athlete').setWeights([]);
 for(const m of d.getRoot().listMaterials()){
  const n=m.getName(),colour=n==='team_primary'?profile.primary:n==='team_secondary'||n==='compression'?profile.secondary:n==='team_trim'?profile.trim:null;
  if(colour)m.setBaseColorFactor([...new T.Color(colour).toArray(),1]);
 }
 await d.transform(weld({overwrite:true}));
 for(const mesh of d.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  const mat=p.getMaterial().getName(),face=p.getExtras().part==='protected-human-face';
  const ratio=face?.68:mat==='human_surface'?.18:mat==='hair'?.42:mat==='eyes'?1:.22;
  simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio,error:face?.0008:.007,lockBorder:true});
  // Tangents are rebuilt by the loader if needed; remove obsolete tangents after the rest warp.
  p.setAttribute('TANGENT',null);p.getMaterial().setNormalTexture(null);
 }
 const mapInfo=await maps(profile,d);
 await d.transform(prune(),dedup());
 // Core glTF normalized UV/weights and byte joint IDs save bandwidth without
 // quantizing POSITION or touching any bone / inverse-bind matrix.
 const used=new Set([skin.getInverseBindMatrices()]);
 for(const mesh of d.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  const uv=p.getAttribute('TEXCOORD_0'),ja=p.getAttribute('JOINTS_0'),wa=p.getAttribute('WEIGHTS_0');
  const uvs=new Uint16Array(uv.getCount()*2),weights=new Uint16Array(wa.getCount()*4),js=new Uint8Array(ja.getCount()*4);
  for(let i=0;i<uv.getCount();i++)uvs.set(uv.getElement(i,[]).map(v=>Math.round(clamp(v,0,1)*65535)),i*2);
  for(let i=0;i<wa.getCount();i++){
   const w=wa.getElement(i,[]),sum=w.reduce((a,b)=>a+b,0)||1,q=w.map(v=>Math.floor(v/sum*65535));
   q[w.indexOf(Math.max(...w))]+=65535-q.reduce((a,b)=>a+b,0);weights.set(q,i*4);js.set(ja.getElement(i,[]).map((j,k)=>q[k]===0?0:j),i*4);
  }
  uv.setArray(uvs).setNormalized(true);ja.setArray(js).setNormalized(false);wa.setArray(weights).setNormalized(true);
  used.add(p.getIndices());for(const s of p.listSemantics())used.add(p.getAttribute(s));
 }
 // Samplers/targets orphaned by a source library are not payload assets.
 for(const a of d.getRoot().listAccessors())if(!used.has(a))a.dispose();
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],triangles=0,vertices=0;
 for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){
  const a=p.getAttribute('POSITION');triangles+=p.getIndices().getCount()/3;vertices+=a.getCount();
  for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]);for(let c=0;c<3;c++){min[c]=Math.min(min[c],v[c]);max[c]=Math.max(max[c],v[c]);}}
 }
 const data=await io.writeBinary(d),model='players/'+profile.id+'.glb';await fs.writeFile(path.join(root,model),data);
 const canonicalHeightMeters=max[1]-min[1];
 const record={...profile,model,mask:'players/masks/'+profile.id+'-team.png',canonicalHeightMeters,scaleToPreferredHeight:profile.heightMeters/canonicalHeightMeters,groundOffsetMeters:-min[1],triangles,vertices,bytes:data.length,bounds:{min,max},focusVertices,teamMaterials:{primary:['team_primary'],secondary:['team_secondary','compression'],trim:['team_trim']},source:'../hoops-v7/characters/models/'+profile.source+'.glb',sourceSha256,sourceCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',...mapInfo};
 console.log(JSON.stringify(record));return record;
}
const players=[];for(const p of profiles)players.push(await build(p));
await fs.writeFile(path.join(root,'players/catalog.json'),JSON.stringify({schemaVersion:1,rig:{path:'players/rig.json',bones:18,canonical:true,axes:{up:'+Y',forward:'+Z',left:'+X'},restPose:'arms-down, identity local rotations'},players},null,2)+'\n');
await fs.writeFile(path.join(root,'players/rig.json'),JSON.stringify({schemaVersion:1,name:'Canonical18',source:'workout/island/minigames/athletes-core.mjs CANON_BONES',rotationFormat:'quaternion-xyzw',bones:CANON_BONES.map(b=>({...b,translation:b.rest,rotation:[0,0,0,1],scale:[1,1,1],worldPosition:canonicalWorld[b.name]})),clips:'Use existing canonical18 clips directly. Height is an actor wrapper scale, never a bone scale.'},null,2)+'\n');
