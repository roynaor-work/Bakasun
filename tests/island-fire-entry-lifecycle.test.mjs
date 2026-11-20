import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {startFireEntry} from '../workout/island/minigames/fire-v24-flow.mjs';
import {fireScenario} from '../workout/island/minigames/fire-campaign.mjs';
import {entryBuilding} from '../workout/island/minigames/fire-v24.mjs';
import {createInteriorModel} from '../workout/island/minigames/fire-v24-interior.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {projectFireRoad} from '../workout/island/minigames/fire-roads.mjs';
import {streetFireDriver} from './helpers/street-fire-driver.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';

const root = new URL('../workout/island/', import.meta.url);
const data = await loadData(root, async url => ({ok:true, json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config = data.config.minigames;
const level = 3;
const balance = fireScenario(config.fireRescue, level);
const building = entryBuilding(balance, level);

class Element extends EventTarget {
  children = [];
  dataset = {};
  hidden = false;
  append(...children) {
    this.children.push(...children);
    for (const child of children) child.parent = this;
  }
  setAttribute() {}
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
  click() { this.dispatchEvent(new Event('click')); }
}

function fixture(t, loadInterior) {
  const originals = ['document','requestAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]);
  const head = new Element(), dialog = new Element(), frames = [], pauses = [];
  let session, model, disposed = false, settle;
  t.after(() => {
    try { if (!disposed) session?.dispose(); }
    finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  globalThis.document = {head, createElement:()=>new Element(), createElementNS:()=>new Element()};
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  function start(ctx, createModel = () => ({
    truck:{x:building.door[0], z:building.door[2], speed:0, driving:false},
    time:0,
    get canFinish() { return true; },
    update(dt) { this.time += dt; },
  })) {
    const runSession = (wrapped, make) => {
      model = make(wrapped);
      settle = raw => wrapped.finish(raw);
      return {
        setPaused(value) { pauses.push(value); },
        dispose() { disposed = true; pauses.push('dispose'); },
        get snapshot() { return {time:model.time}; },
      };
    };
    session = startFireEntry({...ctx, level, balance, config, dialog, canvas:{parentElement:new Element()}},
      createModel, ()=>{}, ()=>({mode:'three'}), {runSession, loadInterior});
    return session;
  }
  function enter() {
    model.update(.02,{});
    assert.equal(session.snapshot.v24.state, 'ready');
    dialog.children.find(node => node.id === 'fire-enter').click();
    model.update(.02,{});
    assert.equal(session.snapshot.v24.inside, true);
  }
  return {start, enter, pauses, dialog, head, frames, get model(){return model;}, settle:raw=>settle(raw)};
}

test('fire entry freezes the street clock, routes pause to the room and resumes the street when the room ends', async t => {
  let onDone;
  const roomPauses = [];
  const f = fixture(t, async()=>({runFireV24Interior(_ctx, options) {
    onDone = options.onDone;
    return {snapshot:{phase:'play'}, setPaused:value=>roomPauses.push(value), dispose(){}};
  }}));
  const session = f.start({finish:assert.fail});
  assert.equal(f.model.canFinish, false, 'a cleared street cannot finish the stage before entry');
  f.enter();
  await nextTurn();
  assert.deepEqual(f.pauses, [true]);
  const before = session.snapshot.time;
  f.model.update(10,{});
  assert.equal(session.snapshot.time, before);
  session.setPaused(true);
  session.setPaused(false);
  assert.deepEqual(roomPauses, [true,false]);
  assert.deepEqual(f.pauses, [true]);
  onDone({outcome:'win', score:200, performance:1, rescued:1, rooms:1, seconds:10});
  assert.equal(session.snapshot.v24.state, 'done');
  assert.equal(session.snapshot.v24.inside, false);
  assert.deepEqual(f.pauses, [true,false]);
  f.model.update(.5,{});
  assert.equal(session.snapshot.time, before + .5);
  assert.equal(f.model.canFinish, true);
});

test('leaving during a pending room import removes the controls and never starts the room', async t => {
  let resolve, started = 0;
  const pending = new Promise(done => { resolve = done; });
  const f = fixture(t, () => pending);
  const session = f.start({finish:assert.fail});
  f.enter();
  session.dispose();
  resolve({runFireV24Interior() { started++; }});
  await nextTurn();
  assert.equal(started, 0);
  assert.deepEqual(f.pauses, [true,'dispose']);
  assert.equal(f.head.children.length, 0);
  assert.equal(f.dialog.children.length, 0);
  for (const callback of f.frames.splice(0)) callback();
  assert.equal(f.frames.length, 0, 'no next animation frame after disposal');
});

test('a room import failure completes the failed room and gives control back to the street', async t => {
  const f = fixture(t, async()=>{throw Error('room unavailable');});
  const session = f.start({finish:assert.fail});
  f.enter();
  await nextTurn();
  assert.equal(session.snapshot.v24.inside, false);
  assert.equal(session.snapshot.v24.done, true);
  assert.equal(session.snapshot.v24.result.failed, true);
  assert.deepEqual(f.pauses, [true,false]);
});

function completeRoom(model) {
  for (let step=0; step<1000 && !model.result; step++) {
    const spot = model.room.spots.find(spot => !spot.done);
    const friend = model.room.friend;
    const input = model.phase === 'intro' ? {skip:true} : model.phase !== 'play' ? {}
      : spot && !model.empty ? {aim:spot.pos} : !spot && friend.state === 'waiting' ? {tap:friend.pos} : {};
    model.update(.1, input);
  }
  assert.equal(model.result?.outcome, 'win');
  assert.equal(model.result?.rescued, 1);
  return model.result;
}

test('winning the street and room settles one campaign win with the combined score, stars and saved certificate', async t => {
  let room, completeEntry;
  const f = fixture(t, async()=>({runFireV24Interior(_ctx,{plan,onDone}) {
    room = createInteriorModel({plan});
    completeEntry = onDone;
    return {get snapshot(){return room.snapshot();}, setPaused(){}, dispose(){}};
  }}));
  const installers = data.extensionInstallers.map(install => (registry,d) => install(new Proxy(registry,{
    get(target, property) {
      if (property !== 'registerMinigame') return Reflect.get(target, property);
      return record => target.registerMinigame(record.id === 'fireRescue' ? {...record,
        start:ctx=>f.start(ctx, createFireModel)} : record);
    },
  }),d));
  const values = new Map();
  const storage = {getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value))};
  const engine = createEngine({...data,extensionInstallers:installers},{storage,now:()=>1e6});
  engine.skipTutorial();
  engine.state.money = 100000;
  let placed = false;
  for (let z=0; z<engine.state.world.size&&!placed; z++) {
    for (let x=0; x<engine.state.world.size&&!placed; x++) placed = engine.place('fireStation',x,z).ok;
  }
  assert.ok(placed);
  const progress = engine.state.minigameProgress.fireRescue;
  progress.stage = level;
  progress.stars.fill(1,0,level-1);
  const before = JSON.parse(engine.exportJSON()), results = [];
  const run = engine.startMinigame('fireRescue',{...gameContext(engine, config, 7, 'fireRescue', level),
    level, onFinish:result=>results.push(result)});
  assert.equal(run.ok, true, run.reason);
  const street = f.model;
  const park = projectFireRoad(street.roads,{x:building.door[0],z:building.door[2]});
  for (let i=0; i<2500 && run.session.snapshot.v24.state!=='ready'; i++) {
    street.update(.02,{truckX:park.x,truckZ:park.z});
  }
  f.enter();
  await nextTurn();
  const inside = completeRoom(room);
  completeEntry(inside);
  assert.equal(run.session.snapshot.v24.done, true);
  assert.deepEqual(results, [], 'the room alone earns no campaign result');
  const drive = streetFireDriver(street, balance, street.roads);
  for (let i=0; i<7500 && !street.result; i++) street.update(.02,drive());
  assert.equal(street.result?.outcome, 'win', JSON.stringify(street.result));
  const settled = f.settle(street.result);
  assert.equal(settled.ok,true);
  assert.equal(settled.result.score,Math.min(balance.maximumScore,street.result.score+inside.score));
  assert.equal(settled.result.stars,3);
  assert.equal(f.settle(street.result).reason,'reason.duplicate');
  assert.equal(results.length,1);
  const reloaded = createEngine(data,{storage,now:()=>1e6});
  assert.deepEqual(reloaded.storageStatus,{ok:true});
  const loaded = reloaded.state;
  assert.equal(loaded.minigameWins.fireRescue,(before.minigameWins.fireRescue||0)+1);
  assert.equal(loaded.minigameProgress.fireRescue.stage,level+1);
  assert.equal(loaded.minigameProgress.fireRescue.stars[level-1],3);
  assert.deepEqual(loaded.fireCertificates[level-1],street.result.certificate);
  assert.equal(loaded.money,before.money+settled.result.money);
});
