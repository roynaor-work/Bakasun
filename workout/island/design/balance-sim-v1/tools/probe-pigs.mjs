#!/usr/bin/env node
/** Verify that reusing a Chromium process does not change seed outcomes after a different wave. */
import assert from 'node:assert/strict';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import {createSnapshot} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
import {runTrial,cleanup} from './adapters/pigs.mjs';
const here=dirname(fileURLToPath(import.meta.url)),snapshot=await createSnapshot(resolve(here,'../../../../..'));
const rows=[],sequence=[[1,7],[5,42],[20,1701],[1,7],[5,42]],profile=profiles.find(p=>p.id==='skilled');
try{for(const [stage,seed] of sequence){const result=await runTrial({sourceRoot:snapshot.sourceRoot,stage,seed,profile});rows.push({stage,seed,result});console.log(stage,seed,result.outcome,result.seconds);}
 assert.deepEqual(rows[0],rows[3]);assert.deepEqual(rows[1],rows[4]);
 const originalsUnchanged=await snapshot.verify();assert.equal(originalsUnchanged,true);
 const output={baseCommit:snapshot.manifest.baseCommit,sourceDigest:snapshot.manifest.sourceDigest,profile:profile.id,sequence,checks:{repeatStage1AfterDifferentStageAndSeed:true,repeatStage5AfterDifferentStageAndSeed:true,originalsUnchanged},rows};
 await mkdir(join(here,'../data'),{recursive:true});await writeFile(join(here,'../data/pigs-replay-verification.json'),JSON.stringify(output)+'\n');
}finally{await cleanup();await snapshot.cleanup();}
