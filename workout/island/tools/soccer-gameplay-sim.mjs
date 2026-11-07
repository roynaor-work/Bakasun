/** Batch runner for soccer-gameplay-metrics: hundreds of full matches across worker threads.
 * Usage: node tools/soccer-gameplay-sim.mjs [--n 200] [--stages 2,5,8] [--difficulty normal]
 *          [--ai v1|v2] [--seed0 1000] [--latency 9] [--out file.json] [--quiet]
 * Every (stage) cell gets `n` matches, seeds seed0..seed0+n-1, so two runs are paired by seed. */
import {readFile,writeFile} from 'node:fs/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {playMatch,summarize} from './soccer-gameplay-metrics.mjs';

const f=(n,d=2)=>n===null||n===undefined?'-':Number(n).toFixed(d),p=n=>n===null||n===undefined?'-':(n*100).toFixed(0)+'%';
const loadConfig=async()=>{
  const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
  // --set 'ai.rivalBuildPasses=1;ai.switchFast=[[2.5,0.4]]' : dotted-path JSON overrides for A/B runs.
  for(const pair of String(workerData?.set||'').split(';').filter(Boolean)){const [path,raw]=pair.split('=');const keys=path.split('.');let o=config;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)]=JSON.parse(raw);}
  return config;
};
if(!isMainThread){
  const config=await loadConfig();
  parentPort.on('message',job=>{
    if(job===null)return process.exit(0);
    parentPort.postMessage({job,result:playMatch({config,...job})});
  });
  parentPort.postMessage({ready:true});
}else if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]]:a,[]));
  const n=Number(args.n||200),stages=String(args.stages||'2,5,8').split(',').map(Number),difficulty=args.difficulty||'normal',ai=args.ai||undefined,seed0=Number(args.seed0||1000),latency=Number(args.latency||9),bot=args.bot||'human',helpAll=!!args.helpAll,set=args.set||'';
  const jobs=[];for(const stage of stages)for(let i=0;i<n;i++)jobs.push({seed:seed0+i,stage,difficulty,latency,bot,helpAll,...(ai?{ai}:{})});
  const results=await runJobs(jobs,Number(args.workers||4),{set});
  const byStage={};for(const stage of stages)byStage[stage]=summarize(results.filter(r=>r.stage===stage));
  const report={ai:ai||'default',set,difficulty,n,stages,latency,bot,helpAll,all:summarize(results),byStage};
  if(args.out)await writeFile(args.out,JSON.stringify(report,null,1));
  if(!args.quiet)print(report);
}
export function runJobs(jobs,workers=4,data={}){
  return new Promise((resolve,reject)=>{
    const results=[],pool=[];let next=0,live=0;
    for(let w=0;w<Math.min(workers,jobs.length);w++){
      const worker=new Worker(fileURLToPath(import.meta.url),{workerData:data});live++;pool.push(worker);
      const send=()=>{if(next<jobs.length)worker.postMessage(jobs[next++]);else worker.postMessage(null);};
      worker.on('message',m=>{if(m.ready)return send();results.push(m.result);if(results.length===jobs.length){for(const w of pool)w.terminate();resolve(results);}else send();});
      worker.on('error',reject);
    }
  });
}
function print(r){
  for(const [stage,s] of Object.entries(r.byStage)){
    const t0=s.team[0],t1=s.team[1],g=s.game;
    console.log(`\n== ai=${r.ai} stage ${stage} (${s.matches} matches, ${f(s.seconds,0)}s) ==`);
    console.log(`goals/match ${f(g.totalGoals)} (home ${f(t0.goals)} rival ${f(t1.goals)}) 2-5 goals in ${p(s.spread.totalGoals.inRange)}, 0-0 in ${p(s.spread.totalGoals.zeroGoal)}`);
    console.log(`shots/match ${f(g.totalShots)} (home ${f(t0.shots)} rival ${f(t1.shots)}); on target ${f(t0.shotsOnTarget+t1.shotsOnTarget)}`);
    console.log(`possession home ${p(t0.possession)}  pass attempts ${f(t0.passes,1)}/${f(t1.passes,1)}  completion ${p(t0.passCompletion)}/${p(t1.passCompletion)}  unintended ${p(t0.passUnintended)}/${p(t1.passUnintended)}  intercepted ${p(t0.passIntercepted)}/${p(t1.passIntercepted)}  out ${p(t0.passOut)}/${p(t1.passOut)}`);
    console.log(`heavyTouch ${f(t0.heavyTouches,1)}/${f(t1.heavyTouches,1)} tackles ${f(t0.tackles,1)}/${f(t1.tackles,1)} looseWins ${f(t0.looseWins,1)}/${f(t1.looseWins,1)} throwIns ${f(t0.throwIns+t1.throwIns,1)} corners ${f(t0.corners+t1.corners,1)} goalKicks ${f(t0.goalKicks+t1.goalKicks,1)}`);
    console.log(`anchor dist ${f(t0.anchorDist)}/${f(t1.anchorDist)}  far(>13m) ${p(t0.farFromRole)}/${p(t1.farFromRole)}  pressers ${f(t0.pressers)}/${f(t1.pressers)}  multiPress ${p(t0.multiPress)}/${p(t1.multiPress)}  carrierPressure ${f(t0.carrierPressure)}/${f(t1.carrierPressure)}`);
    console.log(`shots home ctrl ${f(t0.shotsCtrl,1)} mates ${f(t0.shotsMate,1)} far ${f(t0.shotsFar,1)}/${f(t1.shotsFar,1)} dist ${f(t0.shotDistance,1)}/${f(t1.shotDistance,1)} conversion ${p(t0.conversion)}/${p(t1.conversion)} save rate home keeper ${p(t0.saveRate)} (${f(t0.saves,1)} saves/${f(t0.conceded,1)} conceded) rival keeper ${p(t1.saveRate)} (${f(t1.saves,1)}/${f(t1.conceded,1)})`);
    console.log(`spells ${f(t0.spells,1)}/${f(t1.spells,1)} len ${f(t0.spellSeconds,1)}s/${f(t1.spellSeconds,1)}s passes/spell ${f(t0.passesPerSpell)}/${f(t1.passesPerSpell)} built(>=3 passes) ${p(t0.builtSpells)}/${p(t1.builtSpells)} transitions/min ${f(g.transitionsPerMinute,1)}`);
    console.log(`shape length ${f(t0.teamLength,1)}/${f(t1.teamLength,1)} width ${f(t0.teamWidth,1)}/${f(t1.teamWidth,1)} crowd ${p(t0.crowd)}/${p(t1.crowd)} stillOffBall ${p(t0.stillOffBall)}/${p(t1.stillOffBall)} goalSideCover ${f(t0.goalSideCover)}/${f(t1.goalSideCover)} unmarkedThreat ${p(t0.unmarkedThreat)}/${p(t1.unmarkedThreat)}`);
    console.log(`edge run max ${f(g.maxEdgeRun,1)}s cornerShare ${p(g.cornerShare)} nonPlay ${f(g.nonPlaySeconds,1)}s`);
    console.log(`dead ball ${p(g.deadBall)} rest ${p(g.restBall)} stuck4s ${p(g.stuckWindows)} maxStuck ${f(g.maxStuckSeconds,1)}s (p90 ${f(s.spread.maxStuckSeconds.p90,1)})  thirds D/M/A ${p(g.thirdDefend)}/${p(g.thirdMid)}/${p(g.thirdAttack)} swings ${f(g.swings)} coverage ${p(g.coverage)}`);
    console.log(`switch/min ${f(g.switchesPerMinute,1)} (auto ${f(g.autoSwitchesPerMinute,1)}, auto ping-pong ${f(g.autoPingPong)}) pingpong all ${f(g.pingPong)} accuracy ${p(g.switchAccuracy)} mismatch ${p(g.mismatchShare)} (median ${f(g.mismatchMedian)}s p90 ${f(g.mismatchP90)}s) touch->move ${f(g.touchToMoveMedian)}s/${f(g.touchToMoveP90)}s`);
  }
}
