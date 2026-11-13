// QA round 3 (boar) layout: landscape 844x390 and portrait 390x844 on a touch phone, desktop 1280x720 without touch.
// Same save as Roy's phone screenshot (wave 9, four weapons, 3926 coins), started with a real tap on the game's start button through the island.
// Measures: HUD rectangles and overlaps (also against the island's own pause button drawn over the frame), what a left thumb lands on (hit-test grid),
// HUD coverage (every element that paints: background, border or text), how many boars are hidden under the HUD (sampled every 0.5 s of game time),
// label font sizes, the boss bar, and on desktop that mouse and F still fire. CONFIGS=a,b,... picks configurations (default all).
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const out=new URL('./',import.meta.url).pathname;
const t0=Date.now(),log=(...a)=>console.error(`[qa3-layout ${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
const ALL=[['after-landscape',{width:844,height:390},true,''],['v20-landscape',{width:844,height:390},true,'&boarFire=v20&boarHud=v20&boarStick=v20'],
  ['after-portrait',{width:390,height:844},true,''],['v20-portrait',{width:390,height:844},true,'&boarFire=v20&boarHud=v20&boarStick=v20'],['after-desktop',{width:1280,height:720},false,'']];
const want=(process.env.CONFIGS||'').split(',').filter(Boolean);const CONFIGS=want.length?ALL.filter(c=>want.includes(c[0])):ALL;
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const RES={};let prev={};try{prev=JSON.parse(await (await import('node:fs/promises')).readFile(out+'qa3-boar-layout.json','utf8'));}catch{}
// in-frame measurement (serialised into the frame)
function measure(){
  const W=innerWidth,H=innerHeight,vis=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){if(n.hidden)return false;const cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)return false;}const b=e.getBoundingClientRect();return b.width>1&&b.height>1&&b.right>0&&b.bottom>0&&b.left<W&&b.top<H;};
  const R=e=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
  const named={coins:'.coin-block',health:'.health-block',wave:'.wave-block',hint:'#battle-hint',boss:'#boss-hud',weapons:'#weapons',ammo:'.ammo-panel',abilities:'.abilities',rocket:'#rocket',frost:'#frost',fury:'#fury',weaponBtn:'#weapon-btn',fire:'#fire-btn',aimRest:'#aim-rest',aimZone:'#aim-zone',brand:'.brand',topControls:'.top-controls'};
  const rects={};for(const [k,s] of Object.entries(named)){const e=document.querySelector(s);rects[k]=e&&vis(e)?R(e):null;}
  rects.wslots=[...document.querySelectorAll('#weapons .wslot')].filter(vis).map(R);
  const ov=(a,b)=>a&&b&&a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];
  const pairs=['coins','health','wave','hint','boss','weaponBtn','fire','rocket','frost','fury','ammo','weapons','aimRest'];const overlaps=[];
  for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++)if(ov(rects[pairs[i]],rects[pairs[j]]))overlaps.push(pairs[i]+'/'+pairs[j]);
  const inZone=[];if(rects.aimZone)for(const k of ['weaponBtn','fire','rocket','frost','fury','weapons','ammo'])if(ov(rects.aimZone,rects[k]))inZone.push(k);
  for(const w of rects.wslots)if(rects.aimZone&&ov(rects.aimZone,w))inZone.push('wslot');
  // left-thumb hit-test grid: the left 36% (landscape) / 48% (portrait) x bottom 78% of the screen
  const zw=W>H?.36:.48,bad={};let n=0,ok=0;for(let x=8;x<W*zw;x+=16)for(let y=H*.22+8;y<H;y+=16){n++;const e=document.elementFromPoint(x,y);if(e&&(e.id==='aim-zone'||e.closest('#aim-zone')))ok++;else{const k=e?(e.closest('button')?.id||e.id||e.className||e.tagName):'none';bad[k]=(bad[k]||0)+1;}}
  // painted HUD: every visible element under #game that paints a background, a border or its own text (text measured by its line boxes)
  const skip='#scene,.vignette,#damage-flash,#frost-veil,#enemy-labels,#crosshair,#hit-marker,#aim-zone,#aim-ring,#menu,#shop,#pause-screen,#gameover,#help-screen,#error-screen,#bench';
  const paintRects=[],ctrlRects=[];const isCtrl=e=>!!e.closest('#aim-rest,#fire-btn');
  for(const e of document.querySelectorAll('#game *')){if(e.matches(skip)||e.closest(skip.split(',').map(s=>s+' *').join(','))&&!e.closest('#aim-zone #aim-rest'))continue;if(e.closest('#aim-zone')&&!e.closest('#aim-rest'))continue;if(!vis(e))continue;
    const cs=getComputedStyle(e);const bg=!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor)||cs.backgroundImage!=='none';const border=parseFloat(cs.borderTopWidth)>0&&cs.borderTopStyle!=='none'&&!/, 0\)$/.test(cs.borderTopColor);
    const list=isCtrl(e)?ctrlRects:paintRects;if(bg||border){list.push(e.getBoundingClientRect());continue;}
    for(const t of e.childNodes)if(t.nodeType===3&&t.textContent.trim()){const r=document.createRange();r.selectNodeContents(t);for(const q of r.getClientRects())list.push(q);}}
  const g=2,GW=Math.ceil(W/g),GH=Math.ceil(H/g);const paint=list=>{const gr=new Uint8Array(GW*GH);for(const r of list){const x0=Math.max(0,Math.floor(r.left/g)),x1=Math.min(GW,Math.ceil(r.right/g)),y0=Math.max(0,Math.floor(r.top/g)),y1=Math.min(GH,Math.ceil(r.bottom/g));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)gr[y*GW+x]=1;}return gr;};
  const frac=(gr,x0,x1,y0,y1)=>{let s=0,c=0;for(let y=Math.floor(y0/g);y<Math.ceil(y1/g);y++)for(let x=Math.floor(x0/g);x<Math.ceil(x1/g);x++){c++;s+=gr[y*GW+x];}return +(s/c*100).toFixed(1);};
  const hud=paint(paintRects),all=paint([...paintRects,...ctrlRects]);const b0=H*110/390,b1=H*290/390;
  const cov=gr=>({screen:frac(gr,0,W,0,H),band:frac(gr,0,W,b0,b1),leftHalf:frac(gr,0,W/2,0,H),leftBand:frac(gr,0,W/2,b0,b1),rightBand:frac(gr,W/2,W,b0,b1)});
  // the fixer's own selector list, for comparison with REPORT-boar.md
  const sel='.brand,.coin-block,.health-block,.wave-block,.top-controls button,.ammo-panel,.wslot,.ability,#weapon-btn,#battle-hint,#boss-hud';const fx=paint([...document.querySelectorAll(sel)].filter(vis).map(e=>e.getBoundingClientRect()));
  const fs=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).fontSize:null;};
  const fonts={abilitySmall:[...document.querySelectorAll('.ability small')].filter(vis).map(e=>getComputedStyle(e).fontSize),weaponName:fs('#weapon-btn .wname'),weaponAmmo:fs('#weapon-btn .wammo'),waveSmall:fs('.wave-block small'),waveNumber:fs('.wave-block b'),healthLabel:fs('.health-block>div:first-child'),hint:fs('#battle-hint'),
    restLabel:document.getElementById('aim-rest')?getComputedStyle(document.getElementById('aim-rest'),'::after').fontSize:null,wslotSmall:[...document.querySelectorAll('.wslot small')].filter(vis).map(e=>getComputedStyle(e).fontSize).slice(0,1)};
  const rest=document.getElementById('aim-rest');const restStyle=rest&&vis(rest)?{border:getComputedStyle(rest).borderTopColor+' '+getComputedStyle(rest).borderTopStyle,label:getComputedStyle(rest,'::after').content,labelColor:getComputedStyle(rest,'::after').color}:null;
  return {W,H,rects,overlaps,controlsInStickZone:inZone,leftThumbGrid:{points:n,onStick:ok,other:bad},coverage:{hud:cov(hud),hudAndControls:cov(all),fixerSelectors:cov(fx)},paintedHud:paintRects.map(r=>[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]),
    controls:ctrlRects.map(r=>[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]),fonts,restStyle};
}
// boars under the HUD: the label of each enemy sits above its head; the head is about 18 px below the label point
function hidden(hudRects){const pts=[...document.querySelectorAll('#enemy-labels .enemy-label')].filter(l=>!l.hidden&&l.style.left).map(l=>[parseFloat(l.style.left),parseFloat(l.style.top)+18]).filter(([x,y])=>x>=0&&y>=0&&x<=innerWidth&&y<=innerHeight);
  const inR=([x,y],r)=>x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3];return {visible:pts.length,underHud:pts.filter(p=>hudRects.some(r=>inR(p,r))).length};}
for(const [name,vp,touchOn,flags] of CONFIGS){
  log('config',name);const ctx=await browser.newContext({viewport:vp,hasTouch:touchOn,isMobile:touchOn,deviceScaleFactor:1});const csp=await installIslandCspMonitor(ctx);
  await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
  const page=await ctx.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  const R={viewport:vp,touch:touchOn,query:'index.html?dev=1&adapt=1'+flags};RES[name]=R;
  try{
    await page.goto(server.url+R.query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
    const press=async loc=>touchOn?loc.tap():loc.click();
    await press(page.locator('[data-action=avatar-start]'));
    await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;});
    await page.evaluate(()=>window.__island.games.start('boarDefense'));if(await page.locator('[data-action=game-understood]').count())await press(page.locator('[data-action=game-understood]'));
    await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
    const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();const frame=await (await frameEl.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
    const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {mode:s.mode,frames:s.frames,elapsed:s.elapsed,shots:s.shots,shotsBy:s.shotsBy,abilityBy:s.abilityBy,current:s.current,wave:s.wave,flags:s.flags,enemies:s.enemies.length,hp:s.hp,aim:s.aim};});
    const tillGame=async(sec,ms=300000)=>{const e0=(await st()).elapsed,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.elapsed>=e0+sec)return s;await page.waitForTimeout(40);}return st();};
    const tillFrames=async(n,ms=200000)=>{const f0=(await st()).frames,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.frames>=f0+n)return s;await page.waitForTimeout(30);}return st();};
    // Roy's screenshot: wave 9, four weapons, 3926 coins
    await frame.evaluate(()=>{const s=window.__boar.state.save;Object.assign(s.weapons,{mg:3,shotgun:2,cannon:2,tesla:1});s.nextWave=9;s.bestWave=8;s.coins=3926;window.__boar.setSave(s);});
    const sb=await frame.evaluate(()=>{const r=document.getElementById('start').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,document.getElementById('start').textContent.trim()];});R.startLabel=sb[2];
    if(touchOn)await page.touchscreen.tap(sb[0],sb[1]);else await page.mouse.click(sb[0],sb[1]);
    await frame.waitForFunction(()=>window.__boar.state.mode==='battle',null,{timeout:120000});R.flags=(await st()).flags;
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('banner')).opacity==='0',null,{timeout:300000}).catch(()=>{});
    await tillGame(4);
    R.m=await frame.evaluate(measure);
    // the island's own controls drawn over the frame (pause button etc.)
    R.islandOverlay=await page.evaluate(()=>[...document.querySelectorAll('.game-screen header *, .game-screen header')].filter(e=>{const cs=getComputedStyle(e);const b=e.getBoundingClientRect();return cs.visibility!=='hidden'&&cs.display!=='none'&&b.width>4&&b.height>4&&(e.matches('button')||e===e.closest('header'));}).map(e=>{const b=e.getBoundingClientRect();return {what:e.dataset.action||e.className||e.tagName,rect:[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};}));
    const ov=(a,b)=>a&&b&&a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];
    R.islandOverlayOverlaps=[];for(const o of R.islandOverlay.filter(o=>/pause|sound/.test(o.what)))for(const [k,r] of Object.entries(R.m.rects))if(r&&!Array.isArray(r[0])&&k!=='aimZone'&&ov(o.rect,r))R.islandOverlayOverlaps.push(o.what+' over '+k);
    await page.screenshot({path:out+`qa3-boar-layout-${name}.jpg`,type:'jpeg',quality:82});
    // boars under the HUD while the wave plays (10 samples, 0.5 s of game time apart)
    const samples=[];for(let i=0;i<10;i++){samples.push(await frame.evaluate(hidden,R.m.paintedHud.concat(R.m.controls)));await tillGame(.5);}
    R.hiddenBoars={samples,visible:samples.reduce((a,s)=>a+s.visible,0),underHud:samples.reduce((a,s)=>a+s.underHud,0)};R.hiddenBoars.pct=R.hiddenBoars.visible?+(R.hiddenBoars.underHud/R.hiddenBoars.visible*100).toFixed(1):null;
    await page.screenshot({path:out+`qa3-boar-layout-${name}-later.jpg`,type:'jpeg',quality:82});
    // boss bar: spawn the wave-5 boss (a target) and measure again
    await frame.evaluate(()=>window.__boar.spawn('king'));await tillFrames(3);R.boss=await frame.evaluate(measure);R.boss={rects:{boss:R.boss.rects.boss,wave:R.boss.rects.wave,health:R.boss.rects.health,hint:R.boss.rects.hint},overlaps:R.boss.overlaps};
    await page.screenshot({path:out+`qa3-boar-layout-${name}-boss.jpg`,type:'jpeg',quality:82});
    // weapon switching with one control: tap it 4 times (four weapons owned) and read the label
    if(touchOn){const wb=await frame.evaluate(()=>{const e=document.getElementById('weapon-btn');if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
      if(wb){const seq=[];for(let i=0;i<4;i++){await page.touchscreen.tap(wb[0],wb[1]);await tillFrames(8);seq.push(await frame.evaluate(()=>({current:window.__boar.state.current,label:document.querySelector('#weapon-btn .wname').textContent,ammo:document.querySelector('#weapon-btn .wammo').textContent})));}R.weaponCycle=seq;}}
    // the game's own menu and garage (between waves): does the battle HUD stay hidden there, or does it draw over the menu text?
    for(const [screen,call] of [['menu','menu'],['shop','shop']]){await frame.evaluate(c=>window.__boar[c](),call);await tillFrames(3);
      (R.screens||(R.screens={}))[screen]=await frame.evaluate(scr=>{const vis=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){if(n.hidden)return false;const cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)return false;}return true;};
        const hud=['.coin-block','.health-block','.wave-block','.brand'].map(s=>[s,document.querySelector(s)]).filter(([,e])=>e&&vis(e)).map(([s,e])=>{const b=e.getBoundingClientRect();return {s,r:[b.left,b.top,b.right,b.bottom]};});
        const texts=[];for(const e of document.querySelectorAll(scr==='menu'?'#menu *':'#shop *')){if(!vis(e))continue;for(const t of e.childNodes)if(t.nodeType===3&&t.textContent.trim()){const r=document.createRange();r.selectNodeContents(t);for(const q of r.getClientRects())texts.push({t:t.textContent.trim().slice(0,30),r:[q.left,q.top,q.right,q.bottom]});}}
        const hit=[];for(const h of hud)for(const x of texts)if(h.r[0]<x.r[2]&&x.r[0]<h.r[2]&&h.r[1]<x.r[3]&&x.r[1]<h.r[3])hit.push(h.s+' over "'+x.t+'"');
        return {mode:window.__boar.state.mode,hudVisible:hud.map(h=>h.s),hudOverMenuText:hit};},screen);
      await page.screenshot({path:out+`qa3-boar-layout-${name}-${screen}.jpg`,type:'jpeg',quality:82});}
    if(!touchOn){// desktop keeps mouse and keyboard
      await frame.evaluate(()=>window.__boar.start(9));await frame.waitForFunction(()=>window.__boar.state.mode==='battle');await tillFrames(3);
      await frame.evaluate(()=>document.getElementById('scene').focus());const a=await st();await page.mouse.move(500,300);await page.mouse.down();await tillFrames(6);await page.mouse.up();await tillFrames(2);const b=await st();
      await page.keyboard.down('KeyF');await tillFrames(6);await page.keyboard.up('KeyF');await tillFrames(2);const c=await st();await page.keyboard.press('KeyQ');await tillFrames(2);const d=await st();
      R.desktopInput={mouseShots:b.shots-a.shots,mouseAim:b.aim,keyFShots:c.shots-b.shots,keyQ:d.abilityBy?.rocket??null,shotsBy:d.shotsBy};}
    R.final=await st();
  }catch(e){R.error=String(e.message).split('\n')[0];log(name,'error',R.error);}
  try{await csp.assertClean();R.csp='clean';}catch(e){R.csp=String(e.message).slice(0,600);}R.errors=errors;
  log(name,JSON.stringify({overlaps:R.m?.overlaps,inZone:R.m?.controlsInStickZone,grid:R.m?.leftThumbGrid,cov:R.m?.coverage?.hud,hidden:R.hiddenBoars?.pct,boss:R.boss?.overlaps,island:R.islandOverlayOverlaps,errors:errors.length,csp:R.csp==='clean'}));
  await csp.dispose().catch(()=>{});await ctx.close();
  await writeFile(out+'qa3-boar-layout.json',JSON.stringify({...prev,...RES},null,1)+'\n');
}
await browser.close();await server.close();log('done');
