// Run: CHROMIUM_PATH=... ISLAND_PLAYWRIGHT=... node workout/island/tests/boar-touch-browser.mjs  (MODES=legacy,v20). Proves: touches/drags on the scene fire 0 shots, the left stick moves the aim, only the fire button shoots, and the aim is kept.
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {mkdir} from 'node:fs/promises';
const out=new URL('../verification/boar-fire-naval-v20/frames/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const res={};
for(const mode of (process.env.MODES||'legacy,v20').split(',')){console.error('mode',mode);
 const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
 await ctx.addInitScript(()=>{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');});
 const page=await ctx.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'minigames/boar-island/index.html?island=1&qa=1'+(mode==='legacy'?'&boar=v1':''),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__boar);
 await page.evaluate(()=>window.__boar.start(1));await page.waitForTimeout(600);
 const cdp=await ctx.newCDPSession(page),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({...p,id:i+1}))});
 const st=()=>page.evaluate(()=>window.__boar.state);
 // enemies in range so a stray shot would count
 await page.evaluate(()=>{window.__boar.spawn('scout',-20);});
 const before=await st();console.error('started');
 // 1) taps and drags on the scene (right and middle of the screen)
 for(const [x,y] of [[420,160],[600,200],[300,120]]){await touch('touchStart',[{x,y}]);await page.waitForTimeout(150);await touch('touchEnd',[]);}
 await touch('touchStart',[{x:500,y:150}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:500+i*20,y:150+i*6}]);await page.waitForTimeout(40);}await touch('touchEnd',[]);
 await page.waitForTimeout(300);
 const afterScene=await st();
 console.error('scene done');
 // 2) left stick drag: aim moves, no shots
 await touch('touchStart',[{x:150,y:290}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:150+i*5,y:290-i*6}]);await page.waitForTimeout(60);}
 await page.screenshot({path:out+`boar-aim-${mode}-stick.jpg`,type:'jpeg',quality:80});
 await touch('touchEnd',[]);await page.waitForTimeout(300);
 const afterStick=await st();
 console.error('stick done');
 // 3) fire button hold: shots happen, aim retained
 let fireRes=null;
 if(mode==='v20'){const b=await page.locator('#fire-btn').boundingBox();await touch('touchStart',[{x:b.x+b.width/2,y:b.y+b.height/2}]);await page.waitForTimeout(500);await page.screenshot({path:out+`boar-aim-${mode}-fire.jpg`,type:'jpeg',quality:80});const during=await st();await touch('touchEnd',[]);await page.waitForTimeout(200);fireRes={during:during.shots,firingFlag:during.firing,after:(await st()).shots,aimKept:(await st()).aim};}
 res[mode]={before:before.shots,afterSceneTouches:afterScene.shots,sceneFiring:afterScene.firing,aimAfterScene:afterScene.aim,afterStickShots:afterStick.shots,aimAfterStick:afterStick.aim,fireRes,errors};
 await ctx.close();
}
console.log(JSON.stringify(res,null,1));await browser.close();
