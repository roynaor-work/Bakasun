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

function enemyMark(p,x,y,color='#e39b88'){p.save();p.translate(x,y);p.fillStyle=color;p.strokeStyle='#f5dccf';p.lineWidth=1;p.beginPath();p.moveTo(-9,2);p.lineTo(9,2);p.lineTo(6,7);p.lineTo(-6,7);p.closePath();p.fill();p.stroke();p.fillRect(-4,-3,6,5);p.beginPath();p.moveTo(0,-3);p.lineTo(7,-6);p.stroke();p.restore();}
/** Feedback is an icon at the actual impact point: burst, gold star, ripple, cross. */
function feedbackIcon(p,kind,q,u){
  p.save();p.translate(q.x,q.y-18-u*16);p.globalAlpha=Math.max(0,Math.min(1,(1-u)*2.4));p.lineWidth=2.4;p.lineJoin='round';
  if(kind==='critical'){p.fillStyle='#ffe27a';p.strokeStyle='#7a4a12';p.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?6:14;p.lineTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();p.stroke();}
  else if(kind==='hit'){p.fillStyle='#ffb35c';p.strokeStyle='#6b2c16';p.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?5:11;p.lineTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();p.stroke();}
  else if(kind==='miss'||kind==='evaded'){p.strokeStyle='#e9fbff';for(const r of [5,10])p.beginPath(),p.ellipse(0,0,r+u*6,(r+u*6)*.45,0,0,TAU),p.stroke();}
  else if(kind==='damage'){p.strokeStyle='#ff8d74';p.beginPath();p.moveTo(-8,-8);p.lineTo(8,8);p.moveTo(8,-8);p.lineTo(-8,8);p.stroke();}
  else if(kind==='repair'||kind==='full'){p.strokeStyle='#73e7aa';p.beginPath();p.moveTo(-8,0);p.lineTo(8,0);p.moveTo(0,-8);p.lineTo(0,8);p.stroke();}
  else if(kind==='mine'){p.strokeStyle='#d69bf4';p.beginPath();p.arc(0,0,6,0,TAU);p.stroke();for(let i=0;i<6;i++){const a=i*TAU/6;p.beginPath();p.moveTo(Math.cos(a)*7,Math.sin(a)*7);p.lineTo(Math.cos(a)*11,Math.sin(a)*11);p.stroke();}}
  else if(kind==='resupply'){p.fillStyle='#ffd36e';p.beginPath();p.roundRect(-4,-9,8,15,3);p.fill();}
  p.restore();
}

/** Mission, hulls and incoming fire read as icons, bars and rings: no explanatory lines in battle. */
export function drawNavalHud(p,m,{config,balance,art,t},project){
  const width=config.width,height=config.height,index=m.aiming?m.lockedTargetIndex:m.selectedTargetIndex,selected=m.enemies.find(e=>e.index===index&&e.active&&e.hp>0)||m.enemies.find(e=>e.active&&e.hp>0);
  const marks=navalDangerMarks(m,balance,project,width,height),mission=m.mission||{id:'fleet'},missionState=m.missionState||{completed:0,total:m.enemies.length},shown={marks:marks.length,icons:[],selected:selected?.index??null,feedback:null,texts:[]};
  const text=(value,x,y,maxWidth)=>{shown.texts.push(String(value));if(maxWidth)clippedText(p,value,x,y,maxWidth);else p.fillText(value,x,y);};
  drawDanger(p,marks,m.time,width,height);
  p.save();glass(p,16,16,204,58,12);vesselMark(p,41,38);
  p.direction='ltr';p.textAlign='right';p.font='bold 17px sans-serif';p.fillStyle='#f3f1e6';text(percent(m.lives,m.maxLives)+'%',207,44);bar(p,66,36,92,5,m.lives,m.maxLives,m.lives/m.maxLives<.35?'#e4a184':'#8edcc7');
  enemyMark(p,74,60);bar(p,90,58,117,4,m.enemyFleetHp,m.maxEnemyFleet,'#d5b77d');shown.icons.push('hull','fleet');
  let missionRect;
  if(width>=620){
    const w=Math.min(250,width-420),x=(width+96-w)/2;missionRect={x,y:16,w,h:58};glass(p,x,16,w,58,12);
    p.direction='rtl';p.textAlign='right';p.fillStyle='#f3f1e6';p.font='bold 14px sans-serif';text(translated(t,mission.title,'קרב ספינות'),x+w-14,38,w-70);
    // Objective as hull icons: sunk targets dim, remaining ones bright.
    const total=Math.max(1,missionState.total),step=Math.min(24,(w-84)/total);for(let i=0;i<total;i++)enemyMark(p,x+w-24-i*step,58,i<missionState.completed?'#5d6f74':'#e39b88');shown.icons.push('objective');
    p.direction='ltr';p.textAlign='left';p.fillStyle='#d8bd7a';p.font='bold 15px sans-serif';text(`${missionState.completed}/${missionState.total}`,x+14,59);p.fillStyle='#abc5cb';p.font='10px sans-serif';const seconds=Math.max(0,Math.ceil(m.remaining));text(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,x+14,36);
  }
  const targets=[];
  for(const enemy of m.enemies){
    if(!enemy.active||enemy.hp<=0)continue;
    const q=project(enemy.x,enemy.z,balance.render.effects.healthLift),edge=22;
    if(q.depth<=0||q.x<edge||q.x>width-edge||q.y<edge||q.y>config.height-edge){const x=q.depth<=0?width/2:Math.max(edge,Math.min(width-edge,q.x)),y=q.depth<=0?22:Math.max(96,Math.min(config.height-90,q.y));p.fillStyle='#ffcf79';p.beginPath();p.moveTo(x,y-5);p.lineTo(x-5,y+4);p.lineTo(x+5,y+4);p.closePath();p.fill();shown.icons.push('offscreen');continue;}
    targets.push({enemy,q});
  }
  for(const {enemy,q} of targets){
    const chosen=enemy===selected,priority=mission.id==='flagship'?enemy.boss:mission.id==='subhunt'?enemy.behavior==='dive':mission.id==='intercept'?enemy.behavior==='flank':false,x=Math.max(30,Math.min(width-30,q.x)),y=Math.max(90,q.y-8);
    p.fillStyle=chosen?'#092a3cee':'#092638c0';panel(p,x-28,y-6,56,10,5);bar(p,x-25,y-3,50,4,enemy.hp,enemy.maxHp,enemy.boss?'#ddbd78':chosen?'#a4ecd8':'#91bcb3');
    if(priority){p.fillStyle='#e7c77f';p.beginPath();p.moveTo(x-36,y-5);p.lineTo(x-32,y-1);p.lineTo(x-36,y+3);p.lineTo(x-40,y-1);p.closePath();p.fill();}
    if(chosen){const aim=project(enemy.x,enemy.z,1.1);if(aim.depth>0){p.strokeStyle=m.aiming?'#a4ecd8':'#e7c77f';p.lineWidth=1.6;p.beginPath();for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){p.moveTo(aim.x+sx*18,aim.y+sy*6);p.lineTo(aim.x+sx*18,aim.y+sy*11);p.lineTo(aim.x+sx*11,aim.y+sy*11);}p.stroke();}}
  }
  const feedback=m.lastFeedback,age=feedback?m.time-feedback.time:Infinity;
  if(m.resupplyTime>0){const u=Math.min(1,m.resupplyTime/2),q={x:width/2,y:height-70};p.save();p.strokeStyle='#e7cf9e';p.lineWidth=3;p.beginPath();p.arc(q.x,q.y,14,-Math.PI/2,-Math.PI/2+u*TAU);p.stroke();feedbackIcon(p,'resupply',{x:q.x,y:q.y+18},0);p.restore();shown.feedback='resupplying';}
  else if(feedback&&age>=0&&age<1.1){const q=feedback.x===undefined?{x:width/2,y:height/2,depth:1}:project(feedback.x,feedback.z,1.2);if(q.depth>0){feedbackIcon(p,feedback.kind,q,age/1.1);shown.feedback=feedback.kind;}}
  const target=project(m.aim.x,m.aim.z),end=project(m.aim.x+m.wind.x,m.aim.z+m.wind.z),angle=Math.atan2(end.y-target.y,end.x-target.x);
  if(!missionRect||missionRect.x>258){p.translate(239,35);p.fillStyle='#092a3ca6';p.beginPath();p.arc(0,0,13,0,TAU);p.fill();p.rotate(angle);p.strokeStyle='#e0e8df';p.lineWidth=1.6;const len=4+8*Math.min(1,Math.hypot(m.wind.x,m.wind.z)/90);p.beginPath();p.moveTo(-len,0);p.lineTo(len,0);p.lineTo(len-4,-3);p.moveTo(len,0);p.lineTo(len-4,3);p.stroke();shown.icons.push('wind');}p.restore();
  return shown;
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
