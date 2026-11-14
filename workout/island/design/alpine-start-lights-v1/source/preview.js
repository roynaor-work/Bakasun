/* Standalone visual demo; no game engine, storage or network services. */
(() => {
 'use strict';
 const kit=window.ALPINE_KIT, $=id=>document.getElementById(id);
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const assets=new Map(kit.assets.map(a=>[a.id,a]));
 let size=512, playing=false,started=0,elapsed=0,raf=0;
 let state={phase:'ready',progress:0,speed:0,gateFrame:0,flagFrame:0,clock:0};
 const names={'start-lights':'אורות זינוק','start-gate':'שער זינוק','ready-sign':'שלט מוכנים','results-board':'לוח תוצאות','progress-rail':'מסילת התקדמות','progress-fill':'מילוי התקדמות','progress-marker':'סמן התקדמות','speedometer-base':'מד מהירות','speedometer-needle':'מחוג מהירות','finish-flag':'דגל סיום','countdown-disc':'לוח ספירה','decoration':'סמל הפסגה'};
 const texts={ready:'מוכנים לזינוק','red-1':'אדום ראשון — 3','red-2':'אדום שני — 2','red-3':'אדום שלישי — 1',green:'ירוק — צאו!',racing:'במסלול',finish:'הגעתם לסיום',results:'תוצאות המירוץ'};
 const src=id=>assets.get(id).variants.find(v=>v.width===size).file;
 function setImage(id,asset){const el=$(id),file=src(asset);if(el.getAttribute('src')!==file)el.src=file;}
 function stop(){playing=false;cancelAnimationFrame(raf);$('play').textContent='הפעלת ההדגמה';}
 function textRegion(parent,rect,text,className='',numeric=false){
  const el=document.createElement('span');el.className=`overlay ${className}`;
  Object.assign(el.style,{left:rect[0]/512*100+'%',top:rect[1]/512*100+'%',width:rect[2]/512*100+'%',height:rect[3]/512*100+'%'});
  el.dir=numeric?'ltr':'rtl';el.dataset.region=JSON.stringify(rect);el.textContent=text;parent.append(el);return el;
 }
 const resultAsset=assets.get('results-board'),regions=resultAsset.textRegions,resultsText=$('results-text');
 textRegion(resultsText,regions.title,'תוצאות המירוץ','results-title');
 ['Place','Name','Time'].forEach((key,i)=>textRegion(resultsText,regions['header'+key],['מקום','שם','זמן'][i],'results-header'));
 [['1','גולשת א׳','00:42.86'],['2','גולש ב׳','00:44.12'],['3','גולשת ג׳','00:45.39']].forEach((row,i)=>{
  const r=resultAsset.rows[i];textRegion(resultsText,r.place,row[0],'results-number',true);textRegion(resultsText,r.name,row[1],'results-name');textRegion(resultsText,r.time,row[2],'results-number',true);
 });
 $('asset-count').textContent=`${kit.assets.length} נכסים · ${kit.assets.length*2} תמונות שקופות`;
 for(const asset of kit.assets){
  const card=document.createElement('article');card.className='asset-card';card.dataset.asset=asset.id;
  const visual=document.createElement('div');visual.className='asset-visual';
  const img=new Image();img.src=src(asset.id);img.alt=names[asset.role];img.loading='lazy';img.decoding='async';visual.append(img);
  const info=document.createElement('div');info.className='asset-info';
  const h=document.createElement('h3');h.textContent=names[asset.role];
  const code=document.createElement('code');code.textContent=asset.id;
  const small=document.createElement('small');small.textContent=`עיגון: ${asset.anchor.join(', ')} · עד ${Math.ceil(Math.max(...asset.variants.map(v=>v.bytes))/1000)} ק״ב`;
  const links=document.createElement('div');links.className='asset-links';
  for(const v of asset.variants){const a=document.createElement('a');a.href=v.file;a.textContent=`${v.width} פיקסלים`;a.setAttribute('aria-label',`${names[asset.role]}, ${asset.id}, ${v.width} פיקסלים`);links.append(a);}
  info.append(h,code,small,links);card.append(visual,info);$('gallery').append(card);
 }
 function draw(){
  const p=Math.max(0,Math.min(1,state.progress)),speed=Math.max(0,Math.min(140,state.speed)),phase=state.phase;
  const isRed=phase.startsWith('red-'),isGo=phase==='green',isResult=phase==='results',isFinish=phase==='finish'||isResult;
  const lightState=isRed?phase:phase==='ready'?'idle':'green';
  setImage('lights',`start-lights-${lightState}`);$('lights').alt=`אורות זינוק: ${texts[phase]}`;
  let gateFrame=state.gateFrame;
  if(motion.matches)gateFrame=phase==='ready'||isRed?0:6;
  const gateAsset=kit.animations.gateOpen.frames[gateFrame].asset;
  setImage('gate',gateAsset);$('gate').alt=gateFrame===0?'שער זינוק סגור':gateFrame===6?'שער זינוק פתוח':'שער הזינוק נפתח';
  document.querySelector('.countdown').hidden=!(isRed||isGo);
  $('countdown').textContent=isGo?'צאו!':isRed?String(4-Number(phase.slice(-1))):'';
  $('countdown').classList.toggle('go',isGo);
  document.querySelector('.ready').hidden=phase!=='ready';
  document.querySelector('.flag').hidden=!isFinish;
  $('finish-message').hidden=phase!=='finish';$('results').hidden=!isResult;
  setImage('flag',kit.animations.finishFlag.frames[motion.matches?0:state.flagFrame].asset);
  const bottom=(512-419)/512*100,top=(419-294*p)/512*100;
  $('progress-fill').style.clipPath=`inset(${top}% 0 ${bottom}% 0)`;
  $('progress-marker').style.transform=`translateY(${(423-302*p-256)/512*100}%)`;
  const pct=Math.round(p*100);document.querySelector('.progress').setAttribute('aria-valuenow',pct);
  $('progress-label').textContent=pct+'%';$('progress').value=pct;$('progress-output').textContent=pct+'%';
  $('needle').style.transformOrigin='50% 58.59375%';$('needle').style.transform=`rotate(${-120+240*speed/140}deg)`;
  $('speed-value').textContent=Math.round(speed);document.querySelector('.speed').setAttribute('aria-label',`מהירות: ${Math.round(speed)} קילומטרים לשעה`);
  $('speed').value=Math.round(speed);$('speed-output').textContent=`${Math.round(speed)} קמ״ש`;
  const ms=Math.round(state.clock*100),minutes=Math.floor(ms/6000),seconds=Math.floor(ms/100)%60,hundredths=ms%100;
  $('clock').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(hundredths).padStart(2,'0')}`;
  if($('scene-status').textContent!==texts[phase])$('scene-status').textContent=texts[phase];
  $('state').value=phase;
 }
 function gateAt(ms){let t=0;for(let i=0;i<7;i++){t+=kit.animations.gateOpen.frames[i].durationMs;if(ms<t)return i;}return 6;}
 function applyTime(ms){
  let phase='ready',p=0,speed=0,gateFrame=0;
  if(ms<3000)phase=`red-${1+Math.floor(ms/1000)}`;
  else if(ms<3500){phase='green';gateFrame=gateAt(ms-3000);}
  else if(ms<10500){phase='racing';p=(ms-3500)/7000;speed=30+Math.sin(p*Math.PI)*65+p*15;gateFrame=6;}
  else{phase=ms<11600?'finish':'results';p=1;gateFrame=6;}
  state={phase,progress:p,speed,gateFrame,flagFrame:Math.floor(ms/120)%6,clock:Math.max(0,Math.min(42.86,(ms-3500)/7000*42.86))};draw();
 }
 function tick(now){elapsed=now-started;applyTime(elapsed);if(elapsed<12500)raf=requestAnimationFrame(tick);else stop();}
 $('play').addEventListener('click',()=>{
  if(playing){stop();return;}
  if(elapsed>=12500||state.phase==='ready')elapsed=0;
  playing=true;started=performance.now()-elapsed;$('play').textContent='השהיה';raf=requestAnimationFrame(tick);
 });
 $('reset').addEventListener('click',()=>{stop();elapsed=0;state={phase:'ready',progress:0,speed:0,gateFrame:0,flagFrame:0,clock:0};draw();});
 $('state').addEventListener('change',()=>{
  stop();const phase=$('state').value,p=phase==='racing'?.5:phase==='finish'||phase==='results'?1:0;
  state={phase,progress:p,speed:phase==='racing'?76:0,gateFrame:phase==='ready'||phase.startsWith('red-')?0:6,flagFrame:0,clock:p*42.86};draw();
 });
 $('progress').addEventListener('input',()=>{stop();state={...state,phase:'racing',gateFrame:6,progress:Number($('progress').value)/100,clock:Number($('progress').value)/100*42.86};draw();});
 $('speed').addEventListener('input',()=>{stop();state={...state,speed:Number($('speed').value)};draw();});
 $('surface').addEventListener('change',()=>document.querySelector('.scene').dataset.surface=$('surface').value);
 $('size').addEventListener('change',()=>{
  size=Number($('size').value);
  document.querySelectorAll('img[src*="png/"]').forEach(img=>img.src=img.getAttribute('src').replace(/png\/(512|1024)\//,`png/${size}/`));draw();
 });
 function motionChanged(){$('motion-note').hidden=!motion.matches;draw();}
 motion.addEventListener('change',motionChanged);motionChanged();
 // Compact deterministic inspection surface for the package's browser verification.
 window.alpinePreview={setTime(ms){stop();elapsed=ms;applyTime(ms);},getState:()=>({...state,size,reducedMotion:motion.matches})};
})();
