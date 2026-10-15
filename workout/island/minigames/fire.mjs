import {runCanvasGame} from './canvas-session.mjs';
import {oval,drawCrew} from './art.mjs';
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createFireEntity(site,type,active,heat,index){return {x:site.x,y:site.y,kind:site.kind,type,active,heat,phase:index*1.7,spreadAge:0};}
export function createFireModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY}) {
  const settings=balance.levels[level-1],flames=[];
  const maxWater=(settings.water+(bonuses.fireWater||0))*power*(equipment.tank||1),maxPressure=balance.initialPressure*(equipment.pressure||1),range=balance.range*(equipment.range||1),aimRadius=balance.aimRadius*(equipment.range||1);
  let water=maxWater,pressure=maxPressure,remaining=settings.seconds+(bonuses.fireTime||0),score=0,out=0,result,reserve=settings.refillWater,time=0,charge=0;
  const timeTarget=Math.max(1,remaining-settings.parSeconds),waterTarget=Math.max(1,water+reserve-settings.parWater),aim={x:config.width/2,y:config.height/2},impact={x:aim.x,y:aim.y};
  const rescues=balance.rescueSites.slice(0,settings.rescueCount).map(site=>({...balance.rescue,...site,rescued:false,progress:0,walkX:site.x,walkY:site.y})),rescue=rescues[0],crew=balance.crew,extraHose=equipment.hose||0,status={seconds:0,reserve:0,out:0,total:settings.flames,rescued:0};
  for(let i=0;i<settings.flames+settings.spreadCount;i++)flames.push(createFireEntity(balance.sites[i],i%settings.fireKinds,i<settings.flames,i<settings.flames?balance.initialHeatBase+random()*balance.initialHeatRange:0,i));
  function activeCount(){let n=0;for(const f of flames)if(f.active)n++;return n;}
  const model={settings,flames,aim,impact,rescue,rescues,maxWater,maxPressure,range,aimRadius,extraHose,equipment,get rescueProgress(){return rescue.progress;},statusId:'minigame.fireStatus',spraying:false,refilling:false,charging:false,
    get score(){return score;},get lives(){return Math.ceil(remaining);},get wave(){return 1;},get result(){return result;},get water(){return water;},get pressure(){return pressure;},get remaining(){return remaining;},get reserve(){return reserve;},get time(){return time;},get charge(){return charge;},
    statusValues(){status.seconds=Math.ceil(remaining);status.reserve=Math.floor(reserve);status.out=out;status.total=activeCount();status.rescued=0;for(const r of rescues)status.rescued+=Number(r.rescued);return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;remaining=Math.max(0,remaining-dt);
      if(Number.isFinite(input.x))aim.x=input.x;if(Number.isFinite(input.y))aim.y=input.y;
      const dx=aim.x+Math.sin(time*1.6)*settings.wind-balance.nozzleX,dy=aim.y-balance.nozzleY,distance=Math.hypot(dx,dy),ratio=distance>range?range/distance:1;
      impact.x=balance.nozzleX+dx*ratio;impact.y=balance.nozzleY+dy*ratio;
      model.charging=Boolean(input.charge);model.refilling=Boolean(input.refill);
      model.spraying=Boolean(input.firing&&!input.refill&&!input.charge&&water>0);
      if(model.charging)charge=Math.min(1,charge+dt/balance.chargeSeconds);
      if(model.spraying){water=Math.max(0,water-balance.waterUsePerSecond*(1+extraHose*crew.secondWaterUse)*dt);pressure=Math.max(balance.minPressure,pressure-balance.pressureUsePerSecond*dt);}
      else{if(model.refilling){const refill=Math.min(maxWater-water,reserve,balance.waterRefillPerSecond*(equipment.tank||1)*dt);water+=refill;reserve-=refill;}pressure=Math.min(maxPressure,pressure+balance.pressureRefillPerSecond*dt);}
      const boost=1+balance.chargeBoost*charge;
      if(model.spraying)charge=Math.max(0,charge-dt/balance.chargeSeconds);
      for(const f of flames){
        if(f.heat<=0)continue;
        const type=balance.fireTypes[f.type];
        if(model.spraying&&Math.hypot(f.x-impact.x,f.y-impact.y)<=aimRadius)f.heat-=balance.extinguishPerSecond*pressure*power*boost*(1+extraHose*crew.secondPower)/type.resistance*dt;
        else{f.heat=Math.min(1,f.heat+settings.growthPerSecond*type.growth*dt);f.spreadAge+=dt*type.growth;}
        if(f.heat<=0){f.heat=0;out++;score+=settings.points;continue;}
        if(settings.spreadSeconds&&f.spreadAge>=settings.spreadSeconds){
          let target=null,nearest=Infinity;
          for(const other of flames)if(!other.active){const d=Math.hypot(f.x-other.x,f.y-other.y);if(d<nearest){target=other;nearest=d;}}
          if(target){target.active=true;target.heat=balance.initialHeatBase;f.spreadAge=0;}
        }
      }
      for(const r of rescues){
        if(!r.rescued&&model.spraying&&Math.hypot(impact.x-r.x,impact.y-r.y)<=r.radius){r.progress+=dt;if(r.progress>=r.seconds){r.rescued=true;score+=r.points;reserve+=r.waterReward;}}
        if(r.rescued){const dx=crew.truckX-r.walkX,dy=crew.truckY-r.walkY,d=Math.hypot(dx,dy);if(d>3){r.walkX+=dx/d*crew.rescueWalkSpeed*dt;r.walkY+=dy/d*crew.rescueWalkSpeed*dt;}}
      }
      if(out===activeCount())result={outcome:'win',score,performance:.6*Math.min(1,remaining/timeTarget)+.4*Math.min(1,(water+reserve)/waterTarget)};
      else if(remaining<=0)result={outcome:'lose',score};
    },
    snapshot(){return {score,result,extraHose,equipment:{...equipment},water,pressure,remaining,reserve,time,charge,range,rescueProgress:rescue.progress,rescues:rescues.map(r=>({...r})),rescue:{...rescue},flames:flames.map(f=>({...f})),aim:{...aim},impact:{...impact},spraying:model.spraying};}
  };return model;
}
export function drawFire(p,m,{config,balance,art,quality}) {
  const palette=config.visuals.palette;
  const v=config.visuals,a=config.art;p.drawImage(art.backdrop,0,0);
  const puffs=quality.low?1:v.smokePuffs;
  for(const f of m.flames){
    if(!f.active)continue;
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
  if(!r.rescued){drawCrew(p,r.x,r.y+12,m.time,config);p.strokeStyle=palette.rescueRing;p.lineWidth=3;p.beginPath();p.arc(r.x,r.y,24,-Math.PI/2,-Math.PI/2+TAU*Math.max(.05,r.progress/r.seconds));p.stroke();}
  else drawCrew(p,r.walkX,r.walkY+12,m.time,config,false,Math.hypot(r.walkX-balance.crew.truckX,r.walkY-balance.crew.truckY)>4);
  }
  const crew=balance.crew;
  p.drawImage(art.truck,crew.truckX-90,crew.truckY-58,180,100);
  if((m.equipment.tank||1)>1){p.fillStyle=palette.cabinGlass;p.fillRect(crew.truckX-53,crew.truckY-26,38,14);}
  if((m.equipment.range||1)>1){p.strokeStyle=palette.ivory;p.lineWidth=3;p.beginPath();p.moveTo(crew.truckX-60,crew.truckY-43);p.lineTo(crew.truckX+2,crew.truckY-65);p.stroke();}
  for(let i=0;i<=Number(m.extraHose>0);i++){
    const x=balance.nozzleX+i*31,y=balance.nozzleY;
    p.strokeStyle=palette.cannon;p.lineWidth=10;p.beginPath();p.moveTo(crew.truckX+8,crew.truckY+7);p.bezierCurveTo(crew.truckX+8,config.height-4,x-48,config.height+5,x,y);p.stroke();
    p.strokeStyle=crew.hoseColor;p.lineWidth=6;p.stroke();
    drawCrew(p,x-6,y+22,m.time,config,true,false,Math.atan2(m.impact.y-y,m.impact.x-x));
  }
  if(m.spraying){
    const x=m.impact.x,y=m.impact.y,nx=balance.nozzleX,ny=balance.nozzleY,cy=Math.min(y,ny)-v.waterArcRise;
    p.lineCap='round';p.strokeStyle=palette.streamSpray;p.lineWidth=a.waterLineWidth*m.pressure*(1+m.charge*v.chargeWidthBoost);p.beginPath();p.moveTo(nx,ny);p.quadraticCurveTo((nx+x)/2,cy,x,y);p.stroke();
    p.strokeStyle=palette.eyeGlass;p.lineWidth=3;p.beginPath();p.moveTo(nx,ny);p.quadraticCurveTo((nx+x)/2,cy,x,y);p.stroke();
    const drops=quality.low?4:v.waterDrops;for(let i=0;i<drops;i++){const t=(m.time*2+i/drops)%1,u=1-t;oval(p,u*u*nx+2*u*t*(nx+x)/2+t*t*x,u*u*ny+2*u*t*cy+t*t*y,2,3,palette.pearl);}
    for(let i=0;i<drops;i++){const t=(m.time*3+i/drops)%1,angle=i*2.4;oval(p,x+Math.cos(angle)*t*28,y+Math.sin(angle)*t*17+t*t*9,2*(1-t),3*(1-t),palette.streamSpray);}
  }
  p.save();p.translate(balance.nozzleX,balance.nozzleY);p.rotate(Math.atan2(m.impact.y-balance.nozzleY,m.impact.x-balance.nozzleX));p.fillStyle=palette.nozzle;p.fillRect(-13,-8,24,16);p.fillStyle=palette.nozzleEdge;p.fillRect(8,-10,10,20);p.restore();
  if(m.extraHose>0&&m.spraying){p.strokeStyle=palette.streamSpray;p.lineWidth=5;p.beginPath();p.moveTo(balance.nozzleX+31,balance.nozzleY);p.quadraticCurveTo(balance.nozzleX+60,Math.min(m.impact.y,balance.nozzleY)-v.waterArcRise,m.impact.x+5,m.impact.y);p.stroke();}
  if((m.equipment.pressure||1)>1){oval(p,balance.nozzleX,balance.nozzleY,4,4,palette.gold);}
  if(m.charging){p.strokeStyle=palette.chargeGlow;p.lineWidth=4;p.beginPath();p.arc(balance.nozzleX,balance.nozzleY,26,-Math.PI/2,-Math.PI/2+TAU*m.charge);p.stroke();}
}
export function startFire(ctx){return runCanvasGame(ctx,createFireModel,drawFire);}
