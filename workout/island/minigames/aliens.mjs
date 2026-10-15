import { runCanvasGame } from './canvas-session.mjs';
import {createPool,releaseAt} from './pool.mjs';

export function createAlienModel({ config, balance, level, bonuses = {}, random, power=1 }) {
  const settings = { ...balance.levels[level-1] };
  const player = { x:config.width/2, y:config.height-balance.playerBottom };
  const aliens=[], shots=[], bolts=[], sparks=[];
  const alienPool=createPool(balance.maxAliens),shotPool=createPool(balance.maxShots),boltPool=createPool(balance.maxBolts),sparkPool=createPool(balance.maxSparks);
  let score=0, lives=settings.lives+(bonuses.shield||0), wave=1, shotTime=0, boltTime=0, direction=1, invulnerable=0, nextWave=0, time=0, result;
  function formation() {
    direction=random()<.5?-1:1;
    for(let row=0;row<settings.rows;row++) for(let column=0;column<settings.columns;column++) {
      const alien=alienPool.take(balance.formationX+column*balance.columnSpacing,balance.formationY+row*balance.rowSpacing,0,0,0,row%balance.alienKinds);if(alien)aliens.push(alien);
    }
  }
  function burst(x,y) {
    for(let i=0;i<balance.sparkCount;i++) {const angle=random()*Math.PI*2,spark=sparkPool.take(x,y,Math.cos(angle)*balance.sparkSpeed,Math.sin(angle)*balance.sparkSpeed,balance.sparkSeconds);if(spark)sparks.push(spark);}
  }
  function finish(outcome) { result={outcome,score}; }
  formation();
  return {
    settings,player,aliens,shots,bolts,sparks,
    get score(){return score;},get lives(){return lives;},get wave(){return wave;},get result(){return result;},get time(){return time;},get invulnerable(){return invulnerable;},
    update(dt,input={}) {
      if(result || dt<=0) return;
      dt=Math.min(dt,config.maxFrameSeconds);time+=dt;invulnerable=Math.max(0,invulnerable-dt);
      const axis=Number(Boolean(input.right))-Number(Boolean(input.left));
      if(axis) player.x+=axis*balance.playerSpeed*dt;
      else if(Number.isFinite(input.x)) player.x+=(Math.max(-balance.playerSpeed*dt,Math.min(balance.playerSpeed*dt,input.x-player.x)));
      player.x=Math.max(balance.playerRadius,Math.min(config.width-balance.playerRadius,player.x));
      shotTime-=dt;
      if(input.firing && shotTime<=0) {const shot=shotPool.take(player.x,player.y-balance.playerRadius);if(shot)shots.push(shot);shotTime=settings.shotSeconds/(power+(bonuses.fireRate||0));}
      if(!aliens.length) {
        nextWave+=dt;
        if(nextWave>=balance.wavePauseSeconds) {
          if(wave>=settings.waves) {finish('win');return;}
          wave++;nextWave=0;while(bolts.length)releaseAt(bolts,bolts.length-1,boltPool);while(shots.length)releaseAt(shots,shots.length-1,shotPool);formation();
        }
      }
      const speed=settings.alienSpeed+(wave-1)*balance.speedPerWave;
      for(const alien of aliens) alien.x+=direction*speed*dt;
      let edge=false;for(const a of aliens)if(a.x<balance.alienRadius||a.x>config.width-balance.alienRadius){edge=true;break;}
      if(edge) {
        direction*=-1;
        for(const alien of aliens){alien.x=Math.max(balance.alienRadius,Math.min(config.width-balance.alienRadius,alien.x));alien.y+=settings.drop;}
      }
      boltTime-=dt;
      if(boltTime<=0 && aliens.length) {
        const alien=aliens[Math.floor(random()*aliens.length)];
        const bolt=boltPool.take(alien.x,alien.y+balance.alienRadius);if(bolt)bolts.push(bolt);boltTime=settings.boltSeconds*(balance.boltJitterBase+random()*balance.boltJitterRange);
      }
      for(const shot of shots) shot.y-=balance.shotSpeed*dt;
      for(const bolt of bolts) bolt.y+=settings.boltSpeed*dt;
      for(let i=shots.length-1;i>=0;i--) {
        const shot=shots[i];let hit=-1;
        for(let j=0;j<aliens.length;j++){const a=aliens[j];if(Math.abs(a.x-shot.x)<balance.alienRadius+balance.shotRadius&&Math.abs(a.y-shot.y)<balance.alienRadius+balance.shotRadius){hit=j;break;}}
        if(hit>=0){const alien=releaseAt(aliens,hit,alienPool);burst(alien.x,alien.y);releaseAt(shots,i,shotPool);score+=settings.points;}
        else if(shot.y < -balance.shotRadius)releaseAt(shots,i,shotPool);
      }
      if(!aliens.length&&wave>=settings.waves){finish('win');return;}
      for(let i=bolts.length-1;i>=0;i--) {
        const bolt=bolts[i];
        if(Math.hypot(bolt.x-player.x,bolt.y-player.y)<balance.playerRadius+balance.boltRadius) {
          releaseAt(bolts,i,boltPool);
          if(!invulnerable){lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);}
        } else if(bolt.y>config.height+balance.boltRadius) releaseAt(bolts,i,boltPool);
      }
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0)releaseAt(sparks,i,sparkPool);}
      let landed=false;for(const a of aliens)if(a.y+balance.alienRadius>=player.y-balance.playerRadius){landed=true;break;}
      if(lives<=0 || landed)finish('lose');
    },
    snapshot(){return {score,lives,wave,result:result?{...result}:null,player:{...player},aliens:aliens.map(a=>({...a})),shots:shots.map(s=>({...s})),bolts:bolts.map(b=>({...b}))};}
  };
}

export function drawAliens(p,model,{config,balance}) {
  const {width:w,height:h,art:a}=config;
  p.fillStyle=a.spaceColor;p.fillRect(0,0,w,h);
  p.fillStyle=a.creamColor;
  for(let i=0;i<balance.starCount;i++){const x=(i*a.starStrideX+a.starOffsetX)%w,y=(i*a.starStrideY+model.time*balance.starSpeed)%(h-balance.playerBottom);p.globalAlpha=a.starOpacity+(i%a.starVariants)*a.starOpacityStep;p.fillRect(x,y,a.starSize,a.starSize);}p.globalAlpha=1;
  p.fillStyle=a.tealColor;p.beginPath();p.ellipse(w/2,h+a.seaBottomOffset,w*a.seaWidthRatio,a.seaHeight,0,0,Math.PI*2);p.fill();
  for(const alien of model.aliens){
    p.save();p.translate(alien.x,alien.y);p.fillStyle=balance.alienColors[alien.kind];
    p.beginPath();p.ellipse(0,1,a.alienWidth,a.alienHeight,0,0,Math.PI*2);p.fill();
    p.fillStyle=a.creamColor;p.beginPath();p.ellipse(0,a.alienDomeY,a.alienDomeWidth,a.alienDomeHeight,0,Math.PI,Math.PI*2);p.fill();
    p.fillStyle=a.spaceColor;p.fillRect(-a.alienEyeX,a.alienEyeY,a.alienEyeWidth,a.alienEyeHeight);p.fillRect(a.alienEyeX-a.alienEyeWidth,a.alienEyeY,a.alienEyeWidth,a.alienEyeHeight);
    p.fillStyle=a.creamColor;for(let light=-1;light<=1;light++){p.beginPath();p.arc(light*a.alienLightSpacing,a.alienLightY,a.alienLightRadius,0,Math.PI*2);p.fill();}p.restore();
  }
  p.fillStyle=a.sandColor;for(const shot of model.shots)p.fillRect(shot.x-a.shotWidth/2,shot.y-a.shotHeight/2,a.shotWidth,a.shotHeight);
  p.fillStyle=a.coralColor;for(const bolt of model.bolts){p.beginPath();p.ellipse(bolt.x,bolt.y,a.boltWidth,a.boltHeight,0,0,Math.PI*2);p.fill();}
  for(const s of model.sparks){p.globalAlpha=s.life/balance.sparkSeconds;p.fillStyle=a.creamColor;p.fillRect(s.x-a.sparkSize/2,s.y-a.sparkSize/2,a.sparkSize,a.sparkSize);}p.globalAlpha=1;
  const {x,y}=model.player;
  p.save();p.translate(x,y);if(model.invulnerable && Math.floor(model.time*a.shipBlinkRate)%2)p.globalAlpha=balance.blinkOpacity;
  p.fillStyle=a.seaColor;p.beginPath();p.moveTo(0,a.shipNoseY);p.lineTo(a.shipWingX,a.shipWingY);p.lineTo(0,a.shipCenterY);p.lineTo(-a.shipWingX,a.shipWingY);p.closePath();p.fill();
  p.fillStyle=a.creamColor;p.fillRect(-a.shipCoreWidth/2,a.shipCoreY,a.shipCoreWidth,a.shipCoreHeight);p.fillStyle=a.coralColor;p.fillRect(-a.shipExhaustWidth/2,a.shipExhaustY,a.shipExhaustWidth,a.shipExhaustHeight);p.restore();
}

export function startAliens(ctx) {return runCanvasGame(ctx,createAlienModel,drawAliens);}
