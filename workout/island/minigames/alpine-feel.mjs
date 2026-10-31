const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const value=(tuple,fallback)=>Array.isArray(tuple)&&Number.isFinite(tuple[0])?tuple[0]:fallback;

/** Presentation only: reads authored feel values once. It never advances or
 * changes the race engine, collision positions, score or result clocks. */
export async function loadAlpineFeel(){
  const response=await fetch(new URL('../design/feel/alpine.json',import.meta.url));
  if(!response.ok)throw Error(`alpine.feel.${response.status}`);
  return response.json();
}
export function createAlpineFeel(data,{maxSpeedKmh=120,reducedMotion=false}={}){
  const knots=data.speed.knots.map(k=>({speed:value(k.speed,0),fov:value(k.fov_add_deg,0),opacity:value(k.line_opacity,0)}));
  const lines=data.speed.lines,on=value(lines.on_speed,.72),off=value(lines.off_speed,.6);
  const burst=value(lines.burst_ms,600)/1000,cooldown=value(lines.cooldown_ms,1200)/1000;
  const fovIn=value(data.speed.fov_in_ms,160)/1000,fovOut=value(data.speed.fov_out_ms,260)/1000;
  const cameraIn=value(data.easing.camera.ease_in.duration_ms,280)/1000,cameraOut=value(data.easing.camera.ease_out.duration_ms,420)/1000;
  const cameraInPower=value(data.easing.camera.ease_in.power,1.6),cameraOutPower=value(data.easing.camera.ease_out.power,2);
  const landingDuration=value(data.events.perfect_landing.shake.decay_ms,120)/1000;
  const landingAmplitude=value(data.events.perfect_landing.shake.amplitude,.0018),landingHz=value(data.events.perfect_landing.shake.frequency_hz,10);
  const out={speedFraction:0,fovAdd:0,lineOpacity:0,lineVisible:false,lineTrigger:false,lineDuration:burst,lineFraction:value(lines.screen_fraction,.12),carve:0,lookAhead:10,bank:0,landingPulse:0,landingShakeFraction:0,landings:0};
  let time=0,gate=false,nextLine=0,lineUntil=-1,wasAir=false,wasLanding=false,lastS=null,carveFrom=0,carveSign=0,carveElapsed=0;
  function reset(){time=0;gate=false;nextLine=0;lineUntil=-1;wasAir=wasLanding=false;lastS=null;carveFrom=carveSign=carveElapsed=0;out.fovAdd=out.carve=out.landingPulse=out.landingShakeFraction=out.bank=out.landings=0;out.lineOpacity=0;out.lineVisible=out.lineTrigger=false;out.lookAhead=10;}
  function update(state,seconds){
    if(state.phase==='paused')return out;
    const p=state.player||{},dt=clamp(seconds,0,.1),racing=state.phase==='racing';
    if(lastS!==null&&(p.s??lastS)<lastS-2)reset();lastS=p.s??lastS;
    time+=dt;const speed=out.speedFraction=maxSpeedKmh>0?clamp((state.speedKmh||0)/maxSpeedKmh):0;
    let targetFov=0,opacity=0;
    for(let i=1;i<knots.length;i++)if(speed<=knots[i].speed||i===knots.length-1){const a=knots[i-1],b=knots[i];let w=clamp((speed-a.speed)/Math.max(.00001,b.speed-a.speed));w=w*w*(3-2*w);targetFov=a.fov+(b.fov-a.fov)*w;opacity=a.opacity+(b.opacity-a.opacity)*w;break;}
    if(!racing||reducedMotion)targetFov=0;
    const tau=targetFov>out.fovAdd?fovIn:fovOut;
    out.fovAdd+=(targetFov-out.fovAdd)*(1-Math.exp(-3*dt/tau));
    out.lineTrigger=false;
    if(speed>=on)gate=true;else if(speed<=off)gate=false;
    if(racing&&gate&&!reducedMotion&&time>=nextLine){out.lineTrigger=true;lineUntil=time+burst;nextLine=time+cooldown;}
    out.lineVisible=racing&&gate&&!reducedMotion&&time<lineUntil;
    out.lineOpacity=out.lineVisible?opacity:0;
    const carve=racing&&!p.airborne&&!p.crashed?clamp(p.lean,-1,1):0;
    const sign=Math.abs(carve)<.02?0:Math.sign(carve);
    if(sign!==carveSign){carveFrom=out.carve;carveSign=sign;carveElapsed=0;}
    carveElapsed+=dt;const u=clamp(carveElapsed/(sign?cameraIn:cameraOut));
    const weight=sign?Math.pow(u,cameraInPower):1-Math.pow(1-u,cameraOutPower);
    out.carve=carveFrom+(carve-carveFrom)*weight;
    out.bank=reducedMotion?0:-out.carve*.04;
    out.lookAhead=10+12*speed;
    out.landingPulse=Math.max(0,out.landingPulse-dt/landingDuration);
    if(out.landingPulse<1e-9)out.landingPulse=0;
    if(racing&&!p.crashed&&((wasAir&&!p.airborne)||(p.landing&&!wasLanding))){out.landings++;out.landingPulse=1;}
    const elapsed=1-out.landingPulse,fadeIn=clamp(elapsed*5),envelope=fadeIn*fadeIn*(3-2*fadeIn)*out.landingPulse*out.landingPulse;
    out.landingShakeFraction=reducedMotion||out.landingPulse===0?0:Math.sin(2*Math.PI*landingHz*elapsed*landingDuration)*landingAmplitude*envelope;
    wasAir=!!p.airborne;wasLanding=!!p.landing;
    return out;
  }
  return {update,reset,frame:out,metrics:()=>({source:'design/feel/alpine.json',...out})};
}
