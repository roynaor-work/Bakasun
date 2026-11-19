/** Numeric regression of the query index, using the native project() function text.
 * This synthetic track is not a game balance simulation: it isolates rounding
 * when bestD-epsilon loses precision at a large query coordinate. Repeating the
 * same unhinted query changes the index's valid upper-bound seed, not the answer.
 * node workout/island/design/balance-sim-v1/tools/regress-racing-project.mjs
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createSnapshot,sha256} from './snapshot.mjs';
import {accelerateRacingProjection} from './exact-racing-project.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../../..'),snapshot=await createSnapshot(root);
try{
 const source=await readFile(join(snapshot.sourceRoot,'workout/island/minigames/racing-tracks.mjs'),'utf8');
 const start=source.indexOf('  function project(x, z, hint) {'),end=source.indexOf('\n  const offset =',start);
 assert.ok(start>=0&&end>start,'Native project function boundary');
 const functionText=source.slice(start,end),N=1304,length=2*N,width=16;
 const points=Array.from({length:N},(_,i)=>({x:0,y:0,z:Math.sqrt(2-i*2**-13),s:i})),distances=points.map(p=>p.s);
 const sample=s=>({x:0,y:0,z:0,s,heading:0,width,normal:{x:1,y:0,z:0},tangent:{x:0,y:0,z:1}});
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=(v,L)=>((v%L)+L)%L;
 const project=Function('points','length','width','distances','sample','clamp','wrap',functionText+'\nreturn project;')(points,length,width,distances,sample,clamp,wrap);
 const track={points,length,width,sample,project},expected=project(1e6,0),index=accelerateRacingProjection(track,{verify:true}),answers=[];
 for(let i=0;i<4;i++){const actual=track.project(1e6,0);assert.deepEqual(actual,expected);answers.push(actual);}
 assert.equal(expected.s,1303,'Auditor reference winner');
 const result={schemaVersion:1,baseCommit:snapshot.manifest.baseCommit,sourceDigest:snapshot.manifest.sourceDigest,helperSha256:sha256(await readFile(join(here,'exact-racing-project.mjs'))),
   nativeProjectFunctionSha256:sha256(functionText),case:{points:N,length,width,pointFormula:'{x:0,y:0,z:sqrt(2-i*2**-13),s:i}',query:{x:1e6,z:0,hint:null},repeats:4},
   explanation:'The superseded fixed128 guard picked s1302 on the second query while the native function picked s1303. A subtraction near1e12 extends an epsilon tie by rounding. The count-scaled guard covers accumulated rounding and retains the native answer.',
   expected,answers,stats:index.stats,allStrictlyEqual:true,gameplayEvidence:false};
 await snapshot.verify();const output=join(here,'../data/racing-project-regression.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,winner:expected.s,verified:index.stats.verified,allStrictlyEqual:true}));
}finally{await snapshot.cleanup();}
