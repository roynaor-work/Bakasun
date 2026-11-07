import {verify} from './night-browser.mjs';
// ALIEN_V9=0 captures the legacy look into verification/aliens-v9-before/, default into aliens-v9/.
const legacy=process.env.ALIEN_V9==='0';
await verify(legacy?'aliens-v9-before':'aliens-v9',[{width:844,height:390}],async({page,context,tick,snap,start,shot,assert})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV9=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(4000);await shot('01-before-touch');
 const cdp=await context.newCDPSession(page),c=async s=>{const r=await page.locator(s).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
 const stick=await c('#joystick'),fire=await c('#shoot'),f0=(await snap()).fired;
 await touch('touchStart',[stick]);await touch('touchMove',[{x:stick.x+25,y:stick.y}]);await tick(1500);
 const moved=(await snap()).fired-f0;await shot('02-moving-no-fire-press');
 await touch('touchStart',[{...stick,x:stick.x+25},fire]);await tick(1500);const pressed=(await snap()).fired-f0-moved;await shot('03-fire-pressed');await touch('touchEnd',[]);
 return {firedWhileMovingOnly:moved,firedWhilePressing:pressed};
});
