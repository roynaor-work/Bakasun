// Shot quality as a function of how long the button was held (0.1 .. 2.5 s). Direct: the ball is placed at the racket and the model is
// swung with that charge, so the child's press timing is not part of the measurement. node hold2.mjs [N] [off]
import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const N=+process.argv[2]||600,off=process.argv[3]==='off';
const config=off?{...baseConfig,v9:{...baseConfig.v9,hold:{...baseConfig.v9.hold,enabled:false}}}:baseConfig;
const secs=off?config.player.chargeSeconds:config.v9.hold.seconds;
function shot(diff,hold,seed,aimZ,timing=0){
 const m=createTennis({config,stage:10,seed:(Math.imul(seed,2654435761)>>>0),difficulty:diff,ranks:{speed:3,hit:3,serve:3}}),s=m.getState();
 s.phase='rally';s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=6;Object.assign(s.ball,{x:0,z:6,y:config.ball.hitHeight,lastHitter:1,bounces:1});s.contact={side:0,at:s.elapsed-timing,eta:0,x:0,z:6};
 s.charge=Math.min(1,hold/secs);const aim={manual:true,x:((seed*17)%11-5)/8,z:aimZ};
 m.update(0,{prepare:true,aim});s.charge=Math.min(1,hold/secs);m.update(config.simulation.step*1.01,{prepare:true,aim});shot.zone=s.hitMeter?.active?s.hitMeter.zone:null;s.charge=Math.min(1,hold/secs);m.update(0,{prepare:true,aim,swing:true});m.update(0,{swing:false,aim});
 return s.shot?.side===0?s.shot:null;
}
shot.zone=null;const out={};
for(const diff of ['easy','normal','hard']){console.log('--',diff);
 for(const hold of [0.1,0.2,0.3,0.5,0.8,1.0,1.2,1.5,1.8,2.0,2.2,2.5]){
  const t={n:0,ok:0,short:0,long:0,err:0,tap:0,green:0,yellow:0,red:0,near:0,tap:0};
  for(let i=1;i<=N;i++){const sh=shot(diff,hold,i,0,((i%7)-3)*.01);if(!sh?.v9)continue;const v=sh.v9;t.n++;t[shot.zone??'tap']++;if(!v.error&&Math.abs(v.landing-v.depth)<=.6)t.near++;
   if(v.error==='net'||v.error==='out'){t.err++;continue;}
   if(Math.abs(v.landing)>9.06){t.long++;continue;}
   if(v.landing<v.depth-1.2){t.short++;continue;}
   if(v.landing>v.depth+1.2){t.long++;continue;}
   t.ok++;}
  console.log(`hold ${hold.toFixed(1)}s n=${t.n}: on target ${(100*t.ok/t.n).toFixed(0)}% | short ${(100*t.short/t.n).toFixed(0)}% | long/out ${(100*t.long/t.n).toFixed(0)}% | net/out error ${(100*t.err/t.n).toFixed(0)}% | bar: green ${(100*t.green/t.n).toFixed(0)}% yellow ${(100*t.yellow/t.n).toFixed(0)}% red ${(100*t.red/t.n).toFixed(0)}% | no bar (tap) ${(100*(t.tap||0)/t.n).toFixed(0)}%`);
 }}
