import {navalWaterAt} from './naval-camera.mjs?v=g9-20261020-1';
import {navalWeaponIcons} from './naval-icons.mjs?v=g9-20261020-1';
import {navalChargePower} from './g6e-ballistics.mjs?v=g9-20261020-1';
/** Session-only aim/charge adapter. The movement joystick remains independent. */
export function createNavalInput(ctx,getModel,getView){
 navalWeaponIcons(ctx.controls);
 const abort=new AbortController(),options={signal:abort.signal},fire=ctx.controls.querySelector('#shoot'),canvas=ctx.canvas;
 let gesture=null,release=null,queue=[],keyboard=false,keyboardClick=false,keyAt=0;
 const now=()=>performance.now(),reset=()=>{gesture=release=null;queue=[];keyboard=keyboardClick=false;ctx.controls.dataset.aiming='false';ctx.controls.dataset.charging='false';ctx.controls.style.setProperty('--naval-power','0%');};
 const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const begin=(e,sea=false)=>{if(gesture||e.button>0)return;const m=getModel(),view=getView(),point=view?.projectTarget(m.aim.x,m.aim.z)||m.screenPoint(m.aim.x,m.aim.z);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,sea,at:now(),bearing:m.yaw,point,camera:m.camera,width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height};if(sea)gesture.point=local(e);};
 const enqueue=at=>queue.push(navalChargePower((now()-at)/1000,ctx.balance));
 fire.addEventListener('keydown',e=>{if(!e.repeat&&e.code==='Enter'&&e.target===fire)keyboardClick=true;},options);
 fire.addEventListener('click',e=>{const valid=keyboardClick&&e.detail===0&&!['touch','mouse','pen'].includes(e.pointerType);keyboardClick=false;if(valid)queue.push(0);},options);
 window.addEventListener('pointerdown',()=>{keyboardClick=false;},options);
 fire.addEventListener('pointerdown',e=>begin(e),options);canvas.addEventListener('pointerdown',e=>begin(e,true),options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;release=gesture;if(!gesture.sea)enqueue(gesture.at);gesture=null;},options);
 for(const type of ['pointercancel','lostpointercapture'])window.addEventListener(type,e=>{if(gesture?.id===e.pointerId)reset();},options);
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select')){e.preventDefault();keyboard=true;keyAt=now();}},options);
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){enqueue(keyAt);keyboard=keyboardClick=false;}},options);
 window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
 return {reset,dispose(){reset();abort.abort();},sample(input){
   const m=getModel(),g=gesture||release,c=ctx.balance.controls,manual=g&&(g.sea||Math.hypot(g.dx,g.dy)>=c.aimDragThreshold),held=Boolean(gesture&&!gesture.sea||keyboard);
   const releasePower=queue.length?queue.shift():undefined;
   const holdPower=held?navalChargePower((now()-(gesture?.at??keyAt))/1000,ctx.balance):0;
   const out={...input,holdPower,firing:false,chargeHeld:held,releasePower,aimHeld:held,angularAim:false,autoAim:false,assistAim:false,yaw:undefined,targetX:undefined,targetZ:undefined};
   if(manual){const point=navalWaterAt(g.point.x+g.dx,g.point.y+g.dy,g.camera,g.width,g.height,ctx.balance);if(point){out.targetX=point.x;out.targetZ=point.z;}else out.yaw=g.bearing+g.dx*c.dragDegreesPerPixel*Math.PI/180;}
   ctx.controls.dataset.aiming=String(held);ctx.controls.dataset.charging=String(held);ctx.controls.style.setProperty('--naval-power',`${holdPower*100}%`);ctx.controls.style.setProperty('--naval-heat',`${m.heat*100}%`);ctx.controls.dataset.overheated=String(m.overheated);
   release=null;return out;
 }};
}
