// v25.0 acceptance in a real browser with real touch: HUD icons v2 (?uiIcons=0 reverts) and tennis motion v3 (?tennisMotionV3=0 reverts).
// Chromium with hasTouch and isMobile at 844x390, SwiftShader WebGL, CDP Input.dispatchTouchEvent on the real controls, Playwright's clock.
// One page load per mode, so the flags are read the way the phone reads them:
//   MODE=before ISLAND_QUERY='&uiIcons=0&tennisMotionV3=0'   and   MODE=after (no query).
// Screens with icons: the island's top bar (the coin), the pause button of a game (tennis), the pause sheet (resume, sound/mute).
// Tennis: a rally with plain hits, a lob and a drop; which clips play, the hip height, hits against swings (the contact IK must not lose a ball),
// triangles of the frame (the motion pack is pose data: it must add none), the line-call hook (audio metrics) and the frames.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      MODE=after node workout/island/tests/ui-tennis-v25-0-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const mode=process.env.MODE||'after',frames=new URL('../verification/ui-tennis-v25-0/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const HUB_ONLY=process.env.ONLY==='hub';/* ONLY=hub: the island's top bar alone (a quick run) */
const failures=[],CLOSE=process.env.CLOSEUP==='1';/* CLOSEUP=1: the same rally filmed from beside the child (dev camera), to see the body */
await verify('ui-tennis-v25-0/'+mode,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).first().boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const tapAt=async el=>{await touch('touchStart',[{...el,id:2}]);await tick(60);await touch('touchEnd',[]);};
 const capture=(name,clip)=>page.screenshot({path:new URL(`${mode}-${name}.jpg`,frames).pathname,type:'jpeg',quality:82,...(clip?{clip}:{})});
 const check=(ok,text)=>{if(!ok)failures.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const report={mode,query:process.env.ISLAND_QUERY||'',clock:'Playwright page.clock; times are model time'};
 const requests=[];page.on('response',r=>{const u=new URL(r.url());if(/ui-icons-v2|tennis-motion-v|tennis-callouts/.test(u.pathname))requests.push({path:u.pathname.replace(/^.*\/workout\/island\//,''),status:r.status()});});
 const describe=sel=>page.evaluate(sel=>{const n=document.querySelector(sel);if(!n)return null;const b=n.getBoundingClientRect(),img=n.querySelector('img.ui-icon2'),before=getComputedStyle(n,'::before');
  return {box:[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)],icon:img?.dataset.uiIcon??null,iconLoaded:img?img.complete&&img.naturalWidth>0:null,text:n.innerText.trim(),label:n.getAttribute('aria-label'),fontSize:getComputedStyle(n).fontSize,beforeImage:before.backgroundImage.replace(/^.*\/assets\//,'assets/').replace(/["')]+$/,'')};},sel);
 // ---------------------------------------------------------------- 1. The island's top bar
 await tick(600);
 report.hub={on:await page.evaluate(()=>document.documentElement.classList.contains('ui-icons-v2')),gear:await describe('[data-action=parent]'),coin:await describe('.status-value span'),chip:await describe('.status-value')};
 await capture('1-hub');const mb=await page.locator('.status-value').first().boundingBox();if(mb)await capture('1-hub-wallet',{x:Math.max(0,mb.x-60),y:Math.max(0,mb.y-16),width:Math.min(844-Math.max(0,mb.x-60),200),height:Math.min(390,mb.height+32)});
 await page.evaluate(()=>{window.__island.data.featureFlags.parentTransfer=true;const b=document.querySelector('[data-action=parent]');if(b)b.hidden=false;});
 const MORE=await center('[data-action=toggle-more]');if(MORE){await tapAt(MORE);await tick(300);report.hub.gear=await describe('[data-action=parent]');await capture('1-hub-more');const gb=report.hub.gear?.box;if(gb&&gb[2])await capture('1-hub-gear',{x:Math.max(0,gb[0]-80),y:Math.max(0,gb[1]-20),width:Math.min(844-Math.max(0,gb[0]-80),gb[2]+160),height:gb[3]+40});await tapAt(MORE);await tick(300);}
 if(HUB_ONLY){const on=mode!=='before';check(report.hub.on===on,`html.ui-icons-v2 is ${on?'set':'not set'}`);check((report.hub.coin?.icon??null)===(on?'coin':null)&&report.hub.gear?.icon===null&&report.hub.gear?.text==='⚙','top bar: the coin '+(on?'is the pack icon':'keeps the earlier character')+', the gear is unchanged');
  await writeFile(new URL(`../verification/ui-tennis-v25-0/${mode}-hub.json`,import.meta.url),JSON.stringify(report,null,1)+'\n');console.log(JSON.stringify(report));return report;}
 // ---------------------------------------------------------------- 2. Tennis
 await page.evaluate(ratio=>{const r=window.__island.data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>ratio);r.shadowEnabled=r.shadowEnabled.map(()=>false);},CLOSE?1:.6);
 await start('tennis',1);
 for(let i=0;i<600;i++){const m=await page.evaluate(()=>{const r=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(r&&(r.characterLoaded||r.mode==='canvas'));});if(m)break;await tick(100);await page.waitForTimeout(30);}
 for(let i=0;i<80;i++){const r=(await snap()).renderMetrics;if(r.motion?.loaded&&(mode==='before'||r.motion3?.on))break;await tick(100);await page.waitForTimeout(50);}
 await tick(800);let s=await snap();
 report.tennis={render:s.renderMetrics.mode,motion:s.renderMetrics.motion,motion3:s.renderMetrics.motion3};
 for(let k=0;k<200&&s.phase!=='serve';k++){await tick(50);s=await snap();}
 report.pauseButton=await describe('.game-header .game-pause');
 // No words on the play area: every visible text node inside the game screen, outside the score and the controls' own captions.
 report.textOnStage=await page.evaluate(()=>[...document.querySelectorAll('.game-screen .game-header .game-pause, .game-screen .shell-icon')].filter(n=>n.offsetParent&&parseFloat(getComputedStyle(n).fontSize)>0&&n.innerText.trim()).map(n=>n.innerText.trim()));
 await capture('2-tennis-serve');const pb=report.pauseButton?.box;if(pb)await capture('2-tennis-pause-button',{x:Math.max(0,pb[0]-60),y:0,width:Math.min(844-Math.max(0,pb[0]-60),pb[2]+120),height:pb[1]+pb[3]+40});
 const SV=await center('#pass'),H=await center('#shoot'),LOB=await center('#sprint'),DROP=await center('#drop'),ST={x:111,y:310};
 const clipAt=sc=>({x:Math.max(0,Math.min(844-260,sc[0]-130)),y:Math.max(0,Math.min(390-210,sc[1]-150)),width:260,height:210});
 const player=async()=>{const s=await snap(),r=s.renderMetrics;return {clip:r.motion?.clips?.[0]??null,hips:r.motion3?.hips?.[0]??0,screen:r.pose25?.[0]?.screen?.hips,opponent:r.motion?.clips?.[1]??null,tri:r.triangles};};
 await tapAt(SV);for(let k=0;k<200;k++){s=await snap();if(s.phase==='toss'&&s.serveZone==='green')break;await tick(16);}await tapAt(SV);
 const clips={},oppClips={},hipsMin=[0,0],tri=[];let swings=0,hits=0,lastEvent=null,caps={},stick=false,points=0,pointShots=0;const order=[H,LOB,DROP,H,H,LOB,DROP,H];
 const note=async label=>{const p=await player();if(p.clip)clips[p.clip]=(clips[p.clip]||0)+1;if(p.opponent)oppClips[p.opponent]=(oppClips[p.opponent]||0)+1;hipsMin[0]=Math.min(hipsMin[0],p.hips);if(p.tri)tri.push(p.tri);
  const key=label||p.clip;if(key&&p.screen&&(caps[key]||0)<(label?1:CLOSE?4:2)&&(label||/^v3:|^forehand|^backhand|^run/.test(key))){caps[key]=(caps[key]||0)+1;
   if(CLOSE){await page.evaluate(()=>{const g=window.__island.games.current.session,q=g.snapshot.players[0];g.debug.inspectCamera([q.x+5.6,2.3,q.z+3.6],[q.x,.85,q.z]);});await tick(16);await capture(`close-${String(key).replace(/[^a-z0-9_-]+/gi,'_')}-${caps[key]}`,{x:242,y:15,width:360,height:360});}
   else await capture(`3-${String(key).replace(/[^a-z0-9_-]+/gi,'_')}-${caps[key]}`,clipAt(p.screen));}return p;};
 for(let k=0;k<5200&&swings<10;k++){s=await snap();
  if(s.event?.id!==lastEvent){lastEvent=s.event?.id;if(s.event?.type==='hit'&&s.event.side===0&&!s.event.serving)hits++;}
  if(s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1){const dx=s.contact.x-s.players[0].x;
   if(Math.abs(dx)>.35){const p={x:ST.x+(dx>0?40:-40),y:ST.y,id:3};if(!stick)await touch('touchStart',[{...ST,id:3}]);await touch('touchMove',[p]);stick=true;}else if(stick){await touch('touchEnd',[]);stick=false;}
   if(s.contactWindow?.eligible){if(stick){await touch('touchEnd',[]);stick=false;}await tapAt(order[swings%order.length]);swings++;for(let j=0;j<8;j++){await tick(30);await note();}}}
  else if(stick){await touch('touchEnd',[]);stick=false;}
  if(['point','game'].includes(s.phase)){if(pointShots<3&&s.phaseTime>(CLOSE?.3+pointShots*.3:.55)){pointShots++;points++;await note(`point-${s.event?.winner===0?'won':'lost'}-${points}`);if(!CLOSE)await capture(`4-point-${points}`);}}else pointShots=Math.min(pointShots,0);
  if(s.phase==='serve'&&s.server===0){pointShots=0;await tapAt(SV);await tick(500);await tapAt(SV);}
  if(s.phase==='serve'&&s.server===1)pointShots=0;
  if(k%3===0)await note();
  await tick(16);if(s.phase==='complete')break;}
 if(stick)await touch('touchEnd',[]);
 s=await snap();
 report.rally={swings,hits,clips,opponentClips:oppClips,hipsLowest:hipsMin[0],triangles:tri.length?{min:Math.min(...tri),max:Math.max(...tri)}:null,score:s.score??null,audio:s.audioMetrics?.callouts??null,flipX:s.renderMetrics.motion3?.flipX};
 if(CLOSE){await page.evaluate(()=>window.__island.games.current.session.debug.inspectCamera(null));await tick(32);}else await capture('5-tennis-rally');
 // ---------------------------------------------------------------- 3. The pause sheet, by touch
 const P=await center('.game-header .game-pause');await tapAt(P);await tick(300);
 const sheet=async()=>({paused:await page.evaluate(()=>document.querySelector('.game-screen')?.dataset.paused),resume:await describe('[data-action=game-resume]'),sound:await describe('[data-action=game-pause-sound]'),exit:await describe('[data-action=game-exit]'),header:await describe('.game-header .game-pause')});
 report.pause={open:await sheet()};await capture('6-pause-sheet');
 const M=await center('[data-action=game-pause-sound]');await tapAt(M);await tick(200);report.pause.muted=await sheet();await capture('6-pause-sheet-muted');await tapAt(M);await tick(200);report.pause.unmuted=(await sheet()).sound;
 const R=await center('[data-action=game-resume]');await tapAt(R);await tick(400);report.pause.afterResume=await page.evaluate(()=>({paused:document.querySelector('.game-screen')?.dataset.paused,sheet:Boolean(document.querySelector('.game-pause-sheet'))}));
 report.requests=requests;
 // ---------------------------------------------------------------- Checks
 const on=mode!=='before';
 check(report.hub.on===on,`html.ui-icons-v2 is ${on?'set':'not set'}`);
 check((report.hub.coin?.icon??null)===(on?'coin':null)&&report.hub.gear?.icon===null&&report.hub.gear?.text==='⚙','top bar: the coin '+(on?'is the pack icon':'keeps the earlier character')+', the gear is unchanged');
 if(on)check(report.hub.coin.iconLoaded,'top bar icon decoded');
 check(Boolean(report.pauseButton)&&/pause\.svg/.test(report.pauseButton.beforeImage)===on,'pause button glyph '+(on?'is the pack icon':'is the drawn bars'));
 check(report.pauseButton?.fontSize==='0px'&&report.textOnStage.length===0,'the pause button carries no text of its own (its small caption is the earlier one, drawn by the kid-ux rule, the same in both modes)');
 check(String(report.pauseButton?.box)==='780,8,56,56','the pause button keeps its place and size (780,8 56x56)');
 check((report.pause.open.resume?.icon??null)===(on?'resume':null)&&(report.pause.open.sound?.icon??null)===(on?'sound':null)&&report.pause.open.exit?.icon===null,'pause sheet: resume and sound '+(on?'are the pack icons':'keep the drawn glyphs')+', exit keeps its glyph');
 check((report.pause.muted.sound?.icon??null)===(on?'mute':null)&&(report.pause.unmuted?.icon??null)===(on?'sound':null),'the sound button swaps between sound and mute by touch');
 check(report.pause.open.paused==='true'&&report.pause.afterResume.paused==='false'&&!report.pause.afterResume.sheet,'pause and resume by touch work');
 check(report.tennis.motion?.loaded===true&&report.tennis.motion3?.on===on,'motion v1 loaded, v3 '+(on?'loaded':'not loaded'));
 const v3Seen=Object.keys(clips).filter(k=>k.startsWith('v3:'));
 check(on?v3Seen.length>0:v3Seen.length===0,on?'v3 clips played: '+v3Seen.join(', '):'no v3 clip plays');
 check(on||report.rally.hipsLowest===0,'before: the hip height is never changed');
 check(swings>0&&hits>=swings-2,`the racket still meets the ball: ${hits} hits of ${swings} swings at an eligible contact`);
 check(requests.every(r=>r.status<400),'no failed request for the new files');
 check(on?requests.some(r=>r.path.includes('tennis-motion-v3/core.json')):!requests.some(r=>/tennis-motion-v3|ui-icons-v2/.test(r.path)),on?'the v3 clips were requested':'neither pack is requested when switched off');
 if(!CLOSE)await writeFile(new URL(`../verification/ui-tennis-v25-0/${mode}.json`,import.meta.url),JSON.stringify(report,null,1)+'\n');
 console.log(JSON.stringify(report));
 return report;
});
if(failures.length){console.error('FAILED',failures);process.exit(1);}
