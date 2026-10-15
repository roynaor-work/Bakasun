/** Stage progress is independent of city expansion and purchased equipment. */
export function initialProgress(data) {
  return Object.fromEntries(Object.keys(data.config.minigameLevels||{}).map(id=>[
    id,{stage:1,stars:Array(data.config.minigames[id].levels.length).fill(0)}
  ]));
}
export function validProgress(progress,data) {
  if(!progress||typeof progress!=='object'||Array.isArray(progress))return false;
  const ids=Object.keys(data.config.minigameLevels||{});
  if(Object.keys(progress).length!==ids.length)return false;
  return ids.every(id=>{
    const p=progress[id],count=data.config.minigames[id].levels.length;
    if(!p||!Number.isInteger(p.stage)||p.stage<1||p.stage>count||!Array.isArray(p.stars)||p.stars.length!==count)return false;
    return p.stars.every((n,i)=>{
      if(!Number.isInteger(n)||n<0||n>3)return false;
      if(i<p.stage-1)return n>0; // Every preceding stage must have been won.
      if(i>=p.stage)return n===0; // Later stages cannot carry stars.
      return p.stage===count||n===0; // A won stage unlocks the next one immediately.
    });
  });
}
export function applyStarEquipment(state,data,id) {
  const total=state.minigameProgress[id].stars.reduce((sum,n)=>sum+n,0);
  for(const bonus of data.config.minigames.starBonuses)if(total>=bonus.stars)state.minigameLevels[id]=Math.max(state.minigameLevels[id],bonus.upgradeLevel);
}
export function recordStageWin(state,data,id,stage,stars) {
  const p=state.minigameProgress[id];p.stars[stage-1]=Math.max(p.stars[stage-1],stars);
  if(stage===p.stage)p.stage=Math.min(p.stars.length,stage+1);
  applyStarEquipment(state,data,id);
}
