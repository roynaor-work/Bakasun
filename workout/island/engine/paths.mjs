import {cellsFor} from './rules.mjs?v=island-hoops-r3-20261029-1';
const key=(x,z)=>`${x},${z}`;
/** Free cosmetic footpaths are derived from the city; they never spend money,
 * occupy construction cells or change the saved road/access rules. */
export function cityPaths(state,registry){
  const size=state.world.size,blocked=new Set(),network=new Set(),routes=[];
  const neighbors=({x,z})=>[[x-1,z],[x+1,z],[x,z-1],[x,z+1]].filter(([x,z])=>x>=0&&z>=0&&x<size&&z<size).map(([x,z])=>({x,z}));
  for(const b of state.buildings)for(const [x,z]of cellsFor(registry.buildings.get(b.typeId),b.x,b.z))(registry.buildings.get(b.typeId).isRoad?network:blocked).add(key(x,z));
  const buildings=[...state.buildings].sort((a,b)=>Number(b.typeId==='cityHall')-Number(a.typeId==='cityHall')||a.id.localeCompare(b.id));
  for(const b of buildings){
    const type=registry.buildings.get(b.typeId),cells=cellsFor(type,b.x,b.z);
    if(type.isRoad){routes.push({id:b.id,cells:cells.map(([x,z])=>({x,z})),connected:true});continue;}
    const entrances=new Map();for(const [x,z]of cells)for(const n of neighbors({x,z}))if(!blocked.has(key(n.x,n.z)))entrances.set(key(n.x,n.z),n);
    const queue=[...entrances.values()],parents=new Map(queue.map(p=>[key(p.x,p.z),null]));let end=null;
    if(!network.size&&queue.length)network.add(key(queue[0].x,queue[0].z));
    for(let at=0;at<queue.length;at++){
      const p=queue[at],id=key(p.x,p.z);if(network.has(id)){end=p;break;}
      for(const n of neighbors(p)){const id=key(n.x,n.z);if(blocked.has(id)||parents.has(id))continue;parents.set(id,p);queue.push(n);}
    }
    const path=[];for(let p=end;p;p=parents.get(key(p.x,p.z)))path.unshift(p);
    for(const p of path)network.add(key(p.x,p.z));routes.push({id:b.id,cells:path,connected:!!end});
  }
  const cells=[...network].map(k=>{const [x,z]=k.split(',').map(Number);return {x,z};}).sort((a,b)=>a.z-b.z||a.x-b.x),index=new Map(cells.map((p,i)=>[key(p.x,p.z),i]));
  return {routes,cells:cells.map(p=>({...p,neighbors:neighbors(p).map(n=>index.get(key(n.x,n.z))).filter(i=>i!==undefined)}))};
}
