import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {API_VERSION, createPitSequence, samplePitSequence, validateSequence} from '../src/pit-sequence.mjs';

const config = JSON.parse(await readFile(new URL('../sequence.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(config);
const wheelIds = ['front_left', 'front_right', 'rear_left', 'rear_right'];

test('the complete arrival/service/release schedule lasts 2.88 game seconds', () => {
  assert.equal(API_VERSION, '1.0.0');
  assert.deepEqual(validateSequence(config), {valid: true, errors: []});
  assert.equal(config.duration, 2.88);
  assert.ok(config.duration >= 2 && config.duration <= 3);
  assert.equal(config.stages[0].start, 0);
  assert.equal(config.stages.at(-1).end, config.duration);
  for (const stage of config.stages) for (const id of stage.dependsOn) {
    assert.ok(config.stages.find(previous => previous.id === id).end <= stage.start, `${id} must finish before ${stage.id}`);
  }
});

test('half-open stage boundaries never start wheel work before both jacks are raised', () => {
  for (let i = 1; i < config.stages.length; i++) {
    const stage = config.stages[i];
    assert.equal(samplePitSequence(config, stage.start - 1e-6).stage, config.stages[i - 1].id);
    assert.equal(samplePitSequence(config, stage.start).stage, stage.id);
  }
  const before = samplePitSequence(config, .66 - 1e-6);
  const after = samplePitSequence(config, .66);
  assert.ok(before.jacks.front.liftMeters < config.car.liftMeters);
  assert.equal(after.jacks.front.liftMeters, config.car.liftMeters);
  assert.equal(after.jacks.rear.liftMeters, config.car.liftMeters);
  assert.equal(after.actors.wheel_front_left.clip, 'loosen');
});

test('the car stops on its mark before service and stays fixed until release', () => {
  assert.deepEqual(samplePitSequence(config, 0).car.position, config.car.entryPosition);
  assert.deepEqual(samplePitSequence(config, .38).car.position, config.car.stopPosition);
  for (const t of [.46, .80, 1.20, 1.80, 2.10, 2.30]) {
    const car = samplePitSequence(config, t).car;
    assert.equal(car.position[0], config.car.stopPosition[0]);
    assert.equal(car.position[2], config.car.stopPosition[2]);
    assert.equal(car.stopped, true);
  }
  assert.deepEqual(samplePitSequence(config, 2.88).car.position, config.car.exitPosition);
});

test('all four unique old wheels leave and all four unique new wheels mount', () => {
  const before = samplePitSequence(config, 0);
  const detached = samplePitSequence(config, .91);
  const released = samplePitSequence(config, 1.10);
  const mounting = samplePitSequence(config, 1.30);
  const after = samplePitSequence(config, 1.88);
  assert.equal(new Set(config.wheels.flatMap(wheel => [wheel.oldId, wheel.newId])).size, 8);
  for (const id of wheelIds) {
    assert.equal(before.wheels[id].oldState, 'hub');
    assert.equal(before.wheels[id].newState, 'rack');
    assert.equal(detached.wheels[id].oldState, 'held');
    assert.equal(detached.wheels[id].newState, 'rack');
    assert.equal(released.wheels[id].oldState, 'released');
    assert.equal(mounting.wheels[id].oldState, 'rack');
    assert.equal(mounting.wheels[id].newState, 'held');
    assert.equal(after.wheels[id].newState, 'hub');
    assert.equal(after.wheels[id].oldState, 'rack');
    assert.equal(after.wheels[id].fastener, 'tight');
    assert.equal(after.wheels[id].confirmed, true);
    assert.equal(after.wheels[id].replaced, true);
    assert.notEqual(after.wheels[id].oldId, after.wheels[id].newId);
  }
});

test('wheel ownership has one parent throughout and a free-hand window between grips', () => {
  for (const wheel of config.wheels) {
    assert.ok(wheel.events.nutLoose <= wheel.events.detach);
    assert.ok(wheel.events.oldReleased < wheel.events.newGripped);
    assert.ok(wheel.events.oldRacked <= wheel.events.mounted);
    for (const id of [wheel.oldId, wheel.newId]) {
      const windows = config.props.attachments.find(prop => prop.id === id).windows;
      for (const t of [0, .90, 1.08, 1.20, 1.24, 1.60, 2.879]) {
        assert.equal(windows.filter(window => t >= window.start && t < window.end).length, 1, `${id} ownership at ${t}`);
      }
    }
  }
});

test('green means service complete while departure still waits for lower and hand signal', () => {
  const green = samplePitSequence(config, 1.88);
  assert.equal(green.light, 'green');
  assert.equal(green.serviceComplete, true);
  assert.equal(green.canExit, false);
  assert.ok(green.blockedBy.includes('jacks_clear'));
  const grounded = samplePitSequence(config, 2.10);
  assert.equal(grounded.jacks.front.clear, true);
  assert.equal(grounded.jacks.rear.clear, true);
  assert.equal(grounded.car.liftMeters, 0);
  assert.equal(grounded.handSignalComplete, false);
  assert.equal(grounded.canExit, false);
  assert.equal(samplePitSequence(config, 2.30).canExit, true);
});

test('baked stance offsets and both jack chassis contacts use the final geometry contract', () => {
  const pickup = samplePitSequence(config, 1.24);
  const mounted = samplePitSequence(config, 1.60);
  for (const wheel of config.wheels) {
    assert.deepEqual(pickup.actors[wheel.actor].rootOffset, [-.35, 0, -.28]);
    assert.deepEqual(mounted.actors[wheel.actor].rootOffset, [0, 0, 0]);
    assert.deepEqual(pickup.actors[wheel.actor].position, config.actors.find(actor => actor.id === wheel.actor).position, 'baked Root must not be added to instance position');
    assert.ok(wheel.events.secondaryGripReleased < wheel.events.mounted, 'right hand has time to reach the holster before the next gun pickup');
    const sign = Math.sign(wheel.hub[0]);
    assert.deepEqual(wheel.gripLocalLeft, [sign * .145, 0, sign * .24], 'primary grip lies on the outer tire face');
    assert.deepEqual(wheel.gripLocalRight, [sign * .145, 0, -sign * .24]);
  }
  for (const id of ['front', 'rear']) {
    const jack = config.props.attachments.find(prop => prop.id === `jack_${id}`);
    assert.equal(jack.contactPosition[2], id === 'front' ? 2.29 : -1.97, 'pad is inside the verified wing/diffuser geometry');
    assert.equal(config.actors.find(actor => actor.id === `jack_${id}`).position[2], jack.position[2]);
    const padX = jack.position[0] + Math.sin(jack.yaw) * jack.padLocal[2];
    const padZ = jack.position[2] + Math.cos(jack.yaw) * jack.padLocal[2];
    assert.ok(Math.abs(padX - jack.contactPosition[0]) < 1e-9);
    assert.ok(Math.abs(padZ - jack.contactPosition[2]) < 1e-9);
    assert.ok(Math.abs(jack.restPadY + jack.padTopLocal[1] - jack.contactPosition[1]) < 1e-9, 'pad top must support the actual mesh underside');
    assert.equal(jack.valveTripAt, 2.00);
    assert.equal(jack.gripReleaseAt, 2.00);
    assert.equal(jack.handBlendStart, jack.gripReleaseAt);
    assert.equal(jack.handBlendEnd, 2.10);
    assert.equal(jack.handleAdjustment.pressedUntil, 2.04, 'mechanical latch stays pressed after the hands release');
    assert.ok(Math.abs(pickup.jacks[id].chassisContact[1] - (jack.contactPosition[1] + .16)) < 1e-9);
    assert.equal(samplePitSequence(config, 2.10).jacks[id].position[0], jack.position[0] + (id === 'front' ? 1.40 : -1.40));
    assert.ok(Math.abs(samplePitSequence(config, 2.10).jacks[id].position[0]) - .33 > 1.027, 'entire jack base clears the full car lateral bound');
  }
  assert.ok(samplePitSequence(config, 0).jacks.rear.position[0] <= -1.4);
  assert.equal(samplePitSequence(config, .46).jacks.rear.position[0], 0);
  assert.equal(samplePitSequence(config, 2.04).car.liftMeters, 0);
  assert.equal(samplePitSequence(config, 2.04).jacks.front.clear, false);
});

test('manual torque acknowledgements fail closed even on a ten-second frame skip', () => {
  const machine = createPitSequence(config, {autoConfirm: false});
  machine.start();
  const hold = machine.update(10);
  assert.equal(hold.time, 1.88);
  assert.equal(hold.state, 'hold_fasteners');
  assert.equal(hold.light, 'red');
  assert.equal(hold.complete, false);
  assert.equal(hold.car.liftMeters, .16);
  for (const id of wheelIds) assert.equal(hold.wheels[id].confirmed, false);
  for (const id of wheelIds.slice(0, 3)) machine.setConfirmation(id, true);
  assert.equal(machine.update(10).time, 1.88);
  assert.equal(machine.getSnapshot().canExit, false);
  machine.setConfirmation(wheelIds[3], true);
  const final = machine.update(10);
  assert.equal(final.complete, true);
  assert.equal(final.time, 2.88);
});

test('a confirmation identifies a real wheel and cannot precede the torque operation', () => {
  const machine = createPitSequence(config, {autoConfirm: false});
  assert.throws(() => machine.setConfirmation('front_left', true), /before torque/);
  assert.throws(() => machine.setConfirmation('fifth_wheel', true), /Unknown wheel/);
  machine.start(); machine.update(2);
  assert.throws(() => machine.setConfirmation('front_left', 1), /boolean/);
  machine.setConfirmation('front_left', true);
  assert.equal(machine.getSnapshot().wheels.front_left.confirmed, true);
  assert.equal(machine.getSnapshot().wheels.front_right.confirmed, false);
});

test('a blocked exit lane holds at the release line and does not accumulate time debt', () => {
  const machine = createPitSequence(config, {laneClear: false});
  machine.start();
  const hold = machine.update(20);
  assert.equal(hold.time, 2.30);
  assert.equal(hold.state, 'hold_exit');
  assert.equal(hold.canExit, false);
  assert.equal(hold.complete, false);
  assert.equal(hold.car.position[2], 0);
  assert.equal(machine.update(20).time, 2.30);
  machine.setLaneClear(true);
  assert.equal(machine.getSnapshot().time, 2.30);
  assert.equal(machine.update(.10).complete, false);
  assert.equal(machine.update(1).complete, true);
});

test('closing the lane during departure stops at the current pose without rewinding', () => {
  const machine = createPitSequence(config);
  machine.start(); machine.update(2.40);
  const position = machine.getSnapshot().car.position;
  machine.setLaneClear(false);
  assert.equal(machine.update(1).time, 2.40);
  assert.deepEqual(machine.getSnapshot().car.position, position);
  assert.equal(machine.getSnapshot().canExit, false);
  machine.setLaneClear(true);
  assert.equal(machine.update(1).complete, true);
});

test('coarse and fine clock steps produce the same final state and ordered event sequence', () => {
  const coarse = createPitSequence(config);
  const fine = createPitSequence(config);
  const coarseEvents = [], fineEvents = [];
  coarse.subscribe(event => coarseEvents.push(event));
  fine.subscribe(event => fineEvents.push(event));
  coarse.start(); fine.start();
  coarse.update(100);
  for (let i = 0; i < Math.ceil(config.duration * 60); i++) fine.update(1 / 60);
  assert.deepEqual(coarse.getSnapshot(), fine.getSnapshot());
  assert.deepEqual(coarseEvents, fineEvents);
  assert.equal(coarseEvents.filter(event => event.type === 'detach').length, 4);
  assert.equal(coarseEvents.filter(event => event.type === 'mounted').length, 4);
  assert.equal(coarseEvents.filter(event => event.type === 'release').length, 1);
  assert.equal(coarseEvents.at(-1).type, 'complete');
  coarse.update(100);
  assert.deepEqual(coarseEvents, fineEvents);
});

test('manual holds delay service-complete and release event emission until the gate passes', () => {
  const events = [];
  const machine = createPitSequence(config, {autoConfirm: false, laneClear: false});
  machine.subscribe(event => events.push(event.type));
  machine.start(); machine.update(10);
  assert.equal(events.includes('service_complete'), false);
  assert.equal(events.includes('release'), false);
  assert.equal(events.filter(type => type === 'torqued').length, 4, 'external integration must receive torque callbacks before it can acknowledge them');
  for (const id of wheelIds) machine.setConfirmation(id, true);
  machine.update(10);
  assert.equal(events.filter(type => type === 'service_complete').length, 1);
  assert.equal(events.includes('release'), false);
  machine.setLaneClear(true); machine.update(10);
  assert.equal(events.filter(type => type === 'release').length, 1);
});

test('pause, reset, and unsubscribe have deterministic effects', () => {
  const machine = createPitSequence(config);
  const events = [];
  const unsubscribe = machine.subscribe(event => events.push(event.type));
  assert.equal(machine.update(1).time, 0);
  machine.start(); machine.update(.8); machine.pause();
  assert.equal(machine.update(1).time, .8);
  unsubscribe(); unsubscribe();
  machine.start(); machine.update(2);
  assert.equal(events.includes('complete'), false);
  assert.equal(machine.reset().time, 0);
  assert.equal(machine.getSnapshot().playing, false);
  assert.equal(machine.getSnapshot().light, 'red');
});

test('random-access replay is idempotent and a backward seek clears future approvals', () => {
  const machine = createPitSequence(config, {autoConfirm: false});
  machine.start(); machine.update(10);
  for (const id of wheelIds) machine.setConfirmation(id, true);
  machine.update(1);
  machine.seek(.5);
  machine.start();
  assert.equal(machine.update(10).state, 'hold_fasteners');
  const direct = samplePitSequence(config, 1.5);
  assert.deepEqual(direct, samplePitSequence(config, 1.5));
  assert.deepEqual(samplePitSequence(config, -10).car.position, config.car.entryPosition);
  assert.equal(samplePitSequence(config, 100).time, 2.88);
});

test('snapshots and event objects are immutable and source edits cannot change a controller', () => {
  const input = copy();
  const machine = createPitSequence(input);
  const initial = machine.getSnapshot();
  input.car.entryPosition[2] = -99;
  input.stages[0].end = .01;
  assert.equal(initial.car.position[2], -6);
  assert.equal(machine.getSnapshot().car.position[2], -6);
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.car.position));
  assert.ok(Object.isFrozen(initial.wheels.front_left));
  assert.throws(() => {initial.wheels.front_left.confirmed = true;}, TypeError);
});

test('validation rejects dependency overlaps, skipped wheels, reused hubs and reused identities', () => {
  const overlap = copy(); overlap.stages[4].start = .80;
  assert.equal(validateSequence(overlap).valid, false);
  const omitted = copy(); omitted.wheels.pop();
  assert.equal(validateSequence(omitted).valid, false);
  const reused = copy(); reused.wheels[3].newId = reused.wheels[0].newId;
  assert.equal(validateSequence(reused).valid, false);
  const hub = copy(); hub.wheels[3].carNode = hub.wheels[0].carNode;
  assert.equal(validateSequence(hub).valid, false);
  const actor = copy(); actor.actors[0].wheel = 'rear_right';
  assert.equal(validateSequence(actor).valid, false);
  assert.throws(() => createPitSequence(omitted), /Invalid pit sequence/);
});

test('validation rejects invalid event order and attachment ownership gaps', () => {
  const missing = copy(); delete missing.events;
  assert.equal(validateSequence(missing).valid, false);
  const unsorted = copy(); unsorted.events.reverse();
  assert.equal(validateSequence(unsorted).valid, false);
  const causal = copy();
  const torqueIndex = causal.events.findIndex(event => event.type === 'torqued');
  const serviceIndex = causal.events.findIndex(event => event.type === 'service_complete');
  [causal.events[torqueIndex], causal.events[serviceIndex]] = [causal.events[serviceIndex], causal.events[torqueIndex]];
  assert.equal(validateSequence(causal).valid, false);
  const windows = copy(); windows.props.attachments[0].windows[1].start += .01;
  assert.equal(validateSequence(windows).valid, false);
  const parents = copy(); parents.props.attachments[0].windows[1].parent = 'missing_actor';
  assert.equal(validateSequence(parents).valid, false);
});

test('bad numeric input fails immediately without changing timeline state', () => {
  const machine = createPitSequence(config);
  machine.start();
  for (const value of [NaN, Infinity, -1, '1']) assert.throws(() => machine.update(value), TypeError);
  for (const value of [NaN, Infinity, '1']) assert.throws(() => machine.seek(value), TypeError);
  assert.throws(() => machine.setLaneClear(1), TypeError);
  assert.throws(() => machine.subscribe(null), TypeError);
  assert.equal(machine.getSnapshot().time, 0);
});
