/** Reproduce canonical contact measurements with local r160; no network. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { sampleClip, contactsAt, applyPose, enforceContacts, blendPoses } from './motion-runtime.js';

const data = JSON.parse(fs.readFileSync(new URL('../animations.json', import.meta.url)));
const actor = new THREE.Group();
const bones = {};
for (const specification of data.skeleton.bones) {
  const bone = new THREE.Bone();
  bone.name = specification.name;
  bone.position.fromArray(specification.restTranslationMeters);
  bones[bone.name] = bone;
  (specification.parent ? bones[specification.parent] : actor).add(bone);
}

let maxBefore = 0;
let maxAfter = 0;
let maxResidual = 0;
let supportedSamples = 0;
const perClip = [];
for (const clip of data.clips) {
  let clipBefore = 0; let clipAfter = 0;
  const intervals = Math.ceil(clip.duration * 120) * (clip.loop ? 2 : 1);
  for (let i = 0; i <= intervals; i++) {
    const time = i / 120;
    const pose = sampleClip(THREE, clip, time);
    actor.position.fromArray(pose.referenceRootTranslationMeters);
    applyPose(bones, pose);
    actor.updateMatrixWorld(true);
    const contacts = contactsAt(clip, time).filter(c => c.mode === 'plant' && /Foot$/.test(c.bone));
    for (const contact of contacts) {
      const sole = bones[contact.bone].localToWorld(new THREE.Vector3(0, -.08, 0));
      clipBefore = Math.max(clipBefore, sole.distanceTo(new THREE.Vector3().fromArray(contact.anchor)));
    }
    maxResidual = Math.max(maxResidual, enforceContacts(THREE, bones, contacts));
    for (const contact of contacts) {
      const sole = bones[contact.bone].localToWorld(new THREE.Vector3(0, -.08, 0));
      clipAfter = Math.max(clipAfter, sole.distanceTo(new THREE.Vector3().fromArray(contact.anchor)));
      supportedSamples++;
    }
  }
  maxBefore = Math.max(maxBefore, clipBefore);
  maxAfter = Math.max(maxAfter, clipAfter);
  perClip.push({ id: clip.id, maxBeforeIKMeters: clipBefore, maxAfterIKMeters: clipAfter });
}

// A transition sweep is deliberately separate from clip checks. It retains a
// displayed source sole anchor through the mix, then checks the actual FK sole.
// This exercises the supplied helper. It does not assert viewer integration.
let maxTransitionAnchorError = 0;
let transitionSamples = 0;
const transitionPairs = [
  ['run_2', 'run_5', .16, .106667],
  ['run_5', 'sprint', .08, .07],
  ['idle', 'short_pass', .2, 0],
  ['short_pass', 'long_pass', .25, 0],
  ['celebrate_arms_up', 'idle', 1.2, 0],
];
const transitionRows = [];
for (const [sourceId, targetId, sourceStart, targetStart] of transitionPairs) {
  const source = data.clips.find(c => c.id === sourceId);
  const target = data.clips.find(c => c.id === targetId);
  const firstPose = sampleClip(THREE, source, sourceStart);
  actor.position.fromArray(firstPose.referenceRootTranslationMeters);
  applyPose(bones, firstPose);
  actor.updateMatrixWorld(true);
  const initialContacts = contactsAt(source, sourceStart).filter(c => c.mode === 'plant' && /Foot$/.test(c.bone));
  const destinationContacts = contactsAt(target, targetStart).filter(c => c.mode === 'plant' && /Foot$/.test(c.bone));
  const held = initialContacts.map(c => {
    const destination = destinationContacts.find(d => d.bone === c.bone);
    const sourceRemaining = c.endTimeSeconds - sourceStart;
    // Phase-aligned locomotion can shorten stance during acceleration. Keep
    // the world anchor only until the EARLIEST source/destination toe-off.
    const destinationRemaining = destination ? destination.endTimeSeconds - targetStart : (target.locomotion ? 0 : Infinity);
    return { ...c,
      remaining: Math.min(sourceRemaining, destinationRemaining),
      anchor: bones[c.bone].localToWorld(new THREE.Vector3(0, -.08, 0)).toArray(),
    };
  });
  const targetOffset = new THREE.Vector3().fromArray(firstPose.referenceRootTranslationMeters)
    .sub(new THREE.Vector3().fromArray(sampleClip(THREE, target, targetStart).referenceRootTranslationMeters));
  let pairMax = 0;
  for (let i = 0; i <= 24; i++) {
    const t = i / 120;
    const a = sampleClip(THREE, source, sourceStart + t);
    const b = sampleClip(THREE, target, targetStart + t);
    b.referenceRootTranslationMeters = new THREE.Vector3().fromArray(b.referenceRootTranslationMeters).add(targetOffset).toArray();
    const mixed = blendPoses(THREE, a, b, t / .20);
    actor.position.fromArray(mixed.referenceRootTranslationMeters);
    applyPose(bones, mixed);
    actor.updateMatrixWorld(true);
    const stillHeld = held.filter(c => t <= c.remaining + 1e-8);
    enforceContacts(THREE, bones, stillHeld);
    for (const c of stillHeld) {
      const error = bones[c.bone].localToWorld(new THREE.Vector3(0, -.08, 0)).distanceTo(new THREE.Vector3().fromArray(c.anchor));
      pairMax = Math.max(pairMax, error);
      transitionSamples++;
    }
  }
  maxTransitionAnchorError = Math.max(maxTransitionAnchorError, pairMax);
  transitionRows.push({ sourceId, targetId, heldContacts: held.length, maxAnchorErrorMeters: pairMax });
}

const report = {
  schemaVersion: 1,
  threeRevision: THREE.REVISION,
  samplingHz: 120,
  supportedSamples,
  maxInterpolatedSlipBeforeIKMeters: maxBefore,
  maxAnchorErrorAfterIKMeters: maxAfter,
  maxReachResidualMeters: maxResidual,
  transitionSamples,
  maxTransitionAnchorErrorMeters: maxTransitionAnchorError,
  transitionRows,
  clips: perClip,
  motionSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('../animations.json', import.meta.url))).digest('hex'),
  runtimeSha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('./motion-runtime.js', import.meta.url))).digest('hex'),
  pass: maxAfter < .003 && maxResidual < .003 && maxTransitionAnchorError < .003,
  limitations: [
    'Canonical bones and approximate soles, not skinned vertex or collision tests.',
    'Transition sweep checks the portable helper, not an unobserved game integration.',
    'No mobile GPU or physical-device framerate claim.',
  ],
};
const braking = data.clips.find(c => c.id === 'decelerate');
const brakingRows = [];
for (const scale of [.15, .3, .5, .75, 1, 1.2]) {
  let reach = 0; let error = 0; let minimumBoot = Infinity; let contacts = 0;
  for (let i = 0; i <= 240; i++) {
    const time = i / 240 * braking.duration;
    const pose = sampleClip(THREE, braking, time);
    pose.referenceRootTranslationMeters[2] *= scale;
    actor.position.fromArray(pose.referenceRootTranslationMeters);
    applyPose(bones, pose); actor.updateMatrixWorld(true);
    const active = contactsAt(braking, time).map(c => ({ ...c, anchor: [c.anchor[0], c.anchor[1], c.anchor[2] * scale] }));
    reach = Math.max(reach, enforceContacts(THREE, bones, active));
    for (const c of active) {
      const sole = bones[c.bone].localToWorld(new THREE.Vector3(0, -.08, 0));
      error = Math.max(error, sole.distanceTo(new THREE.Vector3().fromArray(c.anchor)));
      contacts++;
    }
    for (const side of ['Left', 'Right']) for (const x of [-.05, .05]) for (const z of [-.055, .155]) {
      minimumBoot = Math.min(minimumBoot, bones[side + 'Foot'].localToWorld(new THREE.Vector3(x, -.08, z)).y);
    }
  }
  brakingRows.push({ scale, contacts, maxReachResidualMeters: reach, maxAnchorErrorMeters: error,
    minBootCornerMeters: minimumBoot, pass: reach < .003 && error < .003 && minimumBoot > -.003 });
}
const brakingReport = { schemaVersion: 1, samplingHz: 240, clipDuration: braking.duration,
  referenceDistanceMeters: 2, rows: brakingRows,
  limits: 'Canonical bones and approximate boot corners only; whole-mesh displayed floor remains separate.' };
fs.writeFileSync(new URL('./motion-decelerate-scale-metrics.json', import.meta.url), JSON.stringify(brakingReport, null, 2) + '\n');
report.pass &&= brakingRows.every(r => r.pass);
const turningRows = [];
for (const id of ['turn_left', 'turn_right']) {
  const clip = data.clips.find(c => c.id === id);
  let reach = 0; let error = 0; let minimumBoot = Infinity; let yawError = 0;
  for (let i = 0; i <= 192; i++) {
    const time = i / 240;
    const pose = sampleClip(THREE, clip, time);
    actor.position.fromArray(pose.referenceRootTranslationMeters);
    applyPose(bones, pose); actor.updateMatrixWorld(true);
    const active = contactsAt(clip, time);
    reach = Math.max(reach, enforceContacts(THREE, bones, active));
    for (const c of active) {
      const sole = bones[c.bone].localToWorld(new THREE.Vector3(0, -.08, 0));
      error = Math.max(error, sole.distanceTo(new THREE.Vector3().fromArray(c.anchor)));
      const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yawRadians || 0);
      yawError = Math.max(yawError, bones[c.bone].getWorldQuaternion(new THREE.Quaternion()).angleTo(expected));
    }
    for (const side of ['Left', 'Right']) for (const x of [-.05, .05]) for (const z of [-.055, .155]) {
      minimumBoot = Math.min(minimumBoot, bones[side + 'Foot'].localToWorld(new THREE.Vector3(x, -.08, z)).y);
    }
  }
  turningRows.push({ id, headingDeltaRadians: clip.headingDeltaRadians,
    maxReachResidualMeters: reach, maxAnchorErrorMeters: error,
    maxSupportedFootOrientationErrorRadians: yawError, minBootCornerMeters: minimumBoot,
    pass: reach < .003 && error < .003 && yawError < 1e-5 && minimumBoot > -.003 });
}
fs.writeFileSync(new URL('./motion-turn-metrics.json', import.meta.url), JSON.stringify({ schemaVersion: 1,
  samplingHz: 240, rows: turningRows,
  limits: 'Canonical bones and approximate boot corners only; whole-mesh displayed floor remains separate.' }, null, 2) + '\n');
report.pass &&= turningRows.every(r => r.pass);
const recovery = data.clips.find(c => c.id === 'get_up');
const fall = data.clips.find(c => c.id === 'fall');
let maximumPalmError = 0; let maximumKneeFlexion = 0; let palmSamples = 0;
for (let i = 0; i <= Math.round(recovery.duration * 240); i++) {
  const time = i / 240;
  const pose = sampleClip(THREE, recovery, time);
  actor.position.fromArray(pose.referenceRootTranslationMeters);
  applyPose(bones, pose); actor.updateMatrixWorld(true);
  const active = contactsAt(recovery, time);
  enforceContacts(THREE, bones, active);
  for (const contact of active.filter(c => c.mode === 'hand-support')) {
    const point = bones[contact.bone].localToWorld(new THREE.Vector3().fromArray(contact.contactPointOffsetMeters));
    maximumPalmError = Math.max(maximumPalmError, point.distanceTo(new THREE.Vector3().fromArray(contact.anchor)));
    palmSamples++;
  }
  for (const name of ['LeftLeg', 'RightLeg']) maximumKneeFlexion = Math.max(maximumKneeFlexion, bones[name].quaternion.angleTo(new THREE.Quaternion()));
}
const recoveryEntry = recovery.frames[0], fallEnd = fall.frames.at(-1);
const entryRotationError = Math.max(...data.skeleton.bones.map(bone =>
  new THREE.Quaternion().fromArray(recoveryEntry.rotations[bone.name]).normalize().angleTo(new THREE.Quaternion().fromArray(fallEnd.rotations[bone.name]).normalize())));
const entryPositionError = new THREE.Vector3().fromArray(recoveryEntry.hipsOffsetMeters).distanceTo(new THREE.Vector3().fromArray(fallEnd.hipsOffsetMeters));
const recoveryReport = { schemaVersion: 1, samplingHz: 240, duration: recovery.duration, palmSamples,
  maxPalmSupportPointErrorMeters: maximumPalmError, maximumKneeFlexionRadians: maximumKneeFlexion,
  fallToRecoveryEntryRotationErrorRadians: entryRotationError, fallToRecoveryEntryPositionErrorMeters: entryPositionError,
  pass: maximumPalmError < .003 && maximumKneeFlexion > Math.PI / 2 && entryRotationError < 1e-5 && entryPositionError < .003,
  limits: 'Authored hand support point and canonical FK only; actual mesh/floor lifting can alter support and is checked separately.' };
fs.writeFileSync(new URL('./motion-recovery-metrics.json', import.meta.url), JSON.stringify(recoveryReport, null, 2) + '\n');
report.pass &&= recoveryReport.pass;
const handSupportRows = [];
for(const clip of data.clips.filter(c=>c.contacts.some(contact=>contact.mode==='hand-support'))){
  let samples=0,maximumError=0,authoredReachResidual=0;
  for(let i=0;i<=Math.round(clip.duration*240);i++){
    const time=i/240,pose=sampleClip(THREE,clip,time);
    actor.position.fromArray(pose.referenceRootTranslationMeters);applyPose(bones,pose);actor.updateMatrixWorld(true);
    const active=contactsAt(clip,time);enforceContacts(THREE,bones,active);
    for(const contact of active.filter(c=>c.mode==='hand-support')){
      const point=bones[contact.bone].localToWorld(new THREE.Vector3().fromArray(contact.contactPointOffsetMeters));
      maximumError=Math.max(maximumError,point.distanceTo(new THREE.Vector3().fromArray(contact.anchor)));samples++;
    }
  }
  authoredReachResidual=clip.authoredLimbReachResidualMeters||0;
  handSupportRows.push({id:clip.id,samples,maxSupportPointErrorMeters:maximumError,
    maxAuthoredLimbReachResidualMeters:authoredReachResidual,pass:maximumError<.003&&authoredReachResidual<.003});
}
const authoredReachRows=data.clips.map(clip=>({id:clip.id,maxAuthoredLimbReachResidualMeters:
  clip.authoredLimbReachResidualMeters||0}));
const handSupportReport={schemaVersion:1,samplingHz:240,motionSha256:report.motionSha256,runtimeSha256:report.runtimeSha256,
  rows:handSupportRows,authoredReachRows,pass:handSupportRows.every(row=>row.pass)&&authoredReachRows.every(row=>row.maxAuthoredLimbReachResidualMeters<.003),
  limits:'Authored hand-support markers and custom limb reach, canonical FK only. Runtime whole-mesh floor adjustment and real pressure support are separate.'};
fs.writeFileSync(new URL('./motion-hand-support-metrics.json',import.meta.url),JSON.stringify(handSupportReport,null,2)+'\n');
report.pass&&=handSupportReport.pass;
const ballRows = [];
for (const clip of data.clips) for (const contact of clip.ballContacts || []) {
  const pose = sampleClip(THREE, clip, contact.timeSeconds);
  actor.position.fromArray(pose.referenceRootTranslationMeters);
  applyPose(bones, pose); actor.updateMatrixWorld(true);
  const point = bones[contact.bone].localToWorld(new THREE.Vector3().fromArray(contact.localPointMeters));
  const error = point.distanceTo(new THREE.Vector3().fromArray(contact.pointMeters));
  const radiusError = Math.abs(new THREE.Vector3().fromArray(contact.pointMeters).distanceTo(
    new THREE.Vector3().fromArray(contact.ballCenterMeters)) - (contact.ballRadiusMeters || .11));
  ballRows.push({ id: clip.id, bone: contact.bone, timeSeconds: contact.timeSeconds,
    pointErrorMeters: error, sphereRadiusErrorMeters: radiusError, pass: error < 1e-5 && radiusError < 1e-5 });
}
const ballReport = { schemaVersion: 1, rows: ballRows, pass: ballRows.every(row => row.pass),
  limits: 'Authored ball contact metadata checked against canonical FK; presentation trajectories and gameplay collisions are separate.' };
fs.writeFileSync(new URL('./motion-ball-contact-metrics.json', import.meta.url), JSON.stringify(ballReport, null, 2) + '\n');
report.pass &&= ballReport.pass;
fs.writeFileSync(new URL('./motion-runtime-metrics.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  threeRevision: report.threeRevision,
  supportedSamples,
  maxAnchorErrorAfterIKMeters: maxAfter,
  transitionSamples,
  maxTransitionAnchorErrorMeters: maxTransitionAnchorError,
  pass: report.pass,
}));
if (!report.pass) process.exitCode = 1;
