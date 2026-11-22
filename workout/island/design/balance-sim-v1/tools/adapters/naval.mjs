import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const DT=1/60,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rng=seed=>{let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);};
const gaussian=r=>{let n=0;for(let i=0;i<6;i++)n+=r();return(n-3)/Math.sqrt(.5);};
export const games=[{id:'navalDuel',name:'ספינות',stages:Array.from({length:30},(_,i)=>i+1),sources:['workout/island/minigames/naval.mjs','workout/island/minigames/naval-campaign.mjs','workout/island/minigames/naval-v241.mjs','workout/island/minigames/naval-air.mjs','workout/island/minigames/naval-supply.mjs','workout/island/minigames/result.mjs','workout/island/data/config.json'],notes:['אותו createNavalModel ומצב normal שמתקבל בכניסה הרגילה; גובה הסשן 390; דגלי ברירת המחדל כולל v24.1; ללא ציוד או בונוסים.','הבוטים משתמשים במכ״ם (lockTap), ירי מהיר (quickShot), טורפדו (torpedoShot), וולקן ידני (skyMode=manual) והפלגה למצופי אספקה. הפותר והנעילה הם חלק מהמשחק המקורי.','בחירת מטרה לפי המשימה; סטיית בחירת נקודת נעילה aimError כפול 150 יחידות לכל ציר; בוולקן סטיית תקן של aimError כפול 30 מעלות.','הבוטים הרגיל והמיומן מגיבים לאזהרות ירי ומשנים נתיב. חסר הסבלנות מפליג רק לצורך טווח ואספקה.','אין מדד נפילות; נזק לגוף, יריות, תחמושת, בסיסים ואוויר נשמרים באבחון. כוכבים מחוזה gameResult המקורי.']}];
export const recommendations=[];

export async function runTrial({sourceRoot,config,stage,profile,seed}){
 const [{createNavalModel},{gameResult},{navalSkyAngles}]=await Promise.all(['naval.mjs','result.mjs','naval-air.mjs'].map(file=>import(pathToFileURL(join(sourceRoot,'workout/island/minigames',file)).href)));
 const b=config.minigames.navalDuel,c={...config.minigames,height:b.render.height},r=rng(seed^0xbb67ae85),m=createNavalModel({config:c,balance:b,level:stage,random:rng(seed),seed,power:1,equipment:{},difficulty:'normal'});
 const skill=profile.id==='skilled',impatient=profile.id==='impatient',reaction=profile.reactionSeconds;
 let input={skyMode:'manual'},next=0,shootAt=.7,decisions=0,lapses=0,dodgeUntil=0,dodgeDirection=1;
 const navigate=(point,out)=>{const heading=Math.atan2(point.z-m.playerShip.z,point.x-m.playerShip.x),angle=heading-m.camera.heading;out.moveX=Math.sin(angle);out.moveZ=-Math.cos(angle);};
 while(!m.result&&m.time<m.settings.seconds+90){
  if(m.time+1e-9>=next){
   next=m.time+reaction;decisions++;
   input={skyMode:'manual'};
   if(r()<profile.lapseProbability)lapses++;
   else{
    const active=m.enemies.filter(e=>e.active&&e.hp>0),mission=m.mission.id;
    const priority=e=>e.structure||mission==='bases'?e.behavior==='base':mission==='flagship'?e.boss:mission==='intercept'?e.behavior==='flank':mission==='subhunt'?e.behavior==='dive':true;
    active.sort((a,z)=>Number(priority(z))-Number(priority(a))||a.hp-z.hp||a.index-z.index);
    const desired=active[0],surface=active.filter(e=>!e.subDeep),sub=active.find(e=>e.subDeep);
    let target=desired?.subDeep?surface[0]:desired;
    const heal=m.lives<m.maxLives*(skill?.8:impatient?.35:.6)&&m.ammo[5]>0&&m.cooldowns[5]===0;
    let kind=heal?5:target&&m.ammo[1]>0&&(impatient||target.hp>2)?1:0;
    if(!heal&&kind===0&&m.loaded<=0&&m.ammo[1]>0)kind=1;
    input.ammoIndex=kind;
    if(sub&&m.torpedoes>0&&m.cooldowns[2]===0&&m.time>=shootAt){input.torpedoShot=true;input.torpedoTarget=sub.index;shootAt=m.time+(impatient?1.5:skill?1.0:1.3);}
    if(heal){input.firing=true;shootAt=m.time+.3;}
    else if(target){
     // Select by a noisy observed tap point, never by changing the model's lock.
     if(!m.homing&&!m.radar){const error=profile.aimError*150,px=target.x+gaussian(r)*error,pz=target.z+gaussian(r)*error;target=surface.reduce((best,e)=>!best||Math.hypot(e.x-px,e.z-pz)<Math.hypot(best.x-px,best.z-pz)?e:best,null);if(target)input.lockTap=target.index;}
     if(m.time>=shootAt&&(m.homing||m.radar)){input.quickShot=true;shootAt=m.time+(impatient?.65:skill?.8:1.15);}
    }
    // The live session explicitly declares manual air controls. Missing this flag
    // would silently use the older automatic air gun in a headless fixture.
    const aircraft=m.air.filter(a=>a.state!=='down').sort((a,z)=>Math.hypot(a.x-m.playerShip.x,a.z-m.playerShip.z)-Math.hypot(z.x-m.playerShip.x,z.z-m.playerShip.z))[0];
    if(aircraft){const aim=navalSkyAngles(m.playerShip,aircraft,b),sigma=profile.aimError*30*Math.PI/180;input.skyHeld=true;input.skyYaw=aim.yaw+gaussian(r)*sigma;input.skyPitch=clamp(aim.pitch+gaussian(r)*sigma,0,55*Math.PI/180);}
    let destination=null;
    const buoy=m.buoys[0];if(buoy&&(m.loaded<=3||m.belt<35))destination=buoy;
    const rangeTarget=active.find(e=>e.index===m.homing?.index)||desired||target;if(!destination&&rangeTarget){const dx=rangeTarget.x-m.playerShip.x,dz=rangeTarget.z-m.playerShip.z,dist=Math.hypot(dx,dz);if(dist>(sub&&rangeTarget===sub?285:300)||m.homing?.status==='far')destination={x:m.playerShip.x+dx*.28,z:m.playerShip.z+dz*.28};else if(m.homing?.status==='near'||dist<130)destination={x:clamp(m.playerShip.x-dx*.5,b.movement.minX+8,b.movement.maxX-8),z:clamp(m.playerShip.z-dz*.5,b.movement.minZ+8,b.movement.maxZ-8)};}
    if(destination)navigate(destination,input);
    else if(!impatient){
     if(active.some(e=>e.warning>0)&&m.time>=dodgeUntil){dodgeDirection=m.playerShip.z>90?-1:m.playerShip.z< -90?1:dodgeDirection*-1;dodgeUntil=m.time+(skill?1.8:1.15);}
     if(m.time<dodgeUntil){const heading=dodgeDirection*Math.PI/2,angle=heading-m.camera.heading;input.moveX=Math.sin(angle);input.moveZ=-Math.cos(angle);}
    }
   }
  }
  m.update(DT,input);
  // All discrete presses last one simulation frame; analogue controls stay held.
  if(input.firing||input.quickShot||input.lockTap!==undefined||input.torpedoShot)input={...input,firing:false,quickShot:false,lockTap:undefined,torpedoShot:false};
 }
 const raw=m.result,settled=raw&&gameResult(raw,{config:c,level:stage},b),snap=m.snapshot(),mission=m.missionState,seconds=m.time;
 return {outcome:raw?.outcome??'incomplete',seconds,stars:settled?.stars??0,falls:null,score:m.score,reason:raw?.outcome==='win'?'mission-complete':m.lives<=0?'health':raw?'timer':'watchdog',objectives:{mission:{target:mission.total,actual:mission.completed,met:mission.complete},survive:{target:1,actual:m.lives,met:m.lives>0},clearSky:{target:0,actual:m.air.length,met:m.air.length===0}},diagnostics:{nativeResult:raw??null,performance:raw?.performance??null,lives:m.lives,maxLives:m.maxLives,damage:m.maxLives-m.lives,fired:m.fired,hits:snap.hits,enemyFired:m.enemyFired,enemySalvos:m.enemySalvos,mission:m.mission.id,missionCompleted:mission.completed,missionTotal:mission.total,enemiesRemaining:m.enemies.filter(e=>e.hp>0).length,baseHealth:m.baseHealth,airRemaining:m.air.length,airFinale:m.airFinale,manualAir:snap.vulcan?.manual??true,torpedoesFired:m.torpedoesFired,underwaterHits:m.underwaterHits,supplies:m.supplies,loaded:m.loaded,radarLocks:snap.v241.radarLocks,radarBreaks:snap.v241.radarBreaks,radarRefused:snap.v241.radarRefused,homingStatus:m.homing?.status??null,playerX:m.playerShip.x,playerZ:m.playerShip.z,resupplies:m.resupplies,ammo:[...m.ammo],remaining:m.remaining,decisions,lapses,patienceExceeded:seconds>profile.patienceSeconds,engineMode:'normal;unupgraded;default-v241;manual-air;radar-and-torpedo'}};
}
