/** Native v24.1 ski + all thirty league courses, loaded from a disposable source copy. */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const importAt=(root,path)=>import(pathToFileURL(join(root,path)).href);
const source=(root,name)=>importAt(root,`workout/island/minigames/${name}`);
export const games=[{id:'alpineRush',name:'סקי',stages:Array.from({length:33},(_,i)=>i+1),
  sources:['workout/island/minigames/alpine-session.mjs','workout/island/minigames/alpine-engine.mjs','workout/island/minigames/alpine-track.mjs','workout/island/minigames/alpine-v241.mjs','workout/island/minigames/alpine-result.mjs','workout/island/minigames/alpine-league-stages.mjs','workout/island/minigames/alpine-league-core.mjs','workout/island/minigames/alpine-league-result.mjs','workout/island/tools/alpine-league-bot.mjs','workout/island/data/config.json'],
  stageLabels:Object.fromEntries(Array.from({length:33},(_,i)=>[i+1,i<3?`בסיס ${i+1}`:`ליגה ${i-2}`])),
  notes:[
    'מכסה שלבים1–3 המקוריים ואת שלושים שלבי הליגה במזהי מנוע4–33. אלה מסלולי v24.1 כברירת המחדל של הסשן.',
    'הבוט הקיים createKidBot קורא snapshot גלוי בלבד. הפרופילים משנים זמן תכנון, טווח ראייה, שגיאת כיוון, החמצת מכשול ופיצוי רוח. החזקת יעד והיגוי רציף הם אותה התנהגות של טייס הכיול המקורי.',
    'ציוד בסיסי; זה תרחיש מבודד לכל שלב, ללא קניות. עקומת הליגה במקור כוילה עם שדרוגי ציוד לפי התקדמות, ולכן יש לדווח גם על הבדל זה. variant.gearProgress מאפשר בדיקה חוזרת עם ההנחה המקורית.',
    'ניצחון בסיסי וכוכבי בסיס מתוצאת המנוע. בליגה: חובה לעמוד ביעד המקום; כוכב לכל יעד מקום/זמן/שערים או ריצה נקייה, ללא כוכבים אם יעד המקום נכשל.',
    'המסלול עצמו קבוע לכל שלב; seed משנה את התנהגות היריבים ואת שגיאות הבוט. סבלנות היא תקציב קשב מדווח בלבד; כל שלב מסתיים באופן טבעי.'
  ]}];
export const recommendations=[];

export async function runTrial({sourceRoot,config,stage,profile,seed,variant={}}){
  const [{createAlpineEngine},{alpineResult},league,core,{alpineLeagueResult},{createKidBot}]=await Promise.all([
    source(sourceRoot,'alpine-engine.mjs'),source(sourceRoot,'alpine-result.mjs'),source(sourceRoot,'alpine-league-stages.mjs'),source(sourceRoot,'alpine-league-core.mjs'),
    source(sourceRoot,'alpine-league-result.mjs'),importAt(sourceRoot,'workout/island/tools/alpine-league-bot.mjs')]);
  const base=config.minigames.alpineRush,n=stage>3?stage-3:null;
  let balance=n?league.leagueBalance(base,n):base;
  if(variant.aiStrength!==undefined&&n){
    const curve=base.physics.v241?league.CURVE_V241:league.CURVE;
    const levels=balance.levels.map((v,i)=>i===stage-1?{...v,ai:league.leagueAi(n,base.aiCaps,variant.aiStrength,curve)}:v);
    balance={...balance,levels};
  }
  let gear={};
  if(variant.gearProgress&&n){const k=Math.min(5,Math.floor((n-1)/5));gear=core.equipmentFor({skis:k,helmet:Math.max(0,k-1),goggles:Math.max(0,k-1)});}
  const engine=createAlpineEngine({balance,stage,seed,equipment:gear,power:1});
  const level=profile.id==='skilled'?2:profile.id==='regular'?1:0;
  const bot=createKidBot({seed:(seed^0xc31af725)>>>0,physics:balance.physics,reaction:profile.reactionSeconds,
    look:[22,30,50][level],noise:profile.aimError*4.5,miss:profile.lapseProbability,missBright:profile.lapseProbability*.3,
    windDelay:profile.reactionSeconds*1.25,windComp:[.4,.7,.95][level],trickChance:[.35,.55,.8][level],boostAt:.98});
  const dt=1/60;let boosts=0,tricks=0;
  engine.command({type:'start'});
  for(let tick=0;tick<Math.ceil((balance.maximumSeconds+4)/dt)&&engine.phase!=='finished';tick++){
    if(engine.phase==='racing'){
      const input=bot.decide(engine.snapshot());
      engine.command({type:'steer',value:input.steer});
      if(input.boost){engine.command({type:'boost'});boosts++;}
      if(input.trick){engine.command({type:'trick',id:input.trick});tricks++;}
    }
    engine.step(dt);engine.drainEvents();
  }
  const r=engine.snapshot().result,stats=engine.leagueStats();
  if(!r)throw new Error(`alpineRush ${stage}: native engine did not terminate`);
  const outcome=r.won?'win':'lose',basic=alpineResult({outcome,score:r.score,alpine:r},{level:stage,seed},balance);
  const raw={outcome,score:r.score,alpine:r,league:{order:stats.order,gates:stats.gates}};
  const settled=n&&variant.aiStrength===undefined?alpineLeagueResult(raw,{level:stage,seed,alpineLeague:{n}},base):null;
  const goals=n?league.judgeGoals(league.stageGoals(base,n),{...r,gates:stats.gates}):[{kind:'place',target:engine.level.targetRank,ok:r.completed&&r.rank<=engine.level.targetRank}];
  const objectives=Object.fromEntries(goals.map(g=>[g.kind,{value:g.kind==='place'?r.rank:g.kind==='time'?r.elapsedMs:g.kind==='gates'?stats.gates:r.crashes,target:g.kind==='place'?g.target:g.kind==='time'?g.ms:g.kind==='gates'?g.count:0,met:g.ok}]));
  const result={outcome,seconds:r.elapsedMs/1000,stars:n?core.starsFor(goals):r.stars,falls:r.crashes,score:r.score,reason:!r.completed?'time-limit':r.won?'target-rank':'rank',objectives,
    diagnostics:{mode:n?'league':'base',leagueStage:n,stageLabel:n?`ליגה ${n}`:`בסיס ${stage}`,rank:r.rank,completed:r.completed,collisions:r.collisions,trickScore:r.trickScore,
      coins:r.coins,trackId:r.trackId,targetRank:engine.level.targetRank,gates:stats.gates,gatesTotal:stats.gatesTotal,boosts,tricks,peakKmh:r.peakKmh,gear,
      settlementValid:Boolean(basic)&&(!n||variant.aiStrength!==undefined||Boolean(settled)),patienceExceeded:r.elapsedMs/1000>profile.patienceSeconds}};
  engine.dispose();return result;
}
