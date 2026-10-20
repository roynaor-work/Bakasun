import {createControls,createActionGesture} from './controls.mjs?v=g9-20261020-1';
/** G7 lifecycle and movement, with an independent lob drag. */
export function createTennisControls({root,config,onCancel=()=>{}}){
 const abort=new AbortController(),options={signal:abort.signal},lob=root.querySelector('#sprint'),drop=root.querySelector('#drop'),gesture=createActionGesture(config);let pointer=null,dropPointer=null,dropPulse=false,enabled=false,dropKey=false,releaseAim=null;
 const reset=()=>{pointer=null;dropPointer=null;dropPulse=dropKey=false;releaseAim=null;arrows.clear();drop?.classList.remove('held');gesture.reset();lob.querySelector('.action-direction')?.remove();onCancel();};
 const shared=createControls({root,config,onCancel:reset});
 // Read the stick during the release event, before a simultaneous second-thumb
 // release can reset it and before the next animation frame samples movement.
 const arrows=new Set();
 const rememberAim=()=>{const offsets=root.querySelector('#knob').style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/),radius=config.joystickRadius;
  let x=arrows.has('ArrowRight')?1:arrows.has('ArrowLeft')?-1:Number(offsets?.[1]||0)/radius,z=arrows.has('ArrowDown')?1:arrows.has('ArrowUp')?-1:Number(offsets?.[2]||0)/radius;
  const length=Math.hypot(x,z);if(length<config.deadzone)x=z=0;releaseAim={x:x/Math.max(1,length),z:z/Math.max(1,length),manual:Math.hypot(x,z)>0};};
 for(const node of [root.querySelector('#shoot'),lob,drop])node?.addEventListener('pointerup',rememberAim,options);
 lob.addEventListener('pointerdown',e=>{if(!lob.classList.contains('held'))return;pointer=e.pointerId;gesture.start('lob',e.clientX,e.clientY);},options);
 lob.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;gesture.move('lob',e.clientX,e.clientY);const aim=gesture.direction('lob');let arrow=lob.querySelector('.action-direction');if(aim.manual&&!arrow){arrow=document.createElement('span');arrow.className='action-direction';arrow.setAttribute('aria-hidden','true');lob.append(arrow);}if(arrow){arrow.hidden=!aim.manual;arrow.style.setProperty('--aim-angle',`${Math.atan2(aim.z,aim.x)}rad`);}},options);
 lob.addEventListener('pointerup',e=>{if(e.pointerId===pointer){gesture.move('lob',e.clientX,e.clientY);pointer=null;lob.querySelector('.action-direction')?.remove();}},options);
 drop?.addEventListener('pointerdown',e=>{if(!enabled||dropPointer!==null)return;e.preventDefault();dropPointer=e.pointerId;dropPulse=true;drop.setPointerCapture(e.pointerId);drop.classList.add('held');},options);
 drop?.addEventListener('pointerup',e=>{if(e.pointerId===dropPointer){dropPointer=null;drop.classList.remove('held');}},options);
 for(const type of ['pointercancel','lostpointercapture'])drop?.addEventListener(type,e=>{if(e.pointerId===dropPointer)reset();},options);
 window.addEventListener('keydown',e=>{if(!enabled||e.target.matches('input,select,textarea,button'))return;if(e.code.startsWith('Arrow'))arrows.add(e.code);if(e.code==='KeyD'){e.preventDefault();dropKey=true;}},options);
 window.addEventListener('keyup',e=>{arrows.delete(e.code);if(e.code==='KeyD')dropKey=false;if([config.kickKey,...config.sprintKeys,'KeyD'].includes(e.code))rememberAim();},options);
 return {...shared,setEnabled(value){enabled=Boolean(value);shared.setEnabled(value);},sample(){const dropHeld=dropPulse||dropPointer!==null||dropKey,shotAim=releaseAim;dropPulse=false;releaseAim=null;return {...shared.sample(),dropHeld,shotAim,lobAim:gesture.direction('lob')};},dispose(){shared.dispose();abort.abort();}};
}
