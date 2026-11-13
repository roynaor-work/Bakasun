// Racing sound at the start of the race, in a real browser with touch (844x390), without --autoplay-policy=no-user-gesture-required:
// the race is opened by a real tap (league card "go", and the old map's "understood"), the left thumb is placed on the wheel and HELD (pointerdown only,
// never released), the gas is never touched, and the AudioContext state and engine gain are sampled every half second for the countdown and the first
// 5 s of the race, in both throttle modes (manual = default, automatic = saved choice). The race must have a running context within 2 s of the start.
// Two autoplay policies: 'chromium' (the browser's own: sticky activation after the first tap) and 'webkit' (a shim that behaves like Safari/iOS:
// a context created outside a tap starts suspended and resume() only works inside touchend/pointerup/click/keydown, also after a scripted suspend()).
// Usage: CHROMIUM_PATH=... node tests/racing-sound-browser.mjs      env RACING_SOUND_POLICY=chromium|webkit|both (default both), RACING_SOUND_MODES=manual,auto, RACING_SOUND_ENTRIES=league,map,
//        RACING_SOUND_REPORT_ONLY=1 collects without failing
import {verify} from './night-browser.mjs';
const POLICIES=(process.env.RACING_SOUND_POLICY||'both')==='both'?['chromium','webkit']:[process.env.RACING_SOUND_POLICY];
const REPORT_ONLY=process.env.RACING_SOUND_REPORT_ONLY==='1';
const MODES=(process.env.RACING_SOUND_MODES||'manual,auto').split(','),ENTRIES=(process.env.RACING_SOUND_ENTRIES||'league,map').split(',');
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const MAX_START_S=2;
await verify('racing-sound-browser',[{width:844,height:390}],async({page,context,tick,snap,shot,assert,ready,nav,tap})=>{
 const report={cases:[],failures:[]};
 const cdp=await context.newCDPSession(page);
 await page.evaluate(()=>{
  // runtime policy shim (see the file header). Installed per case, removed before the next one.
  window.__installSoundPolicy=mode=>{
   window.__soundPolicyRestore?.();
   if(mode!=='webkit')return;
   const Orig=window.__OrigAudioContext||(window.__OrigAudioContext=window.AudioContext);
   let inGesture=false;const channel=new MessageChannel();channel.port1.onmessage=()=>{inGesture=false;};
   const mark=e=>{if(!e.isTrusted)return;inGesture=true;channel.port2.postMessage(0);};
   const types=['touchend','pointerup','mouseup','click','keydown'];for(const t of types)window.addEventListener(t,mark,true);
   const log=[];
   class Shim extends Orig{constructor(...a){super(...a);if(inGesture)log.push('ctor-in-gesture');else{log.push('ctor-outside-gesture:suspended');void super.suspend();}}
    resume(){if(inGesture){log.push('resume-in-gesture');return super.resume();}log.push('resume-outside-gesture:denied');return new Promise(()=>{});}}
   window.AudioContext=Shim;window.__soundPolicyLog=log;
   window.__soundPolicyRestore=()=>{window.AudioContext=Orig;for(const t of types)window.removeEventListener(t,mark,true);window.__soundPolicyRestore=null;};
  };
 });
 const metrics=()=>page.evaluate(()=>{const s=window.__island.games.current?.session;const snap=s?.snapshot;return snap?{phase:snap.phase,time:+snap.time.toFixed(2),speed:+snap.player.speed.toFixed(1),state:snap.audioMetrics.contextState||s.debug?.audio?.engine?.().contextState||null,gain:snap.audioMetrics.gain==null?null:+snap.audioMetrics.gain.toFixed(4),paused:snap.audioMetrics.paused,auto:s.debug?.input?.sample().autoAccelerate??null}:null;});
 log('island booted');
 for(const policy of POLICIES)for(const mode of MODES)for(const entry of ENTRIES){
  const name=`${policy}-${mode}-${entry}`;log('case',name);
  await page.evaluate(({policy,mode})=>{localStorage.setItem('island.racing.auto',mode==='auto'?'1':'0');window.__installSoundPolicy(policy);
   const e=window.__island.engine;e.state.instructionsSeen=e.state.instructionsSeen.filter(x=>x!=='islandRacing');},{policy,mode});
  // open the race with a REAL tap: the league card's go button, or the old map's stage + "understood"
  if(entry==='league'){await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForSelector('[data-action=racing-league-go]');await tick(30);await page.locator('[data-action=racing-league-go]').tap();}
  else{await page.evaluate(()=>window.__island.games.start('islandRacing',undefined,1));await tick(60);await page.waitForSelector('[data-action=game-understood]');await tick(32);await page.locator('[data-action=game-understood]').tap();}
  const atLaunch=await metrics();log('launched',JSON.stringify(atLaunch));
  await ready();await tick(100);await nav();log('shell countdown done');
  for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
  const afterCountdown=await metrics();log('view ready',JSON.stringify(afterCountdown));
  // the left thumb on the wheel, held for the whole measurement (a touch pointerdown is not a user activation in Chrome or Safari)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:230,id:1}]});await page.waitForTimeout(50);
  const samples=[];let firstRunning=null;
  for(let i=0;i<18;i++){await tick(500);await page.waitForTimeout(20);const m=await metrics();samples.push(m);if(m?.state==='running'&&m.phase==='racing'&&firstRunning===null)firstRunning=m.time;if(m?.phase==='racing'&&m.time>=5)break;}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(50);
  const wheelActive=await page.evaluate(()=>document.querySelector('.racing-steering')?.classList.contains('active'));
  const policyLog=await page.evaluate(()=>window.__soundPolicyLog||null);
  if(mode==='manual'&&entry==='league'&&policy===POLICIES[0])await shot('sound-'+name);
  const racing=samples.filter(s=>s?.phase==='racing');
  const row={name,policy,mode,entry,atLaunch,afterCountdown,samples,firstRunningAtRaceTime:firstRunning,allRunningFrom2s:racing.filter(s=>s.time>=MAX_START_S).every(s=>s.state==='running'),movedWithoutGas:racing.at(-1)?.speed>0,policyLog};
  report.cases.push(row);
  const ok=firstRunning!==null&&firstRunning<=MAX_START_S&&row.allRunningFrom2s;
  if(!ok)report.failures.push(`${name}: first running at race time ${firstRunning} (limit ${MAX_START_S} s); states ${racing.map(s=>s.time+':'+s.state).join(' ')}`);
  if(mode==='auto'&&!row.movedWithoutGas)report.failures.push(`${name}: automatic throttle did not move the car`);
  if(mode==='manual'&&row.movedWithoutGas)report.failures.push(`${name}: the car moved without gas in manual mode`);
  console.log(name.padEnd(22),'running at',firstRunning,'s | after 2 s all running:',row.allRunningFrom2s,'| moved without gas:',row.movedWithoutGas,'| wheel held:',wheelActive);
  // leave the race (pause sheet, exit) and clear the shim
  await page.evaluate(()=>{window.__island.games.current?.session?.setPaused?.(false);});
  if(!await page.locator('.game-pause-sheet').count()){await tap('[data-action=game-pause]');await tick(32);}
  await tap('[data-action=game-exit]');await nav();await tick(200);
  await page.evaluate(()=>window.__soundPolicyRestore?.());
 }
 if(report.failures.length&&!REPORT_ONLY)assert.fail('racing sound start:\n'+report.failures.join('\n'));
 return report;
});
