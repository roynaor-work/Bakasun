// Gear-change noise: renders the real racing audio (procedural engine, sample layer, top-speed variation) offline with a scripted gearbox and measures
// level jumps and clicks around every shift. Usage: node tools/racing-shift-audio.mjs [out.json]; MODE=before keeps nothing special (the code under test is what is on disk).
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(origin+'/island/tools/character-check.html').catch(()=>{});
const result=await page.evaluate(async({origin})=>{
 const {createRacingAudio}=await import(origin+'/island/minigames/racing-audio.mjs');
 const RATE=44100,DUR=16;
 // scenario: clean upshifts every 1.6 s (t=1.6..9.6) then chatter 7>6>7 around t=12 (the player-run pattern), then a clean downshift at t=14
 const events=[];for(let g=2;g<=7;g++)events.push({t:g*1.6-1.6+1.6,gear:g,kind:'upshift'});
 events.push({t:12,gear:6,kind:'downshift'},{t:12.1,gear:7,kind:'upshift'},{t:12.2,gear:6,kind:'downshift'},{t:12.3,gear:7,kind:'upshift'},{t:14,gear:6,kind:'downshift'});
 async function render({samples,topVar}){
  const offline=new OfflineAudioContext(1,RATE*DUR,RATE);let clock=0;
  const proxy=new Proxy(offline,{get(t,k){if(k==='currentTime')return clock;const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  const audio=createRacingAudio({AudioContext:function(){return proxy;},storage:{getItem:()=>'on'},samples});
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
  const rows=[];
  for(const e of events){const c=Math.round(e.t*200),lo=Math.max(1,c-8),hi=Math.min(env.length-1,c+40);let jump=0,peak=0;for(let i=lo;i<=hi;i++){jump=Math.max(jump,Math.abs(db(env[i])-db(env[i-1])));}
   const a=Math.round((e.t-.05)*RATE),b=Math.round((e.t+.25)*RATE);let clicks=0,maxStep=0;for(let i=a+1;i<b&&i<data.length;i++){const d=Math.abs(data[i]-data[i-1]);maxStep=Math.max(maxStep,d);if(d>.05)clicks++;peak=Math.max(peak,Math.abs(data[i]));}
   rows.push({t:e.t,kind:e.kind,gear:e.gear,maxJumpDb20msWindow:+jump.toFixed(1),peak:+peak.toFixed(3),maxSampleStep:+maxStep.toFixed(3),clicksOver005:clicks});}
  const total=data.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
  return {globalPeak:+total.toFixed(3),worstJumpDb:Math.max(...rows.map(r=>r.maxJumpDb20msWindow)),worstStep:Math.max(...rows.map(r=>r.maxSampleStep)),worstPeak:Math.max(...rows.map(r=>r.peak)),totalClicks:rows.reduce((n,r)=>n+r.clicksOver005,0),rows};
 }
 const out={};
 for(const [name,cfg] of [['procedural',{samples:false,topVar:false}],['procedural+topVar',{samples:false,topVar:true}],['procedural+samples',{samples:true,topVar:false}],['all',{samples:true,topVar:true}]])out[name]=analyse(await render(cfg));
 return out;
},{origin});
await browser.close();server.close();
for(const [k,v] of Object.entries(result))console.log(k.padEnd(20),'peak',v.globalPeak,'worst envelope jump dB per 5ms hop (20ms window)',v.worstJumpDb,'worst sample step',v.worstStep,'worst peak near shifts',v.worstPeak,'clicks',v.totalClicks);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(result,null,1));
