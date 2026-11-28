// SPDX-License-Identifier: CC0-1.0
import {stopSprint, stopRun, stopJog, slideFast, slideRecoverForward, slideRecoverBack, cutPlant, pivotStop, startFromStand, SLIDE_V, SLIDE_T} from './author.mjs';

const ev = (type, time) => ({type, event: type, time: +time.toFixed(6), frame: Math.round(time * 30)});
const idleExit = {reference: 'idle_relaxed', phase: 0, blendSeconds: .2, curve: 'cubic-hermite-C1'};
const runEntry = {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1'};
const tag = v => String(v).replace('.', 'p');

export const CLIPS = [];
for (const v of [4.5, 5.5, 6.5, 7.5, 9]) {
  CLIPS.push({
    id: `hoops_stop_sprint_${tag(v)}`, family: 'hoops-stop-sprint', label: 'עצירת קפיצה מספרינט', nominal: v === 7.5, variant: {entrySpeedMps: v},
    make: () => stopSprint(v), core: [0, .55], entry: runEntry, exit: idleExit,
    events: spec => [ev('brake', .16 * spec.meta.Ts / .495), ev('land', .36 * spec.meta.Ts / .495), ev('stop', spec.meta.Ts), ev('stand', .55)],
    notes: 'Last cruise stride, short hop, both feet land ahead of the pelvis and absorb with a deep knee bend; the pelvis stops over the feet.',
  });
}
for (const v of [3, 4, 5, 6]) {
  CLIPS.push({
    id: `hoops_stop_run_${tag(v)}`, family: 'hoops-stop-run', label: 'עצירה מריצה', nominal: v === 5, variant: {entrySpeedMps: v},
    make: () => stopRun(v), core: [0, .46], entry: runEntry, exit: idleExit,
    events: spec => [ev('brake', .12 * spec.meta.Ts / .4), ev('land', .31 * spec.meta.Ts / .4), ev('stop', spec.meta.Ts), ev('stand', .46)],
    notes: 'A braking stride with the foot planted ahead, a second planting step, pelvis dropped and leaning forward while it stops, then rising to the ready stance.',
  });
}
for (const v of [1.5, 2, 2.75, 3.5]) {
  CLIPS.push({
    id: `hoops_stop_jog_${tag(v)}`, family: 'hoops-stop-jog', label: 'האטה מג׳וג לעמידה', nominal: v === 2.75, variant: {entrySpeedMps: v},
    make: () => stopJog(v), core: [0, .42], entry: runEntry, exit: idleExit,
    events: spec => [ev('brake', .21 * spec.meta.Ts / .41), ev('stop', spec.meta.Ts), ev('stand', .42)],
    notes: 'Two shortening steps, the second lands on the final stance foot, the other closes in; arm swing fades out.',
  });
}
CLIPS.push({
  id: 'hoops_defensive_slide_fast_left', family: 'hoops-defensive-slide-fast', label: 'החלקה הגנתית מהירה שמאלה', nominal: true, loop: true, variant: {direction: 'left', referenceSpeedMps: SLIDE_V, rateRange: [.6, 1.4], speedRangeMps: [2.2, 5]},
  make: slideFast, core: [0, SLIDE_T], entry: {reference: 'idle_relaxed', phase: 0, blendSeconds: .2, curve: 'cubic-hermite-C1', note: 'the game defensive_stance is not part of this package; idle_relaxed is the measured stand-in'}, exit: {reference: 'idle_relaxed', phase: 0, blendSeconds: .2, curve: 'cubic-hermite-C1'},
  endIdle: false, events: () => [ev('step_left', .0), ev('step_right', .2), ev('step_left', .4), ev('step_right', .6)],
  notes: 'Low stance, lead foot reaches and trail foot closes; no foot crossing, loop seamless at 0.8 s, travels toward +X (the athlete left).',
});
CLIPS.push({
  id: 'hoops_defensive_slide_recover_forward_left', family: 'hoops-defensive-slide-recover', label: 'מהחלקה לריצה קדימה', nominal: true, variant: {direction: 'left', exitGait: 'run-forward', entrySpeedMps: SLIDE_V, exitSpeedMps: 4.5},
  make: slideRecoverForward, core: [0, .5], entry: {reference: 'hoops_defensive_slide_fast_left', phase: 0, blendSeconds: .15, curve: 'cubic-hermite-C1'}, exit: {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1', bodyYawDegrees: 90},
  endIdle: false, events: () => [ev('turn', .2), ev('plant', .36), ev('push', .54)],
  notes: 'Slide with the body turning 90 degrees toward the travel direction (+X) and running on; the pelvis yaw is part of the pose, hence exit.bodyYawDegrees.',
  mirror: {id: 'hoops_defensive_slide_recover_forward_right', label: 'מהחלקה לריצה קדימה (ימין)', glb: false},
});
CLIPS.find(c => c.id === 'hoops_defensive_slide_fast_left').mirror = {id: 'hoops_defensive_slide_fast_right', label: 'החלקה הגנתית מהירה ימינה', glb: true};
CLIPS.push({
  id: 'hoops_defensive_slide_recover_back_left', family: 'hoops-defensive-slide-recover', label: 'מהחלקה לריצה לאחור', nominal: true, variant: {direction: 'left', exitGait: 'run-backward', entrySpeedMps: SLIDE_V, exitSpeedMps: 3.4},
  make: slideRecoverBack, core: [0, .5], entry: {reference: 'hoops_defensive_slide_fast_left', phase: 0, blendSeconds: .15, curve: 'cubic-hermite-C1'}, exit: {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1', note: 'backward run; no reference backpedal exists, bridge to defensive_stance or the game backward gait'},
  endIdle: false, events: () => [ev('turn', .15), ev('plant', .36), ev('push', .54)],
  notes: 'Slide while the travel direction swings from +X to -Z; the body keeps facing +Z and ends in a backpedal.',
  mirror: {id: 'hoops_defensive_slide_recover_back_right', label: 'מהחלקה לריצה לאחור (ימין)', glb: false},
});
CLIPS.push({
  id: 'hoops_cut_plant_left', family: 'hoops-cut-plant', label: 'חיתוך 70 מעלות שמאלה', nominal: true, variant: {direction: 'left', cutDegrees: 70, entrySpeedMps: 4.5, exitSpeedMps: 4.4},
  make: cutPlant, core: [0, .6], entry: runEntry, exit: {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1', bodyYawDegrees: 70, headingChangeDegrees: 70},
  endIdle: false, events: () => [ev('plant', .17), ev('push', .39), ev('step', .47)],
  notes: 'Run in, plant the outside foot wide, the body leads the turn, drive off the plant foot onto a new heading of 70 degrees; exit.bodyYawDegrees says how far the pelvis is yawed in the clip frame.',
  mirror: {id: 'hoops_cut_plant_right', label: 'חיתוך 70 מעלות ימינה', glb: false},
});
CLIPS.push({
  id: 'hoops_pivot_stop_left', family: 'hoops-pivot-stop', label: 'עצירה ופיבוט שמאלה', nominal: true, variant: {direction: 'left', entrySpeedMps: 3, pivotFoot: 'Left', pivotDegrees: 90},
  make: pivotStop, core: [0, .72], entry: {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1'}, exit: {reference: 'idle_relaxed', phase: 0, blendSeconds: .2, curve: 'cubic-hermite-C1', bodyYawDegrees: 90},
  events: () => [ev('brake', .12), ev('plant', .3), ev('pivot', .42), ev('stand', .74)],
  notes: 'Stride stop onto the left foot, the left sole stays planted while the pelvis turns 90 degrees around it and the right foot steps around; ends in the ready stance yawed 90 degrees (exit.bodyYawDegrees).',
  mirror: {id: 'hoops_pivot_stop_right', label: 'עצירה ופיבוט ימינה', glb: false},
});
CLIPS.push({
  id: 'hoops_start_from_stand', family: 'hoops-start-from-stand', label: 'יציאה מעמידה, שלושה צעדים', nominal: true, variant: {exitSpeedMps: 4.3, steps: 3},
  make: startFromStand, startIdle: true, endIdle: false, core: [.1, .9], entry: {reference: 'idle_relaxed', phase: 0, blendSeconds: .2, curve: 'cubic-hermite-C1'}, exit: {reference: 'run', phase: 0, blendSeconds: .3, curve: 'cubic-hermite-C1'},
  events: () => [ev('push', .1), ev('step', .3), ev('step', .48), ev('step', .62)],
  notes: 'Drive lean, push from the left foot, three accelerating steps (right, left, right) into a run of about 4.3 m/s.',
});
