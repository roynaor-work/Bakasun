import {polishValue} from './polish-flag.mjs';

/** 20/11/2026: `?fireRescueActions=0` keeps the multi-floor building but goes back to tapping the friend (no rescue button, clips or props). */
export function fireRescueActionsEnabled(search){return polishValue('fireRescueActions',search)!=='0';}

const CLIP_FRAMES = {'clear-path':73,'lift-child':72,'carry-arms':78,'set-down':78,'lift-cat':75};
const SEQUENCES = {
  girl:['lift-child','carry-arms','set-down'],
  cat:['lift-cat'],
  dog:['clear-path'],
};

export const rescueAssetRoot = 'assets/fire-levels-v1/rescue/';
export function rescueAssetFiles(){
  return ['firefighter.glb','fire-rescue-actions.glb','catalog.json',...Object.keys(CLIP_FRAMES).map(id=>'icons/'+id+'.svg')]
    .map(path=>rescueAssetRoot+path);
}

function action(id,elapsed,active){
  return {id,elapsed,active,duration:CLIP_FRAMES[id]/30};
}

/** One press starts one uninterrupted action. Each room keeps its own sequence. */
export function createInteriorRescue(){
  const states=new WeakMap();
  function available(room){
    if(room.handover||room.friend.state!=='waiting')return null;
    const adjacent=room.spots.find(spot=>spot.id===room.friend.near);
    if(adjacent&&!adjacent.done)return null;
    const state=states.get(room),id=SEQUENCES[room.friend.id]?.[state?.index??0];
    return id?action(id,state?.elapsed??0,state?.elapsed!==null&&state?.elapsed!==undefined):null;
  }
  return {
    available,
    engaged:room=>states.has(room)&&room.friend.state==='waiting',
    pose(room){
      if(room.handover)return null;
      const state=states.get(room);
      if(!state)return null;
      const {id}=room.friend;
      if(room.friend.state==='walking'&&id==='cat')return {...state.previous,exitProgress:room.friend.t};
      if(room.friend.state!=='waiting')return null;
      return state.elapsed===null?state.previous:available(room);
    },
    update(room,dt,requested){
      const next=available(room);
      if(!next)return false;
      let state=states.get(room);
      if(!next.active){
        if(requested!==next.id)return false;
        state=state||{index:0,previous:null};
        states.set(room,state);
        state.elapsed=0;
        return false;
      }
      state.elapsed=Math.min(next.duration,state.elapsed+dt);
      if(state.elapsed<next.duration)return false;
      state.previous=action(next.id,next.duration,false);
      state.elapsed=null;
      state.index++;
      return state.index===SEQUENCES[room.friend.id].length;
    }
  };
}
