/** CC0. One complete opaque mesh per seat. Distance cap keeps every fan. */
export function levelWeights(distance,config,scale=1) {
  const [near,far]=config.distanceThresholds.map(d=>d*scale);
  return distance<near?[1,0,0]:distance<far?[0,1,0]:[0,0,1];
}

export function planCrowd(seats,cameraPosition,config) {
  const distances=seats.map(s=>Math.hypot(s.x-cameraPosition[0],s.y-cameraPosition[1],s.z-cameraPosition[2]));
  const costs=config.levels.map(l=>l.triangles);
  let scale=1,reservedTriangles=seats.length*costs[2];
  if(reservedTriangles>config.crowdTriangleLimit)throw new Error('Crowd exceeds even the lowest detail budget');
  if(config.budgetGuard.enabled) {
    // As the common distance scale grows, each seat monotonically costs
    // 24 -> 90 -> 210. Stop before the first unaffordable promotion. Equal
    // distance groups are excluded together by the strict threshold test.
    const events=distances.flatMap(distance=>[
      {scale:distance/config.distanceThresholds[1],cost:costs[1]-costs[2]},
      {scale:distance/config.distanceThresholds[0],cost:costs[0]-costs[1]}
    ]).sort((a,b)=>a.scale-b.scale);
    for(const event of events) {
      if(event.scale>=1)break;
      if(reservedTriangles+event.cost>config.crowdTriangleLimit){scale=event.scale*(1-1e-12);break;}
      reservedTriangles+=event.cost;
    }
  }
  const submitted=[0,0,0];
  const assignments=distances.map((distance,index)=>{
    const weights=levelWeights(distance,config,scale);
    submitted[weights.indexOf(1)]++;
    return {index,distance,weights};
  });
  const triangles=submitted.reduce((n,count,level)=>n+count*costs[level],0);
  if(triangles>config.crowdTriangleLimit)throw new Error('Crowd triangle budget exceeded');
  return {assignments,scale,submitted,triangles,reservedTriangles,overlapping:0,
    instances:seats.length,thresholds:config.distanceThresholds.map(d=>d*scale)};
}
