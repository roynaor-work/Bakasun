/** Reusable action aiming in screen coordinates. Movement and aim have separate
 * state. An adapter supplies automatic intent (goal, opposite court, enemy).
 * sample() converts both to world coordinates; consumers retain aim on release. */
export function actionDirection(gesture,automatic,config,direction=1){
  const dx=gesture?.dx||0,dz=gesture?.dy||0,length=Math.hypot(dx,dz),manual=length>=config.aimDragThreshold;
  const fallback=automatic||{x:direction,z:0},normal=Math.hypot(fallback.x,fallback.z)||1;
  return manual?{x:dx/length*direction,z:dz/length*direction,height:Math.max(0,Math.min(1,-dz/config.aimHeightPixels)),manual:true}:{x:fallback.x/normal,z:fallback.z/normal,height:0,manual:false};
}
export function createActionGesture(config){
  const actions=new Map();
  return {start(action,x,y){actions.set(action,{x,y,dx:0,dy:0});},move(action,x,y){const g=actions.get(action);if(g){g.dx=x-g.x;g.dy=y-g.y;}},direction(action,automatic,direction=1){return actionDirection(actions.get(action),automatic,config,direction);},reset(){actions.clear();}};
}
export function controlSides(right){return {movement:right?'left':'right',actions:right?'right':'left'};}
export function createControls({root,config,onGesture=()=>{},onCancel=()=>{},autoAim}={}) {
  const abort=new AbortController(),options={signal:abort.signal};
  const stick=root.querySelector('#joystick'),knob=root.querySelector('#knob'),shoot=root.querySelector('#shoot'),swap=root.querySelector('#switch'),pass=root.querySelector('#pass'),sprint=root.querySelector('#sprint');
  const stickZone=root.querySelector('.soccer-stick-zone')||stick;
  const keys=new Set(),captures=new Map();let pointer=null,mx=0,mz=0,switchPulse=false,enabled=false,rect=null;
  const heldPointers={kick:null,sprint:null,pass:null},pulses={kick:false,sprint:false,pass:false};
  const gestures=createActionGesture(config);
  function capture(el,event){try{el.setPointerCapture(event.pointerId);captures.set(event.pointerId,el);}catch{}}
  function release(id){const el=captures.get(id);try{if(el?.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}captures.delete(id);}
  function reset(){gestures.reset();root.querySelectorAll('.action-direction').forEach(n=>n.remove());pulses.kick=pulses.pass=pulses.sprint=false;pointer=null;heldPointers.kick=heldPointers.sprint=heldPointers.pass=null;for(const id of captures.keys())release(id);mx=mz=0;switchPulse=false;keys.clear();knob.style.transform='translate(0px,0px)';if(config.floating)stick.hidden=true;shoot.classList.remove('held');sprint?.classList.remove('held');pass?.classList.remove('held');onCancel();}
  function updateStick(event){
    const dx=event.clientX-(rect.left+rect.width/2),dz=event.clientY-(rect.top+rect.height/2),distance=Math.hypot(dx,dz),radius=Math.min(config.joystickRadius,rect.width/2);
    const scale=distance>radius?radius/distance:1;mx=dx*scale/radius;mz=dz*scale/radius;
    if(distance/radius<config.deadzone)mx=mz=0;
    knob.style.transform=`translate(${dx*scale}px,${dz*scale}px)`;
  }
  stickZone.addEventListener('pointerdown',event=>{if(!enabled||pointer!==null)return;event.preventDefault();onGesture();pointer=event.pointerId;
    if(config.floating){const zone=stickZone.getBoundingClientRect();stick.hidden=false;stick.style.left=`${event.clientX-zone.left}px`;stick.style.top=`${event.clientY-zone.top}px`;}
    rect=stick.getBoundingClientRect();capture(stickZone,event);updateStick(event);},options);
  stickZone.addEventListener('pointermove',event=>{if(event.pointerId===pointer){event.preventDefault();updateStick(event);}},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stickZone.addEventListener(type,event=>{if(event.pointerId===pointer){pointer=null;mx=mz=0;release(event.pointerId);knob.style.transform='translate(0px,0px)';if(config.floating)stick.hidden=true;}},options);
  for(const [node,key]of [[shoot,'kick'],[sprint,'sprint'],[pass,'pass']])if(node){
    node.addEventListener('pointerdown',event=>{if(!enabled||heldPointers[key]!==null)return;event.preventDefault();onGesture();gestures.start(key,event.clientX,event.clientY);heldPointers[key]=event.pointerId;pulses[key]=true;capture(node,event);node.classList.add('held');},options);
    node.addEventListener('pointermove',event=>{if(event.pointerId!==heldPointers[key]||key==='sprint')return;event.preventDefault();gestures.move(key,event.clientX,event.clientY);const aim=gestures.direction(key),manual=aim.manual;let arrow=node.querySelector('.action-direction');if(manual&&!arrow){arrow=document.createElement('span');arrow.className='action-direction';arrow.setAttribute('aria-hidden','true');node.append(arrow);}if(arrow){arrow.hidden=!manual;arrow.style.setProperty('--aim-angle',`${Math.atan2(aim.z,aim.x)}rad`);}},options);
    node.addEventListener('pointerup',event=>{if(event.pointerId===heldPointers[key]){gestures.move(key,event.clientX,event.clientY);heldPointers[key]=null;release(event.pointerId);node.classList.remove('held');node.querySelector('.action-direction')?.remove();}},options);
    for(const type of ['pointercancel','lostpointercapture'])node.addEventListener(type,event=>{if(event.pointerId===heldPointers[key]){heldPointers[key]=null;pulses[key]=false;gestures.start(key,0,0);node.querySelector('.action-direction')?.remove();node.classList.remove('held');onCancel();}},options);
  }
  for(const [node,action]of [[swap,()=>switchPulse=true]])node?.addEventListener('click',()=>{if(enabled){onGesture();action();node.blur();}},options);
  const actionKeys=[config.kickKey,config.passKey,config.switchKey,...config.sprintKeys];
  window.addEventListener('keydown',event=>{
    if(!enabled||event.target.matches('input,select,textarea,button'))return;
    if(event.code.startsWith('Arrow')||actionKeys.includes(event.code))event.preventDefault();
    if(event.repeat)return;
    onGesture();keys.add(event.code);if(event.code===config.kickKey){gestures.start('kick',0,0);pulses.kick=true;}if(event.code===config.passKey){gestures.start('pass',0,0);pulses.pass=true;}if(config.sprintKeys.includes(event.code))pulses.sprint=true;
    if(event.code===config.switchKey)switchPulse=true;
    if(event.code===config.kickKey)shoot.classList.add('held');
  },options);
  window.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code===config.kickKey)shoot.classList.remove('held');},options);
  window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
  for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,event=>event.preventDefault(),options);
  return {
    sample(direction=1,portrait=false){const input={moveX:(keys.has('ArrowRight')?1:keys.has('ArrowLeft')?-1:mx)*direction,moveZ:(keys.has('ArrowDown')?1:keys.has('ArrowUp')?-1:mz)*direction,kickHeld:pulses.kick||heldPointers.kick!==null||keys.has(config.kickKey),passHeld:pulses.pass||heldPointers.pass!==null||keys.has(config.passKey),sprintHeld:pulses.sprint||heldPointers.sprint!==null||config.sprintKeys.some(key=>keys.has(key)),switchPlayer:switchPulse,kickAim:gestures.direction('kick',autoAim?.('kick'),direction),passAim:gestures.direction('pass',autoAim?.('pass'),direction)};pulses.kick=pulses.pass=pulses.sprint=false;switchPulse=false;if(portrait){const x=input.moveX;input.moveX=-input.moveZ;input.moveZ=x;}return input;},
    setEnabled(value){enabled=value;reset();},reset,
    setHanded(right){const sides=controlSides(right);root.dataset.movementSide=sides.movement;root.dataset.actionSide=sides.actions;root.classList.toggle('left-handed',!right);reset();},
    dispose(){enabled=false;reset();abort.abort();}
  };
}
