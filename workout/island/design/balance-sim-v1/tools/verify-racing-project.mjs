/** Certify exact indexed projections and complete native-race equality on copies.
 * node workout/island/design/balance-sim-v1/tools/verify-racing-project.mjs [--jobs 2]
 * Two copied source trees differ only by an injected call that indexes track.project.
 * The middle run checks EVERY projection against the native implementation. All
 * final results/diagnostics must deep-equal the reference, including exact floats.
 */
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {createSnapshot,sha256} from './snapshot.mjs';
import {accelerateRacingProjection} from './exact-racing-project.mjs';
import {profiles} from './profiles.mjs';
import {runTrial} from './adapters/racing.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../../..');
if(!isMainThread){
 const config=JSON.parse(await readFile(join(workerData.sourceRoot,'workout/island/data/config.json'),'utf8'));
 for(const job of workerData.jobs){
  const profile=profiles.find(p=>p.id===job.profile),rows={};
  for(const [name,sourceRoot,verify]of [['native',workerData.sourceRoot,false],['verifyEveryQuery',workerData.indexedRoot,true],['fast',workerData.indexedRoot,false]]){
   globalThis.__balanceVerifyProjection=verify;globalThis.__balanceProjectionStats=[];
   const started=performance.now(),cpuStart=process.threadCpuUsage(),result=await runTrial({sourceRoot,config,stage:job.stage,profile,seed:job.seed,variant:{exactProjection:false}});
   const ms=performance.now()-started,cpu=process.threadCpuUsage(cpuStart),cpuMilliseconds=(cpu.user+cpu.system)/1000;
   const stats=globalThis.__balanceProjectionStats.map(x=>({...x.stats}));
   rows[name]={milliseconds:ms,cpuMilliseconds,result,stats};
  }
  assert.deepEqual(rows.verifyEveryQuery.result,rows.native.result,`verified native race parity stage${job.stage}/${job.profile}`);
  assert.deepEqual(rows.fast.result,rows.native.result,`fast native race parity stage${job.stage}/${job.profile}`);
  parentPort.postMessage({job,...rows,strictlyEqual:true});
 }
}else{
 const arg=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];},jobsCount=Number(arg('--jobs','2'));
 if(!Number.isSafeInteger(jobsCount)||jobsCount<1||jobsCount>4)throw new Error('jobs must be1..4');
 const output=resolve(arg('--output',join(here,'../data/racing-project-equivalence.json')));
 if(!(output.startsWith(join(root,'workout/island/design/balance-sim-v1/'))||output.startsWith('/tmp/')))throw new Error('Output must be inside package or /tmp');
 const snapshot=await createSnapshot(root),indexedRoot=await mkdtemp(join(tmpdir(),'bakasun-exact-project-'));
 try{
  await cp(snapshot.sourceRoot,indexedRoot,{recursive:true});
  const helper=await readFile(join(here,'exact-racing-project.mjs'),'utf8');
  await writeFile(join(indexedRoot,'workout/island/minigames/balance-exact-project.mjs'),helper);
  const physicsPath=join(indexedRoot,'workout/island/minigames/racing-physics.mjs'),original=await readFile(physicsPath,'utf8');
  const anchor='const track=createTrack(stage), random=randomSource(seedUint), sector=track.length/track.checkpoints.length;';
  assert.equal(original.split(anchor).length,2,'unambiguous native constructor anchor');
  const injected=original.replace(anchor,anchor+'\n  (globalThis.__balanceProjectionStats??=[]).push(accelerateRacingProjection(track,{verify:globalThis.__balanceVerifyProjection===true}));');
  await writeFile(physicsPath,"import {accelerateRacingProjection} from './balance-exact-project.mjs';\n"+injected);
  const {createTrack}=await import(pathToFileURL(join(snapshot.sourceRoot,'workout/island/minigames/racing-tracks.mjs')).href);
  let rngState=4401;const rnd=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
  const queryRows=[];
  for(let stage=1;stage<=30;stage++){
   const track=createTrack(stage),index=accelerateRacingProjection(track,{verify:true}),list=[];
   for(let i=0;i<300;i++){const s=(rnd()*3-1)*track.length,p=track.sample(s),lat=(rnd()*2-1)*(i%3===0?60:7),forward=(rnd()*2-1)*12,hint=s+(rnd()*2-1)*15;list.push([p.x+p.normal.x*lat+p.tangent.x*forward,p.z+p.normal.z*lat+p.tangent.z*forward,hint]);}
   for(let i=0;i<30;i++){const p=track.points[Math.floor(i*track.points.length/30)];list.push([p.x,p.z,p.s]);}
   for(const q of list)track.project(...q);
   queryRows.push({stage,segments:track.points.length,...index.stats});index.restore();
  }
  const jobs=[[1,'impatient'],[2,'regular'],[3,'skilled'],[7,'impatient'],[19,'regular'],[25,'skilled'],[31,'impatient'],[43,'regular'],[77,'skilled'],[108,'skilled']].map(([stage,profile],i)=>({stage,profile,seed:1701+i*31}));
  const rows=[];let completed=0;
  await Promise.all(Array.from({length:Math.min(jobsCount,jobs.length)},(_,index)=>new Promise((resolve,reject)=>{
   const assigned=jobs.filter((_,i)=>i%jobsCount===index),worker=new Worker(fileURLToPath(import.meta.url),{workerData:{sourceRoot:snapshot.sourceRoot,indexedRoot,jobs:assigned}});
   worker.on('message',row=>{rows.push(row);completed++;process.stderr.write(`projection complete-race parity ${completed}/${jobs.length}: stage${row.job.stage} ${row.job.profile}, native${(row.native.cpuMilliseconds/1000).toFixed(1)}cpu-s fast${(row.fast.cpuMilliseconds/1000).toFixed(1)}cpu-s\n`);});
   worker.on('error',reject);worker.on('exit',code=>code?reject(new Error(`verification worker exit${code}`)):resolve());
  })));
  rows.sort((a,b)=>a.job.stage-b.job.stage);
  const sum=(key,metric)=>rows.reduce((n,r)=>n+r[key][metric],0),nativeMilliseconds=sum('native','milliseconds'),fastMilliseconds=sum('fast','milliseconds');
  const nativeCpuMilliseconds=sum('native','cpuMilliseconds'),fastCpuMilliseconds=sum('fast','cpuMilliseconds');
  const verificationQueries=queryRows.reduce((n,r)=>n+r.verified,0)+rows.reduce((n,r)=>n+r.verifyEveryQuery.stats.reduce((a,s)=>a+s.verified,0),0);
  const result={schemaVersion:1,baseCommit:snapshot.manifest.baseCommit,sourceDigest:snapshot.manifest.sourceDigest,helperSha256:sha256(helper),adapterSha256:sha256(await readFile(join(here,'adapters/racing.mjs'))),
   method:{queryTolerance:'Object.is for every numeric field (zero tolerance), recursive object fields',raceTolerance:'assert.deepStrictEqual on every returned field, including native score, rank, ordered checkpoints, stars, falls, goals, elapsed time, decisions and diagnostics',
     gameRules:'Native default v24 physics, same source snapshot, actual base/league stages, full native termination, same frozen adapter inputs. Only track.project query index differs.',randomQueries:'300 deterministic on/offroad samples plus30 exact segment endpoints for each of30 stage tracks; includes reversed tracks and native full-scan fallback',
     timing:'Per-thread CPU usage (process.threadCpuUsage) and wall time both recorded. Serial native/verify/fast runs in each worker,2 workers by default. CPU ratios avoid shared-load wall-time distortion; constructor/index overhead included.',floatingGuard:'max(128,32×scannedSegmentCount)×Number.EPSILON×coordinate magnitude; expands the AABB inclusion threshold; scan order and native 1e-4 tie rule are unchanged.'},
   complete:true,queryTests:queryRows,completeRaces:rows,summary:{races:rows.length,allStrictlyEqual:rows.every(r=>r.strictlyEqual),verificationQueries,nativeMilliseconds,fastMilliseconds,nativeCpuMilliseconds,fastCpuMilliseconds,observedCpuSpeedup:nativeCpuMilliseconds/fastCpuMilliseconds,observedWallSpeedup:nativeMilliseconds/fastMilliseconds}};
  await snapshot.verify();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,summary:result.summary},null,2));
 }finally{await snapshot.cleanup();await rm(indexedRoot,{recursive:true,force:true});}
}
