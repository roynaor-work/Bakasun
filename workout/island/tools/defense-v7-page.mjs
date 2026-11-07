/* Alien defense view bench: real model + real view (v7 by default, ?defenseV7=0 for the earlier models) on a fixed seed.
 * Window.__defense: {ready, metrics(), shot(frames)}; frames advance the simulation 1/30 s each with a simple autopilot. */
import {createAlienModel} from '../minigames/alien-flight-model.mjs';
import {createAlienView} from '../minigames/alien-view.mjs';
const q=new URLSearchParams(location.search),level=Number(q.get('level')||5);
const all=await (await fetch('../data/config.json')).json(),config=all.minigames,balance=config.alienDefense;
let seed=4242;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const canvas=document.getElementById('c'),paint=canvas.getContext('2d');
const art={};
const ctx={config,balance,art};
const model=createAlienModel({config,balance,level,random,sound(){}, roundChoices:false,completion:'waves'});
const view=createAlienView(ctx,model);
const ready=view?view.ready:Promise.resolve();
function step(n){for(let i=0;i<n;i++){const tx=model.aliens[0]?.x??config.width/2;model.update(1/30,{moveX:Math.sign(tx-model.player.x)*.6,firing:true,nova:false});}}
async function draw(){paint.clearRect(0,0,360,480);return view?.draw(paint);}
window.__defense={ready:ready.then(()=>true),metrics:()=>view?.metrics(),step,draw,model,mode:()=>view?.mode};
document.title='ready';
