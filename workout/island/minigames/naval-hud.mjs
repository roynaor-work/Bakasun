const TAU=Math.PI*2;
const percent=(value,max)=>Math.round(Math.max(0,Math.min(1,value/max))*100);
function panel(p,x,y,w,h,r=12){p.beginPath();p.roundRect(x,y,w,h,r);p.fill();}
function bar(p,x,y,w,h,value,max){p.fillStyle='#052c4380';panel(p,x,y,w,h,h/2);if(value<=0)return;p.fillStyle='#6ce4b7';panel(p,x,y,Math.max(h,w*Math.max(0,Math.min(1,value/max))),h,h/2);}

/** Compact information from the live model, with the real accuracy guide while aiming. */
export function drawNavalHud(p,m,{config,balance,art},project){
  const width=config.width,selected=m.enemies.find(e=>e.index===m.lockedTargetIndex&&e.active&&e.hp>0)||m.enemies.find(e=>e.active&&e.hp>0);
  p.save();p.fillStyle='#123e55d9';panel(p,16,16,190,66);
  p.strokeStyle='#c8f9ed';p.lineWidth=1.5;p.fillStyle='#5dc8e7';p.beginPath();p.moveTo(31,28);p.lineTo(42,32);p.lineTo(41,44);p.quadraticCurveTo(39,50,31,54);p.quadraticCurveTo(23,50,21,44);p.lineTo(20,32);p.closePath();p.fill();p.stroke();
  p.direction='rtl';p.textAlign='right';p.font='11px sans-serif';p.fillStyle='#d6eef2';p.fillText('הספינה שלי',159,33);
  p.direction='ltr';p.font='bold 15px sans-serif';p.fillStyle='#fff8e4';p.fillText(percent(m.lives,m.maxLives)+'%',193,49);bar(p,53,43,104,5,m.lives,m.maxLives);
  p.direction='rtl';p.textAlign='right';p.font='10px sans-serif';p.fillStyle='#c7dfe4';p.fillText('צי היריב',106,69);bar(p,117,63,76,3,m.enemyFleetHp,m.maxEnemyFleet);
  const titleX=width-240;
  if(width>650){p.fillStyle='#123e55c9';panel(p,titleX,16,118,61);p.fillStyle='#fff5dc';p.font='bold 17px sans-serif';p.fillText('קרב ספינות',titleX+105,43);p.font='10px sans-serif';p.fillStyle='#cbe6e8';p.fillText(m.aiming?'מכוונים ומשחררים לירי':'מגינים על המפרץ',titleX+105,63);}
  for(const enemy of m.enemies){
    if(!enemy.active||enemy.hp<=0)continue;
    const q=project(enemy.x,enemy.z,balance.render.effects.healthLift),edge=22;
    if(q.depth<=0||q.x<edge||q.x>width-edge||q.y<edge||q.y>config.height-edge){const x=q.depth<=0?width/2:Math.max(edge,Math.min(width-edge,q.x)),y=q.depth<=0?22:Math.max(96,Math.min(config.height-90,q.y));p.fillStyle='#ffcf79';p.beginPath();p.moveTo(x,y-5);p.lineTo(x-5,y+4);p.lineTo(x+5,y+4);p.closePath();p.fill();continue;}
    p.textAlign='center';p.direction='rtl';p.font='bold 10px sans-serif';p.fillStyle='#123b52b8';panel(p,q.x-45,q.y-18,90,19,8);p.fillStyle='#f6fff5';p.fillText(art.enemyNames?.[enemy.index]||'ספינת יריב',q.x,q.y-5);bar(p,q.x-22,q.y+3,44,3,enemy.hp,enemy.maxHp);
    if(enemy===selected){const aim=project(enemy.x,enemy.z,1.1);if(aim.depth>0){p.strokeStyle=m.rangeState?.inside?'#78edbf':'#ffcf79';p.lineWidth=1.5;p.beginPath();p.arc(aim.x,aim.y,17,0,TAU);for(const [x,y]of [[-1,0],[1,0],[0,-1],[0,1]]){p.moveTo(aim.x+x*21,aim.y+y*21);p.lineTo(aim.x+x*13,aim.y+y*13);}p.stroke();}}
  }
  if(m.aiming&&selected){p.strokeStyle=m.rangeState?.inside?'#78edbf':'#d2f2ed';p.globalAlpha=.25;p.lineWidth=1;p.setLineDash([5,9]);p.beginPath();let connected=false;
    for(let i=0;i<=96;i++){const a=i/96*TAU,q=project(selected.x+Math.cos(a)*balance.lock.goodRadius,selected.z+Math.sin(a)*balance.lock.goodRadius,.08);if(q.depth<=.1){connected=false;continue;}if(connected)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);connected=true;}p.stroke();p.setLineDash([]);p.globalAlpha=1;
  }
  const target=project(m.aim.x,m.aim.z),end=project(m.aim.x+m.wind.x,m.aim.z+m.wind.z),angle=Math.atan2(end.y-target.y,end.x-target.x);
  p.translate(width/2,31);p.fillStyle='#123e5599';p.beginPath();p.arc(0,0,16,0,TAU);p.fill();p.rotate(angle);p.strokeStyle='#d9f7ee';p.lineWidth=1.6;p.beginPath();p.moveTo(-7,0);p.lineTo(7,0);p.lineTo(3,-3);p.moveTo(7,0);p.lineTo(3,3);p.stroke();p.restore();
}

/** All six original weapon buttons remain in an expandable dock. */
export function mountNavalWeaponPicker(ctx,getModel){
  const controls=ctx.controls,rack=controls.querySelector('.ammo-rack');if(!rack)return {update(){},dispose(){}};
  const events=new AbortController(),picker=document.createElement('button'),icon=document.createElement('span'),count=document.createElement('span'),arrow=document.createElement('span');
  picker.type='button';picker.className='naval-weapon-picker';icon.className='naval-picked-icon';count.className='naval-picked-count';arrow.textContent='⌃';arrow.className='naval-picker-arrow';picker.append(icon,count,arrow);controls.append(picker);controls.classList.add('naval-adventure-controls');
  rack.id='naval-weapon-dock';picker.setAttribute('aria-controls',rack.id);let open=false,last='';
  function expand(value){if(!value&&rack.contains(document.activeElement))picker.focus();open=value;controls.dataset.weaponMenu=String(value);picker.setAttribute('aria-expanded',String(value));rack.inert=!value;}
  picker.addEventListener('click',()=>expand(!open),{signal:events.signal});
  rack.addEventListener('pointerup',()=>expand(false),{signal:events.signal});
  rack.addEventListener('click',event=>{if(event.target.closest('[data-ammo-index]'))expand(false);},{signal:events.signal});
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.stopPropagation();expand(false);picker.focus();}},{signal:events.signal});expand(false);
  for(const type of ['keydown','keyup'])controls.addEventListener(type,event=>{if(event.code==='Space'&&event.target.closest('.naval-weapon-picker,.ammo-rack'))event.stopPropagation();},{signal:events.signal});
  return {update(){const model=getModel();if(!model)return;const key=model.ammoIndex+':'+model.ammo[model.ammoIndex];if(last===key)return;last=key;const button=rack.querySelector(`[data-ammo-index="${model.ammoIndex}"]`),drawing=button?.querySelector('.game-icon');icon.replaceChildren(...(drawing?[drawing.cloneNode(true)]:[]));count.textContent=String(model.ammo[model.ammoIndex]);picker.style.setProperty('--naval-weapon',button?.style.getPropertyValue('--naval-weapon')||'#ffcf79');picker.setAttribute('aria-label',ctx.t(ctx.balance.ammo[model.ammoIndex].title)+', '+count.textContent+', בחירת נשק');},
    dispose(){events.abort();rack.inert=false;picker.remove();controls.classList.remove('naval-adventure-controls');delete controls.dataset.weaponMenu;},
  };
}
