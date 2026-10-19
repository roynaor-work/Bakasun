/** Deterministic street graph. Coordinates and tuning come from fireRescue.city.
 * The vehicle consumes axis-aligned edges, including when a target is off-road. */
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
export function createFireDriver(truck,balance){
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
