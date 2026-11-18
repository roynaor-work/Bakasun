/** CC0. Distance policy shared by the renderer and the recorded distributions. */
export function levelWeights(distance, config, scale = 1) {
  const [near, far] = config.distanceThresholds.map(d => d * scale);
  const half = config.transition.overlapFraction / 2;
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x-a)/(b-a)));
    return t*t*(3-2*t);
  };
  const a = smooth(near*(1-half), near*(1+half), distance);
  const b = smooth(far*(1-half), far*(1+half), distance);
  return [1-a, a*(1-b), b];
}

export function planCrowd(seats, cameraPosition, config) {
  const distances = seats.map(s => Math.hypot(s.x-cameraPosition[0], s.y-cameraPosition[1], s.z-cameraPosition[2]));
  const costs=config.levels.map(l=>l.triangles), half=config.transition.overlapFraction/2;
  let scale=1, reservedTriangles=seats.length*costs[2];
  if(config.budgetGuard.enabled){
    // Monotone upper envelope of the *submitted* cost as distance thresholds
    // expand: 24 -> 114 -> 300. Keep the reserve after leaving a blend band.
    // The weighted order statistic of continuous distances gives a continuous
    // scale cap, unlike repeatedly stepping through nonmonotone actual costs.
    const events=distances.flatMap(distance=>[
      {scale:distance/(config.distanceThresholds[1]*(1+half)),cost:costs[1]},
      {scale:distance/(config.distanceThresholds[0]*(1+half)),cost:costs[0]-costs[2]}
    ]).sort((a,b)=>a.scale-b.scale);
    for(const event of events){
      if(event.scale>=1)break;
      if(reservedTriangles+event.cost>config.crowdTriangleLimit){
        scale=event.scale*(1-1e-12);break;
      }
      reservedTriangles+=event.cost;
    }
  }
  const submitted=[0,0,0],dominant=[0,0,0],weighted=[0,0,0];
  let overlapping=0;
  const assignments=distances.map((distance,index)=>{
    const weights=levelWeights(distance,config,scale);
    const levels=weights.map((weight,level)=>weight>0?level:-1).filter(level=>level>=0);
    levels.forEach(level=>{submitted[level]++;weighted[level]+=weights[level];});
    dominant[weights.indexOf(Math.max(...weights))]++;overlapping+=levels.length>1;
    return {index,distance,weights};
  });
  const triangles=submitted.reduce((n,count,level)=>n+count*costs[level],0);
  if(triangles>config.crowdTriangleLimit)throw new Error(`Cannot fit ${seats.length} fans in the crowd budget`);
  return {assignments,scale,submitted,dominant,weighted,overlapping,triangles,reservedTriangles,
    instances:seats.length,thresholds:config.distanceThresholds.map(d=>d*scale)};
}

export function makeSeats() {
  const placements = [-1,1].flatMap(sign => [-10,0,10].map(z => ({x:sign*10.4,z,yaw:-sign*Math.PI/2})))
    .concat([-1,1].flatMap(sign => [-5,5].map(x => ({x,z:sign*19.5,yaw:sign<0?Math.PI:0}))));
  const fitZ = z => Math.abs(z)>=5 ? Math.sign(z)*(Math.abs(z)-2.885) : z;
  const seats = [];
  for (const p of placements) for (let row=0;row<5;row++) for (let col=0;col<12;col++) {
    const x=col<6 ? -4.5+col*.7 : .95+(col-6)*.7, z=.48+row*.88-.06;
    const id=seats.length;
    seats.push({id,variant:(id*7+Math.floor(id/12)*5)%12,
      x:p.x+Math.cos(p.yaw)*x+Math.sin(p.yaw)*z, y:.28+row*.42-.025,
      z:fitZ(p.z)-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z, yaw:p.yaw+Math.PI,row,col});
  }
  return {seats,placements,fitZ};
}
