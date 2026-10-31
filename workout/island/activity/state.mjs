import {initialAlienUpgrades,validAlienUpgrades} from './alien-upgrades.mjs?v=island-ski-20261031-1';
import {initialEquipment,validEquipment} from './equipment.mjs?v=island-ski-20261031-1';
import {initialProgress,validProgress,applyStarEquipment} from './progress.mjs?v=island-ski-20261031-1';
const object = value => value && typeof value==='object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value>=0;
const time = value => Number.isFinite(value) && value>=0;
export function initialActivity(data,now) {
  return {alienUpgrades:initialAlienUpgrades(data),minigameEquipment:initialEquipment(data),minigameProgress:initialProgress(data),minigameLevels:Object.fromEntries(Object.keys(data.config.minigameLevels||{}).map(id=>[id,1])),highScores:{},minigameWins:{},instructionsSeen:[],events:{counts:{},lastAt:{},nextAt:now+(data.config.events?.initialDelayMs||0),sequence:0,active:null,repairs:{},resolved:[]}};
}
export function validActivity(state,data,registry) {
  const games=data.config.minigameLevels||{}, events=state.events;
  if(!validAlienUpgrades(state.alienUpgrades,data))return false;
  if(!validEquipment(state.minigameEquipment,data))return false;
  if(!validProgress(state.minigameProgress,data))return false;
  if(!object(state.minigameLevels)||!object(state.highScores)||!object(state.minigameWins)||!Array.isArray(state.instructionsSeen))return false;
  if(!Object.keys(games).every(id=>Number.isInteger(state.minigameLevels[id])&&state.minigameLevels[id]>=1&&state.minigameLevels[id]<=games[id].length))return false;
  if(!Object.keys(state.minigameLevels).every(id=>id in games))return false;
  for(const table of [state.highScores,state.minigameWins])if(!Object.entries(table).every(([id,n])=>id in games&&count(n)))return false;
  if(!state.instructionsSeen.every(id=>id in games))return false;
  if(!object(events)||!object(events.counts)||!object(events.lastAt)||!object(events.repairs)||!count(events.sequence)||!time(events.nextAt)||!Array.isArray(events.resolved)||events.resolved.length>(data.config.events?.historyLimit||0))return false;
  const known=id=>Boolean(data.config.events?.types[id]);
  if(!Object.entries(events.counts).every(([id,n])=>known(id)&&count(n))||!Object.entries(events.lastAt).every(([id,n])=>known(id)&&time(n)))return false;
  if(!events.resolved.every(id=>typeof id==='string'&&/^event-\d+$/.test(id)))return false;
  const buildings=new Set(state.buildings.map(b=>b.id));
  if(!Object.entries(events.repairs).every(([id,until])=>buildings.has(id)&&time(until)))return false;
  const a=events.active;
  return a===null || (object(a)&&/^event-\d+$/.test(a.id)&&known(a.typeId)&&registry.eventTypes.has(a.typeId)&&['warning','ready','playing'].includes(a.phase)&&time(a.warningUntil)&&count(a.seed)&&a.seed<=0xffffffff&&typeof a.deferred==='boolean'&&(a.targetId===null||buildings.has(a.targetId)));
}
export function mergeActivity(current,incoming,data) {
  for(const [id,rank] of Object.entries(incoming.alienUpgrades))current.alienUpgrades[id]=Math.max(current.alienUpgrades[id],rank);
  for(const [id,tracks]of Object.entries(incoming.minigameEquipment))for(const [key,rank]of Object.entries(tracks))current.minigameEquipment[id][key]=Math.max(current.minigameEquipment[id][key],rank);
  for(const key of ['minigameLevels','highScores','minigameWins'])for(const [id,value] of Object.entries(incoming[key]))current[key][id]=Math.max(current[key][id]||0,value);
  for(const [id,p]of Object.entries(incoming.minigameProgress)){
    const target=current.minigameProgress[id];target.stage=Math.max(target.stage,p.stage);target.stars=target.stars.map((n,i)=>Math.max(n,p.stars[i]));applyStarEquipment(current,data,id);
  }
  current.instructionsSeen=[...new Set([...current.instructionsSeen,...incoming.instructionsSeen])];
  const a=current.events,b=incoming.events;
  for(const key of ['counts','lastAt'])for(const [id,value]of Object.entries(b[key]))a[key][id]=Math.max(a[key][id]||0,value);
  a.sequence=Math.max(a.sequence,b.sequence);a.nextAt=Math.max(a.nextAt,b.nextAt);
  a.resolved=[...new Set([...a.resolved,...b.resolved])].slice(-data.config.events.historyLimit);
  if(a.active&&a.resolved.includes(a.active.id))a.active=null;
  if(!a.active&&b.active&&!a.resolved.includes(b.active.id)&&(!b.active.targetId||current.buildings.some(r=>r.id===b.active.targetId)))a.active=structuredClone(b.active);
  for(const [id,until]of Object.entries(b.repairs))if(current.buildings.some(r=>r.id===id))a.repairs[id]=Math.min(a.repairs[id]??until,until);
}
