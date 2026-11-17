/** Exploratory whole-match safety check of the combined switches, paired by seed.
 * It is intentionally separate from the isolated acceptance probes. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=process.env.SOCCER_QUALITY_SOURCE,baseline=process.env.SOCCER_QUALITY_BASE;
if(!source||!baseline)throw Error('Set SOCCER_QUALITY_SOURCE and SOCCER_QUALITY_BASE');
const report={schema:1,seeds:[2301,2302],stages:[2,8],difficulties:['easy','normal','hard'],method:'Paired 180-second production human-bot matches; typical profile, 9-tick latency, full 442, v23 pitch/control/air, all v241 rules. Exploratory combined-feature risk sample, no win-rate acceptance claim.',cells:[]};
for(const [kind,root] of [['before',baseline],['after',source]]){
  const {playMatch,summarize}=await import(pathToFileURL(resolve(root,'workout/island/tools/soccer-gameplay-metrics.mjs')));
  const base=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;
  for(const stage of report.stages)for(const difficulty of report.difficulties){
    const runs=report.seeds.map(seed=>playMatch({config:{...structuredClone(base),quality:{loft:kind==='after',passing:kind==='after',keeper:kind==='after',team:kind==='after',difficulty:kind==='after',eleven:kind==='after'}},seed,stage,difficulty,full:'442',pitch:'v23',control:'v23',switchVersion:'v23',airVersion:'v23',v241:'all',ai:'v2',rules:'v1',feel:'v2',maxSeconds:400}));
    const timedOut=runs.filter(r=>r.seconds>=400-1/60).length;
    const summary=summarize(runs);report.cells.push({kind,stage,difficulty,timedOut,runSeconds:runs.map(r=>r.seconds),summary});
    console.log(JSON.stringify({kind,stage,difficulty,seconds:summary.seconds,goals:summary.team.map(t=>t.goals),passes:summary.team.map(t=>t.passCompletion)}));
  }
}
report.matches=report.cells.length*report.seeds.length;
report.timedOut=report.cells.reduce((n,c)=>n+c.timedOut,0);
await writeFile(new URL('all-features-bot.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
if(report.timedOut)process.exitCode=1;
