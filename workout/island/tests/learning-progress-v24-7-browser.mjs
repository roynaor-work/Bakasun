// v24.7 acceptance in a real browser (Chromium, SwiftShader WebGL, 844x390 with hasTouch and isMobile): the question screen of the new
// learning bank (a round at the city hall and the question before a first building) and the progress board, then the same page with
// `?learningV2=0&progressBoard=0`. The harness (night-browser.mjs) fails on any console error, CSP report or request outside the island.
// The results the board shows here are test data recorded by this script in a throwaway browser profile.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      node workout/island/tests/learning-progress-v24-7-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL('../verification/learning-progress-v24-7/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const failures=[];
await verify('learning-progress-v24-7',[{width:844,height:390,isMobile:true}],async({page,tick})=>{
 const fails=[],report={};const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:72});
 const settle=async(ms=400)=>{for(let i=0;i<ms;i+=50){await tick(50);await new Promise(r=>setTimeout(r,25));}};/* the page clock is the harness's; fetches and imports need real time */
 const requests=[];page.on('request',r=>{const p=new URL(r.url()).pathname;if(/learning-v2|progress-board/.test(p))requests.push(p.replace(/^.*\/workout\/island\//,''));});
 const fits=sel=>page.evaluate(s=>[...document.querySelectorAll(s)].filter(n=>n.offsetParent).map(n=>{const b=n.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),inside:b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};}),sel);
 const closeAll=async()=>{for(let i=0;i<4&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await settle(200);}};

 // ---------------------------------------------------------------- learning: a round at the city hall
 report.setup=await page.evaluate(()=>{const {engine:e}=window.__island;return {v2:Boolean(e.learningV2),ageBefore:e.learningV2?.age(),set:e.learningV2?.setAge(8),age:e.learningV2?.age(),cityHall:e.state.buildings.some(b=>b.typeId==='cityHall')};});
 check(report.setup.v2&&report.setup.age===8,'the learning bank is installed and the parent age 8 is kept (default age '+report.setup.ageBefore+')');
 check(report.setup.cityHall,'the city hall (general knowledge station) stands in the city');
 await closeAll();
 await page.evaluate(()=>window.__island.learning.start('general'));
 await page.waitForFunction(()=>window.__island.engine.learningV2.current()?.question,null,{timeout:30000});await settle();
 const first=await page.evaluate(()=>{const c=window.__island.engine.learningV2.current(),d=document.querySelector('.learning-screen');return {id:c.question.id,domain:c.question.domain,age:c.question.age,total:c.total,mode:d?.dataset.learningV2,prompt:d?.querySelector('.learning-prompt')?.textContent,answers:[...d.querySelectorAll('.learning-answers button')].map(b=>b.textContent),counter:d?.querySelector('.learning-counter')?.textContent,answer:c.question.answer,css:Boolean(document.querySelector('link[data-learning-v2]')?.sheet)};});
 report.round=first;
 check(first.mode==='round'&&first.domain==='general'&&Math.abs(first.age-8)<=1,'question screen: a general knowledge question for ages 7 to 9 ('+first.id+')');
 check(first.answers.length===4&&first.counter==='1/8','four answers and the counter 1/8');
 check(first.css,'the screen styles are loaded by the module');
 const answerBoxes=await fits('.learning-answers button');report.answerBoxes=answerBoxes;
 check(answerBoxes.length===4&&answerBoxes.every(b=>b.inside&&b.h>=44&&b.w>=120),'the four answers are on screen and at least 44 px high: '+JSON.stringify(answerBoxes.map(b=>b.w+'x'+b.h)));
 check((await fits('.learning-prompt')).every(b=>b.inside),'the question text is inside the screen');
 await capture('question-round');
 // A wrong answer: the hint, the answer greyed, another try. Then the right one: the explanation and "next".
 const wrong=(first.answer+1)%4;
 await page.locator(`.learning-answers button[data-index="${wrong}"]`).tap();await settle();
 const afterWrong=await page.evaluate(()=>({state:document.querySelector('.learning-feedback').dataset.state,text:document.querySelector('.learning-feedback').textContent,disabled:[...document.querySelectorAll('.learning-answers button')].filter(b=>b.disabled).length}));
 check(afterWrong.state==='hint'&&afterWrong.disabled===1&&afterWrong.text.startsWith('אפשר לנסות שוב'),'a wrong tap gives a hint and keeps the question open');
 await capture('question-hint');
 await page.locator(`.learning-answers button[data-index="${first.answer}"]`).tap();await settle();
 const afterRight=await page.evaluate(()=>({state:document.querySelector('.learning-feedback').dataset.state,text:document.querySelector('.learning-feedback').textContent,next:document.querySelector('[data-action=learning-next]')?.textContent}));
 check(afterRight.state==='correct'&&afterRight.next==='ממשיכים','the right tap shows the explanation and the next button');
 check(!/!/.test(first.prompt+first.answers.join('')+afterWrong.text+afterRight.text),'no exclamation mark on the question screen');
 await page.locator('[data-action=learning-next]').tap();await settle();
 const second=await page.evaluate(()=>({id:window.__island.engine.learningV2.current()?.question.id,counter:document.querySelector('.learning-counter')?.textContent}));
 check(second.id&&second.id!==first.id&&second.counter==='2/8','the next question is a different one (2/8)');
 await closeAll();

 // ---------------------------------------------------------------- learning: the question before a first building
 const target=await page.evaluate(()=>{const {engine:e}=window.__island;e.state.money=Math.max(e.state.money,100000);
  for(const type of e.registry.buildings.values()){if(type.isRoad||!e.learningV2.needsBuildingQuestion(type.id))continue;
   for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.validatePlacement(type.id,x,z).ok)return {typeId:type.id,x,z,direct:e.place(type.id,x,z).reason};}
  return null;});
 report.build=target;
 check(target&&target.direct==='learning.v2.cityQuestion','a first building of a kind is not placed without the question ('+target?.typeId+')');
 if(target){
  await page.evaluate(t=>{window.__built=null;window.__island.learning.beforeBuild(t,r=>{window.__built=r;});},target);
  await page.waitForFunction(()=>window.__island.engine.learningV2.current()?.mode==='city',null,{timeout:30000});await settle();
  const city=await page.evaluate(()=>{const c=window.__island.engine.learningV2.current();return {id:c.question.id,answer:c.question.answer,title:document.querySelector('.learning-screen h2')?.textContent,note:document.querySelector('.learning-feedback')?.textContent};});
  report.buildQuestion=city;check(city.title.startsWith('לפני הבנייה'),'the building question opens with its title: '+city.title);
  await capture('question-before-building');
  await page.locator(`.learning-answers button[data-index="${city.answer}"]`).tap();await settle();
  await page.locator('[data-action=learning-build-confirm]').tap();await settle();
  const built=await page.evaluate(t=>({result:window.__built,placed:window.__island.engine.state.buildings.some(b=>b.typeId===t.typeId),again:window.__island.engine.learningV2.needsBuildingQuestion(t.typeId)}),target);
  report.built=built;check(built.result?.ok&&built.placed&&built.result.learningReward===12&&!built.again,'the right answer builds, pays 12 coins once, and the kind needs no further question');
 }
 await closeAll();

 // ---------------------------------------------------------------- progress board
 const shortcut=page.locator('[data-action="quick-scores"]');
 await page.waitForFunction(()=>document.querySelector('[data-action="quick-scores"] strong')?.textContent==='ההתקדמות שלי',null,{timeout:30000}).catch(()=>{});
 report.shortcut=await page.evaluate(()=>document.querySelector('[data-action="quick-scores"] strong')?.textContent);
 check(report.shortcut==='ההתקדמות שלי','the scores shortcut of the city bar opens the board: '+report.shortcut);
 // Test data: three finished soccer rounds on three days, through the same hook the result screen uses.
 // The first one goes to an open result dialog, found the way the result screen finds it (games.progressTarget).
 for(const [i,score] of [[2,2],[1,3],[0,5]]){await page.evaluate(({i,score})=>{const {games}=window.__island,result={outcome:'win',stage:1,score,stars:i?2:3};let target=null;
   if(i===2){games.modal('minigame.win','minigame.resultHint');target=games.progressTarget('soccer',result);}
   games.onProgressResult({runId:'check-'+i,played:true,gameId:'soccer',result,at:Date.now()-i*86400000},target);},{i,score});await settle(i===2?900:300);
  if(i===2){report.ribbon=await page.evaluate(()=>{const r=document.querySelector('.modal .pb-ribbon'),b=r?.getBoundingClientRect();return r&&{text:r.querySelector('.pb-ribbon-copy').textContent,after:r.previousElementSibling?.className,inside:b.left>=-1&&b.right<=innerWidth+1,image:r.querySelector('img')?.naturalWidth>0};});
   check(report.ribbon&&/תג חדש/.test(report.ribbon.text)&&report.ribbon.after==='modal-subtitle'&&report.ribbon.inside&&report.ribbon.image,'a first result puts the badge ribbon under the result title: '+report.ribbon?.text);
   check(!/!/.test(report.ribbon?.text||''),'no exclamation mark on the ribbon');await capture('result-ribbon');await closeAll();}}
 await settle(600);
 if(!await shortcut.isVisible())await page.evaluate(()=>window.__island.ui.cityAccess.prepare?.());
 await page.evaluate(()=>document.querySelector('[data-action="quick-scores"]').click());
 await page.waitForSelector('[data-progress-board] .pb-overview',{timeout:30000});await settle(600);
 const board=await page.evaluate(()=>{const root=document.querySelector('[data-progress-board]'),b=root.getBoundingClientRect();return {
  stats:[...root.querySelectorAll('.pb-stat')].map(n=>n.querySelector('.pb-stat-label').textContent+' '+n.querySelector('.pb-stat-value').textContent),
  chart:Boolean(root.querySelector('.pb-plot polyline')),points:root.querySelectorAll('.pb-plot circle.pb-point,.pb-plot circle.pb-point-last').length,
  badges:[...root.querySelectorAll('.pb-medal-tile span')].map(n=>n.textContent),images:[...root.querySelectorAll('img')].map(i=>i.complete&&i.naturalWidth>0),
  inside:b.left>=-1&&b.right<=innerWidth+1,box:[Math.round(b.width),Math.round(b.height)],scrollX:document.documentElement.scrollWidth>innerWidth+1,text:root.textContent};});
 report.board=board;
 check(board.stats.length===3&&/כוכבים השבוע/.test(board.stats[0]),'the board shows stars this week, the streak and the level: '+board.stats.join(' | '));
 check(board.chart&&board.points===3,'the personal graph draws the three results');
 check(board.badges.length>=1&&board.images.length>=1&&board.images.every(Boolean),'earned badges are drawn from the local SVG files: '+board.badges.join(', '));
 check(board.inside&&!board.scrollX,'the board fits the 844 px screen without sideways scrolling ('+board.box.join('x')+')');
 check(!/!/.test(board.text),'no exclamation mark on the board');
 await capture('progress-board');
 await page.locator('[data-pb-gallery]').tap();await settle();
 report.gallery=await page.evaluate(()=>({rows:document.querySelectorAll('.pb-badge-row').length,earned:document.querySelectorAll('.pb-badge-row[data-earned=true]').length}));
 check(report.gallery.rows===20,'the collection lists all twenty badges ('+report.gallery.earned+' earned in this run)');
 await capture('progress-badges');
 report.storage=await page.evaluate(async()=>({keys:Object.keys(localStorage).sort(),board:localStorage.getItem('bakasun-progress-board-v1')?.length??0,databases:(await indexedDB.databases?.())?.map(d=>d.name)??null}));
 check(report.storage.board>0&&!(report.storage.databases||[]).includes('bakasun-progress-board-v1'),'the board is saved in localStorage only: '+JSON.stringify(report.storage.keys)+', IndexedDB '+JSON.stringify(report.storage.databases));
 await closeAll();
 report.requestsOn=[...new Set(requests)].sort();
 check(report.requestsOn.some(p=>p.endsWith('data/general.json'))&&report.requestsOn.some(p=>p.includes('progress-board-v1/art/badges/')),'bank and art came from assets/ on the island itself ('+report.requestsOn.length+' files)');

 // ---------------------------------------------------------------- both switches off
 requests.length=0;
 const off=new URL(page.url());off.search='?dev=1&learningV2=0&progressBoard=0';
 await page.goto(off.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);await settle(600);
 report.off=await page.evaluate(()=>{const {engine:e,games,learning}=window.__island;return {v2:e.learningV2===undefined,hook:games.onProgressResult===undefined,learning:learning.constructor.name,css:document.querySelectorAll('link[data-learning-v2],link[href*="progress-board"]').length,label:document.querySelector('[data-action="quick-scores"] strong')?.textContent,age:e.state.learning.age};});
 report.requestsOff=[...new Set(requests)];
 check(report.off.v2&&report.off.hook&&report.off.learning==='LearningInterface'&&report.off.css===0,'?learningV2=0&progressBoard=0: the old learning path, no board hook, no styles');
 check(report.off.label!=='ההתקדמות שלי','the shortcut keeps its old label: '+report.off.label);
 check(report.requestsOff.length===0,'no file of either feature is requested with the switches off: '+JSON.stringify(report.requestsOff));
 report.failures=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exit(1);}
console.log('learning-progress-v24-7: all checks passed');
