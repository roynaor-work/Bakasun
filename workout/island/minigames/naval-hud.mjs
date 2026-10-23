const TAU=Math.PI*2;
const percent=(value,max)=>Math.round(Math.max(0,Math.min(1,value/max))*100);
function panel(p,x,y,w,h,r=12){p.beginPath();p.roundRect(x,y,w,h,r);p.fill();}
function glass(p,x,y,w,h,r=12){p.fillStyle='#092a3ce0';panel(p,x,y,w,h,r);p.strokeStyle='#d3e4df36';p.lineWidth=1;p.stroke();p.strokeStyle='#d8bd7a55';p.beginPath();p.moveTo(x+r,y+.5);p.lineTo(x+w-r,y+.5);p.stroke();}
function bar(p,x,y,w,h,value,max,color='#8edcc7'){p.fillStyle='#020f1c80';panel(p,x,y,w,h,h/2);if(value<=0)return;p.fillStyle=color;panel(p,x,y,Math.max(h,w*Math.max(0,Math.min(1,value/max))),h,h/2);}
function vesselMark(p,x,y){p.save();p.translate(x,y);p.strokeStyle='#e3d2a5';p.fillStyle='#bccdd0';p.lineWidth=1.4;p.beginPath();p.moveTo(-14,4);p.lineTo(13,4);p.lineTo(9,11);p.lineTo(-8,11);p.closePath();p.fill();p.stroke();p.fillStyle='#5c7f8b';p.fillRect(-7,-2,11,6);p.strokeRect(-7,-2,11,6);p.beginPath();p.moveTo(-1,-2);p.lineTo(-1,-12);p.lineTo(5,-7);p.lineTo(-1,-7);p.moveTo(-17,15);p.quadraticCurveTo(-11,12,-5,15);p.quadraticCurveTo(1,18,7,15);p.quadraticCurveTo(11,13,16,15);p.stroke();p.restore();}

/** Compact information from the live model, with the real accuracy guide while aiming. */
export function drawNavalHud(p,m,{config,balance,art},project){
  const width=config.width,selected=m.enemies.find(e=>e.index===m.lockedTargetIndex&&e.active&&e.hp>0)||m.enemies.find(e=>e.active&&e.hp>0);
  p.save();glass(p,16,16,204,68,12);vesselMark(p,41,40);
  p.direction='rtl';p.textAlign='right';p.font='10px sans-serif';p.fillStyle='#c5d4d6';p.fillText('שלמות גוף הספינה',158,34);
  p.direction='ltr';p.font='bold 17px sans-serif';p.fillStyle='#f3f1e6';p.fillText(percent(m.lives,m.maxLives)+'%',207,50);bar(p,69,44,88,4,m.lives,m.maxLives,m.lives/m.maxLives<.35?'#e4a184':'#8edcc7');
  p.direction='rtl';p.font='10px sans-serif';p.fillStyle='#a6bdc4';p.fillText('צי היריב',112,71);bar(p,123,65,84,3,m.enemyFleetHp,m.maxEnemyFleet,'#d5b77d');
  const titleX=width-254;
  if(width>650){glass(p,titleX,16,132,68,12);p.fillStyle='#d8bd7a';p.font='8px sans-serif';p.fillText('משימת סיור',titleX+118,30);p.fillStyle='#f3f1e6';p.font='bold 17px sans-serif';p.fillText('קרב ספינות',titleX+118,49);p.font='9px sans-serif';p.fillStyle='#b6cbd0';p.fillText(m.aiming?'כוונו ושחררו לירי':'מגינים על המפרץ',titleX+118,68);}
  const targets=[];
  for(const enemy of m.enemies){
    if(!enemy.active||enemy.hp<=0)continue;
    const q=project(enemy.x,enemy.z,balance.render.effects.healthLift),edge=22;
    if(q.depth<=0||q.x<edge||q.x>width-edge||q.y<edge||q.y>config.height-edge){const x=q.depth<=0?width/2:Math.max(edge,Math.min(width-edge,q.x)),y=q.depth<=0?22:Math.max(96,Math.min(config.height-90,q.y));p.fillStyle='#ffcf79';p.beginPath();p.moveTo(x,y-5);p.lineTo(x-5,y+4);p.lineTo(x+5,y+4);p.closePath();p.fill();continue;}
    targets.push({enemy,q});
  }
  // The selected ship keeps its natural label position. Nearby silhouettes get
  // separate rows, including their HP strip, before any of the labels are drawn.
  const labels=[],intersects=(a,b)=>a.x<b.x+b.w+6&&a.x+a.w+6>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
  const reserved=[{x:12,y:12,w:212,h:76},{x:width/2-22,y:13,w:44,h:44},{x:width-(width>650?258:124),y:12,w:width>650?246:112,h:76}];
  targets.sort((a,b)=>Number(b.enemy===selected)-Number(a.enemy===selected)||a.q.x-b.q.x);
  for(const target of targets){
    const x=Math.max(12,Math.min(width-106,target.q.x-47)),baseY=Math.max(16,Math.min(config.height-104,target.q.y-19)),candidates=[];
    for(let row=0;row<targets.length+4;row++)candidates.push(baseY-row*30);
    for(let row=1;row<targets.length+4;row++)candidates.push(baseY+row*30);
    let rect={x,y:baseY,w:94,h:26};
    for(const y of candidates){const candidate={x,y,w:94,h:26};if(y<16||y+26>config.height-96||labels.some(label=>intersects(candidate,label.rect))||reserved.some(block=>intersects(candidate,block)))continue;rect=candidate;break;}
    labels.push({...target,rect});
  }
  // Leaders sit below every label so an elevated label cannot cross its neighbour.
  for(const {enemy,q,rect} of labels){
    if(Math.abs(rect.y-(q.y-19))>3||Math.abs(rect.x+47-q.x)>3){p.strokeStyle=enemy===selected?'#d8bd7aa6':'#afc9cf88';p.lineWidth=1;p.beginPath();p.moveTo(Math.max(rect.x+8,Math.min(rect.x+86,q.x)),rect.y+26);p.lineTo(q.x,q.y+8);p.stroke();p.fillStyle=enemy===selected?'#e7c77f':'#bcd8d4';panel(p,q.x-1.5,q.y+6.5,3,3,1.5);}
    if(enemy===selected){const aim=project(enemy.x,enemy.z,1.1);if(aim.depth>0){p.strokeStyle=m.rangeState?.inside?'#a4ecd8':'#e7c77f';p.lineWidth=1.3;p.beginPath();for(let i=0;i<4;i++){const a=i*TAU/4;p.arc(aim.x,aim.y,19,a+.12,a+TAU/4-.12);}for(const [x,y]of [[-1,0],[1,0],[0,-1],[0,1]]){p.moveTo(aim.x+x*25,aim.y+y*25);p.lineTo(aim.x+x*15,aim.y+y*15);}p.stroke();}}
  }
  for(const {enemy,rect} of [...labels].reverse()){const chosen=enemy===selected;p.textAlign='center';p.direction='rtl';p.font=(chosen?'bold ':'')+'10px sans-serif';p.fillStyle=chosen?'#092a3cee':'#092638d9';panel(p,rect.x,rect.y,94,18,5);if(chosen){p.strokeStyle='#d8bd7a99';p.lineWidth=.8;p.stroke();}p.fillStyle=chosen?'#fff3d5':'#d1e0dc';p.fillText(art.enemyNames?.[enemy.index]||'ספינת יריב',rect.x+47,rect.y+13);bar(p,rect.x+22,rect.y+22,50,3,enemy.hp,enemy.maxHp,enemy.boss?'#ddbd78':chosen?'#a4ecd8':'#91bcb3');}
  if(m.aiming&&selected){p.strokeStyle=m.rangeState?.inside?'#78edbf':'#d2f2ed';p.globalAlpha=.25;p.lineWidth=1;p.setLineDash([5,9]);p.beginPath();let connected=false;
    for(let i=0;i<=96;i++){const a=i/96*TAU,q=project(selected.x+Math.cos(a)*balance.lock.goodRadius,selected.z+Math.sin(a)*balance.lock.goodRadius,.08);if(q.depth<=.1){connected=false;continue;}if(connected)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);connected=true;}p.stroke();p.setLineDash([]);p.globalAlpha=1;
  }
  const target=project(m.aim.x,m.aim.z),end=project(m.aim.x+m.wind.x,m.aim.z+m.wind.z),angle=Math.atan2(end.y-target.y,end.x-target.x);
  p.translate(width/2,35);p.fillStyle='#092a3ca6';p.beginPath();p.arc(0,0,18,0,TAU);p.fill();p.strokeStyle='#d8bd7a66';p.lineWidth=1;p.stroke();p.rotate(angle);p.strokeStyle='#e0e8df';p.lineWidth=1.5;p.beginPath();p.moveTo(-8,0);p.lineTo(8,0);p.lineTo(3,-3);p.moveTo(8,0);p.lineTo(3,3);p.stroke();p.restore();
}

/** All six original weapon buttons remain in an expandable dock. */
export function mountNavalWeaponPicker(ctx,getModel){
  const controls=ctx.controls,rack=controls.querySelector('.ammo-rack');if(!rack)return {update(){},dispose(){}};
  const fireIcon=controls.querySelector('#shoot .game-icon'),originalFire=fireIcon?.innerHTML;if(fireIcon)fireIcon.innerHTML='<path d="m20 29 29-17 5 8-29 17Z" fill="currentColor"/><path d="m45 10 4-2 8 13-4 2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 36h12l8 14H12Z" fill="currentColor"/><path d="M10 53h36" stroke="currentColor" stroke-width="3"/><path d="m55 8 5-5M57 29l6 1" stroke="currentColor" stroke-width="2"/>';
  const events=new AbortController(),picker=document.createElement('button'),icon=document.createElement('span'),count=document.createElement('span'),name=document.createElement('span'),copy=document.createElement('span'),arrow=document.createElement('span');
  picker.type='button';picker.className='naval-weapon-picker';icon.className='naval-picked-icon';count.className='naval-picked-count';name.className='naval-picked-name';copy.className='naval-picked-copy';copy.append(name,count);arrow.textContent='⌃';arrow.className='naval-picker-arrow';picker.append(icon,copy,arrow);controls.append(picker);controls.classList.add('naval-adventure-controls');
  for(const [index,button] of [...rack.querySelectorAll('[data-ammo-index]')].entries()){const title=document.createElement('span');title.className='naval-ammo-name';title.textContent=ctx.t(ctx.balance.ammo[index].title);button.append(title);}
  rack.id='naval-weapon-dock';picker.setAttribute('aria-controls',rack.id);let open=false,last='';
  function expand(value){if(!value&&rack.contains(document.activeElement))picker.focus();open=value;controls.dataset.weaponMenu=String(value);picker.setAttribute('aria-expanded',String(value));rack.inert=!value;}
  picker.addEventListener('click',()=>expand(!open),{signal:events.signal});
  rack.addEventListener('pointerup',()=>expand(false),{signal:events.signal});
  rack.addEventListener('click',event=>{if(event.target.closest('[data-ammo-index]'))expand(false);},{signal:events.signal});
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.stopPropagation();expand(false);picker.focus();}},{signal:events.signal});expand(false);
  for(const type of ['keydown','keyup'])controls.addEventListener(type,event=>{if(event.code==='Space'&&event.target.closest('.naval-weapon-picker,.ammo-rack'))event.stopPropagation();},{signal:events.signal});
  return {update(){const model=getModel();if(!model)return;const key=model.ammoIndex+':'+model.ammo[model.ammoIndex];if(last===key)return;last=key;const button=rack.querySelector(`[data-ammo-index="${model.ammoIndex}"]`),drawing=button?.querySelector('.game-icon');icon.replaceChildren(...(drawing?[drawing.cloneNode(true)]:[]));count.textContent=String(model.ammo[model.ammoIndex]);name.textContent=ctx.t(ctx.balance.ammo[model.ammoIndex].title);picker.style.setProperty('--naval-weapon',button?.style.getPropertyValue('--naval-weapon')||'#ffcf79');picker.setAttribute('aria-label',name.textContent+', '+count.textContent+', בחירת נשק');},
    dispose(){events.abort();rack.inert=false;if(fireIcon)fireIcon.innerHTML=originalFire;rack.querySelectorAll('.naval-ammo-name').forEach(n=>n.remove());picker.remove();controls.classList.remove('naval-adventure-controls');delete controls.dataset.weaponMenu;},
  };
}
