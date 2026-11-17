// Deterministic glTF 2.0 authoring. All mesh data is baked into the delivered GLBs.
import * as T from '../vendor/three.module.js';
import fs from 'node:fs/promises';
export {T};
export const rgb = hex => new T.Color(hex).toArray();
export const quat = (x=0,y=0,z=0) => new T.Quaternion().setFromEuler(new T.Euler(x,y,z)).toArray();

export class Art {
  constructor(){this.p=[];this.n=[];this.c=[];this.j=[];this.w=[];}
  add(geometry,color,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],weights=1,flat=false){
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();
    const m=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));
    g.applyMatrix4(m);if(flat)g.computeVertexNormals();
    const a=g.attributes.position,n=g.attributes.normal,base=rgb(color);
    for(let i=0;i<a.count;i+=3){
      const av=new T.Vector3().fromBufferAttribute(a,i),bv=new T.Vector3().fromBufferAttribute(a,i+1),cv=new T.Vector3().fromBufferAttribute(a,i+2);
      if(bv.sub(av).cross(cv.sub(av)).lengthSq()<1e-14)continue;
      for(let k=0;k<3;k++){
        const ix=i+k,v=[a.getX(ix),a.getY(ix),a.getZ(ix)];this.p.push(...v);
        this.n.push(n.getX(ix),n.getY(ix),n.getZ(ix));this.c.push(...base.map(x=>Math.round(T.MathUtils.clamp(x,0,1)*255)),255);
        const skin=typeof weights==='function'?weights(v):[[weights,1]],joint=[0,0,0,0],weight=[0,0,0,0];
        let used=0;skin.forEach(([j,w],s)=>{weight[s]=s===skin.length-1?255-used:Math.round(w*255);joint[s]=weight[s]?j:0;used+=weight[s];});
        this.j.push(...joint);this.w.push(...weight);
      }
    }
    geometry.dispose();g.dispose();return this;
  }
  sphere(p,s,c,segments=10,rings=5,j=1,flat=false){return this.add(new T.SphereGeometry(1,segments,rings),c,p,s,[0,0,0],j,flat);}
  box(p,s,c,rotation=[0,0,0],j=1){return this.add(new T.BoxGeometry(...s),c,p,[1,1,1],rotation,j,true);}
  cylinder(p,r1,r2,h,c,segments=6,rotation=[0,0,0],j=1,heightSegments=1){return this.add(new T.CylinderGeometry(r1,r2,h,segments,heightSegments),c,p,[1,1,1],rotation,j,true);}
  tube(points,radius,c,sides=4,j=1){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    return this.add(new T.TubeGeometry(curve,points.length-1,radius,sides,false),c,[0,0,0],[1,1,1],[0,0,0],j,true);
  }
  disc(p,s,c,segments=8,rotation=[0,0,0],j=1){return this.add(new T.CircleGeometry(1,segments),c,p,s,rotation,j,true);}
  get triangles(){return this.p.length/9;}
}

// Small standards-only GLB writer: no compression decoder or external buffers/textures.
export async function writeGLB(file,id,art,{rig,animations=[],unlit=false,extras={}}={}){
  const json={asset:{version:'2.0',generator:'Bakasun boars-world-v1 deterministic authoring',copyright:'CC0-1.0 original assets'},
    scene:0,scenes:[{name:id,nodes:[0]}],nodes:[{name:'asset_root',children:[1],extras}],
    meshes:[],materials:[{name:unlit?'Painted sky':'Meadow matte',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.9}}],
    buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  if(unlit){json.extensionsUsed=['KHR_materials_unlit'];json.materials[0].extensions={KHR_materials_unlit:{}};}
  const chunks=[];let length=0;
  const accessor=(array,type,target,minmax=false,normalized=false)=>{
    const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
    const view=json.bufferViews.length,b=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    json.bufferViews.push({buffer:0,byteOffset:length,byteLength:b.length,...(target?{target}:{})});chunks.push(b);length+=b.length;
    const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},componentType=array instanceof Float32Array?5126:array instanceof Uint16Array?5123:5121;
    const a={bufferView:view,componentType,count:array.length/sizes[type],type,...(normalized?{normalized:true}:{})};
    if(minmax){a.min=Array(sizes[type]).fill(Infinity);a.max=Array(sizes[type]).fill(-Infinity);array.forEach((v,i)=>{const c=i%sizes[type];a.min[c]=Math.min(a.min[c],v);a.max[c]=Math.max(a.max[c],v);});}
    return json.accessors.push(a)-1;
  };
  const attributes={POSITION:accessor(new Float32Array(art.p),'VEC3',34962,true),NORMAL:accessor(new Float32Array(art.n),'VEC3',34962),COLOR_0:accessor(new Uint8Array(art.c),'VEC4',34962,false,true)};
  if(rig){attributes.JOINTS_0=accessor(new Uint8Array(art.j),'VEC4',34962);attributes.WEIGHTS_0=accessor(new Uint8Array(art.w),'VEC4',34962,false,true);}
  json.meshes.push({name:id,primitives:[{attributes,material:0,mode:4}]});json.nodes.push({name:id+'_mesh',mesh:0,...(rig?{skin:0}:{})});
  if(rig){
    // glTF requires a skinned mesh at scene root; the rig is its sibling.
    json.scenes[0].nodes.push(1);json.nodes[0].children=[2];
    for(const [i,b]of rig.entries())json.nodes.push({name:b.name,translation:b.local,children:rig.flatMap((c,j)=>c.parent===i?[j+2]:[])});
    const inverse=[];
    for(const b of rig)inverse.push(...new T.Matrix4().makeTranslation(...b.world.map(x=>-x)).elements);
    json.skins=[{name:'Boar_14_joint_skin',skeleton:2,joints:rig.map((_,i)=>i+2),inverseBindMatrices:accessor(new Float32Array(inverse),'MAT4')}];
    json.animations=[];
    for(const clip of animations){
      const input=accessor(new Float32Array(clip.times),'SCALAR',null,true),samplers=[],channels=[];
      for(const ch of clip.channels){
        const output=accessor(new Float32Array(ch.values),ch.path==='rotation'?'VEC4':'VEC3');
        channels.push({sampler:samplers.length,target:{node:ch.joint+2,path:ch.path}});samplers.push({input,output,interpolation:'LINEAR'});
      }
      json.animations.push({name:clip.name,samplers,channels,extras:{sampleRateHz:30,loop:clip.loop,rootMotion:false}});
    }
  }
  for(const node of json.nodes)if(node.children?.length===0)delete node.children;
  json.buffers[0].byteLength=length;const bin=Buffer.concat(chunks),binPadding=Buffer.alloc((4-bin.length%4)%4);
  const str=Buffer.from(JSON.stringify(json)),jsonPadding=Buffer.alloc((4-str.length%4)%4,32),jsonChunk=Buffer.concat([str,jsonPadding]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+bin.length+binPadding.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length+binPadding.length,0);bh.writeUInt32LE(0x004e4942,4);
  const bytes=Buffer.concat([header,jsonChunk,bh,bin,binPadding]);await fs.writeFile(file,bytes);
  return {id,file:'models/'+id+'.glb',triangles:art.triangles,vertices:art.p.length/3,bytes:bytes.length};
}
