import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSoccer} from '../minigames/soccer.mjs';
import {fieldTarget,keeperTarget} from '../minigames/soccer-tactics.mjs';
import {compileSoccerTactics} from '../minigames/soccer-design-tactics.mjs';
import {SOCCER_TACTICS_DATA} from '../minigames/soccer-tactics-data.mjs';
import {expandSoccerConfig} from '../minigames/soccer-squad.mjs';

/** Headless team-shape metrics over whole league matches: a scripted child
 * plays, the AI sides move. Pure measurement; it never changes the model. */
export function createShapeBot(seed){
  let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  let hold=0,passHold=0,sinceDecision=0;
  return (s,dt,c)=>{
    const p=s.players[s.controlled],b=s.ball,hx=c.pitch.length/2,goalX=s.attackDir*hx,input={moveX:0,moveZ:0,kickHeld:false,passHeld:false,sprintHeld:false,switchPlayer:false};
    sinceDecision+=dt;let dx,dz;
    if(b.owner===p.id){dx=goalX-p.x;dz=-p.z*.35;const toGoal=Math.abs(goalX-p.x);if(hold<=0&&passHold<=0&&sinceDecision>1.1){sinceDecision=0;if(toGoal<13&&random()<.5)hold=.3+random()*.3;else if(random()<.3)passHold=.08+random()*.25;}}
    else{dx=b.x-p.x;dz=b.z-p.z;input.sprintHeld=Math.hypot(dx,dz)>6;}
    const l=Math.hypot(dx,dz)||1;input.moveX=dx/l;input.moveZ=dz/l;
    if(hold>0){hold-=dt;input.kickHeld=hold>0;}if(passHold>0){passHold-=dt;input.passHeld=passHold>0;}
    return input;
  };
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function measureShape(config,{seeds=[1,2,3],stage=1,difficulty='normal',seconds=null}={}){
  const totals={samples:0,crowd:0,nearestMate:0,carrierClearance:0,carrierSamples:0,forwardOptions:0,boxRunners:0,attackSamples:0,coverLine:0,defenseSamples:0,maxSpeed:0,passes:0,completions:0,goalsFor:0,goalsAgainst:0,shots:0,markers:0,width:0};
  const step=config.match.fixedStep;
  for(const seed of seeds){
    const game=createSoccer({config,seed,stage,difficulty,role:'field',league:true}),bot=createShapeBot(seed^0x9e3779b9);
    let elapsed=0,lastPass=null;
    while(!game.result&&(seconds===null||elapsed<seconds)){
      const s=game.getState();game.update(step,bot(s,step,config));elapsed+=step;
      for(const e of game.drainEvents()){if(e.type==='pass'||e.type==='loft'){totals.passes++;lastPass=e;}if(e.type==='possession'&&lastPass&&e.team===lastPass.team&&e.player!==lastPass.player){totals.completions++;lastPass=null;}if(e.type==='shot')totals.shots++;if(e.type==='possession'&&lastPass&&e.team!==lastPass.team)lastPass=null;}
      if(s.phase!=='playing'||Math.round(elapsed/step)%6)continue;
      totals.samples++;
      const hx=config.pitch.length/2;
      for(const team of [0,1]){
        const mates=s.players.filter(p=>p.team===team&&p.role!=='keeper');
        let crowd=0,nearest=0,minZ=Infinity,maxZ=-Infinity;
        for(const p of mates){let best=Infinity;for(const q of mates)if(q!==p)best=Math.min(best,distance(p,q));nearest+=best;if(best<2.2)crowd++;minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);totals.maxSpeed=Math.max(totals.maxSpeed,Math.hypot(p.vx,p.vz));}
        totals.nearestMate+=nearest/mates.length;totals.crowd+=crowd;totals.width+=maxZ-minZ;
        const owner=s.ball.owner==null?null:s.players[s.ball.owner];
        if(owner&&owner.team===team&&owner.role!=='keeper'){
          const d=s.attackDir*(team===0?1:-1);totals.carrierSamples++;
          let clearance=Infinity,forward=0,box=0;
          for(const p of mates){if(p===owner)continue;clearance=Math.min(clearance,distance(p,owner));if((p.x-owner.x)*d>2&&distance(p,owner)>4&&distance(p,owner)<18)forward++;if(p.x*d>hx-config.pitch.penaltyDepth&&Math.abs(p.z)<config.pitch.penaltyWidth/2)box++;}
          totals.carrierClearance+=clearance;totals.forwardOptions+=forward;
          if(hx-owner.x*d<16){totals.attackSamples++;totals.boxRunners+=box;}
        }else if(owner&&owner.team!==team){
          const d=s.attackDir*(team===0?1:-1);totals.defenseSamples++;
          // How many defenders are goal-side of the ball (between the ball and our goal).
          let goalSide=0,marking=0;const rivals=s.players.filter(p=>p.team!==team&&p.role!=='keeper'&&p!==owner);
          for(const p of mates){if(p.x*d<s.ball.x*d-.5)goalSide++;if(rivals.some(r=>distance(r,p)<3.2))marking++;}
          totals.coverLine+=goalSide;totals.markers+=marking;
        }
      }
    }
    const r=game.getState().score;totals.goalsFor+=r[0];totals.goalsAgainst+=r[1];
  }
  const n=totals.samples*2;
  return {matches:seeds.length,nearestMateM:+(totals.nearestMate/n).toFixed(2),crowdedPlayersPerSample:+(totals.crowd/n).toFixed(2),teamWidthM:+(totals.width/n).toFixed(2),carrierClearanceM:+(totals.carrierClearance/totals.carrierSamples).toFixed(2),forwardOptions:+(totals.forwardOptions/totals.carrierSamples).toFixed(2),boxRunnersInFinalThird:+(totals.boxRunners/Math.max(1,totals.attackSamples)).toFixed(2),goalSideDefenders:+(totals.coverLine/Math.max(1,totals.defenseSamples)).toFixed(2),markingDefenders:+(totals.markers/Math.max(1,totals.defenseSamples)).toFixed(2),passes:totals.passes,completionRate:+(totals.completions/Math.max(1,totals.passes)).toFixed(2),shots:totals.shots,score:[totals.goalsFor,totals.goalsAgainst],maxSpeed:+totals.maxSpeed.toFixed(2)};
}
/** Deterministic target geometry over a grid of ball positions and carriers:
 * what the tactics controller asks of each team-mate, before any lag. */
export function shapeScenarios(config){
  const game=createSoccer({config,seed:1,stage:1,difficulty:'normal',role:'field',league:true}),s=game.getState(),hx=config.pitch.length/2,hz=config.pitch.width/2;
  const expanded=expandSoccerConfig(config),tactical={...expanded,tactics:{...expanded.tactics,designController:compileSoccerTactics(SOCCER_TACTICS_DATA,expanded)}},target=p=>p.role==='keeper'?keeperTarget(p,s,tactical):fieldTarget(p,s,tactical);
  const home=s.players.filter(p=>p.team===0&&p.role!=='keeper'),away=s.players.filter(p=>p.team===1);
  const out={scenarios:0,optionsAhead:0,optionsNear:0,boxWhenFinalThird:0,finalThird:0,carrierTooClose:0,minMateGap:Infinity,rivalMarked:0,rivalSamples:0,goalSide:0};
  let tick=0;
  for(const carrier of home)for(const bx of [-14,-6,2,8,13,18,21])for(const bz of [-11,-5,0,6,12]){
    // Rivals sit in a plausible defensive block around the ball; team-mates start at kickoff spots.
    for(const p of s.players){p.vx=p.vz=0;p.recover=p.slideTime=0;p.hold=1;}
    away.forEach((p,i)=>{p.x=p.role==='keeper'?hx-1.2:Math.min(hx-2,bx+3+(i%3)*3.5);p.z=p.role==='keeper'?0:bz*.5+(i-2.5)*4;});
    home.forEach((p,i)=>{if(p===carrier){p.x=bx;p.z=bz;}else{p.x=bx-8+(i%2)*4;p.z=(i-2)*5;}});
    Object.assign(s.ball,{owner:carrier.id,x:bx,z:bz,vx:0,vz:0,lastTeam:0,lastPlayer:carrier.id});s.controlled=carrier.id;s.elapsed+=1;s.phase='playing';s.restart=null;s.passTarget=null;
    out.scenarios++;let ahead=0,near=0,box=0;const targets=[];
    for(const p of home){if(p===carrier)continue;const t=target(p);targets.push(t);const gap=Math.hypot(t.x-bx,t.z-bz);if(t.x>bx+1.5&&gap<16)ahead++;if(gap<9&&t.x>bx-2.5)near++;if(t.x>hx-config.pitch.penaltyDepth&&Math.abs(t.z)<config.pitch.penaltyWidth/2)box++;if(gap<2.5)out.carrierTooClose++;}
    for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++)out.minMateGap=Math.min(out.minMateGap,Math.hypot(targets[i].x-targets[j].x,targets[i].z-targets[j].z));
    out.optionsAhead+=ahead;out.optionsNear+=Math.min(2,near);if(bx>=hx-14.4){out.finalThird++;if(box)out.boxWhenFinalThird++;}
    // Mirror: the rival defends the same ball with the home carrier.
    out.rivalSamples++;let marked=0,goalSide=0;const rivalField=away.filter(p=>p.role!=='keeper');
    for(const p of rivalField){const t=target(p);if(t.duty==='mark')marked++;if(t.x>bx-.5)goalSide++;}
    out.rivalMarked+=marked;out.goalSide+=goalSide;
  }
  return {scenarios:out.scenarios,optionsAheadPerScenario:+(out.optionsAhead/out.scenarios).toFixed(2),nearOptionsPerScenario:+(out.optionsNear/out.scenarios).toFixed(2),boxShareInFinalThird:+(out.boxWhenFinalThird/Math.max(1,out.finalThird)).toFixed(2),carrierTooCloseTargets:out.carrierTooClose,minTeammateTargetGapM:+out.minMateGap.toFixed(2),rivalMarkersPerScenario:+(out.rivalMarked/out.rivalSamples).toFixed(2),rivalGoalSidePerScenario:+(out.goalSide/out.rivalSamples).toFixed(2)};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if(process.argv[2]==='scenarios'){const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;console.log(JSON.stringify(shapeScenarios(config),null,1));process.exit(0);}
  const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
  const stage=Number(process.argv[2])||1;
  console.log(JSON.stringify(measureShape(config,{seeds:[1,2,3,4],stage}),null,1));
}
