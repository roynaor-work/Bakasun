import {runCanvasGame} from './canvas-session.mjs?v=g3f-20261018-1';
import {oval,drawCrew} from './art.mjs?v=g3f-20261018-1';
import {createFireView} from './fire-view.mjs?v=g3f-20261018-1';
export function fireHydrantDistance(truck,balance){return Math.hypot(truck.x-balance.hydrant.position[0],truck.z-balance.hydrant.position[2]);}
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createFireEntity(site,type,active,heat,index){return {x:site.x,y:site.y,kind:site.kind,type,active,heat,phase:index*1.7,spreadAge:0,warning:0};}
export function createFireModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY,sound=()=>{}}) {
  const settings=balance.levels[level-1],flames=[];
  const maxWater=(settings.water+(bonuses.fireWater||0))*power*(equipment.tank||1),maxPressure=balance.initialPressure*(equipment.pressure||1),range=balance.range*(equipment.range||1),aimRadius=balance.aimRadius*(equipment.range||1);
  let water=maxWater,pressure=maxPressure,remaining=settings.seconds+(bonuses.fireTime||0),score=0,out=0,result,reserve=settings.refillWater,time=0,charge=0,eruption=settings.eruptionSeconds,pressureEmpty=false;
  const timeTarget=Math.max(1,remaining-settings.parSeconds),waterTarget=Math.max(1,water+reserve-settings.parWater),aim={x:config.width/2,y:config.height/2},impact={x:aim.x,y:aim.y};
  const vehicle=balance.vehicle,truck={x:vehicle.x,z:vehicle.z,targetX:vehicle.x,targetZ:vehicle.z},nozzle={x:balance.nozzleX,y:balance.nozzleY};
  const rescues=balance.rescueSites.slice(0,settings.rescueCount).map(site=>({...balance.rescue,...site,rescued:false,expired:false,remaining:balance.rescue.timeoutSeconds,progress:0,descent:0,feedback:0,walkX:site.x,walkY:site.y})),rescue=rescues[0],crew=balance.crew,extraHose=equipment.hose||0,status={seconds:0,reserve:0,out:0,total:settings.flames,rescued:0};
  for(let i=0;i<settings.flames+settings.spreadCount;i++)flames.push(createFireEntity(balance.sites[i],i%settings.fireKinds,i<settings.flames,i<settings.flames?balance.initialHeatBase+random()*balance.initialHeatRange:0,i));
  function activeCount(){let n=0;for(const f of flames)if(f.active)n++;return n;}
  const model={settings,flames,aim,impact,truck,nozzle,rescue,rescues,maxWater,maxPressure,range,aimRadius,extraHose,equipment,get rescueProgress(){return rescue?.progress||0;},statusId:'minigame.fireStatus',atHydrant:false,inRange:true,spraying:false,refilling:false,charging:false,rescuing:false,
    get warningIds(){return [water<=0?'minigame.noWater':water/maxWater<=balance.hydrant.lowWaterRatio?'minigame.lowWater':null,pressureEmpty?'minigame.noPressure':null].filter(Boolean);},get warningId(){return water<=0?'minigame.noWater':pressureEmpty?'minigame.noPressure':water/maxWater<=balance.hydrant.lowWaterRatio?'minigame.lowWater':null;},get pressureEmpty(){return pressureEmpty;},get score(){return score;},get lives(){return Math.ceil(remaining);},get wave(){return 1;},get result(){return result;},get water(){return water;},get pressure(){return pressure;},get remaining(){return remaining;},get reserve(){return reserve;},get time(){return time;},get charge(){return charge;},
    statusValues(){status.seconds=Math.ceil(remaining);status.reserve=Math.floor(reserve);status.out=out;status.total=activeCount();status.rescued=0;for(const r of rescues)status.rescued+=Number(r.rescued);return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;remaining=Math.max(0,remaining-dt);
      if(Number.isFinite(input.truckX))truck.targetX=Math.max(vehicle.minX,Math.min(vehicle.maxX,input.truckX));
      if(Number.isFinite(input.truckZ))truck.targetZ=Math.max(vehicle.minZ,Math.min(vehicle.maxZ,input.truckZ));
      if(input.left||input.right)truck.targetX=Math.max(vehicle.minX,Math.min(vehicle.maxX,truck.x+(Number(Boolean(input.right))-Number(Boolean(input.left)))*vehicle.speed*dt));
      const moveX=truck.targetX-truck.x,moveZ=truck.targetZ-truck.z,moveDistance=Math.hypot(moveX,moveZ),moveStep=Math.min(moveDistance,vehicle.speed*dt);
      if(moveDistance>0){truck.x+=moveX/moveDistance*moveStep;truck.z+=moveZ/moveDistance*moveStep;}
      model.atHydrant=fireHydrantDistance(truck,balance)<=balance.hydrant.radius&&moveStep/dt<=balance.hydrant.parkedSpeed;
      nozzle.x=balance.nozzleX+(truck.x-vehicle.x)/balance.render.worldScale;nozzle.y=balance.nozzleY+(truck.z-vehicle.z)/balance.render.worldScale;
      if(Number.isFinite(input.x))aim.x=input.x;if(Number.isFinite(input.y))aim.y=input.y;
      const dx=aim.x+Math.sin(time*1.6)*settings.wind-nozzle.x,dy=aim.y-nozzle.y,distance=Math.hypot(dx,dy),ratio=distance>range?range/distance:1;
      model.inRange=distance<=range;
      impact.x=nozzle.x+dx*ratio;impact.y=nozzle.y+dy*ratio;
      model.charging=Boolean(input.charge);model.refilling=Boolean(model.atHydrant&&!input.firing);
      model.rescuing=Boolean(input.rescue&&!input.refill&&!input.charge);
      model.spraying=Boolean(input.firing&&!input.rescue&&!input.refill&&!input.charge&&water>0&&!pressureEmpty);
      if(model.charging){charge=Math.min(1,charge+dt/balance.chargeSeconds);pressure=Math.min(maxPressure,pressure+balance.pressureRefillPerSecond*dt);if(pressure>=balance.pressureRestart)pressureEmpty=false;sound('refill');}
      if(model.spraying){water=Math.max(0,water-balance.waterUsePerSecond*(1+extraHose*crew.secondWaterUse)*dt);pressure=Math.max(0,pressure-balance.pressureUsePerSecond*dt);if(pressure===0)pressureEmpty=true;sound('spray');}
      else{if(model.refilling){const refill=Math.min(maxWater-water,balance.waterRefillPerSecond*(equipment.tank||1)*dt);water+=refill;if(refill>0)sound('refill');}}
      const boost=1+balance.chargeBoost*charge;
      if(model.spraying)charge=Math.max(0,charge-dt/balance.chargeSeconds);
      eruption-=dt;if(eruption<=0){const candidates=flames.filter(f=>!f.active);if(candidates.length){const target=candidates[Math.floor(random()*candidates.length)];target.active=true;target.warning=balance.eruptionWarningSeconds;}eruption=settings.eruptionSeconds;}
      for(const f of flames){
        if(f.warning>0){f.warning=Math.max(0,f.warning-dt);if(f.warning===0){f.heat=balance.initialHeatBase;sound('crackle');}continue;}
        if(f.heat<=0)continue;sound('crackle');
        const type=balance.fireTypes[f.type];
        if(model.spraying&&Math.hypot(f.x-nozzle.x,f.y-nozzle.y)<=range&&Math.hypot(f.x-impact.x,f.y-impact.y)<=aimRadius)f.heat-=balance.extinguishPerSecond*pressure*power*boost*(1+extraHose*crew.secondPower)/type.resistance/(settings.resistance||1)*dt;
        else{f.heat=Math.min(1,f.heat+settings.growthPerSecond*type.growth*dt);f.spreadAge+=dt*type.growth;}
        if(f.heat<=0){f.heat=0;out++;score+=settings.points;continue;}
        if(settings.spreadSeconds&&f.spreadAge>=settings.spreadSeconds){
          let target=null,nearest=Infinity;
          for(const other of flames)if(!other.active){const d=Math.hypot(f.x-other.x,f.y-other.y);if(d<nearest){target=other;nearest=d;}}
          if(target){target.active=true;target.warning=balance.eruptionWarningSeconds;f.spreadAge=0;}
        }
      }
      for(const r of rescues){
        r.feedback=Math.max(0,r.feedback-dt);
        if(!r.rescued&&!r.expired){
          // Rescue uses the reticle, independently of hose range, water or pressure.
          if(model.rescuing&&Math.hypot(aim.x-r.x,aim.y-r.y)<=r.radius){
            if(r.progress===0)sound('ladder');r.progress=Math.min(r.seconds,r.progress+dt);
            if(r.progress>=r.seconds){r.rescued=true;r.feedback=r.feedbackSeconds;score+=r.points;reserve+=r.waterReward;sound('rescue');}
          }else r.progress=0;
          if(!r.rescued){r.remaining=Math.max(0,r.remaining-dt);if(r.remaining===0){r.expired=true;r.progress=0;r.feedback=r.feedbackSeconds;sound('timeout');}}
        }
        if(r.rescued){r.descent=Math.min(1,r.descent+dt/r.descentSeconds);const dx=crew.truckX-r.walkX,dy=crew.truckY-r.walkY,d=Math.hypot(dx,dy);if(d>3){const step=Math.min(d,crew.rescueWalkSpeed*dt);r.walkX+=dx/d*step;r.walkY+=dy/d*step;}}
      }
      if(out===activeCount())result={outcome:'win',score,performance:.6*Math.min(1,remaining/timeTarget)+.4*Math.min(1,(water+reserve)/waterTarget)};
      else if(remaining<=0)result={outcome:'lose',score};
      if(result)result.summary={out,rescued:rescues.filter(r=>r.rescued).length,water:Math.floor(water)};
    },
    snapshot(){return {atHydrant:model.atHydrant,inRange:model.inRange,hydrantDistance:fireHydrantDistance(truck,balance),hose:{start:{...nozzle},truck:{...truck}},maxWater,maxPressure,warningId:model.warningId,pressureEmpty,score,result,extraHose,equipment:{...equipment},water,pressure,remaining,reserve,time,charge,range,truck:{...truck},nozzle:{...nozzle},rescueProgress:model.rescueProgress,rescues:rescues.map(r=>({...r})),rescue:rescue?{...rescue}:null,flames:flames.map(f=>({...f})),aim:{...aim},impact:{...impact},spraying:model.spraying,rescuing:model.rescuing};}
  };return model;
}
export function drawFire(p,m,{config,balance,art,quality,view,t}) {
  if(view?.draw(p))return;
  const palette=config.visuals.palette,crew=balance.crew,truckX=crew.truckX+(m.truck.x-balance.vehicle.x)/balance.render.worldScale,truckY=crew.truckY+(m.truck.z-balance.vehicle.z)/balance.render.worldScale;
  const v=config.visuals,a=config.art;p.drawImage(art.backdrop,0,0);
  const puffs=quality.low?1:v.smokePuffs;
  for(const f of m.flames){
    if(!f.active)continue;
    if(f.warning>0){p.globalAlpha=.35+.65*Math.abs(Math.sin(m.time*18));p.strokeStyle=palette.embers;p.lineWidth=5;p.beginPath();p.arc(f.x,f.y,26,0,TAU);p.stroke();p.globalAlpha=1;continue;}
    if(f.heat<=0){oval(p,f.x,f.y,14,5,palette.cooled);continue;}
    for(let i=0;i<puffs;i++){const t=(m.time*.36+i/puffs+f.phase)%1;p.globalAlpha=(1-t)*.27;oval(p,f.x+Math.sin(t*4+f.phase)*14,f.y-25-t*61,8+t*18,7+t*16,v.smoke);}p.globalAlpha=1;
    const height=a.flameHeight*(.6+f.heat*.5),color=balance.fireTypes[f.type].color;
    for(let i=0;i<v.flameLobes;i++){
      const x=f.x+(i-1)*11,sway=Math.sin(m.time*8+f.phase+i)*8,top=f.y-height*(.8+(i%2)*.35);
      p.fillStyle=color;p.beginPath();p.moveTo(x-13,f.y+8);p.bezierCurveTo(x-24,f.y-8,x+sway-5,top+18,x+sway,top);p.bezierCurveTo(x+sway+3,top+25,x+24,f.y-9,x+13,f.y+8);p.fill();
      p.fillStyle=v.flameCore;p.beginPath();p.moveTo(x-7,f.y+6);p.quadraticCurveTo(x-12,f.y-9,x+sway*.6,f.y-height*.55);p.quadraticCurveTo(x+12,f.y-5,x+7,f.y+6);p.fill();
    }
    const sparks=quality.low?v.sparksLow:v.sparksHigh;for(let i=0;i<sparks;i++){const t=(m.time*.7+i/3+f.phase)%1;oval(p,f.x+Math.sin(i*3+f.phase)*18,f.y-15-t*65,2*(1-t),3*(1-t),palette.embers);}
  }
  for(const r of m.rescues){
  if(r.expired){if(r.feedback>0){p.globalAlpha=r.feedback/r.feedbackSeconds;oval(p,r.x,r.y,25,30,config.visuals.smoke);p.globalAlpha=1;}continue;}
  if(!r.rescued){drawCrew(p,r.x,r.y+12,m.time,config);p.strokeStyle=palette.rescueRing;p.lineWidth=3;p.beginPath();p.arc(r.x,r.y,24,-Math.PI/2,-Math.PI/2+TAU*Math.max(.05,r.progress/r.seconds));p.stroke();p.fillStyle=palette.white;p.font=config.visuals.hudFont;p.textAlign='center';p.fillText(t('minigame.rescueMarker'),r.x,r.y-34);p.fillRect(r.x-16,r.y-28,32*r.remaining/r.timeoutSeconds,4);}
  else drawCrew(p,r.walkX,r.walkY+12,m.time,config,false,Math.hypot(r.walkX-truckX,r.walkY-truckY)>4);
  if(r.progress>0||r.rescued&&r.descent<1){p.strokeStyle=palette.ivory;p.lineWidth=6;p.beginPath();p.moveTo(truckX,truckY-40);p.lineTo(r.x,r.y);p.stroke();}
  if(r.rescued&&r.feedback>0){p.fillStyle=palette.rescueBadge;p.fillText(t('minigame.rescueHeart'),r.walkX,r.walkY-26);}
  }
  p.drawImage(art.truck,truckX-90,truckY-58,180,100);
  if((m.equipment.tank||1)>1){p.fillStyle=palette.cabinGlass;p.fillRect(truckX-53,truckY-26,38,14);}
  if((m.equipment.range||1)>1){p.strokeStyle=palette.ivory;p.lineWidth=3;p.beginPath();p.moveTo(truckX-60,truckY-43);p.lineTo(truckX+2,truckY-65);p.stroke();}
  for(let i=0;i<=Number(m.extraHose>0);i++){
    const x=m.nozzle.x+i*31,y=m.nozzle.y;
    p.strokeStyle=palette.cannon;p.lineWidth=10;p.beginPath();p.moveTo(truckX+8,truckY+7);p.bezierCurveTo(truckX+8,config.height-4,x-48,config.height+5,x,y);p.stroke();
    p.strokeStyle=crew.hoseColor;p.lineWidth=6;p.stroke();
    drawCrew(p,x-6,y+22,m.time,config,true,false,Math.atan2(m.impact.y-y,m.impact.x-x));
  }
  if(m.spraying){
    const x=m.impact.x,y=m.impact.y,nx=m.nozzle.x,ny=m.nozzle.y,cy=Math.min(y,ny)-v.waterArcRise;
    p.lineCap='round';p.strokeStyle=palette.streamSpray;p.lineWidth=a.waterLineWidth*m.pressure*(1+m.charge*v.chargeWidthBoost);p.beginPath();p.moveTo(nx,ny);p.quadraticCurveTo((nx+x)/2,cy,x,y);p.stroke();
    p.strokeStyle=palette.eyeGlass;p.lineWidth=3;p.beginPath();p.moveTo(nx,ny);p.quadraticCurveTo((nx+x)/2,cy,x,y);p.stroke();
    const drops=quality.low?4:v.waterDrops;for(let i=0;i<drops;i++){const t=(m.time*2+i/drops)%1,u=1-t;oval(p,u*u*nx+2*u*t*(nx+x)/2+t*t*x,u*u*ny+2*u*t*cy+t*t*y,2,3,palette.pearl);}
    for(let i=0;i<drops;i++){const t=(m.time*3+i/drops)%1,angle=i*2.4;oval(p,x+Math.cos(angle)*t*28,y+Math.sin(angle)*t*17+t*t*9,2*(1-t),3*(1-t),palette.streamSpray);}
  }
  p.save();p.translate(m.nozzle.x,m.nozzle.y);p.rotate(Math.atan2(m.impact.y-m.nozzle.y,m.impact.x-m.nozzle.x));p.fillStyle=palette.nozzle;p.fillRect(-13,-8,24,16);p.fillStyle=palette.nozzleEdge;p.fillRect(8,-10,10,20);p.restore();
  if(m.extraHose>0&&m.spraying){p.strokeStyle=palette.streamSpray;p.lineWidth=5;p.beginPath();p.moveTo(m.nozzle.x+31,m.nozzle.y);p.quadraticCurveTo(m.nozzle.x+60,Math.min(m.impact.y,m.nozzle.y)-v.waterArcRise,m.impact.x+5,m.impact.y);p.stroke();}
  p.strokeStyle=palette.streamSpray;p.lineWidth=3;p.beginPath();p.arc(m.aim.x,m.aim.y,13,0,TAU);p.stroke();oval(p,m.aim.x,m.aim.y,3,3,palette.pearl);
  if((m.equipment.pressure||1)>1){oval(p,m.nozzle.x,m.nozzle.y,4,4,palette.gold);}
  if(m.charging){p.strokeStyle=palette.chargeGlow;p.lineWidth=4;p.beginPath();p.arc(m.nozzle.x,m.nozzle.y,26,-Math.PI/2,-Math.PI/2+TAU*m.charge);p.stroke();}
}
export function startFire(ctx){return runCanvasGame({...ctx,finish:raw=>{ctx.onFireSummary?.(raw.summary);return ctx.finish(raw);}},createFireModel,drawFire,createFireView);}
