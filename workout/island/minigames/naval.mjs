import {runCanvasGame} from './canvas-session.mjs';

export function createNavalModel({config,balance,level,random,power=1}) {
  const settings=balance.levels[level-1];let lives=settings.lives*power,enemyLives=settings.enemyLives,score=0,round=1,phase='aim',delay=0,result,time=0,wasFiring=false,wave=1,fired=0,hits=0;
  const shipType=()=>balance.shipTypes[(wave-1)%settings.shipKinds];
  const enemyX=()=>balance.enemyX+Math.sin(time)*settings.drift;
  enemyLives*=shipType().hp;
  const ball={x:0,y:0,vx:0,vy:0,owner:'player'},aim={angle:balance.defaultAngle,power:balance.defaultPower};
  function shoot(owner,angle,speed) {if(owner==='player')fired++;ball.owner=owner;ball.x=owner==='player'?balance.shipX:enemyX();ball.y=balance.shipY-balance.muzzleRise;ball.vx=Math.cos(angle)*speed*(owner==='player'?1:-1);ball.vy=-Math.sin(angle)*speed;phase='shot';}
  function endShot(){phase=ball.owner==='player'?'enemy':'aim';delay=balance.turnPauseSeconds;if(ball.owner==='enemy')round++;}
  const model={settings,ball,aim,statusId:'minigame.navalStatus',get score(){return score;},get lives(){return lives;},get wave(){return wave;},get enemyX(){return enemyX();},get shipScale(){return shipType().scale;},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyLives;},get time(){return time;},get sinkProgress(){return phase==='sink'?1-delay/balance.sinkSeconds:0;},
    statusValues(){return {round,wave,waves:settings.waves,lives:Math.max(0,Math.ceil(lives)),enemyLives:Math.max(0,Math.ceil(enemyLives))};},
    update(dt,input={}) {
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;delay=Math.max(0,delay-dt);
      const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
      if(phase==='sink'){if(delay<=0){if(enemyLives<=0&&wave<settings.waves){wave++;enemyLives=settings.enemyLives*shipType().hp;phase='aim';}else result={outcome:enemyLives<=0?'win':'lose',score,performance:.7*hits/Math.max(1,fired)+.3*Math.max(0,lives)/(settings.lives*power)};}return;}
      if(round>settings.rounds){enemyLives=enemyLives<lives?0:enemyLives;lives=enemyLives<=0?lives:0;phase='sink';delay=balance.sinkSeconds;return;}
      if(phase==='aim') {
        if(Number.isFinite(input.angle))aim.angle=Math.max(balance.minAngle,Math.min(balance.maxAngle,input.angle));
        if(Number.isFinite(input.power))aim.power=Math.max(0,Math.min(balance.powerMaximum,input.power));
        if(pressed&&delay<=0)shoot('player',aim.angle*Math.PI/180,balance.minSpeed+aim.power/balance.powerMaximum*(balance.maxSpeed-balance.minSpeed));
      }else if(phase==='enemy'&&delay<=0) {
        const angle=(balance.enemyAngleMin+random()*balance.enemyAngleRange)*Math.PI/180;
        const ideal=Math.sqrt(balance.gravity*(enemyX()-balance.shipX)**2/(2*Math.cos(angle)**2*((enemyX()-balance.shipX)*Math.tan(angle)+balance.muzzleRise)));
        shoot('enemy',angle,ideal*(1+(random()-.5)*settings.enemyAimError));
      }else if(phase==='shot') {
        ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.vy+=balance.gravity*dt;
        if(ball.y>=balance.shipY&&ball.vy>0) {
          const target=ball.owner==='player'?enemyX():balance.shipX;
          if(Math.abs(ball.x-target)<=balance.shipRadius){if(ball.owner==='player'){hits++;enemyLives-=settings.damage*power;score+=balance.hitPoints;}else lives-=settings.damage*shipType().damage;}
          if(enemyLives<=0||lives<=0){phase='sink';delay=balance.sinkSeconds;if(enemyLives<=0)score+=Math.ceil(lives)*balance.survivalPoints;}
          else endShot();
        }else if(ball.x < -balance.worldMargin||ball.x>config.width+balance.worldMargin)endShot();
      }
    },snapshot(){return {lives,enemyLives,phase,round,wave,time,enemyX:enemyX(),score,result,ball:{...ball},aim:{...aim}};}
  };return model;
}
function drawShip(p,x,y,color,a,scale=1) {
  p.save();p.translate(x,y);p.scale(scale,scale);x=0;y=0;
  p.fillStyle=color;p.beginPath();p.moveTo(x-a.shipWidth/2,y);p.lineTo(x+a.shipWidth/2,y);p.lineTo(x+a.shipWidth/3,y+a.shipHeight);p.lineTo(x-a.shipWidth/3,y+a.shipHeight);p.closePath();p.fill();
  p.strokeStyle=a.inkColor;p.lineWidth=a.mastLineWidth;p.beginPath();p.moveTo(x,y);p.lineTo(x,y-a.mastHeight);p.stroke();p.fillStyle=color;p.fillRect(x,y-a.mastHeight,a.flagWidth,a.flagHeight);p.restore();
}
export function drawNaval(p,m,{config,balance}) {
  const a=config.art;p.fillStyle=a.skyColor;p.fillRect(0,0,config.width,config.height);p.fillStyle=a.seaColor;p.fillRect(0,balance.waterY,config.width,config.height-balance.waterY);
  p.strokeStyle=a.creamColor;p.lineWidth=a.waveLineWidth;
  for(let x=0;x<config.width;x+=a.waterWaveGap){p.beginPath();p.moveTo(x,balance.waterY+Math.sin(m.time*a.waterWaveSpeed+x)*a.waterWaveHeight);p.lineTo(x+a.waterWaveGap/2,balance.waterY);p.stroke();}
  drawShip(p,balance.shipX,balance.shipY+(m.lives<=0?m.sinkProgress*a.mastHeight:0),a.tealColor,a);
  drawShip(p,m.enemyX,balance.shipY+(m.enemyLives<=0?m.sinkProgress*a.mastHeight:0),a.coralColor,a,m.shipScale);
  if(m.phase==='shot'){p.fillStyle=a.inkColor;p.beginPath();p.arc(m.ball.x,m.ball.y,a.ballRadius,0,Math.PI*2);p.fill();}
  if(m.phase==='aim') {const r=m.aim.angle*Math.PI/180;p.strokeStyle=a.tealColor;p.lineWidth=a.aimLineWidth;p.beginPath();p.moveTo(balance.shipX,balance.shipY-balance.muzzleRise);p.lineTo(balance.shipX+Math.cos(r)*a.mastHeight,balance.shipY-balance.muzzleRise-Math.sin(r)*a.mastHeight);p.stroke();}
}
export function startNaval(ctx){return runCanvasGame(ctx,createNavalModel,drawNaval);}
