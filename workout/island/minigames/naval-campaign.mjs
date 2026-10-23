/** Naval content stays separate from save, reward and simulation contracts. */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const integer=(value,fallback=1)=>Number.isInteger(value)?value:fallback;

/** The second and third acts add tactics, rather than tripling invisible aim error. */
export function navalStagePressure(stage=1){
 const n=clamp(integer(stage),1,30);
 return n<=10?n:10+(n-10)*.25;
}

/** Resolve a content-owned fleet without using the simulation's random stream. */
export function navalCampaignStage(balance,stage,seed=0,previousFleet=''){
 const n=clamp(integer(stage),1,balance.levels.length),settings=balance.levels[n-1];
 const count=integer(settings.waves),kinds=balance.shipTypes.length;
 let fleet;
 if(Array.isArray(settings.fleet)&&settings.fleet.length===count){
  fleet=settings.fleet.map(row=>({kind:clamp(integer(row.kind,0),0,kinds-1),behavior:row.behavior||'patrol',boss:row.boss===true}));
  // The flagship always arrives last. Escorts swap entry positions between runs.
  const escorts=fleet.filter(row=>!row.boss),flagships=fleet.filter(row=>row.boss);
  const rotate=offset=>[...escorts.slice(offset),...escorts.slice(0,offset),...flagships].map(row=>({...row}));
  let offset=(seed>>>0)%Math.max(1,escorts.length);
  fleet=rotate(offset);
  if(fleet.map(row=>row.kind).join()===previousFleet&&escorts.length>1)fleet=rotate((offset+1)%escorts.length);
 }else{
  let offset=(seed>>>0)%kinds;
  const make=()=>Array.from({length:count},(_,i)=>({kind:(i+offset)%kinds,boss:n%balance.boss.everyStages===0&&i===count-1,behavior:balance.shipTypes[(i+offset)%kinds].submarine?'dive':'patrol'}));
  fleet=make();if(fleet.map(row=>row.kind).join()===previousFleet){offset=(offset+1)%kinds;fleet=make();}
 }
 const mission={id:'fleet',title:settings.feature,brief:'naval.mission.brief.fleet',...settings.mission};
 return {settings,mission,fleet,pressure:navalStagePressure(n)};
}

/** Priority missions finish when their actual targets sink; escorts may withdraw. */
export function navalMissionState(mission,enemies){
 let targets;
 if(mission?.id==='flagship')targets=enemies.filter(e=>e.boss);
 else if(mission?.id==='intercept')targets=enemies.filter(e=>e.behavior==='flank');
 else if(mission?.id==='subhunt')targets=enemies.filter(e=>e.behavior==='dive');
 if(!targets?.length)targets=enemies;
 const total=targets.length,completed=targets.filter(e=>e.hp<=0).length;
 return {completed,total,complete:total>0&&completed===total};
}

/** Conservative audit: ignores mines, splash and all paid upgrades. */
export function navalAmmoBudget(balance,settings,fleet){
 const fleetHp=fleet.reduce((sum,row)=>sum+settings.enemyLives*balance.shipTypes[row.kind].hp*(row.boss?balance.boss.hp:1),0);
 const scale=settings.damage*(1+(settings.weaponLevel-1)*.1);
 const normalEquivalent=[0,1,2,4].reduce((sum,kind)=>sum+(settings.ammunition[kind]||0)*balance.ammo[kind].damage,0)*scale;
 return {fleetHp,normalEquivalent,ratio:fleetHp>0?normalEquivalent/fleetHp:0};
}

/** Content-only adapter for the coordinator's load hook; never repairs invalid data. */
export function extendNavalProgress(progress,count=30){
 if(!progress||!Array.isArray(progress.stars)||progress.stars.length!==10||!Number.isInteger(count)||count<=10)return progress;
 const {stars,stage}=progress;
 if(!Number.isInteger(stage)||stage<1||stage>10||!stars.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=3&&(i<stage-1?n>0:i>=stage?n===0:stage===10||n===0)))return progress;
 return {...progress,stage:stage===10&&stars[9]>0?11:stage,stars:[...stars,...Array(count-10).fill(0)]};
}
