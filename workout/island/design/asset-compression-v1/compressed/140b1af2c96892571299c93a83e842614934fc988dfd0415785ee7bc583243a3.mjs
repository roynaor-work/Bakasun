const key=(x,z)=>`${x},${z}`;
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));

/** Only saved road cells carry traffic. Cosmetic walking paths are excluded. */
export function cityRoadNetwork(buildings,size,definition){
  const nodes=[] ,byCell=new Map();
  for(const b of buildings){
    const type=definition(b.typeId||b.type);if(!type?.isRoad)continue;
    const [w,d]=type.footprint||[1,1];
    for(let dx=0;dx<w;dx++)for(let dz=0;dz<d;dz++){
      const x=b.x+dx,z=b.z+dz,id=key(x,z);
      if(x<0||z<0||x>=size||z>=size||byCell.has(id))continue;
      const node={id,x,z,neighbors:[]};nodes.push(node);byCell.set(id,node);
    }
  }
  nodes.sort((a,b)=>a.z-b.z||a.x-b.x);
  for(const p of nodes)p.neighbors=[[1,0],[0,1],[-1,0],[0,-1]].map(([x,z])=>byCell.get(key(p.x+x,p.z+z))?.id).filter(Boolean);
  return {nodes,byCell};
}

/** Walkers use the pavement edge; the engine's path cells and connections stay
 * intact. A corner belongs to both pavement edges and keeps turns continuous. */
export function citySidewalkPoint(cell,network){
  const road=network.byCell.get(key(cell.x,cell.z));if(!road)return {...cell,height:.0365};
  const eastWest=road.neighbors.some(id=>network.byCell.get(id).x!==road.x),northSouth=road.neighbors.some(id=>network.byCell.get(id).z!==road.z);
  return {...cell,x:cell.x-(northSouth?.43:0),z:cell.z-(eastWest?.43:0),height:.158};
}

/** Cosmetic traffic owns no economy, placement or save state. Vehicles steer
 * continuously toward road waypoints, slow for corners and yield at junctions.
 * Fixed time steps keep the motion stable across rendering quality changes. */
export function createCityTraffic(network,{maxCars=8,speed=.62,seed=73}={}){
  let randomSeed=seed>>>0,accumulator=0,disposed=false;
  const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
  const usable=network.nodes.filter(p=>p.neighbors.length),count=Math.min(maxCars,Math.floor(usable.length/5));
  const cars=Array.from({length:count},(_,id)=>{
    const from=usable[Math.floor(id*usable.length/count)],to=network.byCell.get(from.neighbors[id%from.neighbors.length]);
    const dx=to.x-from.x,dz=to.z-from.z;
    return {id,from:from.id,to:to.id,x:from.x+dz*.2,z:from.z-dx*.2,heading:Math.atan2(dx,dz),speed:0,wait:id*.12,travelled:0,turns:0};
  });
  function target(car){const a=network.byCell.get(car.from),b=network.byCell.get(car.to);return {x:b.x+(b.z-a.z)*.2,z:b.z-(b.x-a.x)*.2};}
  function tick(dt){
    const junctions=new Map();
    // A driver already crossing keeps priority until its rear clears the
    // junction. A newly arriving driver cannot steal that reservation.
    for(const c of cars)if(c.travelled<c.turnUntil)junctions.set(c.from,{id:c.id,active:true});
    for(const c of cars){const p=target(c),distance=Math.hypot(p.x-c.x,p.z-c.z),node=network.byCell.get(c.to);
      if(node.neighbors.length>2&&distance<.65){const prior=junctions.get(c.to);if(!prior||!prior.active&&distance<prior.distance)junctions.set(c.to,{id:c.id,distance});}
    }
    for(const c of cars){
      if(c.wait>0){c.wait=Math.max(0,c.wait-dt);c.speed=0;continue;}
      let p=target(c),distance=Math.hypot(p.x-c.x,p.z-c.z);
      if(distance<.065){
        const node=network.byCell.get(c.to),options=node.neighbors.filter(id=>id!==c.from);
        const next=(options.length?options:node.neighbors)[Math.floor(random()*(options.length||node.neighbors.length))];
        if(next===c.from||node.neighbors.length>2)c.turnUntil=c.travelled+.7;
        c.from=node.id;c.to=next;c.turns++;p=target(c);distance=Math.hypot(p.x-c.x,p.z-c.z);
        if(node.neighbors.length>2){c.wait=.18;c.speed=0;continue;}
      }
      const desired=Math.atan2(p.x-c.x,p.z-c.z),error=angle(desired-c.heading),turn=Math.min(Math.abs(error),dt*3.8);
      c.heading=angle(c.heading+Math.sign(error)*turn);
      let targetSpeed=speed*(Math.abs(error)>1.2?0:Math.abs(error)>.35?.38:1);
      const reservation=junctions.get(c.to);if(reservation&&reservation.id!==c.id&&distance<.55)targetSpeed=0;
      for(const other of cars){
        if(other===c)continue;const dx=other.x-c.x,dz=other.z-c.z;
        // Incoming traffic yields to a car already turning out of a junction.
        // Otherwise two drivers can wait forever, each facing the other.
        if(c.travelled<c.turnUntil&&other.to===c.from)continue;
        const forward=dx*Math.sin(c.heading)+dz*Math.cos(c.heading),side=Math.abs(dx*Math.cos(c.heading)-dz*Math.sin(c.heading));
        if(forward>0&&forward<.58&&side<.23)targetSpeed=0;
      }
      c.speed+=Math.max(-dt*2,Math.min(dt*.8,targetSpeed-c.speed));
      const step=Math.min(distance,c.speed*dt);c.x+=Math.sin(c.heading)*step;c.z+=Math.cos(c.heading)*step;c.travelled+=step;
    }
  }
  return {cars,step(dt){if(disposed||!Number.isFinite(dt)||dt<=0)return;accumulator+=Math.min(dt,.25);while(accumulator+1e-10>=1/30){accumulator-=1/30;tick(1/30);}},
    dispose(){if(disposed)return;disposed=true;cars.length=0;accumulator=0;},
    metrics(){return {cars:cars.length,moving:cars.filter(c=>c.speed>.02).length,distance:cars.reduce((n,c)=>n+c.travelled,0),disposed};}};
}
