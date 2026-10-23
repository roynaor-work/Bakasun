import {moveAlienPlayer} from './g2m-motion.mjs?v=island-art-20261022-3';
import {drawAlienEffects,drawAlienBolts,drawAlienShots} from './g2m-effects.mjs?v=island-art-20261022-3';
import {availableAlienUpgrades} from '../activity/alien-upgrades.mjs?v=island-art-20261022-3';
import {createAlienView} from './alien-view.mjs?v=island-art-20261022-3';
import {runAlienSession} from './alien-session.mjs';
import './alien-ui.mjs';
import {createPool,releaseAt} from './pool.mjs?v=island-art-20261022-3';
import {oval,drawHealthBar} from './art.mjs?v=island-art-20261022-3';
export function alienStack(campaign,id,rank){return (campaign.stackCurve[id]||[]).slice(0,rank).reduce((n,v)=>n+v,0);}
const EMPTY=Object.freeze({}),TAU=Math.PI*2;

/** One pooled entity factory for all enemy variants; geometry lives in art.mjs. */
export function createAlienEntity(pool,balance,x,y,kind,level,phase=0,child=false,bossHp=0) {
  const a=pool.take(x,y,0,0,0,kind);if(!a)return null;
  const type=balance.enemyTypes[kind],scale=child?balance.pickups.childScale:bossHp?balance.bossScale:1;
  a.hp=bossHp||type.hp*(child?1:1+(level-1)*balance.hpPerStage);a.maxHp=a.hp;
  a.speed=type.speed*(child?balance.pickups.childSpeed:1);a.radius=balance.alienRadius*type.radius*scale;
  a.boss=bossHp>0;a.child=child;a.scale=scale;a.baseX=x;a.baseY=y;a.age=0;a.phase=phase;a.launchTime=type.launchSeconds||0;a.launched=0;
  a.attackPattern=0;a.attackTime=0;a.hitTime=0;a.formation='rows';a.reward=child?0:1;return a;
}
export function separateAliens(aliens,formation){
 for(let pass=0;pass<formation.separationPasses;pass++){let changed=false;for(let i=0;i<aliens.length;i++)for(let j=i+1;j<aliens.length;j++){const a=aliens[i],b=aliens[j],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),need=a.radius+b.radius+formation.collisionGap;if(distance<need){const nx=distance?dx/distance:1,ny=distance?dy/distance:0,shift=(need-distance)/2;a.x-=nx*shift;a.y-=ny*shift;b.x+=nx*shift;b.y+=ny*shift;changed=true;}}if(!changed)break;}
}
export function createAlienModel({config,balance,level,bonuses=EMPTY,random,power=1,equipment=EMPTY,permanentUpgrades=EMPTY,hangar=EMPTY,careerWins=Math.max(0,level-1),roundChoices=true,completion='survival',onUpgrade=()=>{},sound=()=>{}}) {
  const campaign=balance.campaign,behavior=balance.stageBehaviors[level-1];
  const settings={...balance.levels[level-1]},player={x:config.width/2,y:config.height-balance.playerBottom};
  const aliens=[],shots=[],bolts=[],sparks=[],pickups=[];
  const alienPool=createPool(balance.maxAliens),shotPool=createPool(balance.maxShots),boltPool=createPool(balance.maxBolts),sparkPool=createPool(balance.maxSparks),pickupPool=createPool(balance.pickups.max);
  let maxLives=Math.ceil(settings.lives*power)+(bonuses.shield||0)+(equipment.shield||0)+(permanentUpgrades.shield||0)+(hangar.shield||0),damage=equipment.damage||1,rate=(equipment.rate||1)*(1+(hangar.rapid||0)*balance.hangar.rankRate);
  const initialDamage=Math.min(maxLives-1,hangar.damage||0);
  const nova={x:player.x,y:player.y,life:0,flight:0,fromX:0,fromY:0,radius:balance.nova.radius,stopY:config.height*balance.nova.stopYFraction,hitId:null};
  const upgrades=Object.fromEntries(campaign.choiceIds.map(id=>[id,permanentUpgrades[id]||0])),choices=Array(campaign.choiceCount).fill('wing'),bag=[...campaign.choiceIds];
  const wings=Array.from({length:campaign.maxWings},(_,i)=>({x:0,y:0,active:false,side:i?1:-1})),loot=[],lootPool=createPool(campaign.maxLoot);
  let pendingBonuses=0,bonusX=0,bonusY=0,spreadTime=0,spreadCooldown=0,wingTime=0;
  let choosing=false,combo=0,comboTime=0,celebration=0,coins=0,crystals=0,waveDeadline=settings.seconds/settings.waves;
  let formationAge=0;
  let score=0,lives=maxLives-initialDamage,wave=1,shotTime=0,boltTime=0,direction=1,invulnerable=0,nextWave=0,time=0,fired=0,hits=0,result,kills=0,dropSerial=0,powerup=-1,powerTime=0,novaCharges=balance.nova.charges,novaPressed=false,spawned=0,serial=0,diveTime=balance.tactics.firstDiveSeconds;
  const status={score:0,lives,wave,waves:settings.waves,nova:novaCharges};
  function spawn(x,y,kind,child=false,bossHp=0){const a=createAlienEntity(alienPool,balance,x,y,kind,level,random()*TAU,child,bossHp);if(a){a.id=++serial;a.shield=child?0:Math.max(behavior.shield,balance.enemyTypes[kind].shield||0);a.facing=1;a.entrySide=0;a.diveAge=-1;a.entry=child?0:balance.formation.entrySeconds;a.mineTime=balance.enemyTypes[kind].mineSeconds||0;aliens.push(a);}return a;}
  function formation(){
    direction=random()<.5?-1:1;formationAge=0;spawned=0;diveTime=balance.tactics.firstDiveSeconds;
    for(let row=0;row<settings.rows;row++)for(let col=0;col<settings.columns;col++){
      const pattern=campaign.patterns[(wave-1)%settings.patternKinds],index=row*settings.columns+col,count=settings.rows*settings.columns;
      let x=balance.formationX+col*balance.columnSpacing,y=balance.formationY+row*balance.rowSpacing;
      if(pattern==='v'){x=config.width/2+(col-(settings.columns-1)/2)*balance.columnSpacing;y=balance.formationY+Math.abs(col-(settings.columns-1)/2)*campaign.patternSpacing+row*campaign.patternSpacing;}
      if(pattern==='circle'){x=config.width/2+Math.cos(index/count*TAU)*campaign.circleRadius;y=balance.formationY+campaign.circleRadius+Math.sin(index/count*TAU)*campaign.circleRadius;}
      x=balance.formationX+col*balance.formation.colGap;y=balance.formationY+row*balance.formation.rowGap;const a=spawn(x,y,(row+col)%settings.enemyKinds);if(a){a.formation=pattern;a.entrySide=col<(settings.columns-1)/2?-1:1;a.diveAge=-1;a.y=y-balance.formation.entryDistance;}
    }
    if(settings.boss&&wave===settings.waves){const a=spawn(config.width/2,balance.formationY/2,4,false,settings.bossLives);if(a)a.y=a.baseY-balance.formation.entryDistance;}separateAliens(aliens,balance.formation);
  }
  function blastRadius(x,y,fleet){
    const damage=balance.nova.damage*(1+(level-1)*balance.hpPerStage),weak=fleet.filter(a=>a.hp<=damage*(1-(balance.enemyTypes[a.kind].novaResistance||0))).map(a=>Math.max(0,Math.hypot((a.x-x)*(model.effectAspect||1),a.y-y)-a.radius)).sort((a,b)=>a-b);
    const count=Math.max(1,Math.round(fleet.length*balance.nova.targetFraction));
    return Math.max(24,Math.min(balance.nova.maxRadius,weak.length>=count?((weak[count-1]+(weak[count]??weak[count-1]+12))/2):balance.nova.radius));
  }
  function enemyFire(a){
    const type=balance.enemyTypes[a.kind],fan=a.boss?(a.attackPattern=(a.attackPattern||0)^1):a.kind===1;
    const speed=settings.boltSpeed*(a.boss?.85:a.kind===0?1.5:a.kind===1?.65:1);
    const aim=Math.max(-balance.enemyAimSpeed,Math.min(balance.enemyAimSpeed,(player.x-a.x)*speed/Math.max(1,player.y-a.y)));
    for(const offset of fan?[-.48,0,.48]:a.boss?[-.13,0,.13]:[0]){
      const b=boltPool.take(a.x,a.y+balance.alienRadius,aim+Math.sin(offset)*speed,speed*Math.cos(offset));
      if(b){b.mine=false;b.kind=a.kind;b.color=a.boss?'#ff526f':type.color;b.shape=a.boss?(fan?'diamond':'ring'):type.projectile;b.pattern=a.boss?a.attackPattern:null;bolts.push(b);}
    }
  }
  function burst(x,y){for(let i=0;i<balance.sparkCount;i++){const angle=random()*TAU,s=sparkPool.take(x,y,Math.cos(angle)*balance.sparkSpeed,Math.sin(angle)*balance.sparkSpeed,balance.sparkSeconds);if(s)sparks.push(s);}}
  function destroy(i,split=true,missile=false){
    const a=aliens[i],x=a.x,y=a.y,type=balance.enemyTypes[a.kind],children=split&&!a.child&&!a.boss?(type.children||0):0;
    score+=a.reward*settings.points;kills++;if(!missile){burst(x,y);sound('explosion');}
    if(a.reward){combo=comboTime>0?combo+1:1;comboTime=campaign.comboSeconds;if(combo%campaign.comboMilestone===0){celebration=campaign.celebrationSeconds;score+=combo*campaign.comboBonus;}
      const kind=a.boss||type.loot==='crystal'?1:type.loot==='coin'?0:-1;
      if(kind>=0){const d=lootPool.take(x,y,0,campaign.lootSpeed,0,kind);if(d)loot.push(d);}
    }
    if(kills%settings.killsPerBonus===0){pendingBonuses++;bonusX=x;bonusY=y;}
    dropBonus();
    releaseAt(aliens,i,alienPool);
    for(let n=0;n<children;n++)spawn(x+(n-.5)*balance.alienRadius,y,0,true);
  }
  function dropBonus(){if(!pendingBonuses||pickups.length)return;const rotation=balance.pickups.rotation,d=pickupPool.take(bonusX,bonusY,0,balance.pickups.speed,0,rotation[dropSerial%rotation.length]);if(d){pendingBonuses--;dropSerial++;pickups.push(d);}}
  const wingRank=()=>Math.max(powerup===4?1:0,upgrades.wing+(equipment.weapon||0));
  function fireShot(vx,kind,fromX=player.x,wing=false,fromY=player.y){const s=shotPool.take(fromX,fromY-balance.playerRadius,vx,-balance.shotSpeed,0,kind);if(s){s.wing=wing;s.damage=wing?campaign.wingDamage*alienStack(campaign,'wing',wingRank())/Math.max(1,wings.filter(w=>w.active).length):1;s.hp=kind===1?balance.pickups.laserPierce+alienStack(campaign,'laser',upgrades.laser):1;s.lastHit=-1;s.hitLo=s.hitHi=0;shots.push(s);fired++;}}
  function offerUpgrade(){
    const available=availableAlienUpgrades(upgrades,balance,equipment,careerWins);let count=available.length;
    if(!roundChoices||!count)return false;bag.splice(0,bag.length,...available);choices.length=Math.min(campaign.choiceCount,count);
    for(let i=0;i<choices.length;i++){const at=i+Math.floor(random()*(count-i)),id=bag[at];bag[at]=bag[i];bag[i]=id;choices[i]=id;}choosing=true;return true;
  }
  function chooseUpgrade(index){
    if(!choosing||!Number.isInteger(index)||index<0||index>=choices.length)return false;
    const id=choices[index];upgrades[id]++;onUpgrade({...upgrades});sound('upgrade');if(id==='wing')wingTime=balance.pickups.seconds;if(id==='shield'){maxLives++;lives=Math.min(maxLives,lives+1);}choosing=false;wave++;waveDeadline=settings.seconds/settings.waves*wave;nextWave=0;formation();return true;
  }
  function finish(outcome){sound(outcome==='win'?'stageEnd':'lose');score=Math.min(settings.scoreLimit,score);result={outcome,score,damage:Math.max(0,maxLives-lives),performance:.65*lives/maxLives+.35*Math.min(1,hits/Math.max(1,fired))};}
  formation();
  const model={settings,player,aliens,shots,bolts,sparks,pickups,nova,equipment,upgrades,choices,wings,loot,chooseUpgrade,get maxLives(){return maxLives;},get choosing(){return choosing;},get combo(){return combo;},get celebration(){return celebration;},get coins(){return coins;},get crystals(){return crystals;},get pattern(){return campaign.patterns[(wave-1)%settings.patternKinds];},get remaining(){return Math.max(0,settings.seconds-time);},statusId:'minigame.alienStatus',
    get spreadTime(){return spreadTime;},get spreadCooldown(){return spreadCooldown;},get score(){return score;},get lives(){return lives;},get wave(){return wave;},get result(){return result;},get time(){return time;},get invulnerable(){return invulnerable;},get powerup(){return powerup;},get powerTime(){return powerTime;},get novaCharges(){return novaCharges;},
    statusValues(){status.score=score;status.lives=lives;status.wave=wave;status.nova=novaCharges;return status;},
    update(dt,input=EMPTY){
      if(result||dt<=0||choosing)return;dt=Math.min(dt,config.maxFrameSeconds);time+=dt;invulnerable=Math.max(0,invulnerable-dt);nova.life=Math.max(0,nova.life-dt);
      comboTime=Math.max(0,comboTime-dt);if(!comboTime)combo=0;celebration=Math.max(0,celebration-dt);
      for(let i=0;i<wings.length;i++){const wing=wings[i];wing.active=(wingTime>0||powerup===4)&&i<Math.min(campaign.maxWings,wingRank());const desired=player.x+wing.side*campaign.wingOffset;wing.x=Math.max(campaign.wingRadius,Math.min(config.width-campaign.wingRadius,desired));wing.y=player.y+Math.sin(time*3+i)*8-(wing.x!==desired?campaign.wingFrontOffset:0);}
      wingTime=Math.max(0,wingTime-dt);spreadTime=Math.max(0,spreadTime-dt);spreadCooldown=Math.max(0,spreadCooldown-dt);
      powerTime=Math.max(0,powerTime-dt);if(!powerTime)powerup=-1;
      moveAlienPlayer(player,input,dt,balance,config.width);
      if(nova.flight>0){
        const nextY=Math.max(nova.stopY,nova.y-(nova.fromY-nova.stopY)/balance.nova.throwSeconds*dt);
        let impactY=nextY,hit=null;
        // Swept circle intersection: choose the first contact along the upward
        // segment, irrespective of pool order or frame length.
        for(const a of aliens){
          const dx=(a.x-nova.x)*(model.effectAspect||1),radius=a.radius+balance.nova.projectileRadius;
          if(Math.abs(dx)>radius)continue;
          const contact=a.y+Math.sqrt(radius*radius-dx*dx);
          if(contact>=nextY&&a.y-radius<=nova.y&&(!hit||contact>impactY)){impactY=Math.min(nova.y,contact);hit=a;}
        }
        nova.y=impactY;nova.flight=Math.max(0,(nova.y-nova.stopY)/(nova.fromY-nova.stopY)*balance.nova.throwSeconds);
        if(hit||nextY===nova.stopY){
          nova.flight=0;nova.hitId=hit?.id??null;nova.life=balance.nova.seconds;sound('missileExplosion');
          nova.radius=blastRadius(nova.x,nova.y,aliens.filter(a=>a.y+a.radius>0));
          for(let i=aliens.length-1;i>=0;i--){const a=aliens[i];if(Math.hypot((a.x-nova.x)*(model.effectAspect||1),a.y-nova.y)<=nova.radius+a.radius){a.hp-=balance.nova.damage*(1+(level-1)*balance.hpPerStage)*(1-(balance.enemyTypes[a.kind].novaResistance||0));if(a.hp<=0)destroy(i,false,true);}}
          for(let i=bolts.length-1;i>=0;i--)if(Math.hypot((bolts[i].x-nova.x)*(model.effectAspect||1),bolts[i].y-nova.y)<=nova.radius)releaseAt(bolts,i,boltPool);
        }
      }
      if(input.nova&&!novaPressed&&novaCharges>0&&nova.flight===0&&nova.life===0&&aliens.length){
        nova.x=nova.fromX=player.x;nova.y=nova.fromY=player.y;nova.hitId=null;novaCharges--;nova.flight=balance.nova.throwSeconds;sound('missileLaunch');
      }novaPressed=Boolean(input.nova);
      shotTime-=dt;
      if(input.firing&&shotTime<=0){
        const spread=spreadTime>0,laser=upgrades.laser>0||powerup===1||(powerup!==0&&(equipment.weapon||0)>=2);
        sound('shot');fireShot(0,laser?1:0);if(spread)for(let lane=0;lane<1;lane++){const speed=balance.pickups.spreadSpeed*(1+lane*campaign.spreadStep);fireShot(-speed,0);fireShot(speed,0);}
        for(const wing of wings)if(wing.active)fireShot(0,laser?1:0,wing.x,true,wing.y);
        shotTime=settings.shotSeconds/(1+alienStack(campaign,'rapid',upgrades.rapid))/(power*rate+(bonuses.fireRate||0))/(powerup===2?balance.pickups.rapidMultiplier:1);
      }
      if(!aliens.length){
        // Expiry must precede an upgrade pause, including when both deadlines
        // are crossed in this frame. Otherwise choosing freezes a zero clock.
        if(time>=settings.seconds){finish((completion==='survival'||wave>=settings.waves)&&lives>0?'win':'lose');return;}
        nextWave+=dt;if(nextWave>=balance.wavePauseSeconds){
        while(bolts.length)releaseAt(bolts,bolts.length-1,boltPool);
        // A cleared wave stays cleared. Respawning here recycled the final wave
        // before its deadline and tied completion to another kill after expiry.
        if(nextWave>=balance.wavePauseSeconds){if(wave>=settings.waves){finish('win');return;}if(offerUpgrade())return;wave++;waveDeadline=settings.seconds/settings.waves*wave;nextWave=0;formation();}
      }}
      const previousAge=formationAge;formationAge+=dt;
      const drift=behavior.motion==='static'?0:direction*balance.formation.sway*(Math.sin(formationAge*balance.formation.swayFrequency)-Math.sin(previousAge*balance.formation.swayFrequency));
      if(behavior.shoots&&behavior.motion!=='static')diveTime-=dt;
      if(diveTime<=0&&!aliens.some(a=>a.diveAge>=0)){
        const front=Math.max(...aliens.filter(a=>!a.boss&&!a.child).map(a=>a.baseY));
        const candidates=aliens.filter(a=>!a.boss&&!a.child&&a.entry===0&&a.kind===2&&a.baseY>=front-1);
        const diver=candidates[Math.floor(random()*candidates.length)];
        if(diver){diver.diveAge=0;diver.diveX=diver.x;diver.diveY=diver.y;diver.diveTargetX=player.x;diver.diveTargetY=player.y-(settings.diveClearance??balance.tactics.diveClearance);diver.diveHit=false;}
        diveTime=balance.tactics.diveEverySeconds;
      }
      for(const a of aliens){
        const type=balance.enemyTypes[a.kind];a.hitTime=Math.max(0,a.hitTime-dt);a.age+=dt;a.entry=Math.max(0,a.entry-dt);
        a.baseX+=drift;
        if(behavior.motion!=='static')a.baseY+=balance.tactics.descentSpeed*dt;
        const homeX=a.baseX,homeY=a.baseY+(behavior.motion==='static'?0:Math.sin(a.age*balance.formation.swayFrequency)*balance.formation.bob);
        const entryT=1-a.entry/balance.formation.entrySeconds,ease=entryT*entryT*(3-2*entryT);
        a.x=homeX+a.entrySide*Math.sin(entryT*Math.PI)**2*balance.tactics.entrySway;
        a.y=homeY-balance.formation.entryDistance*(1-ease);
        if(a.diveAge>=0){a.diveAge+=dt;const t=Math.min(1,a.diveAge/balance.tactics.diveSeconds),s=Math.sin(t*Math.PI)**2;
          a.x=homeX+(a.diveTargetX-homeX)*s+Math.sin(t*TAU)*balance.tactics.diveSway*s;a.y=homeY+(a.diveTargetY-homeY)*s;
          if(!a.diveHit&&Math.hypot(a.x-player.x,a.y-player.y)<a.radius+balance.playerRadius){a.diveHit=true;if(!invulnerable&&powerup!==3){lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);}}
          if(t===1)a.diveAge=-1;
        }
        if(a.boss&&a.entry===0){a.attackTime-=dt;if(a.attackTime<=0){enemyFire(a);a.attackTime=balance.tactics.bossAttackSeconds;}}
        if(type.mineSeconds&&!a.boss&&a.entry===0){a.mineTime-=dt;if(a.mineTime<=0){const mine=boltPool.take(a.x,a.y,0,0);if(mine){mine.mine=true;mine.kind=a.kind;mine.color=type.color;mine.shape=type.projectile;bolts.push(mine);}a.mineTime=type.mineSeconds;}}
        if(type.launchSeconds&&!a.boss&&!a.child&&a.launched<type.launchLimit&&spawned<settings.spawnBudget){a.launchTime-=dt;if(a.launchTime<=0){a.launchTime=type.launchSeconds;a.launched++;spawned++;spawn(a.x,a.y+balance.rowSpacing,0,true);}}
      }
      separateAliens(aliens,balance.formation);
      boltTime-=dt;
      if(boltTime<=0&&aliens.length&&(behavior.shoots||settings.bossShots>1)){
        const a=aliens[Math.floor(random()*aliens.length)];if(!a.boss)enemyFire(a);
        boltTime=settings.boltSeconds*(balance.boltJitterBase+random()*balance.boltJitterRange)*(a.kind===1?3:1.2);
      }
      for(const shot of shots){shot.y+=shot.vy*dt;shot.x+=shot.vx*dt;}
      for(const bolt of bolts){bolt.y+=(bolt.mine?settings.boltSpeed/balance.formation.rowGap:bolt.vy||settings.boltSpeed)*dt;bolt.x+=(bolt.vx||0)*dt;}
      for(let i=shots.length-1;i>=0;i--){
        const s=shots[i];let hit=-1;
        for(let j=0;j<aliens.length;j++){const a=aliens[j];const mask=a.slot<32?s.hitLo:s.hitHi;if(!(mask&(1<<(a.slot%32)))&&Math.abs(a.x-s.x)<a.radius+balance.shotRadius&&Math.abs(a.y-s.y)<a.radius+balance.shotRadius){hit=j;break;}}
        if(hit>=0){const a=aliens[hit];s.lastHit=a.id;if(a.slot<32)s.hitLo|=1<<a.slot;else s.hitHi|=1<<(a.slot-32);hits++;sound('hit');if(a.shield>0){a.shield--;a.hitTime=balance.hitFlashSeconds;releaseAt(shots,i,shotPool);continue;}a.hitTime=balance.hitFlashSeconds;a.hp-=damage*power*(1+alienStack(campaign,'damage',upgrades.damage))*(s.damage||1);burst(a.x,a.y);if(a.hp<=0||(!a.child&&!a.boss&&balance.enemyTypes[a.kind].children))destroy(hit);if(--s.hp<=0)releaseAt(shots,i,shotPool);}
        else if(s.y<-balance.shotRadius||s.x<0||s.x>config.width)releaseAt(shots,i,shotPool);
      }
      for(let i=pickups.length-1;i>=0;i--){const d=pickups[i],dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx,dy);d.y+=d.vy*dt;
        if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}
        if(dist<balance.pickups.radius+balance.playerRadius){sound('bonus');if(d.kind===5)novaCharges++;else if(d.kind===0){if(spreadCooldown===0){spreadTime=balance.spread.seconds;spreadCooldown=balance.spread.seconds+balance.spread.cooldownSeconds;}}else{powerup=d.kind;powerTime=balance.pickups.seconds;}releaseAt(pickups,i,pickupPool);}else if(d.y>config.height+balance.pickups.radius)releaseAt(pickups,i,pickupPool);
      }
      dropBonus();
      for(let i=loot.length-1;i>=0;i--){const d=loot[i];d.y+=d.vy*dt;const dx=player.x-d.x,dy=player.y-d.y,dist=Math.hypot(dx,dy);if(dist<balance.pickups.magnetRadius&&dist>0){d.x+=dx/dist*balance.pickups.magnetSpeed*dt;d.y+=dy/dist*balance.pickups.magnetSpeed*dt;}if(dist<balance.pickups.radius+balance.playerRadius){sound('bonus');if(d.kind)crystals++;else coins++;score+=d.kind?campaign.crystalPoints:campaign.coinPoints;releaseAt(loot,i,lootPool);}else if(d.y>config.height)releaseAt(loot,i,lootPool);}
      for(let i=bolts.length-1;i>=0;i--){const b=bolts[i];if(Math.hypot(b.x-player.x,b.y-player.y)<balance.playerRadius+balance.boltRadius){releaseAt(bolts,i,boltPool);if(!invulnerable&&powerup!==3){lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);}}else if(b.y>config.height+balance.boltRadius)releaseAt(bolts,i,boltPool);}
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0)releaseAt(sparks,i,sparkPool);}
      separateAliens(aliens,balance.formation);
      let landed=false;for(const a of aliens)if(!(a.diveAge>=0)&&a.y+a.radius>=player.y-balance.playerRadius){landed=true;break;}
      if(lives<=0||landed)finish('lose');
      else if(!aliens.length&&wave>=settings.waves)finish('win');
      else if(time>=settings.seconds)finish(completion==='survival'?'win':'lose');
    },
    snapshot(){return {hangar:{...hangar},spreadTime,spreadCooldown,kills,pendingBonuses,bonusesDropped:dropSerial,score,lives,maxLives,wave,time,choosing,choices:[...choices],upgrades:{...upgrades},wings:wings.map(w=>({...w})),combo,coins,crystals,pattern:model.pattern,remaining:model.remaining,loot:loot.map(d=>({...d})),result:result?{...result}:null,player:{...player},aliens:aliens.map(a=>({...a})),shots:shots.map(s=>({...s})),bolts:bolts.map(b=>({...b})),pickups:pickups.map(d=>({...d})),powerup,powerTime,novaCharges,nova:{...nova}};}
  };return model;
}
export function drawAliens(p,m,{config,balance,art,quality,view,pixelAspect=1}) {
  if(view?.draw(p)){drawAlienShots(p,m.shots,pixelAspect);drawAlienBolts(p,m.bolts,balance,pixelAspect);drawAlienEffects(p,m,balance,pixelAspect);return;}
  const palette=config.visuals.palette;
  const {width:w,height:h,art:a,visuals:v}=config;
  p.drawImage(art.backdrop,0,0);p.fillStyle=a.creamColor;
  const count=quality.low?balance.starCount:v.stars;
  for(let i=0;i<count;i++){const depth=1+i%3,x=(i*a.starStrideX+a.starOffsetX)%w,y=(i*a.starStrideY+m.time*balance.starSpeed*depth)%h;p.globalAlpha=a.starOpacity+(i%a.starVariants)*a.starOpacityStep;p.fillRect(x,y,a.starSize*depth/2,a.starSize*depth/2);}p.globalAlpha=1;
  for(const e of m.aliens){if(e.shield>0){p.strokeStyle=palette.shieldGlow;p.lineWidth=3;p.beginPath();p.ellipse(e.x,e.y,e.radius+7,e.radius+5,0,0,TAU);p.stroke();}const modelScale=art.modelScales?.enemies[e.kind]||1,regularScale=modelScale!==1?(balance.models.enemies[e.kind]?.regularScale??modelScale):1,size=balance.alienRadius*3*(modelScale!==1&&e.boss?modelScale:e.scale*regularScale);p.save();p.translate(e.x,e.y);p.scale(1/pixelAspect,1);p.rotate(Math.sin(e.age*2+e.phase)*.09);p.drawImage(art.aliens[e.kind],-size/2,-size/2,size,size*.88);if(e.hitTime>0){p.globalCompositeOperation='screen';p.globalAlpha=e.hitTime/balance.hitFlashSeconds;p.drawImage(art.aliens[e.kind],-size/2,-size/2,size,size*.88);}p.restore();if(e.maxHp>2)drawHealthBar(p,e.x-size/3,e.y-size*.5,size*2/3,3,e.hp,e.maxHp,config);}
  for(const s of m.shots){p.strokeStyle=s.kind===1?v.foam:a.sandColor;p.lineWidth=s.kind===1?5:3;p.beginPath();p.moveTo(s.x,s.y+16);p.lineTo(s.x,s.y-9);p.stroke();oval(p,s.x,s.y,2,8,palette.white);}
  drawAlienBolts(p,m.bolts,balance,pixelAspect);
  for(const d of m.pickups){p.save();p.translate(d.x,d.y);p.rotate(m.time*2);p.fillStyle=balance.pickups.colors[d.kind];p.fillRect(-7,-7,14,14);p.fillStyle=palette.white;p.fillRect(-2,-2,4,4);p.restore();}
  for(const s of m.sparks){p.globalAlpha=s.life/balance.sparkSeconds;oval(p,s.x,s.y,3,3,a.creamColor);}p.globalAlpha=1;
  drawAlienEffects(p,m,balance,pixelAspect);
  for(const d of m.loot){if(d.kind){p.fillStyle=palette.cockpitShine;p.beginPath();p.moveTo(d.x,d.y-9);p.lineTo(d.x+7,d.y);p.lineTo(d.x,d.y+9);p.lineTo(d.x-7,d.y);p.fill();}else{oval(p,d.x,d.y,7,8,palette.gold);oval(p,d.x-1,d.y-2,3,4,palette.ivory);}}
  for(const wing of m.wings)if(wing.active){p.save();p.translate(wing.x,wing.y);p.rotate(m.time*.7);p.fillStyle=palette.gold;p.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?7:15;if(i)p.lineTo(Math.cos(a)*r,Math.sin(a)*r);else p.moveTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();oval(p,-4,-1,2,3,palette.cockpit);oval(p,4,-1,2,3,palette.cockpit);p.restore();}
  const {x,y}=m.player;p.save();p.translate(x,y);p.scale(1/pixelAspect,1);p.rotate(-(m.player.bank||0)*balance.render.bankAngle);if(m.invulnerable&&Math.floor(m.time*a.shipBlinkRate)%2)p.globalAlpha=balance.blinkOpacity;
  const exhaust=12+Math.sin(m.time*25)*4;oval(p,0,30,6,exhaust,palette.exhaust);oval(p,0,29,3,exhaust*.7,palette.exhaustCore);const playerScale=art.modelScales?.player||1;p.drawImage(art.player,-35*playerScale,-40*playerScale,70*playerScale,77*playerScale);
  if(m.upgrades.damage>0||(m.equipment.damage||1)>1){oval(p,0,-9,4+m.upgrades.damage,9,palette.gold);}if((m.equipment.rate||1)>1){oval(p,-20,26,3,12,palette.cockpitShine);oval(p,20,26,3,12,palette.cockpitShine);}if(m.upgrades.laser>0||m.spreadTime>0){p.fillStyle=palette.ivory;p.fillRect(-25,-6,5,21);p.fillRect(20,-6,5,21);}
  if(m.powerup===3||m.upgrades.shield>0||(m.equipment.shield||0)>0){p.strokeStyle=palette.shieldGlow;p.lineWidth=3;p.beginPath();p.arc(0,0,32+Math.sin(m.time*5)*2,0,TAU);p.stroke();}p.restore();
}
export function startAliens(ctx){return runAlienSession(ctx,createAlienModel,drawAliens,createAlienView);}
