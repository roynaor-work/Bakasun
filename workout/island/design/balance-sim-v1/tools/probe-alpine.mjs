/** Reproducible sensitivity checks on copied v24.1 ski models, never the source tree.
 * node workout/island/design/balance-sim-v1/tools/probe-alpine.mjs [--samples 32] [--output /tmp/alpine-probes.json]
 * Paired seeds compare stock gear, the shipped calibration's progression gear, and a 0.10 reduction in the stage AI-strength entry.
 * The time-goal candidate is recomputed from completed native trajectories; it does not alter movement or pretend to be another race.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot,git} from './snapshot.mjs';
import {profiles as allProfiles} from './profiles.mjs';
import {runTrial} from './adapters/alpine.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const value=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=resolve(here,'../../../../..'),samples=Number(value('--samples','32'));
if(!Number.isSafeInteger(samples)||samples<1)throw new Error('samples must be a positive integer');
const output=resolve(value('--output',join(here,'../data/alpine-probes.json')));
if(!(output.startsWith(join(root,'workout/island/design/balance-sim-v1/'))||output.startsWith('/tmp/')))throw new Error('Output must be inside the package or /tmp');
const snapshot=await createSnapshot(root);
const seeds=Array.from({length:samples},(_,i)=>3701+i),stages=[14,19,29,33],profiles=allProfiles.filter(p=>p.id!=='impatient'),rows=[];
try{
 const config=JSON.parse(await readFile(join(snapshot.sourceRoot,'workout/island/data/config.json'),'utf8'));
 const league=await import(pathToFileURL(join(snapshot.sourceRoot,'workout/island/minigames/alpine-league-stages.mjs')).href);
 const cells=[],mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 const summarize=r=>({trials:r.length,wins:r.filter(x=>x.outcome==='win').length,winPct:100*r.filter(x=>x.outcome==='win').length/r.length,
   meanSeconds:mean(r.map(x=>x.seconds)),meanStars:mean(r.map(x=>x.stars)),meanFalls:mean(r.map(x=>x.falls)),timeGoalPct:100*r.filter(x=>x.objectives.time.met).length/r.length,
   threeStarsPct:100*r.filter(x=>x.stars===3).length/r.length});
 const currentPace=league.GOAL_PACE_V241,candidatePace=[1.25,1.30];
 for(const stage of stages)for(const profile of profiles){
  const n=stage-3,currentStrength=league.AI_STRENGTH_V241[n-1],candidateStrength=Math.max(0,currentStrength-.1),native={},byVariant={stock:[],progressGear:[],softerAI:[]};
  for(const seed of seeds){
   for(const [name,variant]of [['stock',{}],['progressGear',{gearProgress:true}],['softerAI',{aiStrength:candidateStrength}]]){
    const r=await runTrial({sourceRoot:snapshot.sourceRoot,config,stage,profile,seed,variant});
    byVariant[name].push(r);native[name]=r;
   }
   rows.push({stage,leagueStage:n,profile:profile.id,seed,baseline:native.stock,progressGear:native.progressGear,softerAI:native.softerAI});
  }
  const b=league.leagueBalance(config.minigames.alpineRush,n),facts=league.courseFacts(config.minigames.alpineRush,n),d=Math.min(1,(n-1)/29+(n%5===0?.02:0));
  const pace=candidatePace[0]+(candidatePace[1]-candidatePace[0])*d,newTimeMs=Math.ceil(facts.length/(b.physics.baseSpeed*pace)*2)*500;
  const restar=(r)=>r.outcome==='win'?1+Number(r.seconds*1000<=newTimeMs)+Number(Object.entries(r.objectives).find(([k])=>k!=='place'&&k!=='time')[1].met):0;
  const cell={stage,leagueStage:n,profile:profile.id,aiStrength:{current:currentStrength,proposed:candidateStrength},baseline:summarize(byVariant.stock),progressGear:summarize(byVariant.progressGear),softerAI:summarize(byVariant.softerAI),
    timeGoal:{currentMs:byVariant.stock[0].objectives.time.target,proposedMs:newTimeMs,baselineTimePct:100*byVariant.stock.filter(r=>r.objectives.time.met).length/samples,candidateTimePct:100*byVariant.stock.filter(r=>r.seconds*1000<=newTimeMs).length/samples,
      baselineMeanStars:mean(byVariant.stock.map(r=>r.stars)),candidateMeanStars:mean(byVariant.stock.map(restar))}};
  cells.push(cell);process.stderr.write(`ski sensitivity stage${stage} ${profile.id}: stock${cell.baseline.winPct.toFixed(1)}%, gear${cell.progressGear.winPct.toFixed(1)}%, AI-${.1}:${cell.softerAI.winPct.toFixed(1)}%; time${cell.timeGoal.baselineTimePct.toFixed(1)}→${cell.timeGoal.candidateTimePct.toFixed(1)}%\n`);
 }
 await snapshot.verify();
 const data={schemaVersion:1,game:'alpineRush',baseCommit:git(root,'rev-parse','HEAD'),sourceDigest:snapshot.manifest.sourceDigest,sourceManifest:snapshot.manifest,
   method:{paired:true,seeds,stages,profiles,stepSeconds:1/60,equipment:'stock baseline; progress gear = existing tools/alpine-league-sim.mjs gearByProgress estimate, not a full economy simulation',
     candidates:[{parameter:'AI_STRENGTH_V241[n-1]',current:'per selected stage',proposed:'current−0.10',evaluation:'new complete native race with identical seed and bot; other rules unchanged'},
       {parameter:'GOAL_PACE_V241',current:currentPace,proposed:candidatePace,evaluation:'goal-only recomputation from the same native elapsedMs, no additional race; win requirement unchanged'}],
     limitations:['Synthetic bots are not calibrated from observed children.','Fresh stock gear is a stress scenario; the shipped AI curve assumes progression gear.','Selected stages are exploratory; a successful candidate needs broader validation before implementation.','32 paired seeds per cell give directional evidence and limited precision.']},trialCount:rows.length*3,cells,rows};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({output,trialCount:data.trialCount,cells},null,2));
}finally{await snapshot.cleanup();}
