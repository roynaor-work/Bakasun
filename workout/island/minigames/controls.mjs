export function createControls({root,config,onGesture=()=>{},onCancel=()=>{}}) {
  const abort=new AbortController(),options={signal:abort.signal};
  const stick=root.querySelector('#joystick'),knob=root.querySelector('#knob'),shoot=root.querySelector('#shoot'),swap=root.querySelector('#switch');
  const keys=new Set();let pointer=null,shootPointer=null,mx=0,mz=0,held=false,switchPulse=false,enabled=false,rect=null;
  const captures=new Map();
  function capture(el,event){try{el.setPointerCapture(event.pointerId);captures.set(event.pointerId,el);}catch{}}
  function release(id){const el=captures.get(id);try{if(el?.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}captures.delete(id);}
  function reset(){pointer=shootPointer=null;for(const id of captures.keys())release(id);mx=mz=0;held=false;switchPulse=false;keys.clear();knob.style.transform='translate(0px,0px)';shoot.classList.remove('held');onCancel();}
  function updateStick(event){
    const dx=event.clientX-(rect.left+rect.width/2),dz=event.clientY-(rect.top+rect.height/2),distance=Math.hypot(dx,dz),radius=config.joystickRadius;
    const scale=distance>radius?radius/distance:1;mx=dx*scale/radius;mz=dz*scale/radius;
    if(distance/radius<config.deadzone)mx=mz=0;
    knob.style.transform=`translate(${dx*scale}px,${dz*scale}px)`;
  }
  stick.addEventListener('pointerdown',event=>{if(!enabled||pointer!==null)return;event.preventDefault();onGesture();pointer=event.pointerId;rect=stick.getBoundingClientRect();capture(stick,event);updateStick(event);},options);
  stick.addEventListener('pointermove',event=>{if(event.pointerId===pointer){event.preventDefault();updateStick(event);}},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,event=>{if(event.pointerId===pointer){pointer=null;mx=mz=0;release(event.pointerId);knob.style.transform='translate(0px,0px)';}},options);
  shoot.addEventListener('pointerdown',event=>{if(!enabled||shootPointer!==null)return;event.preventDefault();onGesture();shootPointer=event.pointerId;held=true;capture(shoot,event);shoot.classList.add('held');},options);
  shoot.addEventListener('pointerup',event=>{if(event.pointerId===shootPointer){held=false;shootPointer=null;release(event.pointerId);shoot.classList.remove('held');}},options);
  for(const type of ['pointercancel','lostpointercapture'])shoot.addEventListener(type,event=>{if(event.pointerId===shootPointer){shootPointer=null;held=false;shoot.classList.remove('held');onCancel();}},options);
  swap.addEventListener('click',()=>{if(enabled){onGesture();switchPulse=true;swap.blur();}},options);
  window.addEventListener('keydown',event=>{
    if(!enabled||event.target.matches('input,select,textarea,button'))return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(event.code))event.preventDefault();
    if(event.code==='Space'){onGesture();held=true;shoot.classList.add('held');}
    if(event.code.startsWith('Shift')&&!event.repeat)switchPulse=true;
    keys.add(event.code);
  },options);
  window.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Space'){held=false;shoot.classList.remove('held');}},options);
  window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
  for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,event=>event.preventDefault(),options);
  return {
    sample(direction=1){const input={moveX:(keys.has('ArrowRight')?1:keys.has('ArrowLeft')?-1:mx)*direction,moveZ:(keys.has('ArrowDown')?1:keys.has('ArrowUp')?-1:mz)*direction,kickHeld:held,switchPlayer:switchPulse};switchPulse=false;return input;},
    setEnabled(value){enabled=value;reset();},reset,
    setHanded(right){root.classList.toggle('left-handed',!right);reset();},
    dispose(){enabled=false;reset();abort.abort();}
  };
}
