/** Apply the native league points/gates to the recorded stock-car race orders.
 * node workout/island/design/balance-sim-v1/tools/racing-seasons.mjs [--input data/baseline-islandRacing.json] [--output /tmp/racing-seasons.json]
 * Each season is evaluated independently: this is a stock-equipment counterfactual,
 * not a career with purchases, retries, or accumulated player data.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot} from './snapshot.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../../..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const input=resolve(arg('--input',join(here,'../data/baseline-islandRacing.json'))),output=resolve(arg('--output',join(here,'../data/racing-seasons.json')));
if(!(output.startsWith(join(root,'workout/island/design/balance-sim-v1/'))||output.startsWith('/tmp/')))throw new Error('Output must be inside the package or /tmp');
const data=JSON.parse(await readFile(input,'utf8')),snapshot=await createSnapshot(root);
try{
 if(data.sourceDigest!==snapshot.manifest.sourceDigest)throw new Error('Recorded trials and current copied game source differ');
 const league=await import(pathToFileURL(join(snapshot.sourceRoot,'workout/island/minigames/racing-league.mjs')).href);
 const rows=[],pending=[],profiles=[...new Set(data.profiles?.map(p=>p.id)??data.trials.map(t=>t.profile))],seeds=[...new Set(data.trials.map(t=>t.seed))].sort((a,b)=>a-b);
 const byKey=new Map(data.trials.map(t=>[`${t.stage}:${t.profile}:${t.seed}`,t]));
 const mean=a=>a.reduce((a,b)=>a+b,0)/a.length;
 let offset=30;
 for(const season of league.SEASONS){
  const count=league.racesIn(season.id);
  for(const profile of profiles)for(const seed of seeds){
   const trials=Array.from({length:count},(_,i)=>byKey.get(`${offset+i+1}:${profile}:${seed}`));
   if(trials.some(t=>!t)){pending.push({season:season.id,profile,seed,missing:trials.filter(t=>!t).length});continue;}
   const state=league.createLeague();state.season=season.id;
   for(const trial of trials){
    const {order,fastestLapId}=trial.diagnostics;
    if(!Array.isArray(order)||order.length!==12||trial.diagnostics.settlementValid!==true)throw new Error(`Missing validated race order ${trial.stage}:${profile}:${seed}`);
    league.applyRace(state,{order,fastestLapId});
   }
   const standings=league.standings(state),rank=standings.findIndex(r=>r.id==='player')+1,next=league.SEASONS[season.id];
   const nativeGate=next?league.nextSeason(state):{ok:rank===1,reason:'final-season-title'};
   rows.push({season:season.id,profile,seed,races:count,rank,points:standings.find(r=>r.id==='player').points,champion:rank===1,
     goal:next?'next-season':'title',targetRank:next?.minRank??1,met:nativeGate.ok,meanSeconds:mean(trials.map(t=>t.seconds)),timeLimits:trials.filter(t=>!t.diagnostics.completed).length,standings:standings.map(r=>({id:r.id,points:r.points,best:r.best}))});
  }
  offset+=count;
 }
 const summary=league.SEASONS.flatMap(season=>profiles.map(profile=>{
  const group=rows.filter(r=>r.season===season.id&&r.profile===profile);
  if(!group.length)return {season:season.id,profile,trials:0,pending:true};
  return {season:season.id,profile,trials:group.length,targetRank:group[0].targetRank,goal:group[0].goal,successPct:100*group.filter(r=>r.met).length/group.length,
    titlePct:100*group.filter(r=>r.champion).length/group.length,meanRank:mean(group.map(r=>r.rank)),ranks:group.map(r=>r.rank),meanPoints:mean(group.map(r=>r.points)),meanSeconds:mean(group.map(r=>r.meanSeconds))};
 }));
 await snapshot.verify();
 const result={schemaVersion:1,game:'islandRacing',baseCommit:data.baseCommit,sourceDigest:data.sourceDigest,input,method:'Native applyRace, standings and nextSeason on recorded complete race orders, independent stock-equipment seasons, no purchases, no retries; later seasons are counterfactual if an earlier gate failed.',complete:seeds.length>0&&profiles.length>0&&pending.length===0&&rows.length===seeds.length*profiles.length*league.SEASONS.length,summary,rows,pending};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,complete:result.complete,summary,pending:pending.length},null,2));
}finally{await snapshot.cleanup();}
