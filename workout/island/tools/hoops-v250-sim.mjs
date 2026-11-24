// Headless "scripted child" games for Island Pro Basketball v25.0: team 0 is steered through the same input the phone sends
// (stick, shoot hold and release with a child's timing error, pass, tap on a team-mate, steal, block, rebound jump), team 1 is
// the game's bot. The same seeds run with the v25.0 engine layer off and on, so the table shows what the layer changes and
// whether the bot is still a match. No browser, no rendering.
// Usage: node workout/island/tools/hoops-v250-sim.mjs [games=40] [profile=quick] [out.json] [timingSd=0.07]   (positional)
import {readFileSync,writeFileSync} from 'node:fs';
import {createHoopsEngine,NO_INPUT} from '../minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../minigames/hoops-franchise.mjs';
import {compileHoopsTactics} from '../minigames/hoops-tactics.mjs';
import {engineV250,hoopsV250Flags} from '../minigames/hoops-v250.mjs';
const cfg=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const tacticsData=compileHoopsTactics(JSON.parse(readFileSync(new URL('../design/tactics/basketball.json',import.meta.url),'utf8')));
const r2=(n,d=2)=>+n.toFixed(d),pct=(a,b)=>b?r2(100*a/b,1):0,hyp=Math.hypot;
const rng=seed=>{let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};};

/** The child: decisions from the snapshot only (what is on the screen), with a reaction delay and a timing error. */
function child(seed,{v250,timingSd}){
 const rand=rng(seed),gauss=()=>{let u=0;for(let i=0;i<6;i++)u+=rand();return (u-3)/Math.sqrt(0.5);};
 let hold=null,jumpAt=-1,lastPass=-999,looseSince=-1;
 return function(s,config,RIMX){
  const inp={...NO_INPUT,move:{x:0,z:0}};
  const me=s.players.find(p=>p.id===s.controlled);if(!me||s.phase!=='live')return inp;
  const dir=s.dir[0],rimX=dir*RIMX,rim={x:rimX,z:0};
  const mates=s.players.filter(p=>p.team===0&&p.id!==me.id),opp=s.players.filter(p=>p.team===1);
  const dRim=hyp(rim.x-me.x,rim.z-me.z),near=p=>Math.min(...opp.map(o=>hyp(o.x-p.x,o.z-p.z)));
  const steer=(x,z,speed=1)=>{const d=hyp(x-me.x,z-me.z);if(d>0.15){inp.move={x:(x-me.x)/d*speed,z:(z-me.z)/d*speed};}};
  if(me.hasBall){
   if(me.act==='shoot'){
    if(hold&&me.shotHeld&&me.actT>=hold.at){inp.shootUp=true;hold=null;}
    return inp;
   }
   hold=null;
   const open=near(me),clockLow=s.shotClock<7;
   if(dRim<6.6&&(open>1.5||clockLow)||dRim<2.6){
    inp.shootDown=true;const type=dRim<3?'layup':'jumpshot',rel=config.anim[type]?.release||0.8;hold={at:Math.max(config.shot.minHold??0.12,rel+gauss()*timingSd)};return inp;
   }
   // a better-placed, open team-mate: pass (tap on him with v25.0, the pass button with the stick towards him without)
   if(s.tick-lastPass>50&&rand()<0.04){
    let best=null,bs=0;for(const q of mates){const dq=hyp(rim.x-q.x,rim.z-q.z),sc=near(q)-open+(dRim-dq)*0.25;if(sc>bs&&near(q)>1.6){bs=sc;best=q;}}
    if(best&&bs>0.5){lastPass=s.tick;if(v250)inp.passTo=best.id;else{inp.passPress=true;inp.passDir={x:best.x-me.x,z:best.z-me.z};}return inp;}
   }
   steer(rim.x-dir*1.2,rim.z+(me.z>0?0.8:-0.8));inp.sprint=dRim>9;
   return inp;
  }
  const b=s.ball;
  if(b.state==='shot'||b.state==='loose'){
   const spot=s.rebound||{x:b.state==='shot'?(b.x>0?1:-1)*(Math.abs(rimX)-0.9):b.x,z:b.state==='shot'?0:b.z};
   steer(spot.x,spot.z);inp.sprint=true;
   if(b.state==='loose'){if(looseSince<0)looseSince=s.tick;}else looseSince=-1;
   // with the cue the child jumps when the ring turns green; without it, a reaction time after the miss is seen
   const go=v250?!!s.rebound?.go:looseSince>=0&&s.tick-looseSince>=14;
   if(go&&s.tick-jumpAt>40&&hyp(spot.x-me.x,spot.z-me.z)<2.2){inp.shootDown=true;jumpAt=s.tick;}
   return inp;
  }
  looseSince=-1;
  if(s.possession===0){
   // off the ball: drift to an open spot on his side, now and then ask for the ball
   steer(rim.x-dir*5.5,me.z>0?4:-4,0.7);if(rand()<0.004)inp.passPress=true;return inp;
  }
  // defence: the child runs at the ball when he guards it, otherwise at the nearest opponent; reaches and jumps
  const h=s.players.find(p=>p.hasBall),man=h&&hyp(h.x-me.x,h.z-me.z)<4.5?h:opp.reduce((a,o)=>!a||hyp(o.x-me.x,o.z-me.z)<hyp(a.x-me.x,a.z-me.z)?o:a,null);
  if(man){steer(man.x,man.z);if(h&&man.id===h.id){const d=hyp(h.x-me.x,h.z-me.z);if(h.act==='shoot'&&d<1.6&&s.tick-jumpAt>50){inp.shootDown=true;jumpAt=s.tick;}else if(d<1.25&&rand()<0.03)inp.passPress=true;}}
  return inp;
 };
}

export function simulate({games=40,profile='quick',v250=true,timingSd=0.07,seedBase=25000}={}){
 const flags=hoopsV250Flags(new URLSearchParams(v250?'':'hoopsV250=0'));
 const m={games,wins:0,ties:0,pts:[0,0],fga:0,fgm:0,tpa:0,tpm:0,reb:[0,0],userReb:0,userRebJumps:0,stl:[0,0],blk:[0,0],tov:[0,0],passes:0,tapPasses:0,tapSwitch:0,zones:{green:0,yellow:0,red:0},
  guardTicks:0,guardDist:0,guardBetween:0,specialReady:0,specialUsed:0,fireMade:0,rebGrades:{perfect:0,good:0,early:0,late:0},rebGradeWon:0,margins:[]};
 const t0=Date.now();let steps=0;
 for(let g=0;g<games;g++){
  const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
  const e=createHoopsEngine({config,seed:seedBase+g*37,teams:clubs.teams,userTeam:0,profile,difficulty:clubs.difficulty,assist:clubs.assist,autopilot:false,aiVersion:'v2',v250:engineV250(flags)});
  e.setTacticsData(tacticsData);
  const S=e.debug.state,kid=child(seedBase*7+g,{v250:flags.tapPass,timingSd}),teamOf=id=>{for(const t of S.teams)for(const p of t.roster)if(p.id===id)return p.team;return null;};
  const fire=new Set();
  for(let i=0;i<60*60*14&&S.phase!=='final';i++){
   const s=e.snapshot();e.step(kid(s,config,e.court.rimX));steps++;
   // defence quality: how far the child's player is from the guarding spot of the ball handler he is chasing
   if(S.phase==='live'&&S.possession===1&&S.ball.state==='held'){
    const me=s.players.find(p=>p.id===s.controlled),h=s.players.find(p=>p.hasBall);
    if(me&&h&&hyp(h.x-me.x,h.z-me.z)<4.5){const rx=s.dir[1]*e.court.rimX,dr=hyp(rx-h.x,h.z)||1,k=Math.min(1/Math.max(0.6,dr),0.85),gx=h.x+(rx-h.x)*k,gz=h.z+(0-h.z)*k;
     m.guardTicks++;m.guardDist+=hyp(gx-me.x,gz-me.z);const t=((me.x-h.x)*(rx-h.x)+(me.z-h.z)*(0-h.z))/(dr*dr),off=hyp(h.x+(rx-h.x)*t-me.x,h.z+(0-h.z)*t-me.z);if(t>0.02&&t<0.6&&off<0.9)m.guardBetween++;}
   }
   for(const ev of e.drainEvents()){
    switch(ev.type){
     case 'release':if(teamOf(ev.playerId)===0&&ev.shotType!=='ft'){m.fga++;if(ev.points===3)m.tpa++;if(ev.special)fire.add(ev.shotId);}break;
     case 'score':if(ev.team===0&&ev.shotType!=='ft'&&ev.playerId!=null){m.fgm++;if(ev.points===3)m.tpm++;if(fire.has(ev.shotId))m.fireMade++;}break;
     case 'rebound':{const t=teamOf(ev.playerId);m.reb[t]++;if(ev.playerId===S.controlled&&t===0)m.userReb++;break;}
     case 'jump':if(ev.kind==='rebound'&&teamOf(ev.playerId)===0)m.userRebJumps++;break;
     case 'steal':case 'interception':m.stl[teamOf(ev.playerId)]++;break;
     case 'block':m.blk[teamOf(ev.playerId)]++;break;
     case 'pass':if(ev.human)m.passes++;break;
     case 'tapPass':m.tapPasses++;break;
     case 'tapSwitch':m.tapSwitch++;break;
     case 'timing':m.zones[ev.zone]++;break;
     case 'specialReady':m.specialReady++;break;
     case 'specialUsed':m.specialUsed++;break;
     case 'reboundTiming':m.rebGrades[ev.grade]++;if(ev.won)m.rebGradeWon++;break;
    }
   }
  }
  const sc=e.snapshot().score;m.pts[0]+=sc[0];m.pts[1]+=sc[1];if(sc[0]>sc[1])m.wins++;else if(sc[0]===sc[1])m.ties++;m.margins.push(sc[0]-sc[1]);
  e.dispose();
 }
 const timed=m.zones.green+m.zones.yellow+m.zones.red,grades=Object.values(m.rebGrades).reduce((a,b)=>a+b,0);
 return {v250,games,profile,timingSd,childWinPct:pct(m.wins,games),avgScore:[r2(m.pts[0]/games,1),r2(m.pts[1]/games,1)],avgMargin:r2(m.margins.reduce((a,b)=>a+b,0)/games,1),
  fgPct:pct(m.fgm,m.fga),threePct:pct(m.tpm,m.tpa),greenPct:pct(m.zones.green,timed),yellowPct:pct(m.zones.yellow,timed),redPct:pct(m.zones.red,timed),
  reboundsPerGame:[r2(m.reb[0]/games,1),r2(m.reb[1]/games,1)],childTeamReboundPct:pct(m.reb[0],m.reb[0]+m.reb[1]),childOwnReboundsPerGame:r2(m.userReb/games,2),reboundJumpsPerGame:r2(m.userRebJumps/games,1),
  reboundGrades:m.rebGrades,gradedJumpWonPct:pct(m.rebGradeWon,grades),
  stealsPerGame:[r2(m.stl[0]/games,2),r2(m.stl[1]/games,2)],blocksPerGame:[r2(m.blk[0]/games,2),r2(m.blk[1]/games,2)],
  passesPerGame:r2(m.passes/games,1),tapPassesPerGame:r2(m.tapPasses/games,1),
  guardSpotDistance:r2(m.guardDist/Math.max(1,m.guardTicks)),betweenManAndRimPct:pct(m.guardBetween,m.guardTicks),
  specialReadyPerGame:r2(m.specialReady/games,2),specialUsedPerGame:r2(m.specialUsed/games,2),fireShotMakePct:pct(m.fireMade,m.specialUsed),
  simSeconds:r2((Date.now()-t0)/1000,1),steps};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const games=Number(process.argv[2]||40),profile=process.argv[3]||'quick',out=process.argv[4],timingSd=Number(process.argv[5]||0.07);
 const report={before:simulate({games,profile,v250:false,timingSd}),after:simulate({games,profile,v250:true,timingSd})};
 if(out&&out!=='-')writeFileSync(out,JSON.stringify(report,null,1));
 const keys=Object.keys(report.after).filter(k=>!['v250','games','profile','timingSd','steps'].includes(k));
 console.log(`games=${games} profile=${profile} timingSd=${timingSd}`);
 for(const k of keys)console.log(k.padEnd(28),JSON.stringify(report.before[k]).padEnd(46),JSON.stringify(report.after[k]));
}
