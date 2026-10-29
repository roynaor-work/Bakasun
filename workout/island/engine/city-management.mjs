import {buildingCenter,levelFactor,levelValue,population} from './metrics.mjs?v=island-boar-20261029-1';
import {cellsFor,placementAvailability,validatePlacement} from './rules.mjs?v=island-boar-20261029-1';
import {cityConnections} from './city-connections.mjs?v=island-boar-20261029-1';
export {cityConnections};

export const CITY_DEPARTMENTS=['water','health','education','safety'];
export const CITY_ZONES=['residential','commercial','industrial'];
export function initialCityManagement(){return {enabled:false,taxRate:9,funding:Object.fromEntries(CITY_DEPARTMENTS.map(id=>[id,100])),zones:[],nextZoneId:1,growthSeconds:0,developed:0,operatingRatio:1};}
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const active=(state,row)=>!(state.events?.repairs?.[row.id]>state.updatedAt);

/** Plans occupy no buildings and never replace an existing record. */
export function zoneAvailability(state,registry,kind,x,z,ignoreId){
  const definition=registry.config.cityManagement?.zones[kind],type=registry.buildings.get(definition?.typeId);
  if(!type||!Number.isInteger(x)||!Number.isInteger(z))return {ok:false,reason:'reason.invalid'};
  const cells=cellsFor(type,x,z),keys=new Set(cells.map(cell=>cell.join(',')));
  if(cells.some(([cx,cz])=>cx<0||cz<0||cx>=state.world.size||cz>=state.world.size))return {ok:false,reason:'reason.bounds'};
  if(state.buildings.some(row=>cellsFor(registry.buildings.get(row.typeId),row.x,row.z).some(cell=>keys.has(cell.join(',')))))return {ok:false,reason:'reason.occupied'};
  if(state.cityManagement.zones.some(row=>row.id!==ignoreId&&cellsFor(registry.buildings.get(registry.config.cityManagement.zones[row.kind].typeId),row.x,row.z).some(cell=>keys.has(cell.join(',')))))return {ok:false,reason:'city.reason.zoneOccupied'};
  return {ok:true,reason:'reason.allowed'};
}

/** Prefer a free lot on the city's road network, then the nearest lot to the pointer. */
export function nearestCityZone(state,registry,kind,origin={x:state.world.size/2,z:state.world.size/2}){
  const typeId=registry.config.cityManagement.zones[kind]?.typeId;if(!typeId)return null;
  const [w,d]=registry.buildings.get(typeId).footprint,connections=cityConnections(state,registry),occupied=new Set();
  for(const row of [...state.buildings,...state.cityManagement.zones.map(zone=>({...zone,typeId:registry.config.cityManagement.zones[zone.kind].typeId}))])for(const cell of cellsFor(registry.buildings.get(row.typeId),row.x,row.z))occupied.add(cell.join(','));
  let best;
  for(let z=0;z<=state.world.size-d;z++)for(let x=0;x<=state.world.size-w;x++){
    if(cellsFor({footprint:[w,d]},x,z).some(cell=>occupied.has(cell.join(','))))continue;
    const candidate={x,z,connected:connections.hasAccess({typeId,x,z}),distance:Math.hypot(x-origin.x,z-origin.z)};
    if(!best||Number(candidate.connected)>Number(best.connected)||candidate.connected===best.connected&&candidate.distance<best.distance)best=candidate;
  }
  return best?{x:best.x,z:best.z}:null;
}

export function validCityManagement(value,state,registry){
  const config=registry.config.cityManagement;
  if(!config||!state?.world||!Number.isInteger(state.world.size))return false;
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean'||!config.taxRates.includes(value.taxRate))return false;
  if(!value.funding||Object.keys(value.funding).length!==CITY_DEPARTMENTS.length||!CITY_DEPARTMENTS.every(id=>config.fundingLevels.includes(value.funding[id])))return false;
  if(!Number.isSafeInteger(value.nextZoneId)||value.nextZoneId<1||!Number.isSafeInteger(value.developed)||value.developed<0||!Number.isFinite(value.growthSeconds)||value.growthSeconds<0||value.growthSeconds>=config.growthInterval||!Number.isFinite(value.operatingRatio)||value.operatingRatio<0||value.operatingRatio>1)return false;
  if(!Array.isArray(value.zones)||value.zones.length>config.maxZones)return false;
  const ids=new Set(),occupied=new Set();
  for(const zone of value.zones){
    if(!zone||typeof zone.id!=='string'||!/^zone-[1-9]\d*$/.test(zone.id)||ids.has(zone.id)||!CITY_ZONES.includes(zone.kind)||!Number.isInteger(zone.x)||!Number.isInteger(zone.z))return false;
    const type=registry.buildings.get(config.zones[zone.kind].typeId);
    for(const [x,z]of cellsFor(type,zone.x,zone.z)){const key=`${x},${z}`;if(x<0||z<0||x>=state.world.size||z>=state.world.size||occupied.has(key))return false;occupied.add(key);}
    ids.add(zone.id);
  }
  return true;
}

export function municipalBudget(state,registry,config){
  const policy=state.cityManagement,cfg=config.cityManagement;
  const connections=policy?.enabled?cityConnections(state,registry):null;
  const jobs=state.buildings.filter(row=>active(state,row)&&(!connections||connections.hasAccess(row))).reduce((sum,row)=>sum+(cfg?.jobs[row.typeId]||0)*levelFactor(row,config),0);
  if(!policy?.enabled||!cfg)return {taxes:0,expenses:0,net:0,jobs,departments:{}};
  const departments=Object.fromEntries(CITY_DEPARTMENTS.map(id=>[id,0]));let maintenance=0;
  for(const row of state.buildings){
    // Prepared public infrastructure is free to keep as well as to build.
    // Player-built roads and every other building retain their ordinary bill.
    if(state.readyPlan&&row.typeId==='road'&&row.id.startsWith('ready-road-'))continue;
    const service=cfg.services[row.typeId];
    if(service)departments[service.department]+=service.upkeep*levelFactor(row,config)*policy.funding[service.department]/100;
    else maintenance+=(cfg.maintenance[row.typeId]||0)*levelFactor(row,config);
  }
  const taxes=(population(state,registry,config)*cfg.taxPerResident+jobs*cfg.taxPerJob)*policy.taxRate/100;
  const expenses=maintenance+Object.values(departments).reduce((sum,n)=>sum+n,0);
  return {taxes,expenses,net:taxes-expenses,jobs,maintenance,departments};
}

function serviceCoverage(state,registry,config,connections){
  const policy=state.cityManagement,homes=state.buildings.filter(row=>levelValue(row,registry.buildings.get(row.typeId),'population',config)>0),total=population(state,registry,config);
  const result={};
  for(const department of CITY_DEPARTMENTS){
    const providers=[];let capacity=0;
    for(const row of state.buildings){
      const service=config.cityManagement.services[row.typeId],type=registry.buildings.get(row.typeId);
      if(service?.department!==department||!active(state,row)||!connections.hasAccess(row))continue;
      const funding=policy.enabled?policy.funding[department]/100*policy.operatingRatio:1;
      const supply=levelValue(row,type,'supply',config)*funding,radius=type.radius*levelFactor(row,config)*Math.sqrt(funding),center=buildingCenter(row,registry);
      capacity+=supply;
      const covered=homes.filter(home=>{const target=buildingCenter(home,registry);return connections.hasAccess(home)&&Math.hypot(target.x-center.x,target.z-center.z)<=radius;});
      providers.push({id:row.id,radius,supply,homes:covered.map(home=>home.id)});
    }
    const supplied=allocateCoverage(providers,homes.map(home=>({id:home.id,population:levelValue(home,registry.buildings.get(home.typeId),'population',config)})));
    const covered=homes.reduce((sum,home)=>sum+Math.min(supplied.get(home.id),levelValue(home,registry.buildings.get(home.typeId),'population',config)),0);
    result[department]={capacity,covered,total,coverage:total?clamp(covered/total*100):100,homes:Object.fromEntries(homes.map(home=>[home.id,clamp(supplied.get(home.id)/levelValue(home,registry.buildings.get(home.typeId),'population',config)*100)])),supplied:Object.fromEntries(supplied),providers:supplied.providers};
  }
  return result;
}

/** Route finite capacity through overlapping service areas without counting a resident twice. */
function allocateCoverage(providers,homes){
  const sink=1+providers.length+homes.length,graph=Array.from({length:sink+1},()=>[]),homeEdges=new Map(),providerEdges=[],homeNodes=new Map(homes.map((home,index)=>[home.id,1+providers.length+index]));
  const edge=(from,to,capacity)=>{const forward={to,capacity,reverse:graph[to].length},backward={to:from,capacity:0,reverse:graph[from].length};graph[from].push(forward);graph[to].push(backward);return forward;};
  homes.forEach(home=>homeEdges.set(home.id,edge(homeNodes.get(home.id),sink,home.population)));
  providers.forEach((provider,index)=>{edge(0,index+1,provider.supply);const edges=[];for(const id of provider.homes){const forward=edge(index+1,homeNodes.get(id),Number.MAX_SAFE_INTEGER);edges.push({id,forward});}providerEdges.push(edges);});
  while(true){
    const parent=Array(sink+1).fill(null),queue=[0];parent[0]=[-1,-1];
    for(let i=0;i<queue.length&&!parent[sink];i++)for(const [index,item]of graph[queue[i]].entries())if(item.capacity>1e-8&&!parent[item.to]){parent[item.to]=[queue[i],index];queue.push(item.to);}
    if(!parent[sink])break;
    let flow=Infinity;for(let at=sink;at!==0;){const [from,index]=parent[at];flow=Math.min(flow,graph[from][index].capacity);at=from;}
    for(let at=sink;at!==0;){const [from,index]=parent[at],item=graph[from][index];item.capacity-=flow;graph[at][item.reverse].capacity+=flow;at=from;}
  }
  const supplied=new Map(homes.map(home=>[home.id,home.population-homeEdges.get(home.id).capacity]));
  supplied.providers=providers.map((provider,index)=>{
    const allocations=Object.fromEntries(providerEdges[index].map(({id,forward})=>[id,graph[forward.to][forward.reverse].capacity]));
    return {id:provider.id,radius:provider.radius,capacity:provider.supply,used:Object.values(allocations).reduce((sum,n)=>sum+n,0),serves:Object.keys(allocations).filter(id=>allocations[id]>1e-8),inRange:provider.homes,allocations};
  });
  return supplied;
}

export function cityReport(state,registry,config,income={money:0},{includeZones=true}={}){
  const policy=state.cityManagement,cfg=config.cityManagement,connections=cityConnections(state,registry),residents=population(state,registry,config),budget=municipalBudget(state,registry,config),services=serviceCoverage(state,registry,config,connections);
  const jobs=budget.jobs,commercialJobs=state.buildings.filter(row=>row.typeId==='shop'&&active(state,row)&&connections.hasAccess(row)).reduce((sum,row)=>sum+cfg.jobs.shop*levelFactor(row,config),0),industrialJobs=state.buildings.filter(row=>row.typeId==='factory'&&active(state,row)&&connections.hasAccess(row)).reduce((sum,row)=>sum+cfg.jobs.factory*levelFactor(row,config),0);
  const quality=CITY_DEPARTMENTS.reduce((sum,id)=>sum+services[id].coverage,0)/CITY_DEPARTMENTS.length,taxPenalty=(policy.taxRate-9)*5;
  const demand={residential:clamp(50+jobs*3-residents*2+(quality-50)*.35-taxPenalty),commercial:clamp(residents*5-commercialJobs*6+15-taxPenalty),industrial:clamp(residents*3-industrialJobs*3+20-taxPenalty*.5)};
  const context={connections,residents,jobs,services,demand};
  const zones=includeZones?policy.zones.map(zone=>({...zone,...zoneStatus(state,registry,config,zone,context)})):[];
  const disconnected=state.buildings.filter(row=>!registry.buildings.get(row.typeId)?.isRoad&&registry.buildings.get(row.typeId)?.requiresRoad&&!connections.hasAccess(row)).map(row=>row.id);
  return {enabled:policy.enabled,residents,jobs:Math.round(jobs),employed:Math.min(residents,Math.floor(jobs)),demand,services,budget:{...budget,income:income.money+budget.expenses,net:income.money},zones,disconnected,connectedRoads:connections.connected.size,totalRoads:connections.roads.size,growthIn:Math.ceil(cfg.growthInterval-policy.growthSeconds)};
}

function zoneStatus(state,registry,config,zone,context){
  const typeId=config.cityManagement.zones[zone.kind].typeId,type=registry.buildings.get(typeId),keys=new Set(cellsFor(type,zone.x,zone.z).map(cell=>cell.join(',')));
  const occupying=state.buildings.filter(row=>cellsFor(registry.buildings.get(row.typeId),row.x,row.z).some(cell=>keys.has(cell.join(','))));
  if(occupying.length)return {status:occupying.length===1&&occupying[0].typeId===typeId&&occupying[0].x===zone.x&&occupying[0].z===zone.z?'developed':'occupied',reason:'city.reason.occupied',buildingId:occupying[0].id};
  if(!state.cityManagement.enabled)return {status:'waiting',reason:'city.reason.paused'};
  if(!context.connections.hasAccess({typeId,x:zone.x,z:zone.z}))return {status:'waiting',reason:'city.reason.connection'};
  const availability=placementAvailability(state,registry,typeId);
  if(!availability.ok)return {status:'waiting',reason:availability.reason};
  if(context.demand[zone.kind]<=0)return {status:'waiting',reason:'city.reason.demand'};
  if(zone.kind==='residential'&&context.residents>=config.cityManagement.bootstrapResidents){
    if(context.jobs<context.residents*config.cityManagement.jobsPerResident)return {status:'waiting',reason:'city.reason.jobs'};
    const candidate={id:'zone-candidate',typeId,x:zone.x,z:zone.z,level:1},preview={...state,buildings:[...state.buildings,candidate]},water=serviceCoverage(preview,registry,config,context.connections).water;
    if(water.homes[candidate.id]<80)return {status:'waiting',reason:'city.reason.water'};
  }
  if(zone.kind!=='residential'&&context.residents<4)return {status:'waiting',reason:'city.reason.residents'};
  const placement=validatePlacement(state,registry,typeId,zone.x,zone.z,undefined,{learningStations:true});
  if(!placement.ok)return {status:'waiting',reason:placement.reason};
  return {status:'ready',reason:'city.reason.ready',cost:type.cost};
}

/** Growth is driven only by foreground engine ticks. A blocked lot never consumes money or an ID. */
export function advanceCity(state,registry,config,seconds,place){
  if(!state.cityManagement.enabled||!Number.isFinite(seconds)||seconds<=0)return [];
  const policy=state.cityManagement,interval=config.cityManagement.growthInterval;
  policy.growthSeconds+=seconds;const developed=[];
  while(policy.growthSeconds>=interval){
    policy.growthSeconds-=interval;
    const report=cityReport(state,registry,config),zone=report.zones.find(row=>row.status==='ready');
    if(!zone)continue;
    const result=place(config.cityManagement.zones[zone.kind].typeId,zone.x,zone.z);
    if(result.ok){policy.developed++;developed.push({zoneId:zone.id,buildingId:result.id});}
  }
  return developed;
}
