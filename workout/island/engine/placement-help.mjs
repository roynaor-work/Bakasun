import {validatePlacement,cellsFor} from './rules.mjs?v=naval-art-20261022-2';
/** Deterministic nearest legal anchor, bounded by the island grid. Invalid money,
 * limits and shore/road requirements remain visible when no legal cell exists. */
export function nearestPlacement(state,registry,typeId,point,ignoreId,flags={}){
  const candidates=[],size=state.world.size;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)candidates.push({x,z,distance:(x-point.x)**2+(z-point.z)**2});
  candidates.sort((a,b)=>a.distance-b.distance||a.z-b.z||a.x-b.x);
  const result=candidates.find(c=>validatePlacement(state,registry,typeId,c.x,c.z,ignoreId,flags).ok);
  return result?{x:result.x,z:result.z}:null;
}
/** Logical footprints stay on land; the harbor's seaward deck extends outside
 * the grid in the view. The same shore rule applies to old and new placements. */
export function shoreDirection(state,type,x,z){
  const cells=cellsFor(type,x,z),size=state.world.size;
  if(cells.some(c=>c[1]===0))return {x:0,z:-1};
  if(cells.some(c=>c[0]===0))return {x:-1,z:0};
  if(cells.some(c=>c[1]===size-1))return {x:0,z:1};
  if(cells.some(c=>c[0]===size-1))return {x:1,z:0};
  return null;
}
/** Explicit load/expansion repair for ports stranded by the older expanding
 * coastline. Retains schema 12 and building identity; never charges the child. */
export function repairHarbors(state,registry,flags={}){
  const repaired=[],harbor=registry.buildings.get('harbor');if(!harbor)return repaired;
  const relaxed={...registry,buildings:new Map(registry.buildings)};relaxed.buildings.set('harbor',{...harbor,requiresRoad:false});
  for(const port of state.buildings.filter(b=>b.typeId==='harbor')){
    if(shoreDirection(state,harbor,port.x,port.z))continue;
    const cell=nearestPlacement(state,relaxed,'harbor',port,port.id,flags);if(!cell)continue;
    Object.assign(port,cell);
    if(!validatePlacement(state,registry,'harbor',port.x,port.z,port.id,flags).ok){
      const footprint=new Set(cellsFor(harbor,port.x,port.z).map(p=>p.join(',')));
      const neighbors=cellsFor(harbor,port.x,port.z).flatMap(([x,z])=>[[x-1,z],[x+1,z],[x,z-1],[x,z+1]]).filter(p=>!footprint.has(p.join(',')));
      const road=neighbors.find(([x,z])=>validatePlacement({...state,money:Number.MAX_SAFE_INTEGER},registry,'road',x,z,undefined,flags).ok);
      if(road)state.buildings.push({id:`shore-road-${state.nextId++}`,typeId:'road',x:road[0],z:road[1],level:1});
    }
    repaired.push(port.id);
  }
  return repaired;
}
