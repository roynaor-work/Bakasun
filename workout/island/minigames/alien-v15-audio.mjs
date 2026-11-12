/** v15 steady-cannon sound. The shared alien audio treats every 'shot' as a Vulcan pulse (it starts the
 * BRRRT loop and stops it 0.14 s after the last pulse), so a 4/s cannon would spin the Vulcan up and down
 * on every shot. Steady shots therefore play the boar island's basic rifle (BOAR_MG from alien-v11) on a
 * small context of their own; the Vulcan loop stays for bursts. Same mute key as the rest of the island. */
import {BOAR_MG,playLayers,whiteNoise} from './alien-v11.mjs?v=island-v2-20261107-10';
export function createV15ShotAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 let context,master,white,paused=false,disposed=false,last=-1,played=0;const queue=[];
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 function unlock(){
  if(disposed||!AudioContext)return;
  try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.3;master.connect(context.destination);white=whiteNoise(context);}
   if(!paused&&context.state==='suspended')void context.resume().catch(()=>{});}catch{/* audio never stops gameplay */}
 }
 function play(){
  if(disposed||paused||muted())return false;unlock();if(!context||context.state!=='running')return false;
  const now=context.currentTime;if(now-last<BOAR_MG.minGap)return false;last=now;
  while(queue.length&&queue[0]<=now)queue.shift();if(queue.length>=6)return false;queue.push(now+.2);
  try{playLayers(context,master,white,BOAR_MG.layers,now,{vol:2.2,pitch:.9+Math.random()*.12});played++;return true;}catch{return false;}
 }
 return {play,unlock,setPaused(value){paused=Boolean(value);if(paused){if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},metrics(){return {played,active:Boolean(context)};},dispose(){disposed=true;if(context)void context.close().catch(()=>{});}};
}
