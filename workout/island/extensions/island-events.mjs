import {eventEligible} from '../activity/eligibility.mjs?v=island-naval-aim-20261029-1';
import {seededRandom} from '../minigames/context.mjs?v=island-naval-aim-20261029-1';
export function install(registry,data) {
  for(const [id,record]of Object.entries(data.config.events.types))registry.registerEventType({id,...record,
    prepare({state,random=seededRandom(state.events.sequence)}){
      const candidates=state.buildings.filter(b=>!['road','cityHall'].includes(b.typeId));
      if(!eventEligible(state,record.eligibility))return null;
      return {targetId:id==='ship'?null:candidates[Math.floor(random()*candidates.length)]?.id??null};
    },
    apply({random=seededRandom(0)}){return {outcome:random()<data.config.events.autoWinChance?'win':'lose'};}
  });
}
