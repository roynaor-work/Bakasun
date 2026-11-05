import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import draco3d from '/tmp/racing-v7-tools/node_modules/draco3dgltf/draco3dgltf.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()});
const records=[];
for(const id of ['coast','neon','ridge']){
  const doc=await io.read(path.join(root,`assets/tracks/${id}.glb`));
  const node=doc.getRoot().listNodes().find(n=>n.getName()==='Terrain');
  const cells=new Map(),size=18;
  for(const primitive of node.getMesh().listPrimitives()){
    const a=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray(),m=node.getWorldMatrix();
    const positions=[];
    for(let i=0;i<a.length;i+=3)positions.push([m[0]*a[i]+m[4]*a[i+1]+m[8]*a[i+2]+m[12],m[1]*a[i]+m[5]*a[i+1]+m[9]*a[i+2]+m[13],m[2]*a[i]+m[6]*a[i+1]+m[10]*a[i+2]+m[14]]);
    for(let i=0;i<indices.length;i+=3){
      const tri=[positions[indices[i]],positions[indices[i+1]],positions[indices[i+2]]];
      const minX=Math.floor(Math.min(...tri.map(p=>p[0]))/size),maxX=Math.floor(Math.max(...tri.map(p=>p[0]))/size),minZ=Math.floor(Math.min(...tri.map(p=>p[2]))/size),maxZ=Math.floor(Math.max(...tri.map(p=>p[2]))/size);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(tri);}
    }
  }
  function terrainHeight(x,z){
    for(const [a,b,c] of cells.get(`${Math.floor(x/size)},${Math.floor(z/size)}`)||[]){
      const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-9)continue;
      const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
      const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
      if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)return u*a[1]+v*b[1]+w*c[1];
    }return NaN;
  }
  const track=JSON.parse(await fs.readFile(path.join(root,`assets/tracks/${id}.json`),'utf8')),intrusions=[];let maximum=-Infinity,total=0,missing=0;
  for(let i=0;i<track.samples.length;i++)for(const offset of [-track.width*.47,-2,0,2,track.width*.47]){
    const s=track.samples[i],x=s.p[0]+s.n[0]*offset,z=s.p[2]+s.n[2]*offset,h=terrainHeight(x,z),difference=h-(s.p[1]+.015);total++;
    if(!Number.isFinite(h)){missing++;continue;}maximum=Math.max(maximum,difference);
    if(difference>.01)intrusions.push({sample:i,phase:i/(track.samples.length-1),offset,meters:difference});
  }
  records.push({track:id,samples:total,missingTerrainSamples:missing,maxTerrainRelativeToRoadMeters:maximum,intrusions,pass:missing===0&&intrusions.length===0});
}
const result={generatedAt:new Date().toISOString(),method:'decoded terrain triangle heights at center, lane and road-edge points along the whole closed path',records,pass:records.every(r=>r.pass)};
await fs.writeFile(path.join(root,'verification/road-clearance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,records:records.map(r=>({track:r.track,samples:r.samples,intrusions:r.intrusions.length,max:r.maxTerrainRelativeToRoadMeters}))}));
if(!result.pass)process.exitCode=1;
