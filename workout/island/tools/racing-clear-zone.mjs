// racing-v23: how close to the asphalt does any solid trackside object stand? Builds the real trackside layers in node (three.js without WebGL: scenery + roadside,
// the F1 trackside and the Codex env-v2 kit with stand-in boxes of the real model sizes) for every stage of the 30, and measures every instance's footprint
// (world corners of its box) against the nearest centre-line point. "Solid" = it reaches below 3 m above the road (a car and the chase camera pass under higher parts:
// lamp arms, gallery roofs, gantry beams). Spans over the road (arches, galleries, gantries) are reported apart: their legs are what counts.
// Usage: node workout/island/tools/racing-clear-zone.mjs [clear=10.6] [out.json]   (clear 0 = the old layout with walls)
import * as T from '../vendor/three.module.js';
import {writeFile} from 'node:fs/promises';
import {createTrack} from '../minigames/racing-tracks.mjs';
import {createRacingScenery} from '../minigames/racing-scenery.mjs';
import {createRacingF1} from '../minigames/racing-f1.mjs';
import {buildEnvV2} from '../minigames/racing-env-v2.mjs';

/** Stand-in models with the bounds of the Codex env-v2 GLBs (design/racing-environment-v2/runtime, measured from their accessors): one box per model. */
export const ENV_BOXES={'grandstand':[[-10,10],[0,5.6],[-3.8,3.8]],'pit-building':[[-12,12],[0,8],[-6,6]],'start-gantry':[[-7.88,7.88],[0,6.87],[-.95,.95]],'control-tower':[[-3.2,3.2],[0,9],[-3.2,3.2]],
 'tire-barrier':[[-2.9,2.9],[0,.85],[-.5,.5]],'chainlink-fence':[[-3.16,3.16],[0,2.7],[-.24,.24]],'sponsor-board':[[-2.56,2.56],[0,2.47],[-.6,.6]]};
function standInKit(){const models={};for(const [name,[x,y,z]] of Object.entries(ENV_BOXES)){const g=new T.BoxGeometry(x[1]-x[0],y[1]-y[0],z[1]-z[0]);g.translate((x[0]+x[1])/2,(y[0]+y[1])/2,(z[0]+z[1])/2);const s=new T.Group();s.add(new T.Mesh(g,new T.MeshStandardMaterial({color:'#888888'})));models[name]=s;}return {models,textures:{}};}

const fakeCanvas=()=>{const context=new Proxy({},{get:()=>()=>{}});return {width:0,height:0,getContext:()=>context};};
/** every instance of every instanced mesh under root: its world box corners (x,z), lowest y and highest y */
function instances(root){
 const out=[],m=new T.Matrix4(),corner=new T.Vector3();root.updateMatrixWorld(true);
 // every trackside object is instanced; plain meshes are the run-off, gravel and pit-lane ribbons (flat ground)
 root.traverse(o=>{if(!o.isInstancedMesh)return;if(o.visible===false)return;const g=o.geometry;g.computeBoundingBox();const b=g.boundingBox,count=o.count;
  for(let i=0;i<count;i++){o.getMatrixAt(i,m);m.premultiply(o.matrixWorld);
   const pts=[];let ylo=Infinity,yhi=-Infinity;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){corner.set(x,y,z).applyMatrix4(m);pts.push([corner.x,corner.z]);ylo=Math.min(ylo,corner.y);yhi=Math.max(yhi,corner.y);}
   if(!Number.isFinite(ylo)||Math.abs(m.elements[0])+Math.abs(m.elements[5])+Math.abs(m.elements[10])<1e-6)continue;   // scaled to zero = hidden
   out.push({name:o.name||o.parent?.name||'mesh',pts,ylo,yhi});}});
 return out;
}
/** the instance's nearest footprint point to the road, measured beyond the asphalt edge (negative = on the road); spans (corners on both sides) are flagged */
function edgeDistance(track,inst){
 const half=track.width/2;let min=Infinity,sides=new Set(),roadY=0;
 // sample the footprint: the 8 corners and the midpoints of the bottom rectangle's edges
 const pts=[...inst.pts];for(let i=0;i<inst.pts.length;i++)for(let j=i+1;j<inst.pts.length;j++)pts.push([(inst.pts[i][0]+inst.pts[j][0])/2,(inst.pts[i][1]+inst.pts[j][1])/2]);
 for(const [x,z] of pts){const q=track.project(x,z);if(q.distance-half<min){min=q.distance-half;roadY=q.y;}sides.add(Math.sign(q.lateral));}
 return {beyond:min,span:sides.size>1&&min<0,roadY};
}
export function measureStage(stage,{clear=0,seed=1,debug=false}={}){
 const track=createTrack(stage),scene=new T.Scene(),keep=v=>v,doc=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>fakeCanvas()}});
 let layers;
 try{
  const bounds=new T.Box3();for(const p of track.points)bounds.expandByPoint(new T.Vector3(p.x,p.y,p.z));
  const scenery=createRacingScenery({T,scene,track,seed,center:bounds.getCenter(new T.Vector3()),keep,clear,colors:{land:'#68a879',rock:'#b8a98a',sand:'#e4cda1'},mat:(c,o)=>new T.MeshStandardMaterial({color:c,...o})});
  scenery.setQuality(0);
  const f1=track.f1?createRacingF1({T,scene,track,keep,clear}):null;
  const env=f1?buildEnvV2({T,scene,track,keep,f1,kit:standInKit(),clear}):null;
  layers={scenery:scene.getObjectByName('racing-original-scenery'),f1:f1?.root,env:env?.root};
 }finally{if(doc)Object.defineProperty(globalThis,'document',doc);else delete globalThis.document;}
 const rows=[];
 for(const [layer,root] of Object.entries(layers)){if(!root)continue;for(const inst of instances(root)){const d=edgeDistance(track,inst);
  // flat things (kerbs, pools of light), things high above the road (a car and the chase camera pass under) and things below the road level are not in a car's way
  const tall=inst.yhi-inst.ylo>.3,low=inst.ylo<d.roadY+3,above=inst.yhi>d.roadY+.3;if(!tall||!low||!above)continue;
  rows.push({layer,name:inst.name,beyond:+d.beyond.toFixed(2),span:d.span,...(debug?{at:inst.pts[0].map(v=>+v.toFixed(1)),h:+(inst.yhi-inst.ylo).toFixed(2),ylo:+(inst.ylo-d.roadY).toFixed(2)}:{})});}}
 return {stage,track:track.id,theme:track.theme,width:track.width,rows};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const clear=Number(process.argv[2]??10.6),out=process.argv[3],summary=[];
 for(let stage=1;stage<=30;stage++){const r=measureStage(stage,{clear});const solid=r.rows.filter(x=>!x.span),near=solid.filter(x=>x.beyond<clear);
  const byName={};for(const x of near)byName[x.layer+':'+x.name]=Math.min(byName[x.layer+':'+x.name]??Infinity,x.beyond);
  summary.push({stage,track:r.track,theme:r.theme,solid:solid.length,spans:r.rows.length-solid.length,nearest:+Math.min(...solid.map(x=>x.beyond)).toFixed(2),inside:near.length,insideBy:byName});}
 console.log(JSON.stringify(summary.map(s=>({stage:s.stage,theme:s.theme,nearest:s.nearest,inside:s.inside,insideBy:s.insideBy}))));
 if(out)await writeFile(out,JSON.stringify({clear,summary},null,1)+'\n');
}
