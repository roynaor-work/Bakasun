import {fireScenario} from './fire-campaign.mjs?v=island-naval-aim-20261028-1';
import {createFireNavigation,fireGuidance} from './fire-assistance.mjs?v=island-naval-aim-20261028-1';
import {followFireCamera} from './fire-navigation.mjs?v=island-naval-aim-20261028-1';
import {createFireLadder} from './fire-ladder.mjs?v=island-naval-aim-20261028-1';
import {fireCertificate} from '../activity/fire-certificates.mjs?v=island-naval-aim-20261028-1';
import {runFireSession} from './fire-session.mjs?v=island-naval-aim-20261028-1';
import {createFireDriver} from './fire-roads.mjs?v=island-naval-aim-20261028-1';
import {drawFireCity} from './fire-canvas.mjs?v=island-naval-aim-20261028-1';
import {createFireView} from './fire-view.mjs?v=island-naval-aim-20261028-1';
export function fireHydrantDistance(truck,balance){return Math.min(...(balance.city?.hydrants||[balance.hydrant.position]).map(p=>Math.hypot(truck.x-p[0],truck.z-p[2])));}
const EMPTY=Object.freeze({});
export function createFireEntity(site,type,active,heat,index){return {x:site.x,y:site.y,kind:site.kind,type,active,heat,phase:index*1.7,spreadAge:0,warning:0,coolingAge:0,damaged:false,reignitions:0};}
export function createFireModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY,sound=()=>{}}) {
  balance=fireScenario(balance,level);
  const settings=balance.levels[level-1],flames=[];
  const maxWater=(settings.water+(bonuses.fireWater||0))*power*(equipment.tank||1),maxPressure=balance.initialPressure*(equipment.pressure||1),range=balance.range*(equipment.range||1),aimRadius=balance.aimRadius*(equipment.range||1);
  let water=maxWater,pressure=maxPressure,remaining=settings.seconds+(bonuses.fireTime||0)+balance.startGrace,score=0,out=0,result,reserve=settings.refillWater,time=0,charge=0,eruption=settings.eruptionSeconds,pressureEmpty=false;
  let connection=0,waterUsed=0,waterWasted=0,fireDoneAt=null;
  const timeTarget=Math.max(1,remaining-settings.parSeconds),waterTarget=Math.max(1,water+reserve-settings.parWater),aim={x:config.width/2,y:config.height/2},impact={x:aim.x,y:aim.y};
  const vehicle=balance.vehicle,truck={x:vehicle.x,z:vehicle.z,targetX:vehicle.x,targetZ:vehicle.z},nozzle={x:balance.nozzleX,y:balance.nozzleY};
  const driver=createFireDriver(truck,balance),camera={x:truck.x,z:truck.z},firefighter={state:'seated',progress:0,x:truck.x,z:truck.z,visible:false},hose={connected:false,start:null,end:null};
  const rescues=balance.rescueSites.slice(0,settings.rescueCount).map(site=>({...balance.rescue,...site,rescued:false,expired:false,remaining:site.timeoutSeconds??balance.rescue.timeoutSeconds,progress:0,lastRescueAt:-100,descent:0,feedback:0,walkX:site.x,walkY:site.y})),rescue=rescues[0],crew=balance.crew,extraHose=equipment.hose||0,status={seconds:0,reserve:0,out:0,total:settings.flames,rescued:0};
  for(let i=0;i<settings.flames+settings.spreadCount;i++)flames.push(createFireEntity(balance.sites[i],i%settings.fireKinds,i<settings.flames,i<settings.flames?balance.initialHeatBase+random()*balance.initialHeatRange:0,i));
  const ladderControl=createFireLadder(settings,rescues,flames,balance);
  const navigator=createFireNavigation({balance,truck,flames,rescues,roads:driver.roads}),requiredRescues=settings.mission?.requiredRescues||0;
  function activeCount(){let n=0;for(const f of flames)if(f.active)n++;return n;}
  const model={balance,navigation:navigator.state,get selectedObjective(){return navigator.selected;},cancelNavigation(){navigator.cancel();},get guidance(){return fireGuidance(model,balance,navigator);},coolingTarget:null,coolingPower:0,get requiredRescues(){return requiredRescues;},get canFinish(){return fireDoneAt!==null&&rescues.filter(r=>r.rescued).length>=requiredRescues;},ladder:ladderControl.state,settings,flames,aim,impact,truck,camera,nozzle,firefighter,hose,roads:driver.roads,rescue,rescues,maxWater,maxPressure,range,aimRadius,extraHose,equipment,get rescueProgress(){return rescue?.progress||0;},statusId:'minigame.fireStatus',atHydrant:false,inRange:true,spraying:false,refilling:false,charging:false,rescuing:false,
    get graceRemaining(){return Math.max(0,balance.startGrace-time);},get connection(){return connection;},get firesOut(){return fireDoneAt!==null;},
    get hintId(){if(model.atHydrant&&connection<balance.hydrant.connectSeconds)return 'fire.connecting';if(model.rescuing){const r=rescues.find(r=>!r.rescued&&!r.expired&&Math.hypot(aim.x-r.x,aim.y-r.y)<=r.radius);if(r&&!r.near)return 'fire.driveToRescue';if(r&&!r.safe)return 'fire.rescueBlocked';}return model.spraying&&!model.inRange?'minigame.tooFar':null;},get hintCount(){return model.hintId?1:0;},
    get warningIds(){return [water<=0?'minigame.noWater':water/maxWater<=balance.hydrant.lowWaterRatio?'minigame.lowWater':null,pressureEmpty?'minigame.noPressure':null].filter(Boolean);},get warningId(){return water<=0?'minigame.noWater':pressureEmpty?'minigame.noPressure':water/maxWater<=balance.hydrant.lowWaterRatio?'minigame.lowWater':null;},get pressureEmpty(){return pressureEmpty;},get score(){return score;},get lives(){return Math.ceil(remaining);},get wave(){return 1;},get result(){return result;},get water(){return water;},get pressure(){return pressure;},get remaining(){return remaining;},get reserve(){return reserve;},get time(){return time;},get charge(){return charge;},
    statusValues(){status.seconds=Math.ceil(remaining);status.reserve=Math.floor(reserve);status.out=out;status.total=activeCount();status.rescued=0;for(const r of rescues)status.rescued+=Number(r.rescued);return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;remaining=Math.max(0,remaining-dt);
      const stabilizing=ladderControl.prepare(dt,time,input,truck);
      const steering=navigator.update({...input,stabilizing});
      const moveStep=driver.update(dt,stabilizing?{...steering,moveX:0,moveZ:0,truckX:undefined,truckZ:undefined}:steering);
      followFireCamera(camera,truck,balance,dt);
      const nearby=flames.some(f=>f.active&&f.heat>0&&Math.hypot(f.x-nozzle.x,f.y-nozzle.y)*balance.render.worldScale<=balance.city.parkRadius)||rescues.some(r=>!r.rescued&&!r.expired&&Math.hypot(truck.x-r.world[0],truck.z-r.world[2])<=balance.rescue.truckRadius);
      if(truck.driving){firefighter.state='seated';firefighter.progress=0;firefighter.visible=false;}
      else if(input.firing||input.rescue||nearby||fireHydrantDistance(truck,balance)<=balance.hydrant.radius){firefighter.progress=Math.min(1,firefighter.progress+dt/balance.city.exitSeconds);firefighter.state=firefighter.progress<1?'exiting':'working';firefighter.visible=true;}
      else{firefighter.state='seated';firefighter.progress=0;firefighter.visible=false;}
      firefighter.x=truck.x+Math.cos(truck.yaw)*balance.city.crewDistance*firefighter.progress;
      firefighter.z=truck.z-Math.sin(truck.yaw)*balance.city.crewDistance*firefighter.progress;
      hose.connected=firefighter.visible&&!truck.driving;
      hose.start={x:truck.x,y:balance.city.hoseHeight,z:truck.z};hose.end={x:firefighter.x,y:balance.city.hoseHeight,z:firefighter.z};
      model.atHydrant=!truck.driving&&fireHydrantDistance(truck,balance)<=balance.hydrant.radius&&moveStep/dt<=balance.hydrant.parkedSpeed;
      connection=model.atHydrant?Math.min(balance.hydrant.connectSeconds,connection+dt):0;
      nozzle.x=balance.nozzleX+(truck.x-vehicle.x)/balance.render.worldScale;nozzle.y=balance.nozzleY+(truck.z-vehicle.z)/balance.render.worldScale;
      if(Number.isFinite(input.x))aim.x=input.x;if(Number.isFinite(input.y))aim.y=input.y;
      if(input.rescue&&model.ladder.target){aim.x=model.ladder.target.x;aim.y=model.ladder.target.y;}
      if((input.navigate||input.select)&&navigator.selected){const selected=navigator.objective(navigator.selected.kind,navigator.selected.index);if(selected){aim.x=selected.x;aim.y=selected.y;}}
      model.coolingTarget=null;model.coolingPower=0;
      const dx=aim.x+Math.sin(time*1.6)*settings.wind-nozzle.x,dy=aim.y-nozzle.y,distance=Math.hypot(dx,dy),ratio=distance>range?range/distance:1;
      model.inRange=distance<=range;
      impact.x=nozzle.x+dx*ratio;impact.y=nozzle.y+dy*ratio;
      model.charging=Boolean(input.charge);model.refilling=Boolean(model.atHydrant&&connection>=balance.hydrant.connectSeconds&&!input.firing);
      model.rescuing=Boolean(input.rescue&&!input.refill&&!input.charge&&!truck.driving);
      model.spraying=Boolean(input.firing&&!input.rescue&&!input.refill&&!input.charge&&!truck.driving&&water>0&&!pressureEmpty);
      if(model.charging){charge=Math.min(1,charge+dt/balance.chargeSeconds);pressure=Math.min(maxPressure,pressure+balance.pressureRefillPerSecond*dt);if(pressure>=balance.pressureRestart)pressureEmpty=false;}
      if(model.spraying){const use=Math.min(water,balance.waterUsePerSecond*(1+extraHose*crew.secondWaterUse)*dt);waterUsed+=use;const cooling=flames.some(f=>f.active&&f.heat>0&&!f.warning&&Math.hypot(f.x-nozzle.x,f.y-nozzle.y)<=range&&Math.hypot(f.x-impact.x,f.y-impact.y)<=aimRadius);if(!cooling)waterWasted+=use;water=Math.max(0,water-balance.waterUsePerSecond*(1+extraHose*crew.secondWaterUse)*dt);pressure=Math.max(0,pressure-balance.pressureUsePerSecond*dt);if(pressure===0)pressureEmpty=true;sound('spray');}
      else{if(model.refilling){const refill=Math.min(maxWater-water,balance.waterRefillPerSecond*(equipment.tank||1)*dt);water+=refill;if(refill>0)sound('refill');}}
      const boost=1+balance.chargeBoost*charge;
      if(model.spraying)charge=Math.max(0,charge-dt/balance.chargeSeconds);
      if(time>=balance.startGrace&&fireDoneAt===null)eruption-=dt;if(eruption<=0){const candidates=flames.filter(f=>!f.active);if(candidates.length){const target=candidates[Math.floor(random()*candidates.length)];target.active=true;target.warning=balance.eruptionWarningSeconds;}eruption=settings.eruptionSeconds;}
      let bestCoolingDistance=Infinity;
      for(const f of flames){
        if(f.warning>0){f.warning=Math.max(0,f.warning-dt);if(f.warning===0){f.heat=balance.initialHeatBase;sound('crackle');}continue;}
        if(f.heat<=0)continue;sound('crackle');
        const type=balance.fireTypes[f.type];
        const cooling=model.spraying&&Math.hypot(f.x-nozzle.x,f.y-nozzle.y)<=range&&Math.hypot(f.x-impact.x,f.y-impact.y)<=aimRadius;
        if(cooling){const proximity=Math.hypot(f.x-impact.x,f.y-impact.y)/aimRadius,reach=Math.hypot(f.x-nozzle.x,f.y-nozzle.y)/range,accuracy=(1-proximity*.3)*(1-reach*.18);f.damaged=true;f.coolingAge=0;f.heat-=balance.extinguishPerSecond*pressure*power*boost*accuracy*(1+extraHose*crew.secondPower)/type.resistance/(settings.resistance||1)*dt;if(proximity<bestCoolingDistance){bestCoolingDistance=proximity;model.coolingTarget=flames.indexOf(f);model.coolingPower=Math.min(1,pressure/maxPressure*accuracy);}}
        else if(time>=balance.startGrace&&fireDoneAt===null){f.heat=Math.min(1,f.heat+settings.growthPerSecond*type.growth*dt);f.spreadAge+=dt*type.growth;
          if(f.damaged&&settings.reigniteSeconds){f.coolingAge+=dt;if(f.coolingAge>=settings.reigniteSeconds){f.heat=Math.max(f.heat,balance.initialHeatBase);f.damaged=false;f.reignitions++;sound('crackle');}}}
        if(f.heat<=0){f.heat=0;f.damaged=false;sound('steam');out++;score+=settings.points;continue;}
        if(time>=balance.startGrace&&fireDoneAt===null&&settings.spreadSeconds&&f.spreadAge>=settings.spreadSeconds){
          let target=null,nearest=Infinity;
          for(const other of flames)if(!other.active){const d=Math.hypot(f.x-other.x,f.y-other.y);if(d<nearest){target=other;nearest=d;}}
          if(target){target.active=true;target.warning=balance.eruptionWarningSeconds;f.spreadAge=0;}
        }
      }
      for(const r of rescues){
        r.feedback=Math.max(0,r.feedback-dt);
        if(!r.rescued&&!r.expired){
          // Rescue uses the reticle, independently of hose range, water or pressure.
          const near=!truck.driving&&Math.hypot(truck.x-r.world[0],truck.z-r.world[2])<=balance.rescue.truckRadius,safe=flames[r.fireIndex]?.heat<=balance.rescue.safeHeat;
          r.near=near;r.safe=safe&&ladderControl.allowed(r);
          if(model.rescuing&&near&&safe&&ladderControl.allowed(r)&&model.ladder.target===r){
            if(r.progress===0)sound('ladder');r.lastRescueAt=time;r.progress=Math.min(r.seconds,r.progress+dt);
            if(r.progress>=r.seconds){r.rescued=true;r.feedback=r.feedbackSeconds;score+=r.points;reserve+=r.waterReward;sound('rescue');}
          }else if(truck.driving||!near||!safe)r.progress=0;else if(time-r.lastRescueAt>.35)r.progress=Math.max(0,r.progress-dt*2);
          if(!r.rescued){r.remaining=Math.max(0,r.remaining-dt);if(r.remaining===0){r.expired=true;r.progress=0;r.feedback=r.feedbackSeconds;sound('timeout');}}
        }
        if(r.rescued){r.descent=Math.min(1,r.descent+dt/r.descentSeconds);const dx=crew.truckX-r.walkX,dy=crew.truckY-r.walkY,d=Math.hypot(dx,dy);if(d>3){const step=Math.min(d,crew.rescueWalkSpeed*dt);r.walkX+=dx/d*step;r.walkY+=dy/d*step;}}
      }
      ladderControl.finish(dt,model,sound);
      if(out===activeCount()&&fireDoneAt===null)fireDoneAt=time;
      const pending=rescues.some(r=>!r.expired&&(!r.rescued||r.descent<1));
      const rescuedCount=rescues.filter(r=>r.rescued).length,requiredLost=rescuedCount+rescues.filter(r=>!r.rescued&&!r.expired).length<requiredRescues;
      if(requiredLost)result={outcome:'lose',score,reason:'rescue'};
      else if(model.canFinish&&(!pending||input.finish||remaining<=0))result={outcome:'win',score,performance:.6*Math.min(1,remaining/timeTarget)+.4*Math.min(1,(water+reserve)/waterTarget)};
      else if(remaining<=0)result={outcome:'lose',score};
      if(result)result.certificate=fireCertificate({won:result.outcome==='win',time:(fireDoneAt??time)-balance.startGrace,seconds:settings.seconds,rescued:rescues.some(r=>r.rescued),wasted:waterWasted,used:waterUsed},balance.certificate);
      if(result)result.summary={out,rescued:rescues.filter(r=>r.rescued).length,water:Math.floor(water)};
    },
    snapshot(){return {navigation:{...navigator.state,target:navigator.state.target?{...navigator.state.target}:null,path:navigator.state.path.map(p=>({...p}))},selectedObjective:navigator.selected?{...navigator.selected}:null,guidance:{...model.guidance},coolingTarget:model.coolingTarget,coolingPower:model.coolingPower,requiredRescues,canFinish:model.canFinish,camera:{...camera},ladder:{...model.ladder,target:model.ladder.target?{...model.ladder.target,world:[...model.ladder.target.world]}:null,targets:model.ladder.targets.map(r=>({...r,world:[...r.world]}))},refilling:model.refilling,graceRemaining:model.graceRemaining,connection,firesOut:model.firesOut,hintId:model.hintId,hintCount:model.hintCount,waterUsed,waterWasted,atHydrant:model.atHydrant,inRange:model.inRange,hydrantDistance:fireHydrantDistance(truck,balance),firefighter:{...firefighter},roads:{nodes:driver.roads.nodes.map(n=>({x:n.x,z:n.z})),edges:driver.roads.edges.map(e=>({a:{x:e.a.x,z:e.a.z},b:{x:e.b.x,z:e.b.z}}))},hose:{start:{...nozzle},truck:{...truck},connected:hose.connected,worldStart:{...hose.start},worldEnd:{...hose.end}},maxWater,maxPressure,warningId:model.warningId,pressureEmpty,score,result,extraHose,equipment:{...equipment},water,pressure,remaining,reserve,time,charge,range,truck:{...truck},nozzle:{...nozzle},rescueProgress:model.rescueProgress,rescues:rescues.map(r=>({...r,world:[...r.world]})),rescue:rescue?{...rescue,world:[...rescue.world]}:null,flames:flames.map(f=>({...f})),aim:{...aim},impact:{...impact},spraying:model.spraying,rescuing:model.rescuing};}
  };return model;
}
export function drawFire(p,m,ctx) {if(!ctx.view?.draw(p))drawFireCity(p,m,ctx);}
export function startFire(ctx){return runFireSession({...ctx,balance:fireScenario(ctx.balance,ctx.level),finish:raw=>{ctx.onFireSummary?.(raw.summary);return ctx.finish(raw);}},createFireModel,drawFire,createFireView);}
