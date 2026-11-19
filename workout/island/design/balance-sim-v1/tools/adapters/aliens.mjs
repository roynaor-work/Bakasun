import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const DT=1/60,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rng=seed=>{let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);};
const gaussian=r=>{let n=0;for(let i=0;i<6;i++)n+=r();return(n-3)/Math.sqrt(.5);};
export const games=[{id:'alienDefense',name:'חלליות',stages:Array.from({length:30},(_,i)=>i+1),sources:['workout/island/minigames/alien-flight-model.mjs','workout/island/minigames/alien-session.mjs','workout/island/minigames/alien-v25.mjs','workout/island/minigames/alien-v25-arsenal.mjs','workout/island/minigames/result.mjs','workout/island/data/config.json'],notes:['מצב הסשן הפעיל: completion=waves, roundChoices=false, flight=true; כל דגלי ברירת המחדל עד v25; ללא ציוד, שדרוגים קבועים או בונוסים.','הבוט דוגם אויבים, קליעים ובונוסים בתדירות התגובה שלו; סטיית הכיוון היא aimError כפול 40% מרוחב המסך (סטיית תקן).','חסר הסבלנות מחזיק וולקן עד חימום; רגיל ומיומן משחררים לפי מד החום. נשקים מיוחדים מתחלפים בלחיצות חוקיות בלבד כשהתחמושת נגמרת.','הבוט המיומן חוזה תנועה לפי שתי תצפיות ומעדיף התחמקות מקליע קרוב; שאר הפרופילים מגיבים לטווח קצר יותר.','אין מדד נפילות; damage ולבבות שאבדו נשמרים באבחון. כוכבים מחושבים בחוזה gameResult המקורי.']}];
export const recommendations=[];

export async function runTrial({sourceRoot,config,stage,profile,seed}){
 const [{createAlienModel},{gameResult}]=await Promise.all(['alien-flight-model.mjs','result.mjs'].map(file=>import(pathToFileURL(join(sourceRoot,'workout/island/minigames',file)).href)));
 const c=config.minigames,b=c.alienDefense,r=rng(seed^0x6a09e667),m=createAlienModel({config:c,balance:b,level:stage,random:rng(seed),power:1,equipment:{},permanentUpgrades:{},hangar:{},careerWins:0,roundChoices:false,completion:'waves'});
 let input={flight:true,firing:true},next=0,targetId=null,novaPulsed=false,decisions=0,lapses=0,observed=new Map(),cooling=false;
 const skill=profile.id==='skilled',impatient=profile.id==='impatient',reaction=profile.reactionSeconds;
 while(!m.result&&m.time<m.settings.seconds+2){
  if(m.time+1e-9>=next){
   next=m.time+reaction;decisions++;
   const lapse=r()<profile.lapseProbability;if(lapse){lapses++;input={flight:true,firing:false};}
   else{
    const active=m.aliens.filter(a=>a.y+a.radius>0),current=active.find(a=>a.id===targetId);
    const target=current||active.sort((a,z)=>z.y-a.y||Math.abs(a.x-m.player.x)-Math.abs(z.x-m.player.x))[0];targetId=target?.id??null;
    let x=target?.x??c.width/2;
    if(target&&skill){const prev=observed.get(target.id),velocity=prev?(target.x-prev.x)/Math.max(DT,m.time-prev.t):0,flight=Math.max(0,(m.player.y-target.y)/b.shotSpeed);x+=clamp(velocity,-70,70)*flight*.8;}
    if(!impatient){const pickup=[...m.pickups,...(m.refills||[]),...(m.ammoDrops||[])].filter(p=>p.y>m.player.y-100).sort((a,z)=>Math.abs(a.x-m.player.x)-Math.abs(z.x-m.player.x))[0];if(pickup&&Math.abs(pickup.x-m.player.x)<(skill?100:65))x=pickup.x;}
    const danger=m.bolts.map(q=>{const t=(m.player.y-q.y)/(q.vy||m.settings.boltSpeed);return{q,t,x:q.x+(q.vx||0)*t};}).filter(q=>q.t>0&&q.t<(skill?.9:impatient?.22:.5)&&Math.abs(q.x-m.player.x)<b.playerRadius+14).sort((a,z)=>a.t-z.t)[0];
    if(danger){const dir=m.player.x<danger.x?-1:1;x=m.player.x+dir*(skill?85:55);if(x<b.playerRadius||x>c.width-b.playerRadius)x=m.player.x-dir*70;}
    x=clamp(x+gaussian(r)*profile.aimError*c.width*.4,b.playerRadius,c.width-b.playerRadius);
    const ammo=m.specialAmmo||[m.novaCharges],selected=m.special||0,switchSpecial=m.arsenalOn&&ammo[selected]<=0&&ammo.some(n=>n>0),novaReady=ammo[selected]>0&&(selected!==0||!m.nova.flight&&!m.nova.life),burst=active.length>=(impatient?3:skill?7:5)||active.some(a=>a.boss&&a.hp>a.maxHp*.45&&a.age>4);
    const nova=novaReady&&burst&&!novaPulsed;
    if(m.vulcanHeat>(skill?.78:.88)||m.vulcanLocked)cooling=true;if(m.vulcanHeat<(skill?.15:.3)&&!m.vulcanLocked)cooling=false;
    input={flight:true,x,firing:true,vulcan:impatient||!cooling,nova,switchSpecial};novaPulsed=nova;
   }
   observed=new Map(m.aliens.map(a=>[a.id,{x:a.x,t:m.time}]));
  }
  m.update(DT,input);if(input.switchSpecial)input={...input,switchSpecial:false};
 }
 const snap=m.snapshot(),raw=m.result,settled=raw&&gameResult(raw,{config:c,level:stage},b),seconds=m.time;
 return {outcome:raw?.outcome??'incomplete',seconds,stars:settled?.stars??0,falls:null,score:m.score,reason:raw?.outcome==='win'?'waves-cleared':m.lives<=0?'health':'timer',objectives:{waves:{target:m.settings.waves,actual:m.wave,met:raw?.outcome==='win'},clearEnemies:{target:0,actual:m.aliens.length,met:m.aliens.length===0},survive:{target:1,actual:m.lives,met:m.lives>0}},diagnostics:{nativeResult:raw??null,performance:raw?.performance??null,lives:m.lives,maxLives:m.maxLives,damage:m.maxLives-m.lives,kills:snap.kills,fired:snap.fired,hits:snap.hits,remaining:m.remaining,nativeTimeLimit:m.settings.seconds,nativeWaves:m.settings.waves,v25:m.v25,regularFired:snap.regularFired,vulcanFired:snap.vulcanFired,overheats:snap.overheats,arsenal:snap.arsenal,refill:snap.refill,bossStage:Boolean(m.settings.boss),bossRemaining:m.aliens.find(a=>a.boss)?.hp??0,decisions,lapses,patienceExceeded:seconds>profile.patienceSeconds,engineMode:'waves;roundChoices=false;flight=true;default-v25'}};
}
