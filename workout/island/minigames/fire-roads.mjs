/** Deterministic street graph for lane assistance and optional point navigation.
 * Coordinates and tuning come from fireRescue.city. */
const EPS=1e-7;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createFireRoads(city){
  const nodes=[],edges=[];
  for(const z of city.roadsZ)for(const x of city.roadsX)nodes.push({x,z,index:nodes.length,links:[]});
  const nx=city.roadsX.length;
  const connect=(a,b)=>{const edge={a:nodes[a],b:nodes[b]};edges.push(edge);nodes[a].links.push(b);nodes[b].links.push(a);};
  for(let iz=0;iz<city.roadsZ.length;iz++)for(let ix=0;ix<nx;ix++){
    const at=iz*nx+ix;if(ix+1<nx)connect(at,at+1);if(iz+1<city.roadsZ.length)connect(at,at+nx);
  }
  return {nodes,edges,width:city.roadWidth,buildings:city.buildings};
}
export function projectFireRoad(roads,point){
  let best=null;
  for(const edge of roads.edges){
    const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,length=dx*dx+dz*dz;
    const u=Math.max(0,Math.min(1,((point.x-edge.a.x)*dx+(point.z-edge.a.z)*dz)/length));
    const p={x:edge.a.x+dx*u,z:edge.a.z+dz*u,edge};const d=distance(p,point);
    if(!best||d<best.distance-EPS)best={...p,distance:d};
  }
  return best;
}
export function fireRoadRoute(roads,start,end){
  const s=projectFireRoad(roads,start),t=projectFireRoad(roads,end);
  if(s.edge===t.edge)return [{x:t.x,z:t.z}];
  let best=[],cost=Infinity;
  for(const from of [s.edge.a,s.edge.b]){
    const costs=roads.nodes.map(()=>Infinity),previous=[],open=new Set(roads.nodes.map(n=>n.index));costs[from.index]=distance(s,from);
    while(open.size){
      let at=-1;for(const i of open)if(at<0||costs[i]<costs[at])at=i;open.delete(at);
      for(const next of roads.nodes[at].links){const d=costs[at]+distance(roads.nodes[at],roads.nodes[next]);if(d<costs[next]){costs[next]=d;previous[next]=at;}}
    }
    for(const to of [t.edge.a,t.edge.b]){
      const total=costs[to.index]+distance(to,t);if(total>=cost)continue;
      cost=total;const route=[];let at=to.index;
      while(at!==undefined){route.unshift({x:roads.nodes[at].x,z:roads.nodes[at].z});if(at===from.index)break;at=previous[at];}
      route.push({x:t.x,z:t.z});best=route;
    }
  }
  return best.filter((p,i)=>distance(p,i?best[i-1]:s)>EPS);
}
export function fireTruckIntersectsBuilding(truck,building,vehicle){
  // A conservative circle contains the entire rotating truck in every heading.
  const radius=Math.hypot(vehicle.length/2,vehicle.width/2);
  const x=Math.max(building.x-building.width/2,Math.min(building.x+building.width/2,truck.x));
  const z=Math.max(building.z-building.depth/2,Math.min(building.z+building.depth/2,truck.z));
  return Math.hypot(x-truck.x,z-truck.z)<radius-EPS;
}
function createRouteDriver(truck,balance){
  const roads=createFireRoads(balance.city),v=balance.vehicle;
  let route=[],destination=null,edgeEnd=null,forward={x:0,z:-1};
  const initial=projectFireRoad(roads,truck);truck.x=initial.x;truck.z=initial.z;
  Object.assign(truck,{heading:0,yaw:0,speed:0,driving:false,turning:false,wheelRotation:0});
  function junctionDirection(dx,dz){
    const choices=Math.abs(dx)>=Math.abs(dz)?[{x:Math.sign(dx),z:0},{x:0,z:Math.sign(dz)}]:[{x:0,z:Math.sign(dz)},{x:Math.sign(dx),z:0}];
    const node=roads.nodes.find(n=>distance(n,truck)<EPS);
    if(node){for(const d of choices){const next=node.links.map(i=>roads.nodes[i]).find(n=>Math.sign(n.x-node.x)===d.x&&Math.sign(n.z-node.z)===d.z);if(next)return {x:next.x,z:next.z};}return null;}
    const p=projectFireRoad(roads,truck),horizontal=p.edge.a.z===p.edge.b.z;
    const sameAxis=horizontal?dx:dz,perpendicular=horizontal?dz:dx;
    const sign=Math.abs(sameAxis)>=Math.abs(perpendicular)&&sameAxis!==0?Math.sign(sameAxis):(horizontal?forward.x:forward.z)||1;
    return sign>0?p.edge.b:p.edge.a;
  }
  return {roads,update(dt,input){
    // Restores the invariant after dev/test repositioning too. Normal play never snaps.
    const onRoad=projectFireRoad(roads,truck);truck.x=onRoad.x;truck.z=onRoad.z;
    const dx=Number(input.moveX)||Number(Boolean(input.right))-Number(Boolean(input.left)),dz=Number(input.moveZ)||0;
    const joystick=Math.hypot(dx,dz)>balance.controls.deadzone;
    let goal=null;
    if(Number.isFinite(input.truckX)||Number.isFinite(input.truckZ))goal=projectFireRoad(roads,{x:Number.isFinite(input.truckX)?input.truckX:truck.x,z:Number.isFinite(input.truckZ)?input.truckZ:truck.z});
    if(joystick){destination=null;route=[];if(!edgeEnd)edgeEnd=junctionDirection(dx,dz);}
    else if(goal){
      edgeEnd=null;if(!destination||distance(goal,destination)>EPS){destination={x:goal.x,z:goal.z};route=fireRoadRoute(roads,truck,goal);}
    }else{destination=null;route=[];edgeEnd=null;}
    truck.targetX=joystick?(edgeEnd?.x??truck.x):(destination?.x??truck.x);truck.targetZ=joystick?(edgeEnd?.z??truck.z):(destination?.z??truck.z);
    let budget=v.speed*dt,moved=0;
    while(budget>EPS){
      const target=joystick?edgeEnd:route[0];if(!target)break;
      const x=target.x-truck.x,z=target.z-truck.z,d=Math.hypot(x,z);
      if(d<EPS){if(joystick)edgeEnd=junctionDirection(dx,dz);else route.shift();if(!edgeEnd&&joystick)break;continue;}
      forward={x:x/d,z:z/d};truck.heading=Math.atan2(-forward.x,-forward.z);
      const step=Math.min(d,budget);truck.x+=forward.x*step;truck.z+=forward.z*step;budget-=step;moved+=step;
      if(step>=d-EPS){truck.x=target.x;truck.z=target.z;if(joystick)edgeEnd=junctionDirection(dx,dz);else route.shift();}
    }
    const angle=Math.atan2(Math.sin(truck.heading-truck.yaw),Math.cos(truck.heading-truck.yaw));
    truck.yaw+=Math.max(-v.turnRate*dt,Math.min(v.turnRate*dt,angle));truck.turning=Math.abs(angle)>v.turnEpsilon;
    truck.speed=dt?moved/dt:0;truck.driving=moved>EPS;truck.wheelRotation+=moved/v.wheelRadius;
    return moved;
  }};
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angleTo=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
/** Radial dead zone followed by a quadratic throttle, independent of heading. */
export function fireThrottle(x,z,controls){return clamp((Math.hypot(x,z)-controls.deadzone)/(1-controls.deadzone),0,1)**2;}
/** Move a conservative truck footprint and remove only penetration normal to a
 * wall. Small steps prevent tunnelling; the tangent displacement survives. */
export function slideFireTruck(truck,dx,dz,buildings,vehicle){
  const radius=Math.hypot(vehicle.length/2,vehicle.width/2),steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
  const start={x:truck.x,z:truck.z};
  for(let i=0;i<steps;i++){
    truck.x+=dx/steps;truck.z+=dz/steps;
    for(const b of buildings){
      const minX=b.x-b.width/2,maxX=b.x+b.width/2,minZ=b.z-b.depth/2,maxZ=b.z+b.depth/2;
      const x=clamp(truck.x,minX,maxX),z=clamp(truck.z,minZ,maxZ),nx=truck.x-x,nz=truck.z-z,d=Math.hypot(nx,nz);
      if(d>=radius)continue;
      if(d>EPS){truck.x+=nx/d*(radius-d);truck.z+=nz/d*(radius-d);}
      else{const sides=[{d:truck.x-minX,x:minX-radius,z:truck.z},{d:maxX-truck.x,x:maxX+radius,z:truck.z},{d:truck.z-minZ,x:truck.x,z:minZ-radius},{d:maxZ-truck.z,x:truck.x,z:maxZ+radius}];sides.sort((a,b)=>a.d-b.d);truck.x=sides[0].x;truck.z=sides[0].z;}
    }
  }
  return Math.hypot(truck.x-start.x,truck.z-start.z);
}
export function createFireDriver(truck,balance){
  const route=createRouteDriver(truck,balance),roads=route.roads,v=balance.vehicle,city=balance.city;
  let routed=false,blockedSeconds=0,assistedUntil=0,clock=0;
  return {roads,update(dt,input={}){
    if(dt<=0)return 0;
    clock+=dt;
    const dx=Number(input.moveX)||Number(Boolean(input.right))-Number(Boolean(input.left)),dz=Number(input.moveZ)||0;
    const throttle=fireThrottle(dx,dz,balance.controls);
    // Point navigation remains available for the existing deterministic pilots.
    // Live touch/keyboard input always uses continuous steering below.
    if(!throttle&&(Number.isFinite(input.truckX)||Number.isFinite(input.truckZ))){routed=true;return route.update(dt,input);}
    if(routed){truck.speed=0;routed=false;}
    const road=projectFireRoad(roads,truck),horizontal=road.edge.a.z===road.edge.b.z;
    let lane=0,heading=truck.heading;
    if(throttle){
      heading=Math.atan2(-dx,-dz);let axis=horizontal?(dx>=0?-Math.PI/2:Math.PI/2):(dz<=0?0:Math.PI);
      // A blocked perpendicular turn is buffered until the next intersection.
      // This is opt-in assistance; the low-level continuous steering API stays
      // available to deterministic callers without changing its response.
      if(input.assisted&&blockedSeconds>.16)assistedUntil=clock+.8;
      if(input.assisted&&clock<assistedUntil){
        const junction=roads.nodes.reduce((best,n)=>distance(n,truck)<distance(best,truck)?n:best,roads.nodes[0]);
        if(distance(junction,truck)>1.25){
          const along=horizontal?(-Math.sin(truck.yaw)||1):(-Math.cos(truck.yaw)||-1);
          const candidates=[road.edge.a,road.edge.b],forward=candidates.find(n=>horizontal?(n.x-truck.x)*along>0:(n.z-truck.z)*along>0)||junction;
          heading=Math.atan2(truck.x-forward.x,truck.z-forward.z);axis=heading;
        }else{assistedUntil=0;blockedSeconds=0;}
      }
      const alignment=Math.abs(angleTo(heading,axis));
      // Deliberate turns override assistance. No position or heading snapping.
      lane=road.distance<city.roadWidth/2?Math.max(0,1-alignment/city.laneAngle):0;
      heading+=angleTo(heading,axis)*city.laneAlign*lane;
      truck.heading=heading;
    }
    const before=truck.speed,turn=Math.abs(angleTo(truck.yaw,heading));
    const corner=Boolean(input.assisted&&throttle&&turn>.28);
    const targetSpeed=corner?Math.min(v.speed*throttle,4.8+Math.max(0,Math.cos(turn))*2.4):v.speed*throttle;
    truck.speed+=clamp(targetSpeed-truck.speed,-v.speed/(corner?.16:v.brakeSeconds)*dt,v.speed/v.accelerationSeconds*dt);
    if(throttle){
      const delta=angleTo(truck.yaw,heading),step=clamp(delta*(1-Math.exp(-v.turnResponse*dt)),-v.turnRate*dt,v.turnRate*dt);
      truck.yaw+=step;
    }
    truck.turning=throttle>0&&Math.abs(angleTo(truck.yaw,truck.heading))>v.turnEpsilon;
    const travel=(before+truck.speed)*.5*dt;
    let x=-Math.sin(truck.yaw)*travel,z=-Math.cos(truck.yaw)*travel;
    if(throttle&&lane){const blend=1-Math.exp(-city.lanePull*lane*dt);x+=(road.x-truck.x)*blend;z+=(road.z-truck.z)*blend;}
    const length=Math.hypot(x,z);if(length>travel&&length>0){x*=travel/length;z*=travel/length;}
    const oldX=truck.x,oldZ=truck.z;
    slideFireTruck(truck,x,z,roads.buildings,v);
    const limit=city.extent/2-Math.hypot(v.length/2,v.width/2);
    truck.x=clamp(truck.x,-limit,limit);truck.z=clamp(truck.z,-limit,limit);
    const moved=Math.hypot(truck.x-oldX,truck.z-oldZ);
    if(input.assisted){blockedSeconds=throttle&&travel>.01&&moved<travel*.2?blockedSeconds+dt:Math.max(0,blockedSeconds-dt*2);if(!throttle){blockedSeconds=0;assistedUntil=0;}}
    truck.velocityX=(truck.x-oldX)/dt;truck.velocityZ=(truck.z-oldZ)/dt;
    truck.targetX=truck.x+dx;truck.targetZ=truck.z+dz;
    truck.driving=input.assisted?moved/dt>.06:truck.speed>EPS;truck.blocked=Boolean(input.assisted&&blockedSeconds>.12);truck.wheelRotation+=moved/v.wheelRadius;
    return moved;
  }};
}
