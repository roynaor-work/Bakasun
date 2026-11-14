/* Isolated demonstration only. No game imports, scoring, persistent storage or network services. */
(() => {
  'use strict';
  const manifest = JSON.parse(document.getElementById('fx-manifest').textContent);
  const assets = new Map(manifest.assets.map(a=>[a.id,a]));
  const $ = id=>document.getElementById(id);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {time:0,last:null,raf:0,paused:false,auto:false,nextAuto:0,autoIndex:0,serve:1,power:.42,height:1.2,ground:[447,242],charging:false,out:null,line:null,dust:null,sign:null,flight:null,format:'svg',dustIndex:null};
  const loaded = new Map();
  let ready = false;

  const pathFor = (id,format=state.format) => format==='svg'?assets.get(id).svg.path:assets.get(id).png[format].path;
  function setAsset(node,id) { if(node.dataset.asset!==id || !node.getAttribute('src')) { node.dataset.asset=id; node.src=pathFor(id); } }
  function place(node,x,y) { node.style.left=`${x}px`; node.style.top=`${y}px`; }
  function schedule() { if(!state.raf && !state.paused && !document.hidden) state.raf=requestAnimationFrame(tick); }
  function activity() {return state.auto||state.charging||state.out||state.line||state.dust||state.sign||state.flight;}
  function syncTime() { const now=performance.now(); if(state.last!==null&&!state.paused&&!document.hidden) state.time+=Math.max(0,now-state.last); state.last=now; }
  function interact(action) {syncTime(); action(); draw(); schedule();}
  function announce(text) { $('announcement').textContent=text; }
  function power(value) {state.power=Math.max(0,Math.min(1,Number(value)||0));$('power').value=state.power;const text=`${Math.round(state.power*100)}%`;$('power-readout').textContent=text;$('power-value').textContent=text;}
  function height(value) {state.height=Math.max(0,Math.min(3,Number(value)||0));$('height').value=state.height;$('height-readout').textContent=`${state.height.toFixed(1)} מ׳`;}
  function serve(index) {
    state.serve=Math.max(0,Math.min(2,index));
    setAsset($('serve-arrow'),manifest.effects.serve.states[state.serve].asset);
    $('serve-arrow').style.left=`${[333,422,511][state.serve]}px`;
    $('serve-readout').textContent=['שמאל','מרכז','ימין'][state.serve];
    $('move-left').disabled=state.serve===0;$('move-right').disabled=state.serve===2;
    document.querySelectorAll('[data-serve]').forEach(node=>{node.disabled=Number(node.dataset.serve)<0?state.serve===0:state.serve===2;});
  }
  function dust(x,y) { state.dust={at:state.time,x,y}; }
  function event(kind) {
    const at=state.time;
    if(kind==='out') {state.out={at,x:599,y:285};state.sign={at,kind:'out'};announce('אאוט');}
    if(kind==='line') {state.line={at,x:297,y:252};dust(297,252);announce('פגיעה בקו');}
    if(kind==='dust') {dust(458,269);announce('נחיתה על חימר');}
    if(kind==='net') {state.sign={at,kind:'net'};announce('נטו');}
    if(kind==='drop') {state.ground=[447,242];state.flight={at,duration:1100};announce('הדגמת דרופ');}
  }
  function draw() {
    const t=state.time;
    for(const [field,id,duration] of [['out','cross',1500],['line','ring',550],['dust','dust',motion.matches?180:360]]) {
      const node=$(id),fx=state[field];
      if(fx && t-fx.at>=duration) state[field]=null;
      node.hidden=!state[field];
      if(!state[field]) {if(field==='dust') state.dustIndex=null;continue;}
      place(node,fx.x,fx.y);
      if(field==='line') {const u=(t-fx.at)/duration;node.style.opacity=1-u;node.style.transform=motion.matches?'none':`scale(${.82+.3*u})`;}
      if(field==='dust') {const i=motion.matches?2:Math.min(5,Math.floor((t-fx.at)/60));state.dustIndex=i;setAsset(node,manifest.effects.clayDust.frames[i].asset);}
    }
    if(state.sign && t-state.sign.at>=1500) state.sign=null;
    $('event-sign').hidden=!state.sign;
    if(state.sign) {setAsset($('sign-art'),`sign-${state.sign.kind}`);$('sign-text').textContent=manifest.effects.signs[state.sign.kind].labelHe;}
    const y=222-190*state.power;
    $('power-fill').style.clipPath=`inset(${y/256*100}% 0 ${34/256*100}% 0)`;
    $('power-needle').style.transform=`translateY(${(y-128)*176/256}px)`;
    let h=state.height,bx=state.ground[0],by=state.ground[1];
    if(state.flight) {
      const u=Math.min(1,(t-state.flight.at)/state.flight.duration);
      bx=447+25*u;by=242+34*u;h=motion.matches?0:Math.sin(Math.PI*u)*(1.3+state.power);
      state.ground=[bx,by];
      if(u>=1) {state.flight=null;height(0);dust(bx,by);}
    }
    const lower=h<1.5?0:1,blend=(h-lower*1.5)/1.5;
    ['low','mid','high'].forEach((name,i)=>{const node=$(`shadow-${name}`);place(node,bx,by);node.style.opacity=i===lower?1-blend:i===lower+1?blend:0;});
    place($('ball'),bx,by-h*28);
    $('drop-hold').classList.toggle('charging',state.charging);
  }
  function tick(now) {
    state.raf=0;
    if(state.paused||document.hidden) {state.last=null;return;}
    const elapsed=state.last===null?0:Math.max(0,now-state.last);state.time+=elapsed;state.last=now;
    if(state.charging) power((state.power+elapsed*.00065)%1);
    if(state.auto && state.time>=state.nextAuto) {
      const actions=[()=>serve(0),()=>serve(1),()=>serve(2),()=>event('out'),()=>event('line'),()=>event('dust'),()=>event('net'),()=>event('drop')];
      actions[state.autoIndex++%actions.length]();state.nextAuto=state.time+1800;
    }
    draw();
    if(activity()) schedule(); else state.last=null;
  }
  function pause(value) {
    syncTime();state.paused=value;
    if(value) {cancelAnimationFrame(state.raf);state.raf=0;state.last=null;}
    $('pause').setAttribute('aria-pressed',String(value));$('pause').setAttribute('aria-label',value?'המשך ההדגמה':'השהיית ההדגמה');$('pause').dataset.paused=String(value);
    document.querySelectorAll('[data-pause]').forEach(node=>{node.setAttribute('aria-pressed',String(value));node.textContent=value?'המשך':'השהיה';});
    if(!value) {state.last=null;schedule();}
  }
  function stopCharge() {if(!state.charging)return;interact(()=>{state.charging=false;event('drop');});}
  function fit() {const shell=document.querySelector('.stage-shell');document.querySelector('.stage').style.transform=`scale(${shell.clientWidth/844})`;}

  for(const [i,frame] of manifest.effects.clayDust.frames.entries()) {
    const figure=document.createElement('figure'),img=new Image(96,96),caption=document.createElement('figcaption');img.dataset.asset=frame.asset;img.alt=`אבק חימר, פריים ${i+1} מתוך 6`;caption.textContent=String(i+1).padStart(2,'0');figure.append(img,caption);$('filmstrip').append(figure);
  }
  for(const value of [.2,.42,.85]) {
    const sample=document.createElement('div');sample.className='meter-example';
    ['track','fill','needle'].forEach(type=>{const img=new Image(128,128);img.alt='';img.dataset.asset=`drop-meter-${type}`;if(type==='fill')img.style.clipPath=`inset(${(222-190*value)/256*100}% 0 ${34/256*100}% 0)`;if(type==='needle')img.style.transform=`translateY(${(222-190*value-128)*.5}px)`;sample.append(img);});
    const label=document.createElement('output');label.textContent=`${Math.round(value*100)}%`;sample.append(label);$('meter-samples').append(sample);
  }
  async function preload(format) {
    if(loaded.has(format)) return loaded.get(format);
    const task=Promise.all(manifest.assets.map(a=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error(`Cannot load ${a.id} (${format})`));img.src=pathFor(a.id,format);})));
    loaded.set(format,task);return task;
  }
  async function format(value) {
    $('format').disabled=true;
    try {await preload(value);state.format=value;document.querySelectorAll('img[data-asset]').forEach(node=>{node.src=pathFor(node.dataset.asset);});}
    finally {$('format').disabled=false;}
  }
  document.querySelectorAll('[data-event]').forEach(button=>button.addEventListener('click',()=>interact(()=>event(button.dataset.event))));
  $('move-left').addEventListener('click',()=>interact(()=>serve(state.serve-1)));
  $('move-right').addEventListener('click',()=>interact(()=>serve(state.serve+1)));
  document.querySelectorAll('[data-serve]').forEach(node=>node.addEventListener('click',()=>interact(()=>serve(state.serve+Number(node.dataset.serve)))));
  document.querySelectorAll('[data-pause]').forEach(node=>node.addEventListener('click',()=>pause(!state.paused)));
  document.querySelectorAll('[data-drop]').forEach(node=>node.addEventListener('click',()=>interact(()=>event('drop'))));
  document.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();interact(()=>serve(state.serve+(e.key==='ArrowLeft'?-1:1)));}});
  $('pause').addEventListener('click',()=>pause(!state.paused));
  $('auto').addEventListener('click',()=>interact(()=>{state.auto=!state.auto;state.nextAuto=state.time;$('auto').setAttribute('aria-pressed',String(state.auto));}));
  $('height').addEventListener('input',e=>interact(()=>{state.flight=null;state.ground=[447,242];height(e.target.value);}));
  $('power').addEventListener('input',e=>interact(()=>power(e.target.value)));
  $('format').addEventListener('change',e=>format(e.target.value).catch(error=>announce(error.message)));
  $('drop-hold').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();$('drop-hold').setPointerCapture(e.pointerId);interact(()=>{state.charging=true;});});
  $('drop-hold').addEventListener('pointerup',stopCharge);
  $('drop-hold').addEventListener('pointercancel',()=>interact(()=>{state.charging=false;}));
  $('drop-hold').addEventListener('lostpointercapture',()=>interact(()=>{state.charging=false;}));
  $('drop-hold').addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)interact(()=>{state.charging=true;});}});
  $('drop-hold').addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stopCharge();}});
  $('drop-hold').addEventListener('blur',()=>interact(()=>{state.charging=false;}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;state.last=null;state.charging=false;}else{state.last=null;schedule();}});
  motion.addEventListener('change',()=>interact(()=>{}));
  new ResizeObserver(fit).observe(document.querySelector('.stage-shell'));
  fit();
  document.querySelectorAll('img[data-asset]').forEach(node=>setAsset(node,node.dataset.asset));
  serve(1);power(.42);height(1.2);draw();
  preload('svg').then(()=>{ready=true;document.documentElement.dataset.ready='true';}).catch(error=>announce(error.message));

  // Read-only inspection for browser validation. No hidden command or mutation API.
  window.tennisFxSnapshot=()=>({ready,time:state.time,paused:state.paused,serve:state.serve,power:state.power,height:state.height,dustFrame:state.dustIndex,format:state.format,reducedMotion:motion.matches,active:{out:!!state.out,line:!!state.line,dust:!!state.dust,sign:!!state.sign,flight:!!state.flight},rafActive:!!state.raf});
})();
