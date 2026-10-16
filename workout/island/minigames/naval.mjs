import {runCanvasGame} from './canvas-session.mjs?v=g3b-20261016-1';
import {oval,drawHealthBar} from './art.mjs?v=g3b-20261016-1';
import {createNavalView} from './naval-view.mjs?v=g3b-20261016-1';
const EMPTY=Object.freeze({}),TAU=Math.PI*2;
export function createShipEntity(x,maxHp,shield=0){return {x,hp:maxHp,maxHp,shield,maxShield:shield,recoil:0};}
export function navalScreenPoint(x,z,config,balance){return {x:config.width/2+z*.85,y:config.height*.8-(x-balance.shipX)*1.05};}
export function navalTargetAt(x,y,config,balance){return {x:balance.shipX+(config.height*.8-y)/1.05,z:(x-config.width/2)/.85};}
/** Target coordinates are shared by collision, flight and the visible sea ring. */
export function createNavalModel({config,balance,level,random,power=1,equipment=EMPTY,sound=()=>{}}){
  const settings=balance.levels[level-1],targeting=balance.targeting;
  let score=0,round=1,phase='aim',delay=0,result,time=0,wasFiring=false,wasAmmo=false,wave=1,fired=0,hits=0,ammoIndex=0,remaining=settings.seconds,sinkingShip=null,attacker;
  const playerShip=createShipEntity(balance.shipX,settings.lives*power*(equipment.hull||1),equipment.shield||0);
  const enemies=Array.from({length:settings.waves},(_,i)=>{const kind=i%settings.shipKinds,boss=level%balance.boss.everyStages===0&&i===settings.waves-1;return {...createShipEntity(balance.enemyX,settings.enemyLives*balance.shipTypes[kind].hp*(boss?balance.boss.hp:1)),kind,boss,index:i,z:(i-(Math.min(settings.concurrent,settings.waves)-1)/2)*balance.combat.laneSpacing,active:i<settings.concurrent};});
  let enemyShip=enemies[0];attacker=enemyShip;
  const maxEnemyFleet=enemies.reduce((sum,e)=>sum+e.hp,0),ammo=settings.ammunition.map(n=>n+(equipment.ammo||0)),cooldowns=ammo.map(()=>0);
  const aim={x:balance.enemyX,z:0},blast={x:0,y:balance.shipY,z:0,life:0,hit:false},ball={x:balance.shipX,y:balance.shipY,z:0,owner:'player',ammo:0,age:0,duration:0,fromX:0,fromZ:0,targetX:0,targetZ:0,vx:0,vy:0,vz:0};
  const trail=[];
  function fleetHealth(){return enemies.reduce((sum,e)=>sum+Math.max(0,e.hp),0);}
  function finish(outcome){result={outcome,score:Math.min(score,balance.maximumScore),performance:.7*hits/Math.max(1,fired)+.3*Math.max(0,playerShip.hp)/playerShip.maxHp};}
  function shoot(owner){
    if(owner==='player'){if(ammo[ammoIndex]<=0)return;fired++;ammo[ammoIndex]--;ball.ammo=ammoIndex;ball.fromX=balance.shipX;ball.fromZ=0;ball.targetX=aim.x;ball.targetZ=aim.z;}
    else{ball.ammo=0;ball.fromX=attacker.x;ball.fromZ=attacker.z;ball.targetX=balance.shipX+(random()-.5)*settings.enemyAimError*250;ball.targetZ=(random()-.5)*settings.enemyAimError*180;}
    ball.owner=owner;ball.source=owner==='player'?enemyShip.index:attacker.index;ball.x=ball.fromX;ball.z=ball.fromZ;ball.y=balance.shipY;ball.age=0;ball.duration=targeting.flightSeconds+Math.hypot(ball.targetX-ball.fromX,ball.targetZ-ball.fromZ)*targeting.secondsPerRange;
    (owner==='player'?playerShip:attacker).recoil=config.visuals.recoilSeconds;phase='shot';sound('cannon');
  }
  function impact(){
    blast.x=ball.targetX;blast.z=ball.targetZ;blast.y=balance.shipY;blast.life=config.visuals.blastSeconds;blast.hit=false;
    const radius=targeting.radius*balance.ammo[ball.ammo].width;
    const victim=ball.owner==='player'?enemies.find(e=>e.active&&e.hp>0&&Math.hypot(e.x-blast.x,e.z-blast.z)<=radius):Math.hypot(blast.x-balance.shipX,blast.z)<=radius?playerShip:null;
    if(victim){blast.hit=true;sound('explosion');
      if(ball.owner==='player'){hits++;const type=balance.ammo[ball.ammo];victim.hp=Math.max(0,victim.hp-settings.damage*power*(equipment.damage||1)*type.damage*(1+(settings.weaponLevel-1)*.1));score+=balance.hitPoints;if(type.heal)playerShip.hp=Math.min(playerShip.maxHp,playerShip.hp+type.heal);}
      else{const damage=settings.damage*balance.shipTypes[attacker.kind].damage*(attacker.boss?balance.boss.damage:1),absorbed=Math.min(playerShip.shield,damage);playerShip.shield-=absorbed;playerShip.hp=Math.max(0,playerShip.hp-damage+absorbed);}
    }else sound('splash');
    if(playerShip.hp<=0||victim&&victim!==playerShip&&victim.hp<=0){sinkingShip=victim;phase='sink';delay=balance.sinkSeconds;if(victim!==playerShip)score+=Math.ceil(playerShip.hp)*balance.survivalPoints;}
    else{phase=ball.owner==='player'?'enemy':'aim';delay=balance.turnPauseSeconds/(equipment.rate||1);if(ball.owner==='enemy')round++;}
  }
  const model={settings,ball,aim,blast,trail,playerShip,enemies,ammo,cooldowns,maxEnemyFleet,equipment,statusId:'minigame.navalStatus',
    targetAt:(x,y)=>navalTargetAt(x,y,config,balance),screenPoint:(x,z)=>navalScreenPoint(x,z,config,balance),
    get enemyShip(){return enemyShip;},get remaining(){return remaining;},get score(){return score;},get lives(){return playerShip.hp;},get maxLives(){return playerShip.maxHp;},get wave(){return wave;},get enemyX(){return enemyShip.x;},get shipScale(){return balance.shipTypes[enemyShip.kind].scale;},get boss(){return enemyShip.boss;},get result(){return result;},get phase(){return phase;},get enemyLives(){return enemyShip.hp;},get time(){return time;},get ammoIndex(){return ammoIndex;},get enemyFleetHp(){return fleetHealth();},get sinkProgress(){return phase==='sink'?1-delay/balance.sinkSeconds:0;},
    get warningId(){return ammo.every(n=>n<=0)?'minigame.noAmmo':null;},
    statusValues(){return {round,wave,lives:Math.ceil(playerShip.hp),enemyLives:Math.ceil(enemyShip.hp)};},
    update(dt,input=EMPTY){
      if(result||dt<=0)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;remaining=Math.max(0,remaining-dt);delay=Math.max(0,delay-dt);blast.life=Math.max(0,blast.life-dt);playerShip.recoil=Math.max(0,playerShip.recoil-dt);
      const visibleCount=Math.min(settings.concurrent,enemies.filter(e=>e.hp>0).length);let active=0;for(const e of enemies){e.recoil=Math.max(0,e.recoil-dt);e.active=e.hp>0&&active<settings.concurrent||phase==='sink'&&e===sinkingShip;const lane=active;if(e.active&&e.hp>0)active++;e.x=balance.enemyX+Math.sin(time*balance.shipTypes[e.kind].speed+e.index)*settings.drift;e.z=(lane-(visibleCount-1)/2)*balance.combat.laneSpacing+Math.cos(time*.6+e.index)*settings.drift*.08;}
      const pressed=Boolean(input.firing&&!wasFiring);wasFiring=Boolean(input.firing);
      if(Number.isInteger(input.ammoIndex)&&input.ammoIndex>=0&&input.ammoIndex<ammo.length)ammoIndex=input.ammoIndex;
      if(input.ammo&&!wasAmmo){for(let i=1;i<=ammo.length;i++){const next=(ammoIndex+i)%ammo.length;if(ammo[next]>0){ammoIndex=next;break;}}}wasAmmo=Boolean(input.ammo);
      if(Number.isFinite(input.targetX))aim.x=Math.max(targeting.minX,Math.min(targeting.maxX,input.targetX));
      if(Number.isFinite(input.targetZ))aim.z=Math.max(targeting.minZ,Math.min(targeting.maxZ,input.targetZ));
      if(phase==='sink'){
        if(delay<=0){if(playerShip.hp<=0)finish('lose');else if(fleetHealth()<=0)finish('win');else{enemyShip=enemies.find(e=>e.hp>0);wave=enemyShip.index+1;sinkingShip=null;phase='aim';}}return;
      }
      if(remaining<=0||round>settings.rounds){finish('lose');return;}
      // The last projectile resolves before exhaustion is evaluated, so it can win.
      if(phase!=='shot'&&ammo.every(n=>n<=0)){finish('lose');return;}
      if(phase==='aim'&&pressed&&delay<=0&&ammo[ammoIndex]>0)shoot('player');
      else if(phase==='enemy'&&delay<=0){const fleet=enemies.filter(e=>e.active&&e.hp>0);attacker=fleet[(round-1)%fleet.length];shoot('enemy');}
      else if(phase==='shot'){
        ball.age=Math.min(ball.duration,ball.age+dt);const t=ball.age/ball.duration;ball.x=ball.fromX+(ball.targetX-ball.fromX)*t;ball.z=ball.fromZ+(ball.targetZ-ball.fromZ)*t;ball.y=balance.shipY-(ball.ammo===2?0:Math.sin(t*Math.PI)*targeting.arcHeight);
        if(t>=1)impact();
      }
    },
    snapshot(){return {warningId:model.warningId,lives:playerShip.hp,maxLives:playerShip.maxHp,enemyLives:enemyShip.hp,phase,round,wave,time,enemyX:enemyShip.x,score,result,attacker:attacker.index,ball:{...ball},blast:{...blast},aim:{...aim},playerShip:{...playerShip},enemyShip:{...enemyShip},enemyFleetHp:fleetHealth(),maxEnemyFleet,boss:enemyShip.boss,ammoIndex,ammo:[...ammo],cooldowns:[...cooldowns],remaining,enemies:enemies.map(e=>({...e}))};}
  };return model;
}
export function drawNaval(p,m,{config,balance,art,quality,view}){
  const v=config.visuals,palette=v.palette,full3d=view?.draw(p),project=(x,z)=>view?.projectTarget?.(x,z)||navalScreenPoint(x,z,config,balance);
  if(!full3d){
    p.fillStyle=balance.render.sea;p.fillRect(0,0,config.width,config.height);p.strokeStyle=palette.waveGlint;p.lineWidth=2;
    for(let y=30;y<config.height;y+=quality.low?70:35)for(let x=0;x<config.width;x+=48){const sway=Math.sin(m.time*2+y+x)*3;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+12,y+6+sway,x+28,y);p.stroke();}
    const draw=(e,sprite,scale)=>{const q=project(e.x,e.z||0);p.save();p.translate(q.x,q.y+(e.hp<=0?m.sinkProgress*45:0));p.rotate(Math.sin(m.time*2)*.025);p.drawImage(sprite,-53*scale,-65*scale,106*scale,101*scale);p.restore();if(e!==m.playerShip)drawHealthBar(p,q.x-25,q.y-65*scale,50,5,e.hp,e.maxHp,config);};
    draw(m.playerShip,art.player,1.2);for(const e of m.enemies)if(e.active)draw(e,e.boss?art.boss:art.enemies[e.kind],.75*balance.shipTypes[e.kind].scale);
    if(m.phase==='shot'){const q=project(m.ball.x,m.ball.z);oval(p,q.x,q.y-(balance.shipY-m.ball.y)*.6,m.ball.ammo===2?5:6,m.ball.ammo===2?12:6,palette.shell);}
    if(m.blast.life>0){const q=project(m.blast.x,m.blast.z),t=1-m.blast.life/v.blastSeconds;p.globalAlpha=1-t;oval(p,q.x,q.y,10+t*40,6+t*25,m.blast.hit?palette.blast:v.foam);p.globalAlpha=1;}
  }
  p.fillStyle=v.hpBack;p.globalAlpha=.8;p.beginPath();p.roundRect(config.width-180,8,170,55,9);p.fill();p.globalAlpha=1;p.font='12px sans-serif';p.textAlign='right';p.fillStyle=v.foam;p.fillText(art.fleetLabel,config.width-20,24);p.fillText(art.enemyFleetLabel,config.width-20,48);drawHealthBar(p,config.width-168,16,80,6,m.lives,m.maxLives,config);drawHealthBar(p,config.width-168,40,80,6,m.enemyFleetHp,m.maxEnemyFleet,config);
  const q=project(m.aim.x,m.aim.z);p.strokeStyle=palette.gold;p.lineWidth=3;p.beginPath();p.ellipse(q.x,q.y,22,13,0,0,TAU);p.stroke();oval(p,q.x,q.y,3,3,palette.white);
  for(const [dx,dy]of [[-28,0],[28,0],[0,-19],[0,19]]){p.beginPath();p.moveTo(q.x+dx,q.y+dy);p.lineTo(q.x+dx*.7,q.y+dy*.7);p.stroke();}
}
export function startNaval(ctx){return runCanvasGame({...ctx,config:{...ctx.config,height:ctx.balance.render.height}},createNavalModel,drawNaval,createNavalView);}
