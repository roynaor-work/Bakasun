import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CATALOG,CANONICAL_BONE_NAMES} from '../runtime/catalog.mjs';
import {loadClip,disposeClip,disposeRuntime} from '../runtime/library.mjs';
import {measureClip,measureAll,LIMITS} from '../source/measure.mjs';
const REQUIRED_IDS=`idle_relaxed idle_relaxed_ball idle_weight_shift idle_weight_shift_ball idle_ready idle_ready_ball walk walk_ball jog jog_ball run run_ball sprint sprint_ball brake brake_ball cut_45_left cut_45_left_ball cut_45_right cut_45_right_ball cut_90_left cut_90_left_ball cut_90_right cut_90_right_ball cut_135_left cut_135_left_ball cut_135_right cut_135_right_ball cut_180_left cut_180_left_ball cut_180_right cut_180_right_ball pivot_reverse_left pivot_reverse_right dribble_walk_left dribble_walk_right dribble_forward dribble_backward dribble_left dribble_right dribble_forward_left dribble_forward_right dribble_backward_left dribble_backward_right dribble_crossover_left dribble_crossover_right dribble_between_legs_left dribble_between_legs_right dribble_hesitation_left dribble_hesitation_right euro_left euro_right layup_left layup_right floater jump_shot free_throw three_point dunk_one_hand dunk_two_hands screen_set basket_cut_left basket_cut_right defensive_stance defensive_slide_left defensive_slide_right closeout block_two_hands steal_poke pass_deflect_left pass_deflect_right rebound_jump rebound_land loose_ball_dive_left loose_ball_dive_right get_up_front get_up_back celebrate_fist celebrate_jump celebrate_chest celebrate_point disappointed hands_on_hips`.split(' ');

test('every delivered 30 Hz GLB really decodes with Draco and passes the independent naturalness audit',async()=>{
  const report=await measureAll();
  assert.equal(report.clipCount,CATALOG.length);
  assert.deepEqual(CATALOG.map(c=>c.id).sort(),[...REQUIRED_IDS].sort(),'every requested performance and directional variant is present');
  assert.equal(report.passed,report.clipCount,report.clips.filter(r=>!r.pass).map(r=>r.id+': '+r.errors.join('; ')).join('\n'));
  assert.deepEqual(report.duplicates,[]);
  assert.deepEqual(report.baselineComparisons,{motion2:9,v8:15});
  for(const r of report.clips){
    assert.ok(r.sampleCount>=Math.ceil(r.durationSeconds*120)+1,r.id+' measured at 120 Hz');
    assert.ok(r.glbBytes<=1_500_000,r.id+' stays under 1.5MB');
    assert.ok(r.maxGlbJsonPositionErrorMeters<=LIMITS.decodedPositionMeters,r.id+' decoded FK agrees with metadata');
    assert.ok(r.maxPlantedFootDriftMeters<=.02,r.id+' measured whole-window sole drift');
    assert.ok(r.nearestV8Performance.rmsMeters>=.0001,r.id+' is an original performance additional to v8');
    assert.ok(r.nearestMotion2Performance.rmsMeters>=.0001,r.id+' differs from all nine original motion2 performances');
  }
});

test('GLBs contain exactly the canonical 18 bones, 30 Hz tracks and Draco-compressed geometry',async()=>{
  try{for(const meta of CATALOG){const loaded=await loadClip(meta.id,{format:'glb'});try{
    const json=loaded.gltf?.parser?.json;
    assert.ok(json.extensionsUsed?.includes('KHR_draco_mesh_compression'),meta.id+' requires real Draco');
    assert.ok(json.meshes.some(m=>m.primitives.some(p=>p.extensions?.KHR_draco_mesh_compression)),meta.id+' has compressed primitives');
    const names=loaded.animation.tracks.filter(t=>t.name.endsWith('.quaternion')&&t.name!=='Ball.quaternion').map(t=>t.name.slice(0,-11));
    assert.deepEqual(names.sort(),[...CANONICAL_BONE_NAMES].sort());
    for(const track of loaded.animation.tracks){
      assert.equal(track.times.length,Math.round(meta.durationSeconds*30)+1,meta.id+' '+track.name+' is baked at 30 Hz');
      for(let i=0;i<track.times.length;i++)assert.ok(Math.abs(track.times[i]-i/30)<2e-6,meta.id+' uniform 30 Hz time '+i);
    }
    for(const e of loaded.data.events){assert.equal(e.domain,'presentation');assert.ok(Math.abs(e.atSeconds-e.time*meta.durationSeconds)<1e-6);}
  }finally{disposeClip(loaded);}}}finally{await disposeRuntime();}
});

async function withClip(id,fn){const loaded=await loadClip(id,{format:'glb'});try{return await fn(loaded);}finally{disposeClip(loaded);await disposeRuntime();}}
test('negative control: moving only the decoded ball by 20cm fails actual contact and GLB/JSON agreement',async()=>{
  await withClip('idle_ready_ball',loaded=>{
    loaded.animation=loaded.animation.clone();
    const track=loaded.animation.tracks.find(t=>t.name==='Ball.position');assert.ok(track);
    for(let i=0;i<track.values.length;i+=3)track.values[i]+=.2;
    const r=measureClip(loaded);
    assert.ok(r.maxGlbJsonPositionErrorMeters>.19);
    assert.ok(r.maxHoldSurfaceErrorMeters>.02);
    assert.equal(r.pass,false);
  });
});
test('negative control: a 12cm decoded pelvis drift fails planted support even if JSON and its markers claim perfection',async()=>{
  await withClip('idle_ready',loaded=>{
    loaded.animation=loaded.animation.clone();
    const track=loaded.animation.tracks.find(t=>t.name==='Hips.position');assert.ok(track);
    const n=track.values.length/3;for(let i=0;i<n;i++)track.values[i*3]+=.12*Math.sin(Math.PI*i/(n-1));
    const r=measureClip(loaded);
    assert.ok(r.maxPlantedFootDriftMeters>.08);
    assert.ok(r.errors.includes('planted foot drift exceeds 2 cm'));
  });
});
test('negative control: frozen decoded running legs fail independently detected step cadence',async()=>{
  await withClip('run',loaded=>{
    loaded.animation=loaded.animation.clone();
    for(const track of loaded.animation.tracks)if(/^(Left|Right)(UpLeg|Leg|Foot)\.quaternion$/.test(track.name)){
      const first=Array.from(track.values.slice(0,4));for(let i=0;i<track.values.length;i++)track.values[i]=first[i%4];
    }
    const hips=loaded.animation.tracks.find(t=>t.name==='Hips.position');for(let i=1;i<hips.values.length;i+=3)hips.values[i]=hips.values[1];
    const r=measureClip(loaded);
    assert.ok(r.cadenceErrorPercent>10,'detector cannot trust declared cadence');
    assert.ok(r.errors.includes('cadence differs from speed target by over 10%'));
  });
});
test('negative controls: an inverted wrist and a broken decoded loop are measured independently',async()=>{
  await withClip('idle_ready',loaded=>{
    const original=loaded.animation;
    loaded.animation=original.clone();
    const hand=loaded.animation.tracks.find(t=>t.name==='RightHand.quaternion');
    for(let i=0;i<hand.values.length;i++)hand.values[i]=i%4===0?1:0;
    const badWrist=measureClip(loaded);
    assert.ok(badWrist.maxWristSwingDegrees>179);
    assert.ok(badWrist.anatomicalViolations.some(v=>v.key==='RightHand:wrist swing'));
    loaded.animation=original.clone();
    const hips=loaded.animation.tracks.find(t=>t.name==='Hips.position');hips.values[hips.values.length-3]+=.04;
    const badLoop=measureClip(loaded);
    assert.ok(badLoop.loopPoseMaxMeters>.039);
    assert.ok(badLoop.errors.includes('loop poses do not close exactly'));
  });
});
test('negative control: impossible knee axial twist fails even when decoded GLB and JSON agree and foot pose is preserved',async()=>{
  await withClip('idle_ready',loaded=>{
    const product=(a,b)=>{const[x,y,z,w]=a,[X,Y,Z,W]=b;return[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];};
    const originalAnimation=loaded.animation,originalData=loaded.data;
    loaded.animation=loaded.animation.clone();loaded.data=structuredClone(loaded.data);
    const knee=loaded.animation.tracks.find(t=>t.name==='LeftLeg.quaternion'),foot=loaded.animation.tracks.find(t=>t.name==='LeftFoot.quaternion');
    for(let i=0;i<loaded.data.keyframes.length;i++){
      const f=loaded.data.keyframes[i];f.rotations.LeftLeg=product(f.rotations.LeftLeg,[0,1,0,0]);f.rotations.LeftFoot=product([0,-1,0,0],f.rotations.LeftFoot);
      knee.values.set(f.rotations.LeftLeg,i*4);foot.values.set(f.rotations.LeftFoot,i*4);
    }
    const r=measureClip(loaded);
    assert.ok(r.maxGlbJsonPositionErrorMeters<LIMITS.decodedPositionMeters,'negative control remains a matching GLB/JSON pair');
    assert.ok(r.maxGlbJsonAngleErrorRadians<LIMITS.decodedAngleRadians);
    assert.ok(r.maxKneeOffHingeDegrees>179);
    assert.ok(r.anatomicalViolations.some(v=>v.key==='LeftLeg:off-hinge rotation'));
    assert.equal(r.pass,false);
    loaded.animation=originalAnimation.clone();loaded.data=structuredClone(originalData);
    const reversedFoot=loaded.animation.tracks.find(t=>t.name==='LeftFoot.quaternion');
    for(let i=0;i<loaded.data.keyframes.length;i++){const f=loaded.data.keyframes[i];f.rotations.LeftFoot=product(f.rotations.LeftFoot,[0,1,0,0]);reversedFoot.values.set(f.rotations.LeftFoot,i*4);}
    const ankle=measureClip(loaded);
    assert.ok(ankle.maxGlbJsonPositionErrorMeters<LIMITS.decodedPositionMeters);
    assert.ok(ankle.maxAnkleAxialTwistDegrees>150);
    assert.ok(ankle.anatomicalViolations.some(v=>v.key==='LeftFoot:ankle axial twist'));
  });
});
test('negative control: matching GLB/JSON projectile shifted after release misses the unchanged fixed rim',async()=>{
  await withClip('free_throw',loaded=>{
    loaded.animation=loaded.animation.clone();loaded.data=structuredClone(loaded.data);
    const release=loaded.data.events.find(e=>e.name==='release').time,track=loaded.animation.tracks.find(t=>t.name==='Ball.position');
    for(let i=0;i<loaded.data.keyframes.length;i++)if(loaded.data.keyframes[i].time>release+1e-8){loaded.data.keyframes[i].ballPositionMeters[0]+=.3;track.values[i*3]+=.3;}
    const r=measureClip(loaded);
    assert.ok(r.maxGlbJsonPositionErrorMeters<LIMITS.decodedPositionMeters);
    assert.ok(r.rimCrossing?.rimOffsetMeters>.25);
    assert.ok(r.errors.includes('released ball misses the fixed rim on its descending crossing'));
  });
});
test('audit source is independent from the procedural author and build pipeline',async()=>{
  const source=await readFile(new URL('../source/measure.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from\s+['"]\.\/(?:authoring|locomotion|attack|actions|build)\.mjs['"]/);
  assert.match(source,/new THREE\.AnimationMixer/);
});
