import {initialCity} from '../../workout/island/engine/city-depth.mjs';
import {initialCityManagement} from '../../workout/island/engine/city-management.mjs';
import {initialHoops} from '../../workout/island/minigames/hoops-franchise.mjs';
/** Expected additive content changes for authentic historical fixture assertions.
 * Values already earned are copied; only new content receives empty defaults.
 * Corrupt/current-format saves are tested independently, without this helper. */
export function expectedGameField(key,value,data){
  const ids=Object.keys(data.config.minigameLevels),copy=structuredClone(value);
  if(key==='minigameProgress'){
    for(const id of ids){const count=data.config.minigames[id].levels.length;
      if(!copy[id])copy[id]={stage:1,stars:Array(count).fill(0)};
      else if(copy[id].stars.length<count){const oldCount=copy[id].stars.length;if(copy[id].stage===oldCount&&copy[id].stars[oldCount-1]>0)copy[id].stage=oldCount+1;copy[id].stars.push(...Array(count-oldCount).fill(0));}
    }
  }else if(key==='minigameLevels'){
    for(const id of ids)if(!(id in copy))copy[id]=1;
  }else if(key==='minigameEquipment'){
    for(const id of ids)if(!(id in copy))copy[id]=Object.fromEntries(Object.keys(data.config.minigames[id].equipment||{}).map(track=>[track,0]));
  }else if(key==='fireCertificates')copy.push(...Array(Math.max(0,data.config.minigames.fireRescue.levels.length-copy.length)).fill(null));
  return copy;
}
export function expectedGameContent(world,data){
  const result={...world,cityDepthVersion:1,city:world.city||initialCity(),cityManagement:world.cityManagement||initialCityManagement(),hoops:world.hoops||initialHoops(data.config.minigames.streetSlam)};for(const key of ['minigameProgress','minigameLevels','minigameEquipment','fireCertificates'])if(key in result)result[key]=expectedGameField(key,result[key],data);return result;
}
