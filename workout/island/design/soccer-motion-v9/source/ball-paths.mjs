/** Original CC0 ball presentation trajectories. World flight is independent of
 * actor recovery; metadata is converted back to the v8 actor-local contract.
 * Exact calibrated cue centres seed every touch, release and two-hand hold. */
import {fk,rotate,add,sub,mul,mix,unit,smooth} from './rig.mjs';
const R=.11,G=9.81;
function pathAt(keys,t){if(!keys?.length)return [0,0,0];if(t<=keys[0].time)return [...keys[0].position];for(let i=1;i<keys.length;i++)if(t<=keys[i].time)return mix(keys[i-1].position,keys[i].position,(t-keys[i-1].time)/(keys[i].time-keys[i-1].time));return [...keys.at(-1).position];}
const mean=ps=>mul(ps.reduce((s,p)=>add(s,p),[0,0,0]),1/ps.length);
function frameAt(frames,t){return frames[Math.max(0,Math.min(frames.length-1,Math.round(t*30)))];}
function ballistic(center,velocity,seconds,{friction=1.1}={}){
 const y=Math.max(R,center[1]),hit=(velocity[1]+Math.sqrt(velocity[1]**2+2*G*(y-R)))/G;
 if(seconds<=hit)return [center[0]+velocity[0]*seconds,Math.max(R,y+velocity[1]*seconds-.5*G*seconds**2),center[2]+velocity[2]*seconds];
 const planar=Math.hypot(velocity[0],velocity[2]),roll=Math.min(seconds-hit,planar/friction),distance=planar*roll-.5*friction*roll**2,scale=planar?distance/planar:0;
 return [center[0]+velocity[0]*(hit+scale),R,center[2]+velocity[2]*(hit+scale)];
}
function grouped(events,type){const groups=[];for(const e of events.filter(e=>!type||e.type===type).sort((a,b)=>a.time-b.time)){let group=groups.at(-1);if(!group||Math.abs(group.time-e.time)>1e-7){group={time:e.time,events:[]};groups.push(group);}if(!group.events.some(x=>x.bone===e.bone))group.events.push(e);}return groups;}
function heldAt(frames,start,end,t){
 const weight=end?smooth((t-start.time)/(end.time-start.time||1)):0,w=fk(frameAt(frames,t));
 return mean(start.events.map(e=>{const other=end?.events.find(r=>r.bone===e.bone),offset=other?mix(e.centerLocal,other.centerLocal,weight):e.centerLocal;return add(w[e.bone].position,rotate(w[e.bone].rotation,offset));}));
}
export function pathFor(motion){
 if(motion.bakedBall)return motion.bakedBall;
 const {d,metadata:m,frames}=motion;
 if(d.ball?.keys)return d.ball;
 const events=m.events.filter(e=>['contact','release'].includes(e.type)),contacts=grouped(events,'contact'),releases=grouped(events,'release'),first=contacts[0]||releases[0],lastRelease=releases.at(-1),travel=t=>pathAt(m.travel,t),world=(center,t)=>add(center,travel(t)),local=(center,t)=>sub(center,travel(t));
 const keyTimes=[...new Set([...frames.map(f=>f.time),...events.map(e=>e.time),0,m.duration])].sort((a,b)=>a-b),keys=[];
 if(!first){for(const time of keyTimes)keys.push({time,position:m.id==='slide_miss'?local([.65,R,.62],time):[0,R,.62]});return {radius:R,keys};}
 const centers=group=>mean(group.events.map(e=>e.center));
 const contactCenter=centers(first),contactWorld=world(contactCenter,first.time);
 const dribble=d.ballKind==='dribble'||/^dribble/.test(m.id),throwing=['throw','roll'].includes(d.ballKind)||m.id==='throw_in',catching=d.ballKind==='catch',receiving=d.ballKind==='receive'||/^first_touch/.test(m.id),volley=m.id==='volley_kick',incoming=receiving||catching||volley||['header','punch'].includes(d.ballKind);
 let dribbleGuides;
 if(dribble){
  const guide=contacts.map(g=>({time:g.time,position:world(centers(g),g.time)}));
  if(m.loop){const period=sub(travel(m.duration),travel(0));dribbleGuides=[{time:guide.at(-1).time-m.duration,position:sub(guide.at(-1).position,period)},...guide,{time:guide[0].time+m.duration,position:add(guide[0].position,period)}];}
  else {const last=guide.at(-1),before=guide.length>1?guide.at(-2):{time:0,position:[0,R,.62]},dt=Math.max(.1,last.time-before.time),velocity=mul(sub(last.position,before.position),1/dt),end=add(last.position,mul(velocity,m.duration-last.time));end[1]=R;dribbleGuides=[{time:0,position:[0,R,.62]},...guide,{time:m.duration,position:end}];}
 }
 for(const time of keyTimes){let position;
  if(dribble)position=local(pathAt(dribbleGuides,time),time);
  else if(throwing&&time<=(lastRelease?.time??m.duration))position=heldAt(frames,first,lastRelease,time);
  else if(time<first.time){
   if(incoming){const u=time/first.time,sideReceive=/^first_touch_(inside|outside)_/.test(m.id),n=sideReceive?unit([first.events[0].normal[0],0,first.events[0].normal[2]]):[0,0,1],start=add(contactWorld,[n[0]*(volley?2.2:1.7),volley?.6:.15,n[2]*(volley?2.2:1.7)]);position=local(mix(start,contactWorld,u),time);position[1]+=(volley?.65:.12)*Math.sin(Math.PI*u);}
   else position=local(contactWorld,time);
  }
  else if(catching&&!lastRelease)position=heldAt(frames,first,null,time);
  else if(receiving&&lastRelease&&time<=lastRelease.time)position=heldAt(frames,first,lastRelease,time);
  else if(lastRelease&&time>=lastRelease.time){
   const released=world(centers(lastRelease),lastRelease.time),direction=unit(m.metricsTargets?.exitDirection||[0,0,1]);
   const speed=d.exitSpeed??(receiving?(m.id.endsWith('_running')?2.3:.85):d.ballKind==='roll'?5.5:throwing?7:d.ballKind==='punch'?8:m.id==='goalkeeper_short_pass'?6:7);
   const lift=d.loft??(d.ballKind==='roll'?-.2:throwing?2.7:receiving?.15:d.ballKind==='punch'?2:0);let velocity=add(mul(direction,speed),[0,lift,0]);if(receiving){const dt=1/30,a=Math.max(0,lastRelease.time-dt),b=Math.min(m.duration,lastRelease.time+dt);velocity=add(velocity,mul(sub(travel(b),travel(a)),1/(b-a)));}position=local(ballistic(released,velocity,time-lastRelease.time),time);
  }
  else position=heldAt(frames,first,null,time);
  position[1]=Math.max(R,position[1]);keys.push({time,position});
 }
 // Exact physical cue centres supersede sampled guides. Shared-hand calibration
 // guarantees that all simultaneous events agree on this one ball centre.
 for(const group of grouped(events)){const key=keys.find(k=>Math.abs(k.time-group.time)<1e-7);if(key)key.position=centers(group);}
 if(m.loop)keys.at(-1).position=[...keys[0].position];
 return {radius:R,keys};
}
