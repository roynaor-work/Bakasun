import {createControls,createActionGesture} from './controls.mjs?v=g9-20261020-1';
/** G7 lifecycle and movement, with an independent lob drag. */
export function createTennisControls({root,config,onCancel=()=>{}}){
 const abort=new AbortController(),options={signal:abort.signal},lob=root.querySelector('#sprint'),gesture=createActionGesture(config);let pointer=null;
 const reset=()=>{pointer=null;gesture.reset();lob.querySelector('.action-direction')?.remove();onCancel();};
 const shared=createControls({root,config,onCancel:reset});
 lob.addEventListener('pointerdown',e=>{if(!lob.classList.contains('held'))return;pointer=e.pointerId;gesture.start('lob',e.clientX,e.clientY);},options);
 lob.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;gesture.move('lob',e.clientX,e.clientY);const aim=gesture.direction('lob');let arrow=lob.querySelector('.action-direction');if(aim.manual&&!arrow){arrow=document.createElement('span');arrow.className='action-direction';arrow.setAttribute('aria-hidden','true');lob.append(arrow);}if(arrow){arrow.hidden=!aim.manual;arrow.style.setProperty('--aim-angle',`${Math.atan2(aim.z,aim.x)}rad`);}},options);
 lob.addEventListener('pointerup',e=>{if(e.pointerId===pointer){gesture.move('lob',e.clientX,e.clientY);pointer=null;lob.querySelector('.action-direction')?.remove();}},options);
 return {...shared,sample(){return {...shared.sample(),lobAim:gesture.direction('lob')};},dispose(){shared.dispose();abort.abort();}};
}
