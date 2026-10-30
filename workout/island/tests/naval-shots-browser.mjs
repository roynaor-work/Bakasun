// Fixed-state naval screenshots for before/after comparison, and an optional
// frame sequence for a short clip (NAVAL_CLIP=1, 844x390 only). The same input
// stream runs on any branch: stage 3, normal shell, full health, untouched ammo.
// NAVAL_SHOTS_HAND=left swaps the controls. After the ordinary hit, a solved
// shot at the hull centre gives the weak-centre frames. In clip mode the game's
// own sound calls are logged in game time and rendered offline through the
// game's audio module (NAVAL_CLIP_AUDIO=1 writes clip-audio.wav).
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.NAVAL_SHOTS_DIR?new URL('file://'+process.env.NAVAL_SHOTS_DIR.replace(/\/?$/,'/')):new URL('../verification/naval-shots/',import.meta.url);await mkdir(out,{recursive:true});
const prefix=process.env.NAVAL_SHOTS_PREFIX||'after',clip=process.env.NAVAL_CLIP==='1',left=process.env.NAVAL_SHOTS_HAND==='left';
const sizes=[{width:844,height:390},{width:740,height:360},{width:1366,height:768}].filter(v=>!process.env.NAVAL_SHOTS_ONLY||String(v.width)===process.env.NAVAL_SHOTS_ONLY);
await verify('naval-shots',clip?[{width:844,height:390}]:sizes,async({page,context,viewport,tick,snap,start,exit})=>{
 const tag=`${viewport.width}x${viewport.height}`,capture=name=>page.screenshot({path:new URL(`${prefix}-${tag}-${name}.jpg`,out).pathname,type:'jpeg',quality:90});
 const phone=viewport.width<1000,client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(left=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;if(left)localStorage.setItem('island.naval.hand','left');else localStorage.removeItem('island.naval.hand');},left);
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 // The hold starts on the aim pad beside the Fire button and above the weapon dock, so a
 // straight upward drag never crosses the cancel chip. Left-handed mirrors it.
 const b=await page.locator('#shoot').boundingBox(),fire={x:b.x+b.width/2+(left?1:-1)*viewport.width*.27,y:b.y+b.height/2-40};
 const down=async()=>{if(phone)await touch('touchStart',[fire]);else{await page.mouse.move(fire.x,fire.y);await page.mouse.down();}};
 const move=async(dx,dy)=>{if(phone)await touch('touchMove',[{x:fire.x+dx,y:fire.y+dy}]);else await page.mouse.move(fire.x+dx,fire.y+dy);};
 const up=async()=>{if(phone)await touch('touchEnd');else await page.mouse.up();};
 const drive=input=>page.evaluate(input=>window.__island.games.current.session.debug.drive(.02,input),input);
 const gameTime=()=>page.evaluate(()=>window.__island.games.current.session.snapshot.time);
 let frame=0;const times=[];const film=async ms=>{for(let t=0;t<ms;t+=50){await tick(50);times.push(await gameTime());await page.screenshot({path:new URL(`clip-${String(frame++).padStart(3,'0')}.jpg`,out).pathname,type:'jpeg',quality:85});}};
 const report={left};
 if(clip){
  await film(300);await down();await film(1300);for(let i=1;i<=12;i++){await move(0,-10*i);await film(50);}await film(500);await up();await film(2000);
  await drive({ammoIndex:0,autoAim:true,fireRelease:true});await film(1800);
  const s=await snap(),sounds=await page.evaluate(()=>window.__island.games.current.session.debug.sounds.map(e=>({...e})));report.frames=frame;report.sounds=sounds;report.shot=s.lastShot?.actual;
  if(process.env.NAVAL_CLIP_AUDIO==='1'){
   // Map each logged sound from game time to clip time through the per-frame game clock.
   const at=t=>{if(t<=times[0])return 0;for(let i=1;i<times.length;i++)if(t<=times[i])return (i-1+(t-times[i-1])/Math.max(1e-6,times[i]-times[i-1]))*.05;return (times.length-1)*.05;};
   const events=sounds.filter(e=>e.t>=times[0]-.01).map(e=>({name:e.name,at:at(e.t)}));report.audioEvents=events;
   const wav=await page.evaluate(async({events,seconds})=>{
    const {createNavalAudio}=await import(new URL('./minigames/g6d-audio.mjs',location.href).href);const rate=48000;
    // Offline context that the game's module believes is running; every node starts at the scheduled time.
    class Clock extends OfflineAudioContext{constructor(){super(2,Math.ceil(rate*seconds),rate);this.at=0;}get currentTime(){return this.at;}get state(){return 'running';}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}createBufferSource(){const n=super.createBufferSource(),go=n.start.bind(n);n.start=(when)=>go(when??this.at);return n;}}
    let ctx;class Factory{constructor(){ctx=new Clock();return ctx;}}
    const audio=createNavalAudio({storage:null,AudioContext:Factory});audio.unlock();
    // The test clock is frozen, so yield real tasks through a message channel while the sound files decode.
    const yieldTask=()=>new Promise(r=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();r();};c.port2.postMessage(0);});const started=performance.now();
    for(let i=0;i<400000&&audio.metrics().loaded.length<8;i++)await yieldTask();
    for(const e of events){ctx.at=e.at;audio.play(e.name);}ctx.at=0;
    const buffer=await ctx.startRendering(),ch=[buffer.getChannelData(0),buffer.getChannelData(1)],n=buffer.length,bytes=new DataView(new ArrayBuffer(44+n*4));
    const w=(o,s)=>{for(let i=0;i<s.length;i++)bytes.setUint8(o+i,s.charCodeAt(i));};w(0,'RIFF');bytes.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');bytes.setUint32(16,16,true);bytes.setUint16(20,1,true);bytes.setUint16(22,2,true);bytes.setUint32(24,rate,true);bytes.setUint32(28,rate*4,true);bytes.setUint16(32,4,true);bytes.setUint16(34,16,true);w(36,'data');bytes.setUint32(40,n*4,true);
    let peak=0;for(let i=0;i<n;i++)for(let c=0;c<2;c++){const v=Math.max(-1,Math.min(1,ch[c][i]));peak=Math.max(peak,Math.abs(v));bytes.setInt16(44+i*4+c*2,v*32767,true);}
    let bin='';const u8=new Uint8Array(bytes.buffer);for(let i=0;i<u8.length;i+=32768)bin+=String.fromCharCode(...u8.subarray(i,i+32768));return {data:btoa(bin),peak,loaded:audio.metrics().loaded,counts:audio.metrics().counts};
   },{events,seconds:frame*.05+.4});
   await writeFile(new URL('clip-audio.wav',out),Buffer.from(wav.data,'base64'));report.audio={peak:wav.peak,loaded:wav.loaded,counts:wav.counts};
  }
  await exit();return report;
 }
 let s=await snap();report.sea={peak:s.renderMetrics.peak};await capture('1-sea');
 await down();await tick(1300);s=await snap();report.aimWater={turret:s.turret,prediction:s.prediction,camera:s.camera?.zoom,box:s.renderMetrics.playerBox,aimArc:s.renderMetrics.aimArc,paint:s.renderMetrics.playerPaint};await capture('2-aim-water');
 for(let i=1;i<=12;i++){await move(0,-10*i);await tick(50);}await tick(500);s=await snap();report.aimHull={turret:s.turret,prediction:s.prediction,box:s.renderMetrics.playerBox,metrics:{triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls}};await capture('3-aim-hull');
 await up();await tick(40);s=await snap();const flight=s.ball.predicted?.contact?.t??s.ball.duration;report.release={fired:s.fired,predicted:s.ball.predicted?.end};
 await tick(Math.round(flight*500));await capture('4-flight');
 // Step in 10 ms until the hit flash is on screen, so the frame shows the flash itself.
 const catchFlash=async name=>{let hud=null;for(let i=0;i<40;i++){await tick(10);hud=(await snap()).hud;if(hud?.hit?.flash)break;}await capture(name);return hud?.hit||null;};
 await tick(Math.max(0,Math.round(flight*500)-60));const normalFlash=await catchFlash('5-impact');s=await snap();report.normalFlash=normalFlash;report.impact={last:s.lastShot?.actual,hit:s.hud?.lastHit,lost:s.hud?.lost||0,metrics:{triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls}};
 await tick(160);await capture('6-impact-late');await tick(1500);s=await snap();report.after={zoom:s.camera?.zoom,peak:s.renderMetrics.peak};
 // Weak centre: the same model path with a solved launch at the hull centre.
 await drive({ammoIndex:0,autoAim:true,fireRelease:true});s=await snap();const hitAt=s.ball.predicted?.contact?.t??s.ball.duration;
 await tick(Math.max(0,Math.round(hitAt*1000)-80));const criticalFlash=await catchFlash('7-critical');s=await snap();report.criticalFlash=criticalFlash;report.critical={last:s.lastShot?.actual,hit:s.hud?.lastHit,feedback:s.hud?.feedback,metrics:{triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls}};
 await tick(200);await capture('8-critical-late');s=await snap();report.criticalLate={feedback:s.hud?.feedback,peak:s.renderMetrics.peak};
 await exit();if(left)await page.evaluate(()=>localStorage.removeItem('island.naval.hand'));return report;
});
