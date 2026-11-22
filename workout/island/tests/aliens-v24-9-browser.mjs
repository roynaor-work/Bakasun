// v24.9 acceptance through the island shell with real touch (22/11/2026, Roy: "the regular fire goes through the ships / text that gets in the
// way / I saw no laser fire at all"): Chromium with hasTouch and isMobile at 844x390 (SwiftShader WebGL, the 3D layer on), CDP touch events on
// the real controls, Playwright's clock for the frames. Each part runs twice in the same page: with the switch that restores v24.8 (before) and
// as shipped (after). The game model is only read.
//  text:  the fire button held, released and pressed again; every visible text node of the game is measured each frame: how long a node sits
//         inside the play area (below the top strip, between the stick and the buttons), and the largest one.
//  laser: default equipment, the fire button held from the start (the finger never lifts), the ship steered by the stick to the token or under
//         a column, 20 s: when the laser bonus starts, when the beam lights, the chip's text, and the beam's pixels read from the canvas.
//  shots: the hangar's weapon 2 bought through the shop (a permanent laser), 12 s: per cannon/wing round, the ships it hit, split by whether
//         the laser bonus was running when it was fired.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      ONLY=text|laser|shots node workout/island/tests/aliens-v24-9-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const frames=new URL('../verification/aliens-v24-9/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const failures=[];
await verify('aliens-v24-9/'+(only.join('-')||'all'),[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:82});
 const fails=[],report={clock:'Playwright page.clock; times are model time',viewport:'844x390 hasTouch isMobile, SwiftShader'};const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const setSearch=search=>page.evaluate(q=>history.replaceState(null,'',location.pathname+'?dev=1'+q),search);
 const leave=async()=>{await touch('touchEnd',[]).catch(()=>{});for(let t=0;t<3000&&(await snap().catch(()=>null))?.result;t+=200)await tick(200);if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else{try{await exit();}catch{await tick(1500);await nav();}}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 const begin=async search=>{await setSearch(search);await start('alienDefense',1);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,{timeout:240000}).catch(()=>{});};
 const S={x:128,y:315};
 /** One frame of steering: the stick toward the token, else under the fullest column. */
 const steer=async(F,state)=>{
  const st=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m||m.result)return null;
   const tok=m.pickups[0];if(tok)return {d:tok.x-m.player.x};
   const cols=new Map();for(const a of m.aliens)if(a.y>0){const k=Math.round(a.x/20);cols.set(k,(cols.get(k)||[]).concat(a));}
   let best=null;for(const list of cols.values()){const x=list.reduce((s,a)=>s+a.x,0)/list.length,score=list.length*100-Math.abs(x-m.player.x);if(!best||score>best.score)best={x,score};}
   return {d:best?best.x-m.player.x:0};});
  if(!st)return false;const pts=F?[{...F,id:1}]:[];
  if(Math.abs(st.d)>2){const p={x:S.x+Math.sign(st.d)*Math.min(40,Math.abs(st.d)*3+6),y:S.y,id:3};if(!state.stick)await touch('touchStart',[...pts,{...S,id:3}]);await touch('touchMove',[...pts,p]);state.stick=true;}
  else if(state.stick)await touch('touchMove',[...pts,{...S,id:3}]);
  return true;};
 // ------------------------------------------------------------------ text
 if(want('text')){
  const text=async mode=>{
   await begin(mode==='before'?'&alienText=old&alienLaserSeen=0':'&alienLaserSeen=0');
   const F=await center('#shoot');const out={mode,samples:0,inPlay:{},maxBox:{},firstSeconds:{}};
   const measure=()=>page.evaluate(()=>{const W=innerWidth,H=innerHeight,play={l:W*.22,r:W*.78,t:66,b:H-8},rows=[];
    for(const [name,sel] of [['banner','.alien-kid-demo'],['notice','.alien-flight-feedback'],['weapon','.alien-flight-weapon'],['control','.alien-flight-control'],['caption','.alien-fire-caption,.alien-kid-caption']])
     for(const n of document.querySelectorAll(sel)){const cs=getComputedStyle(n);if(n.hidden||cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<.05||!n.textContent.trim())continue;let hid=false;for(let q=n.parentElement;q;q=q.parentElement)if(q.hidden||getComputedStyle(q).display==='none'){hid=true;break;}if(hid)continue;
      const r=n.getBoundingClientRect();if(!r.width||!r.height)continue;const inPlay=r.right>play.l&&r.left<play.r&&r.bottom>play.t&&r.top<play.b;
      rows.push({name,text:n.textContent.trim().slice(0,30),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),left:Math.round(r.left),inPlay});}
    return {rows,time:window.__island.games.current?.session.debug?.model.time};});
   let down=false;const press=async on=>{if(on&&!down)await touch('touchStart',[{...F,id:1}]);if(!on&&down)await touch('touchEnd',[]);down=on;};
   // held 0-6 s, released 6-8 s, pressed again 8-11 s (a new press), one frame = 16 ms
   for(let f=0;f<60*11;f++){
    await press(f<360||f>=480);await tick(16);const m=await measure();out.samples++;
    for(const r of m.rows){if(r.inPlay){out.inPlay[r.name]=(out.inPlay[r.name]||0)+1;}const a=r.w*r.h;if(!out.maxBox[r.name]||a>out.maxBox[r.name].w*out.maxBox[r.name].h)out.maxBox[r.name]={w:r.w,h:r.h,top:r.top,text:r.text};}
    if(f===60)await capture(`text-${mode}-1s-opening`);
    if(f===500)await capture(`text-${mode}-8s-after-press`);
    if(f===500)out.at8s=m.rows.filter(r=>r.name!=='caption'||r.inPlay);
   }
   for(const k of Object.keys(out.inPlay))out.inPlay[k]=+(out.inPlay[k]*.016).toFixed(2);
   await leave();return out;};
  const before=await text('before'),after=await text('after');report.text={playArea:'x 22%..78%, y 66px..bottom',before,after};console.log('text',JSON.stringify(report.text));
  check((before.inPlay.banner||0)>2,`v24.8: the two-line banner sat inside the play area ${before.inPlay.banner||0} s of 11 s`);
  check(!Object.keys(after.inPlay).length,`v24.9: no text node inside the play area in 11 s (${JSON.stringify(after.inPlay)})`);
  const big=Object.values(after.maxBox).reduce((m,b)=>Math.max(m,b.h),0);check(big<=22,`v24.9: the tallest text node is ${big} px (v24.8 banner: ${before.maxBox.banner?.h} px)`);
  check(!after.at8s.length,`v24.9: nothing but the buttons at 8 s, after a new press (${JSON.stringify(after.at8s)})`);
 }
 // ------------------------------------------------------------------ laser
 if(want('laser')){
  const laser=async mode=>{
   await begin(mode==='before'?'&alienLaserSeen=0':'');
   const F=await center('#shoot'),state={stick:false},out={mode,view:await page.evaluate(()=>window.__island.games.current.session.debug.view?.mode??null),weapon:await page.evaluate(()=>window.__island.games.current.session.debug.model.equipment.weapon||0),tokenAt:null,laserAt:null,beamAt:null,chip:null,beamPixels:null,litSeconds:0,chipSeconds:0};
   await touch('touchStart',[{...F,id:1}]);let shots=0,seenChip=false;
   for(let f=0;f<60*20;f++){
    if(!await steer(F,state))break;await tick(16);
    const s=await page.evaluate(()=>{const g=window.__island.games.current,m=g?.session.debug?.model;if(!m)return null;const chip=document.querySelector('.alien-laser-chip');
     return {time:m.time,laser:m.laserTime||0,beam:m.laserBurst?.left||0,token:m.pickups.some(d=>d.kind===1),chip:chip&&!chip.hidden?chip.textContent.trim():null,chipBox:chip&&!chip.hidden?(r=>({left:Math.round(r.left),top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}))(chip.getBoundingClientRect()):null};});
    if(!s)break;
    if(s.token&&out.tokenAt===null)out.tokenAt=+s.time.toFixed(2);
    if(s.laser>0&&out.laserAt===null)out.laserAt=+s.time.toFixed(2);
    if(s.beam>0){out.litSeconds+=.016;if(out.beamAt===null)out.beamAt=+s.time.toFixed(2);}
    if(s.chip){out.chipSeconds+=.016;if(!seenChip){seenChip=true;out.chip={text:s.chip,box:s.chipBox,at:+s.time.toFixed(2)};}}
    if(s.token&&shots===0){await capture(`laser-${mode}-token`);shots=1;}
    if(s.beam>0&&s.laser>0&&s.laser<7.4&&shots===1){
     // the beam's pixels: the 2D layer at the beam's column, half way between the muzzle and the top, against a column 60 px to the side
     out.beamPixels=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,cv=document.querySelector('.game-screen canvas'),r=cv.getBoundingClientRect(),b=m.laserBurst;
      const px=(x,y)=>{const sx=cv.width/360,sy=cv.height/480,d=cv.getContext('2d').getImageData(Math.round(x*sx),Math.round(y*sy),1,1).data;return [d[0],d[1],d[2],d[3]];};
      const clear=y=>!m.aliens.some(a=>Math.abs(a.y-y)<a.radius*2&&Math.abs(a.x-b.x)<a.radius*3);let y=b.y-60;while(y>20&&!clear(y))y-=10;
      return {x:+b.x.toFixed(1),y,core:px(b.x,y),side:px(b.x+(b.x>180?-45:45),y),cssWidth:Math.round(r.width),left:+b.left.toFixed(2),muzzleY:+b.y.toFixed(1),top:b.top};});
     await capture(`laser-${mode}-beam`);shots=2;}
    if(shots===2&&s.laser>0&&s.laser<4&&s.beam>0){await capture(`laser-${mode}-beam-2`);shots=3;}
   }
   out.litSeconds=+out.litSeconds.toFixed(2);out.chipSeconds=+out.chipSeconds.toFixed(2);out.snapshot=await page.evaluate(()=>{const s=window.__island.games.current?.session.snapshot;return s&&{laserSeen:s.laserSeen,laserBurst:s.laserBurst,laserChip:s.laserChip,time:+s.time.toFixed(1),wave:s.wave};});
   if(mode==='before')await capture('laser-before-20s');
   await leave();return out;};
  const before=await laser('before'),after=await laser('after');report.laser={before,after};console.log('laser',JSON.stringify(report.laser));
  check(after.view==='three','the 3D layer is on (the phone view)');
  check(before.laserAt===null&&before.litSeconds===0,`v24.8: 20 s of stage 1 with the fire button held: no laser bonus, no beam (laser at ${before.laserAt}, lit ${before.litSeconds} s)`);
  check(after.laserAt!==null&&after.laserAt<=20,`v24.9: the laser bonus started ${after.laserAt} s into wave 1 (the token appeared at ${after.tokenAt} s)`);
  check(after.beamAt!==null&&after.beamAt-after.laserAt<.1,`v24.9: the beam lit at ${after.beamAt} s with the finger already down (no new press)`);
  check(after.litSeconds>=8,`v24.9: the beam was lit ${after.litSeconds} s of the 20 s`);
  const c=after.beamPixels?.core||[0,0,0,0],d=after.beamPixels?.side||[0,0,0,0];check(c[3]>200&&c[1]>200&&c[2]>200&&(c[1]+c[2])-(d[1]+d[2])>150,`v24.9: the beam's column is bright on the canvas (core rgba ${c}, 45 px to the side ${d})`);
  check(after.chip&&/^\d+$/.test(after.chip.text)&&+after.chip.text>=7&&after.chip.box.top<60,`v24.9: the laser chip shows the seconds left at the top edge (${JSON.stringify(after.chip)})`);
  check(Math.abs(after.chipSeconds-8)<1,`v24.9: the chip was up ${after.chipSeconds} s`);
 }
 // ------------------------------------------------------------------ shots
 if(want('shots')){
  report.purchase=await page.evaluate(()=>{const {engine:e,activity}=window.__island,p=e.state.minigameProgress.alienDefense;p.stars=p.stars.map((s,i)=>i<3?Math.max(s,3):s);e.state.money=Math.max(e.state.money,100000);
   const r=[activity.upgrade('alienDefense','weapon'),activity.upgrade('alienDefense','weapon')];return {results:r,weapon:e.state.minigameEquipment.alienDefense.weapon};});
  console.log('purchase',JSON.stringify(report.purchase));
  const shots=async mode=>{
   await begin(mode==='before'?'&alienPierceFix=0':'');
   const out={mode,weapon:await page.evaluate(()=>window.__island.games.current.session.debug.model.equipment.weapon)};
   // Read-only observer around update(): per cannon/wing round, the ships it hit, and whether the laser bonus ran when it was fired.
   await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,seen=new Map();
    const log=window.__v249={plain:[],bonus:[],vulcan:[],flying:0};const orig=m.update.bind(m);
    const close=rec=>{(rec.vulcan?log.vulcan:rec.bonus?log.bonus:log.plain).push(rec.hit.size);};
    m.update=(dt,input)=>{
     for(const s of m.shots)if(!seen.has(s)&&s.kind!==2)seen.set(s,{hit:new Set(),bonus:m.laserTime>0,vulcan:Boolean(s.vulcan),beam:Boolean(s.beam25)});
     const before=new Map([...seen.keys()].map(s=>[s,new Set(s.hitIds||[])]));orig(dt,input);
     for(const [s,prev] of before){const rec=seen.get(s);for(const id of s.hitIds||[])if(!prev.has(id))rec.hit.add(id);
      if(!m.shots.includes(s)){close(rec);seen.delete(s);}else if(!rec.bonus&&!rec.vulcan&&rec.hit.size>0)log.flying++;}
    };});
   const F=await center('#shoot'),state={stick:false};await touch('touchStart',[{...F,id:1}]);let shot=0;
   for(let f=0;f<60*12;f++){
    // before the laser token: under the fullest column; never toward the token here, so the plain rounds are measured without the bonus first
    const st=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m||m.result)return null;
     const cols=new Map();for(const a of m.aliens)if(a.y>0){const k=Math.round(a.x/20);cols.set(k,(cols.get(k)||[]).concat(a));}
     let best=null;for(const list of cols.values()){const x=list.reduce((s,a)=>s+a.x,0)/list.length,score=list.length*100-Math.abs(x-m.player.x);if(!best||score>best.score)best={x,score};}
     return {d:best?best.x-m.player.x:0,time:m.time,laser:m.laserTime||0};});
    if(!st)break;const pts=[{...F,id:1}];
    if(Math.abs(st.d)>2){const p={x:S.x+Math.sign(st.d)*Math.min(40,Math.abs(st.d)*3+6),y:S.y,id:3};if(!state.stick)await touch('touchStart',[...pts,{...S,id:3}]);await touch('touchMove',[...pts,p]);state.stick=true;}
    else if(state.stick)await touch('touchMove',[...pts,{...S,id:3}]);
    await tick(16);if((f===150||f===270)&&st.laser<=0)await capture(`shots-${mode}-plain-${++shot}`);
   }
   await touch('touchEnd',[]);await tick(400);
   Object.assign(out,await page.evaluate(()=>{const l=window.__v249,sum=a=>({rounds:a.length,hitRounds:a.filter(n=>n>0).length,multi:a.filter(n=>n>=2).length,max:Math.max(0,...a)});return {plain:sum(l.plain),bonus:sum(l.bonus),vulcan:sum(l.vulcan),plainFlyingAfterHit:l.flying};}));
   await leave();return out;};
  const before=await shots('before'),after=await shots('after');report.shots={before,after};console.log('shots',JSON.stringify(report.shots));
  check(report.purchase.weapon>=2,`the permanent laser bought through the shop (weapon rank ${report.purchase.weapon})`);
  check(before.plain.multi>0&&before.plain.max>=2,`v24.8 with the permanent laser: ${before.plain.multi} of ${before.plain.hitRounds} regular rounds that hit went on through ships (up to ${before.plain.max})`);
  check(after.plain.hitRounds>10&&after.plain.multi===0&&after.plain.max===1&&after.plainFlyingAfterHit===0,`v24.9: all ${after.plain.hitRounds} regular rounds that hit stopped on their first ship (max ${after.plain.max}, still flying after a hit: ${after.plainFlyingAfterHit})`);
  check(after.bonus.max<=4,`v24.9: rounds fired while the laser bonus ran pierced at most ${after.bonus.max} ships (${after.bonus.multi} of ${after.bonus.hitRounds} went through more than one)`);
 }
 await writeFile(new URL('../verification/aliens-v24-9/browser-report.json',import.meta.url),JSON.stringify({...report,fails},null,1)+'\n');
 failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED:\n'+failures.join('\n'));process.exit(1);}
console.log('aliens v24.9 browser acceptance: all checks passed');
