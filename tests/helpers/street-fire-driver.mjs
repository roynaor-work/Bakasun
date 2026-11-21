import {projectFireRoad} from '../../workout/island/minigames/fire-roads.mjs';

/** Deterministic player inputs for the street campaign, including water and pressure management. */
export function streetFireDriver(model,balance,roads) {
 let pumping=false,refilling=false;
 return ()=>{
  if(model.water<=16)refilling=true;if(model.water>=model.maxWater-.1)refilling=false;
  if(model.pressure<.3)pumping=true;if(model.pressure>=model.maxPressure*.98)pumping=false;
  const input={charge:pumping||refilling};
  const moveTo=world=>{
   const destination=projectFireRoad(roads,{x:world[0],z:world[2]});
   if(Math.hypot(destination.x-model.truck.x,destination.z-model.truck.z)>.03){input.truckX=destination.x;input.truckZ=destination.z;return true;}
   return false;
  };
  if(refilling){
   const hydrant=balance.city.hydrants.reduce((best,next)=>Math.hypot(next[0]-model.truck.x,next[2]-model.truck.z)<Math.hypot(best[0]-model.truck.x,best[2]-model.truck.z)?next:best);
   moveTo(hydrant);input.refill=true;
  }else{
   let rescue=model.rescues.find(r=>!r.rescued&&!r.expired);
   const descending=model.rescues.find(r=>r.rescued&&r.descent<1);
   if(rescue&&descending&&model.ladder.mode==='sequence')rescue=null;
   if(rescue){
    const fire=model.flames[rescue.fireIndex],moving=moveTo(rescue.world);
    if(fire.heat>0){input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;}
    else if(!moving){input.rescue=true;input.x=rescue.x;input.y=rescue.y;if(model.ladder.mode==='wind')input.moveX=Math.max(-1,Math.min(1,(-model.ladder.wind-model.ladder.sway*3)/balance.ladder.stabilizePower));}
   }else if(!descending){
    const fire=model.flames.filter(f=>f.active&&f.heat>0).sort((a,b)=>Math.hypot(a.x-model.nozzle.x,a.y-model.nozzle.y)-Math.hypot(b.x-model.nozzle.x,b.y-model.nozzle.y))[0];
    if(fire){
     let moving=false;
     if(Math.hypot(fire.x-model.nozzle.x,fire.y-model.nozzle.y)>model.range*.8)moving=moveTo(balance.render.sites[model.flames.indexOf(fire)]);
     input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;
    }
   }
  }
  return input;
 };
}
