// racing-v24.6 audio measurement (evidence only, nothing is listened to): the session's racing audio engine (racing-audio.mjs with the sample layers and Roy's
// recordings, the options the session passes) rendered in Chromium through an OfflineAudioContext, driven frame by frame (1/60 s) by the real race model
// (racing-physics.mjs, stage N, the "kid" pilot: auto gas, pursuit steering, never brakes), so every lift, downshift and re-engaging upshift happens where
// the game makes it happen. Run once per version (the flags are read from the page address):
//   node workout/island/tools/racing-audio-v24-6.mjs <outDir> [--seconds=60] [--stage=1] [--rivals=5] [--query=racingAudioV246=0] [--label=before]
// (--edge=m: the pilot weaves to m metres beyond the asphalt edge and back, every 90 m of track, so the verge and the run-off are driven on;
// --rivals = extra computer cars beside the stage's own, their engines fed through setOpponents as the session does; 0 = alone on the track)
// Writes <outDir>/<label>.wav (mono 44.1 kHz) and <label>.json (the events and the engine counters); tools/racing-audio-v24-6.py measures them.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const args=process.argv.slice(2),outDir=args.find(a=>!a.startsWith('--'))||'racing-audio-v24-6-out';
const opt=(name,fallback)=>{const hit=args.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const SECONDS=Number(opt('seconds',60)),STAGE=Number(opt('stage',1)),RIVALS=Number(opt('rivals',5)),EDGE=Number(opt('edge',0)),QUERY=opt('query',''),LABEL=opt('label',QUERY?'before':'after');
await mkdir(outDir,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${server.url}release.json${QUERY?'?'+QUERY:''}`);
 const result=await page.evaluate(async({SECONDS,STAGE,RIVALS,EDGE})=>{
  const base=new URL('/workout/island/minigames/',location.href).href,load=f=>import(base+f);
  const [{createRacing},{v24PhysicsConfig,racingV24Flags},{racingV244Flags,surfaceAt},{v245PhysicsConfig,racingV245Flags},{racingV246Flags},{createRacingAudio}]=await Promise.all(['racing-physics.mjs','racing-v24.mjs','racing-v24-4.mjs','racing-v24-5.mjs','racing-v24-6.mjs','racing-audio.mjs'].map(load));
  const v24=racingV24Flags(),v244=racingV244Flags(),v245=racingV245Flags(),v246=racingV246Flags(),SR=44100;
  const off=new OfflineAudioContext(1,Math.ceil(SR*SECONDS),SR);
  const audio=createRacingAudio({AudioContext:function(){return off;},storage:null,samples:true,blowoff:v24.turbo==='v23',hiss:v24.hiss,v4:v24.audioV4,pit:false,v5:v244.audioV5,idle:v244.idle,pass:v244.pass,air:v245.air,rec:v245.rec,v246:v246.audio});
  audio.unlock();
  for(let i=0;i<400&&!(audio.engine().v5Ready&&audio.engine().rec);i++)await new Promise(r=>setTimeout(r,50));
  const ready={v5:audio.engine().v5Ready,rec:audio.engine().rec};
  const race=createRacing({stage:STAGE,seed:5,config:{countdown:0,extraRivals:RIVALS,walls:false,offTrack:true,...v24PhysicsConfig(v24),...v245PhysicsConfig(v245),stage:{...(RIVALS?{}:{opponents:0}),laps:3,timeLimit:400}}}),p=race.state.player,track=race.track;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const events=[],frames=[];let prevGear=p.gear,lift=false,lastRank=0;
  const step=k=>{const t=k/60;
   const pr=track.project(p.x,p.z,p.s),tg0=track.sample(pr.s+10+p.speed*.5),lane=EDGE?(track.width/2+EDGE)*Math.sin(pr.s/90):0,tg={x:tg0.x+tg0.normal.x*lane,z:tg0.z+tg0.normal.z*lane},err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
   race.step(1/60,{steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false});
   if(p.lifting&&!lift)events.push({t,type:'liftStart',rpm:+p.rpm.toFixed(2)});if(!p.lifting&&lift)events.push({t,type:'liftEnd'});lift=!!p.lifting;
   if(p.gear!==prevGear)events.push({t,type:p.gear<prevGear?'down':'up',from:prevGear,to:p.gear});prevGear=p.gear;
   const s=race.state;if(lastRank&&s.rank<lastRank&&s.phase==='racing'){const passed=s.cars.find(c=>c.rank===s.rank+1&&!c.isPlayer),dx=passed?passed.x-p.x:0,dz=passed?passed.z-p.z:0;events.push({t,type:'pass'});audio.event('pass',passed?{pan:Math.max(-1,Math.min(1,(dx*-Math.cos(p.heading)+dz*Math.sin(p.heading))/4)),rpm:passed.rpm,speed:passed.speed,mine:p.speed}:{});}lastRank=s.rank;
   if(RIVALS)audio.setOpponents(race.state.cars.slice(1).map(c=>{const dx=c.x-p.x,dz=c.z-p.z;return {rpm:c.rpm,gear:c.gear,throttle:c.speed>1?1:.3,distance:Math.hypot(dx,dz),pan:(dx*-Math.cos(p.heading)+dz*Math.sin(p.heading))/25};}));
   audio.sync(p.speed,p.boosting,{drifting:p.drifting,offroad:p.offroad,steer:p.steer,kerb:0,surface:v244.audioV5?surfaceAt({lateral:p.lateral,halfWidth:track.width/2,f1:!!track.f1,pit:false}):undefined,pitPhase:'',grid:race.state.phase==='countdown',lamps:0,topVar:true,rpm:p.rpm,gear:p.gear,throttle:p.lifting?.15:1,brake:false});
   if(k%3===0)frames.push({t:+t.toFixed(3),speed:+p.speed.toFixed(1),gear:p.gear,rpm:+p.rpm.toFixed(2),lift:lift?1:0,beyond:+(Math.abs(p.lateral)-track.width/2).toFixed(2),drift:p.drifting?1:0,off:p.offroad?1:0,boost:p.boosting?1:0,noise:+audio.engine().noise.toFixed(4),layers:JSON.stringify(audio.engine().samples)});};
  for(let k=0;k<SECONDS*60;k++)off.suspend(k/60).then(()=>{try{step(k);}catch(e){events.push({t:k/60,type:'error',message:String(e)});}off.resume();});
  const buffer=await off.startRendering(),data=buffer.getChannelData(0),pcm=new Int16Array(data.length);let peak=0;
  for(let i=0;i<data.length;i++){const v=Math.max(-1,Math.min(1,data[i]));peak=Math.max(peak,Math.abs(v));pcm[i]=Math.round(v*32767);}
  const bytes=new Uint8Array(pcm.buffer);let bin='';for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));
  const e=audio.engine();audio.dispose();race.dispose();
  return {flags:{v246:v246.audio,air:v245.air,rec:v245.rec,v5:v244.audioV5},ready,engine:{v246:e.v246,backfires:e.backfires,blips:e.blips,silentUps:e.silentUps,shifts:e.shifts},events,frames,peak,b64:btoa(bin),sampleRate:SR};
 },{SECONDS,STAGE,RIVALS,EDGE});
 const pcm=Buffer.from(result.b64,'base64'),h=Buffer.alloc(44);
 h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(result.sampleRate,24);h.writeUInt32LE(result.sampleRate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
 await writeFile(path.join(outDir,LABEL+'.wav'),Buffer.concat([h,pcm]));delete result.b64;
 await writeFile(path.join(outDir,LABEL+'.json'),JSON.stringify({label:LABEL,query:QUERY,stage:STAGE,seconds:SECONDS,errors,...result}));
 const c=t=>result.events.filter(e=>e.type===t).length;
 console.log(JSON.stringify({label:LABEL,query:QUERY,flags:result.flags,ready:result.ready,engine:result.engine,lifts:c('liftStart'),downs:c('down'),ups:c('up'),peak:+result.peak.toFixed(3),errors}));
}finally{await browser.close();await server.close();}
