import {runCanvasGame} from './canvas-session.mjs';

export function createFireModel({config,balance,level,bonuses={},random,power=1}) {
  const settings=balance.levels[level-1],flames=[];
  let water=(settings.water+(bonuses.fireWater||0))*power,pressure=balance.initialPressure,remaining=settings.seconds+(bonuses.fireTime||0),score=0,out=0,result,spreadTime=0,reserve=settings.refillWater;
  const timeTarget=Math.max(1,settings.seconds+(bonuses.fireTime||0)-settings.parSeconds);
  const waterTarget=Math.max(1,water+settings.refillWater-settings.parWater);
  const maxWater=water,aim={x:config.width/2,y:config.height/2};
  for(let i=0;i<settings.flames+settings.spreadCount;i++)flames.push({x:balance.flameX+(i%balance.flameColumns)*balance.flameSpacingX+(random()-.5)*balance.flameJitter,y:balance.flameY+Math.floor(i/balance.flameColumns)*balance.flameSpacingY,active:i<settings.flames,heat:i<settings.flames?balance.initialHeatBase+random()*balance.initialHeatRange:0});
  const model={settings,flames,aim,maxWater,statusId:'minigame.fireStatus',get score(){return score;},get lives(){return Math.ceil(remaining);},get wave(){return 1;},get result(){return result;},get water(){return water;},get pressure(){return pressure;},get remaining(){return remaining;},get reserve(){return reserve;},spraying:false,
    statusValues(){return {seconds:Math.ceil(remaining),reserve:Math.floor(reserve),out,total:flames.filter(f=>f.active).length};},
    update(dt,input={}) {
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);remaining=Math.max(0,remaining-dt);
      if(Number.isFinite(input.x))aim.x=input.x;if(Number.isFinite(input.y))aim.y=input.y;
      model.spraying=Boolean(input.firing&&water>0);
      if(model.spraying){water=Math.max(0,water-balance.waterUsePerSecond*dt);pressure=Math.max(balance.minPressure,pressure-balance.pressureUsePerSecond*dt);}
      else{const refill=Math.min(maxWater-water,reserve,balance.waterRefillPerSecond*dt);water+=refill;reserve-=refill;pressure=Math.min(balance.initialPressure,pressure+balance.pressureRefillPerSecond*dt);}
      spreadTime+=dt;
      if(settings.spreadSeconds&&spreadTime>=settings.spreadSeconds){spreadTime=0;const target=flames.find(f=>!f.active);if(target&&flames.some(f=>f.heat>0)){target.active=true;target.heat=balance.initialHeatBase;}}
      for(const flame of flames) {
        if(flame.heat<=0)continue;
        if(model.spraying&&Math.hypot(flame.x-aim.x,flame.y-aim.y)<=balance.aimRadius)flame.heat-=balance.extinguishPerSecond*pressure*power*dt;
        else flame.heat=Math.min(1,flame.heat+settings.growthPerSecond*dt);
        if(flame.heat<=0){flame.heat=0;out++;score+=settings.points;}
      }
      if(out===flames.filter(f=>f.active).length)result={outcome:'win',score,performance:.6*Math.min(1,remaining/timeTarget)+.4*Math.min(1,(water+reserve)/waterTarget)};else if(remaining<=0)result={outcome:'lose',score};
    },snapshot(){return {score,result,water,pressure,remaining,reserve,flames:flames.map(f=>({...f})),aim:{...aim}};}
  };return model;
}
export function drawFire(p,m,{config,balance}) {
  const a=config.art;p.fillStyle=a.skyColor;p.fillRect(0,0,config.width,config.height);
  p.fillStyle=a.coralColor;p.fillRect(a.houseX,a.houseY,a.houseWidth,a.houseHeight);
  p.fillStyle=a.tealColor;p.beginPath();p.moveTo(a.houseX,a.houseY);p.lineTo(config.width/2,a.roofTop);p.lineTo(a.houseX+a.houseWidth,a.houseY);p.fill();
  for(const f of m.flames){p.fillStyle=a.creamColor;p.fillRect(f.x-a.windowSize/2,f.y-a.windowSize/2,a.windowSize,a.windowSize);if(f.heat<=0)continue;
    p.fillStyle=a.coralColor;p.beginPath();p.moveTo(f.x-a.flameRadius,f.y+a.flameRadius/2);p.quadraticCurveTo(f.x-a.flameRadius,f.y,f.x,f.y-a.flameHeight*f.heat);p.quadraticCurveTo(f.x+a.flameRadius,f.y,f.x+a.flameRadius,f.y+a.flameRadius/2);p.fill();
    p.fillStyle=a.sandColor;p.beginPath();p.ellipse(f.x,f.y,a.flameRadius/2,a.flameHeight*f.heat/2,0,0,Math.PI*2);p.fill();
  }
  if(m.spraying){p.strokeStyle=a.seaColor;p.lineWidth=a.waterLineWidth*m.pressure;p.lineCap='round';p.beginPath();p.moveTo(balance.nozzleX,balance.nozzleY);p.lineTo(m.aim.x,m.aim.y);p.stroke();}
  p.fillStyle=a.tealColor;p.beginPath();p.arc(balance.nozzleX,balance.nozzleY,a.flameRadius/2,0,Math.PI*2);p.fill();
}
export function startFire(ctx){return runCanvasGame(ctx,createFireModel,drawFire);}
