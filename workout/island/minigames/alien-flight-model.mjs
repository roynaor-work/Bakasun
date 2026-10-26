import {moveAlienPlayer} from './g2m-motion.mjs?v=island-people-scale-20261026-1';
import {availableAlienUpgrades} from '../activity/alien-upgrades.mjs?v=island-people-scale-20261026-1';
import {createPool,releaseAt} from './pool.mjs?v=island-people-scale-20261026-1';
import {createAlienEntity,separateAliens,alienStack,segmentContact} from './alien-flight-combat.mjs';
const EMPTY=Object.freeze({}),TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function createAlienModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY,permanentUpgrades=EMPTY,hangar=EMPTY,careerWins=Math.max(0,level-1),roundChoices=true,completion='survival',onUpgrade=()=>{},sound=()=>{}}){
 level=clamp(Math.floor(level)||1,1,balance.levels.length);
 const settings={...balance.levels[level-1]},campaign=balance.campaign;
 const behavior={motion:'drift',shoots:true,shield:0,warningSeconds:.7,bulletCap:12,fireCadence:settings.boltSeconds,diveEverySeconds:balance.tactics.diveEverySeconds,...balance.stageBehaviors[level-1]};
 const player={x:config.width/2,y:config.height-balance.playerBottom,vx:0,bank:0};
 const aliens=[],shots=[],bolts=[],sparks=[],pickups=[],loot=[],telegraphs=[];
 const ap=createPool(balance.maxAliens),sp=createPool(balance.maxShots),bp=createPool(balance.maxBolts),fp=createPool(balance.maxSparks),pp=createPool(balance.pickups.max),lp=createPool(campaign.maxLoot);
 const upgrades=Object.fromEntries(campaign.choiceIds.map(id=>[id,permanentUpgrades[id]||0])),choices=[];
 const wings=Array.from({length:campaign.maxWings},(_,i)=>({x:0,y:0,active:false,side:i?1:-1}));
 let maxLives=Math.ceil(settings.lives*power)+(bonuses.shield||0)+(equipment.shield||0)+(permanentUpgrades.shield||0)+(hangar.shield||0);
 let lives=Math.max(1,maxLives-Math.min(maxLives-1,hangar.damage||0)),wave=1,time=0,score=0,kills=0,fired=0,hits=0,coins=0,crystals=0;
 let invulnerable=0,shotTime=0,boltTime=1.5,diveTime=balance.tactics.firstDiveSeconds,formationAge=0,nextWave=0,serial=0,result,choosing=false;
 let combo=0,comboTime=0,celebration=0,powerup=-1,powerTime=0,spreadTime=0,spreadCooldown=0,wingTime=0,novaCharges=balance.nova.charges,novaPressed=false,dropSerial=0,pendingBonuses=0,bonusX=0,bonusY=0,spawned=0;
 let feedbackSerial=0;const feedback={id:0,kind:'wave',x:player.x,y:player.y,value:1,life:0};
 const nova={x:player.x,y:player.y,life:0,flight:0,fromX:0,fromY:0,radius:balance.nova.radius,stopY:config.height*balance.nova.stopYFraction,hitId:null};
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
  if(!bossHp){a.hp=Math.max(.75,balance.enemyTypes[kind].hp*(settings.enemyHpScale||1)*(child?1:Math.min(1.5,1+(level-1)*balance.hpPerStage)));a.maxHp=a.hp;}
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
  if(invulnerable>0)return false;if(powerup===3){signal('shield-hit',x,y,0,.35);return false;}
  lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);signal('player-hit',player.x,player.y,lives,1.1);sound('hit');return true;
 }
 function dropBonus(){if(!pendingBonuses||pickups.length)return;const rotation=balance.pickups.rotation,d=pp.take(bonusX,bonusY,0,balance.pickups.speed,0,rotation[dropSerial%rotation.length]);if(d){pendingBonuses--;dropSerial++;pickups.push(d);}}
 function destroy(index,split=true,missile=false){
  const a=aliens[index],{x,y}=a,type=balance.enemyTypes[a.kind],children=split&&!a.child&&!a.boss?(type.children||0):0;
  score+=a.reward*settings.points;kills++;burst(x,y);if(!missile)sound('explosion');
  if(a.reward){combo=comboTime>0?combo+1:1;comboTime=campaign.comboSeconds;if(combo%campaign.comboMilestone===0){celebration=campaign.celebrationSeconds;score+=combo*campaign.comboBonus;}
   const kind=a.boss||type.loot==='crystal'?1:type.loot==='coin'?0:-1;if(kind>=0){const d=lp.take(x,y,0,campaign.lootSpeed,0,kind);if(d)loot.push(d);}}
  if(kills%settings.killsPerBonus===0){pendingBonuses++;bonusX=x;bonusY=y;}releaseAt(aliens,index,ap);
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
  const type=balance.enemyTypes[a.kind],phase=a.bossPhase||1,style=behavior.bossStyle==='final'?['sweep','cross','fan'][phase-1]:behavior.bossStyle||'fan',speed=settings.boltSpeed*(a.boss?(style==='pulse'?.6:.8):a.kind===0?1.05:a.kind===1?.72:1);
  const offsets=a.boss?(style==='cross'?[-.32,.32]:style==='pulse'?[0]:style==='sweep'?[Math.sin(a.attackPattern*.8)*.38]:style==='escort'?[-.12,.12]:[-.4,0,.4]):a.kind===1?[-.18,.18]:[0];
  const aim=a.boss&&style==='cross'?0:clamp((a.aimX-a.x)*speed/Math.max(80,player.y-a.y),-balance.enemyAimSpeed,balance.enemyAimSpeed);
  for(const offset of offsets){if(bolts.length>=behavior.bulletCap)break;const fromX=a.x+(a.boss&&style==='escort'?Math.sign(offset)*a.radius*.8:0),b=bp.take(fromX,a.y+a.radius*.55,aim+Math.sin(offset)*speed,speed*Math.cos(offset));if(b){Object.assign(b,{mine:false,kind:a.kind,color:a.boss?'#ff7891':type.color,shape:a.boss?(style==='pulse'?'orb':'diamond'):type.projectile,pattern:a.attackPattern});bolts.push(b);}}
  a.attackPattern++;
 }
 const wingRank=()=>Math.max(powerup===4?1:0,upgrades.wing+(equipment.weapon||0));
 function fireShot(vx,kind,fromX=player.x,wing=false,fromY=player.y){
  const s=sp.take(fromX,fromY-balance.playerRadius,vx,-balance.shotSpeed,0,kind);if(!s)return;
  s.hitIds??=new Set();s.hitIds.clear();
  Object.assign(s,{wing,damage:wing?campaign.wingDamage*Math.max(1,alienStack(campaign,'wing',wingRank()))/Math.max(1,wings.filter(w=>w.active).length):kind===1?1.25:1,hp:kind===1?balance.pickups.laserPierce+alienStack(campaign,'laser',upgrades.laser):1,lastHit:-1,hitLo:0,hitHi:0});shots.push(s);fired++;
 }
 function offerUpgrade(){const available=availableAlienUpgrades(upgrades,balance,equipment,careerWins);if(!roundChoices||!available.length)return false;choices.length=0;for(let i=0;i<Math.min(campaign.choiceCount,available.length);i++){const at=i+Math.floor(random()*(available.length-i));[available[i],available[at]]=[available[at],available[i]];choices.push(available[i]);}choosing=true;return true;}
 function chooseUpgrade(index){if(!choosing||!Number.isInteger(index)||!choices[index])return false;const id=choices[index];upgrades[id]++;onUpgrade({...upgrades});sound('upgrade');if(id==='wing')wingTime=balance.pickups.seconds;if(id==='shield'){maxLives++;lives++;}choosing=false;wave++;formation();return true;}
 function finish(outcome){if(result)return;sound(outcome==='win'?'stageEnd':'lose');score=Math.min(settings.scoreLimit,score);result={outcome,score,damage:Math.max(0,maxLives-lives),performance:.65*lives/maxLives+.35*Math.min(1,hits/Math.max(1,fired))};}
 function blastRadius(){const weak=aliens.filter(a=>a.hp<=balance.nova.damage*(1+Math.min(level-1,8)*balance.hpPerStage)*(1-(balance.enemyTypes[a.kind].novaResistance||0))).map(a=>Math.max(0,Math.hypot((a.x-nova.x)*aspect(),a.y-nova.y)-a.radius)).sort((a,b)=>a-b),count=Math.max(1,Math.round(aliens.length*balance.nova.targetFraction));return Math.max(24,Math.min(balance.nova.maxRadius,weak.length>=count?((weak[count-1]+(weak[count]??weak[count-1]+12))/2):balance.nova.radius));}
 formation();
 const model={settings,behavior,player,aliens,shots,bolts,sparks,pickups,nova,equipment,upgrades,choices,wings,loot,feedback,telegraphs,chooseUpgrade,resetInput(){novaPressed=false;},
  get maxLives(){return maxLives;},get choosing(){return choosing;},get combo(){return combo;},get celebration(){return celebration;},get coins(){return coins;},get crystals(){return crystals;},get pattern(){return pattern();},get remaining(){return Math.max(0,settings.seconds-time);},statusId:'minigame.alienStatus',
  get spreadTime(){return spreadTime;},get spreadCooldown(){return spreadCooldown;},get score(){return score;},get lives(){return lives;},get wave(){return wave;},get result(){return result;},get time(){return time;},get invulnerable(){return invulnerable;},get powerup(){return powerup;},get powerTime(){return powerTime;},get novaCharges(){return novaCharges;},
  statusValues(){Object.assign(status,{score,lives,wave,nova:novaCharges});return status;},
  update(dt,input=EMPTY){
   if(result||dt<=0||choosing)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;formationAge+=dt;feedback.life=Math.max(0,feedback.life-dt);invulnerable=Math.max(0,invulnerable-dt);nova.life=Math.max(0,nova.life-dt);comboTime=Math.max(0,comboTime-dt);if(!comboTime)combo=0;celebration=Math.max(0,celebration-dt);
   wingTime=Math.max(0,wingTime-dt);spreadTime=Math.max(0,spreadTime-dt);spreadCooldown=Math.max(0,spreadCooldown-dt);powerTime=Math.max(0,powerTime-dt);if(!powerTime)powerup=-1;
   moveAlienPlayer(player,input,dt,balance,config.width);
   for(let i=0;i<wings.length;i++){const w=wings[i];w.active=(wingTime>0||powerup===4||upgrades.wing>0||(equipment.weapon||0)>0)&&i<Math.min(campaign.maxWings,wingRank());w.x=clamp(player.x+w.side*campaign.wingOffset,campaign.wingRadius,config.width-campaign.wingRadius);w.y=player.y-10+Math.sin(time*3+i)*3;}
   const previousFlight=nova.flight;
   if(input.nova&&!novaPressed&&novaCharges>0&&!nova.flight&&!nova.life&&aliens.length){nova.x=nova.fromX=player.x;nova.y=nova.fromY=player.y;nova.hitId=null;novaCharges--;nova.flight=balance.nova.throwSeconds;sound('missileLaunch');}novaPressed=Boolean(input.nova);
   if(previousFlight>0){const y0=nova.y,nextY=Math.max(nova.stopY,nova.y-(nova.fromY-nova.stopY)/balance.nova.throwSeconds*dt);let hit=null,tMin=1;
    for(const a of aliens){const t=segmentContact(nova.x,y0,nova.x,nextY,a.x,a.y,a.radius+balance.nova.projectileRadius,aspect());if(t!==null&&(!hit||t<tMin)){hit=a;tMin=t;}}
    nova.y=y0+(nextY-y0)*tMin;nova.flight=Math.max(0,(nova.y-nova.stopY)/(nova.fromY-nova.stopY)*balance.nova.throwSeconds);
    if(hit||nextY===nova.stopY){nova.flight=0;nova.hitId=hit?.id??null;nova.life=balance.nova.seconds;nova.radius=blastRadius();sound('missileExplosion');
     for(let i=aliens.length-1;i>=0;i--){const a=aliens[i];if(Math.hypot((a.x-nova.x)*aspect(),a.y-nova.y)<=nova.radius+a.radius){damageAlien(a,balance.nova.damage*(1+Math.min(level-1,8)*balance.hpPerStage)*(1-(balance.enemyTypes[a.kind].novaResistance||0)));a.hitTime=balance.hitFlashSeconds;if(a.hp<=0)destroy(i,false,true);}}
     for(let i=bolts.length-1;i>=0;i--)if(Math.hypot((bolts[i].x-nova.x)*aspect(),bolts[i].y-nova.y)<=nova.radius)releaseAt(bolts,i,bp);
    }
   }
   shotTime-=dt;if(input.firing&&shotTime<=0){const laser=upgrades.laser>0||powerup===1||(equipment.weapon||0)>=2;sound('shot');fireShot(0,laser?1:0);if(spreadTime>0){fireShot(-balance.pickups.spreadSpeed,0);fireShot(balance.pickups.spreadSpeed,0);}for(const w of wings)if(w.active)fireShot(0,laser?1:0,w.x,true,w.y);
    shotTime=Math.max(.1,settings.shotSeconds/((equipment.rate||1)*(1+(hangar.rapid||0)*balance.hangar.rankRate)*(1+alienStack(campaign,'rapid',upgrades.rapid))*power+(bonuses.fireRate||0))/(powerup===2?balance.pickups.rapidMultiplier:1));}
   if(!aliens.length){if(time>=settings.seconds){finish(wave>=settings.waves||completion==='survival'?'win':'lose');return;}nextWave+=dt;if(nextWave>=balance.wavePauseSeconds){while(bolts.length)releaseAt(bolts,bolts.length-1,bp);if(wave>=settings.waves){finish('win');return;}if(offerUpgrade())return;wave++;formation();}return;}
   for(const a of aliens){a.age+=dt;a.hitTime=Math.max(0,a.hitTime-dt);a.entry=Math.max(0,a.entry-dt);const type=balance.enemyTypes[a.kind];bossGuard(a);
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
   boltTime-=dt;if(behavior.shoots&&boltTime<=0){const candidates=aliens.filter(a=>!a.boss&&a.entry===0&&a.diveAge<0&&a.tellTime===0&&a.y>a.radius+20);if(candidates.length&&bolts.length<behavior.bulletCap){const a=candidates[Math.floor(random()*candidates.length)];announce(a);}boltTime=Math.max(.7,behavior.fireCadence)*(0.9+random()*.2);}
   diveTime-=dt;if(behavior.diveEverySeconds>0&&diveTime<=0&&!aliens.some(a=>a.diveAge>=0||a.attackKind==='dive'&&a.tellTime>0)){const candidates=aliens.filter(a=>!a.boss&&a.kind===2&&a.entry===0);if(candidates.length)announce(candidates[Math.floor(random()*candidates.length)],'dive');diveTime=behavior.diveEverySeconds;}
   telegraphs.length=0;for(const a of aliens)if(a.tellTime>0)telegraphs.push({x:a.x,y:a.y,targetX:a.aimX,targetY:a.aimY,kind:a.attackKind==='mine'?'shot':a.attackKind,life:a.tellTime,maxLife:a.tellMax});
   separateAliens(aliens,balance.formation);
   for(let i=shots.length-1;i>=0;i--){const s=shots[i],x0=s.x,y0=s.y;s.hitIds??=new Set();s.x+=s.vx*dt;s.y+=s.vy*dt;const contacts=[];
    for(const a of aliens){if(s.hitIds.has(a.id))continue;const t=segmentContact(x0,y0,s.x,s.y,a.x,a.y,a.radius+balance.shotRadius,aspect());if(t!==null)contacts.push({id:a.id,t});}
    contacts.sort((a,b)=>a.t-b.t||a.id-b.id);let active=true;
    for(const contact of contacts){const selected=aliens.findIndex(a=>a.id===contact.id);if(selected<0)continue;const a=aliens[selected];s.lastHit=a.id;s.hitIds.add(a.id);if(a.slot<32)s.hitLo|=1<<a.slot;else s.hitHi|=1<<(a.slot-32);hits++;sound('hit');a.hitTime=balance.hitFlashSeconds;
     if(a.shield>0){a.shield--;signal('shield-hit',a.x,a.y,a.shield,.4);releaseAt(shots,i,sp);active=false;break;}
     const damage=(equipment.damage||1)*power*(1+alienStack(campaign,'damage',upgrades.damage))*(s.damage||1),dealt=damageAlien(a,damage);if(dealt>0)signal('enemy-hit',a.x,a.y,dealt,.25);burst(a.x,a.y);if(a.hp<=0)destroy(selected);if(--s.hp<=0){releaseAt(shots,i,sp);active=false;break;}
    }
    if(active&&(s.y<-30||s.x<0||s.x>config.width))releaseAt(shots,i,sp);
   }
   for(let i=pickups.length-1;i>=0;i--){const d=pickups[i];d.y+=d.vy*dt;const dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx*aspect(),dy);if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}
    if(dist<balance.pickups.radius+balance.playerRadius){const coolingFan=d.kind===0&&spreadCooldown>0;sound('bonus');signal(coolingFan?'spread-cooldown':'pickup',player.x,player.y,coolingFan?spreadCooldown:d.kind,1.5);if(d.kind===5)novaCharges++;else if(d.kind===0){if(!coolingFan){spreadTime=balance.spread.seconds;spreadCooldown=balance.spread.seconds+balance.spread.cooldownSeconds;}}else{powerup=d.kind;powerTime=balance.pickups.seconds;}releaseAt(pickups,i,pp);}else if(d.y>config.height+30)releaseAt(pickups,i,pp);}
   dropBonus();
   for(let i=loot.length-1;i>=0;i--){const d=loot[i];d.y+=d.vy*dt;const dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx*aspect(),dy);if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}if(dist<balance.pickups.radius+balance.playerRadius){sound('bonus');if(d.kind)crystals++;else coins++;score+=d.kind?campaign.crystalPoints:campaign.coinPoints;releaseAt(loot,i,lp);}else if(d.y>config.height)releaseAt(loot,i,lp);}
   for(let i=bolts.length-1;i>=0;i--){const b=bolts[i],x0=b.x,y0=b.y;b.x+=(b.vx||0)*dt;b.y+=(b.vy||settings.boltSpeed)*dt;if(segmentContact(x0,y0,b.x,b.y,player.x,player.y,balance.playerRadius*.62+balance.boltRadius*.55,aspect())!==null){releaseAt(bolts,i,bp);damagePlayer(player.x,player.y);}else if(b.y>config.height+20||b.x<-40||b.x>config.width+40)releaseAt(bolts,i,bp);}
   for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0)releaseAt(sparks,i,fp);}
   separateAliens(aliens,balance.formation);
   for(let i=aliens.length-1;i>=0;i--){const a=aliens[i];if(!a.boss&&a.diveAge<0&&a.y-a.radius>player.y+20){releaseAt(aliens,i,ap);damagePlayer(player.x,player.y);}}
   if(lives<=0)finish('lose');else if(!aliens.length&&wave>=settings.waves)finish('win');else if(time>=settings.seconds)finish(completion==='survival'&&!settings.boss?'win':'lose');
  },
  snapshot(){return{hangar:{...hangar},spreadTime,spreadCooldown,kills,pendingBonuses,bonusesDropped:dropSerial,score,lives,maxLives,wave,time,choosing,choices:[...choices],upgrades:{...upgrades},wings:wings.map(w=>({...w})),combo,coins,crystals,pattern:pattern(),remaining:model.remaining,loot:loot.map(d=>({...d})),result:result?{...result}:null,player:{...player},aliens:aliens.map(a=>({...a})),shots:shots.map(s=>({...s})),bolts:bolts.map(b=>({...b})),pickups:pickups.map(d=>({...d})),powerup,powerTime,novaCharges,nova:{...nova},feedback:{...feedback},telegraphs:telegraphs.map(t=>({...t})),fired,hits,level};}
 };return model;
}
