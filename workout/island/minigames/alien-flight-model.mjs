import {moveAlienPlayer} from './g2m-motion.mjs?v=island-v2-20261107-11';
import {availableAlienUpgrades} from '../activity/alien-upgrades.mjs?v=island-v2-20261107-11';
import {createPool,releaseAt} from './pool.mjs?v=island-v2-20261107-11';
import {alienV9Enabled,alienV9Hp} from './alien-v9.mjs';
import {alienV12Enabled} from './alien-v12.mjs';
import {alienV13Enabled} from './alien-v13.mjs';
import {alienV14Enabled,gearFactor,heatStep} from './alien-v14.mjs';
import {alienV15Enabled,v15Config,fireGate,fireInterval,shotDamage,createSpawnCap,v15RateCap,convergeVx} from './alien-v15.mjs?v=island-v2-20261107-11';
import {alienMoveEnabled,moveConfig,alienMoveStep} from './alien-move.mjs?v=island-v2-20261107-11';
import {alienFireV23Enabled,v23Config,vulcanGate,vulcanShot} from './alien-v23.mjs?v=island-v2-20261107-11';
import {alienV11Enabled,blastRule} from './alien-v11.mjs';
import {alienV10Enabled,nearestAlien,steerMissile} from './alien-v10.mjs';
import {createAlienEntity,separateAliens,alienStack,segmentContact} from './alien-flight-combat.mjs';
const EMPTY=Object.freeze({}),TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function createAlienModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY,permanentUpgrades=EMPTY,hangar=EMPTY,careerWins=Math.max(0,level-1),roundChoices=true,completion='survival',onUpgrade=()=>{},sound=()=>{}}){
 level=clamp(Math.floor(level)||1,1,balance.levels.length);
 const settings={...balance.levels[level-1]},campaign=balance.campaign,v9=balance.v9&&alienV9Enabled()?balance.v9:null,v10=balance.v10&&alienV10Enabled()?balance.v10:null,v11=balance.v11&&alienV11Enabled()?balance.v11:null,v12=balance.v12&&alienV12Enabled()?balance.v12:null,v13=balance.v13&&alienV13Enabled()?balance.v13:null,v14=balance.v14&&alienV14Enabled()?balance.v14:null,v15=v14&&alienV15Enabled()?v15Config(balance):null,move=v15&&alienMoveEnabled()?moveConfig(balance):null,hpAdd=v9?alienV9Hp(v9,level):0,hpGear=v9?1+(v9.upgradeHp||0)*(((equipment.damage||1)*(equipment.rate||1)*(1+(hangar.rapid||0)*balance.hangar.rankRate)*(v10?1:1+.5*((permanentUpgrades.wing||0)+(equipment.weapon||0))))-1):1;if(v9){settings.seconds=Math.round(settings.seconds*v9.secondsMult);settings.waves+=v9.extraWaves||0;settings.lives+=v9.livesAdd||0;}
 if(v11)settings.shotSeconds*=v11.shotSecondsMult;
 if(v15)settings.seconds=Math.round(settings.seconds*v15.secondsMult);
 // v23 (13/11/2026): two weapons on two buttons (steady cannon on input.firing, Vulcan on input.vulcan). Built on v15; ?alienFire=v15 keeps the v22 gate.
 const v23=v15&&alienFireV23Enabled()?v23Config(balance):null;
 const rateK=v12?(v14?v14.rateMult:v12.rateMult):1,dmgK=v12?(v14?v14.rateMult*v14.damageTrim:v12.rateMult*v12.damageTrim):1;
 if(v12)settings.shotSeconds*=rateK;
 const hpGear14=v14?Math.pow(gearFactor({rateCap:v15?v15RateCap(v15):settings.shotSeconds/v14.minInterval,equipment,permanentUpgrades,hangar,power,rankRate:balance.hangar.rankRate,stacks:{damage:alienStack(campaign,'damage',permanentUpgrades.damage||0),rapid:alienStack(campaign,'rapid',permanentUpgrades.rapid||0),laser:alienStack(campaign,'laser',permanentUpgrades.laser||0)}}),v15?v15.gearExp:v14.gearExp):1;
 let heat=0,coolLeft=0,overheats=0,shotsBurst=0,gate={heat:0,cool:0,spent:false},fireMode='idle',burstShots=0,steadyShots=0;const spawnCap=v15?createSpawnCap(v15):null;
 let vgate={heat:0,lock:0,rest:0},vulcanTime=0,vulcanSide=1,shotMode='normal',regularOn=false,vulcanOn=false,regularFired=0,vulcanFired=0;
 const behavior={motion:'drift',shoots:true,shield:0,warningSeconds:.7,bulletCap:12,fireCadence:settings.boltSeconds,diveEverySeconds:balance.tactics.diveEverySeconds,...balance.stageBehaviors[level-1]};
 if(v9)behavior.fireCadence*=v9.boltSecondsMult||1;
 if(v10&&v10.earlyBolt[level-1])behavior.fireCadence*=v10.earlyBolt[level-1];
 if(v11&&v11.earlyBolt[level-1]){behavior.fireCadence*=v11.earlyBolt[level-1];behavior.bulletCap=Math.max(behavior.bulletCap,v11.bulletCap[level-1]);}
 const player={x:config.width/2,y:config.height-balance.playerBottom,vx:0,bank:0,recoil:0};
 const aliens=[],shots=[],bolts=[],sparks=[],pickups=[],loot=[],telegraphs=[];
 const ap=createPool(balance.maxAliens),sp=createPool(balance.maxShots*(v12?v12.maxShotsMult:1)),bp=createPool(balance.maxBolts),fp=createPool(balance.maxSparks),pp=createPool(balance.pickups.max),lp=createPool(campaign.maxLoot);
 const upgrades=Object.fromEntries(campaign.choiceIds.map(id=>[id,permanentUpgrades[id]||0])),choices=[];
 const wings=Array.from({length:campaign.maxWings},(_,i)=>({x:0,y:0,active:false,side:i?1:-1}));
 let maxLives=Math.ceil(settings.lives*power)+(bonuses.shield||0)+(equipment.shield||0)+(permanentUpgrades.shield||0)+(hangar.shield||0);
 let lives=Math.max(1,maxLives-Math.min(maxLives-1,hangar.damage||0)),wave=1,time=0,score=0,kills=0,fired=0,hits=0,coins=0,crystals=0;
 let invulnerable=0,shotTime=0,boltTime=1.5,diveTime=balance.tactics.firstDiveSeconds,formationAge=0,nextWave=0,serial=0,result,choosing=false;
 let combo=0,comboTime=0,celebration=0,powerup=-1,powerTime=0,spreadTime=0,spreadCooldown=0,wingTime=0,novaCharges=balance.nova.charges,novaPressed=false,dropSerial=0,pendingBonuses=0,bonusX=0,bonusY=0,spawned=0;
 let cannonSide=1,lastShotAt=-9,spinRate=0,spinAngle=0,hitSoundCool=0;const cannonLast=[-9,-9];
 let fanSerial=0,blastCool=0,laserTimer=v11?v11.laserEvery[0]:0,laserLeft=0,laserGap=0,lasersFired=0,blastsMade=0,sinceBonusKills=0,sinceBonusTime=0,powerMax=0;const blasts=[];
 let feedbackSerial=0,boltsFired=0,playerHits=0,missilesFired=0,missilesHit=0,wingMax=0;const feedback={id:0,kind:'wave',x:player.x,y:player.y,value:1,life:0};
 const nova={x:player.x,y:player.y,angle:-Math.PI/2,targetId:null,targetX:0,targetY:0,trail:[],flightMax:0,life:0,flight:0,fromX:0,fromY:0,radius:balance.nova.radius,stopY:config.height*balance.nova.stopYFraction,hitId:null};
 const status={score:0,lives,wave,waves:settings.waves,nova:novaCharges};
 const aspect=()=>model.effectAspect||1;
 function signal(kind,x,y,value,life=.8){Object.assign(feedback,{id:++feedbackSerial,kind,x,y,value,life});}
 function bossGuard(a){
  if(!a.boss)return 0;
  const duration=Math.max(0,balance.balance?.minBossSeconds||0),active=Math.max(0,a.age-2),step=duration/3;
  const floor=a.entry>0?a.maxHp:active<step?a.maxHp*2/3:active<step*2?a.maxHp/3:active<duration?1:0;
  a.guardRemaining=a.entry>0?a.entry:floor?Math.max(0,(active<step?step:active<step*2?step*2:duration)-active):0;
  a.guardActive=floor>0&&a.hp<=floor+.0001;return floor;
 }
 function damageAlien(a,amount){
  const floor=bossGuard(a),before=a.hp;a.hp=Math.min(before,Math.max(floor,a.hp-amount));bossGuard(a);
  if(a.guardActive&&before-a.hp<amount&&!(feedback.kind==='boss-guard'&&feedback.life>0))signal('boss-guard',a.x,a.y,a.guardRemaining,.65);
  return before-a.hp;
 }
 function burst(x,y){for(let i=0;i<balance.sparkCount;i++){const a=random()*TAU,s=fp.take(x,y,Math.cos(a)*balance.sparkSpeed,Math.sin(a)*balance.sparkSpeed,balance.sparkSeconds);if(s)sparks.push(s);}}
 function spawn(x,y,kind,child=false,bossHp=0){
  const a=createAlienEntity(ap,balance,x,y,kind,level,random()*TAU,child,bossHp);if(!a)return null;
  if(!bossHp){a.hp=v14?Math.max(.75,(balance.enemyTypes[kind].hp*(settings.enemyHpScale||1)*(child?1:Math.min(1.5,1+(level-1)*balance.hpPerStage))+(child?0:hpAdd))*(child?1:hpGear14)):Math.max(.75,balance.enemyTypes[kind].hp*(settings.enemyHpScale||1)*(child?1:Math.min(1.5,1+(level-1)*balance.hpPerStage))*(child?1:hpGear)+(child?0:hpAdd));a.maxHp=a.hp;}
  Object.assign(a,{id:++serial,originY:y,shield:child||bossHp?0:Math.max(behavior.shield,balance.enemyTypes[kind].shield||0),entrySide:0,entry:child?0:balance.formation.entrySeconds,mineTime:balance.enemyTypes[kind].mineSeconds||0,facing:1});aliens.push(a);return a;
 }
 const pattern=()=>settings.formations?.[(wave-1)%settings.formations.length]||campaign.patterns[(wave-1)%settings.patternKinds];
 function formation(){
  formationAge=0;spawned=0;diveTime=balance.tactics.firstDiveSeconds;boltTime=1.5;nextWave=0;
  const bossWave=settings.boss&&wave===settings.waves,rows=bossWave?Math.min(2,settings.rows):settings.rows,cols=settings.columns,roster=settings.enemyRoster||Array.from({length:settings.enemyKinds},(_,i)=>i),layout=pattern();
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const index=row*cols+col,count=rows*cols,cx=(cols-1)/2,spacing=Math.min(balance.formation.colGap,(config.width-80)/Math.max(1,cols-1));
   let x=config.width/2+(col-cx)*spacing,y=62+row*balance.formation.rowGap;
   if(layout==='v')y+=Math.abs(col-cx)*17;
   if(layout==='circle'){const angle=index/count*TAU;x=config.width/2+Math.cos(angle)*Math.min(112,cols*21);y=115+Math.sin(angle)*64;}
   if(layout==='escort'||layout==='dive'){x+=row%2?12:-12;y+=col%2?15:0;}
   if(bossWave){x=40+col*(config.width-80)/Math.max(1,cols-1);y=155+row*43;}
   const a=spawn(x,y,roster[(index+wave-1)%roster.length]);if(a){a.formation=layout;a.entrySide=col<cx?-1:1;a.y=y-balance.formation.entryDistance;}
  }
  if(bossWave){const a=spawn(config.width/2,86,4,false,settings.bossLives);if(a){a.entry=2;a.y=a.baseY-balance.formation.entryDistance;a.attackTime=2;bossGuard(a);}}
  separateAliens(aliens,balance.formation);signal('wave',player.x,player.y,wave,1.4);
 }
 function damagePlayer(x,y){
  if(invulnerable>0)return false;playerHits++;if(powerup===3){signal('shield-hit',x,y,0,.35);return false;}
  lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);signal('player-hit',player.x,player.y,lives,1.1);sound('hit');return true;
 }
 function dropBonus(){if(!pendingBonuses||pickups.length)return;const rotation=balance.pickups.rotation,d=pp.take(bonusX,bonusY,0,balance.pickups.speed,0,rotation[dropSerial%rotation.length]);if(d){pendingBonuses--;dropSerial++;sinceBonusKills=0;sinceBonusTime=0;pickups.push(d);}}
 function destroy(index,split=true,missile=false){
  const a=aliens[index],{x,y}=a,type=balance.enemyTypes[a.kind],children=split&&!a.child&&!a.boss?(type.children||0):0;
  score+=a.reward*settings.points;kills++;sinceBonusKills++;burst(x,y);
  if(v11){const size=blastRule({boss:a.boss,baseHp:balance.enemyTypes[a.kind].hp,kills,cooldown:blastCool},v11);if(size){blasts.push({x,y,t:0,life:size==='big'?1.1:.45,size:size==='big'?64:balance.enemyTypes[a.kind].hp>=v11.blastHp?30:22,big:size==='big'});blastsMade++;if(size==='small')blastCool=v11.blastCooldown;sound(size==='big'?'explosionBig':'explosion');}}
  else if(!missile)sound('explosion');
  if(a.reward){combo=comboTime>0?combo+1:1;comboTime=campaign.comboSeconds;if(combo%campaign.comboMilestone===0){celebration=campaign.celebrationSeconds;score+=combo*campaign.comboBonus;}
   const kind=a.boss||type.loot==='crystal'?1:type.loot==='coin'?0:-1;if(kind>=0){const d=lp.take(x,y,0,campaign.lootSpeed,0,kind);if(d)loot.push(d);}}
  if(kills%Math.round(settings.killsPerBonus*(v9?.bonusKillsMult||1))===0||(v11&&!pendingBonuses&&!pickups.length&&(sinceBonusKills>=v11.pityKills||sinceBonusTime>=v11.pitySeconds))){pendingBonuses++;bonusX=x;bonusY=y;}releaseAt(aliens,index,ap);
  for(let i=0;i<children;i++)spawn(clamp(x+(i-.5)*30,25,config.width-25),y,0,true);dropBonus();
 }
 function announce(a,kind='shot'){
  if(a.entry>0||a.tellTime>0||a.diveAge>=0||a.y<a.radius+20||a.y>player.y-100)return false;
  a.attackKind=kind;a.tellMax=a.tellTime=Math.max(.45,behavior.warningSeconds)*(a.boss?1.25:1);a.aimX=player.x;a.aimY=player.y;return true;
 }
 function enemyFire(a){
  if(a.attackKind==='mine'){
   if(bolts.length<behavior.bulletCap&&bolts.filter(b=>b.mine).length<2){const b=bp.take(a.x,a.y+a.radius+8,0,18);if(b){Object.assign(b,{mine:true,kind:a.kind,color:'#bf93ef',shape:'ring',pattern:0});bolts.push(b);}}return;
  }
  const type=balance.enemyTypes[a.kind],phase=a.bossPhase||1,style=behavior.bossStyle==='final'?['sweep','cross','fan'][phase-1]:behavior.bossStyle||'fan',speed=settings.boltSpeed*(v11?.boltSpeed?.[level-1]||1)*(a.boss?(style==='pulse'?.6:.8):a.kind===0?1.05:a.kind===1?.72:1);
  const offsets=v11&&!a.boss&&a.kind!==1?(level===1?[[0],[0],[-.13,.13],[0]]:[[0],[0],[-.13,.13],[0],[-.3,0,.3],[0]])[(fanSerial++)%(level===1?4:6)]:a.boss?(style==='cross'?[-.32,.32]:style==='pulse'?[0]:style==='sweep'?[Math.sin(a.attackPattern*.8)*.38]:style==='escort'?[-.12,.12]:[-.4,0,.4]):a.kind===1?[-.18,.18]:[0];
  const aim=a.boss&&style==='cross'?0:clamp((a.aimX-a.x)*speed/Math.max(80,player.y-a.y),-balance.enemyAimSpeed,balance.enemyAimSpeed);
  for(const offset of offsets){if(bolts.length>=behavior.bulletCap)break;const fromX=a.x+(a.boss&&style==='escort'?Math.sign(offset)*a.radius*.8:0),b=bp.take(fromX,a.y+a.radius*.55,aim+Math.sin(offset)*speed,speed*Math.cos(offset));if(b){boltsFired++;Object.assign(b,{mine:false,kind:a.kind,color:a.boss?'#ff7891':type.color,shape:a.boss?(style==='pulse'?'orb':'diamond'):type.projectile,pattern:a.attackPattern});bolts.push(b);}}
  a.attackPattern++;
 }
 const wingRank=()=>v10?(wingTime>0?Math.max(1,upgrades.wing+(equipment.weapon||0)):0):Math.max(powerup===4?1:0,upgrades.wing+(equipment.weapon||0));
 function fireShot(vx,kind,fromX=player.x,wing=false,fromY=player.y){
  if(spawnCap&&!spawnCap.allow(time))return;
  const s=sp.take(fromX,fromY-balance.playerRadius,vx,-balance.shotSpeed*(kind===2?1.5:1),0,kind);if(!s)return;
  s.hitIds??=new Set();s.hitIds.clear();
  if(v23){s.vulcan=kind!==2&&shotMode==='burst';if(kind!==2){if(s.vulcan)vulcanFired++;else regularFired++;}}
  Object.assign(s,{wing,damage:(v23&&kind!==2?(shotMode==='burst'?v23.vulcanDamage:v23.regularDamage):v15&&kind!==2?shotDamage(fireMode,v15):v12&&kind!==2?dmgK:1)*(wing?campaign.wingDamage*Math.max(1,alienStack(campaign,'wing',wingRank()))/Math.max(1,wings.filter(w=>w.active).length):kind===2?v11.laserDamage:kind===1?1.25:1),hp:kind===2?v11.laserPierce:kind===1?balance.pickups.laserPierce+alienStack(campaign,'laser',upgrades.laser):1,lastHit:-1,hitLo:0,hitHi:0});shots.push(s);fired++;
 }
 /** v23: one trigger pull. kind 'regular' = the steady cannon on its own clock (single-shot sound), 'vulcan' = a Vulcan
  * bullet, 'ride' = the steady cannon's shot carried by a Vulcan tick while both buttons are held (regular damage, but it
  * sounds and spins with the Vulcan stream). Wing cannons alternate and converge like v15; the fan bonus and the escort
  * wings join each pull as before. */
 function v23Round(kind){
  const stream=kind!=='regular',laser=upgrades.laser>0||powerup===1||(equipment.weapon||0)>=2,ship13=Boolean(v13&&model.shipV13),off=v12?(ship13?v13.cannonOffset:v12.cannonOffset):0,side=stream?vulcanSide:cannonSide,cx=player.x+side*off,fy=ship13?player.y-(v13.muzzleForward-balance.playerRadius):player.y;
  shotMode=kind==='vulcan'?'burst':'normal';if(kind==='vulcan')burstShots++;else steadyShots++;if(move)player.recoil=Math.max(player.recoil||0,stream?.5:1);
  sound(stream?'shot':'shotSingle');
  fireShot(off?convergeVx(side,off,balance.shotSpeed,v15):0,laser?1:0,cx,false,fy);
  if(spreadTime>0){fireShot(-balance.pickups.spreadSpeed,0,cx,false,fy);fireShot(balance.pickups.spreadSpeed,0,cx,false,fy);}
  if(v12)cannonLast[side>0?1:0]=time;if(stream){lastShotAt=time;vulcanSide=-vulcanSide;}else cannonSide=-cannonSide;
  for(const w of wings)if(w.active)fireShot(0,laser?1:0,w.x,true,w.y);
  shotMode='normal';
 }
 /** v23 fire step. The steady cannon (input.firing) keeps its own clock (shotTime) at all times. While the Vulcan
  * (input.vulcan) runs, its barrels set the pace, 10 per second: each tick carries the cannon's shot when that is due, or
  * else a Vulcan bullet, so both buttons together never fire faster than the Vulcan alone and the cannon keeps its rate
  * inside the stream. Every tick heats the gauge; a full gauge locks only the Vulcan, and the cannon fires on alone.
  * Returns whether any weapon is firing (the v11 laser volleys follow it as before). */
 function v23Fire(dt,input){
  const wantRegular=Boolean(input.firing),wantVulcan=Boolean(input.vulcan),rapid=powerup===2;
  vgate=vulcanGate(vgate,wantVulcan,dt,v23);
  const gearRate=(equipment.rate||1)*(1+(hangar.rapid||0)*balance.hangar.rankRate)*(1+alienStack(campaign,'rapid',upgrades.rapid))*power+(bonuses.fireRate||0),interval=()=>fireInterval('normal',gearRate*(rapid?balance.pickups.rapidMultiplier:1),rapid,v15);
  if(!wantRegular)shotTime=Math.max(shotTime,0);
  if(!vgate.firing)vulcanTime=Math.max(vulcanTime,0);
  for(let rounds=0;vgate.firing&&vulcanTime<=0&&rounds<3;rounds++){
   if(wantRegular&&shotTime<=0){v23Round('ride');shotTime+=interval();}else v23Round('vulcan');
   vgate=vulcanShot(vgate,v23);vulcanTime+=v23.vulcanInterval;
   if(vgate.lock>0){overheats++;vulcanTime=Math.max(vulcanTime,0);break;}
  }
  if(!vgate.firing)for(let rounds=0;wantRegular&&shotTime<=0&&rounds<3;rounds++){v23Round('regular');shotTime+=interval();}
  regularOn=wantRegular;vulcanOn=vgate.firing;heat=vgate.heat;coolLeft=vgate.lock;
  fireMode=vulcanOn?'burst':regularOn?'normal':coolLeft>0?'cool':'idle';
  return regularOn||vulcanOn;
 }
 function offerUpgrade(){const available=availableAlienUpgrades(upgrades,balance,equipment,careerWins);if(!roundChoices||!available.length)return false;choices.length=0;for(let i=0;i<Math.min(campaign.choiceCount,available.length);i++){const at=i+Math.floor(random()*(available.length-i));[available[i],available[at]]=[available[at],available[i]];choices.push(available[i]);}choosing=true;return true;}
 function chooseUpgrade(index){if(!choosing||!Number.isInteger(index)||!choices[index])return false;const id=choices[index];upgrades[id]++;onUpgrade({...upgrades});sound('upgrade');if(id==='wing')wingTime=balance.pickups.seconds;if(id==='shield'){maxLives++;lives++;}choosing=false;wave++;formation();return true;}
 function finish(outcome){if(result)return;sound(outcome==='win'?'stageEnd':'lose');score=Math.min(settings.scoreLimit,score);result={outcome,score,damage:Math.max(0,maxLives-lives),performance:.65*lives/maxLives+.35*Math.min(1,hits/Math.max(1,fired))};}
 function blastRadius(){const weak=aliens.filter(a=>a.hp<=balance.nova.damage*(1+Math.min(level-1,8)*balance.hpPerStage)*(1-(balance.enemyTypes[a.kind].novaResistance||0))).map(a=>Math.max(0,Math.hypot((a.x-nova.x)*aspect(),a.y-nova.y)-a.radius)).sort((a,b)=>a-b),count=Math.max(1,Math.round(aliens.length*balance.nova.targetFraction));return Math.max(24,Math.min(balance.nova.maxRadius,weak.length>=count?((weak[count-1]+(weak[count]??weak[count-1]+12))/2):balance.nova.radius));}

 function flyMissile(dt){
  let target=aliens.find(a=>a.id===nova.targetId);
  if(!target){target=nearestAlien(aliens,nova.x,nova.y,aspect());nova.targetId=target?.id??null;}
  nova.targetX=target?.x??nova.x;nova.targetY=target?.y??nova.y-100;
  const x0=nova.x,y0=nova.y;steerMissile(nova,target,dt,{speed:v10.missileSpeed,turn:v10.missileTurn});
  nova.trail.push({x:x0,y:y0});if(nova.trail.length>v10.trailLength)nova.trail.shift();
  let hit=null,tMin=1;for(const a of aliens){const t=segmentContact(x0,y0,nova.x,nova.y,a.x,a.y,a.radius+balance.nova.projectileRadius,aspect());if(t!==null&&(!hit||t<tMin)){hit=a;tMin=t;}}
  if(hit){nova.x=x0+(nova.x-x0)*tMin;nova.y=y0+(nova.y-y0)*tMin;detonate(hit);return;}
  nova.flight=Math.max(0,nova.flight-dt);
  if(nova.flight<=0||nova.y<-30||nova.x<-30||nova.x>config.width+30||nova.y>config.height+30)detonate(null);
 }
 function detonate(hit){if(hit)missilesHit++;nova.flight=0;nova.hitId=hit?.id??null;nova.life=balance.nova.seconds;nova.radius=blastRadius();sound('missileExplosion');
     for(let i=aliens.length-1;i>=0;i--){const a=aliens[i];if(Math.hypot((a.x-nova.x)*aspect(),a.y-nova.y)<=nova.radius+a.radius){damageAlien(a,balance.nova.damage*(1+Math.min(level-1,8)*balance.hpPerStage)*(1-(balance.enemyTypes[a.kind].novaResistance||0)));a.hitTime=balance.hitFlashSeconds;if(a.hp<=0)destroy(i,false,true);}}
     for(let i=bolts.length-1;i>=0;i--)if(Math.hypot((bolts[i].x-nova.x)*aspect(),bolts[i].y-nova.y)<=nova.radius)releaseAt(bolts,i,bp);}
 formation();
 const model={settings,behavior,player,aliens,shots,bolts,sparks,pickups,nova,equipment,upgrades,choices,wings,loot,feedback,telegraphs,chooseUpgrade,resetInput(){novaPressed=false;},
  get maxLives(){return maxLives;},get choosing(){return choosing;},get combo(){return combo;},get celebration(){return celebration;},get coins(){return coins;},get crystals(){return crystals;},get pattern(){return pattern();},get remaining(){return Math.max(0,settings.seconds-time);},statusId:'minigame.alienStatus',
  get spreadTime(){return spreadTime;},get wingTime(){return wingTime;},get powerMax(){return powerMax;},get v12(){return Boolean(v12);},get v14(){return Boolean(v14);},get v15(){return Boolean(v15);},get v23(){return Boolean(v23);},get vulcanHeat(){return vgate.heat;},get vulcanLocked(){return Boolean(v23&&vgate.lock>0);},get vulcanLockLeft(){return vgate.lock;},get vulcanOn(){return vulcanOn;},get regularOn(){return regularOn;},get moveV15(){return Boolean(move);},get recoilOffset(){return move?(player.recoil||0)*move.recoilPixels:0;},get fireMode(){return fireMode;},get gunsWarm(){return Boolean(v15&&gate.spent&&!(gate.cool>0));},get heat(){return heat;},get overheated(){return coolLeft>0;},get firing(){return Boolean(v12)&&time-lastShotAt<.12;},get spinAngle(){return spinAngle;},get cannonOffset(){return v12?(v13&&model.shipV13?v13.cannonOffset:v12.cannonOffset):0;},get muzzleForward(){return v13&&model.shipV13?v13.muzzleForward:balance.playerRadius+4;},shipV13:false,cannonLast,get flashSeconds(){return v12?v12.flashSeconds:0;},blasts,get v11(){return Boolean(v11);},get wingMax(){return wingMax;},get v10(){return Boolean(v10);},get spreadCooldown(){return spreadCooldown;},get score(){return score;},get lives(){return lives;},get wave(){return wave;},get result(){return result;},get time(){return time;},get invulnerable(){return invulnerable;},get powerup(){return powerup;},get powerTime(){return powerTime;},get novaCharges(){return novaCharges;},
  statusValues(){Object.assign(status,{score,lives,wave,nova:novaCharges});return status;},
  update(dt,input=EMPTY){
   if(result||dt<=0||choosing)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;formationAge+=dt;feedback.life=Math.max(0,feedback.life-dt);invulnerable=Math.max(0,invulnerable-dt);nova.life=Math.max(0,nova.life-dt);comboTime=Math.max(0,comboTime-dt);if(!comboTime)combo=0;celebration=Math.max(0,celebration-dt);
   sinceBonusTime+=dt;blastCool=Math.max(0,blastCool-dt);for(let i=blasts.length-1;i>=0;i--){blasts[i].t+=dt;if(blasts[i].t>=blasts[i].life)blasts.splice(i,1);}
   wingTime=Math.max(0,wingTime-dt);spreadTime=Math.max(0,spreadTime-dt);spreadCooldown=Math.max(0,spreadCooldown-dt);powerTime=Math.max(0,powerTime-dt);if(!powerTime)powerup=-1;
   if(move)alienMoveStep(player,input,dt,balance,config.width,move);else moveAlienPlayer(player,input,dt,balance,config.width);
   for(let i=0;i<wings.length;i++){const w=wings[i];w.active=(v10?wingTime>0:(wingTime>0||powerup===4||upgrades.wing>0||(equipment.weapon||0)>0))&&i<Math.min(campaign.maxWings,wingRank());w.x=clamp(player.x+w.side*campaign.wingOffset,campaign.wingRadius,config.width-campaign.wingRadius);w.y=player.y-10+Math.sin(time*3+i)*3;}
   const previousFlight=nova.flight;
   if(input.nova&&!novaPressed&&novaCharges>0&&!nova.flight&&!nova.life&&aliens.length){nova.x=nova.fromX=player.x;nova.y=nova.fromY=player.y;nova.hitId=null;novaCharges--;nova.flight=balance.nova.throwSeconds*(v10?v10.missileFlightMult:1);nova.flightMax=nova.flight;nova.angle=-Math.PI/2;nova.trail.length=0;missilesFired++;const lock=v10?nearestAlien(aliens,nova.x,nova.y,aspect()):null;nova.targetId=lock?.id??null;sound('missileLaunch');}novaPressed=Boolean(input.nova);
   if(previousFlight>0&&v10)flyMissile(dt);else if(previousFlight>0){const y0=nova.y,nextY=Math.max(nova.stopY,nova.y-(nova.fromY-nova.stopY)/balance.nova.throwSeconds*dt);let hit=null,tMin=1;
    for(const a of aliens){const t=segmentContact(nova.x,y0,nova.x,nextY,a.x,a.y,a.radius+balance.nova.projectileRadius,aspect());if(t!==null&&(!hit||t<tMin)){hit=a;tMin=t;}}
    nova.y=y0+(nextY-y0)*tMin;nova.flight=Math.max(0,(nova.y-nova.stopY)/(nova.fromY-nova.stopY)*balance.nova.throwSeconds);
    if(hit||nextY===nova.stopY)detonate(hit);
   }
   shotTime-=dt;if(v23)vulcanTime-=dt;hitSoundCool=Math.max(0,hitSoundCool-dt);spinRate+=((v12&&time-lastShotAt<.12?v12.spinRate:0)-spinRate)*Math.min(1,dt*8);spinAngle+=spinRate*dt;
   let fireOn=Boolean(input.firing);
   if(v23)fireOn=v23Fire(dt,input);else{
   if(v15){const was=gate.cool>0;gate=fireGate(gate,fireOn,dt,v15);heat=gate.heat;coolLeft=gate.cool;fireMode=gate.mode;fireOn=gate.firing;if(!was&&gate.cool>0)overheats++;}
   else if(v14){const was=coolLeft>0,h=heatStep({heat,cool:coolLeft},fireOn,dt,v14);heat=h.heat;coolLeft=h.cool;fireOn=h.firing;if(!was&&coolLeft>0)overheats++;}
   if(v12&&!fireOn)shotTime=Math.max(shotTime,0);
   for(let rounds=0;fireOn&&shotTime<=0&&rounds<(v12?3:1);rounds++){const laser=upgrades.laser>0||powerup===1||(equipment.weapon||0)>=2,ship13=Boolean(v13&&model.shipV13),cx=v12?player.x+cannonSide*(ship13?v13.cannonOffset:v12.cannonOffset):player.x;const fy=ship13?player.y-(v13.muzzleForward-balance.playerRadius):player.y;if(v15){if(fireMode==='burst')burstShots++;else steadyShots++;if(move)player.recoil=fireMode==='burst'?.5:1;}sound(v15&&fireMode!=='burst'?'shotSingle':'shot');fireShot(v15&&v12?convergeVx(cannonSide,ship13?v13.cannonOffset:v12.cannonOffset,balance.shotSpeed,v15):0,laser?1:0,cx,false,fy);if(spreadTime>0){fireShot(-balance.pickups.spreadSpeed,0,cx,false,fy);fireShot(balance.pickups.spreadSpeed,0,cx,false,fy);}if(v12){cannonLast[cannonSide>0?1:0]=time;if(!v15||fireMode==='burst')lastShotAt=time;cannonSide=-cannonSide;}for(const w of wings)if(w.active)fireShot(0,laser?1:0,w.x,true,w.y);
    const gearRate=(equipment.rate||1)*(1+(hangar.rapid||0)*balance.hangar.rankRate)*(1+alienStack(campaign,'rapid',upgrades.rapid))*power+(bonuses.fireRate||0);
    shotTime=(v12?shotTime:0)+(v15?fireInterval(fireMode,gearRate*(powerup===2?balance.pickups.rapidMultiplier:1),powerup===2,v15):Math.max(v14?v14.minInterval:.1*(v12?rateK:1),settings.shotSeconds/gearRate/(powerup===2?balance.pickups.rapidMultiplier:1)));}
   }
   if(v11&&aliens.length){if(fireOn&&laserLeft<=0){laserTimer-=dt;if(laserTimer<=0){laserLeft=v11.laserShots[0]+Math.floor(random()*(v11.laserShots[1]-v11.laserShots[0]+1));laserGap=0;laserTimer=v11.laserEvery[0]+random()*(v11.laserEvery[1]-v11.laserEvery[0]);}}
    if(laserLeft>0){laserGap-=dt;if(laserGap<=0){sound('laser');fireShot(0,2);lasersFired++;laserLeft--;laserGap=v11.laserGap;}}}
   if(!aliens.length){if(time>=settings.seconds){finish(wave>=settings.waves||completion==='survival'?'win':'lose');return;}nextWave+=dt;if(nextWave>=(v9?.wavePauseSeconds??balance.wavePauseSeconds)){while(bolts.length)releaseAt(bolts,bolts.length-1,bp);if(wave>=settings.waves){finish('win');return;}if(offerUpgrade())return;wave++;formation();}return;}
   for(const a of aliens){a.age+=dt;a.hitTime=Math.max(0,a.hitTime-dt);a.shieldCool=Math.max(0,(a.shieldCool||0)-dt);a.sparkCool=Math.max(0,(a.sparkCool||0)-dt);a.entry=Math.max(0,a.entry-dt);const type=balance.enemyTypes[a.kind];bossGuard(a);
    const healthPhase=a.hp<=a.maxHp/3?3:a.hp<=a.maxHp*2/3?2:1,phaseStep=(balance.balance?.minBossSeconds||0)/3;
    const phase=a.boss?Math.min(healthPhase,phaseStep?1+Math.min(2,Math.floor(Math.max(0,a.age-2)/phaseStep)):3):1;if(phase!==a.bossPhase){a.bossPhase=phase;a.tellTime=0;a.attackTime=1.1;signal('boss-phase',a.x,a.y,phase,1.2);}
    const moving=behavior.motion!=='static',speed=behavior.motion==='surge'?1.7:1;
    const sway=behavior.motion==='zigzag'?Math.asin(Math.sin(a.age*.7))*12:Math.sin(a.age*(behavior.motion==='surge'?1.1:.65))*balance.formation.sway;
    const motionBlend=Math.min(1,a.age/.6);
    const homeX=a.boss?config.width/2+Math.sin(a.age*(behavior.bossStyle==='sweep'?.7:.4))*72:a.baseX+(moving?(sway+Math.sin(a.age*type.frequency+a.phase)*type.amplitude*.5)*motionBlend:0);
    if(moving&&!a.boss)a.baseY=Math.min((a.originY??a.baseY)+65,a.baseY+balance.tactics.descentSpeed*speed*dt);
    const homeY=a.baseY+(moving&&!a.boss?Math.sin(a.age*1.4+a.phase)*2*motionBlend:0);
    const entryT=1-a.entry/(a.boss?2:balance.formation.entrySeconds),ease=entryT*entryT*(3-2*entryT);a.x=clamp(homeX+a.entrySide*Math.sin(entryT*Math.PI)**2*balance.tactics.entrySway,a.radius+4,config.width-a.radius-4);a.y=homeY-balance.formation.entryDistance*(1-ease);
    if(a.tellTime>0){a.tellTime=Math.max(0,a.tellTime-dt);if(a.tellTime===0){if(a.attackKind==='dive'){a.diveAge=0;a.diveX=a.x;a.diveY=a.y;a.diveTargetX=a.aimX;a.diveTargetY=player.y-(settings.diveClearance??balance.tactics.diveClearance);a.diveHit=false;}else enemyFire(a);}}
    if(a.diveAge>=0){a.diveAge+=dt;const t=Math.min(1,a.diveAge/balance.tactics.diveSeconds),s=Math.sin(t*Math.PI)**2;a.x=homeX+(a.diveTargetX-homeX)*s+Math.sin(t*TAU)*balance.tactics.diveSway*s;a.y=homeY+(a.diveTargetY-homeY)*s;if(t===1)a.diveAge=-1;}
    if(a.boss&&a.entry===0){a.attackTime-=dt;if(a.attackTime<=0&&announce(a,'boss'))a.attackTime=Math.max(1.6,behavior.fireCadence*(1.25-a.bossPhase*.12));}
    if(type.mineSeconds&&!a.boss&&a.entry===0){a.mineTime-=dt;if(a.mineTime<=0&&bolts.filter(b=>b.mine).length<2&&announce(a,'mine'))a.mineTime=type.mineSeconds*1.6;}
    if(type.launchSeconds&&!a.boss&&!a.child&&a.entry===0&&a.launched<type.launchLimit&&spawned<settings.spawnBudget){a.launchTime-=dt;if(a.launchTime<=0&&spawn(a.x,a.y+balance.rowSpacing,0,true)){a.launchTime=type.launchSeconds;a.launched++;spawned++;}}
   }
   boltTime-=dt;if(behavior.shoots&&boltTime<=0){const candidates=aliens.filter(a=>!a.boss&&a.entry===0&&a.diveAge<0&&a.tellTime===0&&a.y>a.radius+20);if(candidates.length&&bolts.length<behavior.bulletCap){const a=candidates[Math.floor(random()*candidates.length)];announce(a);if(v11&&level<=3&&random()<v11.volleyChance[level-1]){const others=candidates.filter(o=>o!==a&&Math.abs(o.x-a.x)>40);for(let i=0;i<2&&others.length;i++){const k=Math.floor(random()*others.length);announce(others.splice(k,1)[0]);}}}boltTime=Math.max(v11?.45:.7,behavior.fireCadence)*(0.9+random()*.2);}
   diveTime-=dt;if(behavior.diveEverySeconds>0&&diveTime<=0&&!aliens.some(a=>a.diveAge>=0||a.attackKind==='dive'&&a.tellTime>0)){const candidates=aliens.filter(a=>!a.boss&&a.kind===2&&a.entry===0);if(candidates.length)announce(candidates[Math.floor(random()*candidates.length)],'dive');diveTime=behavior.diveEverySeconds;}
   telegraphs.length=0;for(const a of aliens)if(a.tellTime>0)telegraphs.push({x:a.x,y:a.y,targetX:a.aimX,targetY:a.aimY,kind:a.attackKind==='mine'?'shot':a.attackKind,life:a.tellTime,maxLife:a.tellMax});
   separateAliens(aliens,balance.formation);
   for(let i=shots.length-1;i>=0;i--){const s=shots[i],x0=s.x,y0=s.y;s.hitIds??=new Set();s.x+=s.vx*dt;s.y+=s.vy*dt;const contacts=[];
    for(const a of aliens){if(s.hitIds.has(a.id))continue;const t=segmentContact(x0,y0,s.x,s.y,a.x,a.y,a.radius+balance.shotRadius,aspect());if(t!==null)contacts.push({id:a.id,t});}
    contacts.sort((a,b)=>a.t-b.t||a.id-b.id);let active=true;
    for(const contact of contacts){const selected=aliens.findIndex(a=>a.id===contact.id);if(selected<0)continue;const a=aliens[selected];s.lastHit=a.id;s.hitIds.add(a.id);if(a.slot<32)s.hitLo|=1<<a.slot;else s.hitHi|=1<<(a.slot-32);hits++;if(!v12||hitSoundCool<=0){sound('hit');hitSoundCool=v12?v12.hitSoundGap:0;}a.hitTime=balance.hitFlashSeconds;
     if(a.shield>0){if(!v14||(a.shieldCool||0)<=0){a.shield--;a.shieldCool=v14?v14.shieldGap:0;signal('shield-hit',a.x,a.y,a.shield,.4);}releaseAt(shots,i,sp);active=false;break;}
     const damage=(equipment.damage||1)*power*(1+alienStack(campaign,'damage',upgrades.damage))*(s.damage||1),dealt=damageAlien(a,damage);if(dealt>0)signal('enemy-hit',a.x,a.y,dealt,.25);if(!v12||(a.sparkCool||0)<=0||a.hp<=0){burst(a.x,a.y);a.sparkCool=v12?v12.sparkCool:0;}if(a.hp<=0)destroy(selected);if(--s.hp<=0){releaseAt(shots,i,sp);active=false;break;}
    }
    if(active&&(s.y<-30||s.x<0||s.x>config.width))releaseAt(shots,i,sp);
   }
   for(let i=pickups.length-1;i>=0;i--){const d=pickups[i];d.y+=d.vy*dt;const dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx*aspect(),dy);if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}
    if(dist<balance.pickups.radius+balance.playerRadius){const coolingFan=d.kind===0&&spreadCooldown>0;sound('bonus');signal(coolingFan?'spread-cooldown':'pickup',player.x,player.y,coolingFan?spreadCooldown:d.kind,1.5);if(d.kind===5)novaCharges++;else if(d.kind===0){if(!coolingFan){const sec=v11?v11.bonusSeconds:balance.spread.seconds;spreadTime=powerMax=sec;spreadCooldown=sec+balance.spread.cooldownSeconds;}}else if(v10&&d.kind===4){wingTime=wingMax=v11?v11.bonusSeconds:v10.wingSeconds;}else{powerup=d.kind;powerTime=powerMax=v11?v11.bonusSeconds:balance.pickups.seconds;}releaseAt(pickups,i,pp);}else if(d.y>config.height+30)releaseAt(pickups,i,pp);}
   dropBonus();
   for(let i=loot.length-1;i>=0;i--){const d=loot[i];d.y+=d.vy*dt;const dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx*aspect(),dy);if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}if(dist<balance.pickups.radius+balance.playerRadius){sound('bonus');if(d.kind)crystals++;else coins++;score+=d.kind?campaign.crystalPoints:campaign.coinPoints;releaseAt(loot,i,lp);}else if(d.y>config.height)releaseAt(loot,i,lp);}
   for(let i=bolts.length-1;i>=0;i--){const b=bolts[i],x0=b.x,y0=b.y;b.x+=(b.vx||0)*dt;b.y+=(b.vy||settings.boltSpeed)*dt;if(segmentContact(x0,y0,b.x,b.y,player.x,player.y,balance.playerRadius*.62+balance.boltRadius*.55,aspect())!==null){releaseAt(bolts,i,bp);damagePlayer(player.x,player.y);}else if(b.y>config.height+20||b.x<-40||b.x>config.width+40)releaseAt(bolts,i,bp);}
   for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0)releaseAt(sparks,i,fp);}
   separateAliens(aliens,balance.formation);
   for(let i=aliens.length-1;i>=0;i--){const a=aliens[i];if(!a.boss&&a.diveAge<0&&a.y-a.radius>player.y+20){releaseAt(aliens,i,ap);damagePlayer(player.x,player.y);}}
   if(lives<=0)finish('lose');else if(!aliens.length&&wave>=settings.waves)finish('win');else if(time>=settings.seconds)finish(completion==='survival'&&!settings.boss?'win':'lose');
  },
  snapshot(){return{...(v23?{v23:true,regularOn,vulcanOn,regularFired,vulcanFired,vulcan:{heat:vgate.heat,lock:vgate.lock,locked:vgate.lock>0,firing:vulcanOn}}:{}),overheats,heat,fireMode,burstShots,steadyShots,capDropped:spawnCap?spawnCap.dropped:0,v15:Boolean(v15),cannonSide,lasersFired,blastsMade,bonusPity:{sinceBonusKills,sinceBonusTime},boltsFired,playerHits,missilesFired,missilesHit,wingTime,hangar:{...hangar},spreadTime,spreadCooldown,kills,pendingBonuses,bonusesDropped:dropSerial,score,lives,maxLives,wave,time,choosing,choices:[...choices],upgrades:{...upgrades},wings:wings.map(w=>({...w})),combo,coins,crystals,pattern:pattern(),remaining:model.remaining,loot:loot.map(d=>({...d})),result:result?{...result}:null,player:{...player},aliens:aliens.map(a=>({...a})),shots:shots.map(s=>({...s})),bolts:bolts.map(b=>({...b})),pickups:pickups.map(d=>({...d})),powerup,powerTime,novaCharges,nova:{...nova},feedback:{...feedback},telegraphs:telegraphs.map(t=>({...t})),fired,hits,level};}
 };return model;
}
