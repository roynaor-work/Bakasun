const cells=(row,registry)=>{const [w,d]=registry.buildings.get(row.typeId).footprint;return Array.from({length:w*d},(_,i)=>[row.x+i%w,row.z+Math.floor(i/w)]);};

/** Cosmetic paths never supply access. Use the saved road component nearest city hall. */
export function cityConnections(state,registry){
  const roads=new Set(state.buildings.filter(row=>registry.buildings.get(row.typeId)?.isRoad).flatMap(row=>cells(row,registry).map(cell=>cell.join(','))));
  const hall=state.buildings.find(row=>row.typeId==='cityHall'),footprint=hall?registry.buildings.get(hall.typeId).footprint:[1,1],origin=hall?{x:hall.x+(footprint[0]-1)/2,z:hall.z+(footprint[1]-1)/2}:{x:state.world.size/2,z:state.world.size/2};
  const root=[...roads].sort((a,b)=>{const [ax,az]=a.split(',').map(Number),[bx,bz]=b.split(',').map(Number);return Math.hypot(ax-origin.x,az-origin.z)-Math.hypot(bx-origin.x,bz-origin.z)||az-bz||ax-bx;})[0];
  const connected=new Set(root?[root]:[]),queue=root?[root]:[];
  for(let i=0;i<queue.length;i++){const [x,z]=queue[i].split(',').map(Number);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const key=`${x+dx},${z+dz}`;if(roads.has(key)&&!connected.has(key)){connected.add(key);queue.push(key);}}}
  const hasAccess=row=>cells(row,registry).some(([x,z])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>connected.has(`${x+dx},${z+dz}`)));
  return {roads,connected,hasAccess};
}
