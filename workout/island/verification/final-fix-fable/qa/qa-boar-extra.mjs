// QA extra: desktop (no touch) keyboard/mouse + portrait touch layout. 11/11/2026
import {serveIsland,islandChromium} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const res={};
async function open(name,vp,touch){
 const ctx=await browser.newContext({viewport:vp,hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
 await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
 const page=await ctx.newPage();page.setDefaultTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
 const startBtn=page.locator('[data-action=avatar-start]');if(touch)await startBtn.tap();else await startBtn.click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;});
 await page.evaluate(()=>window.__island.games.start('boarDefense'));
 const u=page.locator('[data-action=game-understood]');if(await u.count()){if(touch)await u.tap();else await u.click();}
 await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
 const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();const frame=await (await frameEl.elementHandle()).contentFrame();
 await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
 await frame.evaluate(()=>{const s=window.__boar.state.save;s.weapons.shotgun=s.weapons.shotgun||1;window.__boar.setSave(s);window.__boar.start(1);});await page.waitForTimeout(1500);
 await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);});
 const box=await frameEl.boundingBox();
 const rects=await frame.evaluate(()=>{const r=id=>{const e=document.getElementById(id);if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
  const o={};for(const id of ['aim-zone','aim-rest','fire-btn','weapon-btn','rocket','frost','fury','weapons','pause','battle-hint']){o[id]=r(id);}o.flags=window.__boar.state.flags;o.vw=[innerWidth,innerHeight];
  const ov=(a,b)=>a&&b&&a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];const ids=['fire-btn','weapon-btn','rocket','frost','fury'];o.overlaps=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)if(ov(o[ids[i]],o[ids[j]]))o.overlaps.push(ids[i]+'/'+ids[j]);
  if(o['aim-zone'])for(const id of ['weapon-btn','rocket','frost','fury'])if(ov(o['aim-zone'],o[id]))o.overlaps.push('aim-zone/'+id);return o;});
 return {ctx,page,frame,errors,box,rects};
}
const st=f=>f.evaluate(()=>{const s=window.__boar.state;return {shots:s.shots,frames:s.frames,current:s.current,shotsBy:s.shotsBy,mode:s.mode};});
const tillFrames=async(f,p,n)=>{const f0=(await st(f)).frames,t=Date.now();while(Date.now()-t<60000){const s=await st(f);if(s.frames>=f0+n)return s;await p.waitForTimeout(80);}return st(f);};
// desktop
{const D=await open('desktop',{width:1280,height:720},false);res.desktop={rects:D.rects};
 await D.page.screenshot({path:out+'boar-desktop-hud.jpg',type:'jpeg',quality:80});
 const f=D.frame,p=D.page;await f.evaluate(()=>document.getElementById('scene').focus());
 const a=await st(f);await p.keyboard.press('Digit2');await tillFrames(f,p,2);const b=await st(f);await p.keyboard.press('Digit1');await tillFrames(f,p,2);const c=await st(f);
 res.desktop.keys12=[a.current,b.current,c.current];
 const cd0=await f.evaluate(()=>[document.getElementById('rocket').disabled,document.getElementById('frost').disabled]);
 await p.keyboard.press('KeyE');await p.keyboard.press('KeyQ');await tillFrames(f,p,3);
 res.desktop.QE=[cd0,await f.evaluate(()=>[document.getElementById('rocket').disabled,document.getElementById('frost').disabled,document.getElementById('rocket-cd').textContent,document.getElementById('frost-cd').textContent])];
 const s0=await st(f);await p.keyboard.down('KeyF');await tillFrames(f,p,6);await p.keyboard.up('KeyF');await tillFrames(f,p,2);const s1=await st(f);res.desktop.F={shots:s1.shots-s0.shots,by:s1.shotsBy};
 const box=D.box;await p.mouse.move(box.x+640,box.y+300);const m0=await st(f);await p.mouse.down();await tillFrames(f,p,6);await p.mouse.up();await tillFrames(f,p,2);const m1=await st(f);res.desktop.mouse={shots:m1.shots-m0.shots,by:m1.shotsBy};
 res.desktop.errors=D.errors;await D.ctx.close();}
// portrait touch
{const P=await open('portrait',{width:390,height:844},true);res.portrait={rects:P.rects,errors:P.errors};await P.page.screenshot({path:out+'boar-portrait-hud.jpg',type:'jpeg',quality:80});await P.ctx.close();}
await writeFile(out+'qa-extra.json',JSON.stringify(res,null,1));console.log(JSON.stringify(res,null,1));
await browser.close();await server.close();
