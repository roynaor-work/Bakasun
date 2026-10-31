/** Authored basketball presentation. Never changes engine delta, results or inputs. */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=u=>(u=clamp(u))*u*(3-2*u);
export function decodeHoopsFeel(value){if(Array.isArray(value))return value.length===4&&value.every(Number.isFinite)?value[0]:value.map(decodeHoopsFeel);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decodeHoopsFeel(v)]));return value;}
export async function loadHoopsFeel({fetcher=globalThis.fetch,signal}={}){const r=await fetcher(new URL('../design/feel/hoops.json',import.meta.url),{signal});if(!r.ok)throw Error('Basketball feel data '+r.status);return decodeHoopsFeel(await r.json());}
export function sampleHoopsSpeed(profile,speed){const knots=profile.speed.knots,s=clamp(speed);let i=0;while(i<knots.length-2&&s>knots[i+1].speed)i++;const a=knots[i],b=knots[i+1],u=smooth((s-a.speed)/(b.speed-a.speed));return {fov:a.fov_add_deg+(b.fov_add_deg-a.fov_add_deg)*u,opacity:a.line_opacity+(b.line_opacity-a.line_opacity)*u};}
export function sampleHoopsReplayScale(spec,elapsedMs){if(elapsedMs<0||!spec)return 1;if(elapsedMs<spec.hit_stop.duration_ms)return spec.hit_stop.scale;elapsedMs-=spec.hit_stop.duration_ms;if(elapsedMs<spec.slow_motion.duration_ms)return spec.slow_motion.scale;elapsedMs-=spec.slow_motion.duration_ms;return spec.slow_motion.scale+(1-spec.slow_motion.scale)*smooth(elapsedMs/Math.max(1,spec.slow_motion.recover_ms));}
export function createHoopsFeel(profile,{reducedMotion=false,vibrate=()=>{},hapticsEnabled=false,onCue=()=>{}}={}){
 let clock=0,shake=null,disposed=false,fov=0,above=false,lastBurst=-Infinity;
 const seen=new Set(),cooldowns=new Map(),queue=[];
 const out={fov:0,x:0,y:0,speedOpacity:0};
 function eventName(e){if(e.type==='score')return e.shotType==='dunk'?'dunk':e.points===3?'three_pointer':null;if(e.type==='block')return 'block';if(e.type==='fall')return 'fall';if(e.type==='perfectLanding')return 'perfect_landing';return null;}
 function effects(events,snapshot){if(disposed)return;for(const e of events){const name=eventName(e),spec=profile.events[name];if(!spec)continue;const id=e.seq??e.id;if(id!=null){if(seen.has(id))continue;seen.add(id);if(seen.size>256)seen.delete(seen.values().next().value);}if(clock-(cooldowns.get(name)??-Infinity)<spec.cooldown_ms)continue;cooldowns.set(name,clock);
   if(!reducedMotion&&(!shake||spec.priority>shake.priority)){shake={start:clock,priority:spec.priority,...spec.shake};if(hapticsEnabled){vibrate(0);vibrate(spec.haptics.pattern_ms);}}
   for(const cue of spec.timeline)queue.push({at:clock+cue.at_ms,cue,event:e,snapshot});
  }queue.sort((a,b)=>a.at-b.at);}
 function update(dt,snapshot){if(disposed)return out;const ms=Math.max(0,dt*1000);clock+=ms;
  while(queue.length&&queue[0].at<=clock){const item=queue.shift();if(!reducedMotion||item.cue.kind==='audio')onCue(item.cue,item.event,item.snapshot);}
  let me=null;for(const p of snapshot?.players||[])if(p.controlled){me=p;break;}
  const speed=me&&me.maxSpeed>0?Math.hypot(me.vx,me.vz)/me.maxSpeed:0,target=sampleHoopsSpeed(profile,speed);
  const duration=target.fov>fov?profile.speed.fov_in_ms:profile.speed.fov_out_ms;fov+=(target.fov-fov)*(1-Math.exp(-3*ms/Math.max(1,duration)));
  out.fov=reducedMotion?0:fov;out.speedOpacity=reducedMotion?0:target.opacity;out.x=out.y=0;
  if(!reducedMotion&&shake){const age=clock-shake.start;if(age>=shake.decay_ms){shake=null;}else{const amp=shake.amplitude*Math.pow(100,-age/shake.decay_ms)*smooth(age/(shake.decay_ms/5)),phase=2*Math.PI*shake.frequency_hz*age/1000;out.x=Math.sin(phase)*amp;out.y=Math.cos(phase)*amp;}}
  const lines=profile.speed.lines;if(speed<lines.off_speed)above=false;if(!reducedMotion&&speed>=lines.on_speed&&!above&&clock-lastBurst>=lines.cooldown_ms){above=true;lastBurst=clock;onCue({kind:'vfx',asset:lines.asset,opacity:target.opacity,screen_fraction:lines.screen_fraction,burst_ms:lines.burst_ms},null,snapshot);}
  return out;
 }
 return {effects,update,pause(){vibrate(0);shake=null;queue.length=0;},dispose(){disposed=true;queue.length=0;seen.clear();vibrate(0);},get profile(){return profile;},metrics(){return {authored:true,queued:queue.length,fov:+fov.toFixed(3),seen:seen.size};}};
}
