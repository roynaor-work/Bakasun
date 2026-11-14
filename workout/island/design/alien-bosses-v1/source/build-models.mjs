// Original low-poly toy spacecraft. Node 22+, no build dependency.
// Run from any directory: node path/to/source/build-models.mjs
import * as T from '../vendor/three.module.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const P={cream:'#fff0d4',dark:'#27354e',mint:'#62cdb8',glass:'#a5f0de',coral:'#f48b6d',gold:'#ffd36d',pink:'#fa789f',violet:'#ab8ce5',navy:'#46557c',wear:'#a06554'};
const V=()=>new T.Vector3();
class Craft {
  constructor(id){this.id=id;this.parts=new Map();this.anchors=[];}
  part(name,p=[0,0,0],role='armor'){const a={name,p,role,geo:[],wear:[],critical:[]};this.parts.set(name,a);return a;}
  add(a,g,c,p=[0,0,0],s=[1,1,1],rot=[0,0,0],kind='geo'){
    g=g.index?g.toNonIndexed():g;
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rot)),new T.Vector3(...s)));
    const col=new T.Color(P[c]||c),colors=[];
    for(let i=0;i<g.attributes.position.count;i++)colors.push(col.r,col.g,col.b);
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));a[kind].push(g);return a;
  }
  ball(a,p,s,c,n=12,r=6){return this.add(a,new T.SphereGeometry(1,n,r),c,p,s);}
  ring(a,p,r,t,c,n=20,k=4,rot=[Math.PI/2,0,0]){return this.add(a,new T.TorusGeometry(r,t,k,n),c,p,[1,1,1],rot);}
  cyl(a,p,r,h,c,n=12,rot=[0,0,0],rt=r){return this.add(a,new T.CylinderGeometry(rt,r,h,n,1),c,p,[1,1,1],rot);}
  box(a,p,s,c){return this.add(a,new T.BoxGeometry(...s),c,p);}
  anchor(a,name,p){this.anchors.push({parent:a.name,name,p});}
  scratches(a,x,y,z,w=.3){
    // Painted zig-zag scuffs, never exposed machinery or sharp shards.
    for(const [level,yy] of [['wear',y],['critical',y+.012]]){
      const pts=[[x-w/2,yy,z],[x-w*.12,yy,z-.09],[x+w*.08,yy,z+.05],[x+w/2,yy,z-.06]];
      for(let i=0;i<3;i++){
        const u=new T.Vector3(...pts[i]),v=new T.Vector3(...pts[i+1]);
        const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.clone().sub(u).normalize());
        const g=new T.CylinderGeometry(.018,.018,v.distanceTo(u),4);g.applyQuaternion(q);g.translate(...u.add(v).multiplyScalar(.5).toArray());
        this.add(a,g,level==='wear'?'wear':'gold',[0,0,0],[1,1,1],[0,0,0],level);
      }
    }
  }
}
function face(c,a,p,scale=1){
  const [x,y,z]=p;
  for(const s of [-1,1]){
    c.ball(a,[x+s*.16*scale,y,z],[.058*scale,.065*scale,.022*scale],'dark',8,4);
    c.ball(a,[x+s*.147*scale,y+.02*scale,z+.019*scale],[.016*scale,.016*scale,.009*scale],'cream',6,3);
  }
  // Small round smile, facing +Z.
  c.add(a,new T.TorusGeometry(.08*scale,.013*scale,4,8,Math.PI), 'dark',[x,y-.07*scale,z],[1,1,1],[0,0,Math.PI]);
}
function mothership(){
  const c=new Craft('mothership'),a=c.part('hull',[0,0,0],'core');
  c.ball(a,[0,0,0],[2.15,.31,1.17],'navy',20,8);
  c.ball(a,[0,.14,0],[1.98,.26,1.08],'cream',20,6);
  c.ring(a,[0,.05,0],1,.055,'gold',20,4); // transformed elliptical trim
  a.geo.at(-1).scale(2.05,1,1.1);
  c.ball(a,[0,.43,-.15],[.83,.53,.65],'mint',12,6);
  c.ball(a,[0,.55,.15],[.61,.32,.45],'glass',12,6);
  face(c,a,[0,.56,.59],1.5);
  for(let i=0;i<8;i++){const t=i/8*Math.PI*2;c.ball(a,[Math.cos(t)*1.72,.29,Math.sin(t)*.76],[.09,.05,.08],i%2?'gold':'coral',8,4);}
  for(const s of [-1,1]){c.cyl(a,[s*1.2,0,-.88],.23,.44,'dark',10,[Math.PI/2,0,0]);c.ball(a,[s*1.2,0,-1.1],[.16,.16,.04],'mint',8,4);}
  c.scratches(a,.95,.36,.15,.6);c.scratches(a,-.8,.36,-.22,.4);
  for(const [name,x,z] of [['turret_left',-1.32,.54],['turret_center',0,.91],['turret_right',1.32,.54]]){
    const t=c.part(name,[x,.08,z],'turret');
    c.ball(t,[0,0,0],[.38,.25,.33],'coral',10,5);
    c.ball(t,[0,.14,-.02],[.29,.15,.25],'cream',8,4);
    c.cyl(t,[0,-.02,.33],.135,.49,'navy',10,[Math.PI/2,0,0]);
    c.ring(t,[0,-.02,.57],.137,.035,'gold',12,4,[0,0,0]);
    c.ball(t,[0,-.02,.572],[.10,.10,.017],'pink',8,4);
    c.scratches(t,0,.26,0,.28);c.anchor(t,`${name}_muzzle`,[0,-.02,.61]);
  }
  return c;
}
function guardian(){
  const c=new Craft('cosmic-guardian'),a=c.part('hull',[0,0,0],'core');
  c.ring(a,[0,0,0],1.25,.23,'violet',24,6);
  c.ring(a,[0,.12,0],1.25,.09,'cream',24,4);
  c.ball(a,[0,.12,-.24],[.65,.37,.65],'cream',16,8);
  c.ball(a,[0,.32,-.24],[.43,.32,.44],'mint',16,8);
  face(c,a,[0,.35,.42],1.25);
  for(const s of [-1,1]){
    c.box(a,[s*.7,0,-.2],[.8,.12,.19],'navy');
    c.ball(a,[s*1.35,.10,.3],[.33,.18,.52],'cream',12,6);
    c.ball(a,[s*.93,.18,-.88],[.35,.16,.32],'gold',14,7);
    c.ball(a,[s*1.45,.13,-.37],[.1,.08,.19],'gold',8,4);
    c.anchor(a,`hull_muzzle_${s<0?'left':'right'}`,[s*1.35,.10,.85]);
  }
  c.scratches(a,0,.48,-.4,.35);
  const g=c.part('generator',[0,.04,1.33],'generator');
  c.cyl(g,[0,0,0],.31,.22,'navy',16);
  c.ring(g,[0,.14,0],.30,.055,'gold',20,4);
  c.ball(g,[0,.35,0],[.24,.30,.24],'coral',16,8);
  c.ring(g,[0,.36,0],.255,.038,'cream',16,4,[0,0,Math.PI/4]);
  c.ball(g,[0,.65,0],[.085,.085,.085],'gold',8,4);
  c.scratches(g,0,.63,0,.22);c.anchor(g,'generator_hit',[0,.30,0]);
  const sh=c.part('shield',[0,.08,0],'shield');
  c.add(sh,new T.SphereGeometry(1,20,10),'mint',[0,0,0],[1.63,.76,1.1]);
  return c;
}
function crawler(){
  const c=new Craft('space-crawler');
  for(let i=0;i<5;i++){
    const x=(i-2)*.98,z=Math.sin(i*.85)*.25,a=c.part(`segment_${String(i+1).padStart(2,'0')}`,[x,0,z],'segment');
    const head=i===4,tail=i===0;
    c.ball(a,[0,0,0],[head?.64:.59,head?.39:.31,head?.64:.51],i%2?'violet':'mint',14,7);
    c.ball(a,[0,.19,-.03],[head?.52:.49,.24,head?.51:.43],'cream',10,6);
    if(i<4)c.cyl(a,[.51,0,0],.17,.29,'navy',8,[0,0,Math.PI/2]);
    for(const s of [-1,1]){
      c.ball(a,[s*.30,-.17,.39],[.18,.12,.17],'coral',8,4);
    }
    if(head){
      face(c,a,[.05,.12,.60],1.5);
      for(const s of [-1,1]){c.cyl(a,[s*.23,.46,.10],.025,.37,'navy',6,[0,0,s*.3]);c.ball(a,[s*.28,.64,.10],[.08,.08,.08],'gold',8,4);}
    }else{
      c.ball(a,[0,.43,0],[.095,.065,.14],tail?'gold':'coral',8,4);
    }
    c.scratches(a,0,.44,.08,.32);c.anchor(a,`${a.name}_muzzle`,[0,-.05,.56]);
  }
  return c;
}
function writeGLB(c){
  let bytes=Buffer.alloc(0);
  const doc={asset:{version:'2.0',generator:'Bakasun alien-bosses-v1 / original geometry',copyright:'CC0-1.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'boss_root',children:[],extras:{id:c.id,forward:'+Z',units:'meters'}}],meshes:[],materials:[{name:'painted-toy-enamel',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:.08,roughnessFactor:.55}},{name:'cosmic-shield',pbrMetallicRoughness:{baseColorFactor:[.3,1,.85,.16],metallicFactor:0,roughnessFactor:.3},alphaMode:'BLEND',doubleSided:true}],buffers:[],bufferViews:[],accessors:[],animations:[]};
  function accessor(array,type,target){
    while(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(1)]);
    const offset=bytes.length,b=Buffer.from(array.buffer,array.byteOffset,array.byteLength);bytes=Buffer.concat([bytes,b]);
    const vi=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length,...(target?{target}:{})});
    const size={SCALAR:1,VEC3:3,VEC4:4}[type],acc={bufferView:vi,componentType:5126,count:array.length/size,type};
    if(type==='VEC3'||type==='SCALAR'){
      acc.min=Array(size).fill(Infinity);acc.max=Array(size).fill(-Infinity);
      for(let i=0;i<array.length;i++){acc.min[i%size]=Math.min(acc.min[i%size],array[i]);acc.max[i%size]=Math.max(acc.max[i%size],array[i]);}
    }
    doc.accessors.push(acc);return doc.accessors.length-1;
  }
  const partIndices=new Map(),weightNodes=[],wearNodes=[],criticalNodes=[];let triangles=0;
  for(const a of c.parts.values()){
    const ni=doc.nodes.length;partIndices.set(a.name,ni);doc.nodes[0].children.push(ni);
    const node={name:a.name,translation:a.p,children:[],extras:{role:a.role,hitTarget:a.role!=='shield'}};doc.nodes.push(node);
    for(const kind of ['geo','wear','critical']){
      if(!a[kind].length)continue;
      const attrs={};for(const [key,label] of [['position','POSITION'],['normal','NORMAL'],['color','COLOR_0']]){
        const arr=new Float32Array(a[kind].reduce((n,g)=>n+g.attributes[key].array.length,0));let at=0;
        for(const g of a[kind]){arr.set(g.attributes[key].array,at);at+=g.attributes[key].array.length;}
        attrs[label]=accessor(arr,'VEC3',34962);
      }
      const count=doc.accessors[attrs.POSITION].count;triangles+=count/3;
      const primitive={attributes:attrs,material:a.role==='shield'?1:0,mode:4};
      const mesh={name:`${a.name}_${kind}`,primitives:[primitive]};
      if(kind==='geo'&&a.role!=='shield'){
        const original=bytes.subarray(doc.bufferViews[doc.accessors[attrs.POSITION].bufferView].byteOffset,doc.bufferViews[doc.accessors[attrs.POSITION].bufferView].byteOffset+count*12);
        const p=new Float32Array(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength));
        primitive.targets=[.14,.38].map((amount)=>{
          const d=new Float32Array(p.length);
          for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2];const dent=Math.exp(-((x-.12)**2+(z-.14)**2)*5);d[i]=-x*amount*dent*.4;d[i+1]=-amount*dent*Math.max(0,y);d[i+2]=-z*amount*dent*.25;}
          return {POSITION:accessor(d,'VEC3',34962)};
        });mesh.weights=[0,0];mesh.extras={targetNames:['damaged','critical']};
      }
      const mi=doc.meshes.length;doc.meshes.push(mesh);const mn=doc.nodes.length;
      doc.nodes.push({name:`${a.name}_${kind}`,mesh:mi,...(kind==='geo'?{}:{scale:[0,0,0]}),extras:{part:a.name,stateLayer:kind}});node.children.push(mn);
      if(mesh.weights)weightNodes.push(mn);if(kind==='wear')wearNodes.push(mn);if(kind==='critical')criticalNodes.push(mn);
    }
  }
  for(const a of c.anchors){const n=doc.nodes.length;doc.nodes.push({name:a.name,translation:a.p,extras:{anchor:true}});doc.nodes[partIndices.get(a.parent)].children.push(n);}
  function anim(name){const a={name,samplers:[],channels:[]};doc.animations.push(a);return a;}
  function track(a,node,p,t,values,type,interp='LINEAR'){
    const sampler=a.samplers.length;a.samplers.push({input:accessor(new Float32Array(t),'SCALAR'),output:accessor(new Float32Array(values),type),interpolation:interp});a.channels.push({sampler,target:{node,path:p}});
  }
  for(let state=0;state<3;state++){
    const a=anim(['Damage_Intact','Damage_Damaged','Damage_Critical'][state]);
    for(const n of weightNodes)track(a,n,'weights',[0,.1],state===0?[0,0,0,0]:state===1?[1,0,1,0]:[0,1,0,1],'SCALAR');
    for(const n of wearNodes)track(a,n,'scale',[0,.1],Array(2).fill(state>0?[1,1,1]:[0,0,0]).flat(),'VEC3','STEP');
    for(const n of criticalNodes)track(a,n,'scale',[0,.1],Array(2).fill(state>1?[1,1,1]:[0,0,0]).flat(),'VEC3','STEP');
  }
  const entry=anim('Entrance');track(entry,0,'translation',[0,.55,1.2],[0,0,-5,0,.2,-.8,0,0,0],'VEC3');track(entry,0,'scale',[0,.55,1.2],[.65,.65,.65,1.06,1.06,1.06,1,1,1],'VEC3');
  const retreat=anim('Retreat');track(retreat,0,'translation',[0,.35,1.1],[0,0,0,0,.4,-.5,0,2,-6],'VEC3');track(retreat,0,'scale',[0,.35,1.1],[1,1,1,.95,.95,.95,.25,.25,.25],'VEC3');
  const idle=anim('Idle');track(idle,0,'translation',[0,1.5,3],[0,0,0,0,.09,0,0,0,0],'VEC3');
  doc.nodes[0].extras.triangles=triangles;doc.buffers=[{byteLength:bytes.length}];
  let json=Buffer.from(JSON.stringify(doc));while(json.length%4)json=Buffer.concat([json,Buffer.from(' ')]);while(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(1)]);
  const head=Buffer.alloc(12);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+bytes.length,8);
  const chunk=(b,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(b.length);h.writeUInt32LE(t,4);return Buffer.concat([h,b]);};
  const output=Buffer.concat([head,chunk(json,0x4e4f534a),chunk(bytes,0x004e4942)]);
  fs.mkdirSync(path.join(root,'models'),{recursive:true});fs.writeFileSync(path.join(root,'models',`${c.id}.glb`),output);
  const result={id:c.id,triangles,bytes:output.length,parts:[...c.parts.values()].map(a=>({node:a.name,role:a.role,position:a.p})),anchors:c.anchors};console.log(JSON.stringify(result));return result;
}
fs.writeFileSync(path.join(root,'source','model-metadata.json'),JSON.stringify([mothership(),guardian(),crawler()].map(writeGLB),null,2)+'\n');
