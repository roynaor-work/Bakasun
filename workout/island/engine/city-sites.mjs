import {cellsFor,placementAvailability,validatePlacement} from './rules.mjs?v=island-boar-20261029-2';
import {cityConnections} from './city-connections.mjs?v=island-boar-20261029-2';
import {buildingCenter,levelFactor} from './metrics.mjs?v=island-boar-20261029-2';

export const siteColor=id=>id==='house'?'#49ba85':id==='shop'?'#579fdb':id==='factory'?'#d9ad58':id==='road'?'#a4bac3':id==='park'?'#77bdaa':'#a69cdb';
const key=(x,z)=>`${x},${z}`;
export const citySitesSignature=state=>JSON.stringify([state.world,state.buildings,state.cityManagement?.zones,state.cityManagement?.enabled,state.cityManagement?.funding,state.cityManagement?.operatingRatio,Object.entries(state.events?.repairs||{}).filter(([,until])=>until>state.updatedAt)]);

/** Read-only, bounded suggestions. Money is explained at confirmation; every
 * candidate respects real access, unlocks, limits, footprints and saved plans. */
export function citySites(state,registry,typeId,{limit=6,ignoreId,flags={},reserved=[]}={}){
  const type=registry.buildings.get(typeId);
  if(!type||type.locked||(type.featureFlag&&!flags[type.featureFlag])||(!ignoreId&&!placementAvailability(state,registry,typeId).ok))return [];
  const connections=cityConnections(state,registry),occupied=new Set(),others=state.buildings.filter(row=>row.id!==ignoreId);
  const plans=(state.cityManagement?.zones||[]).map(row=>({...row,typeId:registry.config.cityManagement.zones[row.kind].typeId}));
  for(const row of [...others,...plans,...reserved])for(const [x,z]of cellsFor(registry.buildings.get(row.typeId),row.x,row.z))occupied.add(key(x,z));
  const hall=state.buildings.find(row=>row.typeId==='cityHall'),origin=hall?buildingCenter(hall,registry):{x:state.world.size/2,z:state.world.size/2};
  const homes=others.filter(row=>row.typeId==='house'),industry=others.filter(row=>row.typeId==='factory');
  const providers=others.filter(row=>registry.config.cityManagement?.services[row.typeId]&&connections.hasAccess(row)&&!(state.events?.repairs?.[row.id]>state.updatedAt));
  const [w,d]=type.footprint,candidates=[];
  for(let z=0;z<=state.world.size-d;z++)for(let x=0;x<=state.world.size-w;x++){
    const row={typeId,x,z},cells=cellsFor(type,x,z);
    if(cells.some(([cx,cz])=>occupied.has(key(cx,cz))))continue;
    if(type.requiresShore&&!cells.some(([cx,cz])=>cx===0||cz===0||cx===state.world.size-1||cz===state.world.size-1))continue;
    const connected=connections.hasAccess(row);
    if((type.requiresRoad||type.isRoad)&&!connected)continue;
    const center=buildingCenter(row,registry),distance=Math.hypot(center.x-origin.x,center.z-origin.z);
    const near=(rows,radius)=>rows.filter(other=>{const p=buildingCenter(other,registry);return Math.hypot(center.x-p.x,center.z-p.z)<=radius;}).length;
      const nearbyServices=providers.filter(other=>{const p=buildingCenter(other,registry),spec=registry.buildings.get(other.typeId),department=registry.config.cityManagement.services[other.typeId].department,policy=state.cityManagement,funding=policy?.enabled?policy.funding[department]/100*policy.operatingRatio:1;return funding>0&&Math.hypot(center.x-p.x,center.z-p.z)<=spec.radius*levelFactor(other,registry.config)*Math.sqrt(funding);}).length;
    const adjacentRoads=cells.reduce((sum,[cx,cz])=>sum+[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>connections.connected.has(key(cx+dx,cz+dz))).length,0);
    let score=-distance;
    if(typeId==='house')score+=nearbyServices*3+near(homes,5)*1.5-near(industry,5)*6;
    else if(typeId==='factory')score+=near(industry,5)*2-near(homes,6)*8;
    else if(typeId==='shop'||typeId==='park'||type.category==='services'||type.category==='learning')score+=near(homes,type.radius||6)*3;
    if(type.isRoad)score-=Math.max(0,adjacentRoads-1)*3;
    candidates.push({...row,w,d,connected,nearbyServices,score,color:siteColor(typeId)});
  }
  candidates.sort((a,b)=>b.score-a.score||a.z-b.z||a.x-b.x);
  const selected=[],used=new Set();
  for(const row of candidates){
    const cells=cellsFor(type,row.x,row.z);if(cells.some(([x,z])=>used.has(key(x,z))))continue;
    // Reuse the authoritative command validator for the final shortlist.
    const validation=validatePlacement({...state,money:Number.MAX_SAFE_INTEGER},registry,typeId,row.x,row.z,ignoreId,flags);
    if(!validation.ok)continue;
    selected.push({...row,number:selected.length+1,reason:typeId==='house'&&row.nearbyServices?'city.site.services':typeId==='factory'?'city.site.industry':type.isRoad?'city.site.extend':'city.site.connected'});
    cells.forEach(([x,z])=>used.add(key(x,z)));if(selected.length>=Math.max(1,Math.min(12,limit)))break;
  }
  return selected;
}

/** A proposal, never an automatic build or reservation in a save. */
export function cityBlueprint(state,registry,flags={}){
  const result=[];
  for(const id of ['house','waterTower','shop','park','house','school','hospital','fireStation','factory']){
    const row=citySites(state,registry,id,{limit:1,flags,reserved:result})[0];
    if(row)result.push({...row,number:result.length+1});
  }
  if(!result.length){const road=citySites(state,registry,'road',{limit:1,flags})[0];if(road)result.push(road);}
  return result;
}

/** Face a real adjoining street. Rectangular plots keep their original axes. */
export function streetFront(building,type,buildings,definition,roadCells,preserveAxes=false){
  const roads=roadCells||new Set(buildings.filter(row=>definition(row.typeId)?.isRoad).flatMap(row=>cellsFor(definition(row.typeId),row.x,row.z).map(([x,z])=>key(x,z))));
  const [w,d]=type.footprint,options=[{dx:0,dz:1,angle:0},{dx:0,dz:-1,angle:Math.PI}];
  if(w===d||!preserveAxes)options.push({dx:1,dz:0,angle:Math.PI/2},{dx:-1,dz:0,angle:-Math.PI/2});
  for(const option of options)option.access=cellsFor(type,building.x,building.z).filter(([x,z])=>roads.has(key(x+option.dx,z+option.dz))).length;
  return options.sort((a,b)=>b.access-a.access)[0];
}
export const streetFacing=(building,type,buildings,definition,roadCells)=>streetFront(building,type,buildings,definition,roadCells,true).angle;
