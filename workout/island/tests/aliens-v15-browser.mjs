import {verify} from './night-browser.mjs';
// Real touch input (CDP) holding the fire button at 844x390 in stage 1: bullets per second, per window.
// ALIEN_V15=0 captures the v14 behaviour into verification/aliens-v15-before/, default into aliens-v15/.
const legacy=process.env.ALIEN_V15==='0';
await verify(legacy?'aliens-v15-before':'aliens-v15',[{width:844,height:390}],async({page,context,tick,snap,start,shot})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV15=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(4500);
 const cdp=await context.newCDPSession(page),center=async s=>{const r=await page.locator(s).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
 const fire=await center('#shoot');
 const f0=(await snap()).fired;await touch('touchStart',[fire]);
 const windows=[];let prev=f0,maxBullets=0;
 for(let i=0;i<24;i++){await tick(500);const s=await snap();const n=s.fired-prev;prev=s.fired;windows.push(n*2);maxBullets=Math.max(maxBullets,s.shots.length);}
 await shot('01-holding-fire');await touch('touchEnd',[]);
 const s=await snap();
 return {perSecondWindows:windows,avgPerSecond:+(windows.reduce((a,b)=>a+b,0)/windows.length).toFixed(1),maxPerSecond:Math.max(...windows),bulletsOnScreenMax:maxBullets,firedTotal:s.fired-f0,seconds:12,overheats:s.overheats};
});
