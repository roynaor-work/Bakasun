/** Naval content stays separate from save, reward and simulation contracts. */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-11';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
/** 11/11/2026 (Roy, phone: "צריך גם לבנות בסיס שצריך להתקיף, עם תותחים וכדומה, נגיד כל 5 שלבים"): a fortified enemy base on stages
 * 5, 15 and 25 (stages 10, 20 and 30 keep their moving fleets: the v20 aim test and the hold-release pilot tests run there). The stage's `base` block names the variant and the
 * structures; the rows it adds are stationary `behavior:'base'` entities with a `structure` kind, so shore cannons telegraph and fire like
 * the stage-9 bases. The model adds them beside the stage's fleet (the campaign roster and its mission keep the v20 contract) and the stage
 * is won only when the fleet objective and the base's main targets are both done. `?navalBase=0` leaves those stages as they were. */
export const navalBaseEnabled=search=>polishValue('navalBase',search)!=='0';
export const NAVAL_BASE_DEFAULTS=Object.freeze({x:80,hp:{gun:1.2,tower:.7,gate:2.4,depot:1,pen:1.6},scale:{gun:1.1,tower:1.4,gate:2.2,depot:1.3,pen:1.9},spread:14,telegraph:2.1,chainRadius:75,chainDamage:.6});
/** Structure rows for a base block: guns along the shore (they fire), towers behind, a gate in the middle, the ammo depot at the back (explodes
 * into its neighbours), a submarine pen on the `subpen` variant. Positions are offsets from `enemyX`; main targets end the mission. */
export function navalBaseRows(base,stage=1,balance){
 if(!base)return [];const d={...NAVAL_BASE_DEFAULTS,...(balance?.base||{})},armor=base.armor??1,reload=base.reload??8,guns=clamp(integer(base.guns,2),1,6),towers=clamp(integer(base.towers,1),0,4),x=base.x??d.x,rows=[];
 const row=(structure,ox,oz,extra={})=>rows.push({kind:1,behavior:'base',structure,variant:base.variant||'coast',x:x+ox,z:oz,cannons:0,reload,spread:base.spread??d.spread,telegraph:base.telegraph??d.telegraph,hpScale:+(d.hp[structure]*armor).toFixed(3),scale:d.scale[structure],main:true,...extra});
 for(let i=0;i<guns;i++){const z=(i-(guns-1)/2)*44;row('gun',-12+Math.abs(z)*.08,z,{cannons:1,reload:reload*(1+i*.07)});}
 for(let i=0;i<towers;i++)row('tower',22,(i-(towers-1)/2)*70+(towers%2?0:0),{main:false});
 if(base.gate!==false)row('gate',6,0);
 if(base.depot!==false)row('depot',30,guns>=3?48:30,{chain:true});
 if(base.variant==='subpen')row('pen',36,-52,{});
 return rows.map((r,i)=>({...r,baseIndex:i}));
}
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
  fleet=settings.fleet.map(row=>({kind:clamp(integer(row.kind,0),0,kinds-1),behavior:row.behavior||'patrol',boss:row.boss===true,...(row.behavior==='base'?{cannons:row.cannons,reload:row.reload,spread:row.spread,telegraph:row.telegraph,hpScale:row.hpScale,scale:row.scale,baseX:row.x,baseZ:row.z,damageScale:row.damageScale}:{})}));
  // The flagship always arrives last. Escorts swap entry positions between runs.
  const escorts=fleet.filter(row=>!row.boss&&row.behavior!=='base'),flagships=fleet.filter(row=>row.boss),bases=fleet.filter(row=>row.behavior==='base');
  const rotate=offset=>[...escorts.slice(offset),...escorts.slice(0,offset),...flagships,...bases].map(row=>({...row}));
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
 else if(mission?.id==='bases'){targets=enemies.filter(e=>e.behavior==='base'&&e.main!==false);if(!targets.length)targets=enemies.filter(e=>e.behavior==='base');}
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
