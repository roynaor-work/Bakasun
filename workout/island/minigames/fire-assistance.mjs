import {fireRoadRoute,projectFireRoad} from './fire-roads.mjs?v=island-people-scale-20261026-1';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

/** A selected objective and a road route are round-local, never saved. The
 * navigator sends ordinary steering input through the same collision driver. */
export function createFireNavigation({balance,truck,flames,rescues,roads}){
  const state={active:false,kind:null,targetIndex:null,target:null,path:[]};
  let selected=null;
  function objective(kind,index=0){
    if(!['fire','rescue','hydrant'].includes(kind)||!Number.isInteger(index)||index<0)return null;
    const source=kind==='fire'?flames[index]:kind==='rescue'?rescues[index]:balance.city.hydrants[index];
    if(!source)return null;
    const world=kind==='fire'?balance.render.sites[index]:kind==='rescue'?source.world:source;
    return {kind,index,world,x:kind==='hydrant'?balance.render.logicalCenter[0]+world[0]/balance.render.worldScale:source.x,y:kind==='hydrant'?balance.render.logicalCenter[1]+world[2]/balance.render.worldScale:source.y};
  }
  function select(command){const target=objective(command?.kind,command?.index);if(target)selected={kind:target.kind,index:target.index};return target;}
  function cancel(){state.active=false;state.path=[];}
  function navigate(command){
    const target=select(command);if(!target)return false;
    const goal=projectFireRoad(roads,{x:target.world[0],z:target.world[2]}),start=projectFireRoad(roads,truck);
    state.kind=target.kind;state.targetIndex=target.index;state.target={x:goal.x,z:goal.z};
    state.path=fireRoadRoute(roads,truck,goal);
    if(distance(start,truck)>.25)state.path.unshift({x:start.x,z:start.z});
    state.active=distance(truck,goal)>.32||truck.speed>.15;return true;
  }
  function update(input){
    if(input.clearSelection){selected=null;cancel();}
    if(input.select&&select(input.select))cancel();
    if(input.cancelNavigation)cancel();
    if(input.navigate)navigate(input.navigate);
    const manual=Math.hypot(Number(input.moveX)||0,Number(input.moveZ)||0)>balance.controls.deadzone;
    if(manual&&!input.stabilizing)cancel();
    if(!state.active)return {...input,assisted:true};
    const target=objective(state.kind,state.targetIndex);
    if(!target||(state.kind==='fire'&&(!flames[state.targetIndex].active||flames[state.targetIndex].heat<=0))||(state.kind==='rescue'&&(rescues[state.targetIndex].rescued||rescues[state.targetIndex].expired))){cancel();return {...input,assisted:true};}
    while(state.path.length>1&&distance(state.path[0],truck)<.7)state.path.shift();
    const goal=state.path[0]||state.target,d=distance(goal,truck),last=state.path.length<=1;
    if(last&&d<.36){if(truck.speed<.18)cancel();return {...input,moveX:0,moveZ:0,assisted:true};}
    const wantedSpeed=last?Math.min(balance.vehicle.speed,Math.max(1.4,(d-.25)*5)):balance.vehicle.speed;
    const throttle=balance.controls.deadzone+(1-balance.controls.deadzone)*Math.sqrt(clamp(wantedSpeed/balance.vehicle.speed,0,1));
    return {...input,moveX:(goal.x-truck.x)/Math.max(.01,d)*throttle,moveZ:(goal.z-truck.z)/Math.max(.01,d)*throttle,assisted:true,navigationDriving:true};
  }
  return {state,objective,select,navigate,cancel,update,get selected(){return selected;}};
}

export function fireGuidance(model,balance,navigation){
  const selected=model.selectedObjective&&navigation.objective(model.selectedObjective.kind,model.selectedObjective.index);
  const target=model.ladder.target,dist=target?Math.hypot(model.truck.x-target.world[0],model.truck.z-target.world[2]):0;
  function rescueKey(r,d){
    const waitingForOrder=model.ladder.mode==='sequence'&&model.rescues.slice(0,model.rescues.indexOf(r)).some(previous=>!previous.rescued||previous.descent<1);
    return d>balance.rescue.truckRadius?'approachRescue':waitingForOrder?'rescueOrder':!model.ladder.stable?'wind':!r.safe&&r.kind!=='access'?'clearWindow':'rescue';
  }
  if(model.navigation.active)return {kind:model.navigation.kind,key:'fire.guide.approach'+({fire:'Fire',hydrant:'Hydrant',rescue:'Rescue'}[model.navigation.kind]||'Fire'),distance:distance(model.truck,model.navigation.target),targetIndex:model.navigation.targetIndex,progress:0};
  if(model.canFinish)return {kind:'complete',key:'fire.guide.complete',distance:0,progress:1};
  if(model.rescuing&&target){
    const key=rescueKey(target,dist);
    return {kind:'rescue',key:'fire.guide.'+key,distance:dist,progress:Math.min(1,(target.progress||0)/target.seconds)};
  }
  if(model.refilling)return {kind:'hydrant',key:'fire.guide.refill',distance:0,progress:model.water/model.maxWater};
  if(model.pressureEmpty)return {kind:'pressure',key:'fire.guide.pressure',distance:0,progress:model.pressure/model.maxPressure};
  if(model.coolingTarget!==null)return {kind:'fire',key:'fire.guide.cool',distance:Math.hypot(model.flames[model.coolingTarget].x-model.nozzle.x,model.flames[model.coolingTarget].y-model.nozzle.y)*balance.render.worldScale,targetIndex:model.coolingTarget,progress:1-model.flames[model.coolingTarget].heat};
  if(model.water/model.maxWater<=balance.hydrant.lowWaterRatio)return {kind:'hydrant',key:'fire.guide.approachHydrant',distance:Math.min(...balance.city.hydrants.map(p=>Math.hypot(model.truck.x-p[0],model.truck.z-p[2]))),progress:model.water/model.maxWater};
  if(selected?.kind==='fire'&&model.flames[selected.index].heat<=0)return {kind:'fire',key:'fire.guide.fireOut',distance:0,progress:1};
  if(selected?.kind==='rescue'&&(model.rescues[selected.index].rescued||model.rescues[selected.index].expired))return {kind:'fire',key:'fire.guide.select',distance:0,progress:0};
  if(selected){
    const d=Math.hypot(model.truck.x-selected.world[0],model.truck.z-selected.world[2]);
    const key=selected.kind==='fire'?(Math.hypot(model.nozzle.x-selected.x,model.nozzle.y-selected.y)<=model.range?'cool':'approachFire'):selected.kind==='rescue'?rescueKey(model.rescues[selected.index],d):model.atHydrant?'refill':'approachHydrant';
    return {kind:selected.kind,key:'fire.guide.'+key,distance:d,targetIndex:selected.index,progress:selected.kind==='hydrant'&&model.atHydrant?model.water/model.maxWater:0};
  }
  return {kind:'fire',key:'fire.guide.select',distance:0,progress:0};
}
