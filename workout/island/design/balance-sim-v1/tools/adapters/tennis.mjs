import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const games=[{id:'tennis',name:'טניס',stages:Array.from({length:30},(_,i)=>i+1),sources:['workout/island/minigames/tennis.mjs','workout/island/minigames/tennis-session.mjs','workout/island/minigames/tennis-result.mjs','workout/island/data/config.json'],notes:['קושי easy, דרגות ציוד התחלתיות 1/1/1; כל שלב נבחן בנפרד, ללא רכישות מצטברות.','זמן הסימולציה כולל הגשות שהשעון elapsed הפנימי אינו סופר. סבלנות היא מדד נפרד; היא אינה מפסיקה משחק.','הבוט קורא את חיווי הנחיתה/מגע הציבורי, מניע ג׳ויסטיק ולוחץ הגשה/חבטה; אין שינוי מצב או תוצאה.','המיומן בוחר כדור קצר/קשת לפי מיקום היריב; הרגיל מחליף פינות, וחסר הסבלנות מחזיר כדור שטוח.']}];
export const recommendations=[];
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
function random(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

export async function runTrial({sourceRoot,config,stage,profile,seed,variant={}}){
 const load=name=>import(pathToFileURL(join(sourceRoot,'workout/island/minigames',name)).href);
 const [{createTennis},{tennisResult}]=await Promise.all([load('tennis.mjs'),load('tennis-result.mjs')]);
 const balance=config.minigames.tennis,difficulty=variant.difficulty||'easy',ranks=variant.ranks||balance.player.defaults;
 const sessionFlags={returnMeter:balance.v9?.returnMeter?.enabled!==false,softDrop:balance.v9?.softDrop?.enabled!==false,receiveChoice:balance.v9?.receive?.enabled!==false,stopDead:true};
 const model=createTennis({config:balance,stage,seed,difficulty,ranks,...sessionFlags}),rng=random(seed^0x74199ad3),dt=1/60;
 let seconds=0,nextDecision=0,input={},lastSwing=-100,lastServe=-100,incomingSerial='',incomingAt=0,targetX=0,targetZ=balance.player.readyZ;
 let eventId=-1,humanReturns=0,serveFaults=0,lapses=0,swings=0,eligibleWindows=0,wasEligible=false;
 const reasons={},types={flat:0,lob:0,drop:0};
 const limit=balance.maximumSeconds;
 while(!model.result&&seconds<limit){
  const s=model.getState(),p=s.players[0],incoming=s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1;
  const serial=`${s.pointNumber}/${s.rallyHits}`;
  if(incoming&&serial!==incomingSerial){incomingSerial=serial;incomingAt=seconds;}
  const eligible=Boolean(incoming&&s.contactWindow?.eligible);if(eligible&&!wasEligible)eligibleWindows++;wasEligible=eligible;
  // Decisions use a held analog stick; button edges last one physics tick.
  input.serve=false;input.swing=false;
  if(seconds+1e-9>=nextDecision){
   nextDecision=seconds+profile.reactionSeconds;
   const lapse=rng()<profile.lapseProbability;if(lapse)lapses++;
   if(lapse){input.move=0;input.moveZ=0;input.prepare=false;}
   else{
    targetX=0;targetZ=5.8;
    if(incoming&&seconds-incomingAt>=profile.reactionSeconds){targetX=s.contact.x+(rng()*2-1)*profile.aimError*2;targetZ=s.contact.z+(rng()*2-1)*profile.aimError*2;}
    input.move=clip(((targetX-p.x)*4-(p.vx||0)*.55)/s.attributes.speed,-1,1);
    input.moveZ=clip(((targetZ-p.z)*4-(p.vz||0)*.55)/s.attributes.speed,-1,1);
    // Keep the default centre receiving slot; movement to a rally target begins
    // after the serve instead of repeatedly flicking the receive-slot selector.
    if(s.server===1&&['serve','toss'].includes(s.phase)){input.move=0;input.moveZ=0;}
    input.prepare=false;
    const opponent=s.players[1];input.lob=profile.id==='skilled'&&opponent.z>-5&&s.ball.z<6.5;
    input.drop=profile.id==='skilled'&&!input.lob&&opponent.z<-6.3&&s.rallyHits%3!==0&&s.ball.z<7.2;
    input.aim={manual:profile.id!=='impatient',x:clip((opponent.x>=0?-1:1)+(rng()*2-1)*profile.aimError,-1,1),z:-.8};
    if(s.server===0&&s.phase==='serve'&&seconds-lastServe>.3){input.serve=true;lastServe=seconds;}
    // A predicted landing cue lets a child prepare before the contact moment.
    // Reaction sampling, position error and the normal buffer judge success.
    if(incoming&&s.contact.eta<.11+(rng()*2-1)*profile.aimError&&seconds-lastSwing>.30){input.swing=true;lastSwing=seconds;swings++;}
   }
  }
  // Motor timing of the visible serve meter is planned once at toss start.
  if(s.server===0&&s.phase==='toss'){
   if(input.tossPoint!==s.pointNumber||input.tossFaults!==s.faults){input.tossPoint=s.pointNumber;input.tossFaults=s.faults;input.serveRelease=balance.serve.tossSeconds*.5+(rng()*2-1)*profile.aimError*.8;}
   if(s.phaseTime>=input.serveRelease&&seconds-lastServe>.1){input.serve=true;lastServe=seconds;input.serveRelease=Infinity;}
  }
  model.update(dt,input);seconds+=dt;
  if(s.event.id!==eventId){eventId=s.event.id;const e=s.event;if(e.type==='hit'&&e.side===0&&!e.serving){humanReturns++;types[s.shot.drop?'drop':s.shot.lob?'lob':'flat']++;}if(e.type==='fault')serveFaults++;if(['point','game','complete'].includes(e.type)){const reason=e.reason||'unknown';reasons[reason]=(reasons[reason]||0)+1;}}
 }
 const r=model.result,raw=r?{outcome:r.won?'win':'lose',score:r.gamesFor,tennis:r}:null;
 const award=r?tennisResult(raw,{level:stage,seed,difficulty},balance):null;
 if(r&&!award)throw Error(`Tennis result rejected stage ${stage} seed ${seed}`);
 const state=model.getState();
 return {outcome:r?(r.won?'win':'lose'):'timeout',seconds:+seconds.toFixed(3),stars:award?.stars??0,falls:null,score:state.score.games[0],reason:r?'match-complete':'harness-time-limit',objectives:{won:Boolean(r?.won),threeStars:award?.stars===3,matchCompleted:Boolean(r),gamesWon:state.score.games[0],gamesRequired:balance.rules.gamesToWin},diagnostics:{nativeResult:r,nativeClockSeconds:state.elapsed,patienceExceeded:seconds>profile.patienceSeconds,patienceSeconds:profile.patienceSeconds,completedWithinPatience:Boolean(r)&&seconds<=profile.patienceSeconds,opponentGames:state.score.games[1],humanReturns,serveFaults,lapses,swings,eligibleWindows,pointReasons:reasons,shotTypes:types,difficulty,ranks,sessionFlags,dt}};
}
