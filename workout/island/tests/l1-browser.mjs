import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const directory=fileURLToPath(new URL('../verification/l1/',import.meta.url));await mkdir(directory,{recursive:true});
const server=await serveIsland(),chromium=await islandChromium(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[],shots=[];
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Jerusalem'}),page=await context.newPage(),errors=[],outside=[],withVoice=viewport.width===844;
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(server.url).origin)outside.push(u.href);});
  await page.addInitScript(withVoice=>{
   // Deterministic availability test. This records speech requests, not human audio quality.
   window.l1Speech=[];const fake={getVoices:()=>withVoice?[{lang:'he-IL',name:'test Hebrew',localService:true}]:[],cancel(){},speak:u=>window.l1Speech.push({text:u.text,lang:u.lang}),addEventListener(){},removeEventListener(){}};
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:fake});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  },withVoice);
  const shot=async name=>{const file=`${viewport.width}-${name}.png`;await page.screenshot({path:directory+file});shots.push(file);};
  const round=()=>page.evaluate(()=>window.__island.engine.learningRound());
  const close=()=>page.evaluate(()=>window.__island.ui.closeModal());
  async function fit(){const box=await page.locator('.learning-screen').boundingBox();assert.equal(Math.round(box.width),viewport.width);assert.equal(Math.round(box.height),viewport.height);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);}
  async function solveQuestion(){
   const r=await round(),q=r.question;
   if(q.kind==='choice'){
    const options=await page.locator('[data-action=learning-answer]').all();for(const b of options)if(await b.getAttribute('data-value')===q.answer){await b.click();break;}
   }else if(q.kind==='word'){
    for(const c of q.answer){const letters=await page.locator('[data-action=learning-letter]:not(:disabled)').all();for(const b of letters)if(await b.innerText()===c){await b.click();break;}}await page.locator('[data-action=learning-check]').click();
   }else if(q.kind==='memory'){
    const pairs=new Map();q.cards.forEach((c,i)=>pairs.set(c.icon,[...(pairs.get(c.icon)||[]),i]));for(const pair of pairs.values())for(const i of pair)await page.locator(`[data-action=learning-memory-card][data-card="${i}"]`).click();
   }else{
    const order=[...q.order];for(let i=0;i<order.length;i++){if(order[i]===i)continue;const at=order.indexOf(i);await page.locator(`[data-action=learning-tile][data-position="${i}"]`).click();await page.locator(`[data-action=learning-tile][data-position="${at}"]`).click();[order[i],order[at]]=[order[at],order[i]];}await page.locator('[data-action=learning-check]').click();
   }
   assert.equal((await round()).resolved,true);await page.locator('[data-action=learning-next]').click();
  }
  async function completeRound(station,{capture=false}={}){
   await page.evaluate(station=>window.__island.learning.start(station),station);const total=(await round()).total;
   for(let i=0;i<total;i++){await fit();if(capture&&i===0)await shot(station+'-question');await solveQuestion();}
   assert.ok(await page.locator('[data-learning-result]').isVisible());return total;
  }
  try{
   await page.clock.setFixedTime(new Date('2026-10-20T10:00:00Z'));await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('[data-action=avatar-start]').click();
   assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().firstDay),true);assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().locked),false);
   await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=100000;for(const [i,type]of ['library','mathLab','zoo','puzzleRoom'].entries()){const r=e.place(type,3+i*2,5);if(!r.ok)throw Error(type+': '+r.reason);}e.place('road',0,7);if(!e.place('harbor',0,8).ok)throw Error('harbor');for(const type of ['soccer','tennis','fireStation','airbase']){let placed=false;for(let z=0;z<16&&!placed;z++)for(let x=0;x<16&&!placed;x++)placed=e.place(type,x,z).ok;if(!placed)throw Error(type);}});
   if(viewport.width===844){await page.evaluate(()=>{window.__island.ui.closeDetails();window.__island.view.home();});await shot('four-learning-buildings');}
   const parent=page.locator('[data-action=parent]'),bounds=await parent.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.locator('[data-action=learning-age][data-age="4"]').waitFor();await page.mouse.up();
   await shot('parent-age');await page.locator('[data-action=learning-age][data-age="6"]').click();assert.deepEqual(await page.evaluate(()=>Object.values(window.__island.engine.state.learning.stations).map(s=>s.level)),[3,3,3,3]);await close();
   await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));
   await page.evaluate(()=>window.__island.games.menu());assert.equal(await page.locator('[data-daily-locked=true]').count(),5);if(viewport.width===844)await shot('locked-games');
   await page.locator('[data-game=soccer] [data-action=game-play]').click();assert.equal(await page.locator('[data-daily-mission]').count(),1);if(viewport.width===390)await shot('daily-mission');await close();
   for(const id of ['soccer','tennis','navalDuel','fireRescue','alienDefense']){await page.evaluate(id=>window.__island.games.stages(id),id);assert.equal(await page.locator('[data-daily-mission]').count(),1);await close();}
   await page.evaluate(()=>{const {ui,engine:e}=window.__island;ui.showInfo(e.state.buildings.find(b=>b.typeId==='soccer').id);});assert.match(await page.locator('[data-action=soccer-building-play]').innerText(),/🔒/);await page.locator('[data-action=soccer-building-play]').click();assert.ok(await page.locator('[data-daily-mission]').isVisible());await close();
   await page.evaluate(()=>window.__island.games.autoLaunch({gameId:'fireRescue',eventId:'l1-blocked-event'}));assert.ok(await page.locator('[data-daily-mission]').isVisible());await close();
   // Build click opens a station; the house icon retains access to move/remove controls.
   await page.evaluate(()=>{const {ui,engine:e}=window.__island;ui.closeInfo();ui.showInfo(e.state.buildings.find(b=>b.typeId==='library').id);});assert.equal(await page.locator('[data-learning=language]').count(),1);await page.locator('[data-action=learning-building]').click();assert.ok(await page.locator('[data-action=move]').isVisible());await close();
   for(const [index,station]of ['language','math','animals','puzzles'].entries()){
    await page.evaluate(()=>window.__island.engine.setLearningAge(6));
    // Set every station back to the selected starting level through parent age choices.
    await page.evaluate(()=>{window.__island.engine.setLearningAge(7);window.__island.engine.setLearningAge(6);});
    await completeRound(station,{capture:(viewport.width===390&&[0,2].includes(index))||(viewport.width===844&&[1,3].includes(index))});
    if(index===0)assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().locked),true);
    if(index>=1)assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().locked),false);
    if(viewport.width===390&&index===1)await shot('round-result');await close();
   }
   await page.evaluate(()=>window.__island.engine.setLearningAge(4));await page.clock.setFixedTime(new Date('2026-10-22T10:00:00Z'));
   await page.evaluate(()=>window.__island.learning.start('language'));assert.equal((await round()).total,5);await fit();assert.doesNotMatch(await page.locator('.learning-screen').innerText(),/[א-תA-Za-z]/);await shot('level-1-pictures');
   const speechBefore=await page.evaluate(()=>window.l1Speech.length);await page.locator('[data-action=learning-replay]').click();assert.equal(await page.evaluate(()=>window.l1Speech.length),speechBefore+(withVoice?1:0));
   assert.equal(await page.locator('[data-voice-fallback=true]').count(),withVoice?0:1);
   for(let i=0;i<5;i++)await solveQuestion();assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().locked),false);assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().rounds),1);await close();
   // Level 7 includes reading, then a 16-card memory board and a 5x5 jigsaw.
   await page.evaluate(()=>{window.__island.engine.setLearningAge(10);window.__island.learning.start('language');});assert.equal((await round()).question.level,7);await fit();await shot('level-7-reading');await close();
   await page.evaluate(()=>window.__island.learning.start('puzzles'));await solveQuestion();assert.equal(await page.locator('[data-action=learning-memory-card]').count(),16);await fit();await solveQuestion();await solveQuestion();assert.equal(await page.locator('[data-action=learning-tile]').count(),25);await fit();await solveQuestion();await close();
   // Incorrect choices give one retry, then disclose the solution and continue.
   await page.evaluate(()=>window.__island.learning.start('math'));let q=(await round()).question;const wrong=(await page.locator('[data-action=learning-answer]').all());for(const b of wrong)if(await b.getAttribute('data-value')!==q.answer){await b.click();break;}assert.equal((await round()).resolved,false);for(const b of await page.locator('[data-action=learning-answer]:not(:disabled)').all())if(await b.getAttribute('data-value')!==q.answer){await b.click();break;}assert.equal((await round()).resolved,true);assert.equal(await page.locator('[data-correct=true]').count(),1);await close();
   await page.clock.setFixedTime(new Date('2026-10-23T10:00:00Z'));assert.equal(await page.evaluate(()=>window.__island.engine.learningStatus().locked),true);await page.evaluate(()=>window.__island.ui.showParent());await page.locator('[data-action=learning-required]').click();await close();await page.evaluate(()=>window.__island.games.stages('soccer'));assert.equal(await page.locator('[data-stage-map=soccer]').count(),1);await close();await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);assert.equal(await page.evaluate(()=>window.__island.engine.state.learning.age),10);assert.equal(await page.evaluate(()=>window.__island.engine.state.learning.required),false);
   assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({viewport,hebrewVoiceMock:withVoice,pictureFallback:!withVoice,firstDayBypass:true,fiveGamesGated:true,buildingAndEventGated:true,fourStationRounds:true,adaptiveLevels:true,youngDailyFiveQuestions:true,oldDailyTwoRounds:true,memory16:true,jigsaw25:true,retryAndReveal:true,parentSettingsReload:true,errors,outside});console.log('L1 verified',viewport);
  }finally{await context.close();}
 }
 assert.ok(shots.length<=14);await writeFile(directory+'verification.json',JSON.stringify({browser:browser.version(),physicalPhone:false,realHebrewAudioAudited:false,reports,shots},null,2)+'\n');
}finally{await browser.close();await server.close();}
