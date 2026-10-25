import {NAVAL_WEAPON_COLORS} from './naval-icons.mjs?v=island-nitro-20261025-1';
import {navalLockedPoint,navalLockRadius} from './naval-lock.mjs?v=island-nitro-20261025-1';
import {runCanvasGame} from './canvas-session.mjs?v=island-nitro-20261025-1';
import {oval,drawHealthBar} from './art.mjs?v=island-nitro-20261025-1';
import {createNavalInput,navalSteeringInput} from './naval-controls.mjs?v=island-nitro-20261025-1';
import {navalCampaignStage,navalMissionState,navalStagePressure} from './naval-campaign.mjs?v=island-nitro-20261025-1';
import {navalCameraPose,navalWorldPoint,projectNavalPoint,navalWaterAt,navalProjectileHeight} from './naval-camera.mjs?v=island-nitro-20261025-1';
import {createNavalAudio} from './g6d-audio.mjs?v=island-nitro-20261025-1';
import {drawNavalHud,mountNavalWeaponPicker} from './naval-hud.mjs?v=island-nitro-20261025-1';
import {createNavalView} from './naval-view.mjs?v=island-nitro-20261025-1';
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
 const tuning=balance.aim.difficulty[Math.min(balance.aim.difficulty.length-1,Math.max(0,level-1))],e=enemies.filter(e=>navalTargetable(e,ammoIndex,balance)).sort((a,b)=>Math.hypot(a.x-aim.x,a.z-aim.z)-Math.hypot(b.x-aim.x,b.z-aim.z))[0];
 if(!e||Math.hypot(e.x-aim.x,e.z-aim.z)>tuning.radius)return {...aim};
 return {x:aim.x+(e.x-aim.x)*balance.aim.assist*tuning.assist,z:aim.z+(e.z-aim.z)*balance.aim.assist*tuning.assist};
}
export function navalTargetable(e,ammoIndex,balance){return e.active&&e.hp>0&&(!balance.shipTypes[e.kind??0].submarine||e.depth<=balance.combat.submarineHitDepth||ammoIndex===1||ammoIndex===3);}
export function navalLead(ship,enemy,balance,ammoIndex=0,equipment=EMPTY){
 let point={x:enemy.x,z:enemy.z};
 for(let i=0;i<balance.aim.predictionSteps;i++){
  let flight=balance.targeting.flightSeconds+Math.hypot(point.x-ship.x,point.z-ship.z)*balance.targeting.secondsPerRange;
  if(ammoIndex===2)flight*=balance.aim.torpedoSecondsMultiplier;
  point={x:enemy.x+(enemy.vx||0)*flight,z:enemy.z+(enemy.vz||0)*flight};
 }
 return point;
}
/** Wind is deterministic per salvo. It is visible before release, never a hit roll. */
export function navalWind(seed,salvo,balance){
 const w=balance.aim.wind;
 const hash=n=>{let v=(seed+Math.imul(salvo+1,0x9e3779b9)+n)>>>0;v=Math.imul(v^(v>>>16),0x21f0aaad);v=Math.imul(v^(v>>>15),0x735a2d97);return ((v^(v>>>15))>>>0)/4294967296;};
 const angle=hash(17)*Math.PI*2,strength=w.minStrength+hash(83)*(w.maxStrength-w.minStrength);
 return {angle,strength,x:Math.cos(angle)*strength,z:Math.sin(angle)*strength,salvo};
}
export function navalWindLanding(point,wind,flight,balance,level=5){
 const scale=balance.aim.wind.driftScale*(balance.aim.wind.difficultyMin+(navalStagePressure(level)-1)*balance.aim.wind.difficultyStep)*flight*flight;
 return {x:point.x+wind.x*scale,z:point.z+wind.z*scale};
}
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function navalBroadsideHeading(ship,enemy){
 const bearing=Math.atan2(enemy.z-ship.z,enemy.x-ship.x),a=bearing+Math.PI/2,z=bearing-Math.PI/2;
 return ship.heading+angleDelta([a,z].sort((a,b)=>Math.abs(angleDelta(a,ship.heading))-Math.abs(angleDelta(b,ship.heading)))[0],ship.heading);
}
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createShipEntity(x,maxHp,shield=0){return {x,hp:maxHp,maxHp,shield,maxShield:shield,recoil:0};}
export function navalScreenPoint(x,z,config,balance){return {x:config.width/2+z*.85,y:config.height*.8-(x-balance.shipX)*1.05};}
export function navalTargetAt(x,y,config,balance){return {x:balance.shipX+(config.height*.8-y)/1.05,z:(x-config.width/2)/.85};}
/** All live shots freeze a visible reticle; direct firing remains the deterministic fixture API. */
export function createNavalModel({config,balance,level,random=()=>.5,power=1,equipment=EMPTY,sound=()=>{},seed=0,previousFleet,difficulty='normal'}){
 const campaign=navalCampaignStage(balance,level,seed,previousFleet),{settings,mission,fleet}=campaign,targeting=balance.targeting;
 const mode=Object.hasOwn(balance.lock.difficulties,difficulty)?difficulty:'normal',tactics=settings.enemyTactics||{telegraphSeconds:1.8,fireSeconds:10,speedScale:1};
 const playerShip={...createShipEntity(balance.shipX,settings.lives*power*(equipment.hull||1),equipment.shield||0),z:0,heading:0,speed:0};
 const enemies=fleet.map((row,i)=>({...createShipEntity(balance.enemyX,settings.enemyLives*balance.shipTypes[row.kind].hp*(row.boss?balance.boss.hp:1)),...row,index:i,hullScale:balance.shipTypes[row.kind].scale*(row.boss?balance.boss.scale:1),z:(i-(Math.min(settings.concurrent,fleet.length)-1)/2)*balance.combat.laneSpacing,heading:Math.PI,depth:0,vx:0,vz:0,active:i<settings.concurrent,slot:i<settings.concurrent?i:null,spawnTime:0,fireAt:tactics.fireSeconds+i*balance.combat.enemyStagger,warning:0}));
 let enemyShip=enemies[0],phase='aim',time=0,remaining=settings.seconds,result,score=0,wave=1,fired=0,hits=0,ammoIndex=0,wasFiring=false,wasAmmo=false,delay=0,sinkingShip=null;
 let yaw=0,elevation=balance.aim.defaultElevation,aiming=false,lockedTargetIndex=null,selectedTargetIndex=0,wind=navalWind(seed,0,balance),enemyFired=0,moving=false,resupplyTime=0,resupplies=0,shotSerial=0;
 const ammo=[...settings.ammunition],cooldowns=ammo.map(()=>0),extraShots=[],enemyShots=[],trail=[],mines=[],creditedShots=new Set();
 const blast={x:0,y:balance.shipY,z:0,life:0,hit:false},ball={x:playerShip.x,z:0,y:balance.shipY,owner:'player',ammo:0,age:0,duration:0,fromX:0,fromZ:0,targetX:0,targetZ:0,active:false};
 const aim={x:enemies[0].x,z:enemies[0].z},maxEnemyFleet=enemies.reduce((sum,e)=>sum+e.hp,0);
 const framing=()=>({battle:true,enemies,width:config.width,height:config.height,moving});
 let camera=navalCameraPose(playerShip,aim,false,balance,undefined,0,framing()),repairLife=0,lastAction=null,lastFeedback=null,reticle=null;
 const fleetHealth=()=>enemies.reduce((sum,e)=>sum+Math.max(0,e.hp),0);
 const finish=outcome=>{if(!result)result={outcome,score:Math.min(score,balance.maximumScore),performance:.7*Math.min(1,hits/Math.max(1,fired))+.3*Math.max(0,playerShip.hp)/playerShip.maxHp};};
 const targetable=e=>navalTargetable(e,ammoIndex,balance);
 const feedback=(kind,x,z)=>{lastFeedback={kind,x,z,time};};
 function lock(index=selectedTargetIndex){
  const candidates=enemies.filter(targetable),e=candidates.find(e=>e.index===index)||candidates.sort((a,b)=>Math.hypot(a.x-aim.x,a.z-aim.z)-Math.hypot(b.x-aim.x,b.z-aim.z))[0]||enemies.find(e=>e.active&&e.hp>0);
  lockedTargetIndex=e?.index??null;if(e)selectedTargetIndex=e.index;aiming=true;sampleReticle();
 }
 function sampleReticle(){
  let e=enemies.find(e=>e.index===lockedTargetIndex&&e.hp>0&&e.active);
  if(!e){lockedTargetIndex=null;reticle=null;return;}
  reticle=navalLockedPoint(playerShip,e,wind,balance,level,mode,equipment,seed,time,ammoIndex);
  aim.x=reticle.x;aim.z=reticle.z;yaw=Math.atan2(aim.z-playerShip.z,aim.x-playerShip.x);
 }
 function damage(victim,p){
  if(p.owner==='player'){
   if(!creditedShots.has(p.shotId)){hits++;creditedShots.add(p.shotId);}
   victim.hp=Math.max(0,victim.hp-settings.damage*power*(equipment.damage||1)*balance.ammo[p.ammo].damage*(1+(settings.weaponLevel-1)*.1));score+=balance.hitPoints;
  }else{const amount=p.damage??settings.damage,absorbed=Math.min(playerShip.shield,amount);playerShip.shield-=absorbed;playerShip.hp=Math.max(0,playerShip.hp-amount+absorbed);}
  if(victim.hp<=0&&victim.sunkAt===undefined){victim.sunkAt=time;sinkingShip=victim;phase='sink';delay=balance.sinkSeconds;if(victim!==playerShip)score+=Math.ceil(playerShip.hp)*balance.survivalPoints;}
 }
 function impact(p){
  const point={x:p.targetX,z:p.targetZ};
  if(p.ammo===3&&p.owner==='player'&&!p.armed){mines.push({...point,age:0,life:balance.weapons.mineLifeSeconds,ammo:3,owner:'player',shotId:p.shotId,armed:true});p.active=false;sound('splash');feedback('mine',point.x,point.z);return;}
  let victim=p.owner==='player'?enemies.find(e=>e.active&&e.hp>0&&(!balance.shipTypes[e.kind].submarine||e.depth<=balance.combat.submarineHitDepth||p.ammo===1||p.ammo===3)&&(p.victim===e.index||navalHullContact(point,point,e,balance))):navalHullContact(point,point,playerShip,balance)?playerShip:null;
  Object.assign(blast,{...point,y:balance.shipY,life:config.visuals.blastSeconds,hit:Boolean(victim)});
  if(victim){damage(victim,p);sound('metal');sound('explosion');feedback(p.owner==='player'?'hit':'damage',point.x,point.z);}else{sound('splash');feedback(p.owner==='player'?'miss':'evaded',point.x,point.z);}
  p.active=false;if(p.owner==='player')wind=navalWind(seed,fired,balance);
  if(phase!=='sink')phase=ball.active?'shot':'aim';
 }
 function shoot(point=aim,locked=false){
  const kind=ammoIndex;
  if(ammo[kind]<=0||cooldowns[kind]>0||extraShots.length+enemyShots.length+Number(ball.active)+(kind===4?3:1)>balance.render.effects.maxProjectiles)return false;
  if(kind===5&&playerShip.hp>=playerShip.maxHp){feedback('full',playerShip.x,playerShip.z);return false;}
  ammo[kind]--;cooldowns[kind]=[.36,.85,.7,1.2,1.1,3][kind]/Math.max(1,equipment.rate||1);lastAction={type:balance.ammo[kind].id,time};
  if(kind===5){const amount=Math.min(playerShip.maxHp-playerShip.hp,playerShip.maxHp*balance.weapons.repairFraction);playerShip.hp+=amount;repairLife=balance.weapons.repairSeconds;lastAction.amount=amount;feedback('repair',playerShip.x,playerShip.z);sound('metal');return true;}
  fired++;const shotId=++shotSerial;
  if(ball.active)extraShots.push({...ball,active:true});
  Object.keys(ball).forEach(key=>delete ball[key]);Object.assign(ball,{x:playerShip.x,z:playerShip.z,y:balance.shipY,fromX:playerShip.x,fromZ:playerShip.z,targetX:point.x,targetZ:point.z,age:0,ammo:kind,owner:'player',source:enemyShip.index,active:true,windOffsetX:0,windOffsetZ:0,shotId});
  ball.duration=targeting.flightSeconds+Math.hypot(point.x-playerShip.x,point.z-playerShip.z)*targeting.secondsPerRange;
  if(kind===2)ball.duration*=balance.aim.torpedoSecondsMultiplier;
  if(kind===1){ball.guided=true;ball.targetId=lockedTargetIndex??selectedTargetIndex;}
  if(kind===0||kind===4){ball.wind={...wind};if(locked){ball.windOffsetX=reticle?.windX||0;ball.windOffsetZ=reticle?.windZ||0;}else{const landing=navalWindLanding(point,wind,ball.duration,balance,level);ball.windOffsetX=landing.x-point.x;ball.windOffsetZ=landing.z-point.z;ball.targetX=landing.x;ball.targetZ=landing.z;}}
  if(kind===4){const spread=balance.weapons.salvoSpread*.55;for(const side of [-1,1])extraShots.push({...ball,targetX:ball.targetX+side*spread*.65,targetZ:ball.targetZ+side*spread,active:true,salvo:true});ball.salvo=true;}
  playerShip.recoil=config.visuals.recoilSeconds;if(phase!=='sink')phase='shot';sound(kind===2?'torpedo':'cannon');if(kind!==2)sound('whistle');return true;
 }
 function advanceProjectile(p,dt){
  if(!p.active)return;const from={x:p.x,z:p.z};p.age=Math.min(p.duration,p.age+dt);const t=p.age/p.duration;
  if(p.guided){const e=enemies.find(e=>e.index===p.targetId&&e.active&&e.hp>0);if(e){p.targetX=e.x;p.targetZ=e.z;}}
  p.x=p.fromX+(p.targetX-p.fromX)*t-(p.windOffsetX||0)*t*(1-t);p.z=p.fromZ+(p.targetZ-p.fromZ)*t-(p.windOffsetZ||0)*t*(1-t);p.sampleTime=time;
  p.y=balance.shipY-(p.ammo===2?Math.sin(time*balance.render.waveSpeed)*balance.aim.torpedoBob:Math.sin(t*Math.PI)*targeting.arcHeight);
  if(p.ammo!==3&&(p.ammo===2||t>.8)){
   const e=enemies.find(e=>e.active&&e.hp>0&&(!balance.shipTypes[e.kind].submarine||e.depth<=balance.combat.submarineHitDepth||p.ammo===1)&&navalHullContact(from,p,e,balance));
   if(e){p.victim=e.index;p.targetX=p.x;p.targetZ=p.z;impact(p);return;}
  }
  if(t>=1)impact(p);
 }
 function updateFleet(dt){
  const alive=enemies.filter(e=>e.hp>0),occupants=alive.filter(e=>e.active),occupied=new Set(occupants.map(e=>e.slot));
  for(const e of alive.filter(e=>!e.active))if(occupants.length<settings.concurrent){let slot=0;while(occupied.has(slot))slot++;e.slot=slot;e.active=true;e.spawnTime=time;e.fireAt=time+tactics.fireSeconds;occupied.add(slot);occupants.push(e);}
  for(const e of enemies){
   e.recoil=Math.max(0,e.recoil-dt);
   if(e.hp<=0){e.active=time-(e.sunkAt??time)<balance.sinkSeconds;continue;}
   if(!e.active)continue;
   const oldX=e.x,oldZ=e.z,age=time-e.spawnTime,type=balance.shipTypes[e.kind],a=age*(e.behavior==='flank'?.5:.3)*tactics.speedScale+e.index+(seed%7)*.14,lane=(e.slot-(Math.min(settings.concurrent,fleet.length)-1)/2)*balance.combat.laneSpacing;
   const flank=e.behavior==='flank',guard=e.behavior==='guard'||e.behavior==='flagship';
   e.x=balance.enemyX+Math.sin(a)*settings.drift*(guard?.5:1)-(flank?(1-Math.cos(age*.3))*Math.min(55,settings.drift*2):0);
   e.z=lane+Math.sin(a*.8)*settings.drift*(flank?1.2:.4);
   e.vx=age<=dt?0:(e.x-oldX)/dt;e.vz=age<=dt?0:(e.z-oldZ)/dt;
   if(Math.hypot(e.vx,e.vz)>.01)e.heading=Math.atan2(e.vz,e.vx);
   e.depth=type.submarine&&age%balance.combat.submarineCycle>balance.combat.submarineSurface?1:0;
   if(!e.attack&&time>=e.fireAt){
    const error=settings.enemyAimError*60;
    e.attack={x:playerShip.x+(random()-.5)*error,z:playerShip.z+(random()-.5)*error,fireTime:time+tactics.telegraphSeconds,kind:type.submarine?2:0};
   }
   if(e.attack){e.warning=Math.max(0,e.attack.fireTime-time);if(time>=e.attack.fireTime){
    const attack=e.attack;enemyFired++;e.fired=(e.fired||0)+1;sound(type.submarine?'torpedo':'cannon');
    enemyShots.push({x:e.x,z:e.z,fromX:e.x,fromZ:e.z,targetX:attack.x,targetZ:attack.z,age:0,duration:type.submarine?1.65:1.2,kind:attack.kind,ammo:attack.kind,owner:'enemy',damage:settings.damage*type.damage*(guard?balance.combat.heavyDamage:1)});
    e.recoil=config.visuals.recoilSeconds;e.attack=null;e.warning=0;e.fireAt=time+tactics.fireSeconds/(flank?1.2:guard?.85:1);
   }}else e.warning=0;
  }
 }
 const model={settings,equipment,mission,playerShip,enemies,ammo,cooldowns,ball,aim,blast,trail,extraShots,enemyShots,mines,maxEnemyFleet,statusId:'minigame.navalStatus',difficulty:mode,
  beginAim:lock,cancelAim(){aiming=false;lockedTargetIndex=null;},get selectedTargetIndex(){return selectedTargetIndex;},get lockedTargetIndex(){return lockedTargetIndex;},get lockedTarget(){return enemies.find(e=>e.index===lockedTargetIndex)||null;},get reticle(){return reticle&&{...reticle};},
  get missionState(){return navalMissionState(mission,enemies);},get resupplyTime(){return resupplyTime;},get resupplies(){return resupplies;},get lastFeedback(){return lastFeedback;},
  get rangeState(){return navalLockRadius(playerShip,model.lockedTarget||enemies.find(e=>e.index===selectedTargetIndex&&e.active&&e.hp>0)||enemies.find(e=>e.active&&e.hp>0)||enemyShip,balance,level,mode,equipment);},
  get aiming(){return aiming;},get wind(){return wind;},get moving(){return moving;},get returning(){return false;},get fired(){return fired;},get camera(){return camera;},get triggerDown(){return wasFiring;},get heat(){return 0;},get overheated(){return false;},get enemyFired(){return enemyFired;},get repairLife(){return repairLife;},get lastAction(){return lastAction;},
  get enemyShip(){return enemyShip;},get remaining(){return remaining;},get score(){return score;},get lives(){return playerShip.hp;},get maxLives(){return playerShip.maxHp;},get wave(){return wave;},get enemyX(){return enemyShip.x;},get shipScale(){return balance.shipTypes[enemyShip.kind].scale;},get boss(){return enemyShip.boss;},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyShip.hp;},get time(){return time;},get ammoIndex(){return ammoIndex;},get enemyFleetHp(){return fleetHealth();},get sinkProgress(){return sinkingShip?Math.min(1,(time-sinkingShip.sunkAt)/balance.sinkSeconds):0;},
  get yaw(){return yaw;},get elevation(){return elevation;},get sway(){return navalSway(seed,time,balance);},get warningId(){return resupplyTime>0?'naval.campaign.resupplying':null;},
  targetAt:(x,y)=>navalWaterAt(x,y,camera,config.width,config.height,balance),screenPoint:(x,z,y=0)=>projectNavalPoint(navalWorldPoint(x,z,balance,y),camera,config.width,config.height),statusValues(){return {round:1,wave,lives:Math.ceil(playerShip.hp),enemyLives:Math.ceil(enemyShip.hp)};},
  update(dt,input=EMPTY){
   if(result||dt<=0)return;const frozen=input.fireRelease&&aiming?{...aim}:null;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;delay=Math.max(0,delay-dt);remaining=Math.max(0,remaining-dt);blast.life=Math.max(0,blast.life-dt);repairLife=Math.max(0,repairLife-dt);playerShip.recoil=Math.max(0,playerShip.recoil-dt);for(let i=0;i<cooldowns.length;i++)cooldowns[i]=Math.max(0,cooldowns[i]-dt);
   const mv=balance.movement,steering=navalSteeringInput(input.moveX||0,input.moveZ||0,camera.heading,balance.controls.deadzone),desiredSpeed=steering.throttle*mv.speed*(1+(equipment.ammo||0)*.15);
   moving=steering.active;
   playerShip.speed+=(desiredSpeed-playerShip.speed)*(1-Math.exp(-(moving?5.5:8)*dt));if(playerShip.speed<.03)playerShip.speed=0;
   if(moving){const delta=angleDelta(steering.heading,playerShip.heading),turn=Math.min(Math.abs(delta),Math.max(2.7,mv.turnSpeed*2.1)*dt);playerShip.heading+=Math.sign(delta)*turn;}
   playerShip.x=Math.max(mv.minX,Math.min(mv.maxX,playerShip.x+Math.cos(playerShip.heading)*playerShip.speed*dt));playerShip.z=Math.max(mv.minZ,Math.min(mv.maxZ,playerShip.z+Math.sin(playerShip.heading)*playerShip.speed*dt));
   if(playerShip.speed>1&&(!trail.length||time-trail.at(-1).time>.07)){trail.push({x:playerShip.x,z:playerShip.z,heading:playerShip.heading,time,speed:playerShip.speed});if(trail.length>48)trail.shift();}while(trail.length&&time-trail[0].time>2.8)trail.shift();
   updateFleet(dt);
   for(let i=enemyShots.length-1;i>=0;i--){const p=enemyShots[i];p.age=Math.min(p.duration,p.age+dt);const u=p.age/p.duration;p.x=p.fromX+(p.targetX-p.fromX)*u;p.z=p.fromZ+(p.targetZ-p.fromZ)*u;if(u>=1){impact(p);enemyShots.splice(i,1);}}
   if(Number.isInteger(input.ammoIndex))ammoIndex=Math.max(0,Math.min(ammo.length-1,input.ammoIndex));
   if(input.ammo&&!wasAmmo){for(let i=1;i<=ammo.length;i++){const next=(ammoIndex+i)%ammo.length;if(ammo[next]>0){ammoIndex=next;break;}}}wasAmmo=Boolean(input.ammo);
   if(Number.isInteger(input.selectTargetIndex)&&enemies.some(e=>e.index===input.selectTargetIndex&&e.active&&e.hp>0)){selectedTargetIndex=input.selectTargetIndex;if(aiming)lock(selectedTargetIndex);else{const e=enemies[selectedTargetIndex];Object.assign(aim,navalLead(playerShip,e,balance,ammoIndex,equipment));}}
   if(Number.isFinite(input.yaw))yaw=input.yaw;if(Number.isFinite(input.elevation))elevation=input.elevation;
   if(input.angularAim)Object.assign(aim,navalTrajectory(playerShip,yaw,elevation,balance));
   if(Number.isFinite(input.targetX))aim.x=Math.max(targeting.minX,Math.min(targeting.maxX,input.targetX));if(Number.isFinite(input.targetZ))aim.z=Math.max(targeting.minZ,Math.min(targeting.maxZ,input.targetZ));
   if(input.autoAim){const e=enemies.find(e=>e.index===selectedTargetIndex&&targetable(e))||enemies.find(targetable);if(e)Object.assign(aim,navalLead(playerShip,e,balance,ammoIndex,equipment));}else if(input.assistAim)Object.assign(aim,navalSoftAim(aim,enemies,balance,level,ammoIndex));
   if(input.aimHeld){if(!aiming||!model.lockedTarget?.hp)lock();aiming=true;sampleReticle();}else if(!input.fireRelease){aiming=false;lockedTargetIndex=null;}
   yaw=Math.atan2(aim.z-playerShip.z,aim.x-playerShip.x);camera=navalCameraPose(playerShip,model.lockedTarget||aim,aiming,balance,camera,dt,framing());
   for(let i=mines.length-1;i>=0;i--){const mine=mines[i];mine.age+=dt;mine.life-=dt;const e=mine.age>=balance.weapons.mineArmSeconds&&enemies.find(e=>e.active&&e.hp>0&&Math.hypot(e.x-mine.x,e.z-mine.z)<=balance.weapons.mineRadius);if(e){mine.targetX=mine.x;mine.targetZ=mine.z;mine.victim=e.index;impact(mine);mines.splice(i,1);}else if(mine.life<=0)mines.splice(i,1);}
   for(let i=extraShots.length-1;i>=0;i--){advanceProjectile(extraShots[i],dt);if(!extraShots[i].active)extraShots.splice(i,1);}advanceProjectile(ball,dt);
   const missionState=navalMissionState(mission,enemies);
   if(playerShip.hp<=0){finish('lose');return;}
   if(missionState.complete){if(delay<=0)finish('win');return;}
   if(enemyShip.hp<=0){enemyShip=enemies.find(e=>e.hp>0);wave=enemyShip.index+1;}
   if(phase==='sink'&&delay<=0)phase=ball.active?'shot':'aim';
   if(remaining<=0){finish('lose');return;}
   const useful=[0,1,2,4].some(i=>ammo[i]>0),inFlight=ball.active||extraShots.length>0;
   if(!useful&&!inFlight){resupplyTime+=dt;if(resupplyTime>=2){ammo[0]=6;resupplyTime=0;resupplies++;feedback('resupply',playerShip.x,playerShip.z);}}else resupplyTime=0;
   const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
   if(input.fireRelease){if(!frozen&&!input.releaseTarget)lock();const point=input.releaseTarget||frozen||{...aim};if(Number.isInteger(point.target))lockedTargetIndex=point.target;shoot(point,true);aiming=false;}
   else if(pressed)shoot();
  },
  snapshot(){return {difficulty:mode,selectedTargetIndex,lockedTargetIndex,reticle:model.reticle,rangeState:model.rangeState,mission:{...mission,...model.missionState},resupplyTime,resupplies,lastFeedback:lastFeedback&&{...lastFeedback},wind:{...wind},moving,returning:false,returnTime:0,aiming,camera:JSON.parse(JSON.stringify(camera)),fired,hits,heat:0,overheated:false,enemyFired,enemyShots:enemyShots.map(e=>({...e})),composition:fleet.map(e=>e.kind).join(),yaw,elevation,sway:model.sway,playerPercent:healthPercent(playerShip.hp,playerShip.maxHp),enemyPercent:healthPercent(enemyShip.hp,enemyShip.maxHp),extraShots:extraShots.map(p=>({...p})),mines:mines.map(p=>({...p})),repairLife,lastAction:lastAction&&{...lastAction},warningId:model.warningId,lives:playerShip.hp,maxLives:playerShip.maxHp,enemyLives:enemyShip.hp,phase,round:1,wave,time,enemyX:enemyShip.x,score,result,attacker:enemies[0].index,ball:{...ball},blast:{...blast},aim:{...aim},playerShip:{...playerShip},enemyShip:{...enemyShip},enemyFleetHp:fleetHealth(),maxEnemyFleet,boss:enemyShip.boss,ammoIndex,ammo:[...ammo],cooldowns:[...cooldowns],remaining,enemies:enemies.map(e=>({...e,attack:e.attack&&{...e.attack}}))};}
 };updateFleet(0);Object.assign(aim,{x:enemies[0].x,z:enemies[0].z});camera=navalCameraPose(playerShip,aim,false,balance,undefined,0,framing());return model;
}

export function drawNaval(p,m,{config,balance,art,quality,view,t}){
  const v=config.visuals,palette=v.palette,full3d=view?.draw(p),project=(x,z,y=0)=>view?.projectTarget?.(x,z,y)||m.screenPoint(x,z,y);
  if(!full3d){
    p.fillStyle=balance.render.sea;p.fillRect(0,0,config.width,config.height);p.strokeStyle=palette.waveGlint;p.lineWidth=2;
    for(let y=30;y<config.height;y+=quality.low?70:35)for(let x=0;x<config.width;x+=48){const sway=Math.sin(m.time*2+y+x)*3;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+12,y+6+sway,x+28,y);p.stroke();}
    const draw=(e,sprite,scale)=>{const q=project(e.x,e.z||0);p.save();p.translate(q.x,q.y+(e.hp<=0?m.sinkProgress*45:0));p.rotate((e===m.playerShip?-e.heading:Math.PI/2)+Math.sin(m.time*2)*.025);p.drawImage(sprite,-53*scale,-65*scale,106*scale,101*scale);p.restore();};
    draw(m.playerShip,art.player,1.2);for(const e of m.enemies)if(e.active)draw(e,e.boss?art.boss:art.enemies[e.kind],.75*balance.shipTypes[e.kind].scale);
    for(const projectile of [...m.extraShots,...(m.ball.active?[m.ball]:[])]){const q=project(projectile.x,projectile.z,navalProjectileHeight(projectile.ammo,projectile.age/projectile.duration,m.time,balance));oval(p,q.x,q.y,projectile.ammo===2?3:4,projectile.ammo===2?10:4,palette.shell);}
    if(m.blast.life>0){const q=project(m.blast.x,m.blast.z),t=1-m.blast.life/v.blastSeconds;p.globalAlpha=1-t;oval(p,q.x,q.y,10+t*40,6+t*25,m.blast.hit?palette.blast:v.foam);p.globalAlpha=1;}
  }
  if(!full3d)for(const e of m.enemyShots){const q=project(e.x,e.z,navalProjectileHeight(e.kind,e.age/e.duration,m.time,balance));oval(p,q.x,q.y,e.kind===2?4:3,e.kind===2?8:3,palette.shell);}
  if(!full3d&&m.playerShip.recoil>0){const q=project(m.playerShip.x,m.playerShip.z),life=m.playerShip.recoil/config.visuals.recoilSeconds;p.globalAlpha=life;oval(p,q.x,q.y-16,8+life*12,5+life*10,palette.blast);p.globalAlpha=1;}
  drawNavalHud(p,m,{config,balance,art,t},project);
  const target=project(m.aim.x,m.aim.z);
  for(const mine of m.mines){const q=project(mine.x,mine.z,.2);if(q.depth<=0)continue;p.strokeStyle='#51396b';p.fillStyle=NAVAL_WEAPON_COLORS[3];p.lineWidth=3;p.beginPath();p.arc(q.x,q.y,8,0,TAU);p.fill();p.stroke();for(let i=0;i<8;i++){const a=i*TAU/8;p.beginPath();p.moveTo(q.x+Math.cos(a)*7,q.y+Math.sin(a)*7);p.lineTo(q.x+Math.cos(a)*12,q.y+Math.sin(a)*12);p.stroke();}}
  if(m.repairLife>0){const q=project(m.playerShip.x,m.playerShip.z,1),u=m.repairLife/balance.weapons.repairSeconds;p.save();p.globalAlpha=u;p.strokeStyle=NAVAL_WEAPON_COLORS[5];p.lineWidth=4;p.beginPath();p.ellipse(q.x,q.y,30+(1-u)*22,14+(1-u)*10,0,0,TAU);p.stroke();for(let i=0;i<6;i++){const x=q.x+Math.cos(i*TAU/6)*28,y=q.y-15-(1-u)*45+i%2*12;p.beginPath();p.moveTo(x-5,y);p.lineTo(x+5,y);p.moveTo(x,y-5);p.lineTo(x,y+5);p.stroke();}p.restore();}
  const projectiles=full3d?[]:[...m.extraShots,...(m.ball.active?[m.ball]:[])];for(const b of projectiles)if(b.ammo===1||b.ammo===4){const q=project(b.x,b.z,navalProjectileHeight(b.ammo,b.age/b.duration,m.time,balance));if(q.depth>0){p.fillStyle=NAVAL_WEAPON_COLORS[b.ammo];p.beginPath();p.ellipse(q.x,q.y,b.ammo===1?4:5,b.ammo===1?9:5,0,0,TAU);p.fill();}}
  if(m.aiming&&target.depth>0){const color=NAVAL_WEAPON_COLORS[m.ammoIndex];p.strokeStyle=color;p.lineWidth=2.5;p.beginPath();p.ellipse(target.x,target.y,13,7,0,0,TAU);p.moveTo(target.x-22,target.y);p.lineTo(target.x-7,target.y);p.moveTo(target.x+7,target.y);p.lineTo(target.x+22,target.y);p.moveTo(target.x,target.y-17);p.lineTo(target.x,target.y-5);p.moveTo(target.x,target.y+5);p.lineTo(target.x,target.y+17);p.stroke();
   p.strokeStyle=color;p.lineWidth=2;p.setLineDash([5,6]);p.beginPath();for(let i=0;i<=balance.aim.previewSegments;i++){const u=i/balance.aim.previewSegments*balance.aim.previewFraction,q=project(m.playerShip.x+(m.aim.x-m.playerShip.x)*u-(m.reticle?.windX||0)*u*(1-u),m.playerShip.z+(m.aim.z-m.playerShip.z)*u-(m.reticle?.windZ||0)*u*(1-u),navalProjectileHeight(m.ammoIndex,u,m.time,balance));if(i)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);}p.stroke();p.setLineDash([]);
  }

}
export function startNaval(ctx){
 if(!document.querySelector('[data-naval-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./naval.css?v=island-nitro-20261025-1',import.meta.url).href;link.dataset.navalStyle='';document.head.append(link);}
 if(!document.querySelector('[data-g6e-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./g6e-naval.css?v=island-nitro-20261025-1',import.meta.url).href;link.dataset.g6eStyle='';document.head.append(link);}
 let model,view,storage;const picker=mountNavalWeaponPicker(ctx,()=>model);try{storage=globalThis.localStorage;}catch{}const audio=createNavalAudio({storage});const audioEvents=new AbortController();for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>audio.unlock(),{signal:audioEvents.signal});const input=createNavalInput(ctx,()=>model,()=>view);
 try{
  const session=runCanvasGame({...ctx,config:{...ctx.config,height:ctx.balance.render.height}},args=>{model=createNavalModel({...args,sound:audio.play});const update=model.update;model.update=(dt,raw)=>{update(dt,input.sample(raw));audio.update(model.playerShip.speed||0,model.time);picker.update();};return model;},drawNaval,(args,m)=>view=createNavalView(args,m));
  const dispose=session.dispose,pause=session.setPaused;session.dispose=()=>{picker.dispose();audioEvents.abort();audio.dispose();input.dispose();dispose();};session.setPaused=value=>{audio.setPaused(value);input.reset();pause(value);};if(session.debug)session.debug.audio=audio;return session;
 }catch(error){picker.dispose();audioEvents.abort();audio.dispose();input.dispose();throw error;}
}
