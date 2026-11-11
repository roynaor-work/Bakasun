/* The real tennis session (tennis-session.mjs: HUD, meters, controls) with the real engine, outside the app shell, so a browser test can play
 * a whole match with touch events. URL: ?level=1 &difficulty=easy|normal|hard &seed=4107 &tennisHold=0 ... (the same flags as the game).
 * Results: window.__ts = {session, model (snapshot), finish}. */
import {loadData} from '../engine/load-data.mjs';
import {createEngine} from '../engine/engine.mjs';
import {startTennis} from '../minigames/tennis-session.mjs';
const q=new URLSearchParams(location.search);
const data=await loadData(new URL('../',import.meta.url),fetch);
const strings=await (await fetch('../data/strings.he.json')).json();
const t=(key,params={})=>(strings[key]??key).replace(/\{(\w+)\}/g,(_,k)=>params[k]??'');
const engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>Date.now()});
const dialog=document.querySelector('.game-screen'),status=dialog.querySelector('.game-status'),canvas=dialog.querySelector('canvas'),controls=dialog.querySelector('.game-controls');
const results=[];
const session=startTennis({engine,state:engine.state,level:Number(q.get('level')||1),seed:(Number(q.get('seed'))||4107)>>>0,difficulty:q.get('difficulty')||'easy',canvas,controls,status,dialog,t,finish:r=>{results.push(r);return {ok:true};},sound:()=>{},balance:data.config.minigames.tennis,equipment:{speed:1,hit:1,serve:1}});
window.__ts={session,results,engine,get model(){return session.debug?.model??null;}};
window.__tsReady=true;
