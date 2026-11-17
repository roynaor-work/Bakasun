/** Route on the actual connected walking graph; never cut through buildings or
 * jump between disconnected road islands. Cosmetic only, with no saved state. */
export const navigationActive=view=>Boolean(view.touring||view.pointers?.size||view.cameraFlight);

export function walkingRoute(points,from,to){
  if(!points.length)return [];
  const nearest=position=>points.reduce((best,p,i)=>Math.hypot(p.x-position.x,p.z-position.z)<Math.hypot(points[best].x-position.x,points[best].z-position.z)?i:best,0);
  const start=nearest(from),goal=nearest(to),parents=new Int32Array(points.length).fill(-2),queue=[start];parents[start]=-1;
  for(let at=0;at<queue.length;at++){
    const i=queue[at];if(i===goal)break;
    for(const next of points[i].neighbors||[])if(next>=0&&next<points.length&&parents[next]===-2){parents[next]=i;queue.push(next);}
  }
  if(parents[goal]===-2)return [];
  const indices=[];for(let i=goal;i!==-1;i=parents[i])indices.unshift(i);
  return indices.map(i=>({x:points[i].x,y:points[i].y,z:points[i].z}));
}

export function cityCenter(buildings,definition,size){
  const occupied=buildings.filter(b=>!definition(b.typeId)?.isRoad),hall=occupied.find(b=>b.typeId==='cityHall');
  if(!occupied.length)return {x:(size-1)/2,z:(size-1)/2,span:10};
  // A few remote utilities should not pull the initial camera away from home.
  const center=hall||occupied[0],near=occupied.filter(b=>Math.hypot(b.x-center.x,b.z-center.z)<12);
  const bounds=near.reduce((box,b)=>{const [w,d]=definition(b.typeId)?.footprint||[1,1];return {minX:Math.min(box.minX,b.x),minZ:Math.min(box.minZ,b.z),maxX:Math.max(box.maxX,b.x+w),maxZ:Math.max(box.maxZ,b.z+d)};},{minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity});
  return {x:(bounds.minX+bounds.maxX-1)/2,z:(bounds.minZ+bounds.maxZ-1)/2,span:Math.max(10,bounds.maxX-bounds.minX+4,bounds.maxZ-bounds.minZ+4)};
}
