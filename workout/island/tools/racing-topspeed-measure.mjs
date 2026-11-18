// Top-speed sound. Part 1 (racing-topspeed-sound): 10 s at the rev limit (gear 7, rpm .98): pitch and level statistics with and without the top-speed variation.
// Part 2 (racing-deep-m3): a full flying lap on every circuit (pro bot, no nitro), the real physics rpm/gear/throttle driving the real audio code with the
// race clock: the longest continuous stretch in which the engine note stays within 2% of the lap's highest pitch (target: never more than 1.5 s, also on
// the straights), the share of the lap near the top, the share in gear 7, and the top speed actually reached (as a fraction of the car's maximum).
// Usage: node tools/racing-topspeed-measure.mjs [out.json]; env TOPCAP=0 measures with the previous gear-7 model (the car reaches 100% on throttle alone).
import {createRacingAudio} from '../minigames/racing-audio.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';
import {TRACKS} from '../minigames/racing-tracks.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const topCap=process.env.TOPCAP!=='0';
function fakeContext(){
 let clock=2;const oscillators=[],gains=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
 class Ctx{constructor(){this.state='running';this.destination={};this.sampleRate=44100;}get currentTime(){return clock;}set currentTime(v){}createOscillator(){const n=node();oscillators.push(n);return n;}createBiquadFilter(){return node();}createGain(){const n=node();gains.push(n);return n;}createBuffer(){return {getChannelData:()=>new Float32Array(2048)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 return {Ctx,oscillators,gains,set(t){clock=t;}};
}
function collect(topVar){
 const f=fakeContext(),audio=createRacingAudio({AudioContext:f.Ctx,storage:{getItem:()=>'on'}});audio.unlock();const pitch=[],level=[];
 for(let i=0;i<200;i++){f.set(2+i*.05);audio.sync(40,false,{rpm:.98,gear:7,throttle:1,topVar});if(i>=10){pitch.push(f.oscillators[0].frequency.value);level.push(f.gains[0].gain.value);}}
 audio.dispose();return {pitch,level};
}
const stat=a=>{const m=a.reduce((x,y)=>x+y)/a.length,sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);return {mean:+m.toFixed(4),sd:+sd.toFixed(4),min:+Math.min(...a).toFixed(4),max:+Math.max(...a).toFixed(4),distinct:new Set(a.map(v=>Math.round(v*1e4))).size};};
const out={};for(const [k,v] of [['before',false],['after',true]]){const c=collect(v);out[k]={pitchHz:stat(c.pitch),level:stat(c.level),limiterCuts:c.level.filter((x,i,a)=>i>0&&x<a[i-1]*.7).length};}
// part 2: a flying lap per circuit through the real audio
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function lap(id){
 const race=createRacing({stage:TRACKS.findIndex(t=>t.id===id)+1,seed:3,config:{countdown:0,topCap,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player;
 const f=fakeContext(),audio=createRacingAudio({AudioContext:f.Ctx,storage:{getItem:()=>'on'}});audio.unlock();
 const top=race.stage.playerSpeed,rows=[];
 for(let t=0;t<900*60&&p.lapTimes.length<2;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  const brake=curv>.9&&p.speed>24,drift=Math.abs(err)>.22&&p.speed>14;
  race.step(1/60,{steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake,drift,nitro:false});
  f.set(2+(t+1)/60);audio.sync(p.speed,p.boosting,{drifting:p.drifting,offroad:p.offroad,steer:p.steer,rpm:p.rpm,gear:p.gear,throttle:brake?.1:1,topVar:true});
  if(p.lapTimes.length===1)rows.push({pitch:f.oscillators[0].frequency.value,gear:p.gear,speed:p.speed,rpm:p.rpm});
 }
 audio.dispose();race.dispose();
 const max=Math.max(...rows.map(r=>r.pitch)),near=rows.map(r=>r.pitch>=max*.98);
 let longest=0,run=0;for(const n of near){run=n?run+1:0;longest=Math.max(longest,run);}
 const steady=[];let s=0;for(let i=1;i<rows.length;i++){if(Math.abs(rows[i].pitch-rows[i-1].pitch)<.15)s++;else{if(s>steady.length)steady.push(s);s=0;}}
 return {lapS:+p.lapTimes[1].toFixed(1),maxPitchHz:+max.toFixed(1),longestNearTopS:+(longest/60).toFixed(2),shareNearTop:+(near.filter(Boolean).length/rows.length*100).toFixed(1),shareGear7:+(rows.filter(r=>r.gear>=7).length/rows.length*100).toFixed(1),
  topSpeedReached:+(Math.max(...rows.map(r=>r.speed))/top*100).toFixed(1),longestSteadyPitchS:+((Math.max(0,...steady,s))/60).toFixed(2)};
}
out.laps={};for(const t of TRACKS)out.laps[t.id]=lap(t.id);
out.topCap=topCap;
console.log(JSON.stringify({before:out.before,after:out.after},null,1));
for(const [id,l] of Object.entries(out.laps))console.log(id.padEnd(8),'lap',l.lapS,'s | longest within 2% of max pitch',l.longestNearTopS,'s | near top',l.shareNearTop+'%','| gear 7',l.shareGear7+'%','| top speed reached',l.topSpeedReached+'%','| longest steady pitch',l.longestSteadyPitchS,'s');
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
