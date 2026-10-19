import {runCanvasGame} from './canvas-session.mjs?v=g9-20261020-1';
import {oval,drawHealthBar} from './art.mjs?v=g9-20261020-1';
import {createNavalInput} from './naval-controls.mjs?v=g9-20261020-1';
import {navalCameraPose,navalWorldPoint,projectNavalPoint,navalWaterAt,navalProjectileHeight} from './naval-camera.mjs?v=g9-20261020-1';
import {createNavalView} from './naval-view.mjs?v=g9-20261020-1';
export function healthPercent(hp,maxHp){return Math.round(Math.max(0,Math.min(1,hp/maxHp))*100);}
export function navalSway(seed,time,balance){const a=balance.aim.sway,phase=(seed>>>0)%997;return {yaw:Math.sin(time*a.frequency+phase)*a.yaw,elevation:Math.cos(time*a.frequency*.73+phase)*a.elevation};}
export function navalTrajectory(ship,yaw,elevation,balance){const range=balance.aim.minRange+(elevation-balance.aim.minElevation)*balance.aim.rangePerDegree;return {x:ship.x+Math.cos(yaw)*range,z:(ship.z||0)+Math.sin(yaw)*range};}
export function navalComposition(seed,count,kinds,previous){let offset=(seed>>>0)%kinds;const make=()=>Array.from({length:count},(_,i)=>(i+offset)%kinds);if(make().join()===previous)offset=(offset+1)%kinds;return make();}
/** Segment against an oriented ellipse: checks the whole water-level hull. */
export function navalHullContact(from,to,ship,balance){
 const a=ship.heading||0,c=Math.cos(a),s=Math.sin(a),dx=to.x-from.x,dz=to.z-from.z;
 const transform=p=>({x:((p.x-ship.x)*c+(p.z-ship.z)*s)/(balance.aim.hullLength*(ship.hullScale||1)),z:((p.z-ship.z)*c-(p.x-ship.x)*s)/(balance.aim.hullBeam*(ship.hullScale||1))});
 const f=transform(from),t=transform(to),vx=t.x-f.x,vz=t.z-f.z,u=Math.max(0,Math.min(1,-(f.x*vx+f.z*vz)/(vx*vx+vz*vz||1)));
 return Math.hypot(f.x+vx*u,f.z+vz*u)<=1;
}
export function navalSoftAim(aim,enemies,balance,level=1,ammoIndex=0){
 const tuning=balance.aim.difficulty[level-1],e=enemies.filter(e=>navalTargetable(e,ammoIndex,balance)).sort((a,b)=>Math.hypot(a.x-aim.x,a.z-aim.z)-Math.hypot(b.x-aim.x,b.z-aim.z))[0];
 if(!e||Math.hypot(e.x-aim.x,e.z-aim.z)>tuning.radius)return {...aim};
 return {x:aim.x+(e.x-aim.x)*tuning.assist,z:aim.z+(e.z-aim.z)*tuning.assist};
}
export function navalTargetable(e,ammoIndex,balance){return e.active&&e.hp>0&&(!balance.shipTypes[e.kind??0].submarine||e.depth<=balance.combat.submarineHitDepth||ammoIndex===5);}
export function navalLead(ship,enemy,balance,ammoIndex=0,equipment=EMPTY){
 let point={x:enemy.x,z:enemy.z};
 for(let i=0;i<balance.aim.predictionSteps;i++){
  let flight=balance.targeting.flightSeconds+Math.hypot(point.x-ship.x,point.z-ship.z)*balance.targeting.secondsPerRange;
  if(ammoIndex===2)flight*=balance.aim.torpedoSecondsMultiplier;if(ammoIndex===4)flight=balance.combat.vulcanFlight/(equipment.rate||1);
  point={x:enemy.x+(enemy.vx||0)*flight,z:enemy.z+(enemy.vz||0)*flight};
 }
 return point;
}
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createShipEntity(x,maxHp,shield=0){return {x,hp:maxHp,maxHp,shield,maxShield:shield,recoil:0};}
export function navalScreenPoint(x,z,config,balance){return {x:config.width/2+z*.85,y:config.height*.8-(x-balance.shipX)*1.05};}
export function navalTargetAt(x,y,config,balance){return {x:balance.shipX+(config.height*.8-y)/1.05,z:(x-config.width/2)/.85};}
/** Target coordinates are shared by collision, flight and the visible sea ring. */
export function createNavalModel({config,balance,level,random,power=1,equipment=EMPTY,sound=()=>{},seed=0,previousFleet}){
  const settings=balance.levels[level-1],targeting=balance.targeting,composition=navalComposition(seed,settings.waves,balance.shipTypes.length,previousFleet);let yaw=0,elevation=balance.aim.defaultElevation;const extraShots=[],enemyShots=[];let enemyFired=0,heat=0,vulcanTime=0,overheated=false;
  let aiming=false,camera;let score=0,round=1,phase='aim',delay=0,result,time=0,wasFiring=false,wasAmmo=false,wave=1,fired=0,hits=0,ammoIndex=0,remaining=settings.seconds,sinkingShip=null,attacker;
  const playerShip=createShipEntity(balance.shipX,settings.lives*power*(equipment.hull||1),equipment.shield||0);
  Object.assign(playerShip,{z:0,heading:0});
  const enemies=Array.from({length:settings.waves},(_,i)=>{const kind=composition[i],boss=level%balance.boss.everyStages===0&&i===settings.waves-1;return {...createShipEntity(balance.enemyX,settings.enemyLives*balance.shipTypes[kind].hp*(boss?balance.boss.hp:1)),kind,boss,hullScale:balance.shipTypes[kind].scale,depth:0,fireAt:balance.combat.enemyFireSeconds+i*balance.combat.enemyStagger,index:i,z:(i-(Math.min(settings.concurrent,settings.waves)-1)/2)*balance.combat.laneSpacing,active:i<settings.concurrent};});
  let enemyShip=enemies[0];attacker=enemyShip;
  const maxEnemyFleet=enemies.reduce((sum,e)=>sum+e.hp,0),ammo=settings.ammunition.map(n=>n+(equipment.ammo||0)),cooldowns=ammo.map(()=>0);
  const aim={x:balance.enemyX,z:0},blast={x:0,y:balance.shipY,z:0,life:0,hit:false},ball={x:balance.shipX,y:balance.shipY,z:0,owner:'player',ammo:0,age:0,duration:0,fromX:0,fromZ:0,targetX:0,targetZ:0,vx:0,vy:0,vz:0};
  camera=navalCameraPose(playerShip,aim,false,balance);
  const trail=[];
  function fleetHealth(){return enemies.reduce((sum,e)=>sum+Math.max(0,e.hp),0);}
  function finish(outcome){result={outcome,score:Math.min(score,balance.maximumScore),performance:.7*hits/Math.max(1,fired)+.3*Math.max(0,playerShip.hp)/playerShip.maxHp};}
  function shoot(owner){
    if(owner==='player'){if(ammo[ammoIndex]<=0)return;fired++;ammo[ammoIndex]--;if(phase==='shot')extraShots.push({...ball});ball.ammo=ammoIndex;ball.fromX=playerShip.x;ball.fromZ=playerShip.z;ball.targetX=aim.x;ball.targetZ=aim.z;if(ammoIndex===4){ball.targetX+=(random()-.5)*balance.combat.vulcanSpread;ball.targetZ+=(random()-.5)*balance.combat.vulcanSpread;heat=Math.min(1,heat+balance.combat.vulcanHeatPerShot);if(heat>=1)overheated=true;}}
    else{ball.ammo=0;ball.fromX=attacker.x;ball.fromZ=attacker.z;ball.targetX=playerShip.x+(random()-.5)*settings.enemyAimError*250;ball.targetZ=playerShip.z+(random()-.5)*settings.enemyAimError*180;}
    delete ball.victim;ball.owner=owner;ball.source=owner==='player'?enemyShip.index:attacker.index;ball.x=ball.fromX;ball.z=ball.fromZ;ball.y=balance.shipY;ball.age=0;ball.duration=targeting.flightSeconds+Math.hypot(ball.targetX-ball.fromX,ball.targetZ-ball.fromZ)*targeting.secondsPerRange;ball.duration*=ball.ammo===2?balance.aim.torpedoSecondsMultiplier:1;if(ball.ammo===4)ball.duration=balance.combat.vulcanFlight/(equipment.rate||1);
    (owner==='player'?playerShip:attacker).recoil=config.visuals.recoilSeconds;phase='shot';sound('cannon');
  }
  function impact(projectile=ball,secondary=false){
    const ball=projectile;
    blast.x=ball.targetX;blast.z=ball.targetZ;blast.y=balance.shipY;blast.life=config.visuals.blastSeconds;blast.hit=false;
    const radius=targeting.radius*balance.ammo[ball.ammo].width;
    const victim=ball.owner==='player'?enemies.find(e=>e.active&&e.hp>0&&(!balance.shipTypes[e.kind].submarine||e.depth<=balance.combat.submarineHitDepth||ball.ammo===5)&&(ball.victim===e.index||Math.hypot(e.x-blast.x,e.z-blast.z)<=radius)):Math.hypot(blast.x-playerShip.x,blast.z-playerShip.z)<=radius?playerShip:null;
    if(victim){blast.hit=true;sound('explosion');
      if(ball.owner==='player'){hits++;const type=balance.ammo[ball.ammo];victim.hp=Math.max(0,victim.hp-settings.damage*power*(equipment.damage||1)*type.damage*(ball.ammo===4&&victim.kind===1?balance.combat.vulcanCargoScale:1)*(1+(settings.weaponLevel-1)*.1));score+=balance.hitPoints;if(type.heal)playerShip.hp=Math.min(playerShip.maxHp,playerShip.hp+type.heal);}
      else{const damage=settings.damage*balance.shipTypes[attacker.kind].damage*(attacker.boss?balance.boss.damage:1),absorbed=Math.min(playerShip.shield,damage);playerShip.shield-=absorbed;playerShip.hp=Math.max(0,playerShip.hp-damage+absorbed);}
    }else sound('splash');
    if(playerShip.hp<=0||victim&&victim!==playerShip&&victim.hp<=0){sinkingShip=victim;phase='sink';delay=balance.sinkSeconds;if(victim!==playerShip)score+=Math.ceil(playerShip.hp)*balance.survivalPoints;}
    else if(!secondary){phase='aim';delay=balance.turnPauseSeconds/(equipment.rate||1);if(ball.owner==='enemy')round++;}
  }
  function torpedoContact(p,from){if(p.ammo!==2)return false;const victim=enemies.find(e=>e.active&&e.hp>0&&(!balance.shipTypes[e.kind].submarine||e.depth<=balance.combat.submarineHitDepth)&&navalHullContact(from,p,e,balance));if(!victim)return false;p.victim=victim.index;p.targetX=p.x;p.targetZ=p.z;p.age=p.duration;return true;}
  const model={get fired(){return fired;},get camera(){return camera;},get aiming(){return aiming;},get triggerDown(){return wasFiring;},settings,ball,aim,blast,trail,extraShots,enemyShots,get heat(){return heat;},get overheated(){return overheated;},get enemyFired(){return enemyFired;},playerShip,enemies,ammo,cooldowns,maxEnemyFleet,equipment,statusId:'minigame.navalStatus',
    targetAt:(x,y)=>navalWaterAt(x,y,camera,config.width,config.height,balance),screenPoint:(x,z,y=0)=>projectNavalPoint(navalWorldPoint(x,z,balance,y),camera,config.width,config.height),
    get enemyShip(){return enemyShip;},get remaining(){return remaining;},get score(){return score;},get lives(){return playerShip.hp;},get maxLives(){return playerShip.maxHp;},get wave(){return wave;},get enemyX(){return enemyShip.x;},get shipScale(){return balance.shipTypes[enemyShip.kind].scale;},get boss(){return enemyShip.boss;},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyShip.hp;},get time(){return time;},get ammoIndex(){return ammoIndex;},get enemyFleetHp(){return fleetHealth();},get sinkProgress(){return phase==='sink'?1-delay/balance.sinkSeconds:0;},
    get yaw(){return yaw;},get elevation(){return elevation;},get sway(){return navalSway(seed,time,balance);},get warningId(){return ammo.every(n=>n<=0)?'minigame.noAmmo':null;},
    statusValues(){return {round,wave,lives:Math.ceil(playerShip.hp),enemyLives:Math.ceil(enemyShip.hp)};},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;vulcanTime=Math.max(0,vulcanTime-dt);if(!input.firing||ammoIndex!==4){heat=Math.max(0,heat-balance.combat.vulcanCoolPerSecond*dt);if(heat===0)overheated=false;}const mv=balance.movement;playerShip.heading+=(input.moveX||0)*mv.turnSpeed*dt;const speed=-(input.moveZ||0)*mv.speed;playerShip.x=Math.max(mv.minX,Math.min(mv.maxX,playerShip.x+Math.cos(playerShip.heading)*speed*dt));playerShip.z=Math.max(mv.minZ,Math.min(mv.maxZ,playerShip.z+Math.sin(playerShip.heading)*speed*dt));
      if(Number.isFinite(input.yaw))yaw=Math.max(-Math.PI/2,Math.min(Math.PI/2,input.yaw));if(Number.isFinite(input.elevation))elevation=Math.max(balance.aim.minElevation,Math.min(balance.aim.maxElevation,input.elevation));
      if(input.angularAim){const sway=navalSway(seed,time,balance);Object.assign(aim,navalTrajectory(playerShip,yaw+sway.yaw,elevation+sway.elevation,balance));}
      remaining=Math.max(0,remaining-dt);delay=Math.max(0,delay-dt);blast.life=Math.max(0,blast.life-dt);playerShip.recoil=Math.max(0,playerShip.recoil-dt);
      const visibleCount=Math.min(settings.concurrent,enemies.filter(e=>e.hp>0).length);let active=0;for(const e of enemies){e.recoil=Math.max(0,e.recoil-dt);e.active=e.hp>0&&active<settings.concurrent||phase==='sink'&&e===sinkingShip;const lane=active;if(e.active&&e.hp>0)active++;const oldX=e.x,oldZ=e.z;e.x=balance.enemyX+Math.sin(time*balance.shipTypes[e.kind].speed+e.index)*settings.drift;e.z=(lane-(visibleCount-1)/2)*balance.combat.laneSpacing+Math.cos(time*.6+e.index)*settings.drift*.08;e.vx=(e.x-oldX)/dt;e.vz=(e.z-oldZ)/dt;e.depth=balance.shipTypes[e.kind].submarine&&time%balance.combat.submarineCycle>balance.combat.submarineSurface?1:0;
        if(e.active&&e.hp>0&&time>=e.fireAt){e.fireAt=time+balance.combat.enemyFireSeconds/balance.shipTypes[e.kind].speed;enemyFired++;e.fired=(e.fired||0)+1;sound('cannon');enemyShots.push({x:e.x,z:e.z,fromX:e.x,fromZ:e.z,targetX:playerShip.x+(random()-.5)*settings.enemyAimError*250,targetZ:playerShip.z+(random()-.5)*settings.enemyAimError*180,age:0,duration:targeting.flightSeconds,kind:balance.shipTypes[e.kind].submarine?2:0,damage:settings.damage*balance.shipTypes[e.kind].damage});e.recoil=config.visuals.recoilSeconds;}
      }
      for(let i=enemyShots.length-1;i>=0;i--){const e=enemyShots[i];e.age+=dt;const t=Math.min(1,e.age/e.duration);e.x=e.fromX+(e.targetX-e.fromX)*t;e.z=e.fromZ+(e.targetZ-e.fromZ)*t;if(t>=1){if(Math.hypot(e.x-playerShip.x,e.z-playerShip.z)<=targeting.radius){const absorb=Math.min(playerShip.shield,e.damage);playerShip.shield-=absorb;playerShip.hp=Math.max(0,playerShip.hp-e.damage+absorb);sound('explosion');}enemyShots.splice(i,1);}}if(playerShip.hp<=0){finish('lose');return;}
      aiming=Boolean(input.aimHeld);const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
      if(Number.isInteger(input.ammoIndex)&&input.ammoIndex>=0&&input.ammoIndex<ammo.length)ammoIndex=input.ammoIndex;
      if(input.ammo&&!wasAmmo){for(let i=1;i<=ammo.length;i++){const next=(ammoIndex+i)%ammo.length;if(ammo[next]>0){ammoIndex=next;break;}}}wasAmmo=Boolean(input.ammo);
      if(Number.isFinite(input.targetX))aim.x=Math.max(targeting.minX,Math.min(targeting.maxX,input.targetX));
      if(Number.isFinite(input.targetZ))aim.z=Math.max(targeting.minZ,Math.min(targeting.maxZ,input.targetZ));
      if(input.autoAim){const e=enemies.filter(e=>navalTargetable(e,ammoIndex,balance)).sort((a,b)=>Math.hypot(a.x-playerShip.x,a.z-playerShip.z)-Math.hypot(b.x-playerShip.x,b.z-playerShip.z))[0];if(e)Object.assign(aim,navalLead(playerShip,e,balance,ammoIndex,equipment));}else if(input.assistAim)Object.assign(aim,navalSoftAim(aim,enemies,balance,level,ammoIndex));
      camera=navalCameraPose(playerShip,aim,aiming,balance,camera,dt);
      for(let i=extraShots.length-1;i>=0;i--){const p=extraShots[i],from={x:p.x,z:p.z};p.age=Math.min(p.duration,p.age+dt);const t=p.age/p.duration;p.x=p.fromX+(p.targetX-p.fromX)*t;p.z=p.fromZ+(p.targetZ-p.fromZ)*t;p.y=balance.shipY-(p.ammo===2?Math.sin(time*balance.render.waveSpeed)*balance.aim.torpedoBob:Math.sin(t*Math.PI)*targeting.arcHeight);if(torpedoContact(p,from)||t>=1){impact(p,true);extraShots.splice(i,1);}}
      if(phase==='sink'){
        if(delay<=0){if(playerShip.hp<=0)finish('lose');else if(fleetHealth()<=0)finish('win');else{enemyShip=enemies.find(e=>e.hp>0);wave=enemyShip.index+1;sinkingShip=null;phase='aim';}}return;
      }
      if(remaining<=0||round>settings.rounds){finish('lose');return;}
      // The last projectile resolves before exhaustion is evaluated, so it can win.
      if(phase!=='shot'&&extraShots.length===0&&ammo.every(n=>n<=0)){finish('lose');return;}
      if(phase!=='sink'&&(pressed||ammoIndex===4&&input.firing&&vulcanTime===0)&&ammo[ammoIndex]>0&&!overheated){shoot('player');vulcanTime=balance.combat.vulcanSeconds;}
      else if(phase==='enemy'&&delay<=0){const fleet=enemies.filter(e=>e.active&&e.hp>0);attacker=fleet[(round-1)%fleet.length];shoot('enemy');}
      else if(phase==='shot'){
        ball.age=Math.min(ball.duration,ball.age+dt);const t=ball.age/ball.duration,from={x:ball.x,z:ball.z};ball.x=ball.fromX+(ball.targetX-ball.fromX)*t;ball.z=ball.fromZ+(ball.targetZ-ball.fromZ)*t;ball.sampleTime=time;ball.y=balance.shipY-(ball.ammo===2?Math.sin(time*balance.render.waveSpeed)*balance.aim.torpedoBob:Math.sin(t*Math.PI)*targeting.arcHeight);
        if(torpedoContact(ball,from)||t>=1)impact();
      }
    },
    snapshot(){return {aiming,camera:JSON.parse(JSON.stringify(camera)),fired,hits,heat,overheated,enemyFired,enemyShots:enemyShots.map(e=>({...e})),composition:composition.join(),yaw,elevation,sway:model.sway,playerPercent:healthPercent(playerShip.hp,playerShip.maxHp),enemyPercent:healthPercent(enemyShip.hp,enemyShip.maxHp),extraShots:extraShots.map(p=>({...p})),warningId:model.warningId,lives:playerShip.hp,maxLives:playerShip.maxHp,enemyLives:enemyShip.hp,phase,round,wave,time,enemyX:enemyShip.x,score,result,attacker:attacker.index,ball:{...ball},blast:{...blast},aim:{...aim},playerShip:{...playerShip},enemyShip:{...enemyShip},enemyFleetHp:fleetHealth(),maxEnemyFleet,boss:enemyShip.boss,ammoIndex,ammo:[...ammo],cooldowns:[...cooldowns],remaining,enemies:enemies.map(e=>({...e}))};}
  };return model;
}
export function drawNaval(p,m,{config,balance,art,quality,view}){
  const v=config.visuals,palette=v.palette,full3d=view?.draw(p),project=(x,z,y=0)=>view?.projectTarget?.(x,z,y)||m.screenPoint(x,z,y);
  if(!full3d){
    p.fillStyle=balance.render.sea;p.fillRect(0,0,config.width,config.height);p.strokeStyle=palette.waveGlint;p.lineWidth=2;
    for(let y=30;y<config.height;y+=quality.low?70:35)for(let x=0;x<config.width;x+=48){const sway=Math.sin(m.time*2+y+x)*3;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+12,y+6+sway,x+28,y);p.stroke();}
    const draw=(e,sprite,scale)=>{const q=project(e.x,e.z||0);p.save();p.translate(q.x,q.y+(e.hp<=0?m.sinkProgress*45:0));p.rotate((e===m.playerShip?-e.heading:Math.PI/2)+Math.sin(m.time*2)*.025);p.drawImage(sprite,-53*scale,-65*scale,106*scale,101*scale);p.restore();};
    draw(m.playerShip,art.player,1.2);for(const e of m.enemies)if(e.active)draw(e,e.boss?art.boss:art.enemies[e.kind],.75*balance.shipTypes[e.kind].scale);
    for(const projectile of [...m.extraShots,...(m.phase==='shot'?[m.ball]:[])]){const q=project(projectile.x,projectile.z,navalProjectileHeight(projectile.ammo,projectile.age/projectile.duration,m.time,balance));oval(p,q.x,q.y,projectile.ammo===2?3:4,projectile.ammo===2?10:4,palette.shell);}
    if(m.blast.life>0){const q=project(m.blast.x,m.blast.z),t=1-m.blast.life/v.blastSeconds;p.globalAlpha=1-t;oval(p,q.x,q.y,10+t*40,6+t*25,m.blast.hit?palette.blast:v.foam);p.globalAlpha=1;}
  }
  for(const e of m.enemyShots){const q=project(e.x,e.z,navalProjectileHeight(e.kind,e.age/e.duration,m.time,balance));oval(p,q.x,q.y,e.kind===2?4:3,e.kind===2?8:3,palette.shell);}
  if(!full3d&&m.playerShip.recoil>0){const q=project(m.playerShip.x,m.playerShip.z),life=m.playerShip.recoil/config.visuals.recoilSeconds;p.globalAlpha=life;oval(p,q.x,q.y-16,8+life*12,5+life*10,palette.blast);p.globalAlpha=1;}
  const hud=balance.render.hud;
  p.font=hud.font;p.textAlign='left';
  for(const [index,hp,maxHp,color]of [[0,m.lives,m.maxLives,balance.render.glass],[1,m.enemyFleetHp,m.maxEnemyFleet,palette.blast]]){
   const y=hud.top+index*hud.gap;p.fillStyle='#10374acc';p.fillRect(hud.margin-8,y-14,hud.barWidth+28,hud.gap-2);p.fillStyle=color;p.beginPath();p.moveTo(hud.margin,y-6);p.lineTo(hud.margin+7,y+2);p.lineTo(hud.margin,y+5);p.lineTo(hud.margin-7,y+2);p.closePath();p.fill();p.fillStyle=v.foam;p.fillText(healthPercent(hp,maxHp)+'%',hud.margin+14,y+3);drawHealthBar(p,hud.margin,y+9,hud.barWidth,hud.barHeight,hp,maxHp,config);
  }
  for(const e of m.enemies)if(e.active&&e.hp>0){const q=project(e.x,e.z),h=hud.edgeInset;
   if(q.depth<=0||q.x<h||q.x>config.width-h||q.y<h||q.y>config.height-h){const x=q.depth<=0?config.width/2:Math.max(h,Math.min(config.width-h,q.x)),y=q.depth<=0?h:Math.max(h,Math.min(config.height-h,q.y));p.fillStyle=palette.blast;p.beginPath();p.moveTo(x,y-7);p.lineTo(x-7,y+5);p.lineTo(x+7,y+5);p.closePath();p.fill();continue;}
   const y=Math.max(hud.top+hud.gap*2,q.y-hud.labelHeight);p.textAlign='center';p.fillStyle=v.foam;p.strokeStyle='#10374a';p.lineWidth=4;p.strokeText(healthPercent(e.hp,e.maxHp)+'%',q.x,y-7);p.fillText(healthPercent(e.hp,e.maxHp)+'%',q.x,y-7);drawHealthBar(p,q.x-balance.render.enemyBarWidth/2,y,balance.render.enemyBarWidth,hud.barHeight,e.hp,e.maxHp,config);
  }
  // A water ring makes the landing target explicit; the short dashed path remains.
  const target=project(m.aim.x,m.aim.z);if(target.depth<=0)return;
  const locked=m.enemies.some(e=>navalTargetable(e,m.ammoIndex,balance)&&Math.hypot(e.x-m.aim.x,e.z-m.aim.z)<balance.targeting.radius);p.strokeStyle=locked?'#ff655f':palette.gold;p.lineWidth=m.aiming?3:2;p.beginPath();p.ellipse(target.x,target.y,hud.ringRadius,hud.ringHeight,0,0,TAU);p.stroke();p.beginPath();p.moveTo(target.x-hud.crossRadius,target.y);p.lineTo(target.x+hud.crossRadius,target.y);p.moveTo(target.x,target.y-hud.crossRadius/2);p.lineTo(target.x,target.y+hud.crossRadius/2);p.stroke();
  p.strokeStyle=palette.gold;p.lineWidth=2;p.setLineDash([5,6]);p.beginPath();
  for(let i=0;i<=balance.aim.previewSegments;i++){const u=i/balance.aim.previewSegments*balance.aim.previewFraction,q=project(m.playerShip.x+(m.aim.x-m.playerShip.x)*u,m.playerShip.z+(m.aim.z-m.playerShip.z)*u,navalProjectileHeight(m.ammoIndex,u,m.time,balance));if(i)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);}p.stroke();p.setLineDash([]);

}
export function startNaval(ctx){
 if(!document.querySelector('[data-naval-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./naval.css',import.meta.url).href;link.dataset.navalStyle='';document.head.append(link);}
 let model,view;const input=createNavalInput(ctx,()=>model,()=>view);
 try{
  const session=runCanvasGame({...ctx,config:{...ctx.config,height:ctx.balance.render.height}},args=>{model=createNavalModel(args);const update=model.update;model.update=(dt,raw)=>update(dt,input.sample(raw));return model;},drawNaval,(args,m)=>view=createNavalView(args,m));
  const dispose=session.dispose,pause=session.setPaused;session.dispose=()=>{input.dispose();dispose();};session.setPaused=value=>{input.reset();pause(value);};return session;
 }catch(error){input.dispose();throw error;}
}
