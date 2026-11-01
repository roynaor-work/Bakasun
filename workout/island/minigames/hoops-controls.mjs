/** Basketball input: independent captured touches, explicit defence actions and a
 * held sprint button. Q/move taps cross over; holding for longMove seconds spins.
 * Space shoots/blocks, E passes/steals, R spins, F fakes, Shift sprints.
 * One queued edge reaches each fixed step; ownership changes discard stale actions. */
import {create as createActionButton} from '../design/hud-kit/action-button.mjs';
import {validateHoopsControlsProfile} from './hoops-controls-profile.mjs';
export {loadHoopsControlsProfile} from './hoops-controls-profile.mjs';
const DEFAULTS={deadZone:.1,curve:1.15,fullTilt:.78,autoSprint:.93,longPass:.32,longMove:.32,swipeMin:24,swipeDominance:1.25,cancelOutside:24,sprintOff:.75,sprintHoldMs:0};
const HUD_ICONS={shoot:'shot',pass:'pass',move:'trick',fake:'block',block:'block',steal:'steal',switch:'play',sprint:'boost',timeout:'pause'};
const STATE={ball:'attack',offense:'off_ball',defense:'defense',inbound:'inbound',free_throw:'free_throw'};
const BUTTON_FOR={shoot:'shoot',pass:'pass',trick:'move',screen:'fake',call:'pass',play:'move',block:'block',steal:'steal',switch:'switch',sprint:'sprint'};
let controlsId=0;
const HE={stick:'תנועה',shoot:'זריקה',jump:'קפיצה לריבאונד',pass:'מסירה: לחיצה קצרה למסירה קרובה, ארוכה לרחוקה',callForBall:'בקשת כדור',move:'הצלבה בלחיצה קצרה, סיבוב בהחזקה',fake:'הטעיית זריקה',block:'חסימה',steal:'חטיפה',switch:'החלפה לשחקן הקרוב לכדור',sprint:'ספרינט בהחזקה',timeout:'פסק זמן'};
const MOVE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export function createHoopsControls({root,doc=root.ownerDocument,icons,labels={},basis=()=>({rx:1,rz:0,ux:0,uz:1}),onEscape,config={},profile}={}){
 const K={...DEFAULTS,...config},win=doc.defaultView,abort=new AbortController(),on={signal:abort.signal};
 const now=()=>win.performance?.now?.()??Date.now(),label=k=>labels[k]&&!labels[k].startsWith('hoops.')?labels[k]:(HE[k]||k);
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const edges=[],keys=new Set(),sprintKeys=new Set(),records=new Map();
 let enabled=true,disposed=false,mode='ball',paintedMode=null,stick={x:0,y:0},stickPointer=null,center=null,lockB=null,gestureId=0,shotSource=null,cancelShot=false,sprintTap=false,profileData=null,movementEnabled=true,sprintSince=null,autoSprinting=false,playIndex=0;
 const zone=node('div','hoops-stick-zone'),ring=node('div','hoops-stick'),knob=node('span','hoops-knob');
 ring.append(knob);zone.append(ring);zone.setAttribute('role','application');zone.setAttribute('aria-label',label('stick'));
 root.classList.add('ih-kit');root.dataset.theme='hoops';
 if(doc.head&&!doc.querySelector?.('[data-hoops-hud-kit]')){const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('../design/hud-kit/hud.css',import.meta.url).href;css.dataset.hoopsHudKit='true';doc.head.append(css);}
 const pad=node('div','hoops-actions hoops-authored-actions'),top=node('div','hoops-topbar');pad.dir=top.dir='ltr';
 const help=node('p','hoops-input-help');help.id='hoops-pass-help-'+(++controlsId);help.dir='rtl';help.textContent='מסירה: נגיעה לקרוב · החזקה לרחוק';
 const elements={zone,ring,knob,pad,top};
 const all=['shoot','pass','move','fake','block','steal','switch','sprint','timeout'];
 for(const key of all){
  const host=node('div','hoops-control-host hoops-host-'+key);
  const render={label:key==='move'?'תרגיל':key==='fake'?'פייק':key==='sprint'?'ריצה':label(key),icon:HUD_ICONS[key],disabled:false,loading:false,charge:0,visible:true};
  const hud=createActionButton(host,{primary:key==='shoot'||key==='block',label:render.label,icon:render.icon,initial:render});
  const button=host.children[0];button.classList.add('hoops-action','hoops-'+key);if(key==='timeout')button.classList.add('hoops-small');
  button.type='button';button.dataset.gameControl=key;button.dataset.hoopsControl=key;
  button.setAttribute('aria-label',label(key));button.title=label(key);if(key==='pass')button.setAttribute('aria-describedby',help.id);
  const record={key,button,host,hud,render,role:key,pointer:null,keyboard:null,gesture:null,at:null,sampled:false,suppressUntil:0,start:null,aim:null};
  records.set(key,record);elements[key]=button;(key==='timeout'?top:pad).append(host);
 }
 // Kept as an API alias for tools that previously inspected the third action.
 elements.alt=elements.move;elements.help=help;root.append(zone,pad,top,help);
 function releaseCapture(el,id){if(id!==null)try{if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);}catch{}}
 function releaseStick(){
  const pointer=stickPointer;stickPointer=null;stick={x:0,y:0};center=null;lockB=null;sprintSince=null;autoSprinting=false;knob.style.transform='';ring.style.left='';ring.style.top='';zone.classList.remove('active');releaseCapture(zone,pointer);
 }
 function placeRing(x,y){
  const z=zone.getBoundingClientRect(),r=ring.offsetWidth/2||52;
  const lx=Math.max(r,Math.min(z.width-r,x-z.left)),ly=Math.max(r,Math.min(z.height-r,y-z.top));
  ring.style.left=lx+'px';ring.style.top=ly+'px';center={x:z.left+lx,y:z.top+ly};
 }
 function setStick(px,py){
  if(!center)return;const max=ring.offsetWidth/2||52,reach=max*K.fullTilt,dx=px-center.x,dy=py-center.y,d=Math.hypot(dx,dy),raw=Math.min(1,d/reach);
  const k=raw<=K.deadZone?0:Math.pow((raw-K.deadZone)/(1-K.deadZone),K.curve);
  stick=k===0?{x:0,y:0}:{x:dx/d*k,y:-dy/d*k};
  const show=Math.min(d,max*.62);knob.style.transform=d?'translate('+dx/d*show+'px,'+dy/d*show+'px)':'';
 }
 zone.addEventListener('pointerdown',e=>{
  if(!enabled||disposed||!movementEnabled||stickPointer!==null||e.button>0)return;e.preventDefault();stickPointer=e.pointerId;
  try{zone.setPointerCapture?.(e.pointerId);}catch{}zone.classList.add('active');placeRing(e.clientX,e.clientY);setStick(e.clientX,e.clientY);
 },on);
 zone.addEventListener('pointermove',e=>{if(enabled&&e.pointerId===stickPointer)setStick(e.clientX,e.clientY);},on);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===stickPointer)releaseStick();},on);
 const busy=record=>record.pointer!==null||record.keyboard!==null;
 const valid=record=>enabled&&!disposed&&!record.button.hidden&&!record.button.disabled;
 function press(type,source){edges.push({type,source});}
 function renderRecord(record){
  const holding=busy(record),elapsed=record.at===null?0:Math.max(0,now()-record.at),passHold=holding&&record.role==='pass'&&(mode==='ball'||mode==='inbound');
  const long=passHold&&elapsed>=K.longPass*1000,render=record.render;
  render.label=long?'מסירה רחוקה':record.baseLabel||render.label;
  render.loading=passHold||holding&&record.key==='move'&&mode==='ball';
  render.charge=render.loading?Math.min(1,elapsed/(K.longPass*1000)):0;
  render.disabled=!enabled||record.unavailable===true;render.visible=!record.host.hidden;
  record.hud.update(render);const hold=long?'long':passHold?'short':'';if(record.button.dataset.hold!==hold)record.button.dataset.hold=hold;
  const aria=record.ariaLabel||label(record.key);if(record.button.getAttribute('aria-label')!==aria)record.button.setAttribute('aria-label',aria);if(record.button.title!==aria)record.button.title=aria;
 }
 function applyRect(host,rect){
  for(const side of ['left','right','top','bottom'])host.style[side]='';
  host.style.width=rect.width+'px';host.style.height=rect.height+'px';
  const x=rect.anchor_x==='right'?'right':'left',y=rect.anchor_y==='top'?'top':'bottom';
  host.style[x]='calc('+rect.offset_x+'px + var(--ih-safe-'+x+',env(safe-area-inset-'+x+',0px)))';
  host.style[y]='calc('+rect.offset_y+'px + var(--ih-safe-'+y+',env(safe-area-inset-'+y+',0px)))';
 }
 function layout(){
  if(!profileData)return;const bounds=root.getBoundingClientRect(),landscape=bounds.width>=bounds.height;
  const slots=profileData.hoops.layouts[landscape?'844x390':'390x844'].slots;
  applyRect(zone,slots.stick);zone.style.setProperty('--hoops-stick-size',slots.stick.width+'px');
  for(const record of records.values())if(record.slot&&slots[record.slot])applyRect(record.host,slots[record.slot]);
 }
 function setProfile(value){
  if(disposed)return;profileData=validateHoopsControlsProfile(value);const thresholds=profileData.interaction.gesture_thresholds;
  K.deadZone=thresholds.stick_dead_zone;K.longPass=K.longMove=thresholds.hold_from_ms/1000;K.swipeMin=thresholds.swipe_min_distance_px;K.swipeDominance=thresholds.swipe_axis_dominance;K.cancelOutside=thresholds.cancel_outside_action_px;
  K.autoSprint=thresholds.one_finger_sprint_on;K.sprintOff=thresholds.one_finger_sprint_off;K.sprintHoldMs=thresholds.one_finger_sprint_hold_ms;
  root.dataset.controlsProfile='design/controls/hoops.json';help.textContent='מסירה: קצרה בנגיעה · רחוקה בהחזקה';
  paintedMode=null;setMode(mode);layout();
 }
 function sprintVisual(){
  const record=records.get('sprint'),held=busy(record)||sprintKeys.size>0||autoSprinting;
  record.button.classList.toggle('held',held);record.button.setAttribute('aria-pressed',String(held));
 }
 function begin(record){
  record.gesture=++gestureId;record.at=now();record.sampled=false;record.button.classList.add('held');
  const key=record.key,source=record.gesture;
  if(key==='shoot'||key==='block')press('shootDown',source);
  else if(key==='steal')press('passPress',source);
  else if(key==='switch')press('switchPress',source);
  else if(key==='fake')press(record.role==='screen'?'call2':'fakePress',source);
  else if(key==='pass'&&mode!=='ball'&&mode!=='inbound')press('passPress',source);
  else if(key==='timeout')press('timeoutPress',source);
  if(key==='sprint')sprintVisual();renderRecord(record);
 }
 function clearEdges(source){for(let i=edges.length-1;i>=0;i--)if(edges[i].source===source)edges.splice(i,1);}
 function end(record,cancelled=false){
  const key=record.key,source=record.gesture,elapsed=record.at===null?0:now()-record.at,aim=record.aim;
  const pointer=record.pointer;record.pointer=record.keyboard=record.gesture=null;record.at=null;record.button.classList.remove('held');releaseCapture(record.button,pointer);
  // A later cancelled hold must not erase an earlier completed tap on this button.
  if(cancelled){clearEdges(source);if(shotSource===source)cancelShot=true;}
  else if(key==='shoot'||key==='block')press('shootUp',source);
  else if(key==='pass'&&(mode==='ball'||mode==='inbound')){press(elapsed>=K.longPass*1000?'passLong':'passPress',source);edges[edges.length-1].passAim=aim;}
  else if(key==='move'&&record.role==='play'){playIndex=(playIndex+1)%3;press('call'+(playIndex+1),source);}
  else if(key==='move')press(aim||elapsed>=K.longMove*1000?'spinPress':'movePress',source);
  else if(key==='sprint'&&!record.sampled)sprintTap=true;
  record.start=record.aim=null;if(key==='sprint')sprintVisual();renderRecord(record);
 }
 const actionOn={...on,capture:true};
 for(const record of records.values()){
  const {button}=record;
  button.addEventListener('pointerdown',e=>{
   if(!valid(record)||busy(record)||e.button>0)return;e.preventDefault();record.pointer=e.pointerId;
   record.start={x:e.clientX,y:e.clientY,rect:button.getBoundingClientRect(),basis:lockB||basis()};record.aim=null;
   try{button.setPointerCapture?.(e.pointerId);}catch{}begin(record);
  },actionOn);
  button.addEventListener('pointermove',e=>{
   if(e.pointerId!==record.pointer||!record.start)return;
   const start=record.start,dx=e.clientX-start.x,dy=e.clientY-start.y,ax=Math.abs(dx),ay=Math.abs(dy);
   if((record.key==='pass'||record.key==='move')&&Math.max(ax,ay)>=K.swipeMin&&Math.max(ax,ay)>=Math.min(ax,ay)*K.swipeDominance){
    const length=Math.hypot(dx,dy),x=dx/length,y=-dy/length,b=start.basis;record.aim={x:x*b.rx+y*b.ux,z:x*b.rz+y*b.uz};
   }
   const r=start.rect,outside=Math.max(r.left-e.clientX,e.clientX-(r.left+r.width),r.top-e.clientY,e.clientY-(r.top+r.height));
   if(outside>K.cancelOutside)end(record,true);
  },actionOn);
  button.addEventListener('pointerup',e=>{if(e.pointerId===record.pointer)end(record);},actionOn);
  for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,e=>{if(e.pointerId===record.pointer)end(record,true);},actionOn);
  button.addEventListener('keydown',e=>{
   if(!['Space','Enter'].includes(e.code)||!valid(record))return;e.preventDefault();
   record.suppressUntil=now()+1000;if(e.repeat||busy(record))return;record.keyboard=e.code;begin(record);
  },actionOn);
  button.addEventListener('keyup',e=>{if(e.code===record.keyboard){e.preventDefault();record.suppressUntil=now()+1000;end(record);}},actionOn);
  button.addEventListener('blur',()=>{if(record.keyboard!==null)end(record,true);},on);
  button.addEventListener('click',e=>{
   if(e.detail!==0||e.pointerType||!valid(record)||busy(record)||now()<record.suppressUntil)return;
   // Assistive activation is a complete tap; native pointer/keyboard compatibility
   // clicks belong to the captured gesture and are deliberately ignored.
   record.keyboard='assistive';begin(record);end(record);
  },actionOn);
  for(const type of ['contextmenu','selectstart','dragstart'])button.addEventListener(type,e=>e.preventDefault(),on);
 }
 function keyboardRecord(code){
  if(code==='Space')return records.get(mode==='defense'?'block':'shoot');
  if(code==='KeyE')return records.get(mode==='defense'?'steal':'pass');
  if(code==='KeyQ')return records.get(mode==='ball'||mode==='offense'&&profileData?'move':'switch');
  return null;
 }
 win.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,textarea,select,[contenteditable=true],[role=dialog]')||!enabled||disposed)return;
  if((e.code==='Space'||e.code==='Enter')&&e.target?.closest?.('button'))return;
  if(MOVE.has(e.code)){e.preventDefault();if(movementEnabled)keys.add(e.code);return;}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){e.preventDefault();if(valid(records.get('sprint')))sprintKeys.add(e.code);sprintVisual();return;}
  const record=keyboardRecord(e.code);
  if(record){e.preventDefault();if(e.repeat||busy(record)||!valid(record))return;record.keyboard=e.code;begin(record);return;}
  if(e.repeat)return;
  if(e.code==='KeyR'&&mode==='ball'){e.preventDefault();press('spinPress','shortcut');}
  else if(e.code==='KeyF'&&mode==='ball'){e.preventDefault();press('fakePress','shortcut');}
  else if(e.code==='KeyT'){e.preventDefault();press('timeoutPress','shortcut');}
  else if(['Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();press('call'+e.code.slice(-1),'shortcut');}
  else if(e.code==='Escape'){e.preventDefault();onEscape?.();}
 },{...on,capture:true});
 win.addEventListener('keyup',e=>{
  keys.delete(e.code);sprintKeys.delete(e.code);sprintVisual();
  // A release outside the formerly focused button still ends its keyboard hold.
  // Focused buttons handle their local keyup after this capture listener returns.
  const focusedButton=e.target?.closest?.('[data-hoops-control]');
  for(const record of records.values())if(record.keyboard===e.code&&focusedButton!==record.button){e.preventDefault();end(record);}
 },{...on,capture:true});
 function cancelActions(preserveSprint=false){
  for(const record of records.values())if(busy(record)&&(!preserveSprint||record.key!=='sprint'))end(record,true);
  edges.length=0;if(shotSource!==null)cancelShot=true;
  if(!preserveSprint){sprintKeys.clear();sprintTap=false;}sprintVisual();
 }
 function cancel(){cancelActions();releaseStick();keys.clear();}
 win.addEventListener('blur',cancel,on);win.addEventListener('resize',()=>{cancel();layout();},on);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},on);
 for(const type of ['contextmenu','selectstart','dragstart'])zone.addEventListener(type,e=>e.preventDefault(),on);
 function keyStick(){
  const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),m=Math.hypot(x,y);
  return m?{x:x/m,y:y/m}:null;
 }
 function setMode(next){
  const nextMode=Object.hasOwn(STATE,next)?next:'defense';
  if(disposed||nextMode===paintedMode)return;paintedMode=nextMode;
  if(nextMode!==mode){const open=['ball','offense','defense'];cancelActions(open.includes(mode)&&open.includes(nextMode));if(!open.includes(nextMode)||!open.includes(mode)){releaseStick();keys.clear();}}mode=nextMode;root.dataset.hoopsMode=mode;
  const state=profileData?.hoops.states[STATE[mode]],entries=state?.controls||[],byButton=new Map(entries.filter(entry=>BUTTON_FOR[entry.id]).map(entry=>[BUTTON_FOR[entry.id],entry]));
  const visible=state?[...byButton.keys(),'timeout']:mode==='ball'?['shoot','pass','move','fake','sprint','timeout']:mode==='defense'?['block','steal','switch','sprint','timeout']:['shoot','pass','switch','sprint','timeout'];
  movementEnabled=!state||!entries.find(entry=>entry.id==='stick')?.disabled;zone.setAttribute('aria-disabled',String(!movementEnabled));zone.tabIndex=movementEnabled?0:-1;if(!movementEnabled)releaseStick();
  for(const record of records.values()){
   const entry=byButton.get(record.key),source=entry&&profileData.hoops.controls[entry.id];
   record.role=entry?.id==='screen'&&mode==='ball'?'fake':entry?.id||record.key;record.slot=entry?.slot||null;record.unavailable=entry?.disabled===true;
   record.host.hidden=!visible.includes(record.key);
   const icon=record.key==='move'?'cross':record.key==='shoot'&&mode==='offense'?'jump':record.key;
   const text=record.key==='shoot'&&mode==='offense'?label('jump'):record.key==='pass'&&mode==='offense'?label('callForBall'):label(record.key);
   record.baseLabel=source?.label||(record.key==='move'?'תרגיל':record.key==='fake'?'פייק':record.key==='sprint'?'ריצה':text);
   if(record.role==='fake')record.baseLabel='פייק';record.ariaLabel=record.key==='pass'&&record.role==='pass'&&(mode==='ball'||mode==='inbound')?'מסירה קצרה בנגיעה; החזקה למסירה רחוקה':record.key==='move'&&mode==='ball'?label('move'):source?.aria_label||text;
   record.render.icon=source?.hud_kit.update.icon||HUD_ICONS[record.key];record.button.dataset.action=icon;renderRecord(record);
  }
  help.hidden=mode!=='ball'&&mode!=='inbound';sprintVisual();layout();
 }
 if(profile)setProfile(profile);else setMode('ball');
 return {
  consume(){
   const ks=keyStick(),s=ks||stick,active=!!ks||stickPointer!==null;
   if(active&&!lockB)lockB=basis();if(!active)lockB=null;const b=lockB||basis();
   const tilt=Math.hypot(s.x,s.y),sprintAvailable=valid(records.get('sprint'));
   if(!sprintAvailable){sprintSince=null;autoSprinting=false;}
   else if(!K.sprintHoldMs)autoSprinting=!ks&&tilt>=K.autoSprint;
   else if(ks||tilt<K.sprintOff){sprintSince=null;autoSprinting=false;}
   else if(!autoSprinting&&tilt>=K.autoSprint){if(sprintSince===null)sprintSince=now();if(now()-sprintSince>=K.sprintHoldMs)autoSprinting=true;}
   else if(!autoSprinting)sprintSince=null;
   const auto=autoSprinting;
   for(const record of records.values())if(busy(record)&&(record.key==='pass'||record.key==='move'))renderRecord(record);
   const frame={move:{x:s.x*b.rx+s.y*b.ux,z:s.x*b.rz+s.y*b.uz},sprint:sprintAvailable&&(auto||sprintKeys.size>0||busy(records.get('sprint'))||sprintTap),shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,switchPress:false,movePress:false,spinPress:false,fakePress:false,timeoutPress:false,call:null};
   sprintTap=false;records.get('sprint').sampled=true;
   if(!enabled||disposed){frame.move={x:0,z:0};frame.sprint=false;}
   if(cancelShot){frame.shootCancel=true;cancelShot=false;shotSource=null;return frame;}
   if(!enabled||disposed)return frame;
   const edge=edges.shift();if(!edge)return frame;
   if(edge.type==='passLong'){frame.passPress=true;frame.passLong=true;}
   else if(edge.type.startsWith('call')&&edge.type.length===5)frame.call=['motion','pnr','iso'][+edge.type.slice(4)-1];
   else frame[edge.type]=true;
   if(edge.passAim)frame.passDir=edge.passAim;
   if(edge.type==='shootDown')shotSource=edge.source;else if(edge.type==='shootUp')shotSource=null;
   return frame;
  },
  setMode,
  setProfile,
  setEnabled(value){if(disposed)return;enabled=!!value;if(!enabled)cancel();for(const record of records.values())renderRecord(record);},
  cancel,
  get held(){return {shoot:busy(records.get('shoot'))||busy(records.get('block')),pass:busy(records.get('pass'))||busy(records.get('steal')),alt:busy(records.get('move'))||busy(records.get('switch')),sprint:enabled&&(sprintKeys.size>0||busy(records.get('sprint'))||autoSprinting||!K.sprintHoldMs&&Math.hypot(stick.x,stick.y)>=K.autoSprint),stick:stickPointer!==null,queued:edges.length+(cancelShot?1:0)};},
  elements,
  dispose(){if(disposed)return;cancel();enabled=false;disposed=true;cancelShot=false;shotSource=null;edges.length=0;abort.abort();for(const record of records.values())record.hud.destroy();help.remove();root.classList.remove('ih-kit','hoops-controls');},
 };
}
