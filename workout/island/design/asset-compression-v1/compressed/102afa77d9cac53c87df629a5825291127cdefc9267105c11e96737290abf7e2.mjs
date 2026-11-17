/** Purchased tracks are additive to G2b's unchanged coin/star equipment levels. */
export function initialEquipment(data) {
  return Object.fromEntries(Object.keys(data.config.minigameLevels).map(id=>[id,
    Object.fromEntries(Object.keys(data.config.minigames[id].equipment||{}).map(key=>[key,0]))]));
}
export function validEquipment(equipment,data) {
  if(!equipment||typeof equipment!=='object'||Array.isArray(equipment))return false;
  const defaults=initialEquipment(data);
  if(Object.keys(equipment).length!==Object.keys(defaults).length)return false;
  return Object.entries(defaults).every(([id,tracks])=>{
    const row=equipment[id];
    return row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===Object.keys(tracks).length&&
      Object.keys(tracks).every(key=>Number.isInteger(row[key])&&row[key]>=0&&row[key]<=data.config.minigames[id].equipment[key].levels.length);
  });
}
export function equipmentValues(state,data,id) {
  const values={};
  for(const [key,track]of Object.entries(data.config.minigames[id]?.equipment||{})) {
    const rank=state.minigameEquipment[id][key];values[key]=rank?track.levels[rank-1].value:track.base;
  }
  return Object.freeze(values);
}
export function equipmentOffer(state,data,id,key) {
  const track=data.config.minigames[id]?.equipment?.[key],rank=state.minigameEquipment[id]?.[key];
  const next=track?.levels?.[rank];
  if(!next)return {ok:false,reason:'app.maxLevel'};
  const stars=state.minigameProgress[id].stars.reduce((sum,n)=>sum+n,0);
  return {...next,title:track.title,rank:rank+1,ok:stars>=next.stars&&state.money>=next.cost,
    reason:stars<next.stars?'equipment.starsReason':state.money<next.cost?'reason.money':undefined};
}
