import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import draco3d from '/tmp/racing-v7-tools/node_modules/draco3dgltf/draco3dgltf.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()});
const tracks=await Promise.all(['coast','neon','ridge'].map(async id=>JSON.parse(await fs.readFile(path.join(root,`assets/tracks/${id}.json`),'utf8'))));
const records=[];
for(const id of ['apex','velour','prism','solis','vector'])for(const lod of [0,1,2]){
  const document=await io.read(path.join(root,`assets/cars/${id}-lod${lod}.glb`));
  for(const wheel of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']){
    const node=document.getRoot().listNodes().find(n=>n.getName()===wheel),m=node.getWorldMatrix();let minY=Infinity;
    for(const p of node.getMesh().listPrimitives()){
      if(!p.getMaterial().getName().toLowerCase().includes('rubber'))continue;
      const a=p.getAttribute('POSITION').getArray();
      for(let i=0;i<a.length;i+=3)minY=Math.min(minY,m[1]*a[i]+m[5]*a[i+1]+m[9]*a[i+2]+m[13]);
    }
    let low=Infinity,high=-Infinity;
    for(const track of tracks)for(const sample of track.samples){
      const cosine=Math.hypot(sample.t[0],sample.t[2]);
      // Local wheel Y is the road normal after vehicle pitch. Both road and
      // vehicle root offsets are vertical, so their normal separation is cos(grade).
      const gap=minY+(.016-.015)*cosine;low=Math.min(low,gap);high=Math.max(high,gap);
    }
    records.push({car:id,lod,wheel,minRestY:minY,minTangentPlaneGapMeters:low,maxTangentPlaneGapMeters:high,pass:Number.isFinite(low)&&low>-.003&&high<.003});
  }
}
const result={generatedAt:new Date().toISOString(),method:'decoded tire vertices against the local road tangent plane across all recorded grades; not a dynamic tire/contact solver',roadVerticalOffsetMeters:.015,vehicleRootVerticalOffsetMeters:.016,records,pass:records.every(r=>r.pass)};
await fs.writeFile(path.join(root,'verification/contact.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,wheels:records.length,minGap:Math.min(...records.map(r=>r.minTangentPlaneGapMeters)),maxGap:Math.max(...records.map(r=>r.maxTangentPlaneGapMeters))}));
if(!result.pass)process.exitCode=1;
