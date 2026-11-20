import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const STEP = .02;
const STREET_STEPS = 12_000;
const ROOM_STEPS = 40_000;
export const SEEDS = Object.freeze([1, 3, 17]);
const elapsed = n => +n.toFixed(2);
const worldDistance = (truck, [x, , z]) => Math.hypot(truck.x - x, truck.z - z);
const aimDistance = (model, fire) => Math.hypot(model.nozzle.x - fire.x, model.nozzle.y - fire.y);

export async function loadRuntime(root = new URL('../../', import.meta.url)) {
  const repo = root instanceof URL ? root : pathToFileURL(resolve(root) + '/');
  const island = new URL('workout/island/', repo);
  const load = name => import(new URL(`minigames/${name}.mjs`, island));
  const [config, fire, campaign, interior, rules, flow, context, flag, extension] = await Promise.all([
    readFile(new URL('data/config.json', island), 'utf8').then(JSON.parse),
    load('fire'), load('fire-campaign'), load('fire-v24-interior'), load('fire-v24'),
    load('fire-v24-flow'), load('context'), load('fire-levels-v1'), import(new URL('extensions/fire-rescue.mjs', island)),
  ]);
  let settle;
  extension.install({registerMinigame(game) { settle = game.onResult; }}, {
    config, extensions: {fireRescue: {}},
  });
  return {...fire, ...campaign, ...interior, ...rules, ...flow, ...context, ...flag, settle, config: config.minigames};
}

function navigate(model, kind, index) {
  if (model.navigation.active && model.navigation.kind === kind && model.navigation.targetIndex === index) return {};
  return {navigate: {kind, index}};
}

function cityPilot(model, memory) {
  const balance = model.balance;
  const pump = model.pressure < model.maxPressure;
  if (model.canFinish && model.rescues.every(rescue => rescue.rescued || rescue.expired)) return {finish: true};
  const fires = model.flames.filter(fire => fire.active && fire.heat > 0);
  const hydrant = balance.city.hydrants.reduce((best, p, i, all) =>
    worldDistance(model.truck, p) < worldDistance(model.truck, all[best]) ? i : best, 0);
  const pending = model.rescues.filter(rescue => !rescue.rescued && !rescue.expired);
  const hasDescending = model.rescues.some(rescue => rescue.rescued && rescue.descent < 1);
  const rescue = model.ladder.mode === 'sequence'
    ? (hasDescending ? null : pending[0])
    : pending.sort((a, b) => worldDistance(model.truck, a.world) - worldDistance(model.truck, b.world))[0];
  const windowFire = rescue && model.flames[rescue.fireIndex];
  const rescueReady = rescue && windowFire.heat === 0 && windowFire.warning === 0;
  if (model.water <= 1) memory.refilling = true;
  if (model.water >= model.maxWater - .1) memory.refilling = false;
  if (model.pressure <= model.maxPressure * .65) memory.pumping = true;
  if (model.pressure >= model.maxPressure * .96) memory.pumping = false;

  if (rescueReady) {
    if (worldDistance(model.truck, rescue.world) <= balance.rescue.truckRadius - .12) {
      if (model.navigation.active) return {cancelNavigation: true, charge: pump};
      const readyToStart = !model.truck.driving && model.ladder.target === rescue;
      return readyToStart ? {rescue: true} : {charge: pump};
    }
    return {...navigate(model, 'rescue', model.rescues.indexOf(rescue)), charge: pump};
  }
  if (memory.refilling && fires.length) {
    if (model.atHydrant && !model.truck.driving) return {refill: true, charge: pump};
    return {...navigate(model, 'hydrant', hydrant), refill: true, charge: pump};
  }

  // Keep working on the same fire through a pressure pause. Transit also recharges the pump.
  const selected = model.selectedObjective?.kind === 'fire' && model.flames[model.selectedObjective.index];
  const closest = fires.reduce((best, fire) =>
    !best || aimDistance(model, fire) < aimDistance(model, best) ? fire : best, null);
  const fire = windowFire?.heat > 0 ? windowFire : selected?.heat > 0 ? selected : closest;
  if (!fire) return {charge: pump};
  const index = model.flames.indexOf(fire);
  const inRange = aimDistance(model, fire) <= model.range * .92;
  if (!inRange) return {...navigate(model, 'fire', index), charge: pump};
  if (model.navigation.active) return {cancelNavigation: true, charge: pump};
  if (model.truck.driving || memory.pumping) return {charge: pump};
  return {x: fire.x, y: fire.y, firing: true};
}

function interiorPilot(model) {
  if (model.phase === 'intro') return {skip: true};
  if (model.phase !== 'play') return {};
  const spot = model.room.spots.find(spot => !spot.done);
  if (spot) {
    const tool = {electric: 'extinguisher', oil: 'blanket', heavy: 'foam'}[spot.kind] ?? 'water';
    if (model.tool !== tool && model.tools.includes(tool)) return {tool};
    if (model.tool === 'blanket') return {tap: spot.pos};
    return model.empty ? {} : {aim: spot.pos};
  }
  const rescue = model.rescueAction;
  if (rescue && !rescue.active) return {rescueAction: rescue.id};
  if (!model.plan.rescueActions && model.room.friend.state === 'waiting') {
    const [x, , z] = model.room.friend.pos;
    return {tap: [x, .5, z]};
  }
  return {};
}

// The browser-independent runner reuses the entry coordinator. The elements receive
// its events, while the renderer and animation frame scheduler are test fixtures.
class Element extends EventTarget {
  dataset = {};
  children = [];
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  remove() {}
}

function withRunnerDOM(search, run) {
  const properties = {
    location: {search}, requestAnimationFrame: () => 1,
    document: {createElement: () => new Element(), createElementNS: () => new Element(), head: new Element()},
  };
  const before = Object.fromEntries(Object.keys(properties).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  }
  return Promise.resolve().then(run).finally(() => {
    for (const key of Object.keys(properties)) {
      if (before[key]) Object.defineProperty(globalThis, key, before[key]);
      else delete globalThis[key];
    }
  });
}

export async function runBot(runtime, {level, seed, persona, search = '', equipment = {}, idleInside = false}) {
  if (!['patient', 'idle'].includes(persona)) throw new RangeError('Unknown player persona');
  const config = runtime.config;
  const fireLevels = runtime.fireLevelsEnabled(search);
  const balance = runtime.fireScenario(config.fireRescue, level);
  const needsEntry = runtime.isEntryStage(level, balance.levels.length) && runtime.fireFlowV24(search);
  const metrics = {navigationTaps: 0, rescueTicks: 0, sprayTicks: 0, hydrantTicks: 0, interiorActions: 0};
  const memory = {};
  return withRunnerDOM(search, async () => {
    const canvas = new Element();
    const dialog = new Element();
    const inputContext = {canvas, dialog, config, balance, level, fireLevels, equipment, random: runtime.seededRandom(seed)};
    let street, interior, interiorDone, streetFinish, raw;
    const finish = result => { raw = result; return {ok: true}; };
    const session = needsEntry ? runtime.startFireEntry({...inputContext, finish}, runtime.createFireModel, () => {}, () => ({mode: 'three'}), {
      runSession(ctx, createModel, draw, createView) {
        street = createModel(ctx);
        streetFinish = ctx.finish;
        createView(ctx, street);
        return {setPaused() {}, dispose() {}};
      },
      loadInterior: async () => ({runFireV24Interior(ctx, {plan, onDone}) {
        interiorDone = onDone;
        interior = runtime.createInteriorModel({plan});
        return {setPaused() {}, dispose() {}};
      }}),
    }) : null;
    if (!session) {
      street = runtime.createFireModel(inputContext);
      streetFinish = finish;
    }
    const doorButton = dialog.children.find(child => child.id === 'fire-enter');
    let entryFlame = -1;
    let doorSeconds = null;
    if (session?.v24 && !fireLevels) {
      const building = session.v24.building;
      const open = street.flames.map((fire, i) => ({fire, i})).filter(({fire}) => fire.active);
      open.sort((a, b) => worldDistance(building, balance.render.sites[a.i]) - worldDistance(building, balance.render.sites[b.i]));
      entryFlame = open[0].i;
    }
    for (let i = 0; i < STREET_STEPS && !street.result; i++) {
      const flow = session?.v24;
      let input = {};
      if (persona === 'patient') {
        if (flow?.state === 'ready' && !flow.done) {
          doorButton.dispatchEvent(new Event('click'));
          doorSeconds = elapsed(street.time);
        } else if (flow && !flow.done) {
          if (!fireLevels) input = navigate(street, 'fire', entryFlame);
          else if (!street.navigation.active) {
            doorButton.dispatchEvent(new Event('click'));
            metrics.navigationTaps++;
          }
        } else input = cityPilot(street, memory);
      }
      if (input.navigate) metrics.navigationTaps++;
      street.update(STEP, input);
      metrics.rescueTicks += Number(street.rescuing);
      metrics.sprayTicks += Number(street.spraying);
      metrics.hydrantTicks += Number(street.refilling);
      if (!flow?.inside) continue;
      // Give the real flow's import promise and its enter callback one turn.
      await new Promise(resolve => setImmediate(resolve));
      if (!interior) throw new Error(`Stage ${level}: entry did not start its room model`);
      for (let j = 0; j < ROOM_STEPS && !interior.result; j++) {
        const roomInput = idleInside ? {} : interiorPilot(interior);
        if (roomInput.rescueAction) metrics.interiorActions++;
        interior.update(STEP, roomInput);
      }
      if (!interior.result) throw new Error(`Stage ${level}: room time budget exceeded`);
      interiorDone(interior.result);
    }
    if (!street.result) throw new Error(`Stage ${level}: street time budget exceeded`);
    streetFinish(street.result);
    session?.dispose();
    const result = runtime.settle(raw, {config, level});
    if (!result) throw new Error(`Stage ${level}: invalid settlement`);
    return {
      level, seed, persona, outcome: result.outcome, stars: result.stars, score: result.score, money: result.money, reason: raw.reason ?? null,
      doorSeconds, streetSeconds: elapsed(street.time), ...metrics,
      streetRescues: street.rescues.filter(rescue => rescue.rescued).length, requiredRescues: street.requiredRescues,
      extinguished: raw.summary?.out, floors: interior?.result.floors ?? interior?.result.rooms ?? 0,
      interiorRescues: interior?.result.rescued ?? 0, handovers: interior?.result.handovers ?? 0,
      interiorSeconds: interior ? elapsed(interior.result.seconds) : 0,
    };
  });
}

// Equipment from earlier wins is bought at its configured prices and star requirements.
// Each seed starts its own campaign with no purchases, coins, or imported state.
function buyEquipment(tracks, profile) {
  const purchases = [];
  for (const key of ['pressure', 'tank', 'range', 'hose']) {
    const rank = profile.ranks[key] ?? 0;
    const offer = tracks[key]?.levels[rank];
    if (!offer || offer.cost > profile.coins || offer.stars > profile.stars) continue;
    profile.coins -= offer.cost;
    profile.ranks[key] = rank + 1;
    profile.equipment[key] = offer.value;
    purchases.push({track: key, rank: rank + 1, cost: offer.cost});
  }
  return purchases;
}

export async function runCampaign(runtime, {levels = runtime.config.fireRescue.levels.map((_, i) => i + 1), seeds = SEEDS, search = '', buyUpgrades = true} = {}) {
  const runs = [];
  for (const seed of seeds) {
    const profile = {ranks: {}, equipment: {}, coins: 0, stars: 0};
    for (const level of levels) {
      for (const persona of ['patient', 'idle']) {
        const equipment = persona === 'patient' ? {...profile.equipment} : {};
        const run = await runBot(runtime, {level, seed, persona, search, equipment});
        run.equipment = equipment;
        if (persona === 'patient' && run.outcome === 'win' && buyUpgrades) {
          profile.coins += run.money;
          profile.stars += run.stars;
          run.purchases = buyEquipment(runtime.config.fireRescue.equipment, profile);
        }
        runs.push(run);
      }
    }
  }
  return runs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [root, ...args] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const buyUpgrades = !process.argv.includes('--no-upgrades');
  const search = process.argv.includes('--legacy') ? '?fireLevels=0' : '';
  const runtime = await loadRuntime(root);
  const runs = await runCampaign(runtime, {buyUpgrades, search, ...(args.length ? {levels: args.map(Number)} : {})});
  console.log(JSON.stringify({stepSeconds: STEP, buyUpgrades, search, runs}, null, 2));
}
