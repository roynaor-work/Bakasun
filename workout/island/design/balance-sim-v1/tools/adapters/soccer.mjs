import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const games=[{
  id:'soccer',name:'כדורגל',stages:Array.from({length:15},(_,i)=>i+1),
  sources:['workout/island/minigames/soccer.mjs','workout/island/minigames/soccer-session.mjs','workout/island/minigames/soccer-campaign.mjs','workout/island/minigames/soccer-result.mjs','workout/island/activity/soccer-card.mjs','workout/island/minigames/soccer-full.mjs','workout/island/minigames/soccer-v23.mjs','workout/island/minigames/soccer-r241.mjs','workout/island/design/tactics/soccer.json'],
  notes:[
    'המסלול המשווק הוא league:true: שלוש ליגות של חמישה משחקים. נמדדים כל 15 המשחקים הנבחרים. 16–30 הן רשומות מורשת שהמודל ממפה למשחק 15 ואינן שלבים נבחרים.',
    'סגל חדש ללא רכישות או אימון; תפקיד שדה. קושי המשחק נלקח מהליגה, ורמת הבוט משפיעה רק על הקלט.',
    'זמן נמדד הוא זמן סימולציה כולל עצירות. שעון המשחק עצמו 180 שניות (SOCCER_FULL.halfSeconds=90), אף שב־JSON רשום halfSeconds=75. כוכבי הפסד מנורמלים ל־0 לפי soccerResult, אף שהמודל הגולמי מחזיר stars:1.',
    'פנדלי הבונוס הנפרדים אינם משנים ניצחון/כוכבים ואינם כלולים בזמן משחק הליגה. נפילות נספרות מעבירות על שחקני הבית שהפעילו fouledTime; מעידות והגלשות יזומות אינן נפילות. זמן הגרפיקה שמקפיא את המודל בשידור חוזר אינו כלול.'
  ],
  stageAudit:{configuredLevels:30,selectableStages:15,unreachableConfiguredStages:Array.from({length:15},(_,i)=>i+16),unreachableAliasOf:15}
}];
const cache=new Map();
async function modules(root){
  if(!cache.has(root))cache.set(root,Promise.all([
    'minigames/soccer.mjs','minigames/soccer-campaign.mjs','activity/soccer-card.mjs','minigames/soccer-full.mjs','minigames/soccer-v23.mjs','minigames/soccer-squad.mjs'
  ].map(p=>import(pathToFileURL(join(root,'workout/island',p)).href))));
  return cache.get(root);
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rng(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

/** The controller reads only currently visible geometry, velocity, clock, and goal
 * labels. Decisions use delayed observation/held commands; timers keep physical
 * button releases at the selected duration. All stochastic errors use bot RNG,
 * independent of match randomness. It never moves objects or modifies state. */
export async function runTrial({sourceRoot,config,stage,profile,seed,variant={}}){
  const [{createSoccer},{leagueMatch,stageObjective},{initialSoccerCard},{applySoccerFull},{applySoccerPitchV23,applySoccerControlV23},{expandSoccerConfig}]=await modules(sourceRoot);
  const balance=applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(config.minigames.soccer,{v241:true})))),ladder=leagueMatch(balance,stage),difficulty=ladder.difficulty||'easy';
  const card=initialSoccerCard(null,balance),model=createSoccer({config:balance,stage,seed,difficulty,card,league:true,role:'field',v241:true,aiVersion:'v2',rulesVersion:'v1',feelVersion:'v2',switchVersion:'v23',airVersion:'v23'});
  const tactics=JSON.parse(await readFile(join(sourceRoot,'workout/island/design/tactics/soccer.json'),'utf8'));model.setDesignTactics(tactics);
  const random=rng(seed^0x53ccee19),dt=1/60,limit=Math.max(600,balance.match.halfSeconds*2+300);
  let time=0,nextDecision=0,shotUntil=0,passUntil=0,nextAction=0,lastSwitch=-10,command={moveX:0,moveZ:0},decisions=0,lapses=0;
  const eventCounts={},homeEventCounts={};let falls=0;
  while(!model.result&&time+1e-9<limit){
    const state=model.getState(),p=state.players[state.controlled],ball=state.ball;
    if(time+1e-9>=nextDecision){
      decisions++;nextDecision=time+profile.reactionSeconds;
      if(random()<profile.lapseProbability){command={moveX:0,moveZ:0};lapses++;}
      else {
        const gx=state.attackDir*balance.pitch.length/2,owns=ball.owner===p.id,owner=ball.owner==null?null:state.players[ball.owner];
        const toGoal=Math.abs(gx-p.x),opponentKeeper=state.players.find(q=>q.team===1&&q.role==='keeper');
        const lead=profile.id==='skilled'?.14:profile.id==='regular'?.06:0;
        let dx=owns?gx-p.x:ball.x+ball.vx*lead-p.x,dz=owns?-p.z*.55:ball.z+ball.vz*lead-p.z;
        // Keep a passing lane rather than chasing a team-mate in possession.
        if(!owns&&owner?.team===0){dx=clamp(owner.x+state.attackDir*5,-balance.pitch.length*.42,balance.pitch.length*.42)-p.x;dz=(Math.sign(p.z)||1)*4-p.z;}
        const angle=Math.atan2(dz,dx)+(random()*2-1)*profile.aimError*Math.PI;
        const length=Math.hypot(dx,dz),amount=clamp(length/1.1,0,1);
        command={moveX:Math.cos(angle)*amount,moveZ:Math.sin(angle)*amount,sprintHeld:!owns&&length>5,switchPlayer:false};
        const corner=profile.id==='skilled'?(opponentKeeper?.z>=0?-1:1)*balance.pitch.goalWidth*.21:0;
        const aimZ=corner+(random()*2-1)*profile.aimError*balance.pitch.goalWidth*1.5;
        command.kickAim={x:gx-p.x,z:aimZ-p.z,manual:true};
        const objective=stageObjective(state),needsPass=objective.id==='passes'&&!objective.complete,needsLoft=objective.id==='lofts'&&!objective.complete;
        if(time>=nextAction&&state.phase==='playing'){
          if(owns){
            if(toGoal<balance.ai.teamShootDistance*1.15&&Math.abs(p.z)<balance.pitch.goalWidth*1.3){shotUntil=time+clamp(.25+(random()*2-1)*profile.aimError,.07,.6);nextAction=shotUntil+.65;}
            else if((needsPass&&random()<.50)||needsLoft||random()<.13){passUntil=time+(needsLoft?.7:.09+random()*.07);nextAction=passUntil+1.2;}
          }else if(owner?.team===1&&length<2.2){
            if(random()<.40){shotUntil=time+.07;nextAction=time+1.3;}
            else {passUntil=time+.06;nextAction=time+.75;}
          }else if(ball.y>balance.physics.ballRadius+1.0&&length<1.3){shotUntil=time+.10;nextAction=time+.8;}
        }
        // Switch only through the model's public input, on a slow cadence.
        if(!owns&&owner?.team===1&&time-lastSwitch>1.6&&length>7){command.switchPlayer=true;lastSwitch=time;}
        if(state.phase==='restartReady'&&state.restart?.team===0&&time>=nextAction){
          passUntil=time+.11;nextAction=time+1.5;
        }
      }
    }
    model.update(dt,{...command,kickHeld:time<shotUntil,passHeld:time<passUntil});
    for(const event of model.drainEvents()){
      eventCounts[event.type]=(eventCounts[event.type]||0)+1;
      if(event.type==='foul'&&model.getState().players[event.victim]?.team===0&&model.getState().players[event.victim]?.fouledTime>0)falls++;
      const team=event.team??model.getState().players[event.player]?.team;
      if(team===0)homeEventCounts[event.type]=(homeEventCounts[event.type]||0)+1;
    }
    time+=dt;
  }
  const s=model.getState(),result=model.result,objective=stageObjective(s),won=!!result?.won;
  return {
    outcome:result?(won?'win':'lose'):'timeout',seconds:+time.toFixed(4),stars:won?result.stars:0,falls,
    score:s.score[0],reason:result?(won?'fulltime-win':s.score[0]===s.score[1]?'fulltime-draw':'fulltime-loss'):'safety-timeout',
    objectives:[{id:objective.id,current:objective.current,target:objective.target,complete:objective.complete,optional:objective.optional}],
    diagnostics:{patienceExceeded:time>profile.patienceSeconds,withinPatience:time<=profile.patienceSeconds,score:s.score,matchClock:s.elapsed,phase:s.phase,difficulty,tuning:ladder.tuning,selectable:stage<=(ladder.total||30),aliasOf:stage>(ladder.total||30)?ladder.total:null,decisions,lapses,events:eventCounts,homeEvents:homeEventCounts,campaignStats:s.campaignStats,rawResult:result,shippedFlags:{full:true,v241:true,ai:'v2',rules:'v1',feel:'v2',switch:'v23',air:'v23'},pitch:[balance.pitch.length,balance.pitch.width],players:s.players.length,halfSeconds:balance.match.halfSeconds}
  };
}

export const recommendations=[{
  parameter:'SOCCER_FULL.halfSeconds (soccer-full.mjs; probe override minigames.soccer.fullTune.halfSeconds)',current:90,proposed:40,stages:Array.from({length:15},(_,i)=>i+1),
  rationale:'מועמד למדידה: מאפשר להשלים שתי מחציות בתוך תקציב סבלנות של 90 שניות ברוב המשחקים; עצירות שערים עדיין עשויות לחרוג. אין להחיל ללא בדיקת השפעה על יעדי פעולות והבקעות.'
}];

/** Regenerate data/soccer-stage-audit.json using the same isolated source copy as
 * runTrial. This audit reports configured-but-unselectable aliases, not trials. */
export async function auditStages({sourceRoot,config}){
  const [,campaign]=await modules(sourceRoot),c=config.minigames.soccer;
  const rows=Array.from({length:c.levels.length},(_,i)=>{
    const stage=i+1,l=campaign.leagueMatch(c,stage),p=campaign.campaignStage(l.tuning,c);
    return {stage,selectable:stage<=l.total,league:l.league,leagueMatch:l.match,actualStage:l.stage,tuning:l.tuning,difficulty:l.difficulty,keeper:l.keeper,objective:p.objective,formation:p.formation};
  });
  const used=new Set(rows.filter(r=>r.selectable).map(r=>r.objective.id));
  const all=new Set(Array.from({length:c.levels.length},(_,i)=>campaign.campaignStage(i+1,c).objective.id));
  return {source:'shipped leagueMatch + campaignStage; no simulation or game-source mutation',configuredStages:c.levels.length,selectableStages:c.league.matchesPerLeague*c.league.leagues.length,rows,
    selectableObjectiveIds:[...used],legacyObjectivesAbsentFromSelectableLeague:[...all].filter(id=>!used.has(id)),
    explanation:'league:true clamps to 15 selectable matches; campaign objectives use rounded tuning, not the saved match number. Full 30-stage campaign remains legacy.'};
}
