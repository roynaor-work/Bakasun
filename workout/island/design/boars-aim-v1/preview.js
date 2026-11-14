'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const scene = $('scene'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const range = 40; // Preview only. Integration must supply each weapon's real range.
  const variants = [
    {id:'hit-spark', name:'ניצוץ', duration:220},
    {id:'hit-ring', name:'טבעת', duration:300},
    {id:'hit-shards', name:'שברי שריון', duration:340}
  ];
  const catalog = [
    ['aim-guide','מסלול ונקודת פגיעה'],['aim-dot','נקודת מסלול'],['predicted-impact','נקודת פגיעה חזויה'],
    ['reticle-green','ריטיקל · בטווח'],['reticle-yellow','ריטיקל · גבול הטווח'],['reticle-red','ריטיקל · רחוק מדי'],
    ['hit-spark','פגיעה · ניצוץ'],['hit-ring','פגיעה · טבעת'],['hit-shards','פגיעה · שברי שריון'],['miss-dust','החטאה · אבק חול'],
    ['boar-surprise-01','הפתעה · מזהה'],['boar-surprise-02','הפתעה · נבהל'],['boar-surprise-03','הפתעה · מתאושש'],
    ['power-frame','מד כוח · מסגרת'],['power-fill','מד כוח · מילוי'],['power-thumb','מד כוח · סמן'],['power-meter','מד כוח · הרכבה']
  ];
  let aim = {x:.64,y:.53}, userAimed = false, variation = 0, reactionTimers = [], effectTimer, effectAnimation, pointerId = null;
  let resultReset;
  const clearReaction = () => { reactionTimers.forEach(clearTimeout); reactionTimers = []; };

  // Both PNG export resolutions are linked from the gallery. The live preview
  // uses the same SVG masters, without embedding copies of the exported artwork.
  for (const [id, title] of catalog) {
    const card = document.createElement('article'); card.className='asset-card'; card.dataset.asset=id;
    const thumb=document.createElement('div'); thumb.className='asset-thumb';
    const img=new Image(); img.src=`png/256/${id}.png`; img.alt=title; img.loading='eager'; thumb.append(img);
    const heading=document.createElement('h2'); heading.textContent=title;
    const links=document.createElement('div'); links.className='asset-links';
    for (const [label, href] of [['SVG',`svg/${id}.svg`],['PNG 256',`png/256/${id}.png`],['PNG 512',`png/512/${id}.png`]]) {
      const a=document.createElement('a'); a.href=href; a.download=''; a.textContent=label; a.setAttribute('aria-label',`${title} — ${label}`); links.append(a);
    }
    card.append(thumb,heading,links); $('asset-grid').append(card);
  }

  function layout() {
    const {width:w,height:h} = scene.getBoundingClientRect();
    if (!userAimed) aim = w<650?{x:.59,y:.43}:{x:.64,y:.53};
    const origin = {x:.34*w,y:(w<650?.66:.82)*h};
    const target = {x:aim.x*w,y:aim.y*h};
    $('trajectory').setAttribute('viewBox',`0 0 ${w} ${h}`);
    // Illustrative curve to the selected surface point. It does not claim to
    // simulate the game's ballistics or move the target based on charge.
    const d=`M${origin.x} ${origin.y} Q${origin.x+(target.x-origin.x)*.25} ${Math.min(origin.y,target.y)-h*.13} ${target.x} ${target.y}`;
    $('path-shadow').setAttribute('d',d); $('path-dots').setAttribute('d',d);
    for (const id of ['reticle','landing']) { $(id).style.left=`${aim.x*100}%`; $(id).style.top=`${aim.y*100}%`; }
    $('target-label').style.left=`${Math.max(110,Math.min(w-110,target.x))}px`;
    $('target-label').style.top=`${Math.max(88,target.y-63)}px`;
  }

  function updateDistance() {
    const distance=Number($('distance').value), ratio=distance/range;
    const color=ratio<=.6?'green':ratio<=1?'yellow':'red';
    const text={green:'בטווח',yellow:'גבול הטווח',red:'רחוק מדי'}[color];
    const hex={green:'#70d9ab',yellow:'#ffd06b',red:'#f07867'}[color];
    $('reticle').src=`svg/reticle-${color}.svg`; $('reticle').dataset.state=color;
    $('range-symbol').textContent={green:'●',yellow:'◆',red:'⌗'}[color];
    $('range-text').textContent=text; $('distance-value').textContent=`${distance} מ׳`;
    $('distance-output').value=`${distance} מ׳`; $('distance').setAttribute('aria-valuetext',`${distance} מטרים, ${text}`);
    $('target-label').style.color=hex; $('target-label').style.borderColor=`${hex}80`;
  }

  function updatePower() {
    const power=Number($('power').value);
    $('power-value').textContent=power; $('power-output').value=`${power}%`;
    $('power').setAttribute('aria-valuetext',`${power} אחוזים`);
    // The fill's painted bounds are y=70…434 on the 512px square master.
    $('meter-fill').style.clipPath=`inset(${(434-power/100*364)/512*100}% 0 0 0)`;
    $('meter-thumb').style.transform=`translateY(${(434-power/100*364-256)/512*100}%)`;
  }

  function surprise() {
    clearReaction(); $('surprise').setAttribute('aria-pressed','true');
    const restore=()=>{ $('boar').src='svg/boar-surprise-01.svg'; $('surprise').setAttribute('aria-pressed','false'); };
    if (reducedMotion.matches) {
      $('boar').src='svg/boar-surprise-02.svg'; reactionTimers.push(setTimeout(restore,400)); return;
    }
    $('boar').src='svg/boar-surprise-01.svg';
    reactionTimers.push(setTimeout(()=>{$('boar').src='svg/boar-surprise-02.svg';},90));
    reactionTimers.push(setTimeout(()=>{$('boar').src='svg/boar-surprise-03.svg';},230));
    reactionTimers.push(setTimeout(restore,400));
  }

  function playEffect(missed=false) {
    clearTimeout(effectTimer); clearTimeout(resultReset); effectAnimation?.cancel();
    const effect=$('effect'), variant=variants[variation];
    effect.src=`svg/${missed?'miss-dust':variant.id}.svg`;
    effect.style.left=`${aim.x*100}%`; effect.style.top=`${aim.y*100}%`;
    // Ground puff's contact point is y=348, unlike the centered hit effects.
    effect.style.transform=missed?'translate(-50%,-67.96875%)':'translate(-50%,-50%)';
    effect.hidden=false; effect.dataset.kind=missed?'miss':variant.id;
    const duration=missed?420:variant.duration;
    const boarPoint = scene.clientWidth<650?{x:.59,y:.43}:{x:.64,y:.53};
    const targetBoar = Math.hypot((aim.x-boarPoint.x)*scene.clientWidth,(aim.y-boarPoint.y)*scene.clientHeight)<65;
    if (!missed) surprise();
    $('feedback').textContent=missed?'החטאה · ענן חול בנקודת המגע':`${variant.name} · תצוגת אפקט הפגיעה${targetBoar?'':' בנקודה שנבחרה'}`;
    if (!reducedMotion.matches) {
      const base=missed?'translate(-50%,-67.96875%)':'translate(-50%,-50%)';
      const from=missed ? .7 : variant.id==='hit-ring' ? .6 : variant.id==='hit-shards' ? .5 : .55;
      const to=missed ? 1.15 : variant.id==='hit-ring' ? 1.25 : variant.id==='hit-shards' ? 1.3 : 1.15;
      effectAnimation=effect.animate([{transform:`${base} scale(${from})`,opacity:1},{offset:.3,opacity:1},{transform:`${base} translateY(${missed?-12:0}px) scale(${to})`,opacity:0}],{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
    effectTimer=setTimeout(()=>{ effect.hidden=true; },reducedMotion.matches?400:duration);
    resultReset=setTimeout(()=>{$('feedback').textContent='כוונו אל החזיר ונסו פגיעה';},1800);
  }

  function setPoint(e) {
    userAimed=true;
    const r=scene.getBoundingClientRect();
    aim.x=Math.max(.18,Math.min(.84,(e.clientX-r.left)/r.width));
    aim.y=Math.max(r.width<650?.29:.35,Math.min(r.width<650?.57:.68,(e.clientY-r.top)/r.height)); layout();
  }
  scene.addEventListener('pointerdown',e=>{ if(pointerId!==null)return; pointerId=e.pointerId; scene.setPointerCapture(pointerId); setPoint(e); });
  scene.addEventListener('pointermove',e=>{ if(e.pointerId===pointerId)setPoint(e); });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(event,e=>{ if(e.pointerId===pointerId)pointerId=null; });
  $('distance').addEventListener('input',updateDistance); $('power').addEventListener('input',updatePower);
  $('fire').addEventListener('click',()=>playEffect()); $('miss').addEventListener('click',()=>playEffect(true));
  $('surprise').addEventListener('click',surprise);
  $('variation').addEventListener('click',()=>{ variation=(variation+1)%variants.length; $('variation').replaceChildren(document.createTextNode(variants[variation].name)); const small=document.createElement('small'); small.textContent=`0${variation+1} / 03`; $('variation').append(small); $('variation').dataset.variation=variants[variation].id; });
  function setGallery(open) {
    $('preview').classList.toggle('gallery-open',open); $('gallery').hidden=!open;
    $('aim-tab').setAttribute('aria-pressed',String(!open)); $('assets-tab').setAttribute('aria-pressed',String(open));
    scene.inert=open; $('controls').inert=open;
  }
  $('assets-tab').addEventListener('click',()=>setGallery(true)); $('aim-tab').addEventListener('click',()=>setGallery(false));
  document.querySelectorAll('[data-bg]').forEach(button=>{ if(button.tagName!=='BUTTON')return; button.addEventListener('click',()=>{ $('asset-grid').dataset.bg=button.dataset.bg; document.querySelectorAll('button[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); }); });
  document.addEventListener('keydown',e=>{ if(e.code==='Escape')setGallery(false); });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden){ clearReaction(); $('boar').src='svg/boar-surprise-01.svg'; $('surprise').setAttribute('aria-pressed','false'); } });
  new ResizeObserver(layout).observe(scene);
  updateDistance(); updatePower(); layout();
})();
