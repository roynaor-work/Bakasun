/** Original CC0-1.0 adapter for the immutable CC0 tennis-motion-v1 catalogue.
 * Contact nodes are mapped through their actual, constant GLB child transform
 * into the canonical hand bone. The independent ball track is never derived
 * from that hand. Root translation is already baked in the animation.
 */
import {sampleGLB,parseGLB} from './glb.mjs';
const identity=[0,0,0,1];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const multiply=(a,b)=>{const[x,y,z,w]=a,[X,Y,Z,W]=b;return[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];};
const rotate=(p,q)=>{const r=multiply(multiply(q,[...p,0]),[-q[0],-q[1],-q[2],q[3]]);return r.slice(0,3);};
function ballAt(keys,t,fps){
 if(!keys.length)return null;
 const time=k=>k.frame!==undefined?k.frame/fps:k.atSeconds??k.timeSeconds??k.time;
 if(t<time(keys[0])-1e-6||t>time(keys.at(-1))+1e-6)return null;
 let a=keys[0],b=keys.at(-1);
 for(let i=1;i<keys.length;i++)if(t<=time(keys[i])){a=keys[i-1];b=keys[i];break;}
 const u=time(b)===time(a)?0:Math.max(0,Math.min(1,(t-time(a))/(time(b)-time(a))));
 return (a.positionMeters??a.position).map((v,i)=>v+((b.positionMeters??b.position)[i]-v)*u);
}
/** Resolve a static descendant contact into its ancestor's local coordinates. */
function contactInCanonical(glb,event){
 const nodes=glb.json.nodes,parent=new Map();nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parent.set(c,i)));
 let index=nodes.findIndex(n=>n.name===event.node);if(index<0)throw new Error(`Missing tennis contact node ${event.node}`);
 let point=event.localPointMeters??[0,0,0];
 while(index>=0&&!/^(?:Left|Right)Hand$/.test(nodes[index].name)){
  const n=nodes[index];
  if(n.matrix)throw new Error('Unexpected matrix contact node in pinned tennis source');
  const animated=glb.json.animations.some(a=>a.channels.some(c=>c.target.node===index));
  if(animated)throw new Error(`Expected static tennis equipment node: ${n.name}`);
  point=add(n.translation??[0,0,0],rotate(point.map((v,i)=>v*(n.scale??[1,1,1])[i]),n.rotation??identity));
  index=parent.get(index)??-1;
 }
 if(index<0)throw new Error('Tennis equipment is not attached to a canonical hand');
 return {bone:nodes[index].name,local:point};
}
export async function loadTennis({source,bytes,json,fps=60}){
 const catalog=await json('runtime/catalog.json'),nativeFps=catalog.fps??30;
 const library={id:source.id,sport:source.sport,version:source.version,source,clips:[]};
 for(const entry of catalog.clips){
  const buffer=await bytes(`runtime/${entry.file}`),glb=parseGLB(buffer),D=entry.durationSeconds;
  const supports=(entry.footPlants??[]).map(p=>({bone:p.bone,start:p.startFrame/nativeFps,end:p.endFrame/nativeFps,local:p.localPointMeters??[0,-.08,0],anchor:p.anchorWorldMeters}));
  const events=(entry.events??[]).filter(e=>e.name==='racket_contact'||e.name==='ball_release').map(e=>({...e,...contactInCanonical(glb,e),type:e.name==='ball_release'?'release':'contact',time:e.frame!==undefined?e.frame/nativeFps:e.atSeconds??e.time*D}));
  const native=sampleGLB(glb,{animation:entry.id,fps,extraTimes:[...supports.flatMap(w=>[w.start,w.end]),...events.map(e=>e.time)]});
  for(const frame of native.frames){
   frame.ball=ballAt(entry.ballTrajectory??[],frame.t,nativeFps);
   frame.assetRoot=[...frame.root];
   frame.referenceRoot=[...frame.root];
   frame.soles=Object.fromEntries(['LeftFoot','RightFoot'].map(bone=>[bone,add(frame.joints[bone],rotate([0,-.08,0],frame.rotations[bone]??identity))]));
   frame.floorPoints=Object.entries(frame.soles).map(([bone,position])=>({bone,position}));
  }
  library.clips.push({id:entry.id,motionId:entry.id,label:entry.labelHe??entry.id,duration:D,height:native.height,frames:native.frames,
   metadata:{...entry,role:'field',supports,events,contacts:events,ballContacts:[],ball:{radius:.034},ballRadius:.034,ballVisible:!!entry.ballTrajectory?.length,soleLocal:[0,-.08,0],rootMotionApplied:true,rootEmbedded:true,referenceTravelKnown:true,checkHingeDirection:true,coordinateSpace:'native GLB baked world translation, applied once',sourceAsset:`runtime/${entry.file}`,measurementSpace:'native canonical skeleton and exact static equipment descendants; independent catalogue ball trajectory',contactAdapterNote:'RacketHead is an identity Racket child at [0,.50,0] of RightHand. Radius .034m matches immutable source preview.mjs. Source ball tracks place their centre on the declared contact marker; the unchanged surface-gap metric reports this residual.'}});
 }
 return library;
}
