import {startSoccer} from '../../workout/island/minigames/soccer-session.mjs';
import {initialSoccerCard} from '../../workout/island/activity/soccer-card.mjs';
import {initialSoccerRoster} from '../../workout/island/activity/soccer-roster.mjs';

// A separate, synthetic match using the production session. It never reads or
// writes the city's saves, progress, currency, player names or selected teams.
const read=path=>fetch(new URL('../../workout/island/'+path,import.meta.url)).then(r=>{if(!r.ok)throw Error(path);return r.json();});
const [config,team,players,strings]=await Promise.all(['data/config.json','data/team.json','data/players.json','data/strings.he.json'].map(read));
const balance=config.minigames.soccer,t=(key,params={})=>String(strings[key]??key).replace(/\{(\w+)\}/g,(_,k)=>params[k]??'');
const progress={stage:1,stars:[]},card=initialSoccerCard(progress,balance);
const state={team:{...team,rank:0,wins:0},players:players.map(p=>({...config.playerDefaults,...p})),soccerCard:card,soccerRoster:initialSoccerRoster(players,card,balance),minigameProgress:{soccer:progress},minigameLevels:{soccer:1},minigameEquipment:{soccer:Object.fromEntries(Object.keys(balance.equipment).map(k=>[k,0]))},buildings:[],minigameWins:{alienDefense:0},hangar:{},alienUpgrades:{}};
const engine={state,data:{config}},params=new URLSearchParams(location.search),freeze=params.get('freeze')==='1';
const screen=document.querySelector('.game-screen'),canvas=screen.querySelector('canvas'),controls=screen.querySelector('.game-controls'),status=screen.querySelector('.game-status'),message=document.querySelector('#message');
let session,paused=false,closeup=false,lastMetrics=0;
// A disposed session forces its WebGL context lost; a new match needs a new canvas.
let used=false;function freshCanvas(){const current=screen.querySelector('canvas');if(!used){used=true;return current;}const next=current.cloneNode(false);current.replaceWith(next);return next;}
function start(){
 session?.dispose();screen.querySelectorAll('.soccer-scoreboard,.soccer-goal-banner,.soccer-phase-banner,.soccer-edge-arrow,.soccer-fixture,.soccer-action-feedback').forEach(n=>n.remove());controls.replaceChildren();
 paused=freeze;closeup=false;document.querySelector('#pause').textContent=paused?'המשך משחק':'השהיה';
 session=startSoccer({engine,state,balance,canvas:freshCanvas(),controls,status,t,level:Number(params.get('level'))||4,seed:Number(params.get('seed'))||41,difficulty:'normal',soccerCard:card,role:'field',finish:result=>{message.textContent='המשחק הסתיים. אפשר להתחיל משחק חדש.';session?.setPaused(true);},cancel:()=>{session?.dispose();message.textContent='המשחק נסגר.';},onError:()=>{message.textContent='טעינת הגרפיקה נכשלה.';}});
 session.setPaused(paused);message.textContent='חצים לתנועה · רווח לבעיטה · X למסירה · Shift לספרינט · C להחלפה';
 if(params.get('closeup')==='1'){session.debug?.poseCamera(0);closeup=true;}
}
document.querySelector('#play').onclick=start;
document.querySelector('#pause').onclick=()=>{paused=!paused;session.setPaused(paused);document.querySelector('#pause').textContent=paused?'המשך משחק':'השהיה';};
document.querySelector('#closeup').onclick=()=>{session.debug?.poseCamera(0);closeup=true;};
document.querySelector('#wide').onclick=()=>{session.debug?.poseCamera(null);closeup=false;};
document.querySelector('#economy').onclick=()=>{for(let i=0;i<3;i++)session.debug?.qualitySample(100,10);message.textContent='מצב חסכוני: המשחק והדמויות נשמרים, פרטי הרקע ואיכות הרינדור יורדים.';};
document.querySelector('#handed').onclick=()=>{controls.classList.toggle('left-handed');};
function report(at){if(session&&at-lastMetrics>750){lastMetrics=at;const s=session.snapshot,p=s.players?.[s.controlled];document.querySelector('#metrics').textContent=JSON.stringify({paused,closeup,score:s.score,controlled:s.controlled,players:s.players?.length,controlledPosition:p?{x:p.x,z:p.z}:null,ball:s.ball,mode:s.mode,charging:s.charging,charge:s.charge,...s.renderMetrics},null,2);}requestAnimationFrame(report);}
// Dev-only handle for automated visual checks (?dev=1); never used by the game itself.
if(params.get('dev')==='1')window.soccerReview={get session(){return session;}};
window.addEventListener('pagehide',()=>session?.dispose());
// Frame-rate readout for checking on a phone: frames drawn per second, updated every second.
{const fps=document.createElement('span');fps.id='fps';fps.setAttribute('role','status');fps.style.cssText='margin-inline-start:.6em;font-size:.85em;opacity:.85;white-space:nowrap';document.querySelector('.review-header small')?.after(fps);
let frames=0,since=performance.now();const count=now=>{frames++;if(now-since>=1000){const rate=frames*1000/(now-since);fps.textContent=`${rate>=10?Math.round(rate):rate.toFixed(1)} פריימים בשנייה`;frames=0;since=now;}requestAnimationFrame(count);};requestAnimationFrame(count);}
start();requestAnimationFrame(report);
