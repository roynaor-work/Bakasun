import {createTennis,clamp} from './tennis.mjs';
import {createTennisView} from './tennis-view.mjs';
import {createControls} from './controls.mjs';
const $=id=>document.getElementById(id), abort=new AbortController();
const [config,strings]=await Promise.all(['config.json','strings.he.json'].map(async name=>{const response=await fetch(new URL(name,import.meta.url));if(!response.ok)throw Error(name);return response.json();}));
const t=(id,values={})=>String(strings[id]??id).replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
document.title=t('title');document.querySelectorAll('[data-text]').forEach(el=>el.textContent=t(el.dataset.text));document.querySelectorAll('[data-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.label)));
const params=new URLSearchParams(location.search),dev=params.has('dev');
let stage=clamp(Number(params.get('stage'))||1,1,config.levels.length),ranks={...config.player.defaults},seed=config.seed,model=createTennis({config,stage,ranks,seed}),view,controls,started=false,paused=false,raf=0,last=0,hudAge=0,toastLeft=0,lastEvent=0,savedResult=null,sound=true,audio=null,disposed=false,settingsWasPaused=false,simulationPaused=false;
const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:abort.signal});
function unlockAudio(){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{}}
function tone(kind){if(!sound||!audio)return;try{const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;oscillator.type='sine';oscillator.frequency.value=config.audio[kind+'Frequency'];gain.gain.setValueAtTime(config.audio.gain,now);gain.gain.exponentialRampToValueAtTime(.001,now+config.audio.seconds);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+config.audio.seconds);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}catch{}}
for(const name of ['you','ai'])for(let i=0;i<config.rules.pointsToWin;i++){const dot=document.createElement('i');dot.className='dot';$('dots-'+name).append(dot);}
function showToast(text){$('toast').textContent=text;$('toast').classList.add('show');toastLeft=config.rules.pointPause;}
function save(result){savedResult=result;try{localStorage.setItem('tennis-lab',JSON.stringify(result));$('save-status').textContent=t('saved');}catch{$('save-status').textContent=t('storageError');}}
try{const previous=JSON.parse(localStorage.getItem('tennis-lab'));if(previous&&typeof previous.won==='boolean')$('last-result').textContent=t('lastResult',{for:previous.gamesFor,against:previous.gamesAgainst});}catch{}
function renderResult(state){const result=state.result;if(!result)return;save(result);$('result').hidden=false;$('play-controls').hidden=true;$('timing').hidden=true;$('result-title').textContent=t(result.won?'win':'lose');$('result-note').textContent=t(result.won?'winNote':'loseNote');$('result-score').textContent=`${result.gamesFor} – ${result.gamesAgainst}`;$('stars').textContent='★'.repeat(result.stars);$('stars').setAttribute('aria-label',t('stars',{stars:result.stars}));$('next').hidden=!result.won||stage===config.levels.length;$('result-json').textContent=JSON.stringify(result,null,2);tone('end');}
function events(state){if(state.event.id===lastEvent)return;lastEvent=state.event.id;const e=state.event;
  if(e.type==='hit'){tone('hit');if(e.side===0&&!e.serving)showToast(t(Math.abs(e.timing)<=config.player.timingCenterFraction?'perfect':e.timing<0?'early':'late'));}
  if(e.type==='timing')showToast(t('tooEarly'));
  if(['point','game','complete'].includes(e.type)){
    tone('point');$('lab').classList.remove('flash');void $('lab').offsetWidth;$('lab').classList.add('flash');
    showToast(e.ace?t('ace'):['out','net'].includes(e.reason)?t(e.reason):t(e.winner===0?'pointFor':'pointAgainst'));
    if(e.type==='complete')renderResult(state);
  }
}
function hud(){const s=model.getState();$('stage-label').textContent=t('stage',{stage});
  ['you','ai'].forEach((name,i)=>{const label=typeof s.pointLabels[i]==='number'?s.pointLabels[i]:t(s.pointLabels[i]);$('games-'+name).textContent=s.score.games[i];$('points-'+name).textContent=label;$('score-'+(i===0?'you':'ai')).setAttribute('aria-label',t('scoreAccessible',{name:t(i===0?'you':'opponent'),games:s.score.games[i],points:label}));[...$('dots-'+name).children].forEach((dot,n)=>dot.classList.toggle('on',s.score.points[i]>n));});
  $('server-indicator').style.transform=`translateX(${s.server===0?34:-34}px)`;
  const serving=s.phase==='serve'&&s.server===0;$('hit-label').textContent=t(serving?(s.charge>0?'charge':'serve'):'hit');$('charge-fill').style.width=`${s.charge*100}%`;
  $('hint').textContent=t(serving?'serveHint':s.contact?.side===0?'receiveHint':'rallyHint');
  const incoming=started&&!paused&&s.phase==='rally'&&s.contact?.side===0;$('timing').hidden=!incoming;
  if(incoming){$('timing-text').textContent=t('receiveHint');$('timing-cursor').style.left=`${clamp(.5-s.contact.eta/s.timingWindow,0,1)*100}%`;}
  const game=s.phase==='game'&&started&&!paused;$('break-panel').hidden=!game;
  if(game){$('break-title').textContent=t(s.event.winner===0?'gameFor':'gameAgainst');$('break-score').textContent=`${s.score.games[0]} – ${s.score.games[1]}`;}
}
function newMatch(nextStage=stage){stage=nextStage;model=createTennis({config,stage,ranks,seed});lastEvent=0;started=true;paused=false;simulationPaused=false;controls?.reset();$('welcome').hidden=true;$('result').hidden=true;$('paused').hidden=true;$('play-controls').hidden=false;$('toast').classList.remove('show');hud();$('court').focus({preventScroll:true});unlockAudio();}
function setPaused(value){paused=value;controls?.reset();$('paused').hidden=!value;$('play-controls').hidden=value||!started||Boolean(model.result);$('pause').setAttribute('aria-label',t(value?'resume':'pause'));if(!value)$('court').focus({preventScroll:true});hud();}
let selectedStage=stage,selectedRanks={...ranks};
function syncSettings(){
  $('settings-stage-label').textContent=t('stageOf',{stage:selectedStage});
  $('stage-options').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stage)===selectedStage)));
  for(const key of ['speed','hit','serve']){$('rank-'+key+'-value').textContent=t('rankValue',{rank:selectedRanks[key]});$('rank-'+key).querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rank)===selectedRanks[key])));}
}
for(let n=1;n<=config.levels.length;n++){const b=document.createElement('button');b.type='button';b.dataset.stage=n;b.textContent=n;b.setAttribute('aria-label',t('stage',{stage:n}));listen(b,'click',()=>{selectedStage=n;syncSettings();});$('stage-options').append(b);}
for(const [key,label]of [['speed','speed'],['hit','hitRank'],['serve','serveRank']]){const row=document.createElement('div');row.className='rank-row';row.innerHTML=`<label><span></span><output id="rank-${key}-value"></output></label><div class="rank-options" id="rank-${key}"></div>`;row.querySelector('span').textContent=t(label);$('rank-controls').append(row);for(let n=config.player.rankMin;n<=config.player.rankMax;n++){const b=document.createElement('button');b.type='button';b.dataset.rank=n;b.textContent=n;b.setAttribute('aria-label',t('rankLabel',{name:t(label),rank:n}));listen(b,'click',()=>{selectedRanks[key]=n;syncSettings();});$('rank-'+key).append(b);}}
listen($('settings'),'click',()=>{if(!view||disposed)return;settingsWasPaused=paused;paused=true;controls.reset();selectedStage=stage;selectedRanks={...ranks};syncSettings();$('settings-dialog').showModal();});
listen($('settings-dialog'),'close',()=>{paused=settingsWasPaused;controls?.reset();if(started&&!paused)$('court').focus({preventScroll:true});hud();});
listen($('apply'),'click',()=>{ranks={...selectedRanks};settingsWasPaused=false;$('settings-dialog').close();newMatch(selectedStage);});
listen($('start'),'click',()=>newMatch());listen($('retry'),'click',()=>newMatch());listen($('next'),'click',()=>newMatch(stage+1));
listen($('pause'),'click',()=>{if(started&&!model.result)setPaused(!paused);});listen($('resume'),'click',()=>setPaused(false));listen($('sound'),'click',()=>{sound=!sound;$('sound').textContent=t(sound?'soundOn':'soundOff');if(sound)unlockAudio();});
listen($('exit'),'click',()=>{dispose();location.reload();});listen($('reload'),'click',()=>location.reload());
listen(document,'visibilitychange',()=>{if(document.hidden&&started&&!model.result)setPaused(true);last=0;});
function frame(now){if(disposed)return;const realDt=last?(now-last)/1000:0;last=now;const dt=Math.min(realDt,config.simulation.maxDelta);view.observeFrame(realDt*1000);if(started&&!paused&&!simulationPaused&&!document.hidden){model.update(dt,controls.read());events(model.getState());}toastLeft-=dt;if(toastLeft<=0)$('toast').classList.remove('show');hudAge+=dt;if(hudAge>=config.render.hudInterval){hud();hudAge=0;}view.render(model.getState(),paused||simulationPaused?0:dt);raf=requestAnimationFrame(frame);}
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);abort.abort();controls?.dispose();view?.dispose();audio?.close().catch(()=>{});audio=null;}
listen(window,'pagehide',dispose);
try{
  view=await createTennisView($('court'),config,{onQuality:q=>{$('quality').textContent=q?t('quality',{quality:strings.qualityNames[q]}):'';}});
  if(disposed){view.dispose();}else{
    controls=createControls({canvas:$('court'),hitButton:$('hit'),getState:()=>model.getState(),config,onGesture:unlockAudio});$('start').disabled=false;$('start').textContent=t('start');hud();raf=requestAnimationFrame(frame);
    if(dev)window.__tennis={get model(){return model;},get state(){return model.snapshot();},view,config,controls,start:newMatch,pause:value=>{simulationPaused=value;controls.reset();},step:(dt,input={})=>{model.update(dt,input);events(model.getState());hud();view.render(model.getState(),dt);return model.snapshot();},advance:(frames,input={})=>{for(let n=0;n<frames;n++){model.update(config.simulation.step,input);events(model.getState());}hud();view.render(model.getState(),0);return model.snapshot();},dispose,get disposed(){return disposed;},get savedResult(){return savedResult;}};
  }
}catch(error){console.error(error);$('welcome').hidden=true;$('error').hidden=false;}
