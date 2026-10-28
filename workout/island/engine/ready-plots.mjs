import {cellsFor,validatePlacement} from './rules.mjs?v=island-hoops-feel-20261027-1';
import {siteColor} from './city-sites.mjs?v=island-hoops-feel-20261027-1';

const neighbors=[[1,0],[0,1],[-1,0],[0,-1]];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const footprint=type=>Array.isArray(type?.footprint)&&type.footprint.length===2&&type.footprint.every(n=>Number.isSafeInteger(n)&&n>0);
const same=(a,b)=>a.typeId===b.typeId&&a.x===b.x&&a.z===b.z;
const inside=(row,type,size)=>row.x>=0&&row.z>=0&&row.x+type.footprint[0]<=size&&row.z+type.footprint[1]<=size;
const shore=(row,type,size)=>inside(row,type,size)&&(row.x===0||row.z===0||row.x+type.footprint[0]===size||row.z+type.footprint[1]===size);
const eligible=(type,flags)=>footprint(type)&&!type.isRoad&&type.id!=='cityHall'&&(!type.featureFlag||flags[type.featureFlag]);
const cellKeys=(row,registry,size)=>cellsFor(registry.buildings.get(row.typeId),row.x,row.z).map(([x,z])=>z*size+x);
const zones=(state,registry)=>(state.cityManagement?.zones||[]).flatMap(row=>{
  const typeId=registry.config.cityManagement?.zones?.[row.kind]?.typeId;
  return registry.buildings.has(typeId)?[{...row,typeId}]:[];
});
const pastShore=(lot,type,state,registry)=>(registry.config.readyWorldStages||[{size:32},{size:40},{size:48}]).some(stage=>stage.size<state.world.size&&shore(lot,type,stage.size));

/** Optional v18 subformat. Reservations keep their coordinates even when an
 * additive import builds over one, or a former shoreline moves on expansion.
 * Such lots are hidden until vacant/legal again; a replacement can be appended.
 * Bounds, exact fields, known types and mutual reservation overlap stay strict. */
export function validReadyPlan(plan,state,registry){
  if(plan===undefined)return true;
  const size=state?.world?.size;
  if(!Number.isSafeInteger(size)||size<1||!object(plan)||Object.keys(plan).some(key=>!['version','lots'].includes(key))||plan.version!==1||!Array.isArray(plan.lots)||plan.lots.length>size*size)return false;
  const ids=new Set(),occupied=new Set();
  for(const lot of plan.lots){
    if(!object(lot)||Object.keys(lot).length!==4||Object.keys(lot).some(key=>!['id','typeId','x','z'].includes(key))||typeof lot.id!=='string'||!/^[a-zA-Z][\w.-]*$/.test(lot.id)||lot.id.length>128||ids.has(lot.id)||!Number.isSafeInteger(lot.x)||!Number.isSafeInteger(lot.z))return false;
    const type=registry.buildings.get(lot.typeId);
    if(!footprint(type)||type.isRoad||type.id==='cityHall'||!inside(lot,type,size)||type.requiresShore&&!shore(lot,type,size)&&!pastShore(lot,type,state,registry))return false;
    for(const cell of cellKeys(lot,registry,size)){if(occupied.has(cell))return false;occupied.add(cell);}
    ids.add(lot.id);
  }
  return true;
}

function occupancy(state,registry){
  const size=state.world.size,occupied=new Map(),planned=new Set();
  for(const row of state.buildings)for(const cell of cellKeys(row,registry,size))occupied.set(cell,row);
  for(const row of zones(state,registry))for(const cell of cellKeys(row,registry,size))planned.add(cell);
  return {occupied,planned};
}
function lotState(lot,state,registry,index){
  const type=registry.buildings.get(lot.typeId),cells=cellKeys(lot,registry,state.world.size);
  if(type.requiresShore&&!shore(lot,type,state.world.size))return 'blocked';
  const rows=cells.map(cell=>index.occupied.get(cell)).filter(Boolean);
  if(rows.length&&rows.every(row=>same(lot,row)))return 'built';
  if(rows.length||cells.some(cell=>index.planned.has(cell)))return 'blocked';
  return 'vacant';
}

/** Read only. Numbers derive from saved order and survive building/removal.
 * Locked/future and temporarily unaffordable lots remain visible. */
export function readyPlots(state,registry,flags={}){
  if(!state.readyPlan||!validReadyPlan(state.readyPlan,state,registry))return [];
  const index=occupancy(state,registry),rows=[],atCapacity=state.buildings.length>=(registry.config.maxSaveBuildings||2000);
  state.readyPlan.lots.forEach((lot,i)=>{
    if(lotState(lot,state,registry,index)!=='vacant')return;
    const type=registry.buildings.get(lot.typeId),result=atCapacity?{ok:false,reason:'ready.limit'}:type.category==='sports'&&!flags.sportFacilities?{ok:false,reason:'reason.locked'}:validatePlacement(state,registry,lot.typeId,lot.x,lot.z,undefined,flags);
    rows.push({...lot,w:type.footprint[0],d:type.footprint[1],color:lot.typeId==='powerPlant'?'#e5bf63':siteColor(lot.typeId),number:i+1,ok:result.ok,status:result.ok?'available':result.reason==='reason.locked'?'locked':'unavailable',reason:result.reason});
  });
  return rows;
}
export function readyPlotAt(state,registry,x,z,flags={}){
  if(!Number.isInteger(x)||!Number.isInteger(z))return null;
  return readyPlots(state,registry,flags).find(lot=>x>=lot.x&&z>=lot.z&&x<lot.x+lot.w&&z<lot.z+lot.d)||null;
}
export function readyPlotForType(state,registry,typeId,flags={}){
  const lots=readyPlots(state,registry,flags).filter(lot=>lot.typeId===typeId);
  return lots.find(lot=>lot.ok)||lots[0]||null;
}
/** Explain a missing airport reservation without conflating space and limits. */
export function airportSpaceReason(state,registry,flags={}){
  if(!state.readyPlan||state.buildings.some(b=>b.typeId==='airport')||readyPlotForType(state,registry,'airport',flags))return null;
  const last=(registry.config.readyWorldStages||registry.config.worldStages).length-1;
  return state.world.stage>=last?'ready.airportNoSpaceFinal':'ready.airportNoSpaceNext';
}

function targetCount(type,stage){
  const configured=type.limit?.maxCount?.[stage];
  if(Number.isSafeInteger(configured))return Math.max(1,Math.min(64,configured));
  const first={house:6,shop:2,factory:2,farm:2,waterTower:2,powerPlant:2,park:2}[type.id]||1;
  return first+(type.limit?.kind==='capacity'||['waterTower','powerPlant','park'].includes(type.id)?stage:0);
}
function districtAnchor(type,state,ordinal){
  const size=state.world.size,hall=state.buildings.find(row=>row.typeId==='cityHall'),home=hall?{x:hall.x+.5,z:hall.z+.5}:{x:size*.27,z:size*.3};
  if(type.id==='harbor')return {x:0,z:home.z+1};
  // Adjacent, unequal neighborhoods grow from the existing town rather than
  // scaling every destination towards the far corners of a larger island.
  const offsets={factory:[8,-3],farm:[6,-6],powerPlant:[11,-1],soccer:[6,4],tennis:[9,5],basketball:[5,8],pool:[9,9],athletics:[3,11],wall:[12,2],watchtower:[12,6],shield:[12,10],embassy:[-3,8],airbase:[7,12],airport:[21,9]}[type.id];
  if(offsets)return {x:Math.max(1,Math.min(size-2,home.x+offsets[0])),z:Math.max(1,Math.min(size-2,home.z+offsets[1]))};
  if(type.category==='learning')return {x:home.x-2,z:home.z+5};
  // The first water tower and civic services still cover the older homes.
  // Further water slots join the utilities district, with industry away from it.
  if(type.id==='waterTower')return ordinal===0?{x:home.x+3,z:home.z-2}:{x:home.x+8,z:home.z-2};
  if(type.category==='services')return {x:home.x+3,z:home.z+2};
  return home;
}
function adjacentCells(lot,type,size){
  const cells=new Set();
  for(let x=lot.x;x<lot.x+type.footprint[0];x++)for(const z of [lot.z-1,lot.z+type.footprint[1]])if(z>=0&&z<size)cells.add(z*size+x);
  for(let z=lot.z;z<lot.z+type.footprint[1];z++)for(const x of [lot.x-1,lot.x+type.footprint[0]])if(x>=0&&x<size)cells.add(z*size+x);
  return cells;
}
function flood(seed,roads,size){
  const seen=new Set(seed),queue=[...seen];
  for(let i=0;i<queue.length;i++){
    const cell=queue[i],x=cell%size,z=Math.floor(cell/size);
    for(const [dx,dz]of neighbors){const nx=x+dx,nz=z+dz,next=nz*size+nx;if(nx<0||nz<0||nx>=size||nz>=size||seen.has(next)||!roads.has(next))continue;seen.add(next);queue.push(next);}
  }
  return seen;
}
/** A shortest legal link never enters an existing building, zone or reservation. */
function route(from,to,blocked,size){
  if(!from.size||!to.size)return null;
  const previous=new Int32Array(size*size).fill(-2),queue=[...from].sort((a,b)=>a-b);
  for(const cell of queue)previous[cell]=-1;
  for(let at=0;at<queue.length;at++){
    const cell=queue[at];
    if(to.has(cell)){
      const path=[];for(let p=cell;p!==-1;p=previous[p])path.push(p);return path;
    }
    const x=cell%size,z=Math.floor(cell/size);
    for(const [dx,dz]of neighbors){const nx=x+dx,nz=z+dz,next=nz*size+nx;if(nx<0||nz<0||nx>=size||nz>=size||blocked.has(next)||previous[next]!==-2)continue;previous[next]=cell;queue.push(next);}
  }
  return null;
}

/** Explicit, free, append-only city preparation. The caller expands the same
 * world stage first and owns saving/notification. Nothing earned is moved,
 * removed or charged; an impossible dense region simply receives fewer lots. */
export function prepareReadyPlan(state,registry,flags={}){
  if(!state?.world||!Array.isArray(state.buildings)||!validReadyPlan(state.readyPlan,state,registry))return {ok:false,reason:'reason.invalid',changed:false,addedLots:0,addedRoads:0};
  const size=state.world.size,stage=state.world.stage||0,original=state.readyPlan;
  if(!original)state.readyPlan={version:1,lots:[]};
  const lots=state.readyPlan.lots,initialLots=lots.length,originalRoads=new Set(),hard=new Set(),ids=new Set(state.buildings.map(row=>row.id)),lotIds=new Set(lots.map(row=>row.id));
  for(const row of state.buildings){const set=registry.buildings.get(row.typeId)?.isRoad?originalRoads:hard;for(const cell of cellKeys(row,registry,size))set.add(cell);}
  for(const row of zones(state,registry))for(const cell of cellKeys(row,registry,size))hard.add(cell);
  const reserved=new Set();for(const lot of lots)for(const cell of cellKeys(lot,registry,size)){hard.add(cell);reserved.add(cell);}
  const types=[...registry.buildings.values()].filter(type=>eligible(type,flags)&&stage>=(type.minWorldStage||0));
  const append=lot=>{
    let number=1,id;do{id=`ready-${lot.typeId}-${number++}`;}while(lotIds.has(id));
    const row={id,typeId:lot.typeId,x:lot.x,z:lot.z};lots.push(row);lotIds.add(id);
    for(const cell of cellKeys(row,registry,size)){hard.add(cell);reserved.add(cell);}return row;
  };
  // Existing instances become completed lots when they do not intersect a
  // prior reservation. Imported progress always wins over a vacant drawing.
  for(const row of state.buildings){
    const type=registry.buildings.get(row.typeId);
    if(!eligible(type,flags)||!inside(row,type,size)||type.requiresShore&&!shore(row,type,size)||lots.some(lot=>same(lot,row)))continue;
    if(cellKeys(row,registry,size).some(cell=>reserved.has(cell)))continue;
    append(row);
  }
  const index=occupancy(state,registry);
  const deficit=type=>{
    const usable=lots.filter(lot=>lot.typeId===type.id&&lotState(lot,state,registry,index)!=='blocked').length;
    const unrepresented=state.buildings.filter(row=>row.typeId===type.id&&!lots.some(lot=>same(lot,row))).length;
    return Math.max(0,targetCount(type,stage)-usable-unrepresented);
  };
  const hall=state.buildings.find(row=>row.typeId==='cityHall'),origin=hall?{x:hall.x,z:hall.z}:{x:size/2,z:size/2};
  const distance=cell=>Math.hypot(cell%size-origin.x,Math.floor(cell/size)-origin.z);
  const roadBudget=Math.max(0,(registry.config.maxSaveBuildings||2000)-state.buildings.length);
  let roads=new Set(originalRoads),connected=new Set(),newRoads=new Set();
  const candidates=(type,beforeGrid=false)=>{
    const result=[],anchor=districtAnchor(type,state,lots.filter(lot=>lot.typeId===type.id).length);
    for(let z=0;z<=size-type.footprint[1];z++)for(let x=0;x<=size-type.footprint[0];x++){
      const lot={typeId:type.id,x,z};if(type.requiresShore&&(!shore(lot,type,size)||x!==0&&z!==0))continue;
      if(cellKeys(lot,registry,size).some(cell=>hard.has(cell)||roads.has(cell)))continue;
      const access=[...adjacentCells(lot,type,size)].some(cell=>connected.has(cell));
      if(!beforeGrid&&type.requiresRoad&&!access&&newRoads.size>=roadBudget)continue;
      // The fixed north/west shoreline survives every positive-axis expansion.
      let score=(!beforeGrid&&type.requiresRoad&&!access?3:0)+Math.hypot(x+type.footprint[0]/2-anchor.x,z+type.footprint[1]/2-anchor.z);
      const previousSize=(registry.config.readyWorldStages||[])[stage-1]?.size;
      if(type.id==='airport'&&previousSize&&x<previousSize&&z<previousSize)score+=size*4;
      if(type.id==='waterTower'&&!lots.some(lot=>lot.typeId==='waterTower'))for(const home of [...state.buildings,...lots].filter(row=>row.typeId==='house')){
        const [w,d]=registry.buildings.get('house').footprint;
        if(Math.hypot(x+(type.footprint[0]-1)/2-home.x-(w-1)/2,z+(type.footprint[1]-1)/2-home.z-(d-1)/2)<=type.radius)score-=2;
        else if(home===[...state.buildings,...lots].find(row=>row.typeId==='house'))score+=30;
      }
      result.push({lot,score});
    }
    return result.sort((a,b)=>a.score-b.score||a.lot.z-b.lot.z||a.lot.x-b.lot.x).map(row=>row.lot);
  };
  // Reserve coastal footprints before laying corridors through an edge.
  const coastal=[];
  for(const type of types.filter(type=>type.requiresShore))for(let n=deficit(type);n>0;n--){
    const lot=candidates(type,true)[0];if(!lot)break;coastal.push(lot);for(const cell of cellKeys(lot,registry,size))hard.add(cell);
  }
  // Keep existing streets, then add only the legal links needed by each plot.
  // There is no island-wide lattice and no uniform block size to force.
  let root=[...originalRoads].sort((a,b)=>distance(a)-distance(b)||a-b)[0];
  if(root===undefined){
    const hallType=hall&&registry.buildings.get(hall.typeId),beside=hallType?[...adjacentCells(hall,hallType,size)].filter(cell=>!hard.has(cell)):[];
    root=(beside.length?beside:[...roads]).sort((a,b)=>distance(a)-distance(b)||a-b)[0];
    if(root!==undefined&&!roads.has(root)){roads.add(root);newRoads.add(root);}
  }
  if(root!==undefined){
    connected=flood([root],roads,size);
    while(connected.size<roads.size){
      const path=route(connected,new Set([...roads].filter(cell=>!connected.has(cell))),hard,size);if(!path)break;
      for(const cell of path)if(!roads.has(cell)){roads.add(cell);newRoads.add(cell);}
      connected=flood([root],roads,size);
    }
  }
  // Do not add disconnected cosmetic corridors when old buildings seal them.
  for(const cell of newRoads)if(!connected.has(cell)){roads.delete(cell);newRoads.delete(cell);}
  if(newRoads.size>roadBudget){
    const retained=new Set(),seen=new Set(),queue=[];
    if(root!==undefined&&(originalRoads.has(root)||roadBudget>0)){seen.add(root);queue.push(root);if(!originalRoads.has(root))retained.add(root);}
    for(let i=0;i<queue.length;i++){
      const cell=queue[i],x=cell%size,z=Math.floor(cell/size);
      for(const [dx,dz]of neighbors){
        const nx=x+dx,nz=z+dz,next=nz*size+nx;
        if(nx<0||nz<0||nx>=size||nz>=size||seen.has(next)||!roads.has(next)||!originalRoads.has(next)&&retained.size>=roadBudget)continue;
        seen.add(next);queue.push(next);if(!originalRoads.has(next))retained.add(next);
      }
    }
    newRoads=retained;roads=new Set([...originalRoads,...retained]);connected=root!==undefined&&roads.has(root)?flood([root],roads,size):new Set();
  }
  const connect=lot=>{
    const type=registry.buildings.get(lot.typeId);if(!type.requiresRoad)return true;
    const adjacent=adjacentCells(lot,type,size);if([...adjacent].some(cell=>connected.has(cell)))return true;
    const path=route(connected,new Set([...adjacent].filter(cell=>!hard.has(cell))),hard,size);if(!path||newRoads.size+path.filter(cell=>!roads.has(cell)).length>roadBudget)return false;
    for(const cell of path)if(!roads.has(cell)){roads.add(cell);newRoads.add(cell);}
    connected=flood([root],roads,size);return true;
  };
  for(const lot of coastal){if(connect(lot))append(lot);else for(const cell of cellKeys(lot,registry,size))hard.delete(cell);}
  for(const type of types.filter(type=>!type.requiresShore).sort((a,b)=>Number(b.id==='airport')-Number(a.id==='airport'))){
    for(let n=deficit(type);n>0;n--){
      let placed=false;
      for(const lot of candidates(type)){
        const cells=cellKeys(lot,registry,size);for(const cell of cells)hard.add(cell);
        if(connect(lot)){append(lot);placed=true;break;}
        for(const cell of cells)hard.delete(cell);
      }
      if(!placed)break;
    }
  }
  for(const cell of [...newRoads].sort((a,b)=>a-b)){
    const x=cell%size,z=Math.floor(cell/size),base=`ready-road-${x}-${z}`;let id=base,n=1;while(ids.has(id))id=`${base}-${n++}`;
    ids.add(id);state.buildings.push({id,typeId:'road',x,z,level:1});
  }
  const addedLots=lots.length-initialLots,addedRoads=newRoads.size;
  return {ok:true,changed:!original||addedLots>0||addedRoads>0,addedLots,addedRoads};
}
