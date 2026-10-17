import {navalWaterAt} from './naval-camera.mjs?v=g2j-20261019-1';
import {navalWeaponIcons} from './naval-icons.mjs?v=g2j-20261019-1';
/** Session-only gesture adapter. The shared G7 movement control stays in charge
 * of the joystick; this adapter supplies release-fire and screen-relative aim. */
export function createNavalInput(ctx,getModel,getView){
 navalWeaponIcons(ctx.controls);
 const abort=new AbortController(),options={signal:abort.signal},fire=ctx.controls.querySelector('#shoot'),canvas=ctx.canvas;
 let gesture=null,release=null,queued=0,keyboard=false;
 const reset=()=>{gesture=release=null;queued=0;keyboard=false;ctx.controls.dataset.aiming='false';};
 const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const begin=(e,sea=false)=>{if(gesture||e.button>0)return;const m=getModel(),view=getView(),point=view?.projectTarget(m.aim.x,m.aim.z)||m.screenPoint(m.aim.x,m.aim.z);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,sea,point,camera:m.camera,width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height};if(sea)gesture.point=local(e);};
 fire.addEventListener('click',e=>{if(e.detail===0)queued++;},options);
 fire.addEventListener('pointerdown',e=>begin(e),options);canvas.addEventListener('pointerdown',e=>begin(e,true),options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;release=gesture;if(!gesture.sea&&getModel().ammoIndex!==4)queued++;gesture=null;},options);
 for(const type of ['pointercancel','lostpointercapture'])window.addEventListener(type,e=>{if(gesture?.id===e.pointerId)reset();},options);
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select')){e.preventDefault();keyboard=true;}},options);
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){if(getModel().ammoIndex!==4)queued++;keyboard=false;}},options);
 window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
 return {reset,dispose(){reset();abort.abort();},sample(input){
   const m=getModel(),g=gesture||release,c=ctx.balance.controls,manual=g&&(g.sea||Math.hypot(g.dx,g.dy)>=c.aimDragThreshold),held=Boolean(gesture&&!gesture.sea||keyboard);
   // Preserve a neutral frame between rapid releases so the model sees each edge.
   const firing=m.ammoIndex===4?held:queued>0&&!m.triggerDown;if(firing&&m.ammoIndex!==4)queued--;
   const out={...input,firing,aimHeld:held,angularAim:false,autoAim:!manual,assistAim:Boolean(manual),targetX:undefined,targetZ:undefined};
   if(manual){const point=navalWaterAt(g.point.x+g.dx,g.point.y+g.dy,g.camera,g.width,g.height,ctx.balance);if(point){out.targetX=point.x;out.targetZ=point.z;}}
   ctx.controls.dataset.aiming=String(held);ctx.controls.style.setProperty('--naval-heat',`${m.heat*100}%`);ctx.controls.dataset.overheated=String(m.overheated);
   release=null;return out;
 }};
}
