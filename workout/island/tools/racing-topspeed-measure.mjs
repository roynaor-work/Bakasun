// 10 s at the rev limit (gear 7, rpm .98): pitch and level statistics with and without the top-speed variation. Usage: node tools/racing-topspeed-measure.mjs [out.json]
import {createRacingAudio} from '../minigames/racing-audio.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
function collect(topVar){
 let clock=2;const oscillators=[],gains=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
 class Ctx{constructor(){this.state='running';this.destination={};this.sampleRate=44100;}get currentTime(){return clock;}set currentTime(v){}createOscillator(){const n=node();oscillators.push(n);return n;}createBiquadFilter(){return node();}createGain(){const n=node();gains.push(n);return n;}createBuffer(){return {getChannelData:()=>new Float32Array(2048)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}}
 const audio=createRacingAudio({AudioContext:Ctx,storage:{getItem:()=>'on'}});audio.unlock();const pitch=[],level=[];
 for(let i=0;i<200;i++){clock=2+i*.05;audio.sync(40,false,{rpm:.98,gear:7,throttle:1,topVar});if(i>=10){pitch.push(oscillators[0].frequency.value);level.push(gains[0].gain.value);}}
 audio.dispose();return {pitch,level};
}
const stat=a=>{const m=a.reduce((x,y)=>x+y)/a.length,sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);return {mean:+m.toFixed(4),sd:+sd.toFixed(4),min:+Math.min(...a).toFixed(4),max:+Math.max(...a).toFixed(4),distinct:new Set(a.map(v=>Math.round(v*1e4))).size};};
const out={};for(const [k,v] of [['before',false],['after',true]]){const c=collect(v);out[k]={pitchHz:stat(c.pitch),level:stat(c.level),limiterCuts:c.level.filter((x,i,a)=>i>0&&x<a[i-1]*.7).length};}
console.log(JSON.stringify(out,null,1));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
