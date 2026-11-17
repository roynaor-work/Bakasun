/** Preserve a real complete gait cycle when entering/leaving a running dribble. */
const LOWER_BODY=new Set(['Root','Hips','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
const normalize=(q,d)=>{const length=Math.hypot(...q)||1,unit=q.map(v=>v/length),dot=unit.reduce((s,v,i)=>s+v*d[i],0);return{q:unit,d:d.map((v,i)=>(v-unit[i]*dot)/length)};};
function readTrack(channel){
 const sampler=channel.getSampler(),times=Array.from(sampler.getInput().getArray()),out=Array.from(sampler.getOutput().getArray()),cubic=sampler.getInterpolation()==='CUBICSPLINE';
 const size=out.length/times.length/(cubic?3:1),values=[],derivatives=[];
 for(let i=0;i<times.length;i++){
  values.push(...out.slice((i*(cubic?3:1)+(cubic?1:0))*size,(i*(cubic?3:1)+(cubic?1:0)+1)*size));
  if(cubic)derivatives.push(...out.slice(i*3*size,(i*3+1)*size));
 }
 if(!cubic)for(let i=0;i<times.length;i++){const a=Math.max(0,i-1),b=Math.min(times.length-1,i+1);for(let k=0;k<size;k++)derivatives.push((values[b*size+k]-values[a*size+k])/(times[b]-times[a]||1));}
 return{node:channel.getTargetNode(),path:channel.getTargetPath(),times,values,derivatives,size,interpolation:sampler.getInterpolation()};
}
const key=t=>t.node.getName()+'/'+t.path;
function endpoint(track,seconds,offset){
 const index=Math.max(0,Math.min(track.times.length-1,Math.round(seconds*30))),value=track.values.slice(index*track.size,(index+1)*track.size),derivative=track.derivatives.slice(index*track.size,(index+1)*track.size);
 if(track.path==='translation'&&['Root','MotionBallAnchor'].includes(track.node.getName()))for(let k=0;k<3;k++)value[k]+=(offset||[0,0,0])[k];
 return{value,derivative};
}

/** Call after generic bridges exist and before groundBridges(). Mutates both arguments. */
export function repairGaitBridges(document,{bridges}={}){
 const root=document.getRoot(),byId=Object.fromEntries(root.listAnimations().map(a=>[a.getName(),a])),reference=byId.ref_run;
 if(!reference)throw Error('Missing ref_run for gait bridges');
 const referenceTracks=new Map(reference.listChannels().map(c=>{const t=readTrack(c);return[key(t),t];}));
 const rootTrack=referenceTracks.get('Root/translation'),referenceTravel=rootTrack.values.slice(-3).map((v,k)=>v-rootTrack.values[k]);
 const duration=.8,times=Array.from({length:25},(_,i)=>i/30),buffer=root.listBuffers()[0]||document.createBuffer();
 const accessor=(type,a)=>document.createAccessor().setType(type).setArray(new Float32Array(a)).setBuffer(buffer),records=[];
 for(const bridge of bridges.filter(b=>/^run_to__dribble_run_(right|left)$/.test(b.id)||/^dribble_run_(right|left)__to_run$/.test(b.id))){
  const animation=byId[bridge.animation||bridge.id],source=new Map(byId[bridge.from.animation].listChannels().map(c=>{const t=readTrack(c);return[key(t),t];})),target=new Map(byId[bridge.to.animation].listChannels().map(c=>{const t=readTrack(c);return[key(t),t];}));
  const sourceRoot=endpoint(source.get('Root/translation'),bridge.from.timeSeconds,bridge.from.rootOffsetMeters).value,targetRoot=endpoint(target.get('Root/translation'),bridge.to.timeSeconds,[0,0,0]).value;
  const targetOffset=sourceRoot.map((v,k)=>v+referenceTravel[k]-targetRoot[k]);
  bridge.to={...bridge.to,rootOffsetMeters:targetOffset};bridge.duration=bridge.durationSeconds=duration;bridge.gait={method:'Full reference run cycle in lower body, endpoint-matched C1 upper-body interpolation',reference:'ref_run',cycleSeconds:duration,rootTravelMeters:referenceTravel,plantedFootClaim:'Lower-body gait is retained; independently audit decoded support windows.'};
  const baked=[];
  for(const [trackKey,a]of source){
   const b=target.get(trackKey);if(!b)throw Error('Gait bridge target channel mismatch');
   const av=endpoint(a,bridge.from.timeSeconds,bridge.from.rootOffsetMeters),bv=endpoint(b,bridge.to.timeSeconds,targetOffset),referenceTrack=referenceTracks.get(trackKey);
   if(a.path==='rotation'&&av.value.reduce((s,v,k)=>s+v*bv.value[k],0)<0){bv.value=bv.value.map(v=>-v);bv.derivative=bv.derivative.map(v=>-v);}
   const values=[],derivatives=[];
   for(let i=0;i<times.length;i++){
    const t=times[i],u=t/duration,u2=u*u,u3=u2*u;let value=[],derivative=[];
    if(LOWER_BODY.has(a.node.getName())&&referenceTrack){
     value=referenceTrack.values.slice(i*a.size,(i+1)*a.size);derivative=referenceTrack.derivatives.slice(i*a.size,(i+1)*a.size);
     if(a.node.getName()==='Root'&&a.path==='translation')value=value.map((v,k)=>v+sourceRoot[k]-rootTrack.values[k]);
    }else for(let k=0;k<a.size;k++){
     value.push((2*u3-3*u2+1)*av.value[k]+(u3-2*u2+u)*duration*av.derivative[k]+(-2*u3+3*u2)*bv.value[k]+(u3-u2)*duration*bv.derivative[k]);
     derivative.push((6*u2-6*u)/duration*av.value[k]+(3*u2-4*u+1)*av.derivative[k]+(-6*u2+6*u)/duration*bv.value[k]+(3*u2-2*u)*bv.derivative[k]);
    }
    if(i===0){value=[...av.value];derivative=[...av.derivative];}if(i===times.length-1){value=[...bv.value];derivative=[...bv.derivative];}
    if(a.path==='rotation'){
     const normalized=normalize(value,derivative);value=normalized.q;derivative=normalized.d;
     if(i&&value.reduce((s,v,k)=>s+v*values[values.length-a.size+k],0)<0){value=value.map(v=>-v);derivative=derivative.map(v=>-v);}
    }
    // Reference runs carry no ball. Possession is supplied by the consumer.
    if(a.node.getName()==='MotionBallAnchor'&&a.path==='scale'){value=value.map(()=>0);derivative=derivative.map(()=>0);}
    values.push(...value);derivatives.push(...derivative);
   }
   const interpolation=a.node.getName()==='MotionBallAnchor'&&a.path==='scale'?'STEP':'CUBICSPLINE';
   baked.push({...a,values,derivatives,interpolation});
  }
  for(const channel of [...animation.listChannels()])channel.dispose();for(const sampler of [...animation.listSamplers()])sampler.dispose();
  for(const t of baked){
   const output=t.interpolation==='CUBICSPLINE'?times.flatMap((_,i)=>[...t.derivatives.slice(i*t.size,(i+1)*t.size),...t.values.slice(i*t.size,(i+1)*t.size),...t.derivatives.slice(i*t.size,(i+1)*t.size)]):t.values;
   const sampler=document.createAnimationSampler().setInput(accessor('SCALAR',times)).setOutput(accessor(t.path==='weights'?'SCALAR':t.size===4?'VEC4':'VEC3',output)).setInterpolation(t.interpolation);
   animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(t.node).setTargetPath(t.path).setSampler(sampler));
  }
  animation.setExtras({...animation.getExtras(),from:bridge.from,to:bridge.to,durationSeconds:duration,gait:bridge.gait});
  records.push({id:bridge.id,durationSeconds:duration,from:bridge.from,to:bridge.to,rootTravelMeters:referenceTravel});
 }
 if(records.length!==4)throw Error('Expected four running-dribble gait bridges');
 return{schemaVersion:1,method:'Four full-cycle running/dribble transitions retain the reference lower-body gait, its world travel and main-clip endpoint derivatives.',records};
}
