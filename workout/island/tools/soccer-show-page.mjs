/** soccerShow v1 evidence page: real league matches (same session, view, HUD and CSS as the game) with the perf bench's bot, counting
 * goals against replays, their on-screen length, how long the model was held, the render cost per show phase against live play, and
 * console errors. Opens on a phone (tap the button) and in Playwright (?auto=1&matches=2&quality=2). Soccer only; nothing is written. */
import {startSoccer} from '../minigames/soccer-session.mjs?v=island-v2-20261107-8';
import {leagueMatch} from '../minigames/soccer-campaign.mjs?v=island-v2-20261107-8';
import {initialSoccerCard} from '../activity/soccer-card.mjs?v=island-v2-20261107-8';
import {initialSoccerRoster} from '../activity/soccer-roster.mjs?v=island-v2-20261107-8';
import {createTranslator} from '../ui/translate.mjs?v=island-v2-20261107-8';

const query=new URLSearchParams(location.search);
if(query.get('dev')!=='1'){query.set('dev','1');location.replace(`${location.pathname}?${query}`);}
const PIN=Math.max(0,Math.min(3,Number(query.get('quality'))||0)),MATCHES=Math.max(1,Number(query.get('matches'))||2),MAX_SECONDS=Math.max(30,Number(query.get('seconds'))||900),SEED=(Number(query.get('seed'))||7)>>>0,LEVEL=Math.max(1,Number(query.get('level'))||1);
const $=id=>document.getElementById(id),status=$('show-status'),report=$('show-report'),startButton=$('show-start');
const json=async url=>{const r=await fetch(new URL(url,import.meta.url));if(!r.ok)throw Error(url);return r.json();};
const [config,strings,players,team]=await Promise.all([json('../data/config.json'),json('../data/strings.he.json'),json('../data/players.json'),json('../data/team.json')]);
const t=createTranslator(strings,()=>{}),balance=config.minigames.soccer;
const errors=[];addEventListener('error',e=>errors.push(String(e.message||e)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.message||e.reason)));

function fakeContext(onFinish){
  const card=initialSoccerCard(null,balance),roster=initialSoccerRoster(players,card,balance);
  const state={team:{...team,wins:0,rank:0,sportWins:{soccer:0,tennis:0}},players:players.map(p=>({...config.playerDefaults,...p})),soccerCard:card,soccerRoster:roster,
    minigameProgress:{soccer:{stage:LEVEL,stars:[]}},buildings:[],minigameLevels:{soccer:1},minigameEquipment:{soccer:{speed:0,kick:0,guard:0}},hangar:{},minigameWins:{},alienUpgrades:{}};
  const league=leagueMatch(balance,LEVEL);
  return {engine:{data:{config},state},state,level:LEVEL,seed:SEED,difficulty:league.leagues?league.difficulty:card.difficulty,soccerCard:card,role:'field',
    canvas:$('show-canvas'),controls:$('show-controls'),status:$('show-live'),t,finish:onFinish,cancel(){},onError(id){errors.push('onError '+id);}};
}
/** The perf bench's bot: chase, dribble toward goal, shoot near the box, pass now and then. */
function createBot(seed){
  let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  let hold=0,passHold=0,sinceDecision=0;
  return (s,dt)=>{
    const p=s.players[s.controlled],b=s.ball,hx=balance.pitch.length/2,goalX=s.attackDir*hx,input={moveX:0,moveZ:0,kickHeld:false,passHeld:false,sprintHeld:false,switchPlayer:false};
    sinceDecision+=dt;let dx,dz;
    if(b.owner===p.id){dx=goalX-p.x;dz=-p.z*.35;if(hold<=0&&passHold<=0&&sinceDecision>.6){sinceDecision=0;if(Math.abs(goalX-p.x)<15&&random()<.55)hold=.3+random()*.3;else if(random()<.2)passHold=.08+random()*.3;}}
    else{dx=b.x-p.x;dz=b.z-p.z;input.sprintHeld=Math.hypot(dx,dz)>6;}
    const l=Math.hypot(dx,dz)||1;input.moveX=dx/l;input.moveZ=dz/l;
    if(hold>0){hold-=dt;input.kickHeld=hold>0;}if(passHold>0){passHold-=dt;input.passHeld=passHold>0;}
    return input;
  };
}
const stats=list=>{const s=[...list].sort((a,b)=>a-b),q=p=>s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0;return {n:list.length,mean:+(list.reduce((a,b)=>a+b,0)/(list.length||1)).toFixed(2),p50:+q(.5).toFixed(2),p95:+q(.95).toFixed(2),max:+(s.at(-1)||0).toFixed(2)};};

const SCREEN=document.querySelector('.game-screen'),SCREEN_HTML=SCREEN.innerHTML;
async function runMatch(index,out){
  // A disposed session has lost its WebGL context and left its HUD nodes behind: every match gets a fresh game screen (the shell does the same).
  SCREEN.innerHTML=SCREEN_HTML;
  let finished;const done=new Promise(r=>finished=r);
  const session=startSoccer({...fakeContext(result=>finished(result)),balance});
  if(!session.debug)throw Error('open with ?dev=1');
  await new Promise(resolve=>{const check=()=>session.snapshot.renderMetrics?.assetStatus!=='loading'&&session.ready?resolve():requestAnimationFrame(check);check();});
  const model0=session.debug.model,view=session.debug.view,bot=createBot(SEED^(0x9e3779b9+index));
  for(let i=0;i<PIN;i++)view.qualitySample(20000,1);
  // The session swaps the model for the shootout; the bot hooks whichever model is current.
  let hooked=null;const hook=()=>{const m=session.debug.model;if(m===hooked)return;hooked=m;const update=m.update;m.update=(dt,input)=>update.call(m,dt,Object.assign(input||{},bot(m.getState(),dt)));};
  const render=view.render;const match={index,goals:[],shorts:0,fulltime:null,renderMs:{live:[],cut:[],replay:[],celebrate:[],short:[],fulltime:[]},holdSeconds:0,phases:{},quality:null};
  let lastPhase='live',current=null,lastStarts=0,lastShorts=0,goalsSeen=0,lastScore='0,0';
  view.render=(s,dt,frameMs)=>{
    hook();const at=performance.now();render(s,dt,frameMs);const ms=performance.now()-at;
    const m=view.metrics().show,phase=m?.phase||'live',live=session.debug.model.getState(),score=String(live.score);
    (match.renderMs[phase]||(match.renderMs[phase]=[])).push(ms);match.phases[phase]=(match.phases[phase]||0)+dt;if(m?.hold)match.holdSeconds+=dt;
    if(score!==lastScore&&!live.shootout){lastScore=score;goalsSeen++;current={goal:goalsSeen,score:live.score.slice(),replay:null,replayWall:0,celebrateWall:0,holdWall:0,reason:null,cuts:null,recordingSeconds:m?.recording?.seconds??null,elapsed:+live.elapsed.toFixed(1)};match.goals.push(current);}
    if(current){if(m?.hold)current.holdWall+=dt;if(phase==='replay')current.replayWall+=dt;if(phase==='celebrate')current.celebrateWall+=dt;if(phase==='replay'&&!current.cuts){current.cuts=m.cuts;current.replay=true;current.wall=m.wall;}if(phase==='celebrate'&&current.reason===null)current.reason=m.reason;if(phase==='live'&&lastPhase!=='live'&&lastPhase!=='short'&&current.replay!==null)current.done=true;}
    if(m&&m.shorts!==lastShorts){lastShorts=m.shorts;match.shorts++;}
    if(m)lastStarts=m.starts;
    if(phase==='fulltime'&&match.fulltime===null)match.fulltime={at:+live.elapsed.toFixed(1),score:live.score.slice()};
    lastPhase=phase;
  };
  const started=performance.now();
  const result=await Promise.race([done,new Promise(r=>setTimeout(()=>r({timeout:true}),MAX_SECONDS*1000))]);
  const metrics=view.metrics();
  match.result=result?.soccer?{score:[result.soccer.goalsFor,result.soccer.goalsAgainst],won:result.soccer.won}:result;match.wallSeconds=+((performance.now()-started)/1000).toFixed(1);
  match.replayStarts=lastStarts;match.quality={final:metrics.quality,assetStatus:metrics.assetStatus,characters:view.report().characters,triangles:metrics.triangles,drawCalls:metrics.drawCalls};
  for(const key of Object.keys(match.renderMs))match.renderMs[key]=stats(match.renderMs[key]);
  for(const key of Object.keys(match.phases))match.phases[key]=+match.phases[key].toFixed(1);
  session.dispose();out.push(match);
}

async function run(){
  startButton.disabled=true;const matches=[];
  for(let i=0;i<MATCHES;i++){status.textContent=`משחק ${i+1} מתוך ${MATCHES}...`;await runMatch(i,matches);}
  const goals=matches.flatMap(m=>m.goals),replays=goals.filter(g=>g.replay),skipped=goals.filter(g=>!g.replay);
  const summary={viewport:{width:innerWidth,height:innerHeight},pinnedQuality:PIN,level:LEVEL,seed:SEED,matches:matches.length,userAgent:navigator.userAgent,
    goals:goals.length,replays:replays.length,replaysSkipped:skipped.map(g=>({goal:g.goal,reason:g.reason,recordingSeconds:g.recordingSeconds})),
    replayWall:stats(replays.map(g=>g.replayWall)),celebrateWall:stats(goals.map(g=>g.celebrateWall)),holdPerGoal:stats(goals.map(g=>g.holdWall)),shortReplays:matches.reduce((n,m)=>n+m.shorts,0),
    renderMs:Object.fromEntries(['live','cut','replay','celebrate','short','fulltime'].map(k=>[k,stats(matches.flatMap(m=>m.renderMs[k]?.n?[m.renderMs[k].mean]:[]))])),
    errors:[...errors],matches};
  const pre=document.createElement('pre');pre.textContent=JSON.stringify(summary,null,1);report.replaceChildren(pre);report.hidden=false;status.textContent='הבדיקה הסתיימה.';startButton.disabled=false;
  window.__show={done:true,result:summary};
}
startButton.addEventListener('click',()=>run().catch(e=>{status.textContent='שגיאה: '+e.message;window.__show={done:true,error:String(e),errors};}));
if(query.get('auto')==='1')run().catch(e=>{status.textContent='שגיאה: '+e.message;window.__show={done:true,error:String(e),errors};});
