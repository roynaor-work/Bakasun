import {kidUx,kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-24';
import {createTennisAudio} from './g4e-audio.mjs?v=island-v2-20261107-24';
import {gameContext} from './context.mjs?v=island-v2-20261107-24';
import {createTennis} from './tennis.mjs?v=island-v2-20261107-24';
import {createTennisView,createTennisFallback} from './tennis-view.mjs?v=island-v2-20261107-24';
import {createTennisControls,applyTennisSample as applySampleBase} from './tennis-controls.mjs?v=island-v2-20261107-24';
// v15: with the sweeping return meter the stroke is judged the moment the finger lands (like the serve); the model still receives the real dt.
const applyTennisSample=(model,sample,dt)=>applySampleBase(model,sample,dt,{pressFires:Boolean(model.getState().hitMeter?.sweep)});
import {tennisIcon,tennisScoreCells,ratingIcon} from './tennis-ui.mjs?v=island-v2-20261107-24';
import {tennisCalloutsEnabled,calloutFor,CALL_WORD,CALL_SECONDS,tennisCalloutPackEnabled,CALLOUT_PACK} from './tennis-callouts.mjs?v=island-v2-20261107-24';
import {tennisUi2Enabled,applyTennisUi2,ui2MeterBox} from './tennis-ui2.mjs?v=island-v2-20261107-24';
export function tennisOpponent(balance,stage,shirt=balance.render.shirtColor){const opponent=balance.opponents[(stage-1)%balance.opponents.length];return {...opponent,shirtColor:opponent.shirtColor===shirt?balance.opponents.find(o=>o.shirtColor!==shirt).shirtColor:opponent.shirtColor};}
export function startTennis(ctx){
 const phoneParams=new URLSearchParams(globalThis.location?.search||''),phoneFixE=phoneParams.get('phoneFixes')!=='0'&&phoneParams.get('phoneFixE')!=='0';
 ctx={...gameContext(ctx.engine,ctx.engine.data.config.minigames,ctx.seed>>>0,'tennis',ctx.level),...ctx};
 const {balance,canvas,controls,status,t}=ctx,opponent=tennisOpponent(balance,ctx.level,ctx.state.avatar.shirtColor),viewConfig={...balance,stage:ctx.level,render:{...balance.render,shirtColor:ctx.state.avatar.shirtColor},opponentShirtColor:opponent.shirtColor},model=createTennis({phoneFixE,config:balance,stage:ctx.level,seed:ctx.seed>>>0,ranks:ctx.equipment,difficulty:ctx.difficulty,dropFix:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisDrop')==='0'?false:undefined,bar:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisBar')==='0'?false:undefined,returnMeter:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisReturn')==='v14'?false:balance.v9?.returnMeter?.enabled!==false,softDrop:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisSoftDrop')==='0'?false:balance.v9?.softDrop?.enabled!==false,deep:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisDeep')==='0'?false:undefined,hold:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisHold')==='0'?false:undefined,meter:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisMeter')==='0'?false:undefined,v9:globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisV9')==='0'?false:undefined,
  // v25 (Roy, 14/11/2026): pick where to stand before the opponent's serve (?tennisReceive=0 off), and after a point the ball stops, with the red X on an out (?tennisOut=v24 off).
  // v24.4: a faulted serve plays out to the net or past the line instead of stopping (?tennisPlayOut=0 off).
  playOut:new URLSearchParams(globalThis.location?.search||'').get('tennisPlayOut')!=='0',
  receiveChoice:!(globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisReceive')==='0')&&balance.v9?.receive?.enabled!==false,stopDead:!(globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisOut')==='v24')});
 let view,frame,last=0,paused=false,disposed=false,eventId=0,stopLeft=0,ratingLeft=0;const abort=new AbortController();const crowdAudio=!(globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisCrowdAudio')==='0');let input;const audio=createTennisAudio({config:balance.audio,storage:globalThis.localStorage});
 const cancel=()=>{model.update(0,{cancelCharge:true});};
 function dispose(){if(disposed)return;disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);abort.abort();input?.dispose();audio.dispose();view?.dispose();}
 const session={get ready(){return Boolean(view);},get loadFailed(){return null;},dispose,setPaused(value){paused=Boolean(value);audio.setPaused(paused);last=0;input?.setEnabled(!paused);cancel();},get snapshot(){return {...model.snapshot(),opponent,paused,renderMetrics:view?.metrics(),audioMetrics:audio.metrics()};}};
 if(!canvas)return session;
 const screen=canvas.closest('.game-screen'),style=document.createElement('link'),css=new URL('./tennis.css',import.meta.url),version=new URL(import.meta.url).searchParams.get('v');if(version)css.searchParams.set('v',version);style.rel='stylesheet';style.href=css;screen.append(style);
 const powerStyle=document.createElement('link');powerStyle.rel='stylesheet';powerStyle.href=new URL('./g4f-tennis.css?v=island-v2-20261107-24',import.meta.url);screen.append(powerStyle);
 screen.addEventListener('pointerdown',()=>audio.unlock(),{capture:true,signal:abort.signal});
 const node=(tag,cls)=>{const n=document.createElement(tag);n.className=cls||'';return n;};
 const zone=node('div','soccer-stick-zone'),stick=node('div','soccer-joystick'),knob=node('span','soccer-knob'),home=node('div','tennis-stick-home');
 stick.id='joystick';knob.id='knob';stick.append(knob);home.setAttribute('aria-hidden','true');home.innerHTML='<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="15" fill="#ffffff88"/><path d="M40 7V19M34 13 40 7 46 13M40 61V73M34 67 40 73 46 67M7 40H19M13 34 7 40 13 46M61 40H73M67 34 73 40 67 46"/></svg>';
 zone.append(home,stick);zone.setAttribute('aria-label',t('tennis.joystick'));const actions=node('div','soccer-actions');
 for(const [id,key]of [['shoot','hit'],['pass','serve'],['sprint','lob'],['drop','drop']]){const b=node('button','secondary-button'),caption=node('span','tennis-control-caption');b.id=id;b.type='button';b.dataset.gameControl=key;b.setAttribute('aria-label',t('tennis.'+key));caption.textContent=t('tennis.'+key);caption.setAttribute('aria-hidden','true');b.append(tennisIcon(key),caption);actions.append(b);}
 if(kidUx('017')){
  actions.querySelector('#drop .tennis-control-caption').textContent='קצרה';
  kidUxStyle('017',`
   .game-screen.game-screen[data-game=tennis] .soccer-controls .soccer-actions [data-game-control] .tennis-control-caption{
    max-width:100%;font-size:14px!important;line-height:1.2;text-align:center;white-space:normal
   }
   /* v24.4 plates (tennis-ui2): the caption sits under its button, so it gets the larger type on a solid chip */
   .game-screen.game-screen[data-game=tennis] .soccer-controls .soccer-actions.tennis-ui2 [data-game-control] .tennis-control-caption{
    max-width:none;font-size:14px!important;line-height:16px;white-space:nowrap;padding:0 5px;border-radius:7px;background:#14202e;color:#fff;text-shadow:none
   }
  `);
 }
 kidUxStyle('018',`
  .game-screen[data-game=tennis] .soccer-actions #shoot{transition-property:border-color,box-shadow}
  .game-screen[data-game=tennis] .soccer-actions #shoot:not(.held){
   background:#763c2b;color:#fff;text-shadow:none
  }
  .game-screen.game-screen[data-game=tennis] .soccer-controls .soccer-actions #shoot .tennis-control-caption{
   font-size:14px!important;line-height:1.2
  }
  .game-screen.game-screen[data-game=tennis] .soccer-controls .soccer-actions.tennis-ui2 #shoot .tennis-control-caption{
   font-size:14px!important;line-height:16px;white-space:nowrap;padding:0 5px;border-radius:7px;background:#14202e;color:#fff;text-shadow:none
  }
 `);
 const serveIcon=actions.querySelector('#pass svg');serveIcon.classList.add('tennis-serve-hint');
 controls.classList.add('soccer-controls');controls.append(zone,actions);status.classList.add('soccer-live-status');
 // Phone E: a compact thumb cluster leaves an outer-right rail for the timing bar.
 // v24.4 (?tennisUi=v24 keeps phone fix E): the Codex tennis-ui-v2 plates and layout (tennis-ui2.mjs).
 const ui2=tennisUi2Enabled();if(ui2)applyTennisUi2(actions);
 if(phoneFixE&&!ui2){
  Object.assign(actions.style,{right:'max(48px, env(safe-area-inset-right))',bottom:'max(18px, env(safe-area-inset-bottom))',width:'152px',height:'152px'});
  for(const [id,right,bottom,size]of [['shoot',0,0,76],['sprint',0,88,64],['drop',88,0,64],['pass',88,88,64]]){
   const button=actions.querySelector('#'+id);Object.assign(button.style,{right:right+'px',bottom:bottom+'px',width:size+'px',height:size+'px',minWidth:size+'px',minHeight:size+'px',borderRadius:'18px'});
   Object.assign(button.querySelector('.tennis-control-caption').style,{maxWidth:'100%',whiteSpace:'normal',lineHeight:'10px',textAlign:'center'});
   if(id!=='shoot')Object.assign(button.querySelector('svg').style,{width:'26px',height:'26px'});
  }
 }
 const board=node('div','soccer-scoreboard tennis-board'),cells=[];
 for(let i=0;i<2;i++){const dot=node('span','tennis-player-dot'),games=node('bdi','tennis-games'),points=node('bdi','tennis-points');dot.style.setProperty('--shirt',i?opponent.shirtColor:viewConfig.render.shirtColor);board.append(dot,games,points);cells.push({dot,games,points});}
 status.after(board);
 const meter=node('div','tennis-serve-meter'),needle=node('span','tennis-serve-needle'),perfectBand=node('span','tennis-perfect-band');meter.setAttribute('aria-label',t('tennis.accuracy'));meter.append(perfectBand,needle);canvas.after(meter);
 perfectBand.style.height=`${balance.serve.perfectWidth*100}%`;perfectBand.style.bottom=`${(1-balance.serve.perfectWidth)*50}%`;
 // v23 (?tennisMeter=v15 = next to the player, as in v15): the bar has one home for the serve and every return, at the side just left of the action
 // buttons and centred on them (over the stands, never on the court or the player), and stays there dimmed while it is not in use.
 const meterSide=ui2||phoneFixE||!(globalThis.location?.search&&new URLSearchParams(globalThis.location.search).get('tennisMeter')==='v15')&&(balance.v9?.meter?.place??'side')==='side';let sideKey='',sideFrames=0,deadBounces=0;
 if(meterSide)meter.dataset.place='side';
 function placeSide(){
  if(ui2){const stageBox=canvas.parentElement.getBoundingClientRect(),m=ui2MeterBox(stageBox.height);Object.assign(meter.style,{left:'auto',bottom:'auto',right:`max(${m.right}px, env(safe-area-inset-right))`,top:m.top+'px',width:m.width+'px',height:m.height+'px'});return;}
  if(phoneFixE){const stageBox=canvas.parentElement.getBoundingClientRect(),box=actions.getBoundingClientRect(),height=Math.min(132,Math.max(64,stageBox.height-20));
   Object.assign(meter.style,{left:'auto',right:'max(14px, env(safe-area-inset-right))',bottom:'auto',top:Math.max(10,Math.min(stageBox.height-height-10,box.top-stageBox.top+(box.height-height)/2))+'px',width:'14px',height:height+'px'});return;}
  const stageBox=canvas.parentElement.getBoundingClientRect(),actionsBox=controls.querySelector('.soccer-actions')?.getBoundingClientRect();if(!actionsBox||!stageBox.width||!actionsBox.width)return;const mw=meter.offsetWidth||24,mh=meter.offsetHeight||156,key=[stageBox.left,stageBox.top,stageBox.width,stageBox.height,actionsBox.left,actionsBox.top,actionsBox.height,mw,mh].map(Math.round).join();if(key===sideKey)return;sideKey=key;
  const padLeft=actionsBox.left+actionsBox.width/2<stageBox.left+stageBox.width/2/* buttons on the left (left-handed layout, if it comes back): the bar goes on their inner side */,left=Math.max(6,Math.min(stageBox.width-mw-6,padLeft?actionsBox.right-stageBox.left+16:actionsBox.left-stageBox.left-mw-16)),top=Math.max(6,Math.min(stageBox.height-mh-6,actionsBox.top-stageBox.top+(actionsBox.height-mh)/2));meter.style.right='auto';meter.style.bottom='auto';meter.style.left=`${left}px`;meter.style.top=`${top}px`;}
 const rating=node('div','tennis-rating');rating.setAttribute('aria-hidden','true');rating.hidden=true;screen.append(rating);
 // v25: the out sign (Codex sign-out.png background, live text) for 1.5 s on an out, and a one-line hint while the child picks where to stand.
 const outSign=node('div','tennis-out-sign'),outText=node('bdi','');outSign.setAttribute('role','status');outSign.setAttribute('aria-live','polite');outSign.style.backgroundImage=`url(${new URL('../assets/tennis-ui-fx-v1/sign-out.png?v=island-v2-20261107-24',import.meta.url).href})`;outSign.append(outText);outSign.hidden=true;screen.append(outSign);let outLeft=0,outMarkId=null;
 // v24.4 line calls (?tennisCallouts=0 off): the plate says OUT! or NET! with the Codex symbol, and the line judge shouts it (tennis-callouts.mjs).
 const callouts=tennisCalloutsEnabled(),callIcon=node('span','tennis-call-icon');if(callouts){outSign.classList.add('tennis-call');outSign.style.backgroundImage='';callIcon.setAttribute('aria-hidden','true');outSign.prepend(callIcon);}
 // v24.7 (?tennisCalloutPack=0 off): the plate is the Codex club plaque (assets/tennis-callouts-v1), which carries its own symbol.
 const callPack=callouts&&tennisCalloutPackEnabled();if(callPack)outSign.classList.add('tennis-call-plaque');
 const receiveHint=node('div','tennis-receive-hint');receiveHint.textContent=t('tennis.receiveHint');receiveHint.hidden=true;screen.append(receiveHint);
 const powerMeter=node('div','tennis-power-meter'),powerFill=node('span','tennis-power-fill');powerMeter.setAttribute('role','meter');powerMeter.setAttribute('aria-label',t('tennis.power'));powerMeter.setAttribute('aria-valuemin','0');powerMeter.setAttribute('aria-valuemax','100');powerMeter.style.setProperty('--safe',`${balance.shotPower.safeMax[ctx.difficulty]*100}%`);powerMeter.append(powerFill);canvas.after(powerMeter);
 input=createTennisControls({root:controls,config:balance.controls,onCancel:cancel,onGesture:()=>audio.unlock()});input.setHanded(true);/* stick always on the left; saved hand value ignored */input.setEnabled(!paused);
 if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,fallback,inspectCamera:(...args)=>view?.inspectCamera?.(...args),qualitySample:(...args)=>view?.observeFrame(...args)};
 function fallback(){if(disposed||view?.metrics().mode==='canvas')return;view?.dispose();view=createTennisFallback(canvas,viewConfig);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();},{signal:abort.signal});
 createTennisView(canvas,viewConfig).then(loaded=>{if(disposed){loaded.dispose();return;}view=loaded;last=0;frame=requestAnimationFrame(tick);}).catch(()=>{if(!disposed){fallback();last=0;frame=requestAnimationFrame(tick);}});
 function tick(at){if(disposed)return;const dt=last?Math.min((at-last)/1000,balance.simulation.maxDelta):0,frameMs=last?at-last:0;last=at;
  if(!paused&&!document.hidden){applyTennisSample(model,input.sample(),dt);
   view.observeFrame(frameMs);if(view.metrics().quality>=balance.render.fallbackQuality)fallback();
  }
  audio.sync();view.render(model.getState(),paused?0:dt*(stopLeft>0?.12:1));stopLeft=Math.max(0,stopLeft-dt);
  const s=model.getState(),ready=s.server===0&&['serve','toss'].includes(s.phase);const hm=s.hitMeter,hitOn=Boolean(hm?.active),meterInUse=hitOn||s.phase==='toss'&&(!meterSide||s.server===0),barHit=hitOn||meterSide&&Boolean(hm?.sweep)&&!['serve','toss'].includes(s.phase)/* v23: resting at the side between returns, the bar keeps the return bands (no jump when the next ball comes) */;meter.hidden=phoneFixE||ui2?!meterInUse:meterSide?s.phase==='complete':s.phase!=='toss'&&!hitOn;if(meterSide){meter.dataset.idle=String(!meterInUse);if(phoneFixE||ui2||++sideFrames%30===1)placeSide();}meter.dataset.zone=hitOn?hm.zone:s.serveZone;meter.dataset.grade=hitOn?hm.grade:'';meter.dataset.mode=barHit?'hit':'serve';perfectBand.hidden=barHit&&!hm.sweep;if(barHit&&hm.sweep){perfectBand.style.height=`${hm.perfectHalf*200}%`;perfectBand.style.bottom=`${(.5-hm.perfectHalf)*100}%`;}else{perfectBand.style.height=`${balance.serve.perfectWidth*100}%`;perfectBand.style.bottom=`${(1-balance.serve.perfectWidth)*50}%`;}meter.dataset.sweep=String(Boolean(hitOn&&hm.sweep));if(hitOn&&meter.getAttribute('aria-label')!==t('tennis.hitMeter'))meter.setAttribute('aria-label',t('tennis.hitMeter'));else if(!hitOn&&meter.getAttribute('aria-label')!==t('tennis.accuracy'))meter.setAttribute('aria-label',t('tennis.accuracy'));
  controls.dataset.tennisPhase=s.phase;if(phoneFixE||ui2)actions.querySelector('#pass').hidden=!ready;
  const choosing=Boolean(s.receive?.active)&&s.server===1&&['serve','toss'].includes(s.phase);if(receiveHint.hidden===choosing)receiveHint.hidden=!choosing;controls.dataset.tennisReceive=choosing?String(s.receive.slot):'';
  outLeft=Math.max(0,outLeft-(paused?0:dt));if(outLeft<=0&&!outSign.hidden)outSign.hidden=true;
  const incoming=s.phase==='rally'&&s.contact?.side===0,near=incoming&&(s.contactWindow?.eligible??(s.contact.eta>=-s.timingWindow/2&&s.contact.eta<=s.timingWindow/2));
  controls.querySelector('#shoot').classList.toggle('hit-ready',Boolean(near));
  powerMeter.hidden=Boolean(hm)||s.phase!=='rally'||s.charge<=0;const guide=s.powerGuide;if(guide){const lo=Math.max(0,guide.need-guide.tol),hi=Math.min(1,guide.need+guide.tol);powerMeter.dataset.v9='true';powerMeter.style.setProperty('--lo',`${lo*100}%`);powerMeter.style.setProperty('--safe',`${hi*100}%`);powerMeter.style.setProperty('--out',`${guide.out*100}%`);powerMeter.dataset.over=String(s.charge>guide.out);powerMeter.dataset.under=String(s.charge<lo);}else{powerMeter.dataset.over=String(s.charge>balance.shotPower.safeMax[ctx.difficulty]);}powerMeter.setAttribute('aria-valuenow',String(Math.round(s.charge*100)));powerFill.style.height=`${s.charge*100}%`;
  ratingLeft=Math.max(0,ratingLeft-(paused?0:dt));if(ratingLeft<=0&&!rating.hidden)rating.hidden=true;
  const projected=view.playerScreenPosition?.(s);if(projected&&hitOn&&!meterSide){/* v15: kept inside the stage and left of the action buttons, so it never sits on a button */const stageBox=canvas.parentElement.getBoundingClientRect(),actionsBox=controls.querySelector('.soccer-actions')?.getBoundingClientRect(),mw=meter.offsetWidth||18,mh=meter.offsetHeight||128,maxLeft=Math.min(stageBox.width-mw-6,actionsBox&&actionsBox.left>stageBox.left?actionsBox.left-stageBox.left-mw-8:Infinity),left=Math.max(6,Math.min(maxLeft,canvas.offsetLeft+projected.x+34)),top=Math.max(6,Math.min(stageBox.height-mh-6,canvas.offsetTop+projected.y-112));meter.style.right='auto';meter.style.bottom='auto';meter.style.left=`${left}px`;meter.style.top=`${top}px`;}else if(!meterSide&&!hitOn&&meter.style.left){meter.style.right='';meter.style.bottom='';meter.style.left='';meter.style.top='';}
  if(projected){rating.style.left=`${canvas.offsetLeft+projected.x-14}px`;rating.style.top=`${canvas.offsetTop+projected.y-96}px`;powerMeter.style.left=`${canvas.offsetLeft+projected.x+22}px`;powerMeter.style.top=`${canvas.offsetTop+projected.y-65}px`;}
  const green=balance.serve.green[ctx.difficulty]+(s.ranks.serve-1)*balance.serve.rankGreenBonus,low=(.5-green/2)*100,high=(.5+green/2)*100,yellow=balance.serve.yellowWidth*50;
  if(barHit){const g=hm.greenHalf*100,y=Math.min(50,hm.yellowHalf*100);meter.style.background=`linear-gradient(to top,#f06960 0% ${50-y}%,#efc355 ${50-y}% ${50-g}%,#67d398 ${50-g}% ${50+g}%,#efc355 ${50+g}% ${50+y}%,#f06960 ${50+y}%)`;needle.style.bottom=`${(hitOn?hm.value:0)*100}%`;}
  else{meter.style.background=`linear-gradient(to top,#f06960 0% ${low-yellow}%,#efc355 ${low-yellow}% ${low}%,#67d398 ${low}% ${high}%,#efc355 ${high}% ${high+yellow}%,#f06960 ${high+yellow}%)`;needle.style.bottom=`${(meterInUse||!meterSide?s.serveMeter:0)*100}%`;}
  controls.querySelector('#pass').classList.toggle('serve-ready',ready);const points=tennisScoreCells(s.score,balance.rules);
  cells.forEach((row,i)=>{row.dot.dataset.serving=String(s.server===i);row.games.textContent=s.score.games[i];row.points.textContent=points[i];});
  const label=t('tennis.score',{home:s.score.games[0],away:s.score.games[1]})+'; '+s.pointLabels.map(v=>typeof v==='string'&&v?t('tennis.'+v):v).join(' : ');board.setAttribute('aria-label',label);status.textContent=label;
  /* v25: a new out mark (a rally ball or a serve, the second serve of a double fault too) shows the sign for 1.5 s */if(s.faultMark?.id!==undefined&&s.faultMark.id!==outMarkId){outMarkId=s.faultMark.id;const call=callouts?calloutFor(s.faultMark):null;
   if(call){outSign.dataset.call=call;if(callPack){outSign.style.backgroundImage=`url(${new URL(`../${CALLOUT_PACK.signs[call]}?v=island-v2-20261107-24`,import.meta.url).href})`;outText.style.color=CALLOUT_PACK.labelColors[call];}else callIcon.style.backgroundImage=`url(${new URL(`../assets/tennis-ui-v2/fx-${call}.svg?v=island-v2-20261107-24`,import.meta.url).href})`;outText.textContent=CALL_WORD[call];outSign.setAttribute('aria-label',t('tennis.'+(call==='out'?'out':'net')));outSign.hidden=false;outLeft=CALL_SECONDS;audio.call(call);}
   else if(!callouts&&s.faultMark.reason==='out'){outText.textContent=t('tennis.out');outSign.hidden=false;outLeft=1.5;}}
  if(s.event.id!==eventId){eventId=s.event.id;if(s.event.type==='hit'){audio.play('hit');if(s.event.rating){rating.dataset.rating=s.event.rating;rating.innerHTML=ratingIcon(s.event.rating);rating.hidden=false;ratingLeft=.75;rating.classList.remove('pop');void rating.offsetWidth;rating.classList.add('pop');if(s.event.rating==='perfect')stopLeft=.07;}}else if(s.event.type==='bounce'||s.event.reason==='doubleBounce')audio.play('bounce');else if(s.event.reason==='net'||s.event.impact==='net')audio.play('net');if(['point','game','complete'].includes(s.event.type)){if(!crowdAudio)audio.play('applause');else{const e=s.event,mine=e.winner===0,myError=!mine&&(e.reason==='net'||e.reason==='out')&&s.ball.lastHitter===0;
    if(e.type==='complete')audio.play(mine?'matchCheer':'applauseLarge',{gain:mine?.85:.5});else if(e.type==='game')audio.play('applauseLarge',{gain:mine?.8:.45});else if(myError)audio.play('crowdAw',{gain:.65});else audio.play(s.rallyHits>=8?'applauseMedium':'applauseShort',{gain:mine?(s.rallyHits>=8?.72:.65):.4});
    if(s.rallyHits>=6&&e.type==='point'&&!myError)audio.play('crowdOoh',{gain:.5});}}
  if(crowdAudio&&s.event.type==='ready'&&s.pointNumber>0)audio.play('crowdHush',{gain:.35});}
  if(crowdAudio)audio.ambient('crowdBed',s.phase==='rally'?Math.min(.3,.16+s.rallyHits*.012):.1);
  /* v23: the dead ball after a soft drop keeps bouncing; each small bounce is heard, quieter */if(s.deadBall&&(s.deadBounces||0)>deadBounces)audio.play('bounce',{gain:.45});deadBounces=s.deadBall?s.deadBounces||0:0;
  if(model.result){ctx.finish({outcome:model.result.won?'win':'lose',score:model.result.gamesFor,tennis:model.result});return;}frame=requestAnimationFrame(tick);
 }
 return session;
}
