/** Scenario presentation and routes belong to Fire Rescue. The persisted stage,
 * equipment and certificate records keep their existing shape. */
const CITY_PLANS=Object.freeze({compact:[1,1],eastAvenue:[1.12,1],northAvenue:[1,1.12],district:[1.08,1.08]});
const nearest=(values,value)=>values.reduce((best,next)=>Math.abs(next-value)<Math.abs(best-value)?next:best);
const logical=(world,render)=>({x:world[0]/render.worldScale+render.logicalCenter[0],y:world[2]/render.worldScale+render.logicalCenter[1]});

/** Derive one self-contained balance for both simulation and drawing. Position
 * transforms never scale a Meshy model or move a window away from its facade.
 * Calling this again for the same stage is safe during session setup. */
export function fireScenario(balance,level){
  if(!Number.isInteger(level)||!balance.levels[level-1])throw new RangeError('Unknown fire stage');
  const derived=structuredClone(balance);
  if(balance.scenario?.level===level)return derived;
  const mission=derived.levels[level-1].mission;
  if(!mission)return derived;
  const scale=CITY_PLANS[mission.cityPlan||'compact'];
  if(!scale)throw new RangeError('Unknown fire city plan');
  const [sx,sz]=scale,city=derived.city,render=derived.render,originalCity=balance.city;
  const placement=point=>{
    // Target positions are measured on the original fronts (+Z). Keep their
    // local x/z offsets so the same real windows survive wider road spacing.
    const lot=originalCity.buildings.reduce((best,next)=>Math.hypot(next.x-point[0],next.z-point[2])<Math.hypot(best.x-point[0],best.z-point[2])?next:best);
    return [lot.x*sx+point[0]-lot.x,point[1],lot.z*sz+point[2]-lot.z];
  };
  city.roadsX=city.roadsX.map(x=>x*sx);city.roadsZ=city.roadsZ.map(z=>z*sz);
  city.extent*=Math.max(sx,sz);
  for(const building of city.buildings){building.x*=sx;building.z*=sz;}
  render.buildings=render.buildings.map(([x,z,...rest])=>[x*sx,z*sz,...rest]);
  const worldSites=balance.render.sites.map(placement);
  const requested=mission.siteOrder||balance.sites.map((_,i)=>i);
  if(requested.length!==balance.sites.length||new Set(requested).size!==balance.sites.length||requested.some(i=>!Number.isInteger(i)||!balance.sites[i]))throw new RangeError('Invalid fire site order');
  const rescueIndices=mission.rescueIndices||balance.rescueSites.map((_,i)=>i);
  if(new Set(rescueIndices).size!==rescueIndices.length||rescueIndices.some(i=>!Number.isInteger(i)||!balance.rescueSites[i]))throw new RangeError('Invalid fire rescue order');
  const rescueSites=rescueIndices.map(i=>balance.rescueSites[i]);
  const needed=rescueSites.slice(0,mission.requiredRescues||0).map(site=>site.fireIndex);
  // Required citizens never start beside a dormant, unreachable future fire.
  // Keep the designer's order where possible and only move missing sites in.
  const settings=derived.levels[level-1],order=[...requested];
  if(needed.length>settings.flames)throw new RangeError('Too few initial fires for required rescues');
  for(const index of needed)if(order.indexOf(index)>=settings.flames){
    const replace=order.slice(0,settings.flames).findLastIndex(i=>!needed.includes(i));
    const at=order.indexOf(index);[order[replace],order[at]]=[order[at],order[replace]];
  }
  derived.sites=order.map(i=>({...balance.sites[i],...logical(worldSites[i],render)}));
  render.sites=order.map(i=>worldSites[i]);
  derived.rescueSites=rescueSites.map(site=>{
    const world=placement(site.world);
    return {...site,...logical(world,render),world,fireIndex:order.indexOf(site.fireIndex),...(Number.isFinite(mission.rescueSeconds)?{timeoutSeconds:mission.rescueSeconds}:{})};
  });
  const hydrated=originalCity.hydrants.map(([x,y,z])=>{
    const roadX=nearest(originalCity.roadsX,x),roadZ=nearest(originalCity.roadsZ,z);
    return Math.abs(x-roadX)<=Math.abs(z-roadZ)?[roadX*sx+x-roadX,y,z*sz]:[x*sx,y,roadZ*sz+z-roadZ];
  });
  const hydrantIndices=mission.hydrantIndices||hydrated.map((_,i)=>i);
  if(!hydrantIndices.length||new Set(hydrantIndices).size!==hydrantIndices.length||hydrantIndices.some(i=>!Number.isInteger(i)||!hydrated[i]))throw new RangeError('Invalid fire hydrant order');
  city.hydrants=hydrantIndices.map(i=>hydrated[i]);derived.hydrant.position=[...city.hydrants[0]];
  const start=mission.startAt||[balance.vehicle.x,balance.vehicle.z];
  derived.vehicle.x=start[0]*sx;derived.vehicle.z=start[1]*sz;
  derived.vehicle.minX*=sx;derived.vehicle.maxX*=sx;derived.vehicle.minZ*=sz;derived.vehicle.maxZ*=sz;
  const nozzle=logical([derived.vehicle.x,0,derived.vehicle.z],render);
  derived.nozzleX=nozzle.x;derived.nozzleY=nozzle.y;
  derived.crew.truckX=nozzle.x;derived.crew.truckY=nozzle.y;
  derived.scenario={level,cityPlan:mission.cityPlan||'compact',sourceSiteIndices:order};
  return derived;
}
