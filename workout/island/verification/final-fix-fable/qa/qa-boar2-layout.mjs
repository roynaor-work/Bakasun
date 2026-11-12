// QA round 2 layout: portrait 390x844 touch, landscape 844x390 touch, desktop 1280x720 without touch. Overlaps, computed font sizes, ring opacity, screenshots boar2-*.jpg.
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
 await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);});await page.waitForTimeout(800);
 const info=await frame.evaluate(()=>{const vis=e=>{if(!e||e.hidden||e.closest('[hidden]'))return false;const cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden';};
  const r=sel=>{const e=document.querySelector(sel);if(!vis(e))return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
  const sels={wave:'.wave-block',health:'.health-block',coins:'.coin-block',hint:'#battle-hint',aimZone:'#aim-zone',aimRest:'#aim-rest',fire:'#fire-btn',weapon:'#weapon-btn',rocket:'#rocket',frost:'#frost',fury:'#fury',pause:'.top-controls',boss:'#boss-hud'};
  const o={vw:[innerWidth,innerHeight],flags:window.__boar.state.flags,rects:{}};for(const [k,s] of Object.entries(sels))o.rects[k]=r(s);
  const ov=(a,b)=>a&&b&&a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];const keys=Object.keys(o.rects).filter(k=>!['aimZone','boss'].includes(k));o.overlaps=[];
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)if(ov(o.rects[keys[i]],o.rects[keys[j]])&&!(keys[i]==='aimRest'||keys[j]==='aimRest'))o.overlaps.push(keys[i]+'/'+keys[j]);
  if(o.rects.aimZone)for(const k of ['weapon','rocket','frost','fury','fire'])if(ov(o.rects.aimZone,o.rects[k]))o.overlaps.push('aimZone/'+k);
  const fs=sel=>{const e=document.querySelector(sel);return e?getComputedStyle(e).fontSize:null;};
  o.fonts={abilitySmall:[...document.querySelectorAll('.ability small')].map(e=>getComputedStyle(e).fontSize),weaponName:fs('#weapon-btn .wname'),weaponAmmo:fs('#weapon-btn .wammo'),waveSmall:fs('.wave-block small'),healthLabel:fs('.health-block>div:first-child'),restLabel:(()=>{const e=document.getElementById('aim-rest');return e?getComputedStyle(e,'::after').fontSize:null;})()};
  const rest=document.getElementById('aim-rest');if(rest){const cs=getComputedStyle(rest);o.ring={borderColor:cs.borderTopColor,borderStyle:cs.borderTopStyle,opacity:cs.opacity,labelColor:getComputedStyle(rest,'::after').color};}
  return o;});
 return {ctx,page,frame,errors,info};
}
for(const [name,vp,touch] of [['portrait',{width:390,height:844},true],['landscape',{width:844,height:390},true],['desktop',{width:1280,height:720},false]]){
 const P=await open(name,vp,touch);await P.page.screenshot({path:out+`boar2-${name}.jpg`,type:'jpeg',quality:82});res[name]={...P.info,errors:P.errors};console.error(name,JSON.stringify(P.info.overlaps),JSON.stringify(P.info.fonts),JSON.stringify(P.info.ring));await P.ctx.close();}
await writeFile(out+'qa2-layout.json',JSON.stringify(res,null,1));
await browser.close();await server.close();
