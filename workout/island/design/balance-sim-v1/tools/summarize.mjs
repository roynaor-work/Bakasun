#!/usr/bin/env node
/** Deterministic aggregation of completed native trials. Missing observations
 * remain null. This command reads evidence only and never imports game code. */
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const HERE=dirname(fileURLToPath(import.meta.url)),PACK=resolve(HERE,'..');
const ORDER=['soccer','streetSlam','tennis','islandRacing','alpineRush','alienDefense','navalDuel','fireRescue','catchCriminal','boarDefense'];
const EXPECTED_SAMPLES={soccer:16,streetSlam:32,tennis:32,islandRacing:8,alpineRush:32,alienDefense:32,navalDuel:32,fireRescue:32,catchCriminal:32,boarDefense:8};
const PROFILE_IDS=['impatient','regular','skilled'];
const shortNames={impatient:'חסר סבלנות',regular:'רגיל',skilled:'מיומן'};
const number=x=>typeof x==='number'&&Number.isFinite(x),mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const stableSort=(a,b)=>a<b?-1:a>b?1:0;
const unique=a=>[...new Map(a.map(x=>[JSON.stringify(x),x])).values()].sort((a,b)=>stableSort(JSON.stringify(a),JSON.stringify(b)));

export function wilson95(successes,n){
 if(!n)return null;
 const z=1.959963984540054,p=successes/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;
 return {low:Math.max(0,c-h),high:Math.min(1,c+h)};
}
export function quantile(values,p){
 if(!values.length)return null;
 const a=values.slice().sort((x,y)=>x-y),at=(a.length-1)*p,i=Math.floor(at),f=at-i;
 return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*f;
}
/** Exact conditional two-sided McNemar test: discordant pairs ~ Bin(n,.5).
 * Summing in log space also supports substantially larger future cohorts. */
export function exactMcNemar(lost,gained){
 const n=lost+gained;if(!n)return 1;
 const k=Math.min(lost,gained),logs=[];let term=-n*Math.log(2);
 for(let i=0;i<=k;i++){logs.push(term);term+=Math.log(n-i)-Math.log(i+1);}
 const largest=Math.max(...logs),tail=Math.exp(largest)*logs.reduce((s,x)=>s+Math.exp(x-largest),0);
 return Math.min(1,2*tail);
}
export function holmAdjust(tests){
 const valid=tests.filter(t=>number(t.pExact)).slice().sort((a,b)=>a.pExact-b.pExact||stableSort(a.id,b.id));
 let previous=0;for(let i=0;i<valid.length;i++){previous=Math.max(previous,Math.min(1,valid[i].pExact*(valid.length-i)));valid[i].pHolm=previous;valid[i].holmFamilySize=valid.length;}
 return tests;
}

/** Only explicit booleans define goal completion; numeric telemetry such as
 * enemiesKilled is not silently interpreted as an achieved goal. */
export function normalizeGoals(objectives){
 const list=Array.isArray(objectives)?objectives.map((v,i)=>[String(v?.id??i),v]):objectives&&typeof objectives==='object'?Object.entries(objectives):[];
 return list.flatMap(([id,value])=>{
  if(typeof value==='boolean')return [{id,current:value,target:true,complete:value,optional:null}];
  if(!value||typeof value!=='object')return [];
  const complete=typeof value.complete==='boolean'?value.complete:typeof value.met==='boolean'?value.met:null;
  if(complete===null)return [];
  return [{id,current:value.current??value.value??value.actual??null,target:value.target??null,complete,optional:typeof value.optional==='boolean'?value.optional:null}];
 });
}

function timingNote(id){
 if(id==='tennis')return 'שניות קבועות כוללות הגשות שהשעון הפנימי elapsed אינו סופר; זמני טעינה ורינדור אינם נמדדים.';
 if(id==='soccer')return 'שניות סימולציה עד התוצאה המקורית, לרבות שלבי פתיחה והפסקות שהבוט מריץ; זמני טעינה, רינדור ושידור חוזר אינם נמדדים.';
 if(id==='streetSlam')return 'שניות סימולציה כוללות עצירות והארכות. quick מחייב לפחות 360 שניות שעון משחק; רינדור ושידורים חוזרים אוטומטיים אינם נמדדים.';
 if(id==='fireRescue')return 'זמן המודל ברחוב בתוספת זמן משימת הפנים, כאשר היא נדרשת; זמני טעינה ורינדור אינם נמדדים.';
 if(id==='catchCriminal')return 'זמן כולל שעון מרדף, ספירה לאחור, מעבר של שתי שניות ושעון זריקות. השהיות טעינה והאטת אנימציה קולנועית אינן כלולות.';
 if(id==='islandRacing')return 'משך המרוץ המקורי durationSeconds מתחיל אחרי ספירת הזינוק של 3 שניות; הוא כולל את זמן הנהיגה והטיפולים במרוץ. זמני טעינה, רינדור וספירת הזינוק אינם נמדדים.';
 if(id==='alpineRush')return 'זמן elapsedMs המקורי מתחיל אחרי ספירת הזינוק של 3 שניות; זוהי גם יחידת הזמן של יעדי הליגה. זמני טעינה, רינדור וספירת הזינוק אינם נמדדים.';
 return 'זמן סימולציה קבוע עד תוצאה מקורית או מגבלת הרצה; זמני טעינה ורינדור אינם נמדדים. הגדרה מדויקת נשמרת במתאם ובנתוני כל ניסיון.';
}
function fallsNote(id){
 if(id==='soccer')return 'נפילות: עבירות על שחקני הבית שהפעילו fouledTime; מעידות והגלשות יזומות אינן נספרות.';
 if(id==='alpineRush')return 'נפילות: מונה crashes המקורי של הסקיאר, ולא כלל המגעים במכשולים.';
 if(id==='islandRacing')return 'נפילות: מונה crashes המקורי של המכונית, הכולל התהפכויות ויציאה מהמסלול; bumps ו־recoveries נשמרים בנפרד.';
 return 'אין מונה נפילות מוגדר בחוזה המתאם; המדד נשאר חסר. נזק, התנגשויות או מעידות, אם קיימים, נשמרים באבחונים ואינם מומרים לנפילות.';
}

function summarizeCell(rows,{game,stage,profile}){
 const n=rows.length,wins=rows.filter(r=>r.outcome==='win').length,times=rows.map(r=>r.seconds).filter(number);
 // The league contract awards no racing stars. Its numeric placeholder is not
 // an observation of a failed three-star objective.
 const awardDefined=r=>!(game==='islandRacing'&&(r.diagnostics?.mode==='league'||r.stage>30||stage>30));
 const starValues=rows.filter(awardDefined).map(r=>r.stars).filter(number),fallValues=rows.map(r=>r.falls).filter(number);
 const patience=rows.flatMap(r=>typeof r.withinPatience==='boolean'?[r.withinPatience]:typeof r.diagnostics?.patienceExceeded==='boolean'?[!r.diagnostics.patienceExceeded]:[]);
 const goals=new Map();
 for(const r of rows)for(const g of normalizeGoals(r.objectives)){
  if(game==='islandRacing'&&!awardDefined(r)&&/star/i.test(g.id))continue;
  let a=goals.get(g.id);if(!a){a={id:g.id,n:0,met:0,optionalFlags:[],current:[],targets:[]};goals.set(g.id,a);}
  a.n++;a.met+=Number(g.complete);a.optionalFlags.push(g.optional);a.current.push(g.current);a.targets.push(g.target);
 }
 const goalStats=[...goals.values()].sort((a,b)=>stableSort(a.id,b.id)).map(a=>{
  const targets=unique(a.targets),optionalFlags=unique(a.optionalFlags),numeric=a.current.filter(number),wilson=wilson95(a.met,a.n);
  return {id:a.id,n:a.n,met:a.met,rate:a.met/a.n,wilson95:wilson,optional:optionalFlags.length===1?optionalFlags[0]:null,target:targets.length===1?targets[0]:null,targets,currentMean:numeric.length===a.n?mean(numeric):null,currentMin:numeric.length===a.n?Math.min(...numeric):null,currentMax:numeric.length===a.n?Math.max(...numeric):null,unachievedInSample:a.met===0};
 });
 return {game,stage,profile,n,wins,winRate:n?wins/n:null,winPct:n?100*wins/n:null,winWilson95:wilson95(wins,n),timeMean:mean(times),timeMedian:quantile(times,.5),timeP90:quantile(times,.9),timeN:times.length,starsMean:mean(starValues),starsN:starValues.length,fallsMean:mean(fallValues),fallsN:fallValues.length,threeStarRate:starValues.length?starValues.filter(s=>s===3).length/starValues.length:null,patiencePct:patience.length?100*patience.filter(Boolean).length/patience.length:null,patienceN:patience.length,winsWithinPatience:rows.filter(r=>r.outcome==='win'&&r.withinPatience===true).length,timeOuts:rows.filter(r=>r.outcome==='timeout').length,goals:goalStats,modes:unique(rows.map(r=>r.diagnostics?.mode).filter(v=>typeof v==='string')),seeds:rows.map(r=>r.seed).sort((a,b)=>a-b)};
}

export function summarizeDataset(data,{expectedSamples=EXPECTED_SAMPLES[data.game.id]??32}={}){
 const game=data.game,stages=game.stages.slice(),profiles=data.profiles.slice().sort((a,b)=>PROFILE_IDS.indexOf(a.id)-PROFILE_IDS.indexOf(b.id));
 const byCell=new Map(),keys=new Set();
 for(const row of data.trials){
  if(row.game!==game.id||!stages.includes(row.stage)||!profiles.some(p=>p.id===row.profile))throw Error(`Unexpected trial coordinates in ${game.id}`);
  if(!['win','lose','timeout'].includes(row.outcome)||!number(row.seconds)||row.seconds<0)throw Error(`Invalid trial in ${game.id}`);
  const key=`${row.stage}:${row.profile}:${row.seed}`;if(keys.has(key))throw Error(`Duplicate trial ${game.id}:${key}`);keys.add(key);
  const cellKey=`${row.stage}:${row.profile}`;if(!byCell.has(cellKey))byCell.set(cellKey,[]);byCell.get(cellKey).push(row);
 }
 const cells=stages.flatMap(stage=>profiles.map(profile=>summarizeCell(byCell.get(`${stage}:${profile.id}`)||[],{game:game.id,stage,profile:profile.id})));
 const indexed=new Map(cells.map(c=>[`${c.stage}:${c.profile}`,c]));
 const adjacentTests=[];
 for(const profile of profiles)for(let i=1;i<stages.length;i++){
  const previousStage=stages[i-1],stage=stages[i],a=indexed.get(`${previousStage}:${profile.id}`),b=indexed.get(`${stage}:${profile.id}`);
  if(!a.n||!b.n)continue;
  const ar=new Map((byCell.get(`${previousStage}:${profile.id}`)||[]).map(r=>[r.seed,r.outcome==='win'])),br=new Map((byCell.get(`${stage}:${profile.id}`)||[]).map(r=>[r.seed,r.outcome==='win']));
  const common=[...ar.keys()].filter(seed=>br.has(seed));let lost=0,gained=0;
  for(const seed of common){if(ar.get(seed)&&!br.get(seed))lost++;else if(!ar.get(seed)&&br.get(seed))gained++;}
  const drop=(a.winRate-b.winRate)*100;
  adjacentTests.push({id:`${game.id}:${profile.id}:${previousStage}:${stage}`,game:game.id,profile:profile.id,previousStage,stage,previousN:a.n,currentN:b.n,previousWinPct:a.winPct,currentWinPct:b.winPct,dropPercentagePoints:drop,candidate:drop>=25-1e-10,pairedN:common.length,pairedSeeds:common.sort((a,b)=>a-b),lostWins:lost,gainedWins:gained,pExact:common.length?exactMcNemar(lost,gained):null,pHolm:null,holmFamilySize:null,modeBoundary:JSON.stringify(a.modes)!==JSON.stringify(b.modes)});
 }
 holmAdjust(adjacentTests);
 for(const test of adjacentTests)test.significantAfterHolm=test.candidate&&test.pHolm!==null&&test.pHolm<=.05;
 const stageFlags=stages.map(stage=>{
  const get=p=>indexed.get(`${stage}:${p}`),r=get('regular'),i=get('impatient'),s=get('skilled');
  return {stage,easy:Boolean(r?.n&&i?.n&&r.winRate>=.95&&i.winRate>=.90),hard:Boolean(s?.n&&s.winRate<=.25||r?.n&&r.winRate<=.10),hardReasons:[...(s?.n&&s.winRate<=.25?['skilled<=25%']:[]),...(r?.n&&r.winRate<=.10?['regular<=10%']:[])],candidateSpikes:adjacentTests.filter(t=>t.stage===stage&&t.candidate).map(t=>t.id),classification:'exploratory-fresh-gear-proxy'};
 });
 const unachievedGoals=cells.flatMap(c=>c.goals.filter(g=>g.met===0).map(g=>({game:game.id,stage:c.stage,profile:c.profile,id:g.id,n:g.n,met:0,wilson95:g.wilson95,upper95:g.wilson95.high,optional:g.optional,target:g.target})));
 const observed=cells.filter(c=>c.n>0),complete=cells.filter(c=>c.n>=expectedSamples),counts=cells.map(c=>c.n);
 return {id:game.id,name:game.name,stages,stageLabels:game.stageLabels??{},profiles,notes:game.notes??[],sources:game.sources??[],baseCommit:data.baseCommit,sourceDigest:data.sourceDigest,fingerprint:data.fingerprint,timingNote:timingNote(game.id),fallsNote:fallsNote(game.id),coverage:{expectedSamplesPerCell:expectedSamples,expectedCells:cells.length,observedCells:observed.length,completeCells:complete.length,totalTrials:data.trials.length,minimumRequiredTrials:cells.length*expectedSamples,minN:Math.min(...counts),maxN:Math.max(...counts),complete:complete.length===cells.length,missingCells:cells.filter(c=>!c.n).map(c=>({stage:c.stage,profile:c.profile})),undersampledCells:cells.filter(c=>c.n>0&&c.n<expectedSamples).map(c=>({stage:c.stage,profile:c.profile,n:c.n}))},cells,adjacentTests,candidateSpikes:adjacentTests.filter(t=>t.candidate),stageFlags,unachievedGoals,aggregates:profiles.map(profile=>{const rows=data.trials.filter(r=>r.profile===profile.id);const a=summarizeCell(rows,{game:game.id,stage:null,profile:profile.id});delete a.seeds;return a;})};
}

const fmt=(n,d=1)=>n===null||n===undefined?'—':Number(n).toFixed(d);
function ranges(values){
 const sorted=[...new Set(values)].sort((a,b)=>a-b),out=[];
 for(let i=0;i<sorted.length;i++){let end=i;while(end+1<sorted.length&&sorted[end+1]===sorted[end]+1)end++;out.push(end===i?String(sorted[i]):`${sorted[i]}–${sorted[end]}`);i=end;}
 return out.join(', ');
}
export function makeTables(summary){
 const out=['<!-- נוצר אוטומטית באמצעות tools/summarize.mjs; אין לערוך ידנית. -->','','## טבלאות מלאות לפי שלב','','כל תא: **אחוז ניצחון [ניצחונות/ניסיונות] (רווח Wilson של 95%) / זמן ממוצע בשניות / כוכבים ממוצעים / נפילות ממוצעות**. `—` מציין מדד שאינו מוגדר או נתון חסר, ולא אפס. ספי הקושי הם דגלים לחקירה בבוטים מלאכותיים ובציוד התחלתי; הם אינם נתוני ילדים. מוני נפילות מוגדרים בנפרד לכל משחק ואינם מדד פיזי אחיד להשוואה בין משחקים.','','יעד שסומן 0/n לא הושג במדגם. הגבול העליון של Wilson מצורף; הממצא אינו הוכחה שהיעד בלתי אפשרי.'];
 for(const game of summary.games){
  out.push('',`### ${game.name}`,`<a id="game-${game.id}"></a>`,'',`כיסוי: ${game.coverage.completeCells}/${game.coverage.expectedCells} תאים הגיעו לפחות ל־${game.coverage.expectedSamplesPerCell} ניסיונות; ${game.coverage.totalTrials} ניסיונות בסך הכול.`, '',game.timingNote,'',game.fallsNote,'',...game.notes.map(note=>`- ${note}`),'',`![עקומות ${game.name}](charts/${game.id}.svg)`,'','| שלב | חסר סבלנות | רגיל | מיומן | דגלי בדיקה |','|---|---|---|---|---|');
  const indexed=new Map(game.cells.map(c=>[`${c.stage}:${c.profile}`,c]));
  for(const stage of game.stages){
   const flag=game.stageFlags.find(f=>f.stage===stage),flags=[];
   if(flag.easy)flags.push('קל לפי הסף');if(flag.hard)flags.push('קשה לפי הסף');
   for(const spike of game.candidateSpikes.filter(s=>s.stage===stage))flags.push(`ירידה ${fmt(spike.dropPercentagePoints,0)} נ״א · ${shortNames[spike.profile]}${spike.significantAfterHolm?' · Holm≤0.05':''}${spike.modeBoundary?' · מעבר מצב':''}`);
   const values=PROFILE_IDS.map(p=>{const c=indexed.get(`${stage}:${p}`);return !c?.n?'אין נתונים':`${fmt(c.winPct,1)}% [${c.wins}/${c.n}] (${fmt(c.winWilson95.low*100,1)}–${fmt(c.winWilson95.high*100,1)}) / ${fmt(c.timeMean,1)} / ${fmt(c.starsMean,2)} / ${fmt(c.fallsMean,2)}`;});
   const label=game.stageLabels[stage]?`${stage} · ${game.stageLabels[stage]}`:String(stage);
   out.push(`| ${label} | ${values.join(' | ')} | ${flags.join('; ')||'—'} |`);
  }
  const grouped=new Map();
  for(const g of game.unachievedGoals){const key=`${g.id}:${g.profile}:${g.optional}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(g);}
  if(grouped.size){out.push('','<details><summary>יעדים שלא הושגו במדגם</summary>','','| יעד | פרופיל | שלבים | ניסיונות לתא | גבול עליון 95% |','|---|---|---|---|---|');
   for(const list of [...grouped.values()].sort((a,b)=>stableSort(a[0].id,b[0].id)||PROFILE_IDS.indexOf(a[0].profile)-PROFILE_IDS.indexOf(b[0].profile))){const g=list[0],ns=unique(list.map(x=>x.n));out.push(`| ${g.id}${g.optional?' · אופציונלי':''} | ${shortNames[g.profile]} | ${ranges(list.map(x=>x.stage))} | 0/${ns.join(', 0/')} | ${ns.map(n=>`${n}: ${fmt(wilson95(0,n).high*100,1)}%`).join('; ')} |`);}
   out.push('','</details>');}
 }
 return out.join('\n')+'\n';
}

export async function main(argv=process.argv.slice(2)){
 const arg=(key,fallback)=>{const i=argv.indexOf(`--${key}`);return i<0?fallback:argv[i+1];};
 if(argv.includes('--help')){console.log('node tools/summarize.mjs [--data ../data] [--output ../data/summary.json] [--charts ../charts] [--tables ../TABLES.md] [--no-charts] [--expected-commit SHA] [--samples N]\nCommit defaults to source-manifest.json.baseCommit, or a unanimous dataset commit when no manifest exists. Mixed commits/digests are rejected. Charts require Python 3 with matplotlib; statistics and Markdown use only Node.js standard libraries.');return;}
 const dataDir=resolve(arg('data',join(PACK,'data'))),output=resolve(arg('output',join(dataDir,'summary.json'))),tables=resolve(arg('tables',join(PACK,'TABLES.md'))),charts=resolve(arg('charts',join(PACK,'charts'))),sampleOverride=arg('samples',null);
 if(sampleOverride!==null&&(!Number.isSafeInteger(Number(sampleOverride))||Number(sampleOverride)<1))throw Error('Invalid sample target');
 for(const path of [output,tables,charts])if(!(path===PACK||path.startsWith(PACK+'/')||path.startsWith('/tmp/')))throw Error('Outputs must remain inside this package or /tmp');
 const files=(await readdir(dataDir)).filter(f=>/^baseline-[A-Za-z0-9_-]+\.json$/.test(f)).sort(),datasets=[];
 for(const file of files)datasets.push(JSON.parse(await readFile(join(dataDir,file),'utf8')));
 if(!datasets.length)throw Error('No baseline datasets found');
 let manifest=null;try{manifest=JSON.parse(await readFile(join(dataDir,'source-manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const commits=unique(datasets.map(d=>d.baseCommit)),digests=unique(datasets.map(d=>d.sourceDigest));
 if(commits.length!==1||typeof commits[0]!=='string')throw Error('Cannot compare datasets from different or missing source commits');
 const expectedCommit=arg('expected-commit',manifest?.baseCommit??commits[0]);
 for(let i=0;i<datasets.length;i++)if(datasets[i].baseCommit!==expectedCommit)throw Error(`Unexpected source commit in ${files[i]}: ${datasets[i].baseCommit}`);
 if(digests.length!==1||typeof digests[0]!=='string')throw Error('Cannot compare datasets from different or missing source digests');
 if(manifest?.sourceDigest&&manifest.sourceDigest!==digests[0])throw Error('Source manifest digest does not match baseline data');
 const ids=datasets.map(d=>d.game.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate game datasets');
 datasets.sort((a,b)=>ORDER.indexOf(a.game.id)-ORDER.indexOf(b.game.id));
 const games=datasets.map(d=>summarizeDataset(d,sampleOverride===null?{}:{expectedSamples:Number(sampleOverride)}));
 const summary={schemaVersion:1,baseCommit:expectedCommit,sourceDigest:digests[0]??null,method:{syntheticBots:true,cohort:'fresh gear independently at every stage; see per-game notes',winInterval:'two-sided Wilson score, 95%',quantile:'linear interpolation at (n−1)p',spikeCandidate:'adjacent win rate drop >=25 percentage points, within a profile; mode boundaries marked',spikeTest:'exact two-sided McNemar on common seeds; Holm family includes ALL testable adjacent pairs across all profiles within each game, not just selected candidates',alpha:.05,easyThreshold:'regular >=95% AND impatient >=90%',hardThreshold:'skilled <=25% OR regular <=10%',unachievedGoal:'0/n observed completion; Wilson upper bound retained; never proof of impossibility',patience:'percentage of runs within profile time budget; not a stopping rule; includes losses',undefinedAwards:'racing league star placeholder excluded; no undefined metric is coerced to zero',expectedSamples:sampleOverride===null?null:Number(sampleOverride),expectedSamplesPerGame:sampleOverride===null?EXPECTED_SAMPLES:null},coverage:{expectedGames:ORDER.length,presentGames:games.length,missingGames:ORDER.filter(id=>!ids.includes(id)),totalTrials:games.reduce((s,g)=>s+g.coverage.totalTrials,0),expectedCells:games.reduce((s,g)=>s+g.coverage.expectedCells,0),completeCells:games.reduce((s,g)=>s+g.coverage.completeCells,0),complete:ORDER.every(id=>ids.includes(id))&&games.every(g=>g.coverage.complete)},games};
 // Avoid wall-clock metadata so repeated aggregation is byte-for-byte stable.
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(summary,null,2)+'\n');
 await mkdir(dirname(tables),{recursive:true});await writeFile(tables,makeTables(summary));
 if(!argv.includes('--no-charts')){const r=spawnSync('python3',[join(HERE,'charts.py'),'--summary',output,'--output',charts],{encoding:'utf8',env:{...process.env,MPLCONFIGDIR:'/tmp/balance-sim-matplotlib'}});if(r.status!==0)throw Error(`Chart generation failed: ${r.stderr||r.stdout}`);}
 console.log(JSON.stringify({output,tables,charts:argv.includes('--no-charts')?null:charts,coverage:summary.coverage}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
