// Whole matches with the tour test's bot (same inputs as a player: move, aim, buttons). node winrate.mjs [off]
import {baseConfig} from './sim.mjs';
import {createTennis} from '../../minigames/tennis.mjs';
const off=process.argv[2]==='off',config=off?{...baseConfig,v9:{...baseConfig.v9,meter:{...baseConfig.v9.meter,enabled:false}}}:baseConfig;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),SEEDS=[17,42,129,627,981,4107,5,6,7,8,9,10];
function play(stage,difficulty,rank,delay,seed){
 const game=createTennis({config,stage,seed,difficulty,ranks:{speed:rank,hit:rank,serve:rank}});let lastSwing=-1,incomingAt=null,serial=-1,since=null;
 for(let i=0;i<144000&&!game.result;i++){
  const s=game.getState(),p=s.players[0],incoming=s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1;
  if(incoming&&serial!==s.rallyHits){serial=s.rallyHits;incomingAt=s.elapsed;}if(!incoming){incomingAt=null;serial=-1;}
  let x=0,z=5.8;if(incoming&&s.elapsed-incomingAt>=.12){x=s.contact.x;z=s.contact.z;}
  if(incoming){x+=Math.sin(s.elapsed*1.7+seed)*.25;z+=Math.cos(s.elapsed*1.3+seed)*.25;}
  const move=clamp(((x-p.x)*4-(p.vx||0)*.55)/s.attributes.speed,-1,1),moveZ=clamp(((z-p.z)*4-(p.vz||0)*.55)/s.attributes.speed,-1,1);
  if(incoming&&s.contactWindow?.eligible){if(since===null)since=s.elapsed;}else since=null;
  const swing=incoming&&Boolean(s.contactWindow?.eligible)&&s.elapsed-lastSwing>.29&&s.elapsed-since>=delay;if(swing)lastSwing=s.elapsed;
  const ai=s.players[1],lob=ai.z>-5&&s.ball.z<6.5,drop=!lob&&ai.z<-6.3&&s.rallyHits%3!==0&&s.ball.z<7.2;
  const aim={manual:true,x:ai.x>=0?-1:1,z:-.2},serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.49&&s.serveMeter<=.515);
  game.update(1/60,{serve,swing,lob,drop,aim,move,moveZ});}
 return game.result;}
for(const [stage,diff] of [[1,'easy'],[10,'normal'],[20,'normal'],[30,'easy'],[30,'hard']])for(const [rank,delay] of [[3,.04],[5,.04]]){
 const rs=SEEDS.map(sd=>play(stage,diff,rank,delay,sd));console.log(`stage ${String(stage).padStart(2)} ${diff.padEnd(6)} rank ${rank} delay ${delay}: wins ${rs.filter(r=>r.won).length}/12, games ${(rs.reduce((a,r)=>a+r.gamesFor,0)/12).toFixed(1)}-${(rs.reduce((a,r)=>a+r.gamesAgainst,0)/12).toFixed(1)}`);}
