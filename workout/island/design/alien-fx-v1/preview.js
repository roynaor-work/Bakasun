// SPDX-License-Identifier: CC0-1.0 — original standalone asset audition UI.
(() => {
  'use strict';
  const $=id=>document.getElementById(id), {textures,sounds}=window.ALIEN_FX;
  const names={'cannon-regular':'להבת תותח','vulcan-burst':'פרץ וולקן','heat-bar':'מד חום','heat-icon':'אייקון חום','overheat-shutdown':'כיבוי בחום יתר','alien-impact':'ניצוצות פגיעה','alien-explosion':'פיצוץ חייזר','boss-explosion':'פיצוץ בוס','shield-ring':'טבעת מגן',overheat:'התחממות יתר'};
  const images=new Map(), defs=new Map(textures.map(d=>[d.id,d]));
  const durations=d=>d.frameDurationsMs.reduce((a,b)=>a+b,0);
  function indexAt(d,ms) {let sum=0;for(let i=0;i<d.frameCount;i++){sum+=d.frameDurationsMs[i];if(ms<sum)return i;}return d.frameCount-1;}
  function draw(ctx,id,i,x,y,w,h) {
    const d=defs.get(id),img=images.get(id),f=d.frames[Math.min(i,d.frameCount-1)];
    if(img)ctx.drawImage(img,f.x,f.y,f.w,f.h,x,y,w,h);
  }
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches, clock=0,last=0,ready=false;
  function pauseUI(){ $('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'הפעלת אנימציה':'עצירת אנימציה'; }
  pauseUI();$('pause').onclick=()=>{paused=!paused;pauseUI();};
  const cards=[];
  for(const d of textures.filter(d=>d.id!=='heat-icon')) {
    const card=document.createElement('article');card.className='effect-card';
    const canvas=document.createElement('canvas');canvas.width=280;canvas.height=160;canvas.setAttribute('aria-label',names[d.id]);
    const info=document.createElement('div');info.className='effect-info';
    const title=document.createElement('strong');title.textContent=names[d.id];const spec=document.createElement('small');spec.textContent=d.frameCount===1?'256 × 32':`${d.frameCount} פריימים`;if(d.frameCount===1)spec.dir='ltr';
    info.append(title,spec);card.append(canvas,info);$('gallery').append(card);cards.push({d,ctx:canvas.getContext('2d')});
    const option=document.createElement('option');option.value=d.id;option.textContent=names[d.id];$('inspect').append(option);
  }
  function inspect(){
    const d=defs.get($('inspect').value);$('frame').max=d.frameCount-1;
    $('frame').value=Math.min(Number($('frame').value),d.frameCount-1);const i=Number($('frame').value);
    $('frame-number').value=`${i+1} / ${d.frameCount}`;$('frame-number').dir='ltr';$('atlas-link').href=d.path;
    const ctx=$('detail').getContext('2d');ctx.clearRect(0,0,480,300);
    const s=Math.min(400/d.frameWidth,260/d.frameHeight,2.1);draw(ctx,d.id,i,(480-d.frameWidth*s)/2,(300-d.frameHeight*s)/2,d.frameWidth*s,d.frameHeight*s);
  }
  $('inspect').onchange=()=>{$('frame').value=0;inspect();};$('frame').oninput=inspect;
  let soundOn=false,shieldOn=true;const activeAudio=new Set();
  async function play(id,format=null,audition=false){
    if(!soundOn&&!audition)return;
    const d=sounds.find(s=>s.id===id);const a=new Audio();
    const preferred=format?d.variants.find(v=>v.path.endsWith('.'+format)):d.variants.find(v=>a.canPlayType(v.mimeType));
    if(!preferred){$('audio-status').textContent='הדפדפן אינו תומך בפורמט הנבחר.';return;}
    if(activeAudio.size>=4){const old=activeAudio.values().next().value;old.pause();activeAudio.delete(old);}
    a.src=preferred.path;a.volume=audition?.75:.45;activeAudio.add(a);
    a.onended=()=>{activeAudio.delete(a);if(audition)$('audio-status').textContent='הניגון הסתיים.';};
    try{await a.play();if(audition)$('audio-status').textContent=`מנגנים: ${names[id]} · ${preferred.codec.toUpperCase()}`;}
    catch{activeAudio.delete(a);$('audio-status').textContent='לא ניתן לנגן בפורמט הזה. אפשר לנסות את הפורמט השני.';}
  }
  $('sound').onclick=()=>{soundOn=!soundOn;$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').textContent=soundOn?'צליל פעיל':'צליל כבוי';if(!soundOn)for(const a of activeAudio){a.pause();activeAudio.delete(a);}};
  $('shield').onclick=()=>{shieldOn=!shieldOn;$('shield').setAttribute('aria-pressed',String(shieldOn));$('shield').textContent=shieldOn?'מגן פעיל':'מגן כבוי';};
  for(const [j,d] of sounds.entries()) {
    const card=document.createElement('article');card.className='sound-card';
    const top=document.createElement('div');top.className='sound-top';const name=document.createElement('strong');name.textContent=names[d.id];const length=document.createElement('span');length.textContent=`${d.durationSeconds} שניות`;top.append(name,length);
    const wave=document.createElement('div');wave.className='wave';wave.setAttribute('aria-hidden','true');for(let i=0;i<40;i++){const b=document.createElement('i');b.style.height=(4+25*Math.abs(Math.sin(i*1.3+j))*(1-i/55))+'px';wave.append(b);}
    const buttons=document.createElement('div');buttons.className='sound-buttons';for(const ext of ['ogg','mp3']){const button=document.createElement('button');button.textContent='ניגון '+ext.toUpperCase();button.setAttribute('aria-label',`ניגון ${names[d.id]} בפורמט ${ext}`);button.onclick=()=>{for(const a of activeAudio){a.pause();activeAudio.delete(a);}play(d.id,ext,true);};buttons.append(button);}card.append(top,wave,buttons);$('sounds').append(card);
  }
  let heat=0,cooldown=0,holding=false,nextBurst=0,shutdownStart=-1;
  const effects=[];
  function effect(id,x,y,size){effects.push({id,x,y,size,start:performance.now()});if(effects.length>18)effects.shift();}
  function regular(){if(!ready)return;effect('cannon-regular',480,386,92);setTimeout(()=>{effect('alien-impact',480,120,96);},160);$('status').textContent='פגיעה מדויקת';}
  function burst(now){effect('vulcan-burst',480,386,125);effect('alien-impact',480,125,98);play('vulcan-burst');nextBurst=now+500;$('status').textContent='וולקן בפעולה';}
  function stopHold(){holding=false;$('vulcan').removeAttribute('data-held');}
  $('regular').onclick=regular;
  $('vulcan').onpointerdown=e=>{if(!ready||cooldown>0)return;e.preventDefault();$('vulcan').setPointerCapture(e.pointerId);holding=true;nextBurst=0;};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])$('vulcan').addEventListener(event,stopHold);
  $('vulcan').onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(ready&&!cooldown)holding=true;}};
  $('vulcan').onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stopHold();}};
  $('vulcan').onblur=stopHold;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHold();last=0;}});window.addEventListener('blur',stopHold);
  $('boss').onclick=()=>{if(!ready)return;effect('boss-explosion',480,145,300);play('boss-explosion');$('status').textContent='גל הלם של בוס';};
  const stage=$('stage').getContext('2d'), heatCtx=$('heat').getContext('2d');
  function ship(ctx,x,y,enemy=false){ctx.save();ctx.translate(x,y);ctx.scale(enemy?1.1:1,enemy?-1:1);ctx.fillStyle='#183244';ctx.beginPath();ctx.ellipse(0,33,70,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=enemy?'#caa9ff':'#94e9d9';ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(59,32);ctx.lineTo(20,24);ctx.lineTo(0,38);ctx.lineTo(-20,24);ctx.lineTo(-59,32);ctx.closePath();ctx.fill();ctx.strokeStyle=enemy?'#e5d5ff':'#d6fff3';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#edf8dc';ctx.beginPath();ctx.moveTo(0,-32);ctx.lineTo(16,21);ctx.lineTo(-16,21);ctx.closePath();ctx.fill();ctx.fillStyle='#2e7092';ctx.beginPath();ctx.ellipse(0,0,11,18,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c4f6ff';ctx.beginPath();ctx.ellipse(-3,-5,3,7,.2,0,Math.PI*2);ctx.fill();ctx.restore();}
  function animate(now){
    requestAnimationFrame(animate);if(!ready||document.hidden)return;
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(!paused)clock+=dt*1000;
    if(holding&&cooldown===0){heat=Math.min(100,heat+dt*46);if(now>=nextBurst)burst(now);if(heat>=100){cooldown=3;stopHold();shutdownStart=now;play('overheat');$('status').textContent='חם מדי. מתקררים לרגע';}}
    else heat=Math.max(0,heat-dt*(cooldown>0?34:22));
    if(cooldown>0){cooldown=Math.max(0,cooldown-dt);if(cooldown===0)$('status').textContent='הוולקן מוכן שוב';}
    $('vulcan').disabled=cooldown>0;$('vulcan').setAttribute('aria-label',cooldown>0?'הוולקן מתקרר':'וולקן, לחיצה ממושכת לירי');
    $('heat').setAttribute('aria-valuenow',String(Math.round(heat)));$('heat-label').textContent=cooldown>0?'מתקררים…':heat>75?'הוולקן מתחמם':'הוולקן מוכן';
    stage.clearRect(0,0,960,520);ship(stage,480,120,true);ship(stage,480,420);
    if(shieldOn)draw(stage,'shield-ring',indexAt(defs.get('shield-ring'),clock%800),390,330,180,180);
    for(let i=effects.length-1;i>=0;i--){const e=effects[i],d=defs.get(e.id),age=now-e.start;if(age>=durations(d)){effects.splice(i,1);continue;}const w=e.size,h=e.size*d.frameHeight/d.frameWidth;draw(stage,e.id,indexAt(d,age),e.x-w*d.pivot[0],e.y-h*d.pivot[1],w,h);}
    heatCtx.clearRect(0,0,256,32);
    if(shutdownStart>=0&&now-shutdownStart<1200)draw(heatCtx,'overheat-shutdown',Math.floor((now-shutdownStart)/200),0,0,256,32);
    else {draw(heatCtx,'heat-bar',0,0,0,256,32);heatCtx.fillStyle='#243e52';heatCtx.fillRect(38+208*heat/100,8,208*(1-heat/100),16);heatCtx.fillStyle='#152c3b';heatCtx.fillRect(106,9,2,14);heatCtx.fillRect(175,9,2,14);}
    for(const {d,ctx} of cards){ctx.clearRect(0,0,280,160);const duration=durations(d),age=duration?clock%(duration+(d.loop?0:700)):0;const peak=Math.floor(d.frameCount*.34),i=duration?((age>=duration||(paused&&clock===0))?peak:indexAt(d,age)):0;let s=Math.min(252/d.frameWidth,142/d.frameHeight);if(d.id==='alien-explosion')s=1.15;draw(ctx,d.id,i,(280-d.frameWidth*s)/2,(160-d.frameHeight*s)/2,d.frameWidth*s,d.frameHeight*s);}
  }
  $('regular').disabled=$('vulcan').disabled=$('boss').disabled=true;
  Promise.all(textures.map(d=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(d.id,img);resolve();};img.onerror=()=>reject(new Error(d.path));img.src=d.path;})))
    .then(()=>{ready=true;$('regular').disabled=$('vulcan').disabled=$('boss').disabled=false;$('load-status').textContent='כל האפקטים נטענו.';inspect();})
    .catch(e=>{$('load-status').dataset.error='true';$('load-status').textContent=`לא ניתן לטעון: ${e.message}. יש לשמור את התיקייה בשלמותה.`;});
  requestAnimationFrame(animate);
})();
