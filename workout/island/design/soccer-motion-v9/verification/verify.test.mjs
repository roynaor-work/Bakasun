/** Acceptance tests for v9 only. Run: node --test verification/verify.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {measureLibrary,limits} from './measure.mjs';
import {clips,bones,transitions} from '../runtime/catalog.mjs';
import {createStateMachine} from '../runtime/state-machine.mjs';
import {auditBall,auditSkinEvidence} from './audit-ball.mjs';

const required=[
 'idle_relaxed','idle_scan','idle_weight_shift','walk','jog','run','sprint','run_brake','turn_in_place','cut_45','cut_90','cut_135','cut_180','run_backward','run_lateral',
 ...['chest','thigh','inside','outside'].flatMap(surface=>['standing','running'].map(mode=>`first_touch_${surface}_${mode}`)),
 'dribble_fast','dribble_cut','body_feint','spin_kick','volley_kick','jump_header','running_pass','long_shot','through_pass',
 'slide_miss','quick_getup','goalkeeper_ready','goalkeeper_roll','goalkeeper_short_pass','goalkeeper_overarm_throw','goalkeeper_catch_high','goalkeeper_catch_low','goalkeeper_punch','goalkeeper_getup',
 'celebrate_hop','celebrate_clap','celebrate_pump','celebrate_turn','disappointed','throw_in',
];
test('48 original actions cover every requested category exactly once',()=>{
 assert.equal(clips.length,48);assert.equal(new Set(clips.map(c=>c.id)).size,48);
 assert.deepEqual(clips.map(c=>c.id).sort(),required.sort());assert.equal(bones.length,18);
});
const measured=await measureLibrary({write:true,evidence:true});
test('every shipped GLB decodes through the real local GLTFLoader and Draco WASM',()=>{
 assert.equal(measured.clips.length,48);assert.ok(measured.clips.every(c=>c.loader==='GLTFLoader r160 + Draco WASM'));
 assert.ok(measured.clips.every(c=>c.bytes<=limits.fileBytes&&c.dracoPrimitiveCount>0&&c.boneCount===18));
});
for(const clip of measured.clips)test(`${clip.id}: independent native motion acceptance`,()=>{
 assert.deepEqual(clip.failures,[],JSON.stringify(clip.failures,null,2));
});
test('slide_miss never crosses either hand or elbow over the pelvis midsagittal plane',()=>{
 assert.equal(measured.clips.find(c=>c.id==='slide_miss').crossedArmFrames,0);
});
test('the supported run-to-brake entry has continuous pose and velocity without an airborne frame',()=>{
 assert.ok(measured.runBrakeTransition?.pass,JSON.stringify(measured.runBrakeTransition,null,2));
});
test('slide_miss ends in the exact authored quick_getup entry pose, with travel carried by the host',()=>{
 assert.ok(measured.slideGetupTransition?.pass,JSON.stringify(measured.slideGetupTransition,null,2));
});
test('no two v9 animations are identical, and no v8 animation has been copied',()=>{
 assert.deepEqual(measured.duplicatePairs,[]);assert.deepEqual(measured.v8DuplicatePairs,[]);
});
test('all 48 clips have an actual 844 × 390 PNG contact sheet',()=>{
 assert.equal(measured.contactSheets.length,48);assert.deepEqual(measured.contactSheets.filter(s=>!s.pass),[]);
});
test('every contact/release marker retains the v8 event shape and a canonical target',()=>{
 for(const c of clips){for(const e of c.events){assert.ok(Number.isFinite(e.time)&&e.time>=0&&e.time<=c.duration);assert.ok(bones.some(b=>b.name===e.bone));assert.equal(e.local.length,3);assert.equal(e.position.length,3);assert.ok([...e.local,...e.position].every(Number.isFinite));}
 if(c.category==='ball'&&c.id!=='body_feint'){assert.ok(c.events.some(e=>e.type==='contact'),c.id);assert.ok(c.events.some(e=>e.type==='release'),c.id);}}
});
test('public ball paths stay on the floor, meet every physical cue and have bounded continuous speed',()=>{
 const result=auditBall(clips);assert.equal(result.clips.length,48);
 assert.deepEqual(result.clips.filter(c=>!c.pass),[]);
});
test('every contact action includes dense actual skinned-surface evidence for the ball',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('./build.json',import.meta.url),'utf8')),result=auditSkinEvidence(manifest,clips);
 assert.deepEqual(result.failures,[]);
});
test('transition map names real clips and has the run/brake and slide/get-up recovery edges',()=>{
 for(const e of transitions){assert.ok(clips.some(c=>c.id===e.from),e.from);assert.ok(clips.some(c=>c.id===e.to),e.to);assert.ok(e.blend>=0);}
 for(const [from,to] of [['run','run_brake'],['run_brake','idle_relaxed'],['slide_miss','quick_getup'],['goalkeeper_getup','goalkeeper_ready']])assert.ok(transitions.some(e=>e.from===from&&e.to===to),`${from}→${to}`);
});
test('a stop requested between contacts waits for the matching left plant and enters the brake at phase zero',()=>{
 const machine=createStateMachine({initialState:'run'}),run=clips.find(c=>c.id==='run');
 const request=machine.transition('run_brake',{trigger:'stop',at:.05});
 assert.equal(request.ok,true);assert.equal(request.pending,true);assert.equal(machine.state,'run');
 const expected=run.events.filter(e=>e.type==='plant'&&e.bone==='LeftFoot'&&e.time>=.05).map(e=>e.time).sort((a,b)=>a-b)[0]??run.duration;
 assert.equal(request.queued.at,expected);machine.tick(expected-.001);assert.equal(machine.state,'run');
 const completed=machine.tick(expected);assert.equal(completed.pending,false);assert.equal(machine.state,'run_brake');assert.equal(machine.time,0);
});
test('stop aliases choose the brake, and a wrapped playback clock preserves the queued phase and overshoot',()=>{
 for(const trigger of [undefined,'stop','play:run_brake']){const machine=createStateMachine('run');const result=machine.transition('run_brake',{at:.07,...(trigger?{trigger}:{})});assert.equal(result.pending,true);assert.equal(result.queued.to,'run_brake');assert.equal(result.queued.at,.6);}
 const machine=createStateMachine('run');machine.tick(.07);const result=machine.request('stop');assert.equal(result.queued.to,'run_brake');machine.tick(.59);assert.equal(machine.state,'run');machine.tick(.01);assert.equal(machine.state,'run_brake');assert.ok(Math.abs(machine.time-.01)<.000001);
 const later=createStateMachine('run');later.tick(.59);later.tick(.01);const queued=later.request('stop');assert.ok(Math.abs(queued.queued.at-1.2)<.000001);
});
test('invalid transitions and playback times do not silently alter presentation state',()=>{
 const machine=createStateMachine('idle_relaxed');
 assert.equal(machine.transition('unknown_clip').reason,'unknown-state');assert.equal(machine.state,'idle_relaxed');
 assert.throws(()=>machine.tick(NaN),TypeError);assert.throws(()=>createStateMachine('unknown_clip'),RangeError);
});
test('a missed slide must use the authored get-up rather than blending directly to standing',()=>{
 const machine=createStateMachine('slide_miss'),duration=clips.find(c=>c.id==='slide_miss').duration;
 assert.deepEqual([...new Set(machine.legalNext().map(e=>e.to))],['quick_getup']);
 assert.equal(machine.transition('idle_relaxed',{trigger:'finished',at:duration}).reason,'edge-not-listed');
 assert.equal(machine.transition('quick_getup',{trigger:'recover',at:duration}).ok,true);
 assert.equal(machine.state,'quick_getup');
});
test('each clip has an original-source and CC0 license entry',async()=>{
 const licenses=await fs.readFile(new URL('../LICENSES.md',import.meta.url),'utf8');
 assert.match(licenses,/CC0-1\.0/);for(const c of clips)assert.ok(licenses.includes(c.id),c.id);
});
test('browser evidence loaded every native clip with the original images',async()=>{
 const evidence=JSON.parse(await fs.readFile(new URL('./browser-evidence.json',import.meta.url),'utf8'));
 const ids=evidence.clips?.map(c=>typeof c==='string'?c:c.id)||evidence.loadedClips||[];
 assert.deepEqual([...new Set(ids)].sort(),clips.map(c=>c.id).sort());
 assert.deepEqual(evidence.errors||[],[]);
 assert.deepEqual(evidence.failedRequests||[],[]);
 assert.equal(evidence.records.length,48);
 for(const clip of clips){const record=evidence.records.find(r=>r.id===clip.id);assert.ok(record,clip.id);const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const glb=await fs.readFile(new URL(`../runtime/${clip.asset}`,import.meta.url)),sheet=await fs.readFile(new URL(`./contact-sheets/${clip.id}.png`,import.meta.url));
  assert.equal(record.glbSHA256,sha(glb),`${clip.id}: screenshot evidence references an older GLB`);assert.equal(record.sheetSHA256,sha(sheet),`${clip.id}: sheet changed after browser capture`);
  assert.equal(record.width,844);assert.equal(record.height,390);assert.ok(record.times.length>=4,clip.id);
 }
});
test('the browser demonstrates a native contact-aligned run-to-brake transition',async()=>{
 const evidence=JSON.parse(await fs.readFile(new URL('./browser-evidence.json',import.meta.url),'utf8')),demo=evidence.brakeDemo;
 assert.ok(demo,'Missing native browser brake demonstration');assert.equal(demo.beforeState,'run');assert.equal(demo.afterState,'run_brake');assert.equal(demo.alignBone,'LeftFoot');
 assert.ok(demo.switchedAt>=demo.requestAt);assert.ok(demo.worldPositionJumpM<=.000001);assert.ok(demo.maxBonePositionJumpM<=.00001);assert.ok(demo.maxBoneAngleJumpDeg<=.005);assert.ok(demo.velocityDifferenceMps<=.01);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(demo.sourceGLBSHA256,sha(await fs.readFile(new URL('../runtime/clips/run.glb',import.meta.url))));
 assert.equal(demo.targetGLBSHA256,sha(await fs.readFile(new URL('../runtime/clips/run_brake.glb',import.meta.url))));
});
