import {runCanvasGame} from './canvas-session.mjs';
import {oval,drawHealthBar} from './art.mjs';
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createShipEntity(x,maxHp,shield=0){return {x,hp:maxHp,maxHp,shield,maxShield:shield,recoil:0};}
export function createNavalModel({config,balance,level,random,power=1,equipment=EMPTY}) {
  const settings=balance.levels[level-1];let score=0,round=1,phase='aim',delay=0,result,time=0,wasFiring=false,wasAmmo=false,wave=1,fired=0,hits=0,salvo=0,ammoIndex=0,trailIndex=0;
  const isBoss=w=>level%balance.boss.everyStages===0&&w===settings.waves;
  const shipType=w=>balance.shipTypes[(w-1)%settings.shipKinds];
  const hpAt=w=>settings.enemyLives*shipType(w).hp*(isBoss(w)?balance.boss.hp:1);
  const enemyX=()=>balance.enemyX+Math.sin(time)*settings.drift;
  const playerShip=createShipEntity(balance.shipX,settings.lives*power*(equipment.hull||1),equipment.shield||0),enemyShip=createShipEntity(balance.enemyX,hpAt(1));
  const ball={x:0,y:0,vx:0,vy:0,owner:'player',ammo:0},aim={angle:balance.defaultAngle,power:balance.defaultPower},blast={x:0,y:0,life:0};
  const ammo=balance.ammo.map((a,i)=>i>0&&i<=(equipment.ammo||0)?a.charges:0),trail=Array.from({length:config.visuals.trailSegments},()=>({x:0,y:0,life:0}));
  let maxEnemyFleet=0;for(let w=1;w<=settings.waves;w++)maxEnemyFleet+=hpAt(w);
  const status={round,wave,waves:settings.waves,lives:0,enemyLives:0};
  function fleetHealth(){let total=Math.max(0,enemyShip.hp);for(let w=wave+1;w<=settings.waves;w++)total+=hpAt(w);return total;}
  function shoot(owner,angle,speed){
    if(owner==='player'){fired++;ball.ammo=ammoIndex;if(ammoIndex>0){if(ammo[ammoIndex]<=0)ball.ammo=0;else ammo[ammoIndex]--;}}
    else ball.ammo=0;
    ball.owner=owner;ball.x=owner==='player'?balance.shipX:enemyX();ball.y=balance.shipY-balance.muzzleRise;
    ball.vx=Math.cos(angle)*speed*(owner==='player'?1:-1);ball.vy=-Math.sin(angle)*speed;
    if(ball.ammo===2){ball.y=balance.shipY;ball.vx=balance.maxSpeed;ball.vy=0;}
    (owner==='player'?playerShip:enemyShip).recoil=config.visuals.recoilSeconds;
    for(const point of trail)point.life=0;phase='shot';
  }
  function endShot(){
    if(ball.owner==='enemy'&&salvo>1){salvo--;phase='enemy';delay=balance.turnPauseSeconds;return;}
    phase=ball.owner==='player'?'enemy':'aim';delay=balance.turnPauseSeconds/(equipment.rate||1);
    if(ball.owner==='enemy')round++;else salvo=level>=balance.enemySalvoStage?balance.enemySalvoShots:1;
  }
  function impact(hit){
    blast.x=ball.x;blast.y=balance.shipY;blast.life=config.visuals.blastSeconds;
    if(hit){
      if(ball.owner==='player'){
        hits++;const type=balance.ammo[ball.ammo];enemyShip.hp=Math.max(0,enemyShip.hp-settings.damage*power*(equipment.damage||1)*type.damage);score+=balance.hitPoints;
        if(type.heal)playerShip.hp=Math.min(playerShip.maxHp,playerShip.hp+type.heal);
      }else{
        const damage=settings.damage*(level>=balance.enemySalvoStage?balance.salvoDamageScale:1)*shipType(wave).damage*(isBoss(wave)?balance.boss.damage:1),absorbed=Math.min(playerShip.shield,damage);
        playerShip.shield-=absorbed;playerShip.hp=Math.max(0,playerShip.hp-damage+absorbed);
      }
    }
    if(enemyShip.hp<=0||playerShip.hp<=0){phase='sink';delay=balance.sinkSeconds;if(enemyShip.hp<=0)score+=Math.ceil(playerShip.hp)*balance.survivalPoints;}
    else endShot();
  }
  const model={settings,ball,aim,blast,trail,playerShip,enemyShip,ammo,maxEnemyFleet,statusId:'minigame.navalStatus',
    get score(){return score;},get lives(){return playerShip.hp;},get maxLives(){return playerShip.maxHp;},get wave(){return wave;},get enemyX(){return enemyX();},get shipScale(){return shipType(wave).scale*(isBoss(wave)?balance.boss.scale:1);},get boss(){return isBoss(wave);},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyShip.hp;},get time(){return time;},get ammoIndex(){return ammoIndex;},get enemyFleetHp(){return fleetHealth();},get sinkProgress(){return phase==='sink'?1-delay/balance.sinkSeconds:0;},
    statusValues(){status.round=round;status.wave=wave;status.lives=Math.max(0,Math.ceil(playerShip.hp));status.enemyLives=Math.max(0,Math.ceil(enemyShip.hp));return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;delay=Math.max(0,delay-dt);blast.life=Math.max(0,blast.life-dt);playerShip.recoil=Math.max(0,playerShip.recoil-dt);enemyShip.recoil=Math.max(0,enemyShip.recoil-dt);
      for(const point of trail)point.life=Math.max(0,point.life-dt);enemyShip.x=enemyX();
      const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
      if(input.ammo&&!wasAmmo&&phase==='aim'){for(let i=1;i<=balance.ammo.length;i++){const next=(ammoIndex+i)%balance.ammo.length;if(next===0||ammo[next]>0){ammoIndex=next;break;}}}wasAmmo=Boolean(input.ammo);
      if(phase==='sink'){
        if(delay<=0){
          if(enemyShip.hp<=0&&wave<settings.waves){wave++;enemyShip.hp=enemyShip.maxHp=hpAt(wave);phase='aim';}
          else result={outcome:enemyShip.hp<=0?'win':'lose',score,performance:.7*hits/Math.max(1,fired)+.3*Math.max(0,playerShip.hp)/playerShip.maxHp};
        }return;
      }
      if(round>settings.rounds){if(enemyShip.hp<playerShip.hp)enemyShip.hp=0;else playerShip.hp=0;phase='sink';delay=balance.sinkSeconds;return;}
      if(phase==='aim'){
        if(Number.isFinite(input.angle))aim.angle=Math.max(balance.minAngle,Math.min(balance.maxAngle,input.angle));
        if(Number.isFinite(input.power))aim.power=Math.max(0,Math.min(balance.powerMaximum,input.power));
        if(pressed&&delay<=0)shoot('player',aim.angle*Math.PI/180,balance.minSpeed+aim.power/balance.powerMaximum*(balance.maxSpeed-balance.minSpeed));
      }else if(phase==='enemy'&&delay<=0){
        const angle=(balance.enemyAngleMin+random()*balance.enemyAngleRange)*Math.PI/180,d=enemyX()-balance.shipX;
        const ideal=Math.sqrt(balance.gravity*d*d/(2*Math.cos(angle)**2*(d*Math.tan(angle)+balance.muzzleRise)));
        shoot('enemy',angle,ideal*(1+(random()-.5)*settings.enemyAimError));
      }else if(phase==='shot'){
        const point=trail[trailIndex];point.x=ball.x;point.y=ball.y;point.life=config.visuals.blastSeconds;trailIndex=(trailIndex+1)%trail.length;
        ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;if(ball.ammo!==2)ball.vy+=balance.gravity*dt;
        const target=ball.owner==='player'?enemyX():balance.shipX,width=balance.shipRadius*balance.ammo[ball.ammo].width;
        if(ball.ammo===2&&ball.x>=target-width)impact(Math.abs(ball.x-target)<=width);
        else if(ball.y>=balance.shipY&&ball.vy>0)impact(Math.abs(ball.x-target)<=width);
        else if(ball.x < -balance.worldMargin||ball.x>config.width+balance.worldMargin)endShot();
      }
    },
    snapshot(){return {lives:playerShip.hp,maxLives:playerShip.maxHp,enemyLives:enemyShip.hp,phase,round,wave,time,enemyX:enemyX(),score,result,ball:{...ball},aim:{...aim},playerShip:{...playerShip},enemyShip:{...enemyShip},enemyFleetHp:fleetHealth(),maxEnemyFleet,boss:isBoss(wave),ammoIndex,ammo:[...ammo]};}
  };return model;
}
function drawVessel(p,ship,sprite,m,config,balance,scale=1,enemy=false){
  const palette=config.visuals.palette;
  const v=config.visuals,sink=ship.hp<=0?m.sinkProgress*config.art.mastHeight:0,bob=Math.sin(m.time*2+ship.x)*2;
  p.strokeStyle=v.foam;p.lineWidth=2;
  for(let i=0;i<v.wakeSegments;i++){const t=(m.time*.5+i/v.wakeSegments)%1;p.globalAlpha=(1-t)*.45;p.beginPath();p.ellipse(ship.x,balance.waterY+2+t*11,40*scale+t*20,3+t*2,0,0,TAU);p.stroke();}p.globalAlpha=1;
  p.save();p.translate(ship.x,balance.shipY+sink+bob);p.rotate(Math.sin(m.time*2)*.025);p.scale(enemy?-scale:scale,scale);p.drawImage(sprite,-53-ship.recoil*18,-66,106,101);
  if(ship.recoil>0){oval(p,39,-12,10+ship.recoil*22,7,palette.muzzle);oval(p,43,-12,6,4,palette.muzzleCore);}p.restore();
  const y=balance.shipY-85-sink;drawHealthBar(p,ship.x-29,y,58,6,ship.hp,ship.maxHp,config);
  if(ship.maxShield>0)drawHealthBar(p,ship.x-29,y+10,58,3,ship.shield,ship.maxShield,config);
}
export function drawNaval(p,m,{config,balance,art,quality}) {
  const palette=config.visuals.palette;
  const a=config.art,v=config.visuals;p.drawImage(art.backdrop,0,0);
  drawHealthBar(p,18,38,config.width-36,9,m.lives,m.maxLives,config);drawHealthBar(p,18,74,config.width-36,9,m.enemyFleetHp,m.maxEnemyFleet,config);
  p.font=art.hudFont;p.textAlign='left';p.fillStyle=a.inkColor;p.fillText(art.fleetLabel,18,30);p.fillText(art.enemyFleetLabel,18,66);
  const rows=quality.low?2:5;p.strokeStyle=palette.waveGlint;p.lineWidth=2;
  for(let row=0;row<rows;row++)for(let x=0;x<config.width;x+=a.waterWaveGap){const y=balance.waterY+row*24+Math.sin(m.time*a.waterWaveSpeed+x*.1)*a.waterWaveHeight;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+10,y+4,x+a.waterWaveGap/2,y);p.stroke();}
  drawVessel(p,m.playerShip,art.player,m,config,balance);drawVessel(p,m.enemyShip,m.boss?art.boss:art.enemy,m,config,balance,m.shipScale,true);
  if(m.phase==='shot'){
    for(const point of m.trail)if(point.life>0){p.globalAlpha=point.life/v.blastSeconds*.6;oval(p,point.x,point.y,3,3,m.ball.ammo===2?v.foam:palette.trail);}p.globalAlpha=1;
    oval(p,m.ball.x,m.ball.y,m.ball.ammo===2?11:6,m.ball.ammo===2?4:6,m.ball.ammo===3?palette.healShell:palette.shell);if(m.ball.ammo===1)oval(p,m.ball.x-9,m.ball.y+9,5,5,palette.doubleShell);
  }
  if(m.blast.life>0){const t=1-m.blast.life/v.blastSeconds;p.globalAlpha=1-t;oval(p,m.blast.x,m.blast.y,8+t*32,5+t*23,palette.blast);for(let i=0;i<6;i++){const angle=i*TAU/6;oval(p,m.blast.x+Math.cos(angle)*t*40,m.blast.y+Math.sin(angle)*t*26,4,6,v.foam);}p.globalAlpha=1;}
  if(m.phase==='aim'){const r=m.aim.angle*Math.PI/180,speed=balance.minSpeed+m.aim.power/balance.powerMaximum*(balance.maxSpeed-balance.minSpeed);for(let i=1;i<12;i++){const t=i*.12;oval(p,balance.shipX+Math.cos(r)*speed*t,balance.shipY-balance.muzzleRise-Math.sin(r)*speed*t+balance.gravity*t*t/2,2,2,palette.aim);}}
}
export function startNaval(ctx){return runCanvasGame(ctx,createNavalModel,drawNaval);}
