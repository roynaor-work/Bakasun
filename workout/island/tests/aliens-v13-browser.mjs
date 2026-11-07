import {verify} from './night-browser.mjs';
// ALIEN_V13=0 captures v12 (drawn cannons) into verification/aliens-v13-before/, default into aliens-v13/.
const legacy=process.env.ALIEN_V13==='0';
await verify(legacy?'aliens-v13-before':'aliens-v13',[{width:844,height:390}],async({page,tick,snap,start,shot})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV13=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await page.waitForFunction(()=>window.__island.games.current.session.debug.view.metrics().shipV13||true,{timeout:5000}).catch(()=>{});
 await tick(4500);await shot('01-idle');
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;mm.__orig??=mm.update;mm.update=(dt,i={})=>mm.__orig(dt,{...i,firing:true});});
 await tick(1300);await shot('02-firing');
 await tick(37);await shot('03-firing-b');
 await tick(1000);
 const info=await page.evaluate(async()=>{const s=window.__island.games.current.session,m=s.debug.view.metrics();
  const urls=['vulcan-fire-loop','vulcan-spin-up','vulcan-spin-down','vulcan-flash'].map(id=>new URL(`assets/audio/alien-v13/${id}.ogg`,document.baseURI).href);
  const out={};try{const C=window.AudioContext||window.webkitAudioContext,c=new C();for(const u of urls){const r=await fetch(u);const b=await c.decodeAudioData(await r.arrayBuffer());out[u.split('/').pop()]=+b.duration.toFixed(2);}c.close();}catch(e){out.error=String(e);}
  return {shipV13:m.shipV13,triangles:m.triangles,drawCalls:m.drawCalls,audioMetrics:s.snapshot.audio,decoded:out,fired:s.snapshot.fired};});
 return info;
});
