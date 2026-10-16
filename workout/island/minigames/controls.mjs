export function createControls({root,config,onGesture=()=>{},onCancel=()=>{}}) {
  const abort=new AbortController(),options={signal:abort.signal};
  const stick=root.querySelector('#joystick'),knob=root.querySelector('#knob'),shoot=root.querySelector('#shoot'),swap=root.querySelector('#switch'),pass=root.querySelector('#pass'),sprint=root.querySelector('#sprint');
  const keys=new Set(),captures=new Map();let pointer=null,mx=0,mz=0,switchPulse=false,passPulse=false,enabled=false,rect=null;
  const heldPointers={kick:null,sprint:null};
  function capture(el,event){try{el.setPointerCapture(event.pointerId);captures.set(event.pointerId,el);}catch{}}
  function release(id){const el=captures.get(id);try{if(el?.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}captures.delete(id);}
  function reset(){pointer=null;heldPointers.kick=heldPointers.sprint=null;for(const id of captures.keys())release(id);mx=mz=0;switchPulse=passPulse=false;keys.clear();knob.style.transform='translate(0px,0px)';shoot.classList.remove('held');sprint?.classList.remove('held');onCancel();}
  function updateStick(event){
    const dx=event.clientX-(rect.left+rect.width/2),dz=event.clientY-(rect.top+rect.height/2),distance=Math.hypot(dx,dz),radius=Math.min(config.joystickRadius,rect.width/2);
    const scale=distance>radius?radius/distance:1;mx=dx*scale/radius;mz=dz*scale/radius;
    if(distance/radius<config.deadzone)mx=mz=0;
    knob.style.transform=`translate(${dx*scale}px,${dz*scale}px)`;
  }
  stick.addEventListener('pointerdown',event=>{if(!enabled||pointer!==null)return;event.preventDefault();onGesture();pointer=event.pointerId;rect=stick.getBoundingClientRect();capture(stick,event);updateStick(event);},options);
  stick.addEventListener('pointermove',event=>{if(event.pointerId===pointer){event.preventDefault();updateStick(event);}},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,event=>{if(event.pointerId===pointer){pointer=null;mx=mz=0;release(event.pointerId);knob.style.transform='translate(0px,0px)';}},options);
  for(const [node,key]of [[shoot,'kick'],[sprint,'sprint']])if(node){
    node.addEventListener('pointerdown',event=>{if(!enabled||heldPointers[key]!==null)return;event.preventDefault();onGesture();heldPointers[key]=event.pointerId;capture(node,event);node.classList.add('held');},options);
    node.addEventListener('pointerup',event=>{if(event.pointerId===heldPointers[key]){heldPointers[key]=null;release(event.pointerId);node.classList.remove('held');}},options);
    for(const type of ['pointercancel','lostpointercapture'])node.addEventListener(type,event=>{if(event.pointerId===heldPointers[key]){heldPointers[key]=null;node.classList.remove('held');onCancel();}},options);
  }
  for(const [node,action]of [[pass,()=>passPulse=true],[swap,()=>switchPulse=true]])node?.addEventListener('click',()=>{if(enabled){onGesture();action();node.blur();}},options);
  const actionKeys=[config.kickKey,config.passKey,config.switchKey,...config.sprintKeys];
  window.addEventListener('keydown',event=>{
    if(!enabled||event.target.matches('input,select,textarea,button'))return;
    if(event.code.startsWith('Arrow')||actionKeys.includes(event.code))event.preventDefault();
    if(event.repeat)return;
    onGesture();keys.add(event.code);
    if(event.code===config.passKey)passPulse=true;
    if(event.code===config.switchKey)switchPulse=true;
    if(event.code===config.kickKey)shoot.classList.add('held');
  },options);
  window.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code===config.kickKey)shoot.classList.remove('held');},options);
  window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
  for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,event=>event.preventDefault(),options);
  return {
    sample(direction=1,portrait=false){const input={moveX:(keys.has('ArrowRight')?1:keys.has('ArrowLeft')?-1:mx)*direction,moveZ:(keys.has('ArrowDown')?1:keys.has('ArrowUp')?-1:mz)*direction,kickHeld:heldPointers.kick!==null||keys.has(config.kickKey),passPressed:passPulse,sprintHeld:heldPointers.sprint!==null||config.sprintKeys.some(key=>keys.has(key)),switchPlayer:switchPulse};switchPulse=passPulse=false;if(portrait){const x=input.moveX;input.moveX=-input.moveZ;input.moveZ=x;}return input;},
    setEnabled(value){enabled=value;reset();},reset,
    setHanded(right){root.classList.toggle('left-handed',!right);reset();},
    dispose(){enabled=false;reset();abort.abort();}
  };
}
