/** Insert the central building without moving or changing existing records. */
export function withCityHall(state,data,registry) {
  if(!Array.isArray(state.buildings)||state.buildings.some(b=>b?.typeId==='cityHall'))return state;
  const size=state.world?.size;
  if(!Number.isInteger(size)||!data.config.worldStages.some(stage=>stage.size===size)||state.buildings.length>data.config.maxSaveBuildings)return state;
  const occupied=new Set();
  for(const b of state.buildings){
    if(!b||!Number.isInteger(b.x)||!Number.isInteger(b.z)||b.x<0||b.z<0||b.x>=size||b.z>=size)return state;
    const type=registry?.buildings.get(b.typeId)||data.buildings.find(t=>t.id===b.typeId),footprint=type?.footprint||data.config.buildings[type?.balanceId||b.typeId]?.footprint;
    if(!footprint)return state;
    for(let x=b.x;x<b.x+footprint[0];x++)for(let z=b.z;z<b.z+footprint[1];z++)occupied.add(`${x},${z}`);
  }
  const [w,d]=data.config.buildings.cityHall.footprint,cells=[];
  for(let z=0;z<=size-d;z++)for(let x=0;x<=size-w;x++){
    let free=true;
    for(let dx=0;dx<w;dx++)for(let dz=0;dz<d;dz++)if(occupied.has(`${x+dx},${z+dz}`))free=false;
    if(free)cells.push({x,z,distance:Math.hypot(x+w/2-size/2,z+d/2-size/2)});
  }
  cells.sort((a,b)=>a.distance-b.distance||a.z-b.z||a.x-b.x);
  if(!cells.length)return state; // Validation protects a completely occupied save from overwrite.
  const {x,z}=cells[0],ids=new Set(state.buildings.map(b=>b.id));let id='city-hall',suffix=0;
  while(ids.has(id))id=`city-hall-${++suffix}`;
  return {...state,buildings:[...state.buildings,{id,typeId:'cityHall',x,z,level:1}]};
}
