// Ships v24.9 (Roy, 22/11/2026: "why does he talk during the ships game?") in a real browser: Chromium as a phone (hasTouch, isMobile,
// 844x390, SwiftShader WebGL), the island shell, a device that has a local Hebrew voice. speechSynthesis.speak, SpeechSynthesisUtterance and
// Audio are replaced by counters before the battle. The child then opens the weapon picker and takes each weapon, taps Lock and Fire and
// sails for 20 s of game time: no speech call may be made. With ?navalVoice=1 the same weapon choices speak (so the counters do see speech).
// Nothing is listened to. Run: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs CHROMIUM_PATH=... node workout/island/tests/naval-voice-v249-browser.mjs
import {verify} from './night-browser.mjs';
await verify('naval-voice-v249',[{width:844,height:390,isMobile:true}],async({page,tick,snap,start,exit,assert})=>{
 page.setDefaultTimeout(20000);const log=(...a)=>{if(process.env.DEBUG_NAVAL_VOICE)console.log(...a);};
 await page.evaluate(()=>{
  const log=window.__speech={spoken:[],utterances:0,audio:0};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'he-IL',localService:true,name:'local Hebrew'}],speak(u){log.spoken.push(String(u.text));},cancel(){},pause(){},resume(){},addEventListener(){},removeEventListener(){}}});
  window.SpeechSynthesisUtterance=class{constructor(text){log.utterances++;this.text=text;}addEventListener(){}};
  const RealAudio=window.Audio;window.Audio=function(...args){log.audio++;return new RealAudio(...args);};window.Audio.prototype=RealAudio.prototype;
  localStorage.setItem('island.sound','on');
 });
 const read=()=>page.evaluate(()=>({...window.__speech,spoken:[...window.__speech.spoken]}));
 const clear=()=>page.evaluate(()=>{window.__speech.spoken.length=0;window.__speech.utterances=0;window.__speech.audio=0;});
 const battle=async search=>{
  await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},search);await start('navalDuel',1);
  await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{timeout:120000}).catch(()=>{});await tick(400);await clear();log('started',search);
  const kidPicker=await page.evaluate(()=>document.querySelector('.naval-adventure-controls')?.dataset.kidPicker!==undefined);
  let picked=0;const count=await page.locator('.ammo-rack [data-ammo-index]').count();
  for(let i=0;i<count;i++){await page.locator('.naval-weapon-picker').tap();await tick(120);const b=page.locator(`.ammo-rack [data-ammo-index="${i}"]`);if(await b.isDisabled())continue;await b.tap();await tick(200);picked++;log('picked',i);}
  await page.locator('.naval-weapon-picker').tap();await tick(120);await page.locator('.ammo-rack [data-ammo-index="0"]').tap();await tick(200);picked++;
  if(await page.locator('.naval-lock-btn').count()){await page.locator('.naval-lock-btn').tap();await tick(300);}
  let last=await snap();for(let s=0;s<20;s++){if(s%3===0&&await page.locator('#shoot:visible').count())await page.locator('#shoot').tap().catch(()=>{});await tick(1000);const now=await snap().catch(()=>null);if(!now)break;last=now;if(now.result)break;}log('sailed');
  const hint=await page.locator('.naval-weapon-hint').first().evaluate(n=>({text:n.textContent,px:parseFloat(getComputedStyle(n).fontSize)})).catch(()=>null);
  const s=last,speech=await read();await exit().catch(()=>{});await tick(400);
  return {search,kidPicker,weaponsPicked:picked,gameSeconds:s?+s.time.toFixed(1):null,fired:s?.fired??null,hint,speech};
 };
 const silent=await battle('');
 assert.equal(silent.kidPicker,true,'the kid weapon picker (the one that spoke) is the one on screen');assert.ok(silent.weaponsPicked>=2,'weapons were picked: '+silent.weaponsPicked);assert.ok(silent.gameSeconds>10,'the battle ran: '+silent.gameSeconds);
 assert.deepEqual(silent.speech,{spoken:[],utterances:0,audio:0},'no speech call during the battle');
 assert.ok(silent.hint&&silent.hint.px<=14,'the written hint stays small: '+JSON.stringify(silent.hint));
 const voiced=await battle('&navalVoice=1');
 assert.ok(voiced.speech.spoken.length>=2,'?navalVoice=1 speaks the weapon sentences: '+voiced.speech.spoken.length);assert.equal(voiced.speech.audio,0);
 return {silent,voiced};
});
