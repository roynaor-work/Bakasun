import {equipmentOffer} from './equipment.mjs?v=island-alpine-20261028-1';
import {gameAvailability} from './availability.mjs?v=island-alpine-20261028-1';
import {eventEligible} from './eligibility.mjs?v=island-alpine-20261028-1';
import {seededRandom} from '../minigames/context.mjs?v=island-alpine-20261028-1';
import {buildingCenter,levelFactor} from '../engine/metrics.mjs?v=island-alpine-20261028-1';

export function createActivity(engine,{now=Date.now,random=seededRandom(now()),blocked=()=>false,onLaunch}={}) {
  const {state,data,registry}=engine,config=data.config.events,listeners=new Set();
  let disposed=false,playing=false;
  // Reloads never resume a half-created canvas or award an unfinished result.
  if(state.events.active?.phase==='playing'){state.events.active.phase='ready';engine.save();}
  const emit=()=>{for(const listener of listeners)listener();};
  const save=()=>{const saved=engine.save();engine.city?.emergency();emit();return saved;};
  const busy=()=>blocked()||engine.isMinigameActive()||(!state.tutorial.completed&&!state.tutorial.skipped)||!state.avatar.created;
  const enabled=id=>data.featureFlags.events&&data.featureFlags[config.types[id]?.featureFlag]&&data.featureFlags.minigames&&data.featureFlags[config.types[id]?.gameId];
  function bonuses(event=state.events.active) {
    if(event?.typeId!=='fire'||!event.targetId)return {};
    const target=state.buildings.find(b=>b.id===event.targetId);if(!target)return {};
    const center=buildingCenter(target,registry);
    const covered=state.buildings.some(b=>{
      if(b.typeId!=='fireStation'||state.events.repairs[b.id]>now())return false;
      const source=buildingCenter(b,registry),radius=registry.buildings.get(b.typeId).radius*levelFactor(b,data.config);
      return Math.hypot(source.x-center.x,source.z-center.z)<=radius;
    });
    return covered?{fireTime:config.fireTimeBonus,fireWater:config.fireWaterBonus}:{};
  }
  const lastType=()=>Object.entries(state.events.lastAt).reduce((last,row)=>!last||row[1]>=last[1]?row:last,null)?.[0];
  const eligible=id=>eventEligible(state,config.types[id].eligibility);
  function prepare(typeId) {
    if(disposed||busy()||state.events.active||!enabled(typeId)||!eligible(typeId)||(config.avoidConsecutive&&lastType()===typeId))return {ok:false,reason:'event.unavailable'};
    const at=now(),type=config.types[typeId];
    if(state.events.sequence>=Number.MAX_SAFE_INTEGER)return {ok:false,reason:'reason.invalid'};
    if(state.events.lastAt[typeId]!=null&&at-state.events.lastAt[typeId]<type.cooldownMs)return {ok:false,reason:'event.unavailable'};
    const seed=Math.floor(random()*0x100000000)>>>0;
    const prepared=engine.prepareEvent(typeId,{random:seededRandom(seed)});
    if(!prepared.ok||!prepared.prepared)return {ok:false,reason:'event.noTarget'};
    state.events.sequence++;
    state.events.active={id:`event-${state.events.sequence}`,typeId,targetId:prepared.prepared.targetId,seed,phase:'warning',warningUntil:at+config.warningMs,deferred:false};
    state.events.counts[typeId]=(state.events.counts[typeId]||0)+1;delete state.events.lastAt[typeId];state.events.lastAt[typeId]=at;
    engine.narration.announce(type.warningId);save();return {ok:true,event:state.events.active};
  }
  function complete(outcome,automatic=false) {
    const event=state.events.active;if(!event)return {ok:false,reason:'event.unavailable'};
    if(event.typeId==='fire'&&event.targetId) {
      if(outcome==='lose')state.events.repairs[event.targetId]=now()+config.repairMs;
      else delete state.events.repairs[event.targetId];
    }
    playing=false;
    if(outcome==='lose'&&!automatic)event.phase='ready';
    else {
      state.events.resolved.push(event.id);state.events.resolved=state.events.resolved.slice(-config.historyLimit);
      state.events.active=null;state.events.nextAt=now()+config.minGapMs;
    }
    save();return {ok:true,outcome};
  }
  const api={
    prepare,bonuses,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    tick() {
      if(disposed)return;
      let repaired=false;for(const [id,until]of Object.entries(state.events.repairs))if(until<=now()||!state.buildings.some(b=>b.id===id)){delete state.events.repairs[id];repaired=true;}
      if(repaired)save();
      if(busy()||playing)return;
      const event=state.events.active;
      if(event){
        if(enabled(event.typeId)&&event.phase==='warning'&&now()>=event.warningUntil){event.phase='ready';save();}
        if(enabled(event.typeId)&&event.phase==='ready'&&onLaunch&&gameAvailability(state,data.config,config.types[event.typeId].gameId).ok){const choice=api.choose('play');if(choice.ok)onLaunch(choice);}
        return;
      }
      if(now()<state.events.nextAt)return;
      const candidates=Object.keys(config.types).filter(id=>config.types[id].weight>0&&enabled(id)&&eligible(id)&&(!config.avoidConsecutive||id!==lastType())&&(state.events.lastAt[id]==null||now()-state.events.lastAt[id]>=config.types[id].cooldownMs));
      if(candidates.length){
        const total=candidates.reduce((sum,id)=>sum+config.types[id].weight,0);let draw=random()*total;
        const chosen=candidates.find(id=>(draw-=config.types[id].weight)<0)??candidates.at(-1);
        if(!prepare(chosen).ok)state.events.nextAt=now()+config.minGapMs;
      }
    },
    choose(action) {
      const event=state.events.active;if(!event||!enabled(event.typeId)||busy()||playing||!config.actions.some(row=>row.id===action))return {ok:false,reason:'event.unavailable'};
      if(action==='defer'){
        if(event.deferred)return {ok:false,reason:'event.unavailable'};
        event.deferred=true;event.phase='warning';event.warningUntil=Math.max(now(),event.warningUntil)+config.deferMs;save();return {ok:true,deferred:true};
      }
      if(event.phase!=='ready')return {ok:false,reason:'event.unavailable'};
      if(action==='auto')return complete(registry.eventTypes.get(event.typeId).apply({state,engine,random:seededRandom(event.seed)}).outcome,true);
      const available=gameAvailability(state,data.config,config.types[event.typeId].gameId);
      if(!available.ok)return available;
      playing=true;event.phase='playing';save();return {ok:true,gameId:config.types[event.typeId].gameId,eventId:event.id};
    },
    resolve(eventId,result) {if(state.events.active?.id!==eventId)return {ok:false,reason:'event.unavailable'};return complete(result.outcome);},
    cancel(eventId) {if(state.events.active?.id===eventId){
      playing=false;state.events.resolved.push(eventId);state.events.resolved=state.events.resolved.slice(-config.historyLimit);
      state.events.active=null;state.events.nextAt=now()+config.minGapMs;save();
    }},
    repair(id) {
      if(!(state.events.repairs[id]>now()))return {ok:false,reason:'event.unavailable'};
      if(state.money<config.repairCost)return {ok:false,reason:'reason.money'};
      state.money-=config.repairCost;delete state.events.repairs[id];save();return {ok:true};
    },
    upgrade(gameId,trackId) {
      if(engine.isMinigameActive())return {ok:false,reason:'reason.gameBusy'};
      if(trackId){
        const offer=equipmentOffer(state,data,gameId,trackId);if(!offer.ok)return offer;
        state.money-=offer.cost;state.minigameEquipment[gameId][trackId]=offer.rank;save();return {ok:true};
      }
      const level=state.minigameLevels[gameId],next=data.config.minigameLevels[gameId]?.[level];
      if(!next)return {ok:false,reason:'reason.invalid'};
      if(state.money<next.cost)return {ok:false,reason:'reason.money'};
      state.money-=next.cost;state.minigameLevels[gameId]++;save();return {ok:true};
    },
    instructions(gameId){if(!state.instructionsSeen.includes(gameId)){state.instructionsSeen.push(gameId);save();}},
    dispose(){disposed=true;unsubscribe();listeners.clear();}
  };
  const unsubscribe=engine.subscribe((_,event)=>{
    if(!['remove','undo','import'].includes(event.type))return;
    const active=state.events.active;
    if(event.type==='import'&&active?.phase==='playing'){playing=false;active.phase='ready';}
    if(active?.targetId&&!state.buildings.some(b=>b.id===active.targetId))complete('win',true);
    for(const id of Object.keys(state.events.repairs))if(!state.buildings.some(b=>b.id===id))delete state.events.repairs[id];
    save();
  });return api;
}
