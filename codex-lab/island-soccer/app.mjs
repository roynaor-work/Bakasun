import {createSoccer} from './soccer.mjs';
import {createSoccerView} from './soccer-view.mjs';
import {createControls} from './controls.mjs';

const $=id=>document.getElementById(id),root=$('lab'),abort=new AbortController();
let view,controls,game,config,strings,raf=0,paused=false,playing=false,disposed=false,lastTime=0,hudTime=0,eventId=0,selectedStage=1,savedResult=null,rightHanded=true,sound=true,audio=null,noticeTime=0,momentTime=0,team;
const t=key=>{if(!(key in strings))throw Error(`Missing soccer string: ${key}`);return strings[key];};
const show=(id,value)=>$(id).hidden=!value;
const listen=(id,type,fn)=>$(id).addEventListener(type,fn,{signal:abort.signal});
function notice(key){$('notice').textContent=t(key);show('notice',true);noticeTime=4;}
function soundGesture(){if(!sound)return;const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;audio??=new Context();if(audio.state==='suspended')audio.resume().catch(()=>{});}
function tone(frequency,start,duration,type='sine'){
  if(!sound||!audio||audio.state!=='running')return;
  const osc=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+start;osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(frequency*1.08,at+duration);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.08,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain).connect(audio.destination);osc.start(at);osc.stop(at+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
function whistle(){tone(1600,0,.22);tone(1850,.3,.45);}
function celebrate(){[523,659,784,1047].forEach((f,i)=>tone(f,i*.1,.3,'triangle'));}
function setPaused(value){paused=value;controls.setEnabled(playing&&!paused);game.clearInput();lastTime=0;}
function updateHud(){
  const s=game.getState(),remaining=Math.max(0,Math.ceil(config.match.halfSeconds-s.halfElapsed));
  $('score').textContent=`${s.score[0]} : ${s.score[1]}`;$('half').textContent=t(s.half===1?'half1':'half2');$('clock').textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;$('stage-hud').textContent=`${t('stage')} ${s.stage}`;
  $('power-fill').style.width=`${Math.round(s.charge/config.physics.chargeSeconds*100)}%`;
  $('shoot').setAttribute('aria-label',`${t('shoot')} · ${t(s.charging?'hold':'tap')}`);
}
function moment(key,seconds=2){$('moment').textContent=t(key);show('moment',true);momentTime=seconds;}
function handleEvents(){
  const s=game.getState();if(s.eventId===eventId)return;eventId=s.eventId;
  if(s.event?.type==='goal'){moment(s.event.team===0?'goal':'theirGoal',config.match.goalSeconds);celebrate();}
  if(s.event?.type==='halftime'){moment('halftime',config.match.halftimeSeconds);whistle();}
  if(s.event?.type==='restart')moment(`restart.${s.event.restart}`,config.match.restartSeconds);
  if(s.result&&playing)finish(s.result);
}
function frame(at){
  if(disposed)return;const dt=lastTime?Math.min((at-lastTime)/1000,.1):0,frameMs=lastTime?at-lastTime:0;lastTime=at;
  if(playing&&!paused){game.update(dt,controls.sample(game.getState().attackDir));handleEvents();}
  view.render(game.getState(),paused?0:dt,document.hidden||paused?0:frameMs);
  hudTime+=dt;if(hudTime>.07){hudTime=0;updateHud();}
  if(noticeTime>0){noticeTime-=dt;if(noticeTime<=0)show('notice',false);}
  if(momentTime>0&&!paused){momentTime-=dt;if(momentTime<=0)show('moment',false);}
  raf=requestAnimationFrame(frame);
}
function start(){
  soundGesture();team=structuredClone(config.team);
  for(const select of document.querySelectorAll('[data-rank]'))team.players[Number(select.dataset.player)][select.dataset.rank]=Number(select.value);
  game=createSoccer({config,seed:Number($('seed').value),stage:selectedStage,team});eventId=0;playing=true;paused=false;root.classList.remove('menu-open');root.classList.add('playing');
  for(const id of ['menu','result','pause-panel','help-panel','moment'])show(id,false);show('hud',true);show('controls',true);controls.setEnabled(true);document.activeElement?.blur();lastTime=0;updateHud();notice(selectedStage===1?'easyHelp':'stageHelp');
}
function finish(result){
  playing=false;controls.setEnabled(false);whistle();savedResult=result;noticeTime=0;show('notice',false);
  $('result-title').textContent=t(result.won?'win':result.goalsFor===result.goalsAgainst?'draw':'lose');$('result-score').textContent=`${result.goalsFor} : ${result.goalsAgainst}`;
  $('stars').textContent=result.won?'★'.repeat(result.stars)+'☆'.repeat(3-result.stars):'☆☆☆';
  $('result-json').textContent=JSON.stringify(result,null,2);$('saved').textContent=t('saved');
  try{localStorage.setItem('soccer-lab',JSON.stringify(result));}catch{$('saved').textContent=t('storageError');}
  show('next',result.won&&result.stage<10);show('result',true);show('controls',false);show('moment',false);updateHud();$('again').focus();
}
function menu(){
  playing=false;paused=false;controls.setEnabled(false);game.clearInput();root.classList.remove('playing');root.classList.add('menu-open');for(const id of ['hud','controls','result','pause-panel','help-panel','moment'])show(id,false);show('menu',true);lastTime=0;
}
function selectStage(stage){selectedStage=stage;for(const button of $('stages').children)button.setAttribute('aria-pressed',String(Number(button.dataset.stage)===stage));}
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);abort.abort();controls?.dispose();view?.dispose();audio?.close().catch(()=>{});}
async function init(){
  const responses=await Promise.all(['config.json','strings.he.json'].map(file=>fetch(new URL(file,import.meta.url)).then(r=>{if(!r.ok)throw Error(file);return r.json();})));[config,strings]=responses;
  document.title=t('title');$('pitch').setAttribute('aria-label',t('title'));
  document.querySelectorAll('[data-text]').forEach(el=>el.textContent=t(el.dataset.text));document.querySelectorAll('[data-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.label)));
  for(let i=1;i<=config.stages.length;i++){const button=document.createElement('button');button.textContent=i;button.dataset.stage=i;button.setAttribute('aria-label',`${t('stage')} ${i}`);button.addEventListener('click',()=>selectStage(i),{signal:abort.signal});$('stages').append(button);}selectStage(1);
  for(let i=0;i<3;i++){
    const row=document.createElement('div');row.className='rank-row';const name=document.createElement('strong');name.textContent=t(config.team.players[i].nameId);row.append(name);
    for(const rank of ['speed','kick','guard']){const label=document.createElement('label');label.textContent=t(rank);const select=document.createElement('select');select.dataset.rank=rank;select.dataset.player=i;select.setAttribute('aria-label',`${name.textContent} · ${t(rank)}`);for(let n=config.team.minRank;n<=config.team.maxRank;n++){const option=document.createElement('option');option.value=n;option.textContent=n;select.append(option);}label.append(select);row.append(label);}$('ranks').append(row);
  }
  try{const last=JSON.parse(localStorage.getItem('soccer-lab'));if(last&&Number.isInteger(last.stage)&&last.stage>=1&&last.stage<=10&&Number.isInteger(last.goalsFor)&&Number.isInteger(last.goalsAgainst)){$('menu-status').textContent=`${t('last')}: ${last.goalsFor} : ${last.goalsAgainst} · ${t('stage')} ${last.stage}`;}}catch{notice('storageError');}
  controls=createControls({root,config:config.controls,onGesture:soundGesture,onCancel:()=>game?.clearInput()});rightHanded=config.controls.rightHanded;controls.setHanded(rightHanded);
  game=createSoccer({config,seed:2026});
  view=createSoccerView({canvas:$('pitch'),config,onAsset:status=>{if(status==='fallback')notice('assetFallback');},onContextLost:()=>{if(!disposed){setPaused(true);show('pause-panel',true);notice('webglError');}}});
  listen('start','click',start);listen('again','click',start);listen('next','click',()=>{selectStage(Math.min(10,selectedStage+1));start();});listen('setup','click',menu);listen('quit','click',menu);
  listen('pause','click',()=>{setPaused(true);show('pause-panel',true);});listen('resume','click',()=>{show('pause-panel',false);setPaused(false);document.activeElement?.blur();});
  listen('help','click',()=>{setPaused(true);show('help-panel',true);});listen('close-help','click',()=>{show('help-panel',false);setPaused(false);document.activeElement?.blur();});
  listen('hand','click',()=>{rightHanded=!rightHanded;controls.setHanded(rightHanded);game.clearInput();$('hand').setAttribute('aria-pressed',String(!rightHanded));document.activeElement?.blur();});
  listen('sound','click',()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',t(sound?'soundOn':'soundOff'));if(sound)soundGesture();document.activeElement?.blur();});$('sound').setAttribute('aria-pressed','true');
  listen('copy-result','click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(savedResult,null,2));$('copy-result').textContent=t('copied');}catch{notice('copyError');}});
  document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden&&playing){setPaused(true);show('pause-panel',true);}},{signal:abort.signal});
  window.addEventListener('blur',()=>{if(playing&&!paused){setPaused(true);show('pause-panel',true);}},{signal:abort.signal});
  window.addEventListener('pagehide',dispose,{signal:abort.signal});
  await view.ready;await new Promise(requestAnimationFrame);$('start').disabled=false;$('start').textContent=t('start');
  if(new URLSearchParams(location.search).has('dev'))window.__soccer={get game(){return game;},view,config,start,menu,finish,setPaused,get paused(){return paused;},step(seconds,input={}){for(let elapsed=0;elapsed<seconds;elapsed+=config.match.fixedStep){game.update(config.match.fixedStep,input);handleEvents();}view.render(game.getState(),.016);updateHud();},dispose};
  raf=requestAnimationFrame(frame);
}
init().catch(error=>{console.error(error);if(strings){$('menu-status').textContent=t('webglError');$('start').textContent=t('loadError');}dispose();});
