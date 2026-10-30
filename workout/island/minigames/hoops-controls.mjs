/** Island Pro Basketball input. Left: a floating stick (it appears where the thumb lands, with a
 * dead zone and a soft response curve; pushed to the edge it sprints). Right: three actions,
 * shoot/jump (hold and release), pass/steal (tap = short pass, hold = long pass) and
 * move/switch. Top: timeout. Keyboard: WASD/arrows, Space shoot, E pass (hold = long),
 * Q move, Shift sprint, T timeout, 1/2/3 plays, Escape pause.
 * Every touch is locked to its pointerId; edges are queued and handed to the engine one per
 * fixed step, so the frame rate does not change what the engine receives. */
const DEFAULTS={deadZone:0.1,curve:1.15,fullTilt:0.78,autoSprint:0.93,longPass:0.32};

export function createHoopsControls({root,doc=root.ownerDocument,icons,labels,basis,onEscape,config={}}){
 const K={...DEFAULTS,...config};
 const win=doc.defaultView,abort=new AbortController(),on={signal:abort.signal};
 const now=()=>win.performance?.now?.()??Date.now();
 const edges=[],keys=new Set();let enabled=true,stick={x:0,y:0},stickPointer=null,center=null,lockB=null;
 const held={shoot:null,pass:null,alt:null};let shootKey=false,sprintKey=false,passKeyAt=null,passAt=null;
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const zone=node('div','hoops-stick-zone'),ring=node('div','hoops-stick'),knob=node('span','hoops-knob');
 ring.append(knob);zone.append(ring);zone.setAttribute('role','application');zone.setAttribute('aria-label',labels.stick);
 const pad=node('div','hoops-actions');
 const mk=(key,cls)=>{const b=node('button','hoops-action '+cls);b.type='button';b.dataset.gameControl=key;b.dataset.hoopsControl=key;return b;};
 const shoot=mk('shoot','hoops-shoot'),pass=mk('pass','hoops-pass'),alt=mk('alt','hoops-alt');
 pad.append(alt,pass,shoot);
 const top=node('div','hoops-topbar');const timeout=mk('timeout','hoops-small hoops-timeout');top.append(timeout);
 root.append(zone,pad,top);
 timeout.replaceChildren(icons('timeout'));timeout.setAttribute('aria-label',labels.timeout);timeout.title=labels.timeout;

 // floating stick: the ring jumps under the thumb, then the knob follows it
 function placeRing(x,y){
  const z=zone.getBoundingClientRect(),r=ring.offsetWidth/2||56;
  const lx=Math.max(r,Math.min(z.width-r,x-z.left)),ly=Math.max(r,Math.min(z.height-r,y-z.top));
  ring.style.left=`${lx}px`;ring.style.top=`${ly}px`;center={x:z.left+lx,y:z.top+ly};
 }
 function setStick(px,py){
  if(!center)return;
  const max=(ring.offsetWidth/2||56),reach=max*K.fullTilt;
  let dx=px-center.x,dy=py-center.y;const d=Math.hypot(dx,dy);
  const raw=Math.min(1,d/reach);
  const k=raw<=K.deadZone?0:Math.pow((raw-K.deadZone)/(1-K.deadZone),K.curve);
  stick=k===0?{x:0,y:0}:{x:dx/d*k,y:-dy/d*k};
  const show=Math.min(d,max*.62);knob.style.transform=d?`translate(${dx/d*show}px,${dy/d*show}px)`:'';
 }
 function releaseStick(){stickPointer=null;stick={x:0,y:0};center=null;knob.style.transform='';ring.style.left='';ring.style.top='';zone.classList.remove('active');}
 zone.addEventListener('pointerdown',e=>{if(!enabled||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;zone.setPointerCapture?.(e.pointerId);zone.classList.add('active');placeRing(e.clientX,e.clientY);setStick(e.clientX,e.clientY);},on);
 zone.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)setStick(e.clientX,e.clientY);},on);
 for(const t of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(t,e=>{if(e.pointerId===stickPointer)releaseStick();},on);

 const press=type=>edges.push({type});
 let mode='ball';
 function hold(button,key,down,up,cancel){
  button.addEventListener('pointerdown',e=>{if(!enabled||held[key]!==null)return;e.preventDefault();held[key]=e.pointerId;button.setPointerCapture?.(e.pointerId);button.classList.add('held');down?.();},on);
  button.addEventListener('pointerup',e=>{if(e.pointerId!==held[key])return;held[key]=null;button.classList.remove('held');up?.();},on);
  for(const t of ['pointercancel','lostpointercapture'])button.addEventListener(t,e=>{if(e.pointerId!==held[key])return;held[key]=null;button.classList.remove('held');cancel?.();},on);
  button.addEventListener('click',e=>{if(e.detail!==0||!enabled)return;down?.();up?.();},on);
  for(const t of ['contextmenu','selectstart','dragstart'])button.addEventListener(t,ev=>ev.preventDefault(),on);
 }
 hold(shoot,'shoot',()=>press('shootDown'),()=>press('shootUp'),()=>press('shootUp'));
 // with the ball the pass leaves on release: a tap is a short pass, a long hold a long one;
 // without the ball the same button steals (or calls for the ball) at once
 const passDown=()=>{if(mode==='ball')passAt=now();else press('passPress');};
 const passUp=()=>{if(passAt==null)return;const long=now()-passAt>=K.longPass*1000;passAt=null;press(long?'passLong':'passPress');};
 hold(pass,'pass',passDown,passUp,()=>{passAt=null;});
 hold(alt,'alt',()=>press('altPress'),null,null);
 timeout.addEventListener('click',()=>{if(enabled)press('timeoutPress');},on);
 for(const t of ['contextmenu','selectstart','dragstart'])zone.addEventListener(t,e=>e.preventDefault(),on);

 const MOVE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 win.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,textarea,select'))return;
  if(!enabled)return;
  if(MOVE.has(e.code)){e.preventDefault();keys.add(e.code);return;}
  if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!shootKey){shootKey=true;press('shootDown');}return;}
  if(e.code==='KeyE'){e.preventDefault();if(!e.repeat){if(mode==='ball')passKeyAt=now();else press('passPress');}return;}
  if(e.code==='KeyQ'){e.preventDefault();if(!e.repeat)press('altPress');return;}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){sprintKey=true;return;}
  if(e.code==='KeyT'&&!e.repeat){press('timeoutPress');return;}
  if(['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){press('call'+e.code.slice(-1));return;}
  if(e.code==='Escape'&&!e.repeat){e.preventDefault();onEscape?.();}
 },{...on,capture:true});
 win.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&shootKey){e.preventDefault();shootKey=false;press('shootUp');}if(e.code==='ShiftLeft'||e.code==='ShiftRight')sprintKey=false;
  if(e.code==='KeyE'&&passKeyAt!=null){const long=now()-passKeyAt>=K.longPass*1000;passKeyAt=null;press(long?'passLong':'passPress');}},{...on,capture:true});
 function keyStick(){const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),m=Math.hypot(x,y);return m?{x:x/m,y:y/m}:null;}

 function cancel(){
  const wasShoot=held.shoot!==null||shootKey;
  releaseStick();keys.clear();for(const k in held)held[k]=null;shootKey=sprintKey=false;passAt=passKeyAt=null;
  for(const b of [shoot,pass,alt])b.classList.remove('held');
  edges.length=0;if(wasShoot)edges.push({type:'shootUp'});
 }
 win.addEventListener('blur',cancel,on);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},on);
 const calls=['motion','pnr','iso'];let callIndex=0;
 let lastKey='';
 return {
  /** One input frame per engine step: the current stick and at most one queued edge. */
  consume(){
   const ks=keyStick(),s=ks||stick;
   // the screen directions are fixed when the thumb lands, so a camera move never bends a run
   const active=!!ks||stickPointer!==null;if(active&&!lockB)lockB=basis();if(!active)lockB=null;
   const b=lockB||basis();
   const tilt=Math.hypot(s.x,s.y),auto=!ks&&tilt>=K.autoSprint;
   const f={move:{x:s.x*b.rx+s.y*b.ux,z:s.x*b.rz+s.y*b.uz},sprint:auto||sprintKey,shootDown:false,shootUp:false,passPress:false,passLong:false,passDir:null,altPress:false,switchPress:false,timeoutPress:false,call:null};
   if(!enabled){f.move={x:0,z:0};f.sprint=false;return f;}
   const e=edges.shift();
   if(e){
    if(e.type==='passLong'){f.passPress=true;f.passLong=true;}
    else if(e.type.startsWith('call')&&e.type.length===5){callIndex=+e.type.slice(4)-1;f.call=calls[callIndex];}
    else f[e.type]=true;
   }
   return f;
  },
  /** Context icons: offence with the ball, offence without it, defence. */
  setMode(m){
   if(m!==mode&&passAt!=null&&m!=='ball')passAt=null;
   mode=m;
   if(m===lastKey)return;lastKey=m;
   const set=(b,icon,label)=>{b.replaceChildren(icons(icon));b.dataset.action=icon;b.setAttribute('aria-label',labels[label]||label);b.title=labels[label]||label;};
   if(m==='ball'){set(shoot,'shoot','shoot');set(pass,'pass','pass');set(alt,'cross','cross');}
   else if(m==='offense'){set(shoot,'jump','jump');set(pass,'pass','callForBall');set(alt,'switch','switch');}
   else {set(shoot,'block','block');set(pass,'steal','steal');set(alt,'switch','switch');}
  },
  setEnabled(v){enabled=!!v;for(const b of [shoot,pass,alt,timeout])b.disabled=!enabled;if(!enabled)cancel();},
  cancel,
  get held(){return {shoot:held.shoot!==null||shootKey,pass:held.pass!==null,alt:held.alt!==null,sprint:sprintKey||Math.hypot(stick.x,stick.y)>=K.autoSprint,stick:stickPointer!==null,queued:edges.length};},
  elements:{zone,ring,shoot,pass,alt,timeout,knob},
  dispose(){enabled=false;cancel();edges.length=0;abort.abort();},
 };
}
