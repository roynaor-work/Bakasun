import {runCanvasGame} from './canvas-session.mjs?v=g2e-20261015-1';
import {oval,drawHealthBar} from './art.mjs?v=g2e-20261015-1';
import {createNavalView} from './naval-view.mjs?v=g2e-20261015-1';
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createShipEntity(x,maxHp,shield=0){return {x,hp:maxHp,maxHp,shield,maxShield:shield,recoil:0};}
export function createNavalModel({config,balance,level,random,power=1,equipment=EMPTY}) {
  const settings=balance.levels[level-1];let score=0,round=1,phase='aim',delay=0,result,time=0,wasFiring=false,wasAmmo=false,wave=1,fired=0,hits=0,salvo=0,ammoIndex=0,trailIndex=0;
  const isBoss=w=>level%balance.boss.everyStages===0&&w===settings.waves;
  const shipType=w=>balance.shipTypes[(w-1)%settings.shipKinds];
  const hpAt=w=>settings.enemyLives*shipType(w).hp*(isBoss(w)?balance.boss.hp:1);
  const enemyX=()=>balance.enemyX+Math.sin(time*balance.shipTypes[(wave-1)%settings.shipKinds].speed)*settings.drift;
  const cooldowns=balance.ammo.map(()=>0);
  let remaining=settings.seconds;
  const playerShip=createShipEntity(balance.shipX,settings.lives*power*(equipment.hull||1),equipment.shield||0);
  const enemies=Array.from({length:settings.waves},(_,i)=>({...createShipEntity(balance.enemyX,hpAt(i+1)),kind:i%settings.shipKinds,boss:isBoss(i+1),index:i,z:0,active:i<settings.concurrent}));
  let enemyShip=enemies[0],attacker=enemyShip,sinkingShip=null;
  const ball={x:0,y:0,vx:0,vy:0,owner:'player',ammo:0,z:0,vz:0},aim={yaw:balance.controls.defaultYaw,angle:balance.defaultAngle,power:balance.defaultPower},blast={x:0,y:0,life:0};
  const ammo=balance.ammo.map((a,i)=>a.charges+(i>0&&i<=(equipment.ammo||0)?equipment.ammo:0)),trail=Array.from({length:config.visuals.trailSegments},()=>({x:0,y:0,life:0}));
  let maxEnemyFleet=0;for(let w=1;w<=settings.waves;w++)maxEnemyFleet+=hpAt(w);
  const status={round,wave,waves:settings.waves,lives:0,enemyLives:0};
  function fleetHealth(){let total=0;for(const e of enemies)total+=Math.max(0,e.hp);return total;}
  function shoot(owner,angle,speed){
    if(owner==='player'){ball.ammo=ammoIndex;if(ammo[ball.ammo]<=0)return;fired++;ammo[ball.ammo]--;cooldowns[ball.ammo]=balance.ammo[ball.ammo].reloadSeconds/(equipment.rate||1);}
    else ball.ammo=0;
    ball.gravity=balance.gravity*(owner==='enemy'&&balance.shipTypes[attacker.kind].attack==='heavy'?balance.combat.heavySpeed**2:1);
    const yaw=owner==='player'?aim.yaw*Math.PI/180:Math.atan2((attacker.index-wave+1)*balance.combat.laneSpacing,attacker.x-balance.shipX);
    ball.z=owner==='player'?0:(attacker.index-wave+1)*balance.combat.laneSpacing;ball.vz=Math.sin(yaw)*Math.cos(angle)*speed*(owner==='player'?1:-1);
    ball.owner=owner;ball.source=owner==='player'?enemyShip.index:attacker.index;ball.x=owner==='player'?balance.shipX:attacker.x;ball.y=balance.shipY-balance.muzzleRise;
    ball.vx=Math.cos(yaw)*Math.cos(angle)*speed*(owner==='player'?1:-1);ball.vy=-Math.sin(angle)*speed;
    if(ball.ammo===2){ball.y=balance.shipY;ball.vx=Math.cos(yaw)*balance.maxSpeed;ball.vz=Math.sin(yaw)*balance.maxSpeed;ball.vy=0;}
    (owner==='player'?playerShip:attacker).recoil=config.visuals.recoilSeconds;
    for(const point of trail)point.life=0;phase='shot';
  }
  function endShot(){
    if(ball.owner==='enemy'&&salvo>1){salvo--;phase='enemy';delay=balance.turnPauseSeconds;return;}
    phase=ball.owner==='player'?'enemy':'aim';delay=balance.turnPauseSeconds/(equipment.rate||1);
    if(ball.owner==='enemy')round++;else salvo=level>=balance.enemySalvoStage?balance.enemySalvoShots:shipType(wave).attack==='rapid'?balance.combat.rapidShots:1;
  }
  function impact(hit,targetShip=enemyShip){
    blast.x=ball.x;blast.y=balance.shipY;blast.life=config.visuals.blastSeconds;blast.hit=hit;
    if(hit){
      if(ball.owner==='player'){
        hits++;const type=balance.ammo[ball.ammo];targetShip.hp=Math.max(0,targetShip.hp-settings.damage*power*(equipment.damage||1)*type.damage);score+=balance.hitPoints;
        if(type.heal)playerShip.hp=Math.min(playerShip.maxHp,playerShip.hp+type.heal);
      }else{
        const damage=settings.damage*(level>=balance.enemySalvoStage?balance.salvoDamageScale:1)*balance.shipTypes[attacker.kind].damage*(attacker.boss?balance.boss.damage:1)*(balance.shipTypes[attacker.kind].attack==='heavy'?balance.combat.heavyDamage:1),absorbed=Math.min(playerShip.shield,damage);
        playerShip.shield-=absorbed;playerShip.hp=Math.max(0,playerShip.hp-damage+absorbed);
      }
    }
    if(targetShip.hp<=0||playerShip.hp<=0){sinkingShip=targetShip;phase='sink';delay=balance.sinkSeconds;if(targetShip.hp<=0)score+=Math.ceil(playerShip.hp)*balance.survivalPoints;}
    else endShot();
  }
  const model={settings,ball,aim,blast,trail,playerShip,enemies,ammo,cooldowns,maxEnemyFleet,equipment,
    get enemyShip(){return enemyShip;},get remaining(){return remaining;},statusId:'minigame.navalStatus',
    get score(){return score;},get lives(){return playerShip.hp;},get maxLives(){return playerShip.maxHp;},get wave(){return wave;},get enemyX(){return enemyX();},get shipScale(){return shipType(wave).scale*(isBoss(wave)?balance.boss.scale:1);},get boss(){return isBoss(wave);},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyShip.hp;},get time(){return time;},get ammoIndex(){return ammoIndex;},get enemyFleetHp(){return fleetHealth();},get sinkProgress(){return phase==='sink'?1-delay/balance.sinkSeconds:0;},
    statusValues(){status.round=round;status.wave=wave;status.lives=Math.max(0,Math.ceil(playerShip.hp));status.enemyLives=Math.max(0,Math.ceil(enemyShip.hp));return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;delay=Math.max(0,delay-dt);blast.life=Math.max(0,blast.life-dt);playerShip.recoil=Math.max(0,playerShip.recoil-dt);
      remaining=Math.max(0,remaining-dt);for(let i=0;i<cooldowns.length;i++)cooldowns[i]=Math.max(0,cooldowns[i]-dt);
      for(const point of trail)point.life=Math.max(0,point.life-dt);
      let activeCount=0;
      for(const e of enemies){e.recoil=Math.max(0,e.recoil-dt);e.active=(e.hp>0&&e.index>=wave-1&&activeCount<settings.concurrent)||(phase==='sink'&&e===sinkingShip);if(e.active&&e.hp>0)activeCount++;e.x=balance.enemyX+Math.sin(time*balance.shipTypes[e.kind].speed+e.index)*settings.drift;e.z=Math.cos(time*.6+e.index)*settings.drift*.08;}enemyShip.x=enemyX();
      const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
      if(Number.isInteger(input.ammoIndex)&&input.ammoIndex>=0&&input.ammoIndex<ammo.length)ammoIndex=input.ammoIndex;
      if(input.ammo&&!wasAmmo){for(let i=1;i<=balance.ammo.length;i++){const next=(ammoIndex+i)%balance.ammo.length;if(next===0||ammo[next]>0){ammoIndex=next;break;}}}wasAmmo=Boolean(input.ammo);
      if(phase==='sink'){
        if(delay<=0){
          if(playerShip.hp>0&&fleetHealth()>0){enemyShip=enemies.find(e=>e.hp>0);wave=enemyShip.index+1;sinkingShip=null;phase='aim';}
          else result={outcome:playerShip.hp>0?'win':'lose',score,performance:.7*hits/Math.max(1,fired)+.3*Math.max(0,playerShip.hp)/playerShip.maxHp};
        }return;
      }
      if(round>settings.rounds||remaining<=0){playerShip.hp=0;phase='sink';delay=balance.sinkSeconds;return;}
      if(phase==='aim'){
        if(Number.isFinite(input.yaw))aim.yaw=Math.max(balance.controls.minYaw,Math.min(balance.controls.maxYaw,input.yaw));
        if(Number.isFinite(input.angle)&&ammoIndex!==2)aim.angle=Math.max(balance.minAngle,Math.min(balance.maxAngle,input.angle));
        if(Number.isFinite(input.power))aim.power=Math.max(0,Math.min(balance.powerMaximum,input.power));
        const selected=ammoIndex;
        if(pressed&&delay<=0&&cooldowns[selected]<=0&&ammo[selected]>0){ammoIndex=selected;shoot('player',(ammoIndex===2?0:aim.angle)*Math.PI/180,balance.minSpeed+aim.power/balance.powerMaximum*(balance.maxSpeed-balance.minSpeed));}
      }else if(phase==='enemy'&&delay<=0){
        let turn=(round-1)%Math.min(settings.concurrent,activeCount);attacker=enemyShip;for(const e of enemies)if(e.active&&e.hp>0){if(turn--===0){attacker=e;break;}}
        const angle=(balance.enemyAngleMin+random()*balance.enemyAngleRange)*Math.PI/180,d=attacker.x-balance.shipX;
        const gravity=balance.gravity*(balance.shipTypes[attacker.kind].attack==='heavy'?balance.combat.heavySpeed**2:1);
        const ideal=Math.sqrt(gravity*d*d/(2*Math.cos(angle)**2*(d*Math.tan(angle)+balance.muzzleRise)));
        shoot('enemy',angle,ideal*(1+(random()-.5)*settings.enemyAimError));
      }else if(phase==='shot'){
        const point=trail[trailIndex];point.x=ball.x;point.y=ball.y;point.life=config.visuals.blastSeconds;trailIndex=(trailIndex+1)%trail.length;
        ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt;if(ball.ammo!==2)ball.vy+=ball.gravity*dt;
        const target=ball.owner==='player'?enemyX():balance.shipX,width=balance.shipRadius*balance.ammo[ball.ammo].width;
        let victim=null;if(ball.owner==='player')for(const e of enemies)if(e.active&&e.hp>0&&Math.abs(ball.x-e.x)<=width&&Math.abs(ball.z-(e.index-wave+1)*balance.combat.laneSpacing)<=balance.combat.lateralRadius){victim=e;break;}
        if(ball.ammo===2&&victim)impact(true,victim);
        else if(ball.y>=balance.shipY&&ball.vy>0)impact(ball.owner==='player'?Boolean(victim):Math.abs(ball.x-target)<=width&&Math.abs(ball.z)<=balance.combat.lateralRadius,victim||enemyShip);
        else if(ball.ammo===2&&ball.x>balance.enemyX+settings.drift+width)endShot();
        else if(Math.abs(ball.z)>config.width+balance.worldMargin||ball.x < -balance.worldMargin||ball.x>config.width+balance.worldMargin)endShot();
      }
    },
    snapshot(){return {lives:playerShip.hp,maxLives:playerShip.maxHp,enemyLives:enemyShip.hp,phase,round,wave,time,enemyX:enemyX(),score,result,attacker:attacker.index,ball:{...ball},aim:{...aim},playerShip:{...playerShip},enemyShip:{...enemyShip},enemyFleetHp:fleetHealth(),maxEnemyFleet,boss:isBoss(wave),ammoIndex,ammo:[...ammo],cooldowns:[...cooldowns],remaining,enemies:enemies.map(e=>({...e}))};}
  };return model;
}
function drawVessel(p,ship,sprite,m,config,balance,scale=1,enemy=false,x=ship.x,y=balance.shipY){
  const palette=config.visuals.palette;
  const v=config.visuals,sink=ship.hp<=0?m.sinkProgress*config.art.mastHeight:0,bob=Math.sin(m.time*2+ship.x)*2;
  p.strokeStyle=v.foam;p.lineWidth=2;
  for(let i=0;i<v.wakeSegments;i++){const t=(m.time*.5+i/v.wakeSegments)%1;p.globalAlpha=(1-t)*.45;p.beginPath();p.ellipse(x,y+10+t*11,40*scale+t*20,3+t*2,0,0,TAU);p.stroke();}p.globalAlpha=1;
  p.save();p.translate(x,y+sink+bob);p.rotate(Math.sin(m.time*2)*.025);p.scale(enemy?-scale:scale,scale);p.drawImage(sprite,-53-ship.recoil*18,-66,106,101);
  if(ship.recoil>0){oval(p,39,-12,10+ship.recoil*22,7,palette.muzzle);oval(p,43,-12,6,4,palette.muzzleCore);}p.restore();
  if(ship.hp>0&&ship.hp<ship.maxHp){const t=(m.time*.6)%1;p.globalAlpha=.45*(1-t);oval(p,x,y-40-t*40,8+t*12,10+t*12,v.smoke);p.globalAlpha=1;if(ship.hp<ship.maxHp*.5)oval(p,x,y-28,6,14+Math.sin(m.time*12)*3,palette.embers);}
  if(!enemy&&(m.equipment.hull||1)>1){p.strokeStyle=palette.gold;p.lineWidth=3;p.beginPath();p.moveTo(x-45,y+5);p.lineTo(x+40,y+5);p.stroke();}
  if(!enemy&&ship.shield>0){p.strokeStyle=palette.shieldGlow;p.lineWidth=2;p.beginPath();p.ellipse(x,y-25,60,68,0,0,TAU);p.stroke();}
  const barY=y-85*scale-sink;drawHealthBar(p,x-29,barY,58,6,ship.hp,ship.maxHp,config);
  if(ship.maxShield>0)drawHealthBar(p,x-29,barY+10,58,3,ship.shield,ship.maxShield,config);
}
export function drawNaval(p,m,{config,balance,art,quality,view}) {
  const palette=config.visuals.palette;
  const a=config.art,v=config.visuals,full3d=view?.draw(p);
  if(!full3d){p.drawImage(art.backdrop,0,0);p.fillStyle=palette.waterBottom;p.fillRect(0,config.height*.42,config.width,config.height*.58);
  }
  const r=balance.render,meterWidth=config.width-r.mapSize-48;
  drawHealthBar(p,18,r.playerMeterY,meterWidth,7,m.lives,m.maxLives,config);drawHealthBar(p,18,r.fleetMeterY,meterWidth,7,m.enemyFleetHp,m.maxEnemyFleet,config);
  p.font=art.hudFont;p.textAlign='left';p.fillStyle=v.foam;p.fillText(art.fleetLabel,18,r.playerMeterY-8);p.fillText(art.enemyFleetLabel,18,r.fleetMeterY-8);
  if(!full3d){
  const rows=quality.low?2:5;p.strokeStyle=palette.waveGlint;p.lineWidth=2;
  for(let row=0;row<rows;row++)for(let x=0;x<config.width;x+=a.waterWaveGap){const y=config.height*.42+row*24+Math.sin(m.time*a.waterWaveSpeed+x*.1)*a.waterWaveHeight;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+10,y+4,x+a.waterWaveGap/2,y);p.stroke();}
  drawVessel(p,m.playerShip,art.player,m,config,balance,1.65,false,105,config.height*.82);
  for(const e of m.enemies)if(e.active){const x=220+(e.index-m.wave+1)*49+Math.sin(m.time+e.index)*m.settings.drift*.5,y=config.height*.5+e.z*4;drawVessel(p,e,e.boss?art.boss:art.enemies[e.kind],m,config,balance,.65*balance.shipTypes[e.kind].scale,true,x,y);p.font=art.hudFont;p.fillStyle=a.creamColor;p.textAlign='center';p.fillText(art.enemyNames[e.index],x,y-67);}
  p.save();p.transform(.48,-.425,0,.7,76,53);

  if(m.phase==='shot'){
    for(const point of m.trail)if(point.life>0){p.globalAlpha=point.life/v.blastSeconds*.6;oval(p,point.x,point.y,3,3,m.ball.ammo===2?v.foam:palette.trail);}p.globalAlpha=1;
    oval(p,m.ball.x,m.ball.y,m.ball.ammo===2?11:6,m.ball.ammo===2?4:6,m.ball.ammo===3?palette.healShell:palette.shell);if(m.ball.ammo===1)oval(p,m.ball.x-9,m.ball.y+9,5,5,palette.doubleShell);
  }
  if(m.blast.life>0){const t=1-m.blast.life/v.blastSeconds;p.globalAlpha=1-t;oval(p,m.blast.x,m.blast.y,8+t*32,5+t*23,palette.blast);for(let i=0;i<6;i++){const angle=i*TAU/6;oval(p,m.blast.x+Math.cos(angle)*t*40,m.blast.y+Math.sin(angle)*t*26,4,6,v.foam);}p.globalAlpha=1;}
  if(m.phase==='aim'){const r=m.aim.angle*Math.PI/180,speed=balance.minSpeed+m.aim.power/balance.powerMaximum*(balance.maxSpeed-balance.minSpeed);for(let i=1;i<12;i++){const t=i*.12;oval(p,balance.shipX+Math.cos(r)*speed*t,balance.shipY-balance.muzzleRise-Math.sin(r)*speed*t+balance.gravity*t*t/2,2,2,palette.aim);}}
  p.restore();
  }
  const size=balance.render.mapSize,x=config.width-size-14,y=balance.render.mapY;
  p.fillStyle=v.hpBack;p.globalAlpha=.85;p.fillRect(x,y,size,size);p.globalAlpha=1;p.strokeStyle=v.foam;p.lineWidth=1;p.strokeRect(x,y,size,size);
  oval(p,x+size/2,y+size-10,3,3,a.tealColor);
  for(const e of m.enemies)if(e.active)oval(p,x+size/2+(e.index-m.wave+1)*12,y+10+(e.x-balance.enemyX)*.4,3,e.boss?5:3,a.coralColor);
  drawAimPanel(p,m,config,balance,art);
  if(m.blast.hit&&m.blast.life>0){p.strokeStyle=v.foam;p.lineWidth=3;const x=full3d?config.width/2:220,y=full3d?config.height/2:240;p.beginPath();p.moveTo(x-8,y-8);p.lineTo(x+8,y+8);p.moveTo(x+8,y-8);p.lineTo(x-8,y+8);p.stroke();}
}
export function startNaval(ctx){return runCanvasGame({...ctx,config:{...ctx.config,height:ctx.balance.render.height}},createNavalModel,drawNaval,createNavalView);}

/** Compact 360° dial, allowed forward semicircle and independent degree rulers. */
export function drawAimPanel(p,m,config,balance,art){
  const r=balance.controls.dialRadius,x=r+12,y=config.height-r-26,a=m.aim.yaw*Math.PI/180,v=config.visuals;
  p.save();p.direction='ltr';p.fillStyle=v.hpBack;p.globalAlpha=.85;p.beginPath();p.roundRect(5,config.height-94,config.width-10,88,10);p.fill();p.globalAlpha=1;
  p.strokeStyle=v.smoke;p.lineWidth=2;p.beginPath();p.arc(x,y,r,0,TAU);p.stroke();p.strokeStyle=v.foam;p.lineWidth=4;p.beginPath();p.arc(x,y,r,Math.PI,TAU);p.stroke();
  p.strokeStyle=v.hpWarn;p.lineWidth=2;p.beginPath();p.moveTo(x,y);p.lineTo(x+Math.sin(a)*r,y-Math.cos(a)*r);p.stroke();
  p.font=art.hudFont;p.fillStyle=v.foam;p.textAlign='center';p.fillText('360°',x,y+r+15);
  const left=x+r+18,right=config.width-18,span=right-left;
  for(let i=0;i<=6;i++){const tx=left+span*i/6;p.beginPath();p.moveTo(tx,y-28);p.lineTo(tx,y-22);p.strokeStyle=v.foam;p.stroke();if(i%3===0){const degrees=balance.controls.minYaw+(balance.controls.maxYaw-balance.controls.minYaw)*i/6;p.fillText((degrees>0?'+':'')+degrees+'°',tx,y-33);}}
  p.strokeStyle=v.foam;p.beginPath();p.moveTo(left,y-25);p.lineTo(right,y-25);p.stroke();
  const at=left+(m.aim.yaw-balance.controls.minYaw)/(balance.controls.maxYaw-balance.controls.minYaw)*span;p.fillStyle=v.hpWarn;p.fillRect(at-2,y-29,4,9);
  p.fillStyle=v.foam;p.textAlign='left';p.fillText(art.yawText||'',left,y-6);p.fillText(art.elevationText||'',left,y+14);
  p.textAlign='center';p.strokeStyle=v.foam;p.beginPath();p.moveTo(left,y+26);p.lineTo(right,y+26);p.stroke();
  for(let i=0;i<3;i++){const tx=left+span*i/2;p.beginPath();p.moveTo(tx,y+23);p.lineTo(tx,y+29);p.stroke();p.fillText(String(balance.minAngle+(balance.maxAngle-balance.minAngle)*i/2)+'°',tx,y+41);}
  if(m.ammoIndex!==2){const elevation=left+(m.aim.angle-balance.minAngle)/(balance.maxAngle-balance.minAngle)*span;p.fillStyle=v.hpWarn;p.fillRect(elevation-2,y+22,4,9);}p.restore();
}
