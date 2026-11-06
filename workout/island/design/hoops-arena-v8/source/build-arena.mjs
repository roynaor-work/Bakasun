/** Authoring only. npm dependencies live outside this package; see INTEGRATION.md. */
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import {mergeGeometries,mergeVertices} from '../runtime/vendor/BufferGeometryUtils.js';
import {COURT,ASSETS} from '../runtime/layout.mjs';
const root=fileURLToPath(new URL('../runtime/',import.meta.url));
const depRoot=process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules';
const req=createRequire(path.join(depRoot,'anchor.cjs'));
const pkg=async name=>import(pathToFileURL(req.resolve(name)).href);
const {Document,NodeIO}=await pkg('@gltf-transform/core');
const {KHRDracoMeshCompression}=await pkg('@gltf-transform/extensions');
const {draco,prune,dedup}=await pkg('@gltf-transform/functions');
const {default:draco3d}=await pkg('draco3dgltf');
const encoder=await draco3d.createEncoderModule();
const decoder=await draco3d.createDecoderModule();
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.encoder':encoder,'draco3d.decoder':decoder});
const C={concrete:0x343d47,structure:0x141c28,steel:0x64717a,white:0xdeddd1,teal:0x205d63,amber:0xaf7743,black:0x0c141e,rim:0xe37330,net:0xdcd6c2,lamp:0xffe3b2};
for(let level=0;level<3;level++) {
  const batches=new Map();
  const matNames=new Set();
  function collect(part,mat,geo,p=[0,0,0],s=[1,1,1],rot=[0,0,0]) {
    const o=new THREE.Object3D();o.position.set(...p);o.scale.set(...s);o.rotation.set(...rot);o.updateMatrix();
    geo.applyMatrix4(o.matrix);if(!geo.index)geo=mergeVertices(geo);
    const key=part+'::'+mat; if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geo);matNames.add(mat);
  }
  function box(part,mat,p,s,rot) {collect(part,mat,new THREE.BoxGeometry(1,1,1),p,s,rot);}
  function plane(part,mat,p,s,rot=[-Math.PI/2,0,0]){collect(part,mat,new THREE.PlaneGeometry(1,1),p,[...s,1],rot);}
  function rod(part,mat,a,b,r=.04,segs=level?4:6) {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
    const g=new THREE.CylinderGeometry(r,r,delta.length(),segs,1,true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());collect(part,mat,g);
  }
  // Exact surface and generous safety runoff. All court lines live in the 1K map.
  plane('court','parquet',[0,.008,0],[32,20]);
  box('court','structure',[0,-.16,0],[32,.3,20]);
  box('bowl','black',[0,-.25,0],[61,.16,47]);
  // Continuous tiered U-profile: corners are dark acoustic wedges, not sky gaps.
  for(let tier=0;tier<2;tier++) {
    const rows=tier?5:7;
    for(let row=0;row<rows;row++) {
      const dep=(tier?6.1:0)+row*.88;
      const y=(tier?4.9:.38)+row*.51;
      for(const side of [-1,1]) {
        const count=level===2&&row%2?0:1;if(!count)continue;
        box('bowl','concrete',[0,y-.26,side*(10.65+dep)],[33.3,.42,1.03]);
        box('bowl','concrete',[side*(17.25+dep),y-.26,0],[1.03,.42,20.6]);
      }
    }
  }
  for(const side of [-1,1]) {
    box('bowl','structure',[0,5.1,side*16.22],[35.3,.85,.24]);
    box('bowl','structure',[side*22.8,5.1,0],[.24,.85,33.9]);
    box('ribbon','teal-led',[0,5.15,side*16.09],[34.6,.21,.03]);
    box('ribbon','amber-led',[side*22.67,5.15,0],[.03,.21,30.7]);
    box(side>0?'wall-south':'wall-north','structure',[0,10.1,side*21.8],[57,6,.45]);
    box(side>0?'wall-east':'wall-west','structure',[side*28.4,10.1,0],[.45,6,43.4]);
    // Corner infill creates a closed bowl with a graphic vertical rib cadence.
    for(const sx of [-1,1])for(let tier=0;tier<2;tier++)for(let row=0;row<(tier?5:7);row++) {
      const inner=(tier?6.1:0)+row*.88+.45,outer=inner+.92,y=(tier?4.9:.38)+row*.51-.05;
      const segs=level===2?3:5;
      const pos=[],uv=[],idx=[];
      for(let k=0;k<=segs;k++) {
        const a=k/segs*Math.PI/2;
        for(const [r,yy]of [[inner,y],[outer,y],[outer,y-.50]]) {
          pos.push(sx*(16.65+r*Math.cos(a)),yy,side*(10.05+r*Math.sin(a)));uv.push(k/segs,r);
        }
      }
      for(let k=0;k<segs;k++)for(const [a,b,c]of [[0,1,3],[1,4,3],[1,2,4],[2,5,4]]) {
        const verts=[k*3+a,k*3+b,k*3+c];idx.push(...(sx*side>0?verts.reverse():verts));
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      collect('bowl','concrete',g);
    }
    if(level<2) for(let x=-24;x<=24;x+=4) {
      box('bowl','steel',[x,10,side*21.5],[.10,5.8,.12]);
      // Exit recesses, no real safety labels or marks.
      if(Math.abs(x)<18)box('bowl','black',[x,7.6,side*21.47],[1.45,2.15,.05]);
    }
    // Thin handrails at the balcony lip.
    for(const tier of [0,1]) {
      const z=tier?16.1:10.15,y=tier?5.7:.95;
      rod('railings','steel',[-16.4,y,side*z],[16.4,y,side*z],.028);
      if(level===0)for(let x=-16;x<=16;x+=4)rod('railings','steel',[x,y-.7,side*z],[x,y,side*z],.025);
    }
  }
  // Warm practical lights punctuate aisles; these are emissive surfaces.
  for(const side of [-1,1])for(const x of [-8.16,0,8.16])for(let row=0;row<7;row++) {
    plane('aisles','warm-led',[x,.14+row*.51,side*(10.23+row*.88)],[.32,.055]);
  }
  // Open roof trusses keep the playing volume readable at broadcast angles.
  for(const z of [-7,7]) {
    rod('roof','steel',[-22,12.8,z],[22,12.8,z],.055);
    rod('roof','steel',[-22,13.5,z],[22,13.5,z],.045);
    for(let x=-22;x<22;x+=level===2?4:2) {
      rod('roof','steel',[x,12.8,z],[x+(level===2?4:2),13.5,z],.025,4);
      if(level===0)rod('roof','structure',[x,13.5,z],[x+2,12.8,z],.024,4);
    }
    for(const x of [-15,-9,-3,3,9,15]) {
      box('lighting','black',[x,12.53,z],[1.45,.24,.65]);
      plane('lighting','warm-led',[x,12.395,z],[1.24,.46]);
    }
  }
  for(const x of [-19,0,19])rod('roof','structure',[x,13.2,-17],[x,13.2,17],.06);
  // Floating four-sided video cube. Runtime adds four shared-texture planes.
  box('scoreboard','black',[0,10.7,0],[4.65,2.3,2.65]);
  box('scoreboard','teal-led',[0,9.51,0],[4.7,.075,2.7]);
  box('scoreboard','structure',[0,12.04,0],[5.1,.2,3.1]);
  for(const x of [-1.7,1.7])rod('scoreboard','steel',[x,11.8,0],[x,15.2,0],.022,4);
  // Real-scale hoop units. Glass is a single sided draw with visible white target.
  for(const side of [-1,1]) {
    const part=side<0?'basket-home':'basket-away';const rim=side*COURT.rimX,board=side*13.20;
    box(part,side<0?'teal':'amber',[side*15.65,.48,0],[1.5,.96,1.8]);
    box(part,'black',[side*15.65,.065,0],[1.6,.13,1.95]);
    rod(part,'steel',[side*15.7,.7,0],[side*15.2,4.1,0],.11,6);
    rod(part,'steel',[side*15.2,4.1,0],[board,3.8,0],.10,6);
    box(part,'glass',[board,3.425,0],[.027,1.05,1.8]);
    for(const z of [-.91,.91])box(part,'white',[board,3.425,z],[.05,1.11,.035]);
    for(const y of [2.88,3.97])box(part,'white',[board,y,0],[.05,.035,1.855]);
    for(const z of [-.295,.295])box(part,'white',[board-side*.035,3.275,z],[.04,.45,.025]);
    for(const y of [3.05,3.50])box(part,'white',[board-side*.035,y,0],[.04,.025,.615]);
    box(part,'black',[board,2.89,0],[.12,.13,1.86]);
    collect(part,'rim',new THREE.TorusGeometry(.2376,.009,level===2?4:6,level===0?40:24),[rim,COURT.rimHeight,0],[1,1,1],[Math.PI/2,0,0]);
    box(part,'rim',[(rim+board)/2,COURT.rimHeight,0],[.39,.035,.11]);
    const cords=level===0?12:level===1?10:8;
    for(let i=0;i<cords;i++) {
      const a=i/cords*Math.PI*2,delta=Math.PI*2/cords;
      const top=[rim+.22*Math.cos(a),3.03,.22*Math.sin(a)];
      const mid=[rim+.145*Math.cos(a+delta/2),2.78,.145*Math.sin(a+delta/2)];
      const bot=[rim+.12*Math.cos(a),2.60,.12*Math.sin(a)];
      rod(part,'net',top,mid,.004,3);rod(part,'net',mid,bot,.004,3);
      if(level<2)rod(part,'net',top,[rim+.145*Math.cos(a-delta/2),2.78,.145*Math.sin(a-delta/2)],.004,3);
    }
    collect(part,'net',new THREE.TorusGeometry(.12,.0035,3,cords*2),[rim,2.60,0],[1,1,1],[Math.PI/2,0,0]);
    // Shot-clock housings face both ways, runtime updates digits.
    box(part,'black',[board,4.24,0],[.22,.44,.67]);
    if(level===0)for(const z of [-.73,.73])box(part,'steel',[side*15.7,.1,z],[.36,.18,.17]);
  }
  // Benches and officials' table; no decorative people or player assets.
  for(const side of [-1,1]) {
    for(let i=0;i<(level===2?5:8);i++) {
      const x=side*(4.8+i*.72),z=-9.05;
      box('courtside',side<0?'teal':'amber',[x,.48,z],[.52,.09,.46]);
      box('courtside',side<0?'teal':'amber',[x,.83,z-.21],[.52,.65,.07]);
      if(level===0)for(const sx of [-1,1])rod('courtside','steel',[x+sx*.2,.04,z],[x+sx*.2,.48,z],.024,4);
    }
  }
  box('courtside','black',[0,.66,-9.12],[6,1.25,.95]);
  box('courtside','teal-led',[0,.74,-8.63],[5.8,.36,.035]);
  box('courtside','steel',[0,1.32,-9.12],[6.15,.07,1.06]);
  // GlTF construction keeps part labels and one primitive per material batch.
  const doc=new Document();const buffer=doc.createBuffer();const scene=doc.createScene('Arena_LOD'+level);
  const materials=new Map();
  for(const name of matNames) {
    const color=new THREE.Color(C[name]??0xffffff);
    const mat=doc.createMaterial(name).setBaseColorFactor([color.r,color.g,color.b,1]).setRoughnessFactor(name==='steel'?.42:.8).setMetallicFactor(name==='steel'?.65:0);
    if(name.endsWith('-led')) {
      const c=new THREE.Color(name==='teal-led'?0x73b1ad:name==='amber-led'?0xf1aa5e:0xffe6b7);
      mat.setBaseColorFactor([0,0,0,1]).setEmissiveFactor([c.r,c.g,c.b]);
    }
    if(name==='glass')mat.setBaseColorFactor([.6,.76,.78,.14]).setAlphaMode('BLEND').setRoughnessFactor(.15).setDoubleSided(true);
    if(name==='parquet') {
      mat.setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.3).setMetallicFactor(0);
    }
    materials.set(name,mat);
  }
  let total=0;
  for(const [key,geos]of batches) {
    const [part,material]=key.split('::');
    const g=mergeVertices(mergeGeometries(geos));
    const prim=doc.createPrimitive().setMaterial(materials.get(material));
    for(const [name,semantic]of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']]) {
      const attr=g.getAttribute(name);if(!attr)continue;
      prim.setAttribute(semantic,doc.createAccessor().setType(attr.itemSize===2?'VEC2':'VEC3').setArray(new Float32Array(attr.array)).setBuffer(buffer));
    }
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index.array)).setBuffer(buffer));
    const mesh=doc.createMesh(part+'__'+material).addPrimitive(prim);
    scene.addChild(doc.createNode(mesh.getName()).setMesh(mesh));total+=g.index.count/3;
  }
  for(const side of [-1,1])scene.addChild(doc.createNode(side<0?'rim-home':'rim-away').setTranslation([side*COURT.rimX,COURT.rimHeight,0]));
  await doc.transform(dedup(),prune({keepLeaves:true,keepAttributes:true}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:8,quantizePosition:16,quantizeNormal:10,quantizeTexcoord:12}));
  const dest=path.join(root,ASSETS[level]);await io.write(dest,doc);
  console.log(ASSETS[level],total,'triangles', (await fs.stat(dest)).size,'bytes');
}
