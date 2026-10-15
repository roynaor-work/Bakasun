import { runCanvasGame } from './canvas-session.mjs';

export function createAlienModel({ config, balance, level, bonuses = {}, random }) {
  const settings = { ...balance.levels[level-1] };
  const player = { x:config.width/2, y:config.height-balance.playerBottom };
  const aliens=[], shots=[], bolts=[], sparks=[];
  let score=0, lives=settings.lives+(bonuses.shield||0), wave=1, shotTime=0, boltTime=0, direction=1, invulnerable=0, nextWave=0, time=0, result;
  function formation() {
    direction=random()<.5?-1:1;
    for(let row=0;row<settings.rows;row++) for(let column=0;column<settings.columns;column++) {
      aliens.push({x:balance.formationX+column*balance.columnSpacing,y:balance.formationY+row*balance.rowSpacing,kind:row%balance.alienKinds});
    }
  }
  function burst(x,y) {
    for(let i=0;i<balance.sparkCount;i++) {const angle=random()*Math.PI*2; sparks.push({x,y,vx:Math.cos(angle)*balance.sparkSpeed,vy:Math.sin(angle)*balance.sparkSpeed,life:balance.sparkSeconds});}
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
      if(input.firing && shotTime<=0) {shots.push({x:player.x,y:player.y-balance.playerRadius});shotTime=settings.shotSeconds/(1+(bonuses.fireRate||0));}
      if(!aliens.length) {
        nextWave+=dt;
        if(nextWave>=balance.wavePauseSeconds) {
          if(wave>=settings.waves) {finish('win');return;}
          wave++;nextWave=0;bolts.length=0;shots.length=0;formation();
        }
      }
      const speed=settings.alienSpeed+(wave-1)*balance.speedPerWave;
      for(const alien of aliens) alien.x+=direction*speed*dt;
      if(aliens.some(a=>a.x<balance.alienRadius||a.x>config.width-balance.alienRadius)) {
        direction*=-1;
        for(const alien of aliens){alien.x=Math.max(balance.alienRadius,Math.min(config.width-balance.alienRadius,alien.x));alien.y+=settings.drop;}
      }
      boltTime-=dt;
      if(boltTime<=0 && aliens.length) {
        const alien=aliens[Math.floor(random()*aliens.length)];
        bolts.push({x:alien.x,y:alien.y+balance.alienRadius});boltTime=settings.boltSeconds*(balance.boltJitterBase+random()*balance.boltJitterRange);
      }
      for(const shot of shots) shot.y-=balance.shotSpeed*dt;
      for(const bolt of bolts) bolt.y+=settings.boltSpeed*dt;
      for(let i=shots.length-1;i>=0;i--) {
        const shot=shots[i], hit=aliens.findIndex(a=>Math.abs(a.x-shot.x)<balance.alienRadius+balance.shotRadius&&Math.abs(a.y-shot.y)<balance.alienRadius+balance.shotRadius);
        if(hit>=0){const [alien]=aliens.splice(hit,1);burst(alien.x,alien.y);shots.splice(i,1);score+=settings.points;}
        else if(shot.y < -balance.shotRadius)shots.splice(i,1);
      }
      for(let i=bolts.length-1;i>=0;i--) {
        const bolt=bolts[i];
        if(Math.hypot(bolt.x-player.x,bolt.y-player.y)<balance.playerRadius+balance.boltRadius) {
          bolts.splice(i,1);
          if(!invulnerable){lives--;invulnerable=balance.invulnerableSeconds;burst(player.x,player.y);}
        } else if(bolt.y>config.height+balance.boltRadius) bolts.splice(i,1);
      }
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0)sparks.splice(i,1);}
      if(lives<=0 || aliens.some(a=>a.y+balance.alienRadius>=player.y-balance.playerRadius))finish('lose');
    },
    snapshot(){return {score,lives,wave,result:result?{...result}:null,player:{...player},aliens:aliens.map(a=>({...a})),shots:shots.map(s=>({...s})),bolts:bolts.map(b=>({...b}))};}
  };
}

export function drawAliens(p,model,{config,balance}) {
  const {width:w,height:h}=config;
  p.fillStyle='#173d54';p.fillRect(0,0,w,h);
  p.fillStyle='#c3f7eb';
  for(let i=0;i<balance.starCount;i++){const x=(i*73+19)%w,y=(i*139+model.time*balance.starSpeed)%(h-balance.playerBottom);p.globalAlpha=.25+(i%3)*.18;p.fillRect(x,y,2,2);}p.globalAlpha=1;
  p.fillStyle='#287a83';p.beginPath();p.ellipse(w/2,h+25,w*.7,70,0,0,Math.PI*2);p.fill();
  for(const a of model.aliens){
    p.save();p.translate(a.x,a.y);p.fillStyle=balance.alienColors[a.kind];
    p.beginPath();p.ellipse(0,1,17,10,0,0,Math.PI*2);p.fill();
    p.fillStyle='#c3f7eb';p.beginPath();p.ellipse(0,-5,10,9,0,Math.PI,Math.PI*2);p.fill();
    p.fillStyle='#173d54';p.fillRect(-6,-6,3,4);p.fillRect(3,-6,3,4);
    p.fillStyle='#fff4dc';for(const x of [-10,0,10]){p.beginPath();p.arc(x,5,2,0,Math.PI*2);p.fill();}p.restore();
  }
  p.fillStyle='#f6d99a';for(const shot of model.shots)p.fillRect(shot.x-2,shot.y-8,4,16);
  p.fillStyle='#ec9279';for(const bolt of model.bolts){p.beginPath();p.ellipse(bolt.x,bolt.y,4,7,0,0,Math.PI*2);p.fill();}
  for(const s of model.sparks){p.globalAlpha=s.life/balance.sparkSeconds;p.fillStyle='#fff4dc';p.fillRect(s.x-2,s.y-2,4,4);}p.globalAlpha=1;
  const {x,y}=model.player;
  p.save();p.translate(x,y);if(model.invulnerable && Math.floor(model.time*10)%2)p.globalAlpha=.45;
  p.fillStyle='#53cbd1';p.beginPath();p.moveTo(0,-23);p.lineTo(20,15);p.lineTo(0,8);p.lineTo(-20,15);p.closePath();p.fill();
  p.fillStyle='#fff4dc';p.fillRect(-4,-7,8,20);p.fillStyle='#ec9279';p.fillRect(-3,15,6,8);p.restore();
}

export function startAliens(ctx) {return runCanvasGame(ctx,createAlienModel,drawAliens);}
