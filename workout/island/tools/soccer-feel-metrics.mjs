/** Soccer feel v2 harness (evidence only, no browser): reaction times in the headless match, before/after.
 * Per pass release (ground passes of both teams): seconds until the intended receiver first moves (his velocity changes by 0.5 m/s, or his
 * distance to the pass point shrinks by 0.1 m; a receiver already running at 1 m/s or more counts as moving at once), until the nearest
 * opposing field player first reacts (same velocity change, his closing speed on the ball rises by 0.5 m/s, or his distance to the pass
 * point shrinks by 0.1 m; already closing at 1 m/s = at once), and until the ball is received. Per turnover to the rival: seconds until the child's
 * selection is the team-0 field player nearest the ball (or within 1 m of him). Plus goals, possession, pass completion and the child's
 * win rate (typical bot) per stage.
 * A receiver already standing at the pass point (within 0.5 m) and a defender already closing at 1 m/s or more count as reacting at once.
 * Passes to a keeper are left out of the receiver numbers (he keeps goal instead of running onto a back pass), and a receiver the child's
 * selection switches onto is reported apart (`receiverCtrl`): from then on the bot, not the AI, steers him.
 * Usage: node tools/soccer-feel-metrics.mjs [--n 30] [--stages 2,5,8] [--feel v2|0] [--difficulty normal] [--seed0 1000] [--out file.json]
 *        [--set 'feel.rivalRunSpace=2.5;feel.rivalRunsFromStage=2']   (dotted-path JSON overrides of minigames.soccer, for A/B runs) */
import {readFile,writeFile} from 'node:fs/promises';
import {createSoccer} from '../minigames/soccer.mjs';
import {createHumanBot} from './soccer-gameplay-metrics.mjs';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]]:a,[]));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pct=(arr,f)=>{const v=arr.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.min(v.length-1,Math.floor(v.length*f))]:null;};
const mean=arr=>{const v=arr.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
const r=(v,n=3)=>v===null||v===undefined?null:+Number(v).toFixed(n);

export function playFeelMatch({config,seed,stage,difficulty='normal',feel,maxSeconds=400,profile='typical'}){
  const game=createSoccer({config,seed,stage,difficulty,role:'field',...(feel?{feelVersion:feel}:{})}),bot=createHumanBot(seed,{profile});
  const step=config.match.fixedStep;
  const passes=[],switches=[];let open=[],turnover=null,elapsed=0,possessionTicks=[0,0],playing=0,passCount=[0,0],passDone=[0,0];
  while(!game.result&&elapsed<maxSeconds){
    game.update(step,bot(game,step,config));elapsed+=step;
    const s=game.getState(),b=s.ball;
    for(const e of game.drainEvents()){
      if(e.type==='pass'&&e.target!=null){
        const receiver=s.players[e.target],point={x:e.x,z:e.z},passer=s.players[e.player];
        let defender=null,best=Infinity;for(const q of s.players)if(q.team!==e.team&&q.role!=='keeper'&&!(q.recover>0)){const at=dist(q,point);if(at<best){best=at;defender=q;}}
        const closing=q=>{const dx=b.x-q.x,dz=b.z-q.z,l=Math.hypot(dx,dz)||1;return ((q.vx||0)*dx+(q.vz||0)*dz)/l;};
        const d0=dist(receiver,point),close0=defender?closing(defender):null,rv0={x:receiver.vx||0,z:receiver.vz||0},dv0=defender?{x:defender.vx||0,z:defender.vz||0}:null;
        open.push({team:e.team,t0:elapsed,target:e.target,keeper:receiver.role==='keeper',controlled:s.controlled===e.target,point,d0,rv0,dv0,defender:defender?.id??null,dd0:defender?dist(defender,point):null,close0,receiverMove:d0<.5||Math.hypot(rv0.x,rv0.z)>=1?0:null,defenderMove:close0!==null&&close0>=1?0:null,received:null,outcome:null,passer:passer.id,through:e.kind==='through'});
        passCount[e.team]++;
      }
      else if(e.type==='possession'){
        for(const o of open){if(o.outcome===null){o.outcome=e.team===o.team?(e.player===o.target?'done':'other'):'lost';o.received=elapsed-o.t0;if(o.outcome==='done')passDone[o.team]++;}}
        passes.push(...open);open=[];
        if(e.team===1&&turnover===null)turnover={t0:elapsed,lag:null};
        else if(e.team===0)turnover=null;
      }
      else if(e.type==='restart'){for(const o of open){o.outcome='out';o.received=elapsed-o.t0;}passes.push(...open);open=[];turnover=null;}
    }
    if(s.phase!=='playing')continue;
    playing++;const owner=b.owner===null?null:s.players[b.owner];possessionTicks[owner?owner.team:b.lastTeam]++;
    for(const o of open){
      const receiver=s.players[o.target];if(o.receiverMove===null&&s.controlled===o.target)o.controlled=true;
      if(o.receiverMove===null&&(dist(receiver,o.point)<=o.d0-.1||Math.hypot((receiver.vx||0)-o.rv0.x,(receiver.vz||0)-o.rv0.z)>=.5))o.receiverMove=elapsed-o.t0;
      if(o.defender!=null&&o.defenderMove===null){const q=s.players[o.defender],dx=b.x-q.x,dz=b.z-q.z,l=Math.hypot(dx,dz)||1,closing=((q.vx||0)*dx+(q.vz||0)*dz)/l;if(closing-o.close0>=.5||dist(q,o.point)<=o.dd0-.1||Math.hypot((q.vx||0)-o.dv0.x,(q.vz||0)-o.dv0.z)>=.5)o.defenderMove=elapsed-o.t0;}
    }
    if(turnover&&turnover.lag===null&&s.mode==='defense'){
      let nearest=null,best=Infinity;for(const q of s.players)if(q.team===0&&q.role!=='keeper'&&!(q.recover>0)){const at=dist(q,b);if(at<best){best=at;nearest=q;}}
      const me=s.players[s.controlled];
      if(nearest&&(me.id===nearest.id||dist(me,b)<=best+1)){turnover.lag=elapsed-turnover.t0;switches.push(turnover.lag);}
      else if(elapsed-turnover.t0>3){turnover.lag=3;switches.push(3);}
    }
  }
  passes.push(...open);
  const res=game.result,score=game.getState().score;
  return {seed,stage,passes,switches,won:res?res.won:score[0]>score[1],goals:[score[0],score[1]],possession:playing?possessionTicks[0]/playing:null,passCount,passDone};
}
export function summarizeFeel(results){
  const out={matches:results.length,team:[{},{}],switch:{},game:{}};
  for(const team of [0,1]){
    // Receiver numbers: passes that reached him or lived at least 0.3 s (a ball cut out at once leaves no time to move toward it).
    const passes=results.flatMap(m=>m.passes.filter(p=>p.team===team)),long=passes.filter(p=>p.outcome==='done'||(p.received??1)>=.3),ai=long.filter(p=>!p.keeper&&!p.controlled),ctrl=long.filter(p=>!p.keeper&&p.controlled);
    const moveOf=list=>list.map(p=>p.receiverMove??(p.received??null)),moves=moveOf(ai),defs=passes.map(p=>p.defenderMove??(p.received??null)),rec=passes.map(p=>p.received);
    out.team[team]={passes:passes.length/results.length,receiverMoveMedian:r(pct(moves,.5)),receiverMoveP90:r(pct(moves,.9)),receiverMoved:r(ai.filter(p=>p.receiverMove!==null).length/Math.max(1,ai.length)),receiverAi:ai.length,receiverCtrl:ctrl.length,receiverCtrlMedian:r(pct(moveOf(ctrl),.5)),receiverCtrlP90:r(pct(moveOf(ctrl),.9)),
      defenderMoveMedian:r(pct(defs,.5)),defenderMoveP90:r(pct(defs,.9)),defenderMoved:r(passes.filter(p=>p.defenderMove!==null).length/Math.max(1,passes.length)),receivedMedian:r(pct(rec,.5)),receivedP90:r(pct(rec,.9)),
      completion:r(passes.filter(p=>p.outcome==='done').length/Math.max(1,passes.length)),lost:r(passes.filter(p=>p.outcome==='lost').length/Math.max(1,passes.length)),
      goals:r(mean(results.map(m=>m.goals[team])),2)};
  }
  const sw=results.flatMap(m=>m.switches);
  out.switch={turnovers:r(sw.length/results.length,1),lagMedian:r(pct(sw,.5)),lagP90:r(pct(sw,.9)),within0_3:r(sw.filter(x=>x<=.3).length/Math.max(1,sw.length))};
  out.game={childWinRate:r(results.filter(m=>m.won).length/results.length),possessionHome:r(mean(results.map(m=>m.possession))),goals:r(mean(results.map(m=>m.goals[0]+m.goals[1])),2)};
  return out;
}
if(process.argv[1]&&/soccer-feel-metrics\.mjs$/.test(process.argv[1])){
  const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
  for(const pair of String(args.set||'').split(';').filter(Boolean)){const [path,raw]=pair.split('=');const keys=path.split('.');let o=config;for(const k of keys.slice(0,-1))o=o[k]=o[k]||{};o[keys.at(-1)]=JSON.parse(raw);}
  const n=Number(args.n||30),stages=String(args.stages||'2,5,8').split(',').map(Number),feel=args.feel||undefined,difficulty=args.difficulty||'normal',seed0=Number(args.seed0||1000);
  const report={feel:feel||'default',difficulty,n,set:args.set||'',byStage:{}};
  for(const stage of stages){
    const results=[];for(let i=0;i<n;i++)results.push(playFeelMatch({config,seed:seed0+i,stage,difficulty,feel}));
    const s=report.byStage[stage]=summarizeFeel(results);
    const T=s.team;
    console.log(`== feel=${report.feel} stage ${stage} (${n} matches) ==`);
    console.log(`receiver first move (median/p90) child AI ${T[0].receiverMoveMedian}/${T[0].receiverMoveP90}s (n ${T[0].receiverAi}; switched-onto ${T[0].receiverCtrlMedian}/${T[0].receiverCtrlP90}s n ${T[0].receiverCtrl}) rival ${T[1].receiverMoveMedian}/${T[1].receiverMoveP90}s  defender first reaction child-pass ${T[0].defenderMoveMedian}/${T[0].defenderMoveP90}s rival-pass ${T[1].defenderMoveMedian}/${T[1].defenderMoveP90}s`);
    console.log(`received (median/p90) ${T[0].receivedMedian}/${T[0].receivedP90}s / ${T[1].receivedMedian}/${T[1].receivedP90}s  completion ${T[0].completion}/${T[1].completion}  passes/match ${r(T[0].passes,1)}/${r(T[1].passes,1)}`);
    console.log(`switch after turnover: ${s.switch.turnovers}/match, lag median ${s.switch.lagMedian}s p90 ${s.switch.lagP90}s, within 0.3s ${s.switch.within0_3}`);
    console.log(`goals/match ${s.game.goals} (home ${T[0].goals} rival ${T[1].goals}) possession home ${s.game.possessionHome} child win rate ${s.game.childWinRate}`);
  }
  if(args.out)await writeFile(args.out,JSON.stringify(report,null,1));
}
