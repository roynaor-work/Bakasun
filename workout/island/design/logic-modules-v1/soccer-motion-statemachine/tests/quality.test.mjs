import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS,TRANSITIONS,auditGraph,auditClip,DIAGNOSTIC_THRESHOLDS,getClip,sampleClip,poseDifference } from '../src/index.mjs';
import { readFile } from 'node:fs/promises';

test('real source clips: all89 original track sets checked at native keys and120Hz',()=>{
 const rows=CLIPS.map(c=>auditClip(c));
 assert.equal(rows.length,89);
 for(const row of rows){assert.ok(row.samples>20,row.clipId);assert.ok(row.floorPass,`${row.clipId}: ${row.minimum}`);if(row.loopClosure)assert.ok(row.loopClosure.maxJointMeters<.002,`${row.clipId} loop seam`);}
 // Existing action endpoints contain a real side-lying keeper pose, not ready.
 const c=getClip('soccer-tackle-keeper-v2:catch_chest'),recovery=getClip('soccer-tackle-keeper-v2:getup_keeper_left');
 assert.ok(poseDifference(c,sampleClip(c,c.duration),sampleClip(recovery,0)).maxJointMeters<1e-6);
});
for(const speedMps of [null,2.6,4.5,7.2])test(`all${TRANSITIONS.length} permitted transition geometries at ${speedMps??'native'} speed`,async()=>{
 const result=auditGraph(speedMps===null?{}:{speedMps});
 assert.equal(result.transitions.length,TRANSITIONS.length);assert.equal(result.summary.adaptedFailures,0);
 assert.ok(result.summary.hardCutFailures>0,'must expose raw source pose differences');
 assert.ok(result.summary.rawFloorFailures>0,'must expose raw blend penetration');
 for(const row of result.transitions){
  assert.ok(row.samples>0);assert.ok(Number.isFinite(row.hardCutJointMeters));
  assert.ok(row.correctedFloorMinimum>=-DIAGNOSTIC_THRESHOLDS.floorPenetrationMeters,row.transitionId);
  assert.ok(row.blendStepJointMeters<=DIAGNOSTIC_THRESHOLDS.blendStepJointMeters,row.transitionId);
  assert.ok(row.maxAppliedLiftMeters<=.12+1e-12,row.transitionId);
 }
 const saved=JSON.parse(await readFile(new URL('../data/transition-audit.json',import.meta.url),'utf8')).profiles.find(p=>p.speedMps===speedMps);
 assert.deepEqual(result.summary,saved.summary,'saved real-data evidence must match current graph and sampler');
});
