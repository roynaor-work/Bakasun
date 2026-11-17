/** Real racing physics, loaded only from the runner's disposable source copy. */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {accelerateRacingProjection} from '../exact-racing-project.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const moduleAt=(root,name)=>import(pathToFileURL(join(root,'workout/island/minigames',name)).href);
function random(seed){let s=(seed^0x8b574d91)>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export const games=[{
  id:'islandRacing',name:'מרוצים',stages:Array.from({length:108},(_,i)=>i+1),
  toolDependencies:['exact-racing-project.mjs'],
  sources:['workout/island/minigames/racing-session.mjs','workout/island/minigames/racing-physics.mjs','workout/island/minigames/racing-tracks.mjs','workout/island/minigames/racing-result.mjs','workout/island/minigames/racing-league.mjs','workout/island/minigames/racing-league-core.mjs','workout/island/minigames/racing-league-result.mjs','workout/island/minigames/racing-v24.mjs','workout/island/minigames/racing-offtrack.mjs','workout/island/design/racing-tracks-v2/tracks.mjs','workout/island/data/config.json'],
  stageLabels:Object.fromEntries(Array.from({length:108},(_,i)=>{let k=i-30,season=1;for(const count of [12,14,16,18,18]){if(k<count)break;k-=count;season++;}return [i+1,i<30?`בסיס ${i+1}`:`עונה ${season} מרוץ ${k+1}`];})),
  notes:[
    'המסלולים, מספר ההקפות, זמני היעד ודירוג הניצחון נלקחים מ־RACING_STAGES בקוד, כפי שעושה הסשן; ערכי levels ב־config.json אינם שולטים בפיזיקה.',
    'סשן חדש, ציוד בסיסי, קושי easy כברירת המחדל במוצר. אין שינוי במצב המכונית, בשערים או במתחרים.',
    'היגוי pursuit אל הכביש הנראה, בלימה בפניות וניטרו בישורת; החלטות וקלט נשמרים למשך זמן התגובה. רעש קלט והחמצת החלטות תלויים בפרופיל.',
    'מכסה גם 30 שלבי בסיס מוסתרים (racingLevels=1) וגם 78 אירועי ליגה בברירת המחדל: מזהי הסימולציה31–108 ממפים 12/14/16/18/18 מרוצים בחמש עונות. כל אירוע מתחיל בציוד בסיסי; מצב ליגה אינו מועבר בין אירועים.',
    'דגלי ברירת המחדל של הסשן: v24, בלי קירות, offtrack, פיטים אוטומטיים, מנוע ו־ERS; עשרה רכבים בבסיס ושנים עשר בליגה. עצמי צד שנמסרים מהרנדרר אינם כלולים במודל headless.',
    'falls הוא crashes המקורי (כולל התהפכויות); recoveries, offroadSeconds ו־bumps נשמרים בנפרד. סבלנות היא תקציב קשב מדווח בלבד והשלב ממשיך עד תוצאה טבעית.',
    'שאילתות project מאונדקסות בדיוק מול אותם מקטעים ואותו סדר שוברי שוויון; תעודת racing-project-equivalence מאמתת 10 מרוצים מלאים ו־3,498,588 שאילתות מול המקור, ללא סבולת מספרית. variant.exactProjection=false מפעיל את השאילתה המקורית.',
    'בליגה אין כוכבים לפי חוזה התוצאה; הכוכבים שהמודל הפנימי מחזיר נשמרים ב־diagnostics.modelStars. ניצחון מרוץ אינו תנאי לפתיחת המרוץ הבא; פתיחת עונה תלויה בדירוג העונה.'
  ]
}];
export const recommendations=[];

/** variant.stageOverrides can probe hardcoded stage parameters on a copied model. */
export async function runTrial({sourceRoot,config,stage,profile,seed,variant={}}){
  const [{createRacing},{racingAngle},{racingResult},league,{racingLeagueResult},{v24PhysicsConfig},{offTrackConfig}]=await Promise.all([
    moduleAt(sourceRoot,'racing-physics.mjs'),moduleAt(sourceRoot,'racing-tracks.mjs'),moduleAt(sourceRoot,'racing-result.mjs'),moduleAt(sourceRoot,'racing-league.mjs'),moduleAt(sourceRoot,'racing-league-result.mjs'),moduleAt(sourceRoot,'racing-v24.mjs'),moduleAt(sourceRoot,'racing-offtrack.mjs')]);
  let season=1,race=stage-31;
  if(stage>30)for(const count of [12,14,16,18,18]){if(race<count)break;race-=count;season++;}
  const setup=stage>30?league.raceSetup({season,race,shortRaces:false,upgrades:{}}):null;
  const engineStage=setup?.stage??stage;
  const stageOverride={...(setup?.stageOverride||{}),...(variant.stageOverrides||{})};
  const model=createRacing({stage:engineStage,seed,difficulty:'easy',config:{equipment:{},walls:false,offTrack:offTrackConfig(''),feel:true,engine:true,extraRivals:setup?.extraRivals??5,crash:true,shiftMap:true,ers:true,ai:true,grid:true,grind:true,topCap:true,revShift:true,crashFx:true,...v24PhysicsConfig(),pitAuto:true,...(setup?{drivers:setup.drivers}:{}),stage:stageOverride}});
  if(variant.exactProjection!==false)accelerateRacingProjection(model.track);
  const rng=random(seed),dt=1/60,track=model.track;
  let input={autoAccelerate:true,steer:0},nextDecision=0,offroadSeconds=0,nitroSeconds=0,bumps=0,decisions=0,lapses=0,targetLane=0,laneUntil=0;
  const hardLimit=model.stage.timeLimit+4;
  for(let tick=0;tick<Math.ceil(hardLimit/dt)&&!model.state.result;tick++){
    const s=model.state,p=s.player;
    if(s.phase==='racing'&&s.time+1e-9>=nextDecision){
      decisions++;nextDecision=s.time+profile.reactionSeconds;
      if(rng()<profile.lapseProbability){lapses++;input={...input,nitro:false};}
      else{
        if(p.pit?.phase==='stop')model.pitTap();
        const look=10+p.speed*.5;
        if(s.time>=laneUntil){
          const ahead=s.cars.find(c=>c!==p&&!c.finished&&((c.s-p.s+track.length)%track.length)<20&&Math.abs(c.lateral-targetLane)<3.2);
          if(ahead&&profile.id!=='impatient'){targetLane=ahead.lateral>=0?-track.width*.24:track.width*.24;laneUntil=s.time+1.5;}
          else targetLane*=.75;
        }
        const target=track.sample(p.s+look),tx=target.x+target.normal.x*targetLane,tz=target.z+target.normal.z*targetLane;
        const error=racingAngle(Math.atan2(tx-p.x,tz-p.z)-p.heading);
        const rate=1.72*(.2+.8*Math.min(p.speed/12,1))/(1+Math.max(0,p.speed-25)*.016);
        const turnRate=2*Math.sin(error)*Math.max(10,p.speed)/Math.max(8,look);
        const yawLimit=44/Math.max(10,p.speed),rawYaw=yawLimit*Math.atanh(clamp(turnRate/yawLimit,-.95,.95));
        const curvature=Math.abs(track.headingAt(p.s+42)-track.headingAt(p.s+10))/32;
        const aLat=profile.id==='skilled'?40:profile.id==='regular'?35:29;
        let desired=model.stage.playerSpeed;
        for(let d=4;d<=104;d+=10){const c=Math.abs(track.headingAt(p.s+d+9)-track.headingAt(p.s+d-3))/12;if(c>.0025)desired=Math.min(desired,Math.sqrt(aLat/c+2*23*Math.max(0,d-6)));}
        input={steer:clamp(rawYaw/rate+(rng()*2-1)*profile.aimError,-1,1),autoAccelerate:false,
          throttle:p.speed<desired?1:0,brake:p.speed>desired+2,drift:false,
          nitro:p.nitro>15&&curvature<.008&&p.speed>22&&!p.offroad&&p.recoveryTime<=0};
      }
    }
    model.step(dt,input);
    if(model.state.player.offroad)offroadSeconds+=dt;
    if(model.state.player.boosting)nitroSeconds+=dt;
    bumps+=model.state.events.filter(e=>e.type==='bump'&&e.car==='player').length;
  }
  const s=model.state,p=s.player,r=s.result;
  if(!r)throw new Error(`islandRacing ${stage}: native model did not terminate within its time limit`);
  const outcome=r.won?'win':'lose',score=r.checkpoints===r.requiredCheckpoints?model.stage.opponents+2-r.rank:0;
  // Settlement rejects altered model rules in experimental variants by design.
  const cars=[...s.cars].filter(c=>c.scoring!==false).sort((a,b)=>a.rank-b.rank),order=cars.map(c=>c.id);
  let fastestLapId=null,best=Infinity;for(const c of cars)for(const lap of c.lapTimes)if(lap>0&&lap<best){best=lap;fastestLapId=c.id;}
  const raw={outcome,score,racing:r,league:{order,fastestLapId}};
  const settlement=variant.stageOverrides?null:setup?racingLeagueResult(raw,{level:engineStage,seed,league:setup},config.minigames.islandRacing):racingResult(raw,{level:engineStage,seed},config.minigames.islandRacing);
  const result={outcome,seconds:r.durationSeconds,stars:setup?0:r.stars,falls:p.crashes,score,reason:!p.finished?'time-limit':r.won?'target-rank':'rank',
    objectives:{finish:{value:p.finished,target:true,met:p.finished},rank:{value:r.rank,target:model.stage.targetRank,met:p.finished&&r.rank<=model.stage.targetRank}},
    diagnostics:{mode:setup?'league':'base',season:setup?.season??null,race:setup?.race??null,engineStage,stageLabel:setup?`עונה ${season} מרוץ ${race+1}`:`בסיס ${stage}`,modelStars:r.stars,order,fastestLapId,pits:p.pits??0,offTracks:p.offTracks,rank:r.rank,completed:p.finished,checkpoints:r.checkpoints,requiredCheckpoints:r.requiredCheckpoints,targetRank:model.stage.targetRank,
      laps:model.stage.laps,trackId:model.stage.trackId,timeLimit:model.stage.timeLimit,recoveries:p.recoveries,offroadSeconds,nitroSeconds,bumps,decisions,lapses,
      settlementValid:variant.stageOverrides?null:Boolean(settlement),patienceExceeded:r.durationSeconds>profile.patienceSeconds}};
  model.dispose();return result;
}
