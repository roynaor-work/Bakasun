const TAU=Math.PI*2;
const percent=(value,max)=>Math.round(Math.max(0,Math.min(1,value/max))*100);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const translated=(t,key,fallback)=>{const value=t?.(key);return value&&value!==key?value:fallback;};
const feedbackCopy={hit:'פגיעה במטרה',miss:'פספוס · הקדימו מטרה נעה',damage:'נפגענו · המשיכו לשוט',evaded:'הירי חלף לידנו',mine:'מוקש נפרס בנתיב',repair:'גוף הספינה תוקן',full:'גוף הספינה כבר מלא',resupply:'מלאי הפגזים חודש'};
const objectiveCopy={fleet:'הטביעו את כל הצי',flagship:'הטביעו את ספינת הדגל',intercept:'יירטו את סירות האגף',subhunt:'הטביעו את הצוללות'};
const weaponHints=['ירי מהיר · הקדימו מטרה נעה','עוקב אחרי היעד · גם בצלילה','על פני המים · טוב מקרוב','נפרס בכוונת · חוסם נתיב','שלושה פגזים · מכסה שטח','מתקן רבע גוף · ללא ירי'];
function clippedText(p,text,x,y,maxWidth){let copy=String(text);while(copy.length>1&&p.measureText(copy).width>maxWidth)copy=copy.slice(0,-2)+'…';p.fillText(copy,x,y);}
function panel(p,x,y,w,h,r=12){p.beginPath();p.roundRect(x,y,w,h,r);p.fill();}
function glass(p,x,y,w,h,r=12){p.fillStyle='#092a3ce0';panel(p,x,y,w,h,r);p.strokeStyle='#d3e4df36';p.lineWidth=1;p.stroke();p.strokeStyle='#d8bd7a55';p.beginPath();p.moveTo(x+r,y+.5);p.lineTo(x+w-r,y+.5);p.stroke();}
function bar(p,x,y,w,h,value,max,color='#8edcc7'){p.fillStyle='#020f1c80';panel(p,x,y,w,h,h/2);if(value<=0)return;p.fillStyle=color;panel(p,x,y,Math.max(h,w*Math.max(0,Math.min(1,value/max))),h,h/2);}
function vesselMark(p,x,y){p.save();p.translate(x,y);p.strokeStyle='#e3d2a5';p.fillStyle='#bccdd0';p.lineWidth=1.4;p.beginPath();p.moveTo(-14,4);p.lineTo(13,4);p.lineTo(9,11);p.lineTo(-8,11);p.closePath();p.fill();p.stroke();p.fillStyle='#5c7f8b';p.fillRect(-7,-2,11,6);p.strokeRect(-7,-2,11,6);p.beginPath();p.moveTo(-1,-2);p.lineTo(-1,-12);p.lineTo(5,-7);p.lineTo(-1,-7);p.moveTo(-17,15);p.quadraticCurveTo(-11,12,-5,15);p.quadraticCurveTo(1,18,7,15);p.quadraticCurveTo(11,13,16,15);p.stroke();p.restore();}

/** Exact landing footprints remain small even when the camera moves close. */
export function navalDangerMarks(m,balance,project,width,height){
  const threats=m.enemies.filter(e=>e.active&&e.hp>0&&e.attack).map(e=>({x:e.attack.x,z:e.attack.z,seconds:Math.max(0,e.attack.fireTime-m.time),incoming:false}));
  for(const shot of m.enemyShots||[])threats.push({x:shot.targetX,z:shot.targetZ,seconds:Math.max(0,shot.duration-shot.age),incoming:true});
  return threats.slice(0,6).flatMap(threat=>{
    const q=project(threat.x,threat.z,.1);if(!q||q.depth<=0||q.x<-40||q.x>width+40||q.y<-40||q.y>height+40)return [];
    const heading=m.playerShip.heading||0,c=Math.cos(heading),s=Math.sin(heading),points=[];
    for(let i=0;i<=32;i++){const a=i/32*TAU,x=Math.cos(a)*balance.aim.hullLength,z=Math.sin(a)*balance.aim.hullBeam,r=project(threat.x+x*c-z*s,threat.z+x*s+z*c,.1);if(!r||r.depth<=0)return [];points.push(r);}
    const radius=Math.max(...points.map(point=>Math.hypot(point.x-q.x,point.y-q.y))),scale=Math.min(1,32/Math.max(1,radius));
    return [{...threat,q,points:points.map(point=>({x:q.x+(point.x-q.x)*scale,y:q.y+(point.y-q.y)*scale}))}];
  });
}
function drawDanger(p,marks,time,width,height){
  for(const mark of marks){
    p.save();p.strokeStyle=mark.incoming?'#ffad76':'#ffc27b';p.fillStyle='#f39a4d12';p.lineWidth=1.5;p.globalAlpha=.75+Math.sin(time*7)*.15;p.beginPath();for(let i=0;i<mark.points.length;i++){const q=mark.points[i];if(i)p.lineTo(q.x,q.y);else p.moveTo(q.x,q.y);}p.closePath();p.fill();p.stroke();
    const {x,y}=mark.q;p.beginPath();p.moveTo(x-4,y);p.lineTo(x+4,y);p.moveTo(x,y-3);p.lineTo(x,y+3);p.stroke();p.globalAlpha=1;
    const bx=clamp(x,30,width-30),by=clamp(y-25,99,height-131);p.fillStyle='#3d2c1ff0';panel(p,bx-22,by-10,44,19,5);p.strokeStyle='#ffc27b88';p.lineWidth=.8;p.stroke();p.fillStyle='#ffce99';p.font='bold 10px sans-serif';p.direction='ltr';p.textAlign='center';p.fillText((mark.incoming?'↓ ':'! ')+mark.seconds.toFixed(1)+'s',bx,by+3);p.restore();
  }
}

/** The actual mission, selected hull and incoming fire are readable without a range ring. */
export function drawNavalHud(p,m,{config,balance,art,t},project){
  const width=config.width,height=config.height,index=m.aiming?m.lockedTargetIndex:m.selectedTargetIndex,selected=m.enemies.find(e=>e.index===index&&e.active&&e.hp>0)||m.enemies.find(e=>e.active&&e.hp>0);
  const marks=navalDangerMarks(m,balance,project,width,height),mission=m.mission||{id:'fleet'},missionState=m.missionState||{completed:0,total:m.enemies.length};
  drawDanger(p,marks,m.time,width,height);
  p.save();glass(p,16,16,204,68,12);vesselMark(p,41,40);
  p.direction='rtl';p.textAlign='right';p.font='10px sans-serif';p.fillStyle='#c5d4d6';p.fillText('שלמות גוף הספינה',158,34);
  p.direction='ltr';p.font='bold 17px sans-serif';p.fillStyle='#f3f1e6';p.fillText(percent(m.lives,m.maxLives)+'%',207,50);bar(p,69,44,88,4,m.lives,m.maxLives,m.lives/m.maxLives<.35?'#e4a184':'#8edcc7');
  p.direction='rtl';p.font='10px sans-serif';p.fillStyle='#a6bdc4';p.fillText('צי היריב',112,71);bar(p,123,65,84,3,m.enemyFleetHp,m.maxEnemyFleet,'#d5b77d');
  let missionRect;
  if(width>=620){
    const w=Math.min(300,width-370),x=(width+96-w)/2;missionRect={x,y:16,w,h:68};glass(p,x,16,w,68,12);
    p.direction='rtl';p.textAlign='right';p.fillStyle='#f3f1e6';p.font='bold 14px sans-serif';clippedText(p,translated(t,mission.title,'קרב ספינות'),x+w-14,38,w-78);
    p.font='10px sans-serif';p.fillStyle='#c2d5d4';clippedText(p,translated(t,'naval.objective.'+mission.id,objectiveCopy[mission.id]||objectiveCopy.fleet),x+w-14,58,w-78);
    p.direction='ltr';p.textAlign='left';p.fillStyle='#d8bd7a';p.font='bold 15px sans-serif';p.fillText(`${missionState.completed}/${missionState.total}`,x+14,59);p.fillStyle='#abc5cb';p.font='10px sans-serif';const seconds=Math.max(0,Math.ceil(m.remaining));p.fillText(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,x+14,36);
  }
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
  const reserved=[{x:12,y:12,w:212,h:76},{x:width-124,y:12,w:112,h:76},...(missionRect?[missionRect]:[])];
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
    if(enemy===selected){const aim=project(enemy.x,enemy.z,1.1);if(aim.depth>0){p.strokeStyle=m.rangeState?.inside?'#a4ecd8':'#e7c77f';p.lineWidth=1.4;p.beginPath();for(const [x,y]of [[-1,-1],[1,-1],[-1,1],[1,1]]){p.moveTo(aim.x+x*18,aim.y+y*6);p.lineTo(aim.x+x*18,aim.y+y*11);p.lineTo(aim.x+x*11,aim.y+y*11);}p.stroke();}}
  }
  for(const {enemy,rect} of [...labels].reverse()){
    const chosen=enemy===selected,priority=mission.id==='flagship'?enemy.boss:mission.id==='subhunt'?enemy.behavior==='dive':mission.id==='intercept'?enemy.behavior==='flank':false;
    p.textAlign='center';p.direction='rtl';p.font=(chosen?'bold ':'')+'10px sans-serif';p.fillStyle=chosen?'#092a3cee':'#092638d9';panel(p,rect.x,rect.y,94,18,5);if(chosen){p.strokeStyle='#d8bd7a99';p.lineWidth=.8;p.stroke();}p.fillStyle=chosen?'#fff3d5':'#d1e0dc';clippedText(p,art.enemyNames?.[enemy.index]||'ספינת יריב',rect.x+47,rect.y+13,priority?73:86);
    if(priority){p.fillStyle='#e7c77f';p.beginPath();p.moveTo(rect.x+7,rect.y+5);p.lineTo(rect.x+10,rect.y+9);p.lineTo(rect.x+7,rect.y+13);p.lineTo(rect.x+4,rect.y+9);p.closePath();p.fill();}
    bar(p,rect.x+22,rect.y+22,50,3,enemy.hp,enemy.maxHp,enemy.boss?'#ddbd78':chosen?'#a4ecd8':'#91bcb3');
  }
  p.textAlign='center';p.direction='rtl';
  if(marks.length){p.fillStyle='#3d2c1fe8';panel(p,width/2-113,height-118,226,23,7);p.fillStyle='#ffd5a4';p.font='bold 10px sans-serif';p.fillText(translated(t,'naval.hud.evade','ירי בדרך · זוזו מהסימון'),width/2,height-103);}
  const feedback=m.lastFeedback,age=feedback?m.time-feedback.time:Infinity;
  let message=m.resupplyTime>0?translated(t,'naval.feedback.resupplying','אספקה בדרך')+` · ${Math.max(0,2-m.resupplyTime).toFixed(1)}s`:age>=0&&age<1.35?translated(t,'naval.feedback.'+feedback.kind,feedbackCopy[feedback.kind]||''):'';
  if(message){const accent=m.resupplyTime>0?'#e7cf9e':feedback?.kind==='damage'?'#f2ad90':feedback?.kind==='hit'||feedback?.kind==='repair'?'#a4ecd8':'#e7cf9e',w=Math.min(226,p.measureText(message).width+28);p.globalAlpha=m.resupplyTime>0?1:Math.min(1,(1.35-age)*5);glass(p,width/2-w/2,height-85,w,27,8);p.fillStyle=accent;p.font='bold 11px sans-serif';clippedText(p,message,width/2,height-67,w-16);p.globalAlpha=1;}
  const target=project(m.aim.x,m.aim.z),end=project(m.aim.x+m.wind.x,m.aim.z+m.wind.z),angle=Math.atan2(end.y-target.y,end.x-target.x);
  if(!missionRect||missionRect.x>258){p.translate(239,35);p.fillStyle='#092a3ca6';p.beginPath();p.arc(0,0,11,0,TAU);p.fill();p.rotate(angle);p.strokeStyle='#e0e8df';p.lineWidth=1.3;p.beginPath();p.moveTo(-6,0);p.lineTo(6,0);p.lineTo(2,-3);p.moveTo(6,0);p.lineTo(2,3);p.stroke();}p.restore();
}

/** All six original weapon buttons remain in an expandable dock. */
export function mountNavalWeaponPicker(ctx,getModel){
  const controls=ctx.controls,rack=controls.querySelector('.ammo-rack');if(!rack)return {update(){},dispose(){}};
  const fireIcon=controls.querySelector('#shoot .game-icon'),originalFire=fireIcon?.innerHTML;if(fireIcon)fireIcon.innerHTML='<path d="m20 29 29-17 5 8-29 17Z" fill="currentColor"/><path d="m45 10 4-2 8 13-4 2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 36h12l8 14H12Z" fill="currentColor"/><path d="M10 53h36" stroke="currentColor" stroke-width="3"/><path d="m55 8 5-5M57 29l6 1" stroke="currentColor" stroke-width="2"/>';
  const events=new AbortController(),picker=document.createElement('button'),icon=document.createElement('span'),count=document.createElement('span'),name=document.createElement('span'),copy=document.createElement('span'),arrow=document.createElement('span'),hint=document.createElement('span'),fire=controls.querySelector('#shoot'),originalFireLabel=fire?.getAttribute('aria-label'),originalButtons=[];
  picker.type='button';picker.className='naval-weapon-picker';icon.className='naval-picked-icon';count.className='naval-picked-count';name.className='naval-picked-name';copy.className='naval-picked-copy';copy.append(name,count);arrow.textContent='⌃';arrow.className='naval-picker-arrow';picker.append(icon,copy,arrow);hint.className='naval-weapon-hint';hint.id='naval-weapon-hint';picker.setAttribute('aria-describedby',hint.id);controls.append(picker,hint);controls.classList.add('naval-adventure-controls');
  for(const [index,button] of [...rack.querySelectorAll('[data-ammo-index]')].entries()){const title=document.createElement('span');title.className='naval-ammo-name';title.textContent=ctx.t(ctx.balance.ammo[index].title);button.append(title);originalButtons.push({button,title:button.getAttribute('title'),description:button.getAttribute('aria-description')});const text=translated(ctx.t,'naval.weapon.hint.'+ctx.balance.ammo[index].id,weaponHints[index]);button.title=title.textContent+' · '+text;button.setAttribute('aria-description',text);}
  rack.id='naval-weapon-dock';picker.setAttribute('aria-controls',rack.id);let open=false,last='',lastWeapon=-1;
  function expand(value){if(!value&&rack.contains(document.activeElement))picker.focus();open=value;controls.dataset.weaponMenu=String(value);picker.setAttribute('aria-expanded',String(value));rack.inert=!value;}
  picker.addEventListener('click',()=>expand(!open),{signal:events.signal});
  rack.addEventListener('pointerup',()=>expand(false),{signal:events.signal});
  rack.addEventListener('click',event=>{if(event.target.closest('[data-ammo-index]'))expand(false);},{signal:events.signal});
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.stopPropagation();expand(false);picker.focus();}},{signal:events.signal});expand(false);
  for(const type of ['keydown','keyup'])controls.addEventListener(type,event=>{if(event.code==='Space'&&event.target.closest('.naval-weapon-picker,.ammo-rack'))event.stopPropagation();},{signal:events.signal});
  return {update(){
    const model=getModel();if(!model)return;const index=model.ammoIndex,cooldown=Math.max(0,model.cooldowns?.[index]||0),ready=cooldown<=0&&model.ammo[index]>0,key=index+':'+model.ammo[index]+':'+Math.ceil(cooldown*10)+':'+Boolean(model.resupplyTime);if(last===key)return;last=key;
    if(lastWeapon!==index){const button=rack.querySelector(`[data-ammo-index="${index}"]`),drawing=button?.querySelector('.game-icon');icon.replaceChildren(...(drawing?[drawing.cloneNode(true)]:[]));name.textContent=ctx.t(ctx.balance.ammo[index].title);picker.style.setProperty('--naval-weapon',button?.style.getPropertyValue('--naval-weapon')||'#ffcf79');lastWeapon=index;}count.textContent=String(model.ammo[index]);picker.setAttribute('aria-label',name.textContent+', '+count.textContent+', בחירת נשק');
    hint.textContent=cooldown>0?translated(ctx.t,'naval.weapon.reloading','טוענים')+' · '+cooldown.toFixed(1)+'s':model.resupplyTime>0?translated(ctx.t,'naval.feedback.resupplying','אספקה בדרך'):translated(ctx.t,'naval.weapon.hint.'+ctx.balance.ammo[index].id,weaponHints[index]);hint.dataset.reloading=String(cooldown>0);controls.dataset.weaponReady=String(ready);controls.dataset.reloading=String(cooldown>0);fire?.setAttribute('aria-label',name.textContent+' · '+hint.textContent);
   },
    dispose(){events.abort();rack.inert=false;if(fireIcon)fireIcon.innerHTML=originalFire;for(const {button,title,description}of originalButtons){if(title===null)button.removeAttribute('title');else button.setAttribute('title',title);if(description===null)button.removeAttribute('aria-description');else button.setAttribute('aria-description',description);}if(fire){if(originalFireLabel===null)fire.removeAttribute('aria-label');else fire.setAttribute('aria-label',originalFireLabel);}rack.querySelectorAll('.naval-ammo-name').forEach(n=>n.remove());picker.remove();hint.remove();controls.classList.remove('naval-adventure-controls');delete controls.dataset.weaponMenu;delete controls.dataset.weaponReady;delete controls.dataset.reloading;},
  };
}
