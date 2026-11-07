/** Original CC0-1.0. Run from repository root: node --test workout/island/design/hoops-tall-v1/tests/*.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {verifyPackage,BONE_NAMES,CRITICAL_CLIPS} from '../source/verify.mjs';

const audit=verifyPackage();
test('every delivered file opens; all 98 original compressed clips parse with matching hashes',async()=>{
  const {metrics}=await audit;
  assert.equal(metrics.clipCount,98);
  assert.equal(metrics.clips.filter(c=>c.library==='v9').length,83);
  assert.equal(metrics.clips.filter(c=>c.library==='v8').length,15);
  assert.ok(metrics.files.length>=110);
  const licenses=await fs.readFile(new URL('../LICENSES.md',import.meta.url),'utf8');
  for(const file of metrics.files)assert.ok(licenses.includes(`[${file.path}](${file.path})`),`Missing per-file provenance: ${file.path}`);
  for(const clip of metrics.clips){assert.ok(clip.hashMatches,clip.path);assert.ok(clip.skeletonMatches,clip.path);assert.ok(clip.frames>=2,clip.path);}
});
test('all six GLBs decode; three runtime GLBs require no Draco or meshopt; validator reports no errors',async()=>{
  const {metrics,validation}=await audit;
  assert.equal(metrics.models.length,6);assert.equal(metrics.profileCount,3);
  for(const model of metrics.models){
    assert.deepEqual(model.jointNames,BONE_NAMES,model.path);assert.ok(model.hierarchyMatches,model.path);
    assert.ok(model.triangles<=12000,`${model.path}: ${model.triangles} triangles`);
    assert.ok(model.triangles>1000,model.path);assert.ok(model.finite,model.path);
    assert.ok(model.weightError<1e-3,`${model.path} weight normalization`);
    assert.ok(model.minimumWeight>=0&&model.maximumWeight<=1,model.path);assert.equal(model.invalidJoints,0,model.path);
    assert.ok(model.inverseBindMaximumError<1e-4,model.path);
    assert.ok(model.maximumNormalLengthError<.002,`${model.path}: normal unit-length error ${model.maximumNormalLengthError}`);
    if(model.format==='plain')assert.ok(!model.extensionsUsed.some(e=>/draco|meshopt/i.test(e)),model.path);
    else assert.ok(model.extensions.includes('KHR_draco_mesh_compression'),model.path);
    for(const texture of model.textures){assert.ok(texture.width<=1024&&texture.height<=1024,model.path);assert.ok(texture.width>0&&texture.height>0,model.path);}
  }
  for(const entry of validation)assert.equal(entry.errors,0,`${entry.path}: ${JSON.stringify(entry.messages)}`);
});
test('UV coordinates and primitive order are identical across all three runtime characters',async()=>{
  const {metrics}=await audit;assert.ok(metrics.sharedUVLayout);assert.ok(metrics.sharedTopology);
  for(const model of metrics.models.filter(m=>m.format==='plain'))assert.ok(model.uvs.every(uv=>uv.count>0),model.path);
});
test('actual delivered heights, arm proportions and two uniform palettes match the specification',async()=>{
  const {metrics,profiles,rig}=await audit,heights={guard:1.88,wing:1.98,center:2.08},armRatios={guard:1,wing:1.08,center:1.12};
  const armLength=p=>Math.hypot(...p.joints.find(j=>j.name==='LeftForeArm').translation)+Math.hypot(...p.joints.find(j=>j.name==='LeftHand').translation)-p.palms.LeftHand.palmPoint[1];
  const baseline=armLength(profiles.find(p=>p.id==='guard'))/1.88;
  for(const profile of profiles){
    const model=metrics.models.find(m=>m.format==='plain'&&m.profile===profile.id);
    assert.ok(Math.abs(model.bounds.height-heights[profile.id])<1e-5,`${profile.id}: ${model.bounds.height}`);
    assert.ok(Math.abs(model.bounds.minimum[1])<1e-5,`${profile.id}: sole ${model.bounds.minimum[1]}`);
    assert.equal(profile.armRatio,armRatios[profile.id]);
    assert.ok(Math.abs(armLength(profile)/heights[profile.id]/baseline-armRatios[profile.id])<1e-5,`${profile.id}: actual relative arm length`);
    for(const name of ['uniform_primary','uniform_secondary','uniform_trim'])assert.ok(model.materials.includes(name),`${profile.id}/${name}`);
  }
  assert.equal(rig.palettes.length,2);assert.notEqual(rig.palettes[0].primary,rig.palettes[1].primary);
});
test('all 98 clips on all three skeletons preserve bone lengths, rotations and original interpolation',async()=>{
  const {metrics}=await audit;
  assert.equal(metrics.allFrameCount,19650);
  assert.ok(metrics.maximumBoneLengthError<1e-5,`${metrics.maximumBoneLengthError}m`);
  assert.ok(metrics.maximumRuntimeFKError<1e-5,`${metrics.maximumRuntimeFKError}m`);
  assert.ok(metrics.maximumQuaternionNormError<1e-5,`${metrics.maximumQuaternionNormError}`);
  assert.ok(metrics.maximumSamplingError<1e-6,`${metrics.maximumSamplingError}`);
});
test('both original v9 dunks clear 3.05m rim by at least .25m with maximum pelvis lift at most1m',async()=>{
  const {metrics}=await audit;
  for(const measurement of metrics.measurements){
    assert.equal(measurement.dunks.length,2,measurement.profile);
    for(const dunk of measurement.dunks){
      assert.ok(dunk.peakPalmHeight>=3.30-1e-8,`${measurement.profile}/${dunk.clip}: ${dunk.peakPalmHeight}`);
      assert.ok(dunk.peakHipsLift<=1,`${measurement.profile}/${dunk.clip}: ${dunk.peakHipsLift}`);
      assert.ok(Math.abs(dunk.sourcePeakHipsLift-1.5486857143)<1e-6);
      assert.ok(dunk.runtimeCalibrationDifference<1e-6);assert.ok(dunk.pass);
      assert.ok(dunk.physicalPalm.minimumHeight>=3.30-1e-5,`${measurement.profile}/${dunk.clip}: actual skin palm ${dunk.physicalPalm.minimumHeight}`);
      for(const hand of Object.values(dunk.physicalPalm.hands)){
        assert.ok(hand.bindGuideDistance<1e-5,`${measurement.profile}/${dunk.clip}: palm guide matches physical mesh`);
        assert.ok(hand.guideDistance<.01,`${measurement.profile}/${dunk.clip}: palm guide skin separation ${hand.guideDistance}`);
      }
      if(dunk.clip==='dunk_two_hands')assert.deepEqual(dunk.hands,['LeftHand','RightHand']);
    }
  }
});
test('actual skinned meshes remain finite without catastrophic edge stretching on six required action clips',async()=>{
  const {metrics}=await audit;
  for(const measurement of metrics.measurements){
    assert.deepEqual(measurement.surface.map(s=>s.clip).sort(),[...CRITICAL_CLIPS].sort());
    for(const surface of measurement.surface){
      const name=`${measurement.profile}/${surface.clip}`;
      assert.ok(surface.finite,name);assert.ok(surface.edgesSampled>1000,name);
      assert.ok(surface.p99EdgeStretch<3,`${name}: p99 ${surface.p99EdgeStretch}`);
      assert.ok(surface.maximumEdgeStretch<8,`${name}: max ${surface.maximumEdgeStretch}`);
    }
  }
});
