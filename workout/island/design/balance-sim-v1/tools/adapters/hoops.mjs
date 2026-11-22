import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const games=[{id:'streetSlam',name:'כדורסל',stages:Array.from({length:10},(_,i)=>i+1),sources:['workout/island/minigames/hoops-engine.mjs','workout/island/minigames/hoops-franchise.mjs','workout/island/minigames/hoops-session.mjs','workout/island/minigames/hoops-result.mjs','workout/island/design/tactics/basketball.json','workout/island/data/config.json'],notes:['מועדון initialHoops חדש, משחק quick וקושי normal; החלפות אוטומטיות ותכנון טקטי נטען כמו בסשן.','בכל שלב משחקים את המשחק הראשון בעונת המועדון החדש, ללא שדרוגי ציוד או אימונים; stageLevel מעלה את דירוג היריב.','מערכי levels[].ai הוותיקים אינם מועברים למנוע 5 על 5; קושי המשחק בפועל נשען על league.stageLevel ו-ai.difficulty.normal.','quick מחייב 360 שניות שעון משחק, לפני עצירות והארכה; חריגה מתקציב הסבלנות מתועדת ואינה מפסיקה את המשחק.','הבוט מחליט לפי snapshot ציבורי, שולח ג׳ויסטיק, מסירה/חטיפה וזריקה/קפיצה; אינו מפעיל autopilot ואינו משנה מצב.']}];
export const recommendations=[];
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
function random(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const tacticsCache=new Map();

export async function runTrial({sourceRoot,config,stage,profile,seed,variant={}}){
 const load=name=>import(pathToFileURL(join(sourceRoot,'workout/island/minigames',name)).href);
 const [{createHoopsEngine,NO_INPUT},{initialHoops,matchTeams},{hoopsResult},{compileHoopsTactics}]=await Promise.all([load('hoops-engine.mjs'),load('hoops-franchise.mjs'),load('hoops-result.mjs'),load('hoops-tactics.mjs')]);
 const balance=config.minigames.streetSlam,club=initialHoops(balance),setup=matchTeams(balance,club,{stage,equipment:{},power:1});
 if(variant.matchProfile)setup.profile=variant.matchProfile;
 const engine=createHoopsEngine({config:balance,seed,teams:setup.teams,userTeam:0,profile:setup.profile,difficulty:setup.difficulty,assist:setup.assist});
 engine.setAutoSub(setup.autoSub!==false);
 if(!tacticsCache.has(sourceRoot))tacticsCache.set(sourceRoot,readFile(join(sourceRoot,'workout/island/design/tactics/basketball.json'),'utf8').then(JSON.parse).then(compileHoopsTactics));
 engine.setTacticsData(await tacticsCache.get(sourceRoot));
 const dt=1/60,rng=random(seed^0x561ee09b),court=engine.court,events={},timing={},limit=balance.maximumSeconds;
 let seconds=0,nextDecision=0,held={...NO_INPUT,move:{x:0,z:0}},releaseAt=Infinity,shotKey='',lapses=0,shots=0,passes=0,falls=0,wasStumbling=false;
 let current=engine.snapshot(),previousOwner=null;
 while(!engine.result&&seconds<limit){
  const input={...held,shootDown:false,shootUp:false,passPress:false,movePress:false,switchPress:false};
  if(seconds+1e-9>=nextDecision){
   current=engine.snapshot();nextDecision=seconds+profile.reactionSeconds;
   const p=current.players.find(p=>p.id===current.controlled),owner=current.players.find(p=>p.id===current.ball.owner),side=current.dir[0],rim=court.rim(side);
   const lapse=rng()<profile.lapseProbability;if(lapse)lapses++;
   if(p&&!lapse){
    let tx=p.x,tz=p.z;
    if(p.hasBall){
     tx=rim.x-side*1.35;tz=(rng()*2-1)*profile.aimError*2;
     const distance=Math.hypot(p.x-rim.x,p.z-rim.z),pressure=current.players.filter(q=>q.team!==0&&Math.hypot(q.x-p.x,q.z-p.z)<1.7).length;
     const range=profile.id==='impatient'?5.8:profile.id==='regular'?3.3:2.65;
     if(!p.act&&(distance<range||current.shotClock<2)){input.shootDown=true;shots++;}
     else if(!p.act&&profile.id==='skilled'&&pressure>=2){
      const receiver=current.players.filter(q=>q.team===0&&q.id!==p.id&&side*(q.x-p.x)>1).sort((a,b)=>Math.hypot(a.x-rim.x,a.z)-Math.hypot(b.x-rim.x,b.z))[0];
      if(receiver){input.passPress=true;input.passDir={x:receiver.x-p.x,z:receiver.z-p.z};passes++;}
      else input.movePress=true;
     }
    }else if(current.ball.state==='loose'){tx=current.ball.x;tz=current.ball.z;if(Math.hypot(p.x-tx,p.z-tz)<2)input.shootDown=true;}
    else if(current.ball.state==='shot'){
     const attacked=current.possession===0?rim:court.rim(-side);tx=attacked.x-Math.sign(attacked.x)*1.3;tz=attacked.z;
     if(Math.hypot(p.x-current.ball.x,p.z-current.ball.z)<2.2)input.shootDown=true;
    }else if(current.possession!==0&&owner){
     const defensiveRim=court.rim(-side),d=Math.max(1,Math.hypot(owner.x-defensiveRim.x,owner.z-defensiveRim.z));
     tx=owner.x+(defensiveRim.x-owner.x)/d;tz=owner.z+(defensiveRim.z-owner.z)/d;
     if(Math.hypot(owner.x-p.x,owner.z-p.z)<1.65&&rng()<(profile.id==='skilled'?.65:.25))input.passPress=true;
    }else{
     tx=rim.x-side*5.5;tz=p.z>=0?3.7:-3.7;
     if(profile.id==='skilled'&&current.shotClock<5)input.passPress=true;
    }
    const dx=tx-p.x+(rng()*2-1)*profile.aimError,dz=tz-p.z+(rng()*2-1)*profile.aimError,d=Math.hypot(dx,dz),speed=Math.min(1,d/1.0);
    input.move=d>.08?{x:dx/d*speed,z:dz/d*speed}:{x:0,z:0};
    input.sprint=p.energy>.35&&d>3&&(profile.id==='impatient'||profile.id==='skilled');
    if(p.stumble&&!wasStumbling)falls++;wasStumbling=p.stumble;
   }else{input.move={x:0,z:0};input.sprint=false;}
   held={...input,shootDown:false,shootUp:false,passPress:false,movePress:false,switchPress:false};
   previousOwner=current.ball.owner;
  }
  if(seconds+dt/2>=releaseAt){input.shootUp=true;releaseAt=Infinity;}
  engine.step(input);seconds+=dt;
  for(const event of engine.drainEvents()){
   events[event.type]=(events[event.type]||0)+1;
   if(event.type==='timing')timing[event.zone]=(timing[event.zone]||0)+1;
   if(event.type==='shotStart'){
    // The visible meter starts here. Plan a release, with motor timing error.
    const snapshot=engine.snapshot(),p=snapshot.players.find(p=>p.id===event.playerId);
    if(p?.team===0&&p.shotHeld){
     const type=event.shotType==='ft'?'freethrow':event.shotType;
     const release=balance.anim[type]?.release??balance.anim.jumpshot.release;
     releaseAt=seconds+Math.max(.05,release-p.actT+(rng()*2-1)*profile.aimError*1.4);
     shotKey=event.playerId;
    }
   }
  }
 }
 const r=engine.result,s=engine.snapshot(),prof=balance.rules.profiles[setup.profile];
 let award=null;
 if(r){
  const box=r.box[0].map(p=>Object.fromEntries(['id','pts','reb','ast','stl','blk','sec','fgm','fga','tpm','tpa','ftm','fta','pf','tov'].map(k=>[k,p[k]])));
  const gameSeconds=4*prof.quarterSeconds+r.overtime*prof.overtimeSeconds;
  const raw={outcome:r.won?'win':'lose',score:r.score[0],streetSlam:{won:r.won,scoreFor:r.score[0],scoreAgainst:r.score[1],quarters:r.quarters,overtime:r.overtime,profile:setup.profile,stage,seed,gameSeconds,gameId:null,opponent:setup.teams[1].id,box,mvp:r.mvp}};
  award=hoopsResult(raw,{level:stage,seed},balance);if(!award)throw Error(`Hoops result rejected stage ${stage} seed ${seed}`);
 }
 const output={outcome:r?(r.won?'win':'lose'):'timeout',seconds:+seconds.toFixed(3),stars:award?.stars??0,falls:null,score:s.score[0],reason:r?'match-complete':'harness-time-limit',objectives:{won:Boolean(r?.won),threeStars:award?.stars===3,matchCompleted:Boolean(r),positiveMargin:s.score[0]>s.score[1]},diagnostics:{opponentScore:s.score[1],margin:s.score[0]-s.score[1],overtime:r?.overtime??s.overtime,gameSeconds:4*prof.quarterSeconds+(r?.overtime??s.overtime)*prof.overtimeSeconds,patienceExceeded:seconds>profile.patienceSeconds,patienceSeconds:profile.patienceSeconds,completedWithinPatience:Boolean(r)&&seconds<=profile.patienceSeconds,matchProfile:setup.profile,difficulty:setup.difficulty,opponent:setup.teams[1].id,events,timing,lapses,shotCommands:shots,passCommands:passes,stumblesObserved:falls,tacticsLoaded:engine.tacticsMetrics.loaded,dt}};
 engine.dispose();return output;
}
