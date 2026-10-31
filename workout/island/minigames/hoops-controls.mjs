/** Basketball input: independent captured touches, explicit defence actions and a
 * held sprint button. Q/move taps cross over; holding for longMove seconds spins.
 * Space shoots/blocks, E passes/steals, R spins, F fakes, Shift sprints.
 * One queued edge reaches each fixed step; ownership changes discard stale actions. */
const DEFAULTS={deadZone:.1,curve:1.15,fullTilt:.78,autoSprint:.93,longPass:.32,longMove:.32};
const HE={stick:'תנועה',shoot:'זריקה',jump:'קפיצה לריבאונד',pass:'מסירה: לחיצה קצרה למסירה קרובה, ארוכה לרחוקה',callForBall:'בקשת כדור',move:'הצלבה בלחיצה קצרה, סיבוב בהחזקה',fake:'הטעיית זריקה',block:'חסימה',steal:'חטיפה',switch:'החלפה לשחקן הקרוב לכדור',sprint:'ספרינט בהחזקה',timeout:'פסק זמן'};
const MOVE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export function createHoopsControls({root,doc=root.ownerDocument,icons,labels={},basis=()=>({rx:1,rz:0,ux:0,uz:1}),onEscape,config={}}){
 const K={...DEFAULTS,...config},win=doc.defaultView,abort=new AbortController(),on={signal:abort.signal};
 const now=()=>win.performance?.now?.()??Date.now(),label=k=>labels[k]&&!labels[k].startsWith('hoops.')?labels[k]:(HE[k]||k);
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const edges=[],keys=new Set(),sprintKeys=new Set(),records=new Map();
 let enabled=true,disposed=false,mode='ball',paintedMode=null,stick={x:0,y:0},stickPointer=null,center=null,lockB=null,gestureId=0,shotSource=null,cancelShot=false,sprintTap=false;
 const zone=node('div','hoops-stick-zone'),ring=node('div','hoops-stick'),knob=node('span','hoops-knob');
 ring.append(knob);zone.append(ring);zone.setAttribute('role','application');zone.setAttribute('aria-label',label('stick'));
 const pad=node('div','hoops-actions'),top=node('div','hoops-topbar');pad.dir=top.dir='ltr';
 const elements={zone,ring,knob,pad,top};
 const all=['shoot','pass','move','fake','block','steal','switch','sprint','timeout'];
 for(const key of all){
  const button=node('button','hoops-action hoops-'+key+(key==='timeout'?' hoops-small':''));
  button.type='button';button.dataset.gameControl=key;button.dataset.hoopsControl=key;
  button.setAttribute('aria-label',label(key));button.title=label(key);button.replaceChildren(icons(key==='move'?'cross':key));
  const record={key,button,pointer:null,keyboard:null,gesture:null,at:null,sampled:false,suppressUntil:0};
  records.set(key,record);elements[key]=button;(key==='timeout'?top:pad).append(button);
 }
 // Kept as an API alias for tools that previously inspected the third action.
 elements.alt=elements.move;root.append(zone,pad,top);
 function releaseCapture(el,id){if(id!==null)try{if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);}catch{}}
 function releaseStick(){
  const pointer=stickPointer;stickPointer=null;stick={x:0,y:0};center=null;lockB=null;knob.style.transform='';ring.style.left='';ring.style.top='';zone.classList.remove('active');releaseCapture(zone,pointer);
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
  if(!enabled||disposed||stickPointer!==null||e.button>0)return;e.preventDefault();stickPointer=e.pointerId;
  try{zone.setPointerCapture?.(e.pointerId);}catch{}zone.classList.add('active');placeRing(e.clientX,e.clientY);setStick(e.clientX,e.clientY);
 },on);
 zone.addEventListener('pointermove',e=>{if(enabled&&e.pointerId===stickPointer)setStick(e.clientX,e.clientY);},on);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===stickPointer)releaseStick();},on);
 const busy=record=>record.pointer!==null||record.keyboard!==null;
 const valid=record=>enabled&&!disposed&&!record.button.hidden;
 function press(type,source){edges.push({type,source});}
 function sprintVisual(){
  const record=records.get('sprint'),held=busy(record)||sprintKeys.size>0;
  record.button.classList.toggle('held',held);record.button.setAttribute('aria-pressed',String(held));
 }
 function begin(record){
  record.gesture=++gestureId;record.at=now();record.sampled=false;record.button.classList.add('held');
  const key=record.key,source=record.gesture;
  if(key==='shoot'||key==='block')press('shootDown',source);
  else if(key==='steal')press('passPress',source);
  else if(key==='switch')press('switchPress',source);
  else if(key==='fake')press('fakePress',source);
  else if(key==='pass'&&mode!=='ball')press('passPress',source);
  else if(key==='timeout')press('timeoutPress',source);
  if(key==='sprint')sprintVisual();
 }
 function clearEdges(source){for(let i=edges.length-1;i>=0;i--)if(edges[i].source===source)edges.splice(i,1);}
 function end(record,cancelled=false){
  const key=record.key,source=record.gesture,elapsed=record.at===null?0:now()-record.at;
  const pointer=record.pointer;record.pointer=record.keyboard=record.gesture=null;record.at=null;record.button.classList.remove('held');releaseCapture(record.button,pointer);
  // A later cancelled hold must not erase an earlier completed tap on this button.
  if(cancelled){clearEdges(source);if(shotSource===source)cancelShot=true;}
  else if(key==='shoot'||key==='block')press('shootUp',source);
  else if(key==='pass'&&mode==='ball')press(elapsed>=K.longPass*1000?'passLong':'passPress',source);
  else if(key==='move')press(elapsed>=K.longMove*1000?'spinPress':'movePress',source);
  else if(key==='sprint'&&!record.sampled)sprintTap=true;
  if(key==='sprint')sprintVisual();
 }
 for(const record of records.values()){
  const {button}=record;
  button.addEventListener('pointerdown',e=>{
   if(!valid(record)||busy(record)||e.button>0)return;e.preventDefault();record.pointer=e.pointerId;
   try{button.setPointerCapture?.(e.pointerId);}catch{}begin(record);
  },on);
  button.addEventListener('pointerup',e=>{if(e.pointerId===record.pointer)end(record);},on);
  for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,e=>{if(e.pointerId===record.pointer)end(record,true);},on);
  button.addEventListener('keydown',e=>{
   if(!['Space','Enter'].includes(e.code)||!valid(record))return;e.preventDefault();
   record.suppressUntil=now()+1000;if(e.repeat||busy(record))return;record.keyboard=e.code;begin(record);
  },on);
  button.addEventListener('keyup',e=>{if(e.code===record.keyboard){e.preventDefault();record.suppressUntil=now()+1000;end(record);}},on);
  button.addEventListener('blur',()=>{if(record.keyboard!==null)end(record,true);},on);
  button.addEventListener('click',e=>{
   if(e.detail!==0||e.pointerType||!valid(record)||busy(record)||now()<record.suppressUntil)return;
   // Assistive activation is a complete tap; native pointer/keyboard compatibility
   // clicks belong to the captured gesture and are deliberately ignored.
   record.keyboard='assistive';begin(record);end(record);
  },on);
  for(const type of ['contextmenu','selectstart','dragstart'])button.addEventListener(type,e=>e.preventDefault(),on);
 }
 function keyboardRecord(code){
  if(code==='Space')return records.get(mode==='defense'?'block':'shoot');
  if(code==='KeyE')return records.get(mode==='defense'?'steal':'pass');
  if(code==='KeyQ')return records.get(mode==='ball'?'move':'switch');
  return null;
 }
 win.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,textarea,select,[contenteditable=true],[role=dialog]')||!enabled||disposed)return;
  if((e.code==='Space'||e.code==='Enter')&&e.target?.closest?.('button'))return;
  if(MOVE.has(e.code)){e.preventDefault();keys.add(e.code);return;}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){e.preventDefault();sprintKeys.add(e.code);sprintVisual();return;}
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
 win.addEventListener('blur',cancel,on);win.addEventListener('resize',cancel,on);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},on);
 for(const type of ['contextmenu','selectstart','dragstart'])zone.addEventListener(type,e=>e.preventDefault(),on);
 function keyStick(){
  const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),m=Math.hypot(x,y);
  return m?{x:x/m,y:y/m}:null;
 }
 function setMode(next){
  const nextMode=['ball','offense','defense'].includes(next)?next:'defense';
  if(disposed||nextMode===paintedMode)return;paintedMode=nextMode;
  if(nextMode!==mode)cancelActions(true);mode=nextMode;root.dataset.hoopsMode=mode;
  const visible=mode==='ball'?['shoot','pass','move','fake','sprint','timeout']:mode==='defense'?['block','steal','switch','sprint','timeout']:['shoot','pass','switch','sprint','timeout'];
  for(const record of records.values()){
   record.button.hidden=!visible.includes(record.key);record.button.disabled=!enabled||record.button.hidden;
   const icon=record.key==='move'?'cross':record.key==='shoot'&&mode==='offense'?'jump':record.key;
   const text=record.key==='shoot'&&mode==='offense'?label('jump'):record.key==='pass'&&mode==='offense'?label('callForBall'):label(record.key);
   record.button.dataset.action=icon;record.button.setAttribute('aria-label',text);record.button.title=text;record.button.replaceChildren(icons(icon));
  }
  sprintVisual();
 }
 setMode('ball');
 return {
  consume(){
   const ks=keyStick(),s=ks||stick,active=!!ks||stickPointer!==null;
   if(active&&!lockB)lockB=basis();if(!active)lockB=null;const b=lockB||basis();
   const auto=!ks&&Math.hypot(s.x,s.y)>=K.autoSprint;
   const frame={move:{x:s.x*b.rx+s.y*b.ux,z:s.x*b.rz+s.y*b.uz},sprint:auto||sprintKeys.size>0||busy(records.get('sprint'))||sprintTap,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,switchPress:false,movePress:false,spinPress:false,fakePress:false,timeoutPress:false,call:null};
   sprintTap=false;records.get('sprint').sampled=true;
   if(!enabled||disposed){frame.move={x:0,z:0};frame.sprint=false;}
   if(cancelShot){frame.shootCancel=true;cancelShot=false;shotSource=null;return frame;}
   if(!enabled||disposed)return frame;
   const edge=edges.shift();if(!edge)return frame;
   if(edge.type==='passLong'){frame.passPress=true;frame.passLong=true;}
   else if(edge.type.startsWith('call')&&edge.type.length===5)frame.call=['motion','pnr','iso'][+edge.type.slice(4)-1];
   else frame[edge.type]=true;
   if(edge.type==='shootDown')shotSource=edge.source;else if(edge.type==='shootUp')shotSource=null;
   return frame;
  },
  setMode,
  setEnabled(value){if(disposed)return;enabled=!!value;if(!enabled)cancel();for(const record of records.values())record.button.disabled=!enabled||record.button.hidden;},
  cancel,
  get held(){return {shoot:busy(records.get('shoot'))||busy(records.get('block')),pass:busy(records.get('pass'))||busy(records.get('steal')),alt:busy(records.get('move'))||busy(records.get('switch')),sprint:enabled&&(sprintKeys.size>0||busy(records.get('sprint'))||Math.hypot(stick.x,stick.y)>=K.autoSprint),stick:stickPointer!==null,queued:edges.length+(cancelShot?1:0)};},
  elements,
  dispose(){if(disposed)return;cancel();enabled=false;disposed=true;cancelShot=false;shotSource=null;edges.length=0;abort.abort();},
 };
}
