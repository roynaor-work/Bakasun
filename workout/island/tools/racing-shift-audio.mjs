// Gear-change noise: renders the real racing audio (procedural engine, sample layer, top-speed variation) offline with a scripted gearbox and measures
// level jumps and clicks around every shift. Usage: node tools/racing-shift-audio.mjs [out.json]; MODE=before keeps nothing special (the code under test is what is on disk).
// racing-v23: SHIFT_STYLES=v22,a,b,c (default all four) renders every gear-change sound of racing-audio ?racingShift=; besides the sample step it reports `spike`,
// the largest second difference near a shift against the 99th percentile of the whole render (high for any hiss), and `onset`: the second-difference energy of the
// first 2 ms after the shift against 10-40 ms after it (a click is a burst at the very start: well above 1; a ramped sound starts quieter: under 1).
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(origin+'/island/tools/character-check.html').catch(()=>{});
const STYLES=(process.env.SHIFT_STYLES||'v22,a,b,c').split(',');
const result=await page.evaluate(async({origin,STYLES})=>{
 const {createRacingAudio}=await import(origin+'/island/minigames/racing-audio.mjs');
 const RATE=44100,DUR=16;
 // scenario: clean upshifts every 1.6 s (t=1.6..9.6) then chatter 7>6>7 around t=12 (the player-run pattern), then a clean downshift at t=14
 const events=[];for(let g=2;g<=7;g++)events.push({t:g*1.6-1.6+1.6,gear:g,kind:'upshift'});
 events.push({t:12,gear:6,kind:'downshift'},{t:12.1,gear:7,kind:'upshift'},{t:12.2,gear:6,kind:'downshift'},{t:12.3,gear:7,kind:'upshift'},{t:14,gear:6,kind:'downshift'});
 async function render({samples,topVar,shift}){
  const offline=new OfflineAudioContext(1,RATE*DUR,RATE);let clock=0;
  const proxy=new Proxy(offline,{get(t,k){if(k==='currentTime')return clock;const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  const audio=createRacingAudio({AudioContext:function(){return proxy;},storage:{getItem:()=>'on'},samples,shift});
  audio.unlock();if(samples)await new Promise(r=>setTimeout(r,2500));
  let gear=1,smoothRpm=.2;const step=1/60;
  for(let t=0;t<DUR;t+=step){clock=t;
   for(const e of events)if(Math.abs(t-e.t)<step/2)gear=e.gear;
   const since=events.filter(e=>e.t<=t).pop(),dt=since?t-since.t:t;
   const speedRatio=Math.min(1,.08+gear*.13),rpmT=Math.max(.14,Math.min(1,.3+.7*Math.min(1,dt*.7)*(gear>=7?1:.9)));
   smoothRpm+=((gear>=7?Math.max(rpmT,.9):rpmT)-smoothRpm)*(1-Math.exp(-step*12));   // the physics smooths rpm with a 12 /s filter
   audio.sync(speedRatio*40,false,{rpm:smoothRpm,gear,throttle:1,topVar,steer:0});
  }
  const buffer=await offline.startRendering();audio.dispose();return Array.from(buffer.getChannelData(0));
 }
 function analyse(data){
  const win=RATE*.02|0,hop=RATE*.005|0,env=[];for(let i=0;i+win<=data.length;i+=hop){let s=0;for(let j=0;j<win;j++)s+=data[i+j]**2;env.push(Math.sqrt(s/win));}
  const db=v=>20*Math.log10(Math.max(v,1e-6));
  const d2=new Float32Array(data.length);for(let i=2;i<data.length;i++)d2[i]=Math.abs(data[i]-2*data[i-1]+data[i-2]);const sorted=Float32Array.from(d2).sort(),p99=sorted[Math.floor(sorted.length*.99)]||1e-9;
  const rows=[];
  for(const e of events){const c=Math.round(e.t*200),lo=Math.max(1,c-8),hi=Math.min(env.length-1,c+40);let jump=0,peak=0;for(let i=lo;i<=hi;i++){jump=Math.max(jump,Math.abs(db(env[i])-db(env[i-1])));}
   const a=Math.round((e.t-.05)*RATE),b=Math.round((e.t+.4)*RATE);let clicks=0,maxStep=0,spike=0;for(let i=a+1;i<b&&i<data.length;i++){const d=Math.abs(data[i]-data[i-1]);maxStep=Math.max(maxStep,d);if(d>.05)clicks++;peak=Math.max(peak,Math.abs(data[i]));spike=Math.max(spike,d2[i]/p99);}
   const rms=(x,y)=>{let q=0,n=0;for(let i=Math.round(x*RATE);i<Math.round(y*RATE)&&i<d2.length;i++){q+=d2[i]*d2[i];n++;}return Math.sqrt(q/Math.max(1,n));},onset=rms(e.t,e.t+.002)/Math.max(1e-12,rms(e.t+.01,e.t+.04));
   rows.push({t:e.t,kind:e.kind,gear:e.gear,maxJumpDb20msWindow:+jump.toFixed(1),peak:+peak.toFixed(3),maxSampleStep:+maxStep.toFixed(4),clicksOver005:clicks,spike:+spike.toFixed(2),onset:+onset.toFixed(2)});}
  const total=data.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
  return {globalPeak:+total.toFixed(3),worstJumpDb:Math.max(...rows.map(r=>r.maxJumpDb20msWindow)),worstStep:Math.max(...rows.map(r=>r.maxSampleStep)),worstPeak:Math.max(...rows.map(r=>r.peak)),totalClicks:rows.reduce((n,r)=>n+r.clicksOver005,0),worstSpike:Math.max(...rows.map(r=>r.spike)),worstOnset:Math.max(...rows.map(r=>r.onset)),rows};
 }
 const out={};
 for(const shift of STYLES)for(const [name,cfg] of [['procedural',{samples:false,topVar:false}],['procedural+topVar',{samples:false,topVar:true}],['procedural+samples',{samples:true,topVar:false}],['all',{samples:true,topVar:true}]])out[shift+':'+name]=analyse(await render({...cfg,shift}));
 return out;
},{origin,STYLES});
await browser.close();server.close();
for(const [k,v] of Object.entries(result))console.log(k.padEnd(24),'peak',v.globalPeak,'worst envelope jump dB per 5ms hop (20ms window)',v.worstJumpDb,'worst sample step',v.worstStep,'worst peak near shifts',v.worstPeak,'clicks',v.totalClicks,'spike',v.worstSpike,'onset',v.worstOnset);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(result,null,1));
