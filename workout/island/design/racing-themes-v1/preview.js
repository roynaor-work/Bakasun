/* Asset-only Canvas2D composition; no gameplay, storage, CDN or WebGL dependency. */
(() => {
  'use strict';
  const manifest=window.RACING_THEMES_MANIFEST;
  const canvas=document.getElementById('scene'),ctx=canvas.getContext('2d',{alpha:false});
  const W=844,H=390,HORIZON=182;
  const loading=document.getElementById('loading'),motion=document.getElementById('motion');
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const state={id:'city-night',playing:false,time:0,mode:'scene',layers:{far:true,middle:true,near:true},loaded:false};
  let theme,images=new Map(),raf=0,previous=0,loadToken=0,wantsMotion=!reduceMotion.matches;
  const cache=new Map();
  const modulo=(x,n)=>((x%n)+n)%n;
  const assetList=t=>[t.sky,...t.layers,...Object.values(t.road),t.barrier,t.propAtlas];
  const img=a=>images.get(a.file);
  const loadImage=file=>{
    if(!cache.has(file)) cache.set(file,new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);
      image.onerror=()=>{cache.delete(file);reject(new Error(`לא ניתן לטעון: ${file}`));};image.src=file;
    }));
    return cache.get(file);
  };

  function metadata(){
    document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme.id)));
    document.getElementById('theme-name').textContent=theme.name;
    document.getElementById('subtitle').textContent=theme.subtitle;
    document.getElementById('eyebrow').textContent=`0${manifest.themes.indexOf(theme)+1} / ${['NIGHT CITY','DESERT','SNOW','COAST'][manifest.themes.indexOf(theme)]}`;
    document.getElementById('weight').textContent=`${(theme.totalBytes/1000).toFixed(1)}KB מתוך 600KB · 10 תמונות · 6 אביזרים`;
    document.getElementById('swatches').replaceChildren();
    for(const [label,color] of [['שמיים',theme.palette.skyTop],['אופק',theme.palette.skyHorizon],['אור ראשי',theme.lighting.sun.color],['אור משלים',theme.lighting.rim.color]]){
      const swatch=document.createElement('span');swatch.className='swatch';
      const chip=document.createElement('i');chip.style.background=color;chip.setAttribute('aria-hidden','true');
      swatch.append(chip,document.createTextNode(label));document.getElementById('swatches').append(swatch);
    }
    document.getElementById('prop-list').replaceChildren(...theme.props.map(p=>{
      const item=document.createElement('div');item.className='prop';item.textContent=p.label;return item;
    }));
    canvas.setAttribute('aria-label',`${theme.name}: שלוש שכבות פרלקסה, כביש, מעקה ושישה אביזרים`);
    document.getElementById('live-status').textContent=`נטענה ערכת ${theme.name}`;
  }

  async function select(id){
    const next=manifest.themes.find(t=>t.id===id);if(!next) throw new Error(`Unknown theme: ${id}`);
    const token=++loadToken;pause(false);state.loaded=false;loading.hidden=false;loading.textContent='טוען את הסביבה…';
    try{
      const files=assetList(next);const loaded=await Promise.all(files.map(a=>loadImage(a.file)));
      if(token!==loadToken)return;
      theme=next;images=new Map(files.map((a,i)=>[a.file,loaded[i]]));state.id=id;state.loaded=true;
      loading.hidden=true;delete canvas.dataset.loadError;metadata();render();
      if(wantsMotion&&state.mode==='scene')play(false);
    }catch(error){
      if(token!==loadToken)return;
      canvas.dataset.loadError=error.message;loading.textContent=error.message;
      const retry=document.createElement('button');retry.textContent='ניסיון נוסף';retry.onclick=()=>select(id);loading.append(retry);
    }
  }

  function drawSky(){
    ctx.drawImage(img(theme.sky),0,0,W,HORIZON+65);
    const night=theme.id==='city-night',sx=night?155:650,sy=night?88:93,r=night?11:24;
    const glow=ctx.createRadialGradient(sx,sy,0,sx,sy,r*3.2);
    glow.addColorStop(0,night?'#b5d9f833':'#ffeac544');glow.addColorStop(1,'#ffffff00');
    ctx.fillStyle=glow;ctx.fillRect(sx-r*3.2,sy-r*3.2,r*6.4,r*6.4);
    ctx.fillStyle=night?'#d6e6ee':'#ffe7b9';ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
    if(night){ctx.fillStyle='#a9c7e7';for(let i=0;i<25;i++){const x=(i*137+36)%W,y=59+(i*37)%69;ctx.globalAlpha=.25+(i%3)*.13;ctx.fillRect(x,y,1,1);}ctx.globalAlpha=1;}
  }

  function backgrounds(){
    for(const [i,a] of theme.layers.entries()){
      if(!state.layers[a.id])continue;
      const width=[1100,1200,1300][i],height=width*.19;
      const bottom=[211,228,252][i],offset=modulo(state.time*25*a.parallax,width);
      for(let x=-offset-width;x<W;x+=width)ctx.drawImage(img(a),x,bottom-height,width,height);
    }
  }
  const center=t=>422+62*Math.sin(t*1.25);
  const half=t=>14+255*t;
  const project=z=>{const t=1/(1+z*.045);return{t,y:HORIZON+t*(H-HORIZON),x:center(t),half:half(t)};};

  function groundAndRoad(){
    const road=img(theme.road.asphalt),shoulder=img(theme.road.shoulder),lane=img(theme.road.laneLine),edge=img(theme.road.edgeLine);
    ctx.fillStyle=theme.palette.ground;ctx.fillRect(0,HORIZON,W,H-HORIZON);
    // Individual scan lines project real, repeating PNG rows into the road plane.
    // The lane dash and edge stripe are sampled from their independent PNGs.
    for(let y=HORIZON;y<H;y++){
      const t=Math.max(.008,(y-HORIZON)/(H-HORIZON)),c=center(t),h=half(t),z=(1/t-1)/.045;
      const row=Math.floor(modulo(z*13+state.time*64,128));
      ctx.drawImage(shoulder,0,row,128,1,0,y,W,1);
      const left=c-h,width=h*2;
      for(let i=0;i<4;i++)ctx.drawImage(road,0,row,128,1,left+width*i/4,y,width/4+.6,1);
      const shade=ctx.createLinearGradient(left,0,left+width,0);shade.addColorStop(0,'#07111f33');shade.addColorStop(.5,'#07111f00');shade.addColorStop(1,'#07111f22');
      ctx.fillStyle=shade;ctx.fillRect(left,y,width,1);
      const lineRow=Math.floor(modulo(z*15+state.time*64,128)),scale=Math.max(.08,t);
      ctx.drawImage(lane,0,lineRow,32,1,c-16*scale,y,32*scale,1);
      for(const side of [-1,1])ctx.drawImage(edge,0,lineRow,16,1,c+side*(h-6*scale)-8*scale,y,16*scale,1);
    }
  }

  function triangle(image,s0,s1,s2,d0,d1,d2){
    const sx1=s1[0]-s0[0],sy1=s1[1]-s0[1],sx2=s2[0]-s0[0],sy2=s2[1]-s0[1];
    const dx1=d1[0]-d0[0],dy1=d1[1]-d0[1],dx2=d2[0]-d0[0],dy2=d2[1]-d0[1];
    const det=sx1*sy2-sx2*sy1;if(Math.abs(det)<.00001)return;
    const a=(dx1*sy2-dx2*sy1)/det,b=(dy1*sy2-dy2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,d=(dy2*sx1-dy1*sx2)/det;
    ctx.save();ctx.beginPath();ctx.moveTo(...d0);ctx.lineTo(...d1);ctx.lineTo(...d2);ctx.closePath();ctx.clip();
    ctx.transform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);ctx.drawImage(image,0,0);ctx.restore();
  }
  function rail(z0,z1,side){
    const a=project(z0),b=project(z1),image=img(theme.barrier);
    const x0=a.x+side*(a.half+10*a.t),x1=b.x+side*(b.half+10*b.t);
    const p0=[x0,a.y-31*a.t],p1=[x1,b.y-31*b.t],p2=[x1,b.y+2],p3=[x0,a.y+2];
    triangle(image,[0,0],[image.width,0],[image.width,image.height],p0,p1,p2);
    triangle(image,[0,0],[image.width,image.height],[0,image.height],p0,p2,p3);
  }
  function prop(index,z,side){
    const p=theme.props[index],q=project(z),height=p.heightMetres*38*q.t,width=height*.8;
    const x=q.x+side*(q.half+16+width*.6),y=q.y;
    ctx.globalAlpha=.20;ctx.fillStyle='#07111f';ctx.beginPath();ctx.ellipse(x,y,width*.32,Math.max(1,width*.045),0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    const [sx,sy,sw,sh]=p.frame;
    ctx.drawImage(img(theme.propAtlas),sx,sy,sw,sh,x-width/2,y-height*.9375,width,height);
  }
  function roadside(){
    for(let z=160;z>0;z-=8){const offset=modulo(state.time*8,8);for(const side of [-1,1])rail(Math.max(.1,z-8-offset),Math.max(.1,z-offset),side);}
    const props=theme.props.map((_p,i)=>({i,z:2+modulo(i*17+32-state.time*4,100),side:i%2?1:-1}));
    props.sort((a,b)=>b.z-a.z).forEach(p=>prop(p.i,p.z,p.side));
  }

  function checker(x,y,w,h,size=12){
    ctx.fillStyle='#1b2835';ctx.fillRect(x,y,w,h);ctx.fillStyle='#243442';
    for(let j=0;j<h;j+=size)for(let i=0;i<w;i+=size)if((i/size+j/size)%2)ctx.fillRect(x+i,y+j,Math.min(size,w-i),Math.min(size,h-j));
  }
  function atlas(){
    ctx.fillStyle='#0d1723';ctx.fillRect(0,0,W,H);
    const atlas=img(theme.propAtlas);
    for(let i=0;i<6;i++){
      const x=22+i*134,y=88;checker(x,y,128,164);
      ctx.drawImage(atlas,...theme.props[i].frame,x,y,128,160);
      ctx.font='11px Arial';ctx.textAlign='center';ctx.fillStyle='#e6e9e8';ctx.fillText(theme.props[i].label,x+64,268);
    }
    const files=[theme.road.asphalt,theme.road.shoulder,theme.road.laneLine,theme.road.edgeLine,theme.barrier];
    const labels=['אספלט','שוליים','קו מקווקו','קו שוליים','מעקה / קיר'];
    for(let i=0;i<files.length;i++){
      const x=23+i*165,y=282;checker(x,y,144,38,8);
      const file=img(files[i]);ctx.drawImage(file,0,0,file.width,file.height,x,y,144,38);
      ctx.font='10px Arial';ctx.textAlign='center';ctx.fillStyle='#a6bac8';ctx.fillText(labels[i],x+72,335);
    }
    ctx.textAlign='start';
  }
  function render(){
    if(!state.loaded)return;
    ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;
    if(state.mode==='atlas')atlas();else{ctx.fillStyle=theme.palette.skyTop;ctx.fillRect(0,0,W,H);drawSky();backgrounds();groundAndRoad();roadside();}
    document.getElementById('vignette').hidden=state.mode==='atlas';
    document.querySelector('.caption').hidden=state.mode==='atlas';
  }
  function tick(now){
    if(!state.playing)return;
    if(previous)state.time+=Math.min(.05,(now-previous)/1000);
    previous=now;render();raf=requestAnimationFrame(tick);
  }
  function syncMotion(){motion.textContent=state.playing?'השהיה':'ניגון';motion.setAttribute('aria-pressed',String(state.playing));}
  function pause(user=true){if(user)wantsMotion=false;state.playing=false;previous=0;cancelAnimationFrame(raf);raf=0;syncMotion();}
  function play(user=true){if(user)wantsMotion=true;if(state.playing||!state.loaded||state.mode!=='scene'||document.hidden)return;state.playing=true;previous=0;syncMotion();raf=requestAnimationFrame(tick);}
  function setMode(mode){state.mode=mode;document.querySelector('.stage').dataset.mode=mode;document.getElementById('atlas').setAttribute('aria-pressed',String(mode==='atlas'));if(mode==='atlas')pause(false);else if(wantsMotion)play(false);render();}

  document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.theme)));
  document.querySelectorAll('[data-layer]').forEach(box=>box.addEventListener('change',()=>{state.layers[box.dataset.layer]=box.checked;render();}));
  motion.addEventListener('click',()=>{if(state.mode==='atlas'){setMode('scene');play();}else state.playing?pause():play();});
  document.getElementById('atlas').onclick=()=>setMode(state.mode==='scene'?'atlas':'scene');
  document.getElementById('restart').onclick=()=>{state.time=0;render();};
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName))return;
    if(event.code==='Space'){event.preventDefault();state.playing?pause():play();}
    if(/^[1-4]$/.test(event.key))select(manifest.themes[Number(event.key)-1].id);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(false);else if(wantsMotion)play(false);});
  reduceMotion.addEventListener('change',()=>{if(reduceMotion.matches)pause();});
  window.racingThemesPreview={manifest,state,select,pause,play,render,setMode,
    setTime(seconds){state.time=Number(seconds)||0;render();},
    layerOffset(id,seconds){const layer=theme.layers.find(a=>a.id===id);return seconds*25*layer.parallax;},
    get assets(){return [...images.keys()];}};
  const query=new URLSearchParams(location.search),initial=query.get('theme');
  if(query.has('paused'))wantsMotion=false;
  window.racingThemesPreview.ready=select(manifest.themes.some(t=>t.id===initial)?initial:'city-night');
})();
