/** Radial remapping removes the centre jump while retaining full-speed diagonals. */
export function tennisStickVector(x,z,{deadzone=.08,responseExponent=1.3}={}){
 const length=Math.hypot(x,z),dead=Math.max(0,Math.min(.45,deadzone));
 if(!Number.isFinite(length)||length<=dead)return {x:0,z:0};
 const strength=((Math.min(1,length)-dead)/(1-dead))**Math.max(.5,Math.min(2.5,responseExponent));
 return {x:x/length*strength,z:z/length*strength};
}

/** Tennis owns its input state: two thumbs, independent aim and buffered edges.
 * Held fields retain the shared API; events preserve every tap between samples. */
export function createTennisControls({root,config,onGesture=()=>{},onCancel=()=>{},now=()=>performance.now()}){
 const abort=new AbortController(),options={signal:abort.signal},stick=root.querySelector('#joystick'),knob=root.querySelector('#knob'),zone=root.querySelector('.soccer-stick-zone')||stick;
 const nodes={hit:root.querySelector('#shoot'),serve:root.querySelector('#pass'),lob:root.querySelector('#sprint'),drop:root.querySelector('#drop')};
 const actions=Object.fromEntries(Object.keys(nodes).map(key=>[key,{pointer:null,keys:new Set(),gesture:null,started:0,serial:0}])),keys=new Set(),captures=new Map();
 const keyActions=new Map([[config.kickKey,'hit'],[config.passKey,'serve'],...(config.sprintKeys||[]).map(key=>[key,'lob']),[config.dropKey||'KeyD','drop']]);
 const radius=Math.max(24,Number(config.joystickRadius)||54),aimThreshold=Number(config.touchAimThreshold??config.aimDragThreshold)||18;
 let enabled=false,disposed=false,pointer=null,origin=null,movement={x:0,z:0},releasedMovement=null,events=[],previousHolding={hit:false,serve:false,lob:false,drop:false},serial=0,switchPulse=false;
 const held=action=>actions[action].pointer!==null||actions[action].keys.size>0;
 const holding=()=>Object.fromEntries(Object.keys(actions).map(action=>[action,held(action)]));
 function moveIntent(){const x=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),z=(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0);if(x||z){const length=Math.hypot(x,z);return {x:x/length,z:z/length};}return {...movement};}
 function aim(action,remember=false){
  const g=actions[action].gesture,length=g?Math.hypot(g.dx,g.dz):0;
  if(length>=aimThreshold)return {x:g.dx/length,z:g.dz/length,height:Math.max(0,Math.min(1,-g.dz/(config.aimHeightPixels||90))),manual:true};
  let v=moveIntent();if(remember&&!Math.hypot(v.x,v.z)&&releasedMovement&&now()-releasedMovement.at<=(config.releaseAimMemoryMs??80))v=releasedMovement;
  return Math.hypot(v.x,v.z)?{x:v.x,z:v.z,height:0,manual:true}:{x:1,z:0,height:0,manual:false};
 }
 function capture(node,event){try{node.setPointerCapture(event.pointerId);captures.set(event.pointerId,node);}catch{}}
 function release(id){const node=captures.get(id);captures.delete(id);try{if(node?.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}}
 function arrow(action){const node=nodes[action],direction=aim(action);let indicator=node?.querySelector('.action-direction');if(direction.manual&&actions[action].gesture&&Math.hypot(actions[action].gesture.dx,actions[action].gesture.dz)>=aimThreshold&&!indicator){indicator=root.ownerDocument.createElement('span');indicator.className='action-direction';indicator.setAttribute('aria-hidden','true');node.append(indicator);}if(indicator){indicator.hidden=!direction.manual;indicator.style.setProperty('--aim-angle',`${Math.atan2(direction.z,direction.x)}rad`);}}
 function start(action){const a=actions[action];a.started=now();a.serial=++serial;events.push({action,type:'press',aim:aim(action),heldSeconds:0,gesture:a.serial});nodes[action]?.classList.add('held');}
 function finish(action){const a=actions[action];events.push({action,type:'release',aim:aim(action,true),heldSeconds:Math.max(0,(now()-a.started)/1000),gesture:a.serial});nodes[action]?.classList.remove('held');nodes[action]?.querySelector('.action-direction')?.remove();}
 function clearMovement(remember=true){if(remember){const v=moveIntent();releasedMovement=Math.hypot(v.x,v.z)?{...v,at:now()}:null;}pointer=null;origin=null;movement={x:0,z:0};knob.style.transform='translate(0px,0px)';if(config.floating)stick.hidden=true;}
 function updateStick(event){if(!origin)return;const dx=event.clientX-origin.x,dz=event.clientY-origin.y,length=Math.hypot(dx,dz),scale=length>radius?radius/length:1;movement=tennisStickVector(dx/radius,dz/radius,config);releasedMovement=null;knob.style.transform=`translate(${dx*scale}px,${dz*scale}px)`;}
 function reset(){
  pointer=null;for(const [action,a]of Object.entries(actions)){a.pointer=null;a.keys.clear();a.gesture=null;nodes[action]?.classList.remove('held');nodes[action]?.querySelector('.action-direction')?.remove();}
  keys.clear();events=[];previousHolding={hit:false,serve:false,lob:false,drop:false};releasedMovement=null;switchPulse=false;clearMovement(false);for(const id of [...captures.keys()])release(id);onCancel();
 }
 function cancelAction(action){const a=actions[action],id=a.pointer;a.pointer=null;a.keys.clear();events=events.filter(event=>event.gesture!==a.serial);a.gesture=null;nodes[action]?.classList.remove('held');nodes[action]?.querySelector('.action-direction')?.remove();release(id);onCancel();}
 zone.addEventListener('pointerdown',event=>{if(!enabled||pointer!==null||event.button>0||captures.has(event.pointerId))return;event.preventDefault();onGesture();pointer=event.pointerId;
  if(config.floating){const box=zone.getBoundingClientRect();stick.hidden=false;stick.style.left=`${event.clientX-box.left}px`;stick.style.top=`${event.clientY-box.top}px`;origin={x:event.clientX,y:event.clientY};}
  else{const box=stick.getBoundingClientRect();origin={x:box.left+box.width/2,y:box.top+box.height/2};}
  capture(zone,event);updateStick(event);
 },options);
 for(const [action,node]of Object.entries(nodes))if(node){
  node.addEventListener('pointerdown',event=>{const a=actions[action];if(!enabled||a.pointer!==null||event.button>0||captures.has(event.pointerId))return;event.preventDefault();onGesture();const wasHeld=held(action);a.pointer=event.pointerId;a.gesture={x:event.clientX,z:event.clientY,dx:0,dz:0};if(!wasHeld)start(action);capture(node,event);},options);
  node.addEventListener('keydown',event=>{if(!enabled||!['Space','Enter'].includes(event.code))return;event.preventDefault();const token='button:'+event.code,a=actions[action];if(event.repeat||a.keys.has(token))return;onGesture();const wasHeld=held(action);a.keys.add(token);if(!wasHeld){a.gesture=null;start(action);}},options);
  node.addEventListener('blur',()=>{if([...actions[action].keys].some(key=>key.startsWith('button:')))cancelAction(action);},options);
 }
 function movePointer(event){if(event.pointerId===pointer){event.preventDefault();updateStick(event);return;}for(const [action,a]of Object.entries(actions))if(a.pointer===event.pointerId){event.preventDefault();a.gesture.dx=event.clientX-a.gesture.x;a.gesture.dz=event.clientY-a.gesture.z;arrow(action);return;}}
 function endPointer(event,cancelled=false){
  if(event.pointerId===pointer){event.preventDefault();const id=pointer;clearMovement(!cancelled);release(id);return;}
  for(const [action,a]of Object.entries(actions))if(a.pointer===event.pointerId){event.preventDefault();if(cancelled){cancelAction(action);return;}a.gesture.dx=event.clientX-a.gesture.x;a.gesture.dz=event.clientY-a.gesture.z;a.pointer=null;if(!held(action))finish(action);release(event.pointerId);return;}
 }
 // Window listeners also close a gesture safely if capture is unavailable.
 for(const node of [zone,...Object.values(nodes).filter(Boolean)]){
  node.addEventListener('pointermove',movePointer,options);node.addEventListener('pointerup',event=>endPointer(event),options);
  for(const type of ['pointercancel','lostpointercapture'])node.addEventListener(type,event=>endPointer(event,true),options);
 }
 const target=root.ownerDocument?.defaultView||window,doc=root.ownerDocument||document;
 target.addEventListener('pointermove',movePointer,options);target.addEventListener('pointerup',event=>endPointer(event),options);target.addEventListener('pointercancel',event=>endPointer(event,true),options);
 target.addEventListener('keydown',event=>{if(!enabled||event.target?.matches?.('input,select,textarea,button,[contenteditable=true]'))return;const action=keyActions.get(event.code),arrowKey=event.code.startsWith('Arrow');if(!action&&!arrowKey&&event.code!==config.switchKey)return;event.preventDefault();if(event.repeat||keys.has(event.code))return;onGesture();keys.add(event.code);if(arrowKey)releasedMovement=null;if(action){const active=held(action);actions[action].keys.add(event.code);if(!active){actions[action].gesture=null;start(action);}}if(event.code===config.switchKey)switchPulse=true;},options);
 target.addEventListener('keyup',event=>{const v=moveIntent();keys.delete(event.code);if(event.code.startsWith('Arrow')&&Math.hypot(v.x,v.z))releasedMovement={...v,at:now()};const action=keyActions.get(event.code);if(action&&actions[action].keys.delete(event.code)&&!held(action))finish(action);for(const [name,a]of Object.entries(actions))if(a.keys.delete('button:'+event.code)&&!held(name))finish(name);},options);
 target.addEventListener('blur',reset,options);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();},options);
 for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,event=>event.preventDefault(),options);
 return {
  sample(direction=1,portrait=false){const transform=v=>{let x=v.x*direction,z=v.z*direction;if(portrait)[x,z]=[-z,x];return {...v,x,z};},v=transform(moveIntent()),active=holding(),pending=events;events=[];const queued=pending.map(event=>({...event,aim:transform(event.aim)})),pressed=action=>pending.some(event=>event.action===action&&event.type==='press');
   const input={moveX:v.x,moveZ:v.z,kickHeld:active.hit||pressed('hit'),passHeld:active.serve||pressed('serve'),sprintHeld:active.lob||pressed('lob'),dropHeld:active.drop||pressed('drop'),kickAim:transform(aim('hit')),passAim:transform(aim('serve')),lobAim:transform(aim('lob')),shotAim:queued.findLast(event=>event.action!=='serve'&&event.type==='release')?.aim||null,holding:active,previousHolding:{...previousHolding},events:queued,switchPlayer:switchPulse};previousHolding={...active};switchPulse=false;return input;
  },
  setEnabled(value){enabled=Boolean(value)&&!disposed;reset();},reset,
  setHanded(right){root.dataset.movementSide=right?'left':'right';root.dataset.actionSide=right?'right':'left';root.classList.toggle('left-handed',!right);reset();},
  dispose(){if(disposed)return;disposed=true;enabled=false;reset();abort.abort();}
 };
}

/** Deliver buffered edges at zero simulation time, then one continuous sample.
 * A press/release entirely between frames therefore never becomes a lost tap. */
export function applyTennisSample(model,sample,dt){
 const active={...sample.previousHolding},base={move:sample.moveX,moveZ:sample.moveZ};
 const input=(extra={})=>({...base,serve:Boolean(active.serve),prepare:Boolean(active.hit||active.lob||active.drop),lob:Boolean(active.lob),drop:Boolean(active.drop),aim:sample.passAim,...extra});
 for(const event of sample.events){
  active[event.action]=event.type==='press';
  if(event.action==='serve')model.update(0,input({aim:event.aim}));
  else if(event.type==='release'){model.update(0,input({swing:true,lob:event.action==='lob',drop:event.action==='drop',aim:event.aim}));model.update(0,input({swing:false}));}
 }
 Object.assign(active,sample.holding);
 const length=Math.hypot(sample.moveX,sample.moveZ),stickAim={x:sample.moveX,z:sample.moveZ,manual:length>0};
 return model.update(dt,input({aim:model.getState().phase==='rally'?stickAim:sample.passAim,swing:false}));
}
