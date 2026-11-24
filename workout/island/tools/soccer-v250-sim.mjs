/** Soccer v25.0 balance measurement (evidence only): full 11 v 11 matches as the session builds them, played by the gameplay tools' child
 * proxy (profile `child`: it dribbles at goal, passes under pressure, shoots, tackles and slides), v24.9 against v25.0 on the same seeds.
 * Per stage: the child's goals, the rival's, wins / draws / losses, shots, the rival's second presser (share of the child's time on the
 * ball with two rivals inside 3 m), the child's lost balls, free kicks and corners.
 * The proxy neither taps the pitch nor turns the stick while it charges a shot, so the taps and the curl are not in these numbers: what
 * moves them is the team defence, the wall and the keeper balance.
 * Usage: node workout/island/tools/soccer-v250-sim.mjs [--n 16] [--stages 1,2,3,4,5] [--arms v249,v250] [--v250 defence,wall,keeper] [--workers 4] [--out file.json] */
import {writeFile} from 'node:fs/promises';
import {runJobs} from './soccer-gameplay-sim.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]]:a,[]));
const n=Number(args.n||16),stages=String(args.stages||'1,2,3,4,5').split(',').map(Number),arms=String(args.arms||'v249,v250').split(','),seed0=Number(args.seed0||1000),set=args.set||'';
const common={difficulty:'normal',latency:9,bot:'human',profile:args.profile||'child',pitch:'v23',control:'v23',airVersion:'v23',full:'442',v241:'all',v249:'all'};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,f=(v,d=2)=>Number(v).toFixed(d),pct=v=>(v*100).toFixed(0)+'%';
const report={n,stages,profile:common.profile,arms:{}};
for(const arm of arms){
  const v250=arm==='v249'?'0':args.v250||'all',jobs=[];for(const stage of stages)for(let i=0;i<n;i++)jobs.push({...common,v250,seed:seed0+i,stage});
  const results=await runJobs(jobs,Number(args.workers||4),{set});report.arms[arm]={};
  for(const stage of stages){
    const rs=results.filter(r=>r.stage===stage),g0=rs.map(r=>r.team[0].goals),g1=rs.map(r=>r.team[1].goals);
    const row={home:mean(g0),rival:mean(g1),win:rs.filter(r=>r.team[0].goals>r.team[1].goals).length/rs.length,draw:rs.filter(r=>r.team[0].goals===r.team[1].goals).length/rs.length,
      shots:[mean(rs.map(r=>r.team[0].shots)),mean(rs.map(r=>r.team[1].shots))],possession:mean(rs.map(r=>r.team[0].possession)),
      rivalMultiPress:mean(rs.map(r=>r.team[1].multiPress)),homeMultiPress:mean(rs.map(r=>r.team[0].multiPress)),rivalTackles:mean(rs.map(r=>r.team[1].tackles)),homeTackles:mean(rs.map(r=>r.team[0].tackles)),
      freeKicks:mean(rs.map(r=>r.team[0].freeKicks+r.team[1].freeKicks)),corners:mean(rs.map(r=>r.team[0].corners+r.team[1].corners)),unmarkedThreat:mean(rs.map(r=>r.team[1].unmarkedThreat).filter(Number.isFinite)),
      rivalSaveRate:mean(rs.map(r=>r.team[1].saveRate).filter(Number.isFinite)),minHome:Math.min(...g0),maxHome:Math.max(...g0)};
    report.arms[arm][stage]=row;
    console.log(`${arm} stage ${stage} (${rs.length}): goals ${f(row.home)} - ${f(row.rival)}  win ${pct(row.win)} draw ${pct(row.draw)}  shots ${f(row.shots[0],1)}/${f(row.shots[1],1)}  possession ${pct(row.possession)}  second presser rival ${pct(row.rivalMultiPress)} home ${pct(row.homeMultiPress)}  tackles ${f(row.homeTackles,1)}/${f(row.rivalTackles,1)}  free kicks ${f(row.freeKicks,1)} corners ${f(row.corners,1)}  rival keeper saves ${pct(row.rivalSaveRate)}  child goals ${row.minHome}..${row.maxHome}`);
  }
}
if(args.out)await writeFile(args.out,JSON.stringify(report,null,1));
