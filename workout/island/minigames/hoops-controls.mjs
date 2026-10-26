/** Island Pro Basketball input. Left: multi-touch stick. Right: shoot/jump (hold and release),
 * pass/steal, move/switch, sprint (hold). Top: timeout and play call. Keyboard: WASD/arrows,
 * Space shoot, E pass, Q move, Shift sprint, T timeout, 1/2/3 plays, Escape pause.
 * Every touch is locked to its pointerId; edges are queued and handed to the engine one per
 * fixed step, so the frame rate does not change what the engine receives. */
export function createHoopsControls({root,doc=root.ownerDocument,icons,labels,basis,onEscape}){
 const win=doc.defaultView,abort=new AbortController(),on={signal:abort.signal};
 const edges=[],keys=new Set();let enabled=true,stick={x:0,y:0},stickPointer=null;
 const held={shoot:null,pass:null,alt:null,sprint:null};let shootKey=false,sprintKey=false;
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const zone=node('div','hoops-stick-zone'),ring=node('div','hoops-stick'),knob=node('span','hoops-knob');
 ring.append(knob);zone.append(ring);zone.setAttribute('role','application');zone.setAttribute('aria-label',labels.stick);
 const pad=node('div','hoops-actions');
 const mk=(key,cls)=>{const b=node('button','hoops-action '+cls);b.type='button';b.dataset.gameControl=key;b.dataset.hoopsControl=key;return b;};
 const shoot=mk('shoot','hoops-shoot'),pass=mk('pass','hoops-pass'),alt=mk('alt','hoops-alt'),sprint=mk('sprint','hoops-sprint');
 pad.append(sprint,alt,pass,shoot);
 const top=node('div','hoops-topbar');const timeout=mk('timeout','hoops-small hoops-timeout'),call=mk('call','hoops-small hoops-call');top.append(call,timeout);
 root.append(zone,pad,top);
 sprint.replaceChildren(icons('sprint'));sprint.setAttribute('aria-label',labels.sprint);sprint.title=labels.sprint;
 timeout.replaceChildren(icons('timeout'));timeout.setAttribute('aria-label',labels.timeout);timeout.title=labels.timeout;

 function setStick(cx0,cy0){
  const r=ring.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width/2;
  let dx=(cx0-cx)/max,dy=(cy0-cy)/max;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}
  stick=Math.hypot(dx,dy)<.12?{x:0,y:0}:{x:dx,y:-dy};knob.style.transform=`translate(${dx*max*.55}px,${dy*max*.55}px)`;
 }
 function releaseStick(){stickPointer=null;stick={x:0,y:0};knob.style.transform='';zone.classList.remove('active');}
 zone.addEventListener('pointerdown',e=>{if(!enabled||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;zone.setPointerCapture?.(e.pointerId);zone.classList.add('active');setStick(e.clientX,e.clientY);},on);
 zone.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)setStick(e.clientX,e.clientY);},on);
 for(const t of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(t,e=>{if(e.pointerId===stickPointer)releaseStick();},on);

 const press=type=>edges.push({type});
 function hold(button,key,down,up,cancel){
  button.addEventListener('pointerdown',e=>{if(!enabled||held[key]!==null)return;e.preventDefault();held[key]=e.pointerId;button.setPointerCapture?.(e.pointerId);button.classList.add('held');if(down)press(down);},on);
  button.addEventListener('pointerup',e=>{if(e.pointerId!==held[key])return;held[key]=null;button.classList.remove('held');if(up)press(up);},on);
  for(const t of ['pointercancel','lostpointercapture'])button.addEventListener(t,e=>{if(e.pointerId!==held[key])return;held[key]=null;button.classList.remove('held');if(cancel)press(cancel);},on);
  button.addEventListener('click',e=>{if(e.detail!==0||!enabled)return;if(down)press(down);if(up)press(up);},on);
  for(const t of ['contextmenu','selectstart','dragstart'])button.addEventListener(t,ev=>ev.preventDefault(),on);
 }
 hold(shoot,'shoot','shootDown','shootUp','shootUp');
 hold(pass,'pass','passPress',null,null);
 hold(alt,'alt','altPress',null,null);
 hold(sprint,'sprint',null,null,null);
 timeout.addEventListener('click',()=>{if(enabled)press('timeoutPress');},on);
 call.addEventListener('click',()=>{if(enabled)press('callNext');},on);
 for(const t of ['contextmenu','selectstart','dragstart'])zone.addEventListener(t,e=>e.preventDefault(),on);

 const MOVE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 win.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,textarea,select'))return;
  if(!enabled)return;
  if(MOVE.has(e.code)){e.preventDefault();keys.add(e.code);return;}
  if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!shootKey){shootKey=true;press('shootDown');}return;}
  if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)press('passPress');return;}
  if(e.code==='KeyQ'){e.preventDefault();if(!e.repeat)press('altPress');return;}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){sprintKey=true;return;}
  if(e.code==='KeyT'&&!e.repeat){press('timeoutPress');return;}
  if(['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){press('call'+e.code.slice(-1));return;}
  if(e.code==='Escape'&&!e.repeat){e.preventDefault();onEscape?.();}
 },{...on,capture:true});
 win.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&shootKey){e.preventDefault();shootKey=false;press('shootUp');}if(e.code==='ShiftLeft'||e.code==='ShiftRight')sprintKey=false;},{...on,capture:true});
 function keyStick(){const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),m=Math.hypot(x,y);return m?{x:x/m,y:y/m}:null;}

 function cancel(){
  const wasShoot=held.shoot!==null||shootKey;
  releaseStick();keys.clear();for(const k in held)held[k]=null;shootKey=sprintKey=false;
  for(const b of [shoot,pass,alt,sprint])b.classList.remove('held');
  edges.length=0;if(wasShoot)edges.push({type:'shootUp'});
 }
 win.addEventListener('blur',cancel,on);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},on);
 const calls=['motion','pnr','iso'];let callIndex=0,mode='ball';
 let lastKey='';
 return {
  /** One input frame per engine step: the current stick and at most one queued edge. */
  consume(){
   const s=keyStick()||stick,b=basis();
   const f={move:{x:s.x*b.rx+s.y*b.ux,z:s.x*b.rz+s.y*b.uz},sprint:held.sprint!==null||sprintKey,shootDown:false,shootUp:false,passPress:false,passDir:null,altPress:false,switchPress:false,timeoutPress:false,call:null};
   if(!enabled){f.move={x:0,z:0};f.sprint=false;return f;}
   const e=edges.shift();
   if(e){
    if(e.type==='callNext'&&mode==='defense'){f.call='defense';}
    else if(e.type==='callNext'){callIndex=(callIndex+1)%calls.length;f.call=calls[callIndex];}
    else if(e.type.startsWith('call')&&e.type.length===5){callIndex=+e.type.slice(4)-1;f.call=calls[callIndex];}
    else f[e.type]=true;
   }
   return f;
  },
  /** Context icons: offence with the ball, offence without it, defence. */
  setMode(m,{call:currentCall,defense}={}){
   mode=m;
   const key=mode+'|'+currentCall+'|'+defense;if(key===lastKey)return;lastKey=key;
   const set=(b,icon,label)=>{b.replaceChildren(icons(icon));b.dataset.action=icon;b.setAttribute('aria-label',labels[label]||label);b.title=labels[label]||label;};
   if(m==='ball'){set(shoot,'shoot','shoot');set(pass,'pass','pass');set(alt,'cross','cross');}
   else if(m==='offense'){set(shoot,'jump','jump');set(pass,'pass','callForBall');set(alt,'switch','switch');}
   else {set(shoot,'block','block');set(pass,'steal','steal');set(alt,'switch','switch');}
   const ic=m==='defense'?(defense==='zone'?'zone':'man'):(currentCall||'motion');
   set(call,ic,'call');call.dataset.mode=m;
  },
  setEnabled(v){enabled=!!v;for(const b of [shoot,pass,alt,sprint,timeout,call])b.disabled=!enabled;if(!enabled)cancel();},
  cancel,
  get held(){return {shoot:held.shoot!==null||shootKey,pass:held.pass!==null,alt:held.alt!==null,sprint:held.sprint!==null||sprintKey,stick:stickPointer!==null,queued:edges.length};},
  elements:{zone,shoot,pass,alt,sprint,timeout,call,knob},
  dispose(){enabled=false;cancel();edges.length=0;abort.abort();},
 };
}
