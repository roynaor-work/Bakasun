import {installCity} from './city-runtime.mjs?v=island-people-scale-20261026-1';
import {installLearning} from '../learning/runtime.mjs?v=island-people-scale-20261026-1';
import {cityReport,zoneAvailability,advanceCity} from './city-management.mjs?v=island-people-scale-20261026-1';
import {validCertificate,recordFireCertificate} from '../activity/fire-certificates.mjs?v=island-people-scale-20261026-1';
import {recordStageWin} from '../activity/progress.mjs?v=island-people-scale-20261026-1';
import {gameAvailability} from '../activity/availability.mjs?v=island-people-scale-20261026-1';
import {recordTeamWin} from '../activity/soccer-team.mjs?v=island-people-scale-20261026-1';
import {trainingOffer} from '../activity/soccer-card.mjs?v=island-people-scale-20261026-1';
import {repairHarbors} from './placement-help.mjs?v=island-people-scale-20261026-1';
import {editSoccerPlayer,awardSoccerPractice} from '../activity/soccer-roster.mjs?v=island-people-scale-20261026-1';
import { createRegistry } from './registry.mjs?v=island-people-scale-20261026-1';
import { validatePlacement, canRemove, upgradeAvailability,cellsFor } from './rules.mjs?v=island-people-scale-20261026-1';
import { calculateMetrics, population, coverageForBuilding } from './metrics.mjs?v=island-people-scale-20261026-1';
import { calculateIncome, accrueIncome } from './economy.mjs?v=island-people-scale-20261026-1';
import { createInitialState, loadWorld, saveWorld, exportWorld, importWorld, resetWorld } from './persistence.mjs?v=island-people-scale-20261026-1';
import { loadEpisode, episodeAvailable } from './episodes.mjs?v=island-people-scale-20261026-1';
import { canPlay, spendPlayTime, createNarrationHook } from './hooks.mjs?v=island-people-scale-20261026-1';

const clone = value => JSON.parse(JSON.stringify(value));

/** Pure game state and commands. No DOM, Three.js, timers, network, or audio. */
export function createEngine(data, options = {}) {
  const registry = createRegistry(data);
  const config = data.config;
  const flags = data.featureFlags || {};
  const now = options.now || Date.now;
  let storage = options.storage;
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const loaded = loadWorld(storage, data, registry, now());
  const state = loaded.ok && loaded.state ? loaded.state : createInitialState(data, now());
  const listeners = new Set(), history = [];
  let activeMinigame = null;
  let saveBlocked = !loaded.ok && loaded.reason !== 'reason.storage';
  const narration = createNarrationHook();
  const engine = { state, data, registry, flags, narration, now, storageStatus: loaded.ok ? { ok: true } : loaded, canPlay, spendPlayTime };

  function notify(type, detail = {}) {
    const event = { type, ...detail };
    for (const listener of listeners) listener(state, event);
    return event;
  }
  function save() {
    state.updatedAt = now();
    const result = saveBlocked ? { ok: false, reason: engine.storageStatus.reason } : saveWorld(storage, state);
    engine.storageStatus = result;
    return result;
  }
  function changed(type, detail = {}) {
    engine.city?.sync();
    const saved = save();
    notify(type, { ...detail, saved });
    return saved;
  }
  function remember(action) {
    action.city = clone(state.city);
    if (action.kind === 'remove' && state.events.repairs[action.building.id] != null) action.repairs = {id:action.building.id, until:state.events.repairs[action.building.id]};
    history.push(action);
    if (history.length > config.maxUndo) history.shift();
  }
  function expand() {
    const parts = state.parts[data.world.partGroup] || 0;
    let expanded = false;
    config.worldStages.forEach((stage, index) => {
      if (index > state.world.stage && parts >= stage.requiredParts) { state.world = { size: stage.size, stage: index }; expanded = true; }
    });
    if(expanded)repairHarbors(state,registry,flags);
    return expanded;
  }
  function grantReward(id, reward) {
    if (state.claimedRewards.includes(id)) return false;
    state.claimedRewards.push(id);
    state.money += reward.money || 0;
    for (const resource of Object.keys(state.resources)) state.resources[resource] += reward[resource] || 0;
    if (reward.parts) {
      const group = data.world.partGroup;
      state.parts[group] = (state.parts[group] || 0) + reward.parts;
      expand();
    }
    return true;
  }
  function tutorialObjective() {
    if (!flags.tutorial || state.tutorial.completed || state.tutorial.skipped) return null;
    const step = data.tutorial.steps[state.tutorial.step];
    return step ? { ...step, kind: 'tutorial', reward: config.tutorialRewards[step.id] || {}, target: config.tutorialPlacements[step.id] } : null;
  }
  function nextObjective() {
    const tutorial = tutorialObjective();
    if (tutorial) return tutorial;
    const mission = (data.missions || []).find(row => !state.completedMissions.includes(row.id));
    if (mission) return { ...mission, kind: 'mission', reward: config.missionReward };
    const nextStage = config.worldStages[state.world.stage + 1];
    return nextStage ? { id: 'expand', title: 'mission.expand', kind: 'parts', targetParts: nextStage.requiredParts, reward: {} } : { id: 'grow', title: 'mission.grow', buildType: 'house', kind: 'freebuild', reward: {} };
  }
  function onPlaced(typeId) {
    const objective = nextObjective();
    if (objective.buildType !== typeId || !['tutorial', 'mission'].includes(objective.kind)) return null;
    const paid = grantReward(`${objective.kind}.${objective.id}`, objective.reward);
    if (objective.kind === 'tutorial') {
      state.tutorial.step++;
      state.tutorial.completed = state.tutorial.step >= data.tutorial.steps.length;
    } else state.completedMissions.push(objective.id);
    return { ...objective, paid };
  }
  function enabledType(typeId) {
    const type = registry.buildings.get(typeId);
    if (type?.category === 'sports' && !flags.sportFacilities) return false;
    return !type?.featureFlag || Boolean(flags[type.featureFlag]);
  }
  function check(typeId, x, z, ignoreId) {
    if (!enabledType(typeId)) return { ok: false, reason: 'reason.locked' };
    return validatePlacement(state, registry, typeId, x, z, ignoreId, flags);
  }

  engine.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  engine.save = save;
  engine.reset = ({ keepAvatar = false } = {}) => {
    const fresh = createInitialState(data, now());
    if (keepAvatar) fresh.avatar = clone(state.avatar);
    const result = resetWorld(storage, fresh);
    engine.storageStatus = result;
    if (!result.ok) { notify('storage', result); return result; }
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh); history.length = 0; saveBlocked = false;
    notify('reset');
    return { ok: true };
  };
  engine.validatePlacement = check;
  engine.nextObjective = nextObjective;
  engine.population = () => population(state, registry, config);
  engine.metrics = () => {
    if (!flags.metrics) return {};
    const values = calculateMetrics(state, registry, config);
    for (const metric of registry.metrics.values()) if (metric.featureFlag && !flags[metric.featureFlag]) delete values[metric.id];
    return values;
  };
  engine.coverage = id => coverageForBuilding(state, registry, id, config);
  engine.income = () => flags.economy ? calculateIncome(state, registry, config, data.city) : { money: 0, food: 0, materials: 0, energy: 0, sources: [] };
  engine.incomePerMinute = () => engine.income().money;
  engine.cityReport = options => cityReport(state,registry,config,engine.income(),options);
  engine.setCityPolicy = input => {
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['enabled','taxRate','funding'].includes(key)))return {ok:false,reason:'reason.invalid'};
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean'||input.taxRate!==undefined&&!config.cityManagement.taxRates.includes(input.taxRate))return {ok:false,reason:'reason.invalid'};
    if(input.funding&&(!Object.keys(input.funding).length||Object.keys(input.funding).some(id=>!Object.hasOwn(state.cityManagement.funding,id)||!config.cityManagement.fundingLevels.includes(input.funding[id]))))return {ok:false,reason:'reason.invalid'};
    if(input.funding!==undefined&&(!input.funding||typeof input.funding!=='object'||Array.isArray(input.funding)))return {ok:false,reason:'reason.invalid'};
    const policy=state.cityManagement;
    remember({kind:'city-policy',previous:{enabled:policy.enabled,taxRate:policy.taxRate,funding:{...policy.funding}},moneyDelta:0});
    if(input.enabled!==undefined)policy.enabled=input.enabled;
    if(input.taxRate!==undefined)policy.taxRate=input.taxRate;
    Object.assign(policy.funding,input.funding);
    changed('city-policy');return {ok:true};
  };
  engine.validateZone = (kind,x,z) => zoneAvailability(state,registry,kind,x,z);
  engine.zone = (kind,x,z) => {
    if(state.cityManagement.zones.length>=config.cityManagement.maxZones)return {ok:false,reason:'city.reason.maxZones'};
    const result=engine.validateZone(kind,x,z);if(!result.ok)return result;
    let id;do{id=`zone-${state.cityManagement.nextZoneId++}`;}while(state.cityManagement.zones.some(row=>row.id===id));
    state.cityManagement.zones.push({id,kind,x,z});remember({kind:'city-zone',id,moneyDelta:0});changed('city-zone',{id});return {ok:true,id};
  };
  engine.removeZone = id => {
    const index=state.cityManagement.zones.findIndex(row=>row.id===id);if(index<0)return {ok:false,reason:'reason.invalid'};
    const [zone]=state.cityManagement.zones.splice(index,1);remember({kind:'city-unzone',zone,index,moneyDelta:0});changed('city-unzone',{id});return {ok:true};
  };
  engine.canUndo = () => Boolean(history.length);
  const placeBuilding = (typeId, x, z, automatic=false) => {
    const validation = check(typeId, x, z);
    if (!validation.ok) return validation;
    const type = registry.buildings.get(typeId);
    let id;
    do { id = `building-${state.nextId++}`; } while (state.buildings.some(row => row.id === id));
    state.money -= type.cost;
    const building = { id, typeId, x, z, level: 1 };
    state.buildings.push(building);
    if(!automatic)remember({ kind: 'place', id, moneyDelta: -type.cost });
    const reward = onPlaced(typeId);
    if(!automatic)changed('place', { id, reward });
    if (reward) narration.announce(reward.title, { reward: reward.reward });
    return { ok: true, reason: 'reason.placed', id, reward };
  };
  engine.place = (typeId,x,z) => placeBuilding(typeId,x,z);
  engine.move = (id, x, z) => {
    const building = state.buildings.find(row => row.id === id);
    if (!building) return { ok: false, reason: 'reason.invalid' };
    const validation = check(building.typeId, x, z, id);
    if (!validation.ok) return validation;
    remember({ kind: 'move', id, previous: { x: building.x, z: building.z }, moneyDelta: 0 });
    Object.assign(building, { x, z });
    changed('move', { id });
    return { ok: true, reason: 'reason.moved', id };
  };
  engine.remove = id => {
    const validation = canRemove(state, registry, id);
    if (!validation.ok) return validation;
    const index = state.buildings.findIndex(row => row.id === id);
    const building = state.buildings[index];
    const type = registry.buildings.get(building.typeId);
    const investment = type.cost + type.levels.slice(1, building.level).reduce((sum, level) => sum + level.cost, 0);
    const refund = Math.floor(investment * config.removeRefundRatio);
    remember({ kind: 'remove', building: clone(building), index, moneyDelta: refund });
    state.buildings.splice(index, 1); state.money += refund;
    changed('remove', { id, refund });
    return { ok: true, reason: 'reason.removed', id, refund };
  };
  engine.upgrade = id => {
    const validation = upgradeAvailability(state, registry, id);
    if (!validation.ok) return validation;
    const building = state.buildings.find(row => row.id === id);
    const nextLevel = validation.nextLevel;
    remember({ kind: 'upgrade', id, previousLevel: building.level, moneyDelta: -nextLevel.cost });
    state.money -= nextLevel.cost; building.level++;
    changed('upgrade', { id });
    return { ok: true, reason: 'reason.upgraded', id };
  };
  engine.undo = () => {
    const action = history.at(-1);
    if (!action) return { ok: false, reason: 'reason.noUndo' };
    if(state.money-action.moneyDelta<0)return {ok:false,reason:'reason.money'};
    const restored=action.kind==='remove'?action.building:action.kind==='move'?{...state.buildings.find(row=>row.id===action.id),...action.previous}:null;
    if(restored){const keys=new Set(cellsFor(registry.buildings.get(restored.typeId),restored.x,restored.z).map(cell=>cell.join(',')));if(state.buildings.some(row=>row.id!==restored.id&&cellsFor(registry.buildings.get(row.typeId),row.x,row.z).some(cell=>keys.has(cell.join(',')))))return {ok:false,reason:'reason.occupied'};}
    history.pop();
    const building = state.buildings.find(row => row.id === action.id);
    if(action.kind==='city-policy')Object.assign(state.cityManagement,action.previous);
    if(action.kind==='city-zone')state.cityManagement.zones=state.cityManagement.zones.filter(row=>row.id!==action.id);
    if(action.kind==='city-unzone')state.cityManagement.zones.splice(action.index,0,action.zone);
    if (action.kind === 'place') state.buildings.splice(state.buildings.findIndex(row => row.id === action.id), 1);
    if (action.kind === 'move' && building) Object.assign(building, action.previous);
    if (action.kind === 'upgrade' && building) building.level = action.previousLevel;
    if (action.kind === 'remove') state.buildings.splice(action.index, 0, action.building);
    if (action.city) state.city = clone(action.city);
    if (action.repairs) state.events.repairs[action.repairs.id] = action.repairs.until;
    for (const [key, delta] of Object.entries(action.resourcesDelta || {})) state.resources[key] -= delta;
    // Only reverse the action delta: earned income and once-only rewards remain intact.
    state.money -= action.moneyDelta;
    changed('undo', { action: action.kind });
    return { ok: true, reason: 'reason.undone', id: action.id || action.building?.id };
  };
  engine.tick = seconds => {
    if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, reason: 'reason.invalid' };
    const duration = Math.min(seconds, config.maxTickSeconds);
    state.updatedAt = now();
    let gained={},developed=[];
    if(flags.economy){
      if(!state.cityManagement.enabled)gained=accrueIncome(state,registry,config,duration,data.city);
      else{
        let remaining=duration;
        while(remaining>0){
          const seconds=Math.min(remaining,config.cityManagement.growthInterval-state.cityManagement.growthSeconds),step=accrueIncome(state,registry,config,seconds,data.city);
          for(const [resource,value]of Object.entries(step))gained[resource]=(gained[resource]||0)+value;
          developed.push(...advanceCity(state,registry,config,seconds,(typeId,x,z)=>placeBuilding(typeId,x,z,true)));remaining-=seconds;
        }
      }
    }
    state.playSeconds += duration;
    changed('tick', { gained,developed });
    return { ok: true, gained,developed };
  };
  engine.setAvatar = input => {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'reason.invalid' };
    const next = { ...state.avatar };
    const choiceLists = { gender: 'genders', hairstyle: 'hairstyles', skinColor: 'skinColors', hairColor: 'hairColors', shirtColor: 'shirtColors', pantsColor: 'pantsColors' };
    for (const [field, list] of Object.entries(choiceLists)) {
      if (input[field] != null && !data.avatar[list].some(row => (row.color || row.id) === input[field])) return { ok: false, reason: 'reason.invalid' };
      if (input[field] != null) next[field] = input[field];
    }
    if (input.nameId != null) {
      if (!data.avatar.names.some(row => row.labelId === input.nameId)) return { ok: false, reason: 'reason.invalid' };
      next.nameId = input.nameId;
    }
    if (input.name != null) next.name = String(input.name).trim().slice(0, 30);
    next.created = input.created !== false;
    state.avatar = next;
    changed('avatar');
    return { ok: true, reason: 'reason.avatar' };
  };
  engine.grantParts = (groupId, count) => {
    if (typeof groupId !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(groupId) || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger((state.parts[groupId] || 0) + count)) return { ok: false, reason: 'reason.invalid' };
    state.parts[groupId] = (state.parts[groupId] || 0) + count;
    const expanded = expand();
    changed('parts', { groupId, count, expanded });
    return { ok: true, reason: expanded ? 'reason.expanded' : 'reason.parts', expanded, size: state.world.size };
  };
  engine.skipTutorial = () => { state.tutorial.skipped = true; changed('tutorial'); return { ok: true }; };
  engine.restartTutorial = () => { Object.assign(state.tutorial, { step: 0, completed: false, skipped: false }); changed('tutorial'); return { ok: true }; };
  engine.exportJSON = () => exportWorld(state);
  engine.importJSON = raw => {
    const result = importWorld(raw, state, data, registry);
    if (!result.ok) return result;
    // Persist before changing the live object, so quota/security errors cannot replace it.
    const saved = saveWorld(storage, result.state);
    if (!saved.ok) { engine.storageStatus = saved; notify('storage', saved); return saved; }
    Object.assign(state, result.state); history.length = 0; saveBlocked = false;
    engine.storageStatus = { ok: true };
    notify('import', { added: result.added, conflicts: result.conflicts });
    return { ok: true, reason: 'reason.imported', added: result.added, conflicts: result.conflicts };
  };
  engine.startEpisode = (id, { testMode = false } = {}) => {
    const result = loadEpisode(data, id);
    if (!result.ok) return result;
    if ((!flags.episodes || result.episode.testOnly) && !testMode) return { ok: false, reason: 'reason.locked' };
    if (!episodeAvailable(result.episode, state)) return { ok: false, reason: 'reason.locked' };
    return result;
  };
  engine.completeEpisode = (id, options) => {
    const result = engine.startEpisode(id, options);
    if (!result.ok) return result;
    if (!state.completedEpisodes.includes(id)) state.completedEpisodes.push(id);
    const paid = grantReward(`episode.${id}`, result.episode.rewards);
    changed('episode', { id, paid });
    return { ok: true, paid };
  };
  engine.isMinigameActive = () => Boolean(activeMinigame);
  engine.editSoccerPlayer=(id,input)=>{if(activeMinigame)return {ok:false,reason:'reason.gameBusy'};const r=editSoccerPlayer(state.soccerRoster,id,input,config.minigames.soccer);if(r.ok)changed('soccer-roster');return r;};
  engine.setSoccerRole=role=>{if(activeMinigame||!['field','keeper'].includes(role))return {ok:false,reason:'reason.invalid'};state.soccerRoster.role=role;changed('soccer-role');return {ok:true};};
  engine.soccerOutdoorPractice=()=>{if(activeMinigame)return {ok:false,reason:'reason.gameBusy'};const r=awardSoccerPractice(state,config.minigames.soccer,'outdoor',now());if(r.ok)changed('soccer-outdoor');return r;};
  engine.setSoccerDifficulty = difficulty => {
    if(activeMinigame)return {ok:false,reason:'reason.gameBusy'};
    if(typeof difficulty!=='string'||!Object.hasOwn(config.minigames.soccer.difficulties,difficulty))return {ok:false,reason:'reason.invalid'};
    state.soccerCard.difficulty=difficulty;changed('soccer-difficulty');return {ok:true};
  };
  engine.soccerTrainingOffer = key => {
    if(activeMinigame)return {ok:false,reason:'reason.gameBusy'};
    const card=state.soccerCard,at=Math.floor(now());
    if(card.lastTrainingAt>at){card.lastTrainingAt=at;changed('soccer-clock');}
    return trainingOffer(card,key,config.minigames.soccer,at);
  };
  engine.trainSoccer = key => {
    const offer=engine.soccerTrainingOffer(key);if(!offer.ok)return offer;
    const card=state.soccerCard;
    card.stars-=offer.cost;card.attributes[key]=Math.min(config.minigames.soccer.card.max,card.attributes[key]+config.minigames.soccer.training.gain);
    const attribute={power:'shot',pace:'pace',accuracy:'pass',defense:'defense'}[key];if(attribute)state.soccerRoster.players[0].attributes[attribute]=Math.max(state.soccerRoster.players[0].attributes[attribute],card.attributes[key]);
    card.trainings=Math.min(Number.MAX_SAFE_INTEGER,card.trainings+1);card.lastTrainingAt=Math.floor(now());changed('soccer-training');return {ok:true,cost:offer.cost};
  };
  engine.setTennisDifficulty=difficulty=>{if(activeMinigame)return {ok:false,reason:'reason.gameBusy'};if(!Object.hasOwn(config.minigames.tennis.difficulties,difficulty))return {ok:false,reason:'reason.invalid'};state.tennisDifficulty=difficulty;changed('tennis-difficulty');return {ok:true};};
  engine.startMinigame = (id, context = {}) => {
    const minigame = registry.minigames.get(id);
    if (!minigame || !flags.minigames || (minigame.featureFlag && !flags[minigame.featureFlag])) return { ok: false, reason: 'reason.locked' };
    if (activeMinigame) return { ok: false, reason: 'reason.gameBusy' };
    const available=gameAvailability(state,config,id);
    if(available&&!available.ok)return available;
    const customAvailable=minigame.availability?.(state);
    if(customAvailable&&!customAvailable.ok)return customAvailable;
    if (!engine.canPlay()) return { ok: false, reason: 'reason.playTime' };
    const progress=state.minigameProgress[id],stage=context.level??progress?.stage;
    if(progress&&(!Number.isInteger(stage)||stage<1||stage>progress.stage))return {ok:false,reason:'minigame.stageLockedReason'};
    const token = {}, startedAt = now();
    let ended = false, session;
    const ctx = { ...context, level:stage, state, engine, canPlay: () => engine.canPlay(), spendPlayTime: minutes => engine.spendPlayTime(minutes) };
    if(id==='tennis')ctx.difficulty=state.tennisDifficulty;
    if(id==='soccer'){if(ctx.drill&&!['targets','penalties','cones'].includes(ctx.drill))return {ok:false,reason:'reason.invalid'};ctx.difficulty=state.soccerCard.difficulty;ctx.soccerCard=clone(state.soccerCard);ctx.role=state.soccerRoster.role;}
    const finish = (raw, cancelled = false) => {
      if (ended) return { ok: false, reason: 'reason.duplicate' };
      let result;
      if (!cancelled) {
        try { result = minigame.onResult(raw, ctx); } catch { return { ok: false, reason: 'reason.invalid' }; }
        if (!result || !['win', 'lose'].includes(result.outcome) || !Number.isSafeInteger(result.score) || result.score < 0 || !Number.isSafeInteger(result.money) || result.money < 0 || !Number.isFinite(state.money + result.money)) return { ok: false, reason: 'reason.invalid' };
        const wins = (state.minigameWins[id] || 0) + Number(result.outcome === 'win');
        const periodicParts = result.outcome === 'win' && config.minigames?.partEveryWins && wins % config.minigames.partEveryWins === 0 ? config.minigames.winParts : 0;
        const won=result.outcome==='win',settings=config.minigames?.[id]?.levels[stage-1];
        const stars=progress&&won?result.stars:0;
        if(progress&&won&&(!Number.isInteger(stars)||stars<1||stars>3))return {ok:false,reason:'reason.invalid'};
        const parts=periodicParts+(won?(settings?.winParts||0):0);
        result = Object.freeze({ outcome: result.outcome, score: result.score, money: result.money, parts,stars,stage,
          ...(result.drill?{drill:result.drill}:{}),...(id==='fireRescue'&&validCertificate(raw?.certificate)?{certificate:{...raw.certificate}}:{}),
          ...(id==='soccer'?{difficulty:ctx.difficulty,trainingStars:won?stars+config.minigames.soccer.difficulties[ctx.difficulty].bonusStars:0}:{}) });
      }
      ended = true; activeMinigame = null;
      session?.dispose?.();
      ctx.spendPlayTime(Math.max(0, now() - startedAt) / 60000);
      if (result) {
        if(result.drill){const practice=result.drill.attempts>=config.minigames.soccer.training.drillAttempts?awardSoccerPractice(state,config.minigames.soccer,result.drill.kind,now()):{ok:false,reason:'soccer.practice.tryAgain'};result={...result,practice};changed('soccer-practice',{result});context.onFinish?.(result);return {ok:true,result};}
        if(id==='fireRescue'&&result.certificate)recordFireCertificate(state.fireCertificates,stage,result.certificate);
        if(id==='alienDefense'){const h=config.minigames.alienDefense.hangar;state.hangar.damage=Number.isSafeInteger(raw?.damage)?Math.max(0,Math.min(h.maxDamage,raw.damage)):state.hangar.damage;state.hangar.coins=Math.min(h.maxCoins,state.hangar.coins+(result.outcome==='win'?h.winCoins:h.lossCoins));if(result.outcome==='win')state.hangar.credits=Math.min(h.maxCoins,state.hangar.credits+1);}
        state.money += result.money;
        // Only shipped game IDs are persisted; third-party contract examples remain compatible.
        if (config.minigameLevels?.[id]) {
          state.highScores[id] = Math.max(state.highScores[id] || 0,result.score);
          if(result.outcome==='win'){recordStageWin(state,data,id,stage,result.stars);}
          if(result.outcome==='win')state.minigameWins[id]=Math.min(Number.MAX_SAFE_INTEGER,(state.minigameWins[id]||0)+1);
          if(id==='tennis'&&result.outcome==='win')recordTeamWin(state,config.minigames.soccer,'tennis');
          if(id==='soccer'&&result.outcome==='win'){
            recordTeamWin(state,config.minigames.soccer);
            state.soccerCard.stars=Math.min(Number.MAX_SAFE_INTEGER,state.soccerCard.stars+result.trainingStars);
          }
          if(result.parts){const group=data.world.partGroup;state.parts[group]=(state.parts[group]||0)+result.parts;expand();}
        }
        changed('minigame', { id, result });
      }
      context.onFinish?.(cancelled ? { cancelled: true } : result);
      return { ok: true, ...(cancelled ? { cancelled: true } : { result }) };
    };
    ctx.finish = raw => finish(raw);
    ctx.cancel = () => finish(null, true);
    activeMinigame = token;
    try {
      session = minigame.start(ctx);
      // A synchronous extension may finish from start() itself.
      if (ended) session?.dispose?.();
      return { ok: true, session, cancel: ctx.cancel };
    } catch {
      if (activeMinigame === token) activeMinigame = null;
      ended = true; session?.dispose?.();
      return { ok: false, reason: 'reason.gameStart' };
    }
  };
  engine.prepareEvent = (id, context = {}) => {
    const event = registry.eventTypes.get(id);
    if (!event || !flags.events || (event.featureFlag && !flags[event.featureFlag])) return { ok: false, reason: 'reason.locked' };
    if (!event.warningId) return { ok: false, reason: 'reason.invalid' };
    return { ok: true, warningId: event.warningId, prepared: event.prepare?.({ ...context, state, engine }) };
  };
  for (const name of ['registerBuilding', 'registerSport', 'registerMinigame', 'registerEventType', 'registerMetric', 'registerIncomeSource']) engine[name] = record => { const result = registry[name](record); notify('registry', { id: record.id }); return result; };
  installLearning(engine,changed);
  installCity(engine,{changed,notify,remember});
  return engine;
}
