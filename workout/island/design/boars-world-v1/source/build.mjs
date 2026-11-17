import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {writeGLB} from './geometry.mjs';
import {variants,makeRig,makeBoar,makeAnimations,clipSpecs} from './boars.mjs';
import {environment,skies,sky} from './environment.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'models'),{recursive:true});
const assets=[],rig=makeRig();
async function emit(id,art,opts={}){
  const meta=await writeGLB(path.join(root,'models',id+'.glb'),id,art,opts);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  art.p.forEach((v,i)=>{const k=i%3;min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);});
  meta.bounds={min:min.map(v=>+v.toFixed(5)),max:max.map(v=>+v.toFixed(5))};
  meta.sha256=createHash('sha256').update(await fs.readFile(path.join(root,meta.file))).digest('hex');
  assets.push(meta);return meta;
}
for(const v of variants){
  const art=makeBoar(v);if(art.triangles<500||art.triangles>900)throw Error(v.id+' exceeds triangle budget');
  Object.assign(await emit(v.id,art,{rig,animations:makeAnimations(rig,art),extras:{license:'CC0-1.0',units:'meters',forward:'+Z',sampleRateHz:30}}),
    {category:'boar',name:v.name,personality:v.personality,color:v.skin,face:v.face,joints:14,skinned:true,clips:clipSpecs.map(c=>({...c,frames:Math.round(c.duration*30)+1}))});
}
for(const [id,name,category,make]of environment)Object.assign(await emit(id,make(),{extras:{license:'CC0-1.0',groundPlaneY:0}}),{name,category});
for(const s of skies)Object.assign(await emit('sky-'+s.id,sky(s),{unlit:true,extras:{license:'CC0-1.0',cameraInsideDome:true}}),{category:'sky',name:s.name,lighting:s});

const instances=[];
const add=(asset,x,z,rotation=0,scale=1)=>instances.push({asset,position:[x,0,z],rotationY:rotation,scale});
add('meadow',0,0);add('cabin',3.35,-2.25,-.12,1.15);add('mud-puddle',-4.2,2.9,-.3,1);
for(const [asset,x,z,scale]of [
  ['tree-oak',-5.6,-2.5,1.1],['tree-birch',-3.2,-3.1,1],['tree-pine',-.9,-3.7,1.12],['tree-oak',6.0,-.55,.96],['tree-pine',5.6,-3.3,.94],
  ['bush-round',-6.5,.25,1.1],['bush-berry',-4.6,-2.1,.95],['bush-fern',-5.5,.8,1.2],['bush-round',6.4,1.1,1],['bush-berry',5.9,2.2,.9],['bush-fern',2.6,-3.4,1.2],
  ['rock-round',-5.2,2.0,.9],['rock-pair',5.3,2.7,.8],['rock-cluster',-6.3,-1.6,.8]])add(asset,x,z,(x+z)*.26,scale);
for(const x of [-5.6,-3.6,-1.6,.4,2.4,4.4])add('fence',x,-4.15);
for(const z of [-2.9,-.9,1.1]){add('fence',-7,z,Math.PI/2);add('fence',7,z,Math.PI/2);}
const boars=variants.map((v,i)=>({asset:v.id,position:[(i-2)*1.65,0,2.1+Math.cos(i)*.20],rotationY:[.16,.22,-.12,-.18,-.32][i],scale:1.10,phaseSeconds:i*.19}));
const layout={schemaVersion:1,units:'meters',groundY:0,description:'A calm fenced meadow; all transforms reference delivered GLBs.',instances,boars,
  cameras:{world:{position:[10.2,8.1,17.8],target:[0,1.2,0],orthographicHeight:9.8},studio:{position:[4.7,2.8,9],target:[0,.68,0],orthographicHeight:3.1}},
  collisions:[{asset:'cabin',type:'box',halfExtents:[1.48,1.50,1.34]},{asset:'fence',type:'box',halfExtents:[1.07,.64,.10]},{asset:'mud-puddle',type:'trigger',radius:1.5,effect:'cosmetic only'}]};
await fs.writeFile(path.join(root,'scene.json'),JSON.stringify(layout,null,2)+'\n');
await fs.writeFile(path.join(root,'skeleton.json'),JSON.stringify({name:'Boar14',units:'meters',up:'+Y',forward:'+Z',bind:'Translations only; identity rotations; mesh vertices in model space.',joints:rig},null,2)+'\n');
const manifest={schemaVersion:1,id:'boars-world-v1',title:'אחו החזירים',date:'2026-11-17',branch:'codex/boars-world-v1',baseCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',
  preview:{file:'preview.html',width:844,height:390,offline:true,serveOverHTTP:true,threeRevision:'160'},
  limits:{packageMaxBytes:4000000,boarTriangles:{min:500,max:900},sampleRateHz:30},
  coordinates:{units:'meters',up:'+Y',forward:'+Z',handedness:'right',origin:'ground below belly',groundY:0},
  rig:{file:'skeleton.json',name:'Boar14',jointCount:14,maxInfluences:2,weights:'normalized UNSIGNED_BYTE',sharedAcrossAllBoars:true},
  animations:{sampleRateHz:30,interpolation:'LINEAR',rootMotion:false,clips:clipSpecs.map(c=>({...c,frames:Math.round(c.duration*30)+1})),
    fall:'One-shot gentle flop; holds the terminal pose. Reset/crossfade to walk or run outside the clip.',panic:'One-shot startle and comical hops; ends in the starting pose.',
    locomotion:'Walk and run loop in place. Apply forward translation to an external parent at the listed speed in meters/second.'},
  scene:'scene.json',assets,
  delivery:{standalone:true,textures:0,externalRequests:0,extensionsUsed:['KHR_materials_unlit'],extensionsRequired:[],compression:'none',
    licenses:'LICENSES.md',report:'REPORT.md',validation:'verification/validation.json',browserValidation:'verification/browser.json'},
  counts:{boars:5,vegetation:6,trees:3,bushes:3,props:7,skies:3,glbs:assets.length},
  assetBytes:assets.reduce((n,a)=>n+a.bytes,0)};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({glbs:assets.length,assetBytes:manifest.assetBytes,boars:assets.filter(a=>a.category==='boar').map(a=>({id:a.id,triangles:a.triangles,bytes:a.bytes}))},null,2));
