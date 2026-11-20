/** 14/11/2026 fire v24 (Roy, after v23: "it works but needs a serious upgrade in everything: control, understanding, graphics; and it
 * should not be separate: you reach the building inside the stages and the firefighter goes in to put the fire out; and on a clock").
 * Pure data and rules of the building entry that now lives inside the regular campaign:
 *  - every third stage from stage 3 (3, 6, ..., 30) is an entry stage: the engine drives to the burning building, a door marker
 *    appears, "enter" starts the rooms, the firefighter clears them (fire, rescue) on a room clock, comes out, and the street
 *    stage ends as before. Saved progress, stars and certificates keep their shape: the entry only changes the raw result of the stage.
 *  - `?fireFlow=v23` restores v23 exactly (bonus missions after the campaign, no entry inside the stages).
 * No DOM here. Rooms are in metres, the Codex fire-rooms-v1 frame: floor centre at the origin, +Y up, open front at +Z. */
import {polishValue} from './polish-flag.mjs';

/** On unless `?fireFlow=v23`. */
export function fireFlowV24(search){return polishValue('fireFlow',search)!=='v23';}
/** Stages whose street drive leads into the building. */
export const ENTRY_EVERY=3,ENTRY_FIRST=3;
export function isEntryStage(level,campaignLength=30){return Number.isInteger(level)&&level>=ENTRY_FIRST&&level<=campaignLength&&(level-ENTRY_FIRST)%ENTRY_EVERY===0;}
export function entryStages(campaignLength=30){const out=[];for(let l=ENTRY_FIRST;l<=campaignLength;l+=ENTRY_EVERY)out.push(l);return out;}

export const V24_TUNING=Object.freeze({
  arriveRadius:6.5,            // truck to the building door (world units of the street) that opens the door
  parkedSpeed:.6,
  enterSeconds:.9,leaveSeconds:1.1,roomIntroSeconds:2.2,clearSeconds:1.5,handoverSeconds:1.6,
  cool:.62,                    // heat per second at effectiveness 1 (a normal spot of heat 1 goes out in ~1.6 s of good aim)
  reach:.55,                   // metres beyond a spot radius that still count as a hit
  assist:1.05,                 // metres: the aim snaps onto a fire anchor this close
  heat:{normal:1,electric:1,oil:1,heavy:1.6},
  points:{normal:60,electric:90,oil:90,heavy:110,rescue:150,roomClear:120},
  pressure:{drain:.14,refill:.34,restart:.3},
  smokeFloor:1.05,             // metres: the smoke layer never comes lower than this (the child is never blinded)
  warnSeconds:10,              // "ten seconds left": voice, colour
  starPar:.5,                  // finishing in half the room time = full time score
  weight:{street:.5,inside:.5},
  insideWeight:{time:.6,rescue:.4},
});
/** Tool against a fire kind: a number scales the cooling; 'spark' = electricity (a warning, nothing happens), 'flare' = oil and water (it grows). */
export const EFFECT=Object.freeze({
  normal:{water:1,extinguisher:1,foam:1.1},
  electric:{water:'spark',extinguisher:1.3,foam:'spark'},
  oil:{water:'flare',extinguisher:.45,foam:.6},
  heavy:{water:.3,extinguisher:.45,foam:1.4},
});
export const TOOLS=Object.freeze(['water','extinguisher','blanket','foam']);

/** Room catalogue. Codex rooms (fire-rooms-v1) name their burnable items; `at` is the item (its fire_<name> anchor gives the position).
 * The hallway and the stairwell have no Codex file yet: they are built from simple shapes in the scene with hand placed anchors (`pos`). */
export const ROOMS=Object.freeze({
  living:{id:'living',file:'living-room.glb',titleKey:'fire.v24.room.living',rescueSpot:[1.77,0,1.08],exit:[2.38,0,-2.42],
    spots:{sofa:{at:'sofa',kind:'normal',r:.9},rug:{at:'rug',kind:'normal',r:.8},television:{at:'television',kind:'electric',r:.6},curtain_left:{at:'curtain_left',kind:'normal',r:.6},coffee_table:{at:'coffee_table',kind:'normal',r:.6},floor_lamp:{at:'floor_lamp',kind:'normal',r:.5}}},
  kitchen:{id:'kitchen',file:'kitchen.glb',titleKey:'fire.v24.room.kitchen',rescueSpot:[2.18,0,1.32],exit:[2.38,0,-2.42],
    spots:{oil_pot:{at:'oil_pot',kind:'oil',r:.5},kitchen_table:{at:'kitchen_table',kind:'normal',r:.8},power_strip:{at:'power_strip',kind:'electric',r:.5},chair_left:{at:'chair_left',kind:'normal',r:.5},base_cabinet:{at:'base_cabinet',kind:'normal',r:.7},refrigerator:{at:'refrigerator',kind:'normal',r:.7}}},
  bedroom:{id:'bedroom',file:'bedroom.glb',titleKey:'fire.v24.room.bedroom',rescueSpot:[.15,0,1.55],exit:[2.38,0,-2.42],
    spots:{mattress:{at:'mattress',kind:'heavy',r:.95},wardrobe:{at:'wardrobe',kind:'heavy',r:.85},curtain_left:{at:'curtain_left',kind:'normal',r:.6},desk:{at:'desk',kind:'normal',r:.7},computer:{at:'computer',kind:'electric',r:.5},nightstand:{at:'nightstand',kind:'normal',r:.5}}},
  hallway:{id:'hallway',file:null,titleKey:'fire.v24.room.hallway',rescueSpot:[1.6,0,1.2],exit:[2.6,0,-2.3],
    spots:{coat_rack:{pos:[-2.5,1.1,-1.9],kind:'normal',r:.6},shoe_cabinet:{pos:[-.4,.5,-2],kind:'normal',r:.7},boxes:{pos:[1.9,.5,-1.6],kind:'normal',r:.7},picture:{pos:[-1.3,1.7,-2.2],kind:'normal',r:.5},bench:{pos:[-2.2,.45,.6],kind:'normal',r:.7}}},
  stairwell:{id:'stairwell',file:null,titleKey:'fire.v24.room.stairwell',rescueSpot:[-2.2,0,1.3],exit:[2.6,0,-2.3],
    spots:{mailboxes:{pos:[-2.6,1.1,-1.9],kind:'electric',r:.6},stroller:{pos:[1.6,.5,.2],kind:'normal',r:.7},stair_rail:{pos:[.2,1.4,-1.2],kind:'normal',r:.8},bin:{pos:[2.5,.4,-1.6],kind:'normal',r:.5},notice_board:{pos:[-1.2,1.6,-2.2],kind:'normal',r:.5}}},
});
export const FRIENDS=Object.freeze({girl:{file:'girl.glb',height:1.39,kind:'kid'},cat:{file:'cat.glb',height:1.08,kind:'pet'},dog:{file:'dog.glb',height:1,kind:'pet'}});

/** What the firefighter meets inside on each entry stage: rooms in order, which fires burn, which rule and tool the rooms teach, the friend to
 * carry out, and the clock. The clock per room = base + a little per fire. Easy first (water only, one room, tutorial), then rules one at a time,
 * then two or three rooms. Pure data: the same stage always gives the same plan. */
export const ENTRY_PLANS=Object.freeze([
  {level:3,tutorial:true,rooms:[{room:'living',fires:['sofa','rug'],friend:'dog'}],tools:['water'],seconds:50},
  {level:6,rooms:[{room:'kitchen',fires:['kitchen_table','chair_left','base_cabinet'],friend:'cat'}],tools:['water'],seconds:52},
  {level:9,rooms:[{room:'hallway',fires:['coat_rack','boxes'],friend:'cat'},{room:'living',fires:['television','sofa','rug'],friend:'girl'}],tools:['water','extinguisher'],seconds:48},
  {level:12,rooms:[{room:'kitchen',fires:['oil_pot','kitchen_table','power_strip'],friend:'dog'},{room:'bedroom',fires:['curtain_left','desk','nightstand'],friend:'girl'}],tools:['water','extinguisher','blanket'],seconds:50},
  {level:15,rooms:[{room:'stairwell',fires:['stroller','stair_rail','mailboxes'],friend:'dog'},{room:'kitchen',fires:['oil_pot','refrigerator','chair_left'],friend:'cat'}],tools:['water','extinguisher','blanket'],seconds:48},
  {level:18,rooms:[{room:'living',fires:['curtain_left','television','coffee_table'],friend:'cat'},{room:'bedroom',fires:['mattress','curtain_left','computer'],friend:'girl'}],tools:['water','extinguisher','blanket','foam'],seconds:50},
  {level:21,rooms:[{room:'hallway',fires:['shoe_cabinet','picture','bench'],friend:'dog'},{room:'kitchen',fires:['oil_pot','base_cabinet','power_strip'],friend:'cat'},{room:'bedroom',fires:['wardrobe','desk'],friend:'girl'}],tools:['water','extinguisher','blanket','foam'],seconds:46},
  {level:24,rooms:[{room:'stairwell',fires:['bin','stroller','notice_board'],friend:'cat'},{room:'living',fires:['sofa','television','floor_lamp'],friend:'dog'},{room:'bedroom',fires:['mattress','wardrobe'],friend:'girl'}],tools:['water','extinguisher','blanket','foam'],seconds:46},
  {level:27,rooms:[{room:'hallway',fires:['coat_rack','boxes','bench'],friend:'dog'},{room:'kitchen',fires:['oil_pot','kitchen_table','refrigerator','power_strip'],friend:'cat'},{room:'bedroom',fires:['mattress','curtain_left','computer'],friend:'girl'}],tools:['water','extinguisher','blanket','foam'],seconds:44},
  {level:30,rooms:[{room:'stairwell',fires:['mailboxes','stroller','stair_rail','bin'],friend:'cat'},{room:'living',fires:['sofa','rug','television','curtain_left'],friend:'dog'},{room:'bedroom',fires:['mattress','wardrobe','computer','desk'],friend:'girl'}],tools:['water','extinguisher','blanket','foam'],seconds:44},
]);
// Use three sourced floor layouts cyclically above their original third storey.
export const FLOOR_ASSET_PATH='../assets/fire-levels-v1/interiors/building-floors.glb';
const FLOOR_ROOMS=[
  ['living','dog','sofa','rug','television','curtain_left','coffee_table'],
  ['kitchen','cat','kitchen_table','base_cabinet','oil_pot','power_strip','refrigerator'],
  ['bedroom','girl','curtain_left','desk','mattress','computer','nightstand'],
  ['living','cat','floor_lamp','sofa','television','coffee_table','rug'],
  ['bedroom','dog','desk','nightstand','wardrobe','computer','curtain_left'],
  ['kitchen','girl','chair_left','base_cabinet','oil_pot','power_strip','refrigerator'],
  ['bedroom','cat','curtain_left','nightstand','mattress','wardrobe','computer'],
  ['living','dog','rug','curtain_left','television','floor_lamp','sofa'],
  ['kitchen','cat','refrigerator','chair_left','oil_pot','power_strip','kitchen_table'],
  ['bedroom','girl','desk','curtain_left','mattress','wardrobe','computer'],
];
const FIRE_TOOL={normal:'water',electric:'extinguisher',oil:'blanket',heavy:'foam'};
const MULTIFLOOR_PLANS=ENTRY_PLANS.map((plan,tier)=>{
  const floorCount=Math.min(10,tier+3);
  const rooms=FLOOR_ROOMS.slice(0,floorCount).map(([room,friend,...candidates],index)=>{
    const playable=candidates.filter(id=>plan.tools.includes(FIRE_TOOL[ROOMS[room].spots[id].kind]));
    const perFloor=2+Number(tier>=2)+Number(tier>=5)+Number(tier>=8);
    return {room,friend,floor:index+1,assetFloor:index%3+1,
      fires:playable.slice(0,perFloor),heatScale:1+tier*.035+index*.012,
      smokeScale:1+tier*.048+index*.025};
  });
  return {...plan,rooms,floorCount,seconds:50-tier,fireLevels:true};
});
export function entryPlan(level,{fireLevels=false}={}){
  const plans=fireLevels?MULTIFLOOR_PLANS:ENTRY_PLANS;
  return plans.find(p=>p.level===level)||null;
}
/** Seconds on the room clock: the plan's base plus 5 per fire beyond the second. */
export function roomSeconds(plan,roomIndex){const r=plan.rooms[roomIndex];return plan.seconds+Math.max(0,r.fires.length-2)*5;}

/** The building the stage drives to: among the lots that hold the stage's first fires (one lot per burning window), the one farthest from
 * where the engine starts, so there is a real drive before the door; ties go to the lower lot index. The door is on the +Z front.
 * `balance` is the stage's derived balance (fireScenario), so lots and sites already sit on the stage's city plan. */
export function entryBuilding(balance,level){
  const sites=balance.render?.sites||[],lots=balance.city?.buildings||[],settings=Number.isInteger(level)?balance.levels?.[level-1]:null;
  if(!sites.length||!lots.length)return null;
  const count=Math.max(1,Math.min(sites.length,settings?.flames||1)),start=[balance.vehicle?.x||0,balance.vehicle?.z||0];
  const lotOf=site=>{let best=-1,dist=Infinity;lots.forEach((lot,i)=>{const d=Math.hypot(lot.x-site[0],lot.z-site[2]);if(d<dist){dist=d;best=i;}});return best;};
  let chosen=-1,far=-Infinity;
  for(const site of sites.slice(0,count)){const i=lotOf(site);if(i<0)continue;const d=Math.hypot(lots[i].x-start[0],lots[i].z-start[1]);if(d>far+1e-6||(Math.abs(d-far)<=1e-6&&i<chosen)){far=d;chosen=i;}}
  if(chosen<0)return null;
  const best=lots[chosen],depth=best.depth||best.width||5.7;
  return {index:chosen,x:best.x,z:best.z,width:best.width,depth,height:best.height,style:best.style,door:[best.x,.1,best.z+depth/2],front:[best.x,0,best.z+depth/2+2.2]};
}
/** Has the engine arrived: parked (not driving, slow) within the arrive radius of the door. */
export function arrivedAtBuilding(truck,building,tuning=V24_TUNING){
  if(!truck||!building)return false;
  const d=Math.hypot(truck.x-building.door[0],truck.z-building.door[2]),speed=Math.hypot(truck.velocityX||0,truck.velocityZ||0);
  return d<=tuning.arriveRadius&&!truck.driving&&speed<=tuning.parkedSpeed;
}
export function doorDistance(truck,building){return truck&&building?Math.hypot(truck.x-building.door[0],truck.z-building.door[2]):Infinity;}

/** Time score of a room: 1 at or under par (half the clock), falling to 0 at the clock's end. */
export function timeScore(used,limit,tuning=V24_TUNING){const par=limit*tuning.starPar;if(used<=par)return 1;return Math.max(0,1-(used-par)/Math.max(1,limit-par));}
/** Stars shown for the inside part alone (the room clock): 3 at or under par, 2 under the clock, 1 when the team had to finish. */
export function insideStars(performance){return performance>=.8?3:performance>=.45?2:1;}

/** Merge the inside result into the street stage's raw result. Score is capped like the campaign, the performance is the weighted
 * average, the summary gets the rooms and the rescues from inside. A lost street stage stays lost, with no inside merged. */
export function mergeResults(streetRaw,inside,balance,tuning=V24_TUNING){
  if(!streetRaw||streetRaw.outcome!=='win'||!inside)return streetRaw;
  const score=Math.min(balance.maximumScore,Math.max(0,Math.round((streetRaw.score||0)+(inside.score||0))));
  const sp=Number.isFinite(streetRaw.performance)?Math.max(0,Math.min(1,streetRaw.performance)):0,ip=Math.max(0,Math.min(1,inside.performance||0));
  const idleInside=inside.floors>0&&inside.handovers===inside.floors&&inside.score===0;
  const performance=idleInside?0:tuning.weight.street*sp+tuning.weight.inside*ip;
  const summary={...(streetRaw.summary||{}),rescued:(streetRaw.summary?.rescued||0)+(inside.rescued||0),rooms:inside.rooms||0,insideSeconds:Math.round(inside.seconds||0),insideStars:insideStars(ip)};
  if(inside.floors)summary.floors=inside.floors;
  return {...streetRaw,score,performance,summary,inside:{...inside}};
}
