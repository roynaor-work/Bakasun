import {initialCity, validCity, productionTier} from './city-depth.mjs?v=island-naval-aim-20261028-2';
import {initialLearning,validLearning,mergeLearning} from '../learning/state.mjs?v=island-naval-aim-20261028-2';
import {initialCityManagement,validCityManagement} from './city-management.mjs?v=island-naval-aim-20261028-2';
import {initialFireCertificates,validFireCertificates,validCertificate} from '../activity/fire-certificates.mjs?v=island-naval-aim-20261028-2';
import {initialHangar,validHangar} from '../activity/hangar.mjs?v=island-naval-aim-20261028-2';
import {initialAlienUpgrades} from '../activity/alien-upgrades.mjs?v=island-naval-aim-20261028-2';
import {withCityHall} from './city-hall.mjs?v=island-naval-aim-20261028-2';
import {validTeamProgress} from '../activity/soccer-team.mjs?v=island-naval-aim-20261028-2';
import {initialSoccerCard,validSoccerCard,mergeSoccerCard} from '../activity/soccer-card.mjs?v=island-naval-aim-20261028-2';
import {initialEquipment} from '../activity/equipment.mjs?v=island-naval-aim-20261028-2';
import {initialProgress,extendStageProgress} from '../activity/progress.mjs?v=island-naval-aim-20261028-2';
import { cellsFor } from './rules.mjs?v=island-naval-aim-20261028-2';
import {repairHarbors} from './placement-help.mjs?v=island-naval-aim-20261028-2';
import {initialSoccerRoster,validSoccerRoster,mergeSoccerRoster} from '../activity/soccer-roster.mjs?v=island-naval-aim-20261028-2';
import { initialActivity, validActivity, mergeActivity } from '../activity/state.mjs?v=island-naval-aim-20261028-2';
import {validReadyPlan,prepareReadyPlan} from './ready-plots.mjs?v=island-naval-aim-20261028-2';
import {initialHoops,validHoops,migrateHoops,mergeHoops} from '../minigames/hoops-franchise.mjs?v=island-naval-aim-20261028-2';

export const CURRENT_VERSION = 18;
export const STORAGE_KEY = 'island.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const finitePositive = value => Number.isFinite(value) && value >= 0;
const validId = value => typeof value === 'string' && /^[a-zA-Z][\w.-]*$/.test(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function createInitialState(data, now = Date.now()) {
  const road = data.config.seedRoad;
  const players=(data.players||[]).map(row=>({...data.config.playerDefaults,...row})),soccerCard=initialSoccerCard(null,data.config.minigames.soccer);
  const buildings = [];
  for (let x = road.startX; x <= road.endX; x++) buildings.push({ id: `seed-road-${x}`, typeId: 'road', x, z: road.z, level: 1 });
  return withCityHall({
    cityDepthVersion:1,city:initialCity(),cityManagement:initialCityManagement(),learning:initialLearning(now),fireCertificates:initialFireCertificates(data),hangar:initialHangar(),version: CURRENT_VERSION, money: data.config.startingMoney, resources: clone(data.config.startingResources),
    buildings, world: { size: data.config.worldStages[0].size, stage: 0 }, parts: { [data.world.partGroup]: 0 },
    avatar: clone(data.avatar.defaults), team: {...clone(data.team),wins:0,rank:0,sportWins:{soccer:0,tennis:0}}, players,
    tutorial: { step: 0, completed: false, skipped: false }, claimedRewards: [], completedMissions: [], completedEpisodes: [],
    nextId: 1, playSeconds: 0, createdAt: now, updatedAt: now,
    ...initialActivity(data,now),tennisDifficulty:'easy',soccerCard,soccerRoster:initialSoccerRoster(players,soccerCard,data.config.minigames.soccer),
    hoops:initialHoops(data.config.minigames.streetSlam),
  },data);
}

/** Games added while the schema stayed at 18. */
const GAMES_AFTER_18=['streetSlam'];

/** A game added after a save was written starts at stage one with empty
 * equipment, the same way islandRacing joined in 16 -> 17. Additive only. */
function addNewGame(state,old,data,id){
  if(!data?.config?.minigameLevels?.[id])return state;
  if(isObject(old.minigameLevels)&&!Object.hasOwn(old.minigameLevels,id))state.minigameLevels={...old.minigameLevels,[id]:1};
  if(isObject(old.minigameProgress)&&!Object.hasOwn(old.minigameProgress,id))state.minigameProgress={...old.minigameProgress,[id]:initialProgress(data)[id]};
  if(isObject(old.minigameEquipment)&&!Object.hasOwn(old.minigameEquipment,id))state.minigameEquipment={...old.minigameEquipment,[id]:initialEquipment(data)[id]};
  return state;
}

/** Each migration is explicit. Existing building positions, currencies, avatar and progress survive. */
export const migrations = {
  17(old,data) {return GAMES_AFTER_18.reduce((state,id)=>addNewGame(state,old,data,id),{...old,version:18,cityDepthVersion:1,city:initialCity(),cityManagement:initialCityManagement(),hoops:old.hoops??initialHoops(data.config.minigames.streetSlam)});},
  16(old,data){
    const state={...old,version:17};
    if(isObject(old.minigameProgress)){
      state.minigameProgress={...old.minigameProgress};
      for(const id of ['alienDefense','fireRescue','navalDuel','soccer','tennis'])if(id in state.minigameProgress)state.minigameProgress[id]=extendStageProgress(state.minigameProgress[id],10,data.config.minigames[id]?.levels?.length);
    }
    // This game did not exist in v16. Missing tracks of older games still fail.
    if(data.config.minigameLevels?.islandRacing){
      if(isObject(old.minigameLevels)&&!Object.hasOwn(old.minigameLevels,'islandRacing'))state.minigameLevels={...old.minigameLevels,islandRacing:1};
      if(isObject(state.minigameProgress)&&!Object.hasOwn(state.minigameProgress,'islandRacing'))state.minigameProgress={...state.minigameProgress,islandRacing:initialProgress(data).islandRacing};
      if(isObject(old.minigameEquipment)&&!Object.hasOwn(old.minigameEquipment,'islandRacing'))state.minigameEquipment={...old.minigameEquipment,islandRacing:initialEquipment(data).islandRacing};
    }
    const fireCount=data.config.minigames.fireRescue.levels.length;
    if(fireCount>10&&Array.isArray(old.fireCertificates)&&old.fireCertificates.length===10&&old.fireCertificates.every(c=>c===null||validCertificate(c)))state.fireCertificates=[...old.fireCertificates,...Array(fireCount-10).fill(null)];
    return state;
  },
  15(old){return {...old,version:16,learning:initialLearning(old.createdAt||old.updatedAt||Date.now())};},
  14(old,data){return {...old,version:15,fireCertificates:initialFireCertificates(data)};},
  13(old){return {...old,version:14,hangar:initialHangar()};},
  12(old,data){return {...old,version:13,soccerRoster:initialSoccerRoster(old.players||data.players,old.soccerCard,data.config.minigames.soccer)};},
  11(old,data){if(!Array.isArray(old.players))return {...old,version:12};return {...old,version:12,players:[...old.players,...data.players.filter(row=>!old.players.some(p=>p.id===row.id)).map(row=>({...data.config.playerDefaults,...row}))]};},
  10(old,data){return {...old,version:11,minigameLevels:{...old.minigameLevels,tennis:old.minigameLevels?.tennis||1},minigameEquipment:{...old.minigameEquipment,tennis:{speed:0,hit:0,serve:0,...old.minigameEquipment?.tennis}},minigameProgress:{...old.minigameProgress,tennis:old.minigameProgress?.tennis||initialProgress(data).tennis},team:{...old.team,sportWins:{soccer:old.team?.wins||0,tennis:0,...old.team?.sportWins}},tennisDifficulty:old.tennisDifficulty||'easy'};},
  9(old,data) {return {...old,version:10,soccerCard:initialSoccerCard(old.minigameProgress?.soccer,data.config.minigames.soccer)};},
  8(old,data,registry) {return withCityHall({...old,version:9},data,registry);},
  7(old) {
    return {...old,version:8,team:{wins:0,rank:0,...old.team},
      minigameEquipment:{...old.minigameEquipment,soccer:{speed:0,kick:0,guard:0,...old.minigameEquipment?.soccer}}};
  },
  6(old,data) { return {...old,alienUpgrades:initialAlienUpgrades(data),version:7}; },
  // Only the new hose track is added; malformed/missing old tracks still fail validation.
  5(old) {
    if (!old.minigameEquipment?.fireRescue || typeof old.minigameEquipment.fireRescue !== 'object') return {...old,version:6};
    return {...old,minigameEquipment:{...old.minigameEquipment,fireRescue:{hose:0,...old.minigameEquipment.fireRescue}},version:6};
  },
  4(old,data) { return {...old,minigameEquipment:initialEquipment(data),version:5}; },
  3(old,data) { return {...old,minigameProgress:initialProgress(data),version:4}; },
  2(old,data) { return {...old,...initialActivity(data,old.updatedAt||old.createdAt||Date.now()),version:3}; },
  1(old, data) {
    const initial = createInitialState(data, old.createdAt || Date.now());
    const size = old.world?.size || old.worldSize || initial.world.size;
    const stage = data.config.worldStages.findIndex(row => row.size === size);
    return {
      ...initial, ...old, version: 2,
      money: old.money ?? old.coins ?? initial.money,
      resources: { ...initial.resources, ...old.resources },
      buildings: (old.buildings || initial.buildings).map((row, index) => ({ ...row, id: row.id || `legacy-${index}`, typeId: row.typeId || row.type, level: row.level || 1 })),
      world: { ...initial.world, ...old.world, size, stage: Math.max(stage, 0) },
      parts: { ...initial.parts, ...old.parts }, avatar: { ...initial.avatar, ...old.avatar },
      tutorial: { ...initial.tutorial, ...old.tutorial },
      claimedRewards: old.claimedRewards || [], completedMissions: old.completedMissions || [], completedEpisodes: old.completedEpisodes || [],
    };
  },
};

export function migrateSave(value, data, registry) {
  if (!isObject(value)) return { ok: false, reason: 'reason.invalid' };
  // A present damaged optional subformat cannot disappear through JSON cloning.
  if (Object.hasOwn(value,'readyPlan') && value.readyPlan === undefined) return {ok:false,reason:'reason.invalid'};
  let state;
  try { state = clone(value); } catch { return { ok: false, reason: 'reason.invalid' }; }
  if (state.version == null && Array.isArray(state.buildings)) state.version = 1;
  if (!Number.isInteger(state.version) || state.version < 1) return { ok: false, reason: 'reason.invalid' };
  if (state.version > CURRENT_VERSION) return { ok: false, reason: 'reason.future' };
  const fromVersion = state.version;
  while (state.version < CURRENT_VERSION) {
    const migrate = migrations[state.version];
    if (!migrate) return { ok: false, reason: 'reason.invalid' };
    try{state = migrate(state, data, registry);}catch{return {ok:false,reason:'reason.invalid'};}
  }
  // PR170 already published v18 with municipal management. Extend that exact
  // older shape once; the subformat tag keeps damaged new v18 saves strict.
  if (state.version === 18 && !Object.hasOwn(state,'cityDepthVersion') && !Object.hasOwn(state,'city') && validCityManagement(state.cityManagement,state,registry)) {
    state.cityDepthVersion=1; state.city=initialCity();
  }
  // New content IDs can start at level one without changing the save schema.
  if (isObject(state.minigameLevels)) for (const id of Object.keys(data.config.minigameLevels || {})) if (!(id in state.minigameLevels)) state.minigameLevels[id] = 1;
  if (isObject(state.minigameProgress)) for (const [id,p] of Object.entries(initialProgress(data))) if (!(id in state.minigameProgress)) state.minigameProgress[id] = p;
  // Only games shipped after schema 18 may be missing; missing tracks of any other game stay invalid.
  if (isObject(state.minigameEquipment)) for (const [id,tracks] of Object.entries(initialEquipment(data))) if (!(id in state.minigameEquipment) && GAMES_AFTER_18.includes(id)) state.minigameEquipment[id] = tracks;
  // The basketball club is its own versioned object inside schema 18 (hoops.v); a save
  // without it starts the default club, an older club version is migrated in place.
  if (!Object.hasOwn(state,'hoops')) state.hoops = initialHoops(data.config.minigames.streetSlam);
  else { const club=migrateHoops(state.hoops,data.config.minigames.streetSlam); if(!club) return { ok: false, reason: 'reason.invalid' }; state.hoops=club; }
  const validation = validateSave(state, data, registry);
  if(!validation.ok)return validation;
  const repairedHarbors=repairHarbors(state,registry,data.featureFlags);
  return {ok:true,state,migrated:fromVersion!==CURRENT_VERSION,repairedHarbors};
}

export function validateSave(state, data, registry) {
  const invalid = () => ({ ok: false, reason: 'reason.invalid' });
  if(state?.cityDepthVersion!==1||!validCity(state?.city, state, data))return invalid();
  if(!validCityManagement(state?.cityManagement,state,registry))return invalid();
  if(!validLearning(state?.learning))return invalid();
  if(!validFireCertificates(state?.fireCertificates,data))return invalid();
  if(!validHangar(state?.hangar,data.config.minigames.alienDefense.hangar))return invalid();
  if (!isObject(state) || state.version !== CURRENT_VERSION || !finitePositive(state.money) || !isObject(state.resources)) return invalid();
  if (!Object.keys(data.config.startingResources).every(key => finitePositive(state.resources[key]))) return invalid();
  const ready=Object.hasOwn(state,'readyPlan');
  if (!isObject(state.world) || !Number.isInteger(state.world.stage) || state.world.stage < 0 || state.world.stage >= data.config.worldStages.length) return invalid();
  const ordinarySize=data.config.worldStages[state.world.stage].size,readySize=ready?data.config.readyWorldStages?.[state.world.stage]?.size:undefined;
  if (state.world.size!==ordinarySize && (!ready || !Number.isInteger(readySize) || state.world.size!==readySize)) return invalid();
  if (!Array.isArray(state.buildings) || state.buildings.length > data.config.maxSaveBuildings) return invalid();
  if (state.buildings.filter(row=>row?.typeId==='cityHall').length!==1) return invalid();
  const ids = new Set(), occupied = new Set();
  for (const row of state.buildings) {
    const type = registry.buildings.get(row?.typeId);
    if (!type || !validId(row.id) || ids.has(row.id) || !Number.isInteger(row.x) || !Number.isInteger(row.z) || !Number.isInteger(row.level) || row.level < 1 || row.level > type.levels.length) return invalid();
    ids.add(row.id);
    for (const [x, z] of cellsFor(type, row.x, row.z)) {
      const key = `${x},${z}`;
      if (x < 0 || z < 0 || x >= state.world.size || z >= state.world.size || occupied.has(key)) return invalid();
      occupied.add(key);
    }
  }
  if (ready && (state.readyPlan === undefined || !validReadyPlan(state.readyPlan,state,registry))) return invalid();
  if (!isObject(state.avatar) || typeof state.avatar.created !== 'boolean' || !data.avatar.genders.some(row => row.id === state.avatar.gender) || !data.avatar.hairstyles.some(row => row.id === state.avatar.hairstyle)) return invalid();
  if (!['skinColor', 'hairColor', 'shirtColor', 'pantsColor'].every(key => validColor(state.avatar[key]))) return invalid();
  if (typeof state.avatar.nameId !== 'string' || (state.avatar.name != null && (typeof state.avatar.name !== 'string' || state.avatar.name.length > 30))) return invalid();
  if (!isObject(state.tutorial) || !Number.isInteger(state.tutorial.step) || state.tutorial.step < 0 || state.tutorial.step > data.tutorial.steps.length || typeof state.tutorial.completed !== 'boolean' || typeof state.tutorial.skipped !== 'boolean') return invalid();
  if (!isObject(state.team) || !validId(state.team.id) || typeof state.team.nameId !== 'string' || !Array.isArray(state.team.colors) || !state.team.colors.every(validColor) || !Array.isArray(state.players)) return invalid();
  if (!validTeamProgress(state.team,data.config.minigames.soccer)) return invalid();
  if(!isObject(state.team.sportWins)||Object.keys(state.team.sportWins).length!==2||!['soccer','tennis'].every(k=>Number.isSafeInteger(state.team.sportWins[k])&&state.team.sportWins[k]>=0)||!Object.hasOwn(data.config.minigames.tennis.difficulties,state.tennisDifficulty))return invalid();
  if (!validSoccerCard(state.soccerCard,data.config.minigames.soccer)) return invalid();
  if(!validSoccerRoster(state.soccerRoster,data.players,data.config.minigames.soccer))return invalid();
  if (!state.players.every(player => isObject(player) && validId(player.id) && typeof player.nameId === 'string' && validColor(player.color) && ['speed', 'kick', 'guard', 'level'].every(key => finitePositive(player[key])))) return invalid();
  if (!isObject(state.parts) || !Object.entries(state.parts).every(([key, value]) => validId(key) && Number.isSafeInteger(value) && value >= 0)) return invalid();
  for (const key of ['claimedRewards', 'completedMissions', 'completedEpisodes']) if (!Array.isArray(state[key]) || !state[key].every(value => typeof value === 'string')) return invalid();
  if (!Number.isSafeInteger(state.nextId) || state.nextId < 1 || !finitePositive(state.playSeconds)) return invalid();
  if (!validActivity(state,data,registry)) return invalid();
  if (!validHoops(state.hoops,data.config.minigames.streetSlam)) return invalid();
  return { ok: true };
}

export function loadWorld(storage, data, registry, now = Date.now()) {
  if (!storage) return { ok: false, reason: 'reason.storage' };
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { ok: false, reason: 'reason.storage' }; }
  if (raw == null) return { ok: true, state: null };
  let value;
  try { value = JSON.parse(raw); } catch { value = null; }
  const result = migrateSave(value, data, registry);
  if (result.ok) return result;
  const backupKey = `${STORAGE_KEY}.corrupt.${now}`;
  let backupSaved = false;
  try { storage.setItem(backupKey, raw); backupSaved = true; } catch { /* The original is never overwritten. */ }
  return { ...result, backupKey: backupSaved ? backupKey : null };
}

export function saveWorld(storage, state) {
  try { storage.setItem(STORAGE_KEY, exportWorld(state)); return { ok: true }; }
  catch { return { ok: false, reason: 'reason.storage' }; }
}

/** Explicit ownership only: this game never owns other localStorage keys or any IndexedDB database. */
export function resetWorld(storage, freshState) {
  try {
    const backups = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === 'island.sound' || /^island\.v1\.corrupt\.\d+$/.test(key)) backups.push(key);
    }
    // Remove backups first, so a failed cleanup does not remove the active save.
    for (const key of backups) storage.removeItem(key);
    const previous = storage.getItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY);
    const saved = saveWorld(storage, freshState);
    if (!saved.ok) {
      if (previous !== null) storage.setItem(STORAGE_KEY, previous);
      return saved;
    }
    return { ok: true };
  } catch { return { ok: false, reason: 'reason.storage' }; }
}

export function exportWorld(state) { return JSON.stringify({ ...state, version: CURRENT_VERSION }, null, 2); }

/** Import is an additive merge. Current buildings win on conflicts; current progress is never reduced. */
export function importWorld(raw, current, data, registry) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, reason: 'reason.import' }; }
  const migrated = migrateSave(parsed, data, registry);
  if (!migrated.ok) return migrated;
  const incoming = migrated.state;
  const merged = clone(current);
  // Current policy wins. Restoring a backup adds plans without silently starting new charges.
  for(const zone of incoming.cityManagement.zones){
    const plans=merged.cityManagement.zones;
    if(plans.length>=data.config.cityManagement.maxZones)break;
    if(plans.some(row=>row.kind===zone.kind&&row.x===zone.x&&row.z===zone.z))continue;
    const type=registry.buildings.get(data.config.cityManagement.zones[zone.kind].typeId),keys=new Set(cellsFor(type,zone.x,zone.z).map(cell=>cell.join(',')));
    if(plans.some(row=>cellsFor(registry.buildings.get(data.config.cityManagement.zones[row.kind].typeId),row.x,row.z).some(cell=>keys.has(cell.join(',')))))continue;
    let id=zone.id;while(plans.some(row=>row.id===id))id=`zone-${merged.cityManagement.nextZoneId++}`;
    plans.push({...zone,id});
  }
  merged.cityManagement.nextZoneId=Math.max(merged.cityManagement.nextZoneId,incoming.cityManagement.nextZoneId);
  merged.cityManagement.developed=Math.max(merged.cityManagement.developed,incoming.cityManagement.developed);
  if (incoming.world.size > merged.world.size) {
    merged.world = clone(incoming.world);
    // Importing a larger prepared city needs its land, but its lot layout must
    // not overwrite the local city. Prepare local reservations after buildings.
    if (!Object.hasOwn(merged,'readyPlan') && Object.hasOwn(incoming,'readyPlan')) merged.readyPlan={version:1,lots:[]};
  }
  const occupied = new Set(merged.buildings.flatMap(row => cellsFor(registry.buildings.get(row.typeId), row.x, row.z).map(cell => cell.join(','))));
  const ids = new Set(merged.buildings.map(row => row.id));
  let added = 0, conflicts = 0;
  for (const row of incoming.buildings) {
    // An imported city's hall never creates a second central building.
    if(row.typeId==='cityHall'&&merged.buildings.some(b=>b.typeId==='cityHall'))continue;
    if (ids.has(row.id)) {
      const existing = merged.buildings.find(item => item.id === row.id);
      if (existing.typeId === row.typeId) existing.level = Math.max(existing.level, row.level);
      else conflicts++;
      continue;
    }
    const cells = cellsFor(registry.buildings.get(row.typeId), row.x, row.z).map(cell => cell.join(','));
    if (cells.some(key => occupied.has(key))) { conflicts++; continue; }
    merged.buildings.push(clone(row));
    ids.add(row.id); cells.forEach(key => occupied.add(key)); added++;
  }
  merged.money = Math.max(merged.money, incoming.money);
  for (const resource of Object.keys(merged.resources)) merged.resources[resource] = Math.max(merged.resources[resource], incoming.resources[resource]);
  for (const [group, count] of Object.entries(incoming.parts)) merged.parts[group] = Math.max(merged.parts[group] || 0, count);
  const stages=Object.hasOwn(merged,'readyPlan')?(data.config.readyWorldStages||data.config.worldStages):data.config.worldStages;
  let stage=Math.max(merged.world.stage,current.world.stage,incoming.world.stage);
  stages.forEach((row,index)=>{if(index>stage && (merged.parts[data.world.partGroup]||0)>=row.requiredParts)stage=index;});
  merged.world={...merged.world,stage,size:stages[stage].size};
  for (const key of ['claimedRewards', 'completedMissions', 'completedEpisodes']) merged[key] = [...new Set([...merged[key], ...incoming[key]])];
  if (incoming.tutorial.step > merged.tutorial.step) merged.tutorial = clone(incoming.tutorial);
  merged.tutorial.completed ||= incoming.tutorial.completed;
  if (!merged.avatar.created && incoming.avatar.created) merged.avatar = clone(incoming.avatar);
  merged.nextId = Math.max(merged.nextId, incoming.nextId);
  merged.playSeconds = Math.max(merged.playSeconds, incoming.playSeconds);
  merged.team.wins = Math.max(merged.team.wins,incoming.team.wins);
  merged.team.rank = Math.max(merged.team.rank,incoming.team.rank);
  for(const sport of ['soccer','tennis'])merged.team.sportWins[sport]=Math.max(merged.team.sportWins[sport],incoming.team.sportWins[sport]);
  merged.tennisDifficulty=incoming.tennisDifficulty;
  mergeSoccerCard(merged.soccerCard,incoming.soccerCard);
  mergeSoccerRoster(merged.soccerRoster,incoming.soccerRoster,data.config.minigames.soccer);
  merged.hoops=mergeHoops(merged.hoops,incoming.hoops);
  mergeActivity(merged,incoming,data);
  // City import follows the existing additive policy. Local live orders win;
  // imported orders cannot be fulfilled again for a second reward.
  for(const [id,tier] of Object.entries(incoming.city.investments)) {
    const source=incoming.buildings.find(b=>b.id===id),target=merged.buildings.find(b=>b.id===id);
    if(source?.typeId===target?.typeId)merged.city.investments[id]=Math.max(productionTier(merged,id),tier);
  }
  merged.city.claimedGoals=[...new Set([...merged.city.claimedGoals,...incoming.city.claimedGoals])];
  merged.city.delivered=Math.max(merged.city.delivered,incoming.city.delivered);
  merged.city.port.cycle=Math.max(merged.city.port.cycle,incoming.city.port.cycle);
  merged.city.port.readyAt=Math.max(merged.city.port.readyAt,incoming.city.port.readyAt);
  mergeLearning(merged.learning,incoming.learning,{restoreSettings:Object.hasOwn(parsed,'learning')});
  for(let i=0;i<merged.fireCertificates.length;i++)if(incoming.fireCertificates[i]&&(!merged.fireCertificates[i]||incoming.fireCertificates[i].stars>merged.fireCertificates[i].stars))merged.fireCertificates[i]=clone(incoming.fireCertificates[i]);
  for(const key of ['rapid','shield','coins'])merged.hangar[key]=Math.max(current.hangar[key],incoming.hangar[key]);merged.hangar.spent=merged.hangar.rapid+merged.hangar.shield;merged.hangar.credits=Math.max(0,Math.max(current.hangar.credits+current.hangar.spent,incoming.hangar.credits+incoming.hangar.spent)-merged.hangar.spent);

  if(Object.hasOwn(merged,'readyPlan')){
    // Reservations never remove imported buildings. Blocked lots keep their
    // identity and coordinates; append-only preparation offers a free option.
    repairHarbors(merged,registry,data.featureFlags);
    prepareReadyPlan(merged,registry,data.featureFlags);
  }

  merged.updatedAt = Date.now();
  const validation = validateSave(merged, data, registry);
  return validation.ok ? { ok: true, state: merged, added, conflicts } : validation;
}
