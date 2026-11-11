// Permanent browser check (Roy, 11/11/2026): the left stick only aims, and shots come only from the one fire button.
// Run: CHROMIUM_PATH=... ISLAND_PLAYWRIGHT=... node workout/island/tests/boar-touch-browser.mjs   (npm test runs it when a browser exists)
// Fails (exit 1) if any touch/drag/mouse path other than the fire button fires, or if the button leaves fire stuck on.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const out=new URL('../verification/boar-nofire-stick-v21/',import.meta.url).pathname;await mkdir(out+'frames/',{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const log=[];const profiles={phone:{viewport:{width:844,height:390},hasTouch:true,isMobile:true},'touch-fine-pointer':{viewport:{width:844,height:390},hasTouch:true,isMobile:false}};
let failures=0;
for(const [name,opts] of Object.entries(profiles)){
 const ctx=await browser.newContext({...opts,deviceScaleFactor:1});await ctx.addInitScript(()=>{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');});
 const page=await ctx.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'minigames/boar-island/index.html?island=1&qa=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__boar);
 await page.evaluate(()=>window.__boar.start(1));await page.waitForTimeout(500);
 await page.evaluate(()=>{for(const z of [-18,-24,-30])window.__boar.spawn('scout',z);});
 const cdp=await ctx.newCDPSession(page),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
 const st=()=>page.evaluate(()=>window.__boar.state),wait=ms=>page.waitForTimeout(ms);
 const step=async(label,fn,{expectShots})=>{const a=await st();await fn();await wait(250);const b=await st(),shots=b.shots-a.shots,ok=expectShots==='some'?shots>0:expectShots==='none'?shots===0:true;log.push({profile:name,step:label,shots,firing:b.firing,aimBefore:a.aim,aimAfter:b.aim,expect:expectShots,ok});if(!ok){failures++;console.error('FAIL',name,label,'shots',shots);}return b;};
 // first touch anywhere: must not shoot (this is also what switches the controls on for a device whose media query said "fine pointer")
 await step('first touch on the scene (tap)',async()=>{await touch('touchStart',[{x:620,y:150,id:1}]);await wait(120);await touch('touchEnd',[]);},{expectShots:'none'});
 await step('three taps and a drag on the scene',async()=>{for(const [x,y] of [[420,160],[600,200],[300,120]]){await touch('touchStart',[{x,y,id:1}]);await wait(100);await touch('touchEnd',[]);}await touch('touchStart',[{x:500,y:150,id:1}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:500+i*20,y:150+i*6,id:1}]);await wait(30);}await touch('touchEnd',[]);},{expectShots:'none'});
 const ctrl=await page.evaluate(()=>({zone:!!document.querySelector('#aim-zone')&&!document.querySelector('#aim-zone').hidden,btn:!!document.querySelector('#fire-btn')&&!document.querySelector('#fire-btn').hidden}));log.push({profile:name,step:'controls visible',...ctrl,ok:ctrl.zone&&ctrl.btn});if(!(ctrl.zone&&ctrl.btn)){failures++;console.error('FAIL controls missing',name);}
 const fb=await page.locator('#fire-btn').boundingBox();const fc={x:fb.x+fb.width/2,y:fb.y+fb.height/2};
 const aimed=await step('left stick drag (aim moves, no shots)',async()=>{await touch('touchStart',[{x:150,y:290,id:1}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:150+i*5,y:290-i*6,id:1}]);await wait(50);}await page.screenshot({path:`${out}frames/stick-drag-${name}.jpg`,type:'jpeg',quality:78});await touch('touchEnd',[]);},{expectShots:'none'});
 assert.ok(Math.abs(aimed.aim.x)>.05||Math.abs(aimed.aim.y+.05)>.05,'the stick must move the aim');
 await step('touch outside stick and button (right middle, top)',async()=>{for(const [x,y] of [[640,120],[420,30],[760,200]]){await touch('touchStart',[{x,y,id:1}]);await wait(120);await touch('touchEnd',[]);}},{expectShots:'none'});
 // two fingers: stick finger 1 stays down and keeps moving; finger 2 presses the button, then lifts. Shots only while finger 2 is down.
 await touch('touchStart',[{x:150,y:290,id:1}]);for(let i=1;i<=4;i++){await touch('touchMove',[{x:150+i*6,y:290-i*4,id:1}]);await wait(40);}
 let a=await st();await touch('touchStart',[{x:150+24,y:290-16,id:1},{...fc,id:2}]);await wait(500);let b=await st();log.push({profile:name,step:'two fingers: button down while stick held',shots:b.shots-a.shots,firing:b.firing,ok:b.shots-a.shots>0&&b.firing});if(!(b.shots>a.shots&&b.firing)){failures++;console.error('FAIL button does not fire',name);}
 await page.screenshot({path:`${out}frames/two-fingers-fire-${name}.jpg`,type:'jpeg',quality:78});
 await touch('touchMove',[{x:210,y:230,id:1},{...fc,id:2}]);await wait(150);
 await touch('touchEnd',[{x:210,y:230,id:1}]); // finger 2 (the button) lifts, finger 1 stays on the stick
 await wait(150);a=await st();for(let i=1;i<=10;i++){await touch('touchMove',[{x:210-i*6,y:230+i*4,id:1}]);await wait(50);}b=await st();
 log.push({profile:name,step:'button lifted, stick still moving: no more shots',shots:b.shots-a.shots,firing:b.firing,ok:b.shots===a.shots&&!b.firing});if(!(b.shots===a.shots&&!b.firing)){failures++;console.error('FAIL fire stuck after button lift',name);}
 await touch('touchEnd',[]);await wait(200);
 // stuck-button insurance: the button finger is cancelled by the system without a pointerup
 await touch('touchStart',[{...fc,id:1}]);await wait(300);await touch('touchCancel',[]);await wait(300);b=await st();a=b;await wait(400);b=await st();
 log.push({profile:name,step:'button finger cancelled: fire released',firing:b.firing,shots:b.shots-a.shots,ok:!b.firing&&b.shots===a.shots});if(b.firing||b.shots!==a.shots){failures++;console.error('FAIL fire stuck after cancel',name);}
 // mouse on a touch device: aim, never fire
 await step('mouse press and drag on the scene',async()=>{await page.mouse.move(300,150);await page.mouse.down();await page.mouse.move(520,200,{steps:6});await page.mouse.up();},{expectShots:'none'});
 // the keyboard fire key still works (it is a fire button too) and stops on release
 await step('keyboard F held',async()=>{await page.keyboard.down('KeyF');await wait(400);},{expectShots:'some'});await page.keyboard.up('KeyF');await wait(200);
 log.push({profile:name,errors});if(errors.length){failures++;console.error('page errors',errors);}
 await ctx.close();
}
await writeFile(out+'log.json',JSON.stringify(log,null,1));await browser.close();
console.log(log.filter(r=>r.step).map(r=>`${r.ok?'PASS':'FAIL'} [${r.profile}] ${r.step}${r.shots!==undefined?` · shots ${r.shots}`:''}`).join('\n'));
process.exit(failures?1:0);
