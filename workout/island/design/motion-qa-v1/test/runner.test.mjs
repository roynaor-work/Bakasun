// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {compareLibraries,generate} from '../run.mjs';

const clip=(id,motionId,score,profile)=>({id,motionId,score,profile,coverage:1,
  metrics:{footSliding:{value:score/100}},reasons:[],htmlPath:`clips/${id}.html`});
test('comparison joins version nine bare ids to version ten profile motion ids',()=>{
  const rows=compareLibraries([
    {id:'hoops-v9',sport:'hoops',version:'v9',clips:[clip('run_reference','run',80),clip('removed','removed',70)]},
    {id:'hoops-v10',sport:'hoops',version:'v10',clips:[clip('guard/run','run',60,'guard'),
      clip('wing/run','run',90,'wing'),clip('guard/added','added',50,'guard')]},
  ]);
  assert.equal(rows.find(row=>row.id==='guard/run').delta,-20);
  assert.equal(rows.find(row=>row.id==='wing/run').delta,10);
  assert.equal(rows.find(row=>row.id==='guard/run').before.id,'run_reference');
  assert.equal(rows.find(row=>row.id==='guard/run').after.id,'guard/run');
  assert.equal(rows.find(row=>row.id==='guard/removed').after,null);
  assert.equal(rows.find(row=>row.id==='wing/removed').after,null);
  assert.equal(rows.find(row=>row.id==='guard/added').before,null);
  assert.equal(rows.filter(row=>row.delta!==null).length,2);
  assert.equal(rows.length,5);
});
test('comparison never pairs different sports or fabricates absent versions',()=>{
  assert.deepEqual(compareLibraries([
    {id:'old',sport:'soccer',version:9,clips:[clip('run','run',90)]},
    {id:'next',sport:'hoops',version:10,clips:[clip('run','run',80)]},
  ]),[]);
});
test('unknown library selection fails before writing any output',async()=>{
  const out=fileURLToPath(new URL(`../.cache/rejected-selection-${process.pid}`,import.meta.url));
  await assert.rejects(generate({only:['does-not-exist'],out,writeMarkdown:false}),/Unknown library/);
  await assert.rejects(stat(out),{code:'ENOENT'});
});
