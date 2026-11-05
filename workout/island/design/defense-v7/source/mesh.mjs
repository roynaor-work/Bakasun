import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as T from '../vendor/three.module.js';

const require=createRequire(process.env.DEFENSE_TOOLS || '/tmp/defense-v7-tools/package.json');
export const {Document,NodeIO}=require('@gltf-transform/core');
export const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
export const {draco,weld,simplify,prune,dedup,resample}=require('@gltf-transform/functions');
export const codec=require('draco3dgltf');
export {T,fs,path};
export const root=path.resolve(import.meta.dirname,'..');
export const out=path.join(root,'models');
export const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await codec.createEncoderModule(),
  'draco3d.decoder':await codec.createDecoderModule()
});
export const P={cream:'#F1E6CE',white:'#FFF8E9',teal:'#318E88',mint:'#A3D9BD',dark:'#243D48',
  coral:'#E98E76',orange:'#DD9D58',lavender:'#9D96BF',purple:'#655786',gold:'#E6BF68',
  green:'#658A61',grass:'#83AC72',sand:'#D9BE8D',wood:'#8A6650',brown:'#8F6549',
  ash:'#697176',piglet:'#AE835B',eye:'#162C36',glass:'#7DDCD3',red:'#CB655B'};
export const rgb=x=>new T.Color(P[x]||x);
export const acc=(doc,name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(doc.getRoot().listBuffers()[0]);
export function discardAnimation(animation){
  for(const channel of [...animation.listChannels()])channel.dispose();
  for(const sampler of [...animation.listSamplers()])sampler.dispose();
  animation.dispose();
}

export class Art {
  constructor(id,lod=0){this.id=id;this.lowDetail=!!lod;this.parts=[];this.anchors={};this.groups=new Map();this.pivots=new Map();}
  add(g,color='cream',position=[0,0,0],rotation=[0,0,0],scale=[1,1,1],group='shell',glow=false){
    const geo=g.index?g.toNonIndexed():g.clone();
    geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));
    const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,c=rgb(color),colors=[];
    for(let i=0;i<p.count;i++){
      // Baked soft underside shading stays readable with one material on a phone.
      const shade=glow?1:(.80+.20*Math.max(0,n.getY(i)));
      colors.push(c.r*shade,c.g*shade,c.b*shade);
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    this.parts.push({geo,group,glow,baseColor:c.toArray()});g.dispose();return this;
  }
  sphere(p,s,color,seg=24,rings=12,group='shell'){return this.add(new T.SphereGeometry(1,seg,rings),color,p,[0,0,0],s,group);}
  box(p,s,color,bevel=.05,group='shell'){
    if(this.lowDetail)bevel=0;
    if(bevel<=0)return this.add(new T.BoxGeometry(...s),color,p,[0,0,0],[1,1,1],group);
    // Explicit bevelled solid, no runtime primitive construction for delivered art.
    const shape=new T.Shape();const [w,h,d]=s,r=Math.min(bevel,w/2,h/2,d/2);
    const x=-w/2,y=-h/2;
    shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
    shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const g=new T.ExtrudeGeometry(shape,{depth:Math.max(.001,d-2*r),bevelEnabled:r>0,bevelSize:r*.42,bevelThickness:r,bevelSegments:2,steps:1,curveSegments:3});
    g.translate(0,0,-d/2+r);g.computeBoundingBox();
    const actual=g.boundingBox.getSize(new T.Vector3());g.scale(w/actual.x,h/actual.y,d/actual.z);
    return this.add(g,color,p,[0,0,0],[1,1,1],group);
  }
  tube(points,radii,color,segments=10,group='shell'){
    const positions=[],normals=[],uvs=[];const rings=points.length;
    for(let i=0;i<rings;i++){
      const c=new T.Vector3(...points[i]),a=new T.Vector3(...points[Math.max(0,i-1)]),b=new T.Vector3(...points[Math.min(rings-1,i+1)]);
      const dir=b.sub(a).normalize(),u=new T.Vector3(0,0,1);if(Math.abs(dir.dot(u))>.94)u.set(1,0,0);
      u.cross(dir).normalize();const v=new T.Vector3().crossVectors(dir,u).normalize();
      for(let j=0;j<segments;j++){
        const q=u.clone().multiplyScalar(Math.cos(j*Math.PI*2/segments)).addScaledVector(v,Math.sin(j*Math.PI*2/segments));
        positions.push(...c.clone().addScaledVector(q,Array.isArray(radii)?radii[i]:radii).toArray());normals.push(...q.toArray());uvs.push(j/segments,i/(rings-1));
      }
    }
    const indices=[];
    for(let i=0;i<rings-1;i++)for(let j=0;j<segments;j++){const a=i*segments+j,b=i*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
    for(let j=1;j<segments-1;j++){indices.push(0,j+1,j);const o=(rings-1)*segments;indices.push(o,o+j,o+j+1);}
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setAttribute('normal',new T.Float32BufferAttribute(normals,3)).setAttribute('uv',new T.Float32BufferAttribute(uvs,2)).setIndex(indices);
    return this.add(g,color,[0,0,0],[0,0,0],[1,1,1],group);
  }
  ring(p,r,t,color,rotation=[Math.PI/2,0,0],seg=40,group='shell',glow=false){return this.add(new T.TorusGeometry(r,t,6,seg),color,p,rotation,[1,1,1],group,glow);}
  cylinder(p,r,h,color,rotation=[0,0,0],segments=18,rTop=r,group='shell'){
    return this.add(new T.CylinderGeometry(rTop,r,h,segments,1),color,p,rotation,[1,1,1],group);
  }
  fin(points,thick,color,group='shell'){
    const shape=new T.Shape(points.map(p=>new T.Vector2(...p)));
    const g=new T.ExtrudeGeometry(shape,{depth:thick,bevelEnabled:true,bevelSize:thick*.35,bevelThickness:thick*.3,bevelSegments:2,curveSegments:4});
    g.rotateX(-Math.PI/2);g.translate(0,-thick/2,0);return this.add(g,color,[0,0,0],[0,0,0],[1,1,1],group);
  }
  anchor(name,p){this.anchors[name]=p;return this;}
  pivot(name,p){this.pivots.set(name,p);return this;}
  async write({lod=0,texture=false,animations=[],mergeStaticGroups=false}={}){
    const doc=new Document();doc.createBuffer();const scene=doc.createScene(this.id),rootNode=doc.createNode('asset_root');scene.addChild(rootNode);
    const standard=doc.createMaterial('Island painted enamel').setRoughnessFactor(.8).setMetallicFactor(0);
    const glow=doc.createMaterial('Luminous details').setRoughnessFactor(.5).setEmissiveFactor([.28,.45,.37]);
    const groups=new Map();let total=0;
    for(const part of this.parts){const group=mergeStaticGroups&&!this.pivots.has(part.group)?'shell':part.group;const key=group+(part.glow?'-glow':'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(part);}
    for(const [name,parts]of groups){
      const attributes={POSITION:[],NORMAL:[],COLOR_0:[]};
      const pivot=this.pivots.get(name)||[0,0,0];
      for(const {geo,baseColor}of parts)for(const [a,b]of [['POSITION','position'],['NORMAL','normal'],['COLOR_0','color']]){
        const values=a==='COLOR_0'&&texture?Array.from({length:geo.attributes.position.count*3},(_,i)=>baseColor[i%3]):Array.from(geo.attributes[b].array);
        if(a==='POSITION')for(let i=0;i<values.length;i++)values[i]-=pivot[i%3];
        attributes[a].push(...values);
      }
      const prim=doc.createPrimitive().setMaterial(parts[0].glow?glow:standard);
      for(const [name,values]of Object.entries(attributes))prim.setAttribute(name,acc(doc,name,'VEC3',new Float32Array(values)));
      const n=attributes.POSITION.length/3;total+=n/3;
      prim.setIndices(acc(doc,'Indices','SCALAR',new Uint32Array(Array.from({length:n},(_,i)=>i))));
      const node=doc.createNode(name).setTranslation(pivot).setMesh(doc.createMesh(name).addPrimitive(prim));rootNode.addChild(node);this.groups.set(name,node);
    }
    for(const [name,p]of Object.entries(this.anchors))rootNode.addChild(doc.createNode('anchor_'+name).setTranslation(p));
    rootNode.setExtras({units:'meters',up:'+Y',forward:'+Z',artPack:'defense-v7',lod,anchors:this.anchors});
    for(const def of animations){
      const animation=doc.createAnimation(def.name);const input=acc(doc,def.name+' time','SCALAR',new Float32Array(def.times));
      for(const c of def.channels){
        const node=this.groups.get(c.node);if(!node)throw Error('Missing animation target '+c.node);
        const output=acc(doc,def.name+' '+c.node,c.path==='rotation'?'VEC4':'VEC3',new Float32Array(c.values));
        const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
        animation.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(c.path).setSampler(sampler)).addSampler(sampler);
      }
    }
    await doc.transform(weld(),dedup(),prune({keepLeaves:true}));
    if(texture)await paletteAtlas(doc,this.id+(lod?'-lod'+lod:''));
    await doc.transform(prune({keepLeaves:true}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeColor:8,quantizeTexcoord:12}));
    const filename=this.id+(lod?'-lod'+lod:'')+'.glb';await io.write(path.join(out,filename),doc);
    return {id:this.id,lod,filename,triangles:total,bytes:(await fs.stat(path.join(out,filename))).size,groups:[...groups.keys()]};
  }
}

const atlasPalettes=new Map();
export async function paletteAtlas(doc,id){
  // Quantize authored linear colors onto 32×32 padded swatches of a single atlas.
  const baseId=id.replace(/-lod\d+$/,''),shared=atlasPalettes.get(baseId),palette=shared?[...shared]:[],lookup=new Map(palette.map((v,i)=>[v.join(','),i]));
  const primitives=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
  for(const p of primitives){const c=p.getAttribute('COLOR_0');if(!c)continue;
    const indices=p.getIndices()?.getArray()||Array.from({length:c.getCount()},(_,i)=>i),uv=[],data=new Map();
    for(const name of p.listSemantics())if(name!=='COLOR_0'&&name!=='TEXCOORD_0')data.set(name,[]);
    for(let i=0;i<indices.length;i+=3){
      const mean=[0,0,0];for(let j=0;j<3;j++){const color=c.getElement(indices[i+j],[]);for(let k=0;k<3;k++)mean[k]+=color[k]/3;}
      const a=new T.Color(...mean).convertLinearToSRGB().toArray().map(v=>Math.round(T.MathUtils.clamp(v,0,1)*31)*255/31|0);
      const key=a.join(',');let k=lookup.get(key);
      if(k===undefined){
        if(shared){let distance=Infinity;for(let j=0;j<palette.length;j++){const d=palette[j].reduce((s,v,n)=>s+(v-a[n])**2,0);if(d<distance){distance=d;k=j;}}}
        else{k=palette.length;palette.push(a);}lookup.set(key,k);
      }
      if(k>=1024)throw Error('Atlas palette overflow');
      for(let j=0;j<3;j++){
        uv.push(((k%32)+.5)/32,(Math.floor(k/32)+.5)/32);
        for(const [name,values]of data)values.push(...p.getAttribute(name).getElement(indices[i+j],[]));
      }
    }
    for(const [name,values]of data){const old=p.getAttribute(name),Type=old.getArray().constructor;const array=old.getNormalized()?new Float32Array(values):new Type(values);p.setAttribute(name,acc(doc,name,old.getType(),array));}
    p.setIndices(acc(doc,'Atlas triangle indices','SCALAR',new Uint32Array(Array.from({length:indices.length},(_,i)=>i))));
    p.setAttribute('TEXCOORD_0',acc(doc,'Constant padded swatch per triangle','VEC2',new Float32Array(uv)));p.setAttribute('COLOR_0',null);
  }
  if(!shared)atlasPalettes.set(baseId,palette);
  const {deflateSync}=await import('node:zlib');
  const crc32=buffer=>{let crc=0xffffffff;for(const b of buffer){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
  const side=512,stride=side*3+1,tile=side/32,raw=Buffer.alloc(side*stride);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const color=palette[Math.floor(y/tile)*32+Math.floor(x/tile)]||[255,248,233],offset=y*stride+1+x*3;
    for(let k=0;k<3;k++)raw[offset+k]=color[k];
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(side,0);header.writeUInt32BE(side,4);header[8]=8;header[9]=2;
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
  if(!shared)await fs.writeFile(path.join(root,'textures',baseId+'-atlas.png'),bytes);
  const tex=doc.createTexture(id+' single color atlas').setImage(bytes).setMimeType('image/png');
  for(const m of doc.getRoot().listMaterials())m.setBaseColorTexture(tex);
  await doc.transform(weld());
}
