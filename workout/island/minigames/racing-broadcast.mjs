// racing-deep-m4: Formula 1 style broadcast layer for the island races. Pure helpers first (no DOM: start lights from the model's countdown,
// time based gaps from a progress history, position changes, fastest lap, the grid card, the final classification), then the DOM layer
// (lights, cards, the race intro and the full podium). Off with ?racingBroadcast=0 (the old digits, toast and three-step podium stay).
// Reference, structure only: an F1 broadcast lights five red lamps one by one, holds them, and the race starts when all go out; the timing
// tower lists every car with position, team colour, number, the gap to the car ahead in seconds, a green/red arrow on a position change and a
// purple mark for the fastest lap; lower-third cards announce the lap, an overtake and a new fastest lap; the results page lists all finishers
// with their gap to the winner. A good phone racing game keeps the tower short on the left, never over the wheel or the buttons.
import {gridDriver} from './racing-league-core.mjs?v=island-v2-20261107-10';
import {broadcastArtEnabled,crestUrl,applyPanelArt,litCount} from './racing-broadcast-art.mjs?v=island-v2-20261107-10';

export const broadcastEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingBroadcast')!=='0';
export const COUNTDOWN=3,LIGHTS=5,LIGHT_STEP=.5,GO_SHOW=1.2,INTRO_SECONDS=4,PODIUM_SECONDS=8,START_QUIET=2,CARD_SECONDS=1.7;
export const TIME_LABEL=Object.freeze({day:'יום',golden:'שעת זהב',sunset:'שקיעה',night:'לילה'});

/** Start lights from the model: one red lamp every half second of the 3 s countdown, all five on for the last half second, all out = go.
 * Reads state.phase and state.countdown only; the physics never changes. */
export function startLights(state,total=COUNTDOWN){
 const counting=state.phase==='countdown'||(state.phase==='paused'&&state.countdown>0);
 if(counting){const e=Math.max(0,total-state.countdown);return {lit:Math.min(LIGHTS,Math.floor(e/LIGHT_STEP+1e-6)),out:false,go:false,show:true};}
 if(state.phase==='racing')return {lit:0,out:true,go:state.time<GO_SHOW,show:state.time<GO_SHOW};
 return {lit:0,out:true,go:false,show:false};
}

/** Progress history of every car, sampled four times a second of race time. gap(ahead, car, now) = how many seconds ago `ahead` passed the point
 * where `car` is now (interpolated), so the gap is a real time gap and not distance divided by a momentary speed. Two finished cars: their finish
 * times. null = `ahead` passed that point before the window (longer than `window` seconds ago). */
export function createGapTracker({interval=.25,window=120}={}){
 const hist=new Map();let lastT=-Infinity;const cap=Math.ceil(window/interval)+1;
 function record(state){const now=state.time;if(now-lastT<interval-1e-9)return false;lastT=now;
  for(const c of state.cars){let h=hist.get(c.id);if(!h){h={t:[],p:[]};hist.set(c.id,h);}h.t.push(now);h.p.push(c.progress);if(h.t.length>cap){h.t.shift();h.p.shift();}}
  return true;}
 function gap(ahead,car,now){
  if(!ahead||!car||ahead===car)return 0;
  if(ahead.finished&&car.finished)return Math.max(0,car.finishTime-ahead.finishTime);
  const target=car.progress;if(ahead.progress<=target)return 0;
  const h=hist.get(ahead.id);if(!h||!h.t.length)return null;
  let nt=now,np=ahead.progress;
  for(let i=h.t.length-1;i>=0;i--){const t=h.t[i],p=h.p[i];
   if(p<=target){const f=np>p?(target-p)/(np-p):1;return Math.max(0,now-(t+(nt-t)*f));}
   nt=t;np=p;}
  return null;}
 return {record,gap,reset(){hist.clear();lastT=-Infinity;},samples:id=>hist.get(id)?.t.length||0};
}

/** Fastest lap of the race so far over every car (traffic included, like the broadcast), or null before the first lap. */
export function fastestLap(cars){let best=null;for(const c of cars)for(const t of c.lapTimes)if(t>0&&(!best||t<best.time))best={id:c.id,time:t};return best;}

/** Remembers each car's rank and marks a change for `hold` seconds: delta +1 = moved up, -1 = moved down. */
export function createRankWatch({hold=2.5}={}){
 const last=new Map(),marks=new Map();
 function update(state,now=state.time){const changes=[];
  for(const c of state.cars){const prev=last.get(c.id);
   if(prev!==undefined&&prev!==c.rank){const delta=prev>c.rank?1:-1;marks.set(c.id,{delta,until:now+hold,from:prev,to:c.rank});changes.push({id:c.id,from:prev,to:c.rank,delta});}
   last.set(c.id,c.rank);}
  return changes;}
 return {update,delta(id,now){const m=marks.get(id);return m&&m.until>now?m.delta:0;}};
}

export const fmtTime=v=>Number.isFinite(v)&&v>=0?`${Math.floor(v/60)}:${(v%60).toFixed(2).padStart(5,'0')}`:'--';
/** Gap text in the broadcast style: "+1.2", "+1:05" past a minute, "הקפה" for a lapped car, empty when unknown. */
export function gapText(gap,{ahead=null,car=null,trackLength=0}={}){
 if(gap===0)return '';
 if(gap===null||gap===undefined){return ahead&&car&&trackLength>0&&ahead.progress-car.progress>=trackLength?'+הקפה':'';}
 if(gap>=60)return `+${Math.floor(gap/60)}:${String(Math.floor(gap%60)).padStart(2,'0')}`;
 return '+'+gap.toFixed(1);
}

/** Rows of the timing tower: the first `limit` cars by rank, always including the player (who replaces the last row when lower). */
export function towerRows(state,{tracker=null,now=state.time,limit=10,watch=null,fastest=null,trackLength=0}={}){
 const cars=[...state.cars].sort((a,b)=>a.rank-b.rank),player=state.player;
 let shown=cars.slice(0,limit);if(player&&!shown.includes(player)){shown=cars.slice(0,Math.max(1,limit-1));shown.push(player);}
 return shown.map(car=>{const idx=state.cars.indexOf(car),d=gridDriver(idx,car.name),ahead=cars[car.rank-2]||null,gap=ahead?(tracker?tracker.gap(ahead,car,now):null):0;
  return {id:car.id,rank:car.rank,name:car.isPlayer?'אתם':car.name,number:d.number,color:d.color,isPlayer:!!car.isPlayer,scoring:car.scoring!==false,finished:!!car.finished,
   gap,gapText:!ahead?(car.finished?'סיים':'מוביל'):gapText(gap,{ahead,car,trackLength}),delta:watch?watch.delta(car.id,now):0,fastest:!!fastest&&fastest.id===car.id};});
}

/** The whole field in finishing order with the gap to the winner (finish times when both finished, else the time gap at the moment the race ended). */
export function classification(state,{tracker=null,now=state.time,league=false,trackLength=0}={}){
 const cars=[...state.cars].sort((a,b)=>a.rank-b.rank),winner=cars[0],fast=fastestLap(state.cars),mixed=cars.some(c=>c.scoring===false);   // racing-deep-m6: when the whole field scores (long league) the mark says nothing, so it is left off
 return cars.map(car=>{const idx=state.cars.indexOf(car),d=gridDriver(idx,car.name),gap=car===winner?0:tracker?tracker.gap(winner,car,now):null;
  return {id:car.id,rank:car.rank,name:car.isPlayer?'אתם':car.name,number:d.number,color:d.color,isPlayer:!!car.isPlayer,scoring:car.scoring!==false,finished:!!car.finished,
   time:car.finished?car.finishTime:null,gap,gapText:car===winner?fmtTime(car.finished?car.finishTime:now):gapText(gap,{ahead:winner,car,trackLength}),
   league:league&&mixed&&car.scoring!==false,fastest:!!fast&&fast.id===car.id,bestLap:car.lapTimes.length?Math.min(...car.lapTimes):null};});
}

/** The pre-race card: circuit, laps, time of day and the starting grid with the player's slot. */
export function raceIntro(state,stage,track){
 const cars=[...state.cars].sort((a,b)=>a.rank-b.rank);
 return {track:track?.name||'',laps:state.laps,timeOfDay:TIME_LABEL[stage?.timeOfDay]||'',cars:cars.length,playerGrid:state.player?.rank||1,
  grid:cars.map(car=>{const idx=state.cars.indexOf(car),d=gridDriver(idx,car.name);return {rank:car.rank,name:car.isPlayer?'אתם':car.name,number:d.number,color:d.color,isPlayer:!!car.isPlayer,scoring:car.scoring!==false};})};
}

/** Lower-third cards, one at a time; an urgent card (position change) replaces the one on screen. */
export function createCards(){
 const q=[];let cur=null;
 function push(card,now=0){const c={duration:CARD_SECONDS,...card};if(c.urgent){q.length=0;cur={...c,at:now,until:now+c.duration};return;}q.push(c);if(q.length>3)q.shift();}
 function current(now){if(cur&&now<cur.until)return cur;cur=null;if(q.length){const c=q.shift();cur={...c,at:now,until:now+c.duration};}return cur;}
 return {push,current,clear(){q.length=0;cur=null;}};
}

/** Broadcast cards from the state between two frames (state based, so frames the page skipped lose nothing): a lap card when the player's lap
 * count grew, a purple card for a new fastest lap of the race, a position card on a change. Returns what the next call must remember. */
export function broadcastEvents(state,{changes=[],prevFastest=null,prevLaps=null}={}){
 const out=[],fast=fastestLap(state.cars),p=state.player,laps=p?.lapTimes?.length||0;
 if(p&&prevLaps!==null&&laps>prevLaps&&!p.finished){const last=p.lap>=state.laps;
  out.push({kind:'lap',title:last?'הקפה אחרונה':`הקפה \u2066${p.lap} / ${state.laps}\u2069`,sub:`אחרונה ${fmtTime(p.lapTimes[laps-1])}`});}
 if(fast&&prevFastest&&fast.time<prevFastest.time-1e-9){const car=state.cars.find(c=>c.id===fast.id);out.push({kind:'fastest',title:'הקפה מהירה ביותר',sub:`${car?.isPlayer?'אתם':car?.name||''} · ${fmtTime(fast.time)}`,duration:2.2});}
 if(state.phase==='racing'&&state.time>START_QUIET)for(const c of changes)if(c.id==='player')out.push({kind:c.delta>0?'up':'down',title:`מקום ${c.to}`,sub:c.delta>0?'עקיפה':'נעקפתם',urgent:true,duration:1.3});
 return {cards:out,fastest:fast,laps};
}

/* ---------- DOM layer ---------- */
const node=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;if(text!=='')n.textContent=text;return n;};
const ltr=(tag,cls,text)=>{const n=node(tag,cls,text);n.dir='ltr';return n;};
function chip(row,withName=true,art=false){const c=node('span','rb-chip');c.style.setProperty('--team',row.color);const crest=art?crestUrl(row.number):'';if(crest){const img=node('img','rb-crest');img.src=crest;img.alt='';img.width=img.height=16;img.decoding='async';c.classList.add('crest');c.append(img);}c.append(ltr('b','rb-no',String(row.number)));if(withName)c.append(node('span','rb-name',row.name));if(row.isPlayer)c.classList.add('you');return c;}

/** The broadcast layer of one race. update(state, dt, input) every frame after the view is ready; holding() is true while the intro card is up
 * (the session does not step the model then); podium(state, done) replaces the plain podium. */
export function createBroadcast({stage,model,league=false,signal=null,art=broadcastArtEnabled()}){
 const track=model.track,trackLength=track.length,tracker=createGapTracker(),watch=createRankWatch(),cards=createCards();
 let introT=0,introDone=false,fastest=null,lapsSeen=0,disposed=false,prevLights=-1;
 const lights=node('div','racing-lights');lights.setAttribute('role','img');lights.setAttribute('aria-label','רמזורי זינוק');
 const lamps=[];for(let i=0;i<LIGHTS;i++){const l=node('i','rb-lamp');lights.append(l);lamps.push(l);}
 const lightLabel=node('span','rb-lights-label','מוכנים');lights.append(lightLabel);const early=node('span','rb-early','חכו שהאורות ייכבו');early.hidden=true;lights.append(early);
 const card=node('div','racing-card');card.hidden=true;const cardTitle=node('strong','rb-card-title'),cardSub=node('span','rb-card-sub');card.append(cardTitle,cardSub);
 const intro=node('div','racing-intro');intro.setAttribute('role','dialog');intro.setAttribute('aria-label','לפני המרוץ');
 {const info=raceIntro(model.state,model.stage,track),head=node('div','rb-intro-head');
  head.append(node('strong','rb-intro-track',info.track),node('span','rb-intro-meta',[`${info.laps} הקפות`,info.timeOfDay,`${info.cars} מכוניות`].filter(Boolean).join(' · ')));
  if(league)head.append(node('span','rb-intro-league','מרוץ ליגה'));
  const grid=node('ol','rb-grid');for(const row of info.grid){const li=node('li','rb-grid-slot');li.dataset.rank=String(row.rank);if(row.isPlayer)li.classList.add('you');li.append(node('b','rb-grid-pos',String(row.rank)),chip(row,true,art));grid.append(li);}
  const you=node('p','rb-intro-you',`המקום שלכם בזינוק: ${info.playerGrid}`),go=node('button','rb-intro-go','למרוץ');go.type='button';go.dataset.action='racing-intro-go';
  const side=node('div','rb-intro-side');side.append(head,you,go);intro.append(side,grid);}
 if(art)applyPanelArt(intro);
 stage.append(lights,card,intro);
 const closeIntro=()=>{if(introDone)return;introDone=true;intro.remove();};
 intro.addEventListener('pointerdown',e=>{e.stopPropagation();closeIntro();},signal?{signal}:{});
 function renderLights(state){const l=startLights(state);lights.hidden=!l.show;if(!l.show)return;
  lights.dataset.out=String(l.out);lamps.forEach((lamp,i)=>lamp.classList.toggle('on',!l.out&&i<l.lit));lightLabel.textContent=l.go?'זינוק':l.lit>=LIGHTS?'':'מוכנים';
  if(l.lit!==prevLights){prevLights=l.lit;lights.dataset.lit=String(l.lit);}}
 function update(state,dt,input={}){
  if(disposed)return;
  if(!introDone){introT+=dt;if(introT>=INTRO_SECONDS)closeIntro();renderLights(state);return;}
  const now=state.time;
  // a child who presses the gas on the red lights is not punished: a small line under the lamps, nothing else
  if(state.phase==='countdown'){early.hidden=!(!input.autoAccelerate&&Number(input.throttle)>0);}else early.hidden=true;
  renderLights(state);
  if(state.phase==='racing'||state.phase==='finished'){tracker.record(state);
   const changes=watch.update(state,now),ev=broadcastEvents(state,{changes,prevFastest:fastest,prevLaps:lapsSeen});fastest=ev.fastest;lapsSeen=ev.laps;for(const c of ev.cards)cards.push(c,now);}
  const c=cards.current(now);card.hidden=!c;if(c){if(card.dataset.kind!==c.kind||cardTitle.textContent!==c.title){card.dataset.kind=c.kind;cardTitle.textContent=c.title;}cardSub.textContent=c.sub||'';}
 }
 /** The full result page: three steps and the whole classification; tap or the button continues, or PODIUM_SECONDS pass. */
 function podium(state,done){
  const rows=classification(state,{tracker,now:state.time,league,trackLength}),top=rows.slice(0,3),layout=[top[1],top[0],top[2]].filter(Boolean);
  const root=node('div','racing-podium broadcast');if(art)applyPanelArt(root);root.setAttribute('role','dialog');root.setAttribute('aria-label','תוצאות המרוץ');
  const me=rows.find(r=>r.isPlayer),title=node('strong','racing-podium-title',state.result?.won?'ניצחון':me&&me.rank<=3?'על הפודיום':'סיום המרוץ');
  const steps=node('div','racing-podium-row rp-steps');
  for(const row of layout){const step=node('div','racing-podium-step place-'+row.rank);if(row.isPlayer)step.classList.add('you');
   const sw=node('i','racing-podium-car');sw.style.background=row.color;step.append(sw,ltr('span','rp-step-no','#'+row.number),node('span','racing-podium-name',row.name),ltr('small','rp-step-time',row.rank===1?row.gapText:row.gapText||'--'),node('b','racing-podium-place',String(row.rank)));steps.append(step);}
  const table=node('ol','rp-table');table.setAttribute('aria-label','דירוג סופי');
  for(const row of rows){const li=node('li','rp-row');li.dataset.rank=String(row.rank);li.dataset.id=row.id;if(row.isPlayer)li.classList.add('you');if(row.fastest)li.classList.add('fastest');
   li.append(node('b','rp-pos',String(row.rank)),chip(row,true,art),ltr('span','rp-gap',row.gapText||''));if(row.league)li.append(node('em','rp-league','ליגה'));table.append(li);}
  const left=node('div','rp-left'),note=node('small','racing-podium-note',me&&me.rank>3?`סיימתם במקום ${me.rank} מתוך ${rows.length}`:'לחצו להמשך'),go=node('button','rp-go','המשך');go.type='button';go.dataset.action='racing-podium-go';
  left.append(title,steps,note,go);root.append(left,table);stage.append(root);
  let closed=false;const close=()=>{if(closed||disposed)return;closed=true;clearTimeout(timer);root.remove();done();};
  const timer=setTimeout(close,PODIUM_SECONDS*1000);root.addEventListener('pointerdown',close,signal?{signal}:{});signal?.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  return root;
 }
 /** racing-broadcast-v1: how many of the 3D gantry's lamps are lit (always 0 with the art off, so the old view never gets a lamp call that does anything). */
 const gantryLamps=state=>art?litCount(startLights(state)):0;
 return {update,holding:()=>!introDone,podium,lamps:gantryLamps,art,tracker,watch,fastest:()=>fastest,trackLength,dispose(){disposed=true;lights.remove();card.remove();intro.remove();}};
}
