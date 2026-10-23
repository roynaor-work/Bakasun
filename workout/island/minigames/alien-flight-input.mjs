const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** A continuous horizontal deadzone. Unlike a second squaring in the movement
 * model, this keeps fine thumb input useful without a jump at the threshold. */
export function alienFlightAxis(value,deadzone=.12){
 const axis=clamp(Number(value)||0,-1,1),zone=clamp(Number(deadzone)||0,0,.4),magnitude=Math.abs(axis);
 if(magnitude<=zone)return 0;
 const t=(magnitude-zone)/(1-zone);return Math.sign(axis)*t*(.4+.6*t);
}

/** Pointer ownership and relative movement are independent of DOM and RAF. A
 * fresh contact anchors the current ship, including after cancellation/resume. */
export function createAlienFlightState({deadzone=.12,device='touch'}={}){
 let pointer=null,lastDevice=device;
 function reset(){const old=pointer;pointer=null;return old;}
 function move(event){
  if(!pointer||event.pointerId!==pointer.id||!Number.isFinite(event.clientX))return false;
  pointer.clientX=event.clientX;
  if(pointer.mode==='stick')pointer.moveX=alienFlightAxis((event.clientX-pointer.centerX)/pointer.radius,deadzone);
  else pointer.target=clamp(pointer.shipX+(event.clientX-pointer.startX)*pointer.scale,pointer.min,pointer.max);
  return true;
 }
 return {
  begin(event,{playerX,modelWidth,cssWidth,playerRadius=0,mode='drag',centerX=0,radius=48}={}){
   if(pointer||!Number.isFinite(event.clientX)||!Number.isFinite(playerX)||!Number.isFinite(modelWidth)||!(cssWidth>0))return false;
   lastDevice=event.pointerType||'mouse';pointer={id:event.pointerId,mode,device:lastDevice,shipX:playerX,startX:event.clientX,clientX:event.clientX,scale:modelWidth/cssWidth,min:playerRadius,max:modelWidth-playerRadius,target:playerX,moveX:0,centerX,radius:Math.max(1,radius)};
   if(mode==='stick')move(event);return true;
  },move,
  end(id){if(!pointer||pointer.id!==id)return false;reset();return true;},reset,
  keyboard(){lastDevice='keyboard';},
  sample(){return pointer?{active:true,id:pointer.id,mode:pointer.mode,device:pointer.device,moveX:pointer.moveX,...(pointer.mode==='drag'?{x:pointer.target}:{}),autoFire:pointer.device==='touch'||pointer.device==='pen'}:{active:false,mode:'idle',device:lastDevice,moveX:0,autoFire:false};}
 };
}

/** Alien-only pointer adapter. Shared controls still own the two action buttons
 * and keyboard. The existing broad stick zone becomes a relative flight surface
 * outside its visible stick, so touching it cannot pull the ship toward a thumb. */
export function createAlienFlightInput({canvas,controls,config,modelWidth,playerRadius,getPlayerX,onGesture=()=>{},onCancel=()=>{},windowTarget=globalThis.window}={}){
 const state=createAlienFlightState({...config,device:globalThis.matchMedia?.('(pointer:coarse)').matches?'touch':'keyboard'}),abort=new AbortController(),options={signal:abort.signal,capture:true};
 const stick=controls.querySelector('#joystick'),knob=controls.querySelector('#knob'),zone=controls.querySelector('.soccer-stick-zone');
 let enabled=false,captured=null;
 const display=(event,mode)=>{
  if(!knob||mode!=='stick')return;const rect=stick.getBoundingClientRect(),radius=Math.min(config.joystickRadius,rect.width/2),dx=clamp(event.clientX-(rect.left+rect.width/2),-radius,radius);
  knob.style.transform=`translate(${dx}px,0px)`;
 };
 function release(){const old=captured;captured=null;if(old)try{if(old.element.hasPointerCapture(old.id))old.element.releasePointerCapture(old.id);}catch{}}
 function reset(){state.reset();release();if(knob)knob.style.transform='translate(0px,0px)';}
 function down(event){
  // This adapter owns movement on the zone; never let the shared fixed-center
  // stick start a second gesture underneath the relative flight gesture.
  if(event.currentTarget===zone)event.stopImmediatePropagation();
  if(!enabled||state.sample().active||event.button>0)return;
  const rect=canvas.getBoundingClientRect(),stickRect=stick?.getBoundingClientRect(),radius=stickRect?Math.min(config.joystickRadius,stickRect.width/2):0;
  const insideStick=stickRect&&Math.hypot(event.clientX-stickRect.left-stickRect.width/2,event.clientY-stickRect.top-stickRect.height/2)<=radius+8;
  const mode=insideStick?'stick':'drag';
  if(!state.begin(event,{playerX:getPlayerX(),modelWidth,cssWidth:rect.width,playerRadius,mode,centerX:stickRect?stickRect.left+stickRect.width/2:0,radius}))return;
  event.preventDefault();onGesture();display(event,mode);
  try{event.currentTarget.setPointerCapture(event.pointerId);captured={element:event.currentTarget,id:event.pointerId};}catch{}
 }
 function move(event){if(event.currentTarget===zone)event.stopImmediatePropagation();if(!enabled||!state.move(event))return;event.preventDefault();display(event,state.sample().mode);}
 function end(event){if(event.currentTarget===zone)event.stopImmediatePropagation();if(!state.end(event.pointerId))return;release();if(knob)knob.style.transform='translate(0px,0px)';}
 function cancel(event){if(event.currentTarget===zone)event.stopImmediatePropagation();if(state.sample().id!==event.pointerId)return;reset();onCancel();}
 for(const target of [canvas,zone].filter(Boolean)){
  target.addEventListener('pointerdown',down,options);target.addEventListener('pointermove',move,options);target.addEventListener('pointerup',end,options);
  for(const type of ['pointercancel','lostpointercapture'])target.addEventListener(type,cancel,options);
 }
 // Capture can be unavailable on interrupted browser gestures; window release
 // still clears only the owner, and a second action finger cannot cancel it.
 windowTarget?.addEventListener('pointerup',end,options);windowTarget?.addEventListener('pointercancel',cancel,options);
 windowTarget?.addEventListener('keydown',event=>{if(enabled&&(event.code.startsWith('Arrow')||[config.kickKey,config.passKey].includes(event.code)))state.keyboard();},options);
 return {sample:()=>state.sample(),reset,setEnabled(value){enabled=Boolean(value);if(!enabled)reset();},dispose(){enabled=false;reset();abort.abort();}};
}
