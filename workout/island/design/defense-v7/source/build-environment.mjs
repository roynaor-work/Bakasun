import {Art,T,fs,path,root} from './mesh.mjs';

function terrain(a,name,radius,height,base,color){
  const n=72,vertices=[],indices=[];
  vertices.push(0,height,0);
  for(let j=0;j<n;j++){
    const t=j/n*Math.PI*2,r=radius*(1+.055*Math.sin(t*3+.4)+.025*Math.cos(t*7));
    vertices.push(Math.cos(t)*r,height+Math.sin(t*4)*.035,Math.sin(t)*r*.82);
  }
  for(let j=0;j<n;j++){indices.push(0,1+(j+1)%n,1+j);}
  // The thin overhanging shore needs a hard normal seam at its top edge.
  // Sharing those vertices averaged the large meadow fan into its underside.
  const side=vertices.length/3;
  for(let j=0;j<n;j++)vertices.push(vertices[3+j*3],vertices[4+j*3],vertices[5+j*3]);
  const bottom=vertices.length/3;
  for(let j=0;j<n;j++)vertices.push(vertices[3+j*3]*.95,base,vertices[5+j*3]*.95);
  for(let j=0;j<n;j++){const k=(j+1)%n;indices.push(side+j,side+k,bottom+j,bottom+j,side+k,bottom+k);}
  const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices,3)).setIndex(indices);g.computeVertexNormals();
  a.add(g,color,[0,0,0],[0,0,0],[1,1,1],name);
}

const island=new Art('farm-island');
terrain(island,'shore',8.6,.15,-.45,'sand');terrain(island,'meadow',7.5,.23,.12,'grass');
for(const [x,z,s]of [[-7,-2,.8],[-6.5,3.6,.55],[-3,6,.6],[7.0,-.7,.58],[5.6,4,.65],[-1,-6.5,.48]]){
  island.sphere([x,.24,z],[s,s*.48,s*.7],'sand',12,6,'rocks');
  island.sphere([x+.18,.26,z+.1],[s*.58,s*.42,s*.5],'cream',12,6,'rocks');
}
// Sweeping light path from the jetty to the open gate, kept clear of props.
const route=new T.CatmullRomCurve3([[0,.255,6.4],[-.4,.255,4.2],[-.55,.255,2.2],[.2,.255,.4],[2,.255,-.3]].map(p=>new T.Vector3(...p))),pathPositions=[],pathIndices=[];
for(let i=0;i<=32;i++){const p=route.getPoint(i/32),t=route.getTangent(i/32),n=new T.Vector3(-t.z,0,t.x).multiplyScalar(.33);pathPositions.push(...p.clone().add(n).toArray(),...p.clone().sub(n).toArray());if(i<32){const j=i*2;pathIndices.push(j,j+2,j+1,j+1,j+2,j+3);}}
const pathMesh=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pathPositions,3)).setIndex(pathIndices);pathMesh.computeVertexNormals();island.add(pathMesh,'sand',[0,0,0],[0,0,0],[1,1,1],'path');
for(const [x,z,sx,sz]of [[-2,.4,1.3,.85],[.4,-1.5,1.5,.9],[0,.35,.75,.5]]){
  const vertices=[0,0,0],indices=[],n=24;
  for(const radius of [.55,1])for(let i=0;i<n;i++){const t=i/n*Math.PI*2,r=radius*(1+.07*Math.sin(t*3));vertices.push(Math.cos(t)*r,0,Math.sin(t)*r);}
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(0,j+1,i+1,i+1,j+1,i+1+n,j+1,j+1+n,i+1+n);}
  const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices,3)).setIndex(indices);g.computeVertexNormals();island.add(g,'grass',[x,.256,z],[0,0,0],[sx,1,sz],'worn-ground');
  const part=island.parts.at(-1).geo,p=part.attributes.position,c=part.attributes.color,grass=new T.Color('#83AC72'),soil=new T.Color('#A69B6D'),tint=new T.Color();
  for(let i=0;i<p.count;i++){const distance=Math.hypot((p.getX(i)-x)/sx,(p.getZ(i)-z)/sz),w=1-T.MathUtils.smoothstep(distance,.45,1.05);tint.copy(grass).lerp(soil,w*.8);c.setXYZ(i,tint.r,tint.g,tint.b);}
}
for(let i=0;i<10;i++)island.box([0,.25,6.25+i*.23],[1.12,.09,.19],'wood',.018,'jetty');
for(const x of [-.55,.55])for(const z of [6.6,8.15])island.cylinder([x,.35,z],.065,.65,'cream',[0,0,0],10);
island.anchor('ground',[0,.23,0]).anchor('gate',[0,.23,3.3]).anchor('shelter',[-3.6,.23,-2.2]).anchor('station',[3.6,.23,1.5]).anchor('bell',[1.4,.23,3.2]);
await island.write({mergeStaticGroups:true});
const crop=new Art('crop-patch');crop.box([0,.06,0],[2.2,.12,1.8],'wood',.06);
for(let i=0;i<5;i++){
  crop.box([-.86+i*.43,.12,0],[.29,.12,1.55],'brown',.04);
  for(let j=0;j<4;j++){
    const x=-.86+i*.43,z=-.6+j*.4;
    crop.sphere([x,.22,z],[.09,.12,.09],i%2?'coral':'gold',10,6);
    crop.tube([[x,.24,z],[x+.12,.48,z+.04]],[.045,.003],'green',6);
    crop.tube([[x,.24,z],[x-.10,.44,z-.03]],[.04,.003],'grass',6);
  }
}
await crop.write();
const cropLow=new Art('crop-patch',1);cropLow.box([0,.06,0],[2.2,.12,1.8],'wood',0);
for(let i=0;i<5;i++){
  cropLow.box([-.86+i*.43,.12,0],[.29,.12,1.55],'brown',0);
  for(let j=0;j<4;j++){const x=-.86+i*.43,z=-.6+j*.4;cropLow.sphere([x,.22,z],[.09,.12,.09],i%2?'coral':'gold',6,3);cropLow.add(new T.ConeGeometry(.065,.24,4),i%2?'green':'grass',[x,.36,z]);}
}
await cropLow.write({lod:1});
const trough=new Art('farm-trough');
trough.box([0,.17,0],[.9,.34,.45],'wood',.065);trough.box([0,.34,0],[.75,.035,.32],'glass',.03,'water');
await trough.write();
const troughLow=new Art('farm-trough',1);troughLow.box([0,.17,0],[.9,.34,.45],'wood',0);troughLow.box([0,.34,0],[.75,.035,.32],'glass',0,'water');await troughLow.write({lod:1});
const bale=new Art('hay-bale');bale.box([0,.3,0],[.72,.60,.54],'gold',.09);
for(const x of [-.22,.22])bale.box([x,.31,0],[.035,.61,.55],'sand',.012);await bale.write();
const baleLow=new Art('hay-bale',1);baleLow.box([0,.3,0],[.72,.60,.54],'gold',0);for(const x of [-.22,.22])baleLow.box([x,.31,0],[.035,.61,.55],'sand',0);await baleLow.write({lod:1});
await fs.writeFile(path.join(root,'farm-layout.json'),JSON.stringify({units:'meters',groundY:.23,
  props:[{asset:'farm-island',position:[0,0,0]},{asset:'farm-shelter',position:[-3.5,.23,-2.4],rotationY:.15},{asset:'guard-station',position:[3.7,.23,1.9],rotationY:-.35},{asset:'alarm-bell',position:[1.6,.23,3.3]},
    {asset:'farm-gate',position:[0,.23,3.45]},{asset:'crop-patch',position:[3.2,.23,-2.9],rotationY:.1},{asset:'crop-patch',position:[3.5,.23,-.6],rotationY:.1},
    {asset:'hay-bale',position:[-4.8,.23,-1.1]},{asset:'hay-bale',position:[-4.8,.23,-.55]},{asset:'hay-bale',position:[-4.8,.81,-.85]},{asset:'farm-trough',position:[-3,.23,1.7]},
    ...[[-5.8,-2.4],[-5.6,3.2],[5.9,2.7],[5.3,-3.8],[0,-5.4]].map(([x,z])=>({asset:'island-palm',position:[x,.23,z],scale:1.1}))],
  fence:[...[-4,-2,2,4].map(x=>({position:[x,.23,3.45],rotationY:0})),...[-4,-2,0,2,4].map(x=>({position:[x,.23,-4.0],rotationY:0})),...[-2.95,-.95,1.05].flatMap(z=>[-5,5].map(x=>({position:[x,.23,z],rotationY:Math.PI/2})))],
  boars:[{asset:'boar-amber',position:[-2,.23,.4],rotationY:.65,scale:1},{asset:'boar-ash',position:[.4,.23,-1.5],rotationY:-.9,scale:1.08},{asset:'boar-striped',position:[0,.23,.35],rotationY:1.2,scale:.72}],
  guards:[{asset:'guard-ranger',position:[-1.5,.23,3.8],rotationY:2.7,scale:1.25},{asset:'guard-lookout',position:[3.8,.23,1],rotationY:-1,scale:1.25},{asset:'guard-keeper',position:[-4.6,.23,2.4],rotationY:.65,scale:1.25}]
},null,2));
