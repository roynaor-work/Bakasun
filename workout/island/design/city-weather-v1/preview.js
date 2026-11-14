/* Standalone asset review. No imports from, or writes to, the live application. */
(() => {
  'use strict';
  const M = window.CITY_WEATHER_MANIFEST;
  const canvas = document.querySelector('#scene');
  const ctx = canvas.getContext('2d');
  const stage = document.querySelector('#stage');
  const status = document.querySelector('#load-status');
  const W = 844, H = 390;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const images = {}, crops = new Map(), cityTints = new Map();
  const state = {scene:'sunset',rainIntensity:'medium',firework:'peony-gold',color:'all',
    clouds:true,birds:true,butterflies:true,balloons:false,confetti:false,
    paused:reducedMotion.matches,time:0,reducedMotion:reducedMotion.matches,ready:false};
  let previous = null, animationFrame = 0, burstAt = -100;
  const scenes = {
    clear:['יום על האי','רוח מהים, תנועה קלה ואור של בוקר.'],
    rain:['טיפות על העיר','גשם רך מעל הגגות. שלוש עוצמות לבחירה.'],
    snow:['רגע של חורף','פתיתים שקטים בגוני פנינה ושמנת.'],
    fog:['בין ים לענן','שכבת אובך עדינה ששומרת על קריאות העיר.'],
    sunset:['שעה של זהב','אור חם, עננים רכים ועיר שנושמת.'],
    night:['כשהעיר חולמת','שמים עמוקים וכוכבים באור עדין.'],
    celebration:['יש סיבה לחגוג','זיקוקים, בלונים וקונפטי בצבעי העיר.']
  };

  function load(file) {
    return new Promise((resolve,reject) => {
      const im = new Image();im.onload=()=>resolve(im);
      im.onerror=()=>reject(new Error(`לא ניתן לטעון: ${file}`));im.src=file;
    });
  }
  function frame(id,t=state.time,offset=0) {
    const effect=M.effects[id];
    const index=effect.fps ? Math.floor((t+offset)*effect.fps)%effect.frames.length : 0;
    return effect.frames[(index+effect.frames.length)%effect.frames.length];
  }
  function sprite(id,x,y,w,h,t=state.time,offset=0,alpha=1,index=null,target=ctx) {
    const e=M.effects[id], f=index===null?frame(id,t,offset):e.frames[index];
    const [sx,sy,sw,sh]=f.rect;
    target.save();target.globalAlpha=alpha;
    target.drawImage(images[e.atlas],sx,sy,sw,sh,x,y,w,h);target.restore();
  }
  function tile(id,t,w,h,alpha=1,target=ctx,index=null) {
    const f=index===null?frame(id,t):M.effects[id].frames[index];
    if(!crops.has(f.id)) {
      const c=document.createElement('canvas');c.width=f.rect[2];c.height=f.rect[3];
      c.getContext('2d').drawImage(images[M.effects[id].atlas],...f.rect,0,0,c.width,c.height);
      crops.set(f.id,c);
    }
    target.save();target.globalAlpha=alpha;
    for(let y=0;y<H;y+=h)for(let x=0;x<W;x+=w)target.drawImage(crops.get(f.id),x,y,w,h);
    target.restore();
  }
  function cityTint(mode) {
    if(!cityTints.has(mode)) {
      const c=document.createElement('canvas');c.width=W;c.height=H;const d=c.getContext('2d');
      d.drawImage(images.city,0,0);d.globalCompositeOperation='source-atop';
      d.fillStyle=mode==='night'?'#173c59a8':mode==='sunset'?'#d7a06b37':mode==='rain'?'#46667740':'#fff4dc00';
      d.fillRect(0,0,W,H);cityTints.set(mode,c);
    }
    return cityTints.get(mode);
  }
  const haze=document.createElement('canvas');haze.width=W;haze.height=H;
  const hazeContext=haze.getContext('2d');
  function fog(t) {
    const e=M.effects.fog,progress=t*e.fps,i=Math.floor(progress)%e.frames.length,f=progress%1;
    hazeContext.clearRect(0,0,W,H);
    tile('fog',t,844,210,(1-f),hazeContext,i);
    tile('fog',t,844,210,f,hazeContext,(i+1)%e.frames.length);
    hazeContext.globalCompositeOperation='destination-in';
    const mask=hazeContext.createLinearGradient(0,0,0,H);
    mask.addColorStop(0,'#ffffff00');mask.addColorStop(.28,'#ffffff00');mask.addColorStop(.54,'#ffffffee');mask.addColorStop(1,'#ffffffff');
    hazeContext.fillStyle=mask;hazeContext.fillRect(0,0,W,H);
    hazeContext.globalCompositeOperation='source-over';ctx.drawImage(haze,0,0);
  }

  function draw(t) {
    if(!state.ready)return;
    const night=['night','celebration'].includes(state.scene);
    ctx.clearRect(0,0,W,H);
    if(night||state.scene==='sunset')sprite(night?'sky-night':'sky-sunset',0,0,W,H);
    else {
      const sky=ctx.createLinearGradient(0,0,0,H);
      sky.addColorStop(0,state.scene==='rain'?'#9bb8b9':'#a7cdce');
      sky.addColorStop(1,'#f0e8cc');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    }
    if(night)tile('stars',t,252,252,.72);
    if(state.clouds)for(let i=0;i<3;i++) {
      const x=((i*295+45+t*(4+i*1.4))%1090)-160;
      sprite(`cloud-${i+1}`,x,61+i%2*28,182+i*14,91+i*7,t,0,night?.26:.8);
    }
    // A preview-only sea plane. The real runtime retains its authored 3D water.
    const sea=ctx.createLinearGradient(0,145,0,H);
    sea.addColorStop(0,night?'#3a646e00':'#69a8a700');
    sea.addColorStop(.2,night?'#244c57b8':'#75b4adad');
    sea.addColorStop(1,night?'#153b48':'#7abbb0');
    ctx.fillStyle=sea;ctx.fillRect(0,145,W,H);
    ctx.save();ctx.strokeStyle=night?'#9bb6ad12':'#fff4dc2c';ctx.lineWidth=.8;
    for(let i=0;i<26;i++) {
      const x=(i*79+t*3)%W,y=195+(i*47)%175;
      ctx.beginPath();ctx.ellipse(x,y,9+i%3*5,1.2,0,0,Math.PI);ctx.stroke();
    }
    ctx.restore();
    ctx.drawImage(cityTint(night?'night':state.scene==='sunset'?'sunset':state.scene==='rain'?'rain':'clear'),0,-13);
    if(state.birds&&!night)for(let i=0;i<4;i++) {
      const x=(t*(14+i*2)+i*143+75)%1060-90;
      sprite('birds',x,100+i%2*26+Math.sin(t*.6+i)*5,35+i%2*7,35+i%2*7,t,i*.17,.85);
    }
    if(state.butterflies&&!night)for(let i=0;i<3;i++) {
      const color=['coral','gold','teal'][i];
      sprite(`butterflies-${color}`,212+i*198+Math.sin(t*.6+i*2)*23,218+Math.sin(t*.9+i)*22,27,27,t,i*.18);
    }
    if(!state.reducedMotion) {
      const elapsed=t-burstAt;
      const auto=state.scene==='celebration'?(t%3.3):100;
      const age=elapsed>=0&&elapsed<1?elapsed:auto;
      if(age<1)sprite(`fireworks-${state.firework}`,190,40,220,220,t,0,1,Math.min(11,Math.floor(age*12)));
    }
    if(state.scene==='fog')fog(t);
    if(state.scene==='rain')tile(`rain-${state.rainIntensity}`,t,186,186,M.effects[`rain-${state.rainIntensity}`].recommendedOpacity);
    if(state.scene==='snow')tile('snow',t,186,186,.8);
    const colors=state.color==='all'?['coral','gold','teal']:[state.color];
    if(state.balloons)for(let i=0;i<6;i++) {
      const color=colors[i%colors.length];
      const y=state.reducedMotion?110+i%3*35:335-((t*18+i*48)%430);
      sprite(`balloons-${color}`,82+i*134+Math.sin(t+i)*7,y,55,69,t,i*.2,.96);
    }
    if(state.confetti&&!state.reducedMotion)for(let i=0;i<24;i++) {
      const color=colors[i%colors.length],x=(i*79+Math.sin(t+i)*18)%W,y=(t*56+i*53)%470-60;
      sprite(`confetti-${color}`,x,y,39,39,t,i*.12,.9);
    }
  }

  function sync() {
    const dark=['night','celebration'].includes(state.scene);
    stage.dataset.dark=String(dark);
    document.querySelector('#scene-title').textContent=scenes[state.scene][0];
    document.querySelector('#scene-description').textContent=scenes[state.scene][1];
    document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===state.scene)));
    for(const name of ['clouds','birds','butterflies','balloons','confetti'])document.getElementById(name).checked=state[name];
    document.querySelector('#rain-intensity').value=state.rainIntensity;
    document.querySelector('#firework').value=state.firework;
    document.querySelector('#celebration-color').value=state.color;
    document.querySelector('#pause').setAttribute('aria-pressed',String(state.paused));
    document.querySelector('#pause').textContent=state.paused?'ניגון':'השהיה';
  }
  function setScene(name) {
    if(!scenes[name])throw new Error(`Unknown scene: ${name}`);
    state.scene=name;state.balloons=state.confetti=name==='celebration';sync();draw(state.time);
  }
  function setOptions(options) {
    const permitted=['rainIntensity','firework','color','clouds','birds','butterflies','balloons','confetti'];
    for(const [k,v] of Object.entries(options)) {
      if(!permitted.includes(k))throw new Error(`Unknown option: ${k}`);
      if(k==='rainIntensity'&&!['light','medium','heavy'].includes(v))throw new Error('Unknown rain intensity');
      if(k==='firework'&&!M.effects[`fireworks-${v}`])throw new Error('Unknown firework');
      if(k==='color'&&!['all','coral','gold','teal'].includes(v))throw new Error('Unknown color');
      state[k]=v;
    }
    sync();draw(state.time);
  }
  function pause(on=true){state.paused=on;previous=null;sync();}
  function schedule() {
    if(animationFrame||document.hidden||!state.ready)return;
    animationFrame=requestAnimationFrame(tick);
  }
  function tick(now) {
    animationFrame=0;
    if(!state.paused&&previous!==null)state.time+=Math.min(.08,(now-previous)/1000);
    previous=now;draw(state.time);
    if(!state.paused)schedule();
  }
  function fit() {
    const scale=Math.min(innerWidth/W,innerHeight/H,1);
    const box=document.querySelector('#viewport');box.style.width=`${W*scale}px`;box.style.height=`${H*scale}px`;
    stage.style.transform=`scale(${scale})`;
  }

  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>setScene(b.dataset.scene)));
  document.querySelector('#pause').addEventListener('click',()=>{pause(!state.paused);draw(state.time);schedule();});
  document.querySelector('#customize').addEventListener('click',()=>{
    const panel=document.querySelector('#settings');panel.hidden=!panel.hidden;
    document.querySelector('#customize').setAttribute('aria-expanded',String(!panel.hidden));
  });
  function closeSettings(){document.querySelector('#settings').hidden=true;document.querySelector('#customize').setAttribute('aria-expanded','false');}
  document.querySelector('#close-settings').addEventListener('click',closeSettings);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSettings();document.querySelector('#customize').focus();}});
  document.querySelector('#rain-intensity').addEventListener('change',e=>{setOptions({rainIntensity:e.target.value});setScene('rain');});
  document.querySelector('#firework').addEventListener('change',e=>{setOptions({firework:e.target.value});setScene('celebration');state.time=.48;draw(state.time);});
  document.querySelector('#celebration-color').addEventListener('change',e=>setOptions({color:e.target.value}));
  for(const name of ['clouds','birds','butterflies','balloons','confetti'])document.getElementById(name).addEventListener('change',e=>setOptions({[name]:e.target.checked}));
  document.querySelector('#burst').addEventListener('click',()=>{
    burstAt=state.time;if(state.paused&&!state.reducedMotion)pause(false);draw(state.time);schedule();
  });
  document.addEventListener('visibilitychange',()=>{previous=null;if(document.hidden){cancelAnimationFrame(animationFrame);animationFrame=0;}else schedule();});
  reducedMotion.addEventListener('change',e=>{state.reducedMotion=e.matches;pause(e.matches);draw(state.time);schedule();});
  addEventListener('resize',fit);fit();sync();

  const api={getState:()=>({...state}),setScene,setOptions,
    renderAt(seconds){pause(true);state.time=seconds;draw(seconds);},
    pause(){pause(true);},play(){pause(false);schedule();},
    get manifest(){return M;},get pendingAnimationFrame(){return animationFrame;}};
  window.cityWeatherPreview=api;
  api.ready=(async()=>{
    if(!M)throw new Error('חסר preview-data.js; יש להריץ את source/build.py.');
    await Promise.all(Object.entries(M.atlases).map(async([id,a])=>{images[id]=await load(a.file);}));
    images.city=await load(M.preview.cityReference);
    state.ready=true;status.hidden=true;draw(0);schedule();return api;
  })().catch(error=>{status.classList.add('error');status.textContent=error.message;console.error(error);throw error;});
})();
