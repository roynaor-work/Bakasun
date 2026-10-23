const pickupIds=['spread','laser','rapid','shield','wing','nova'];
const pickupNames=['ירי מניפה','לייזר','ירי מהיר','מגן','מלווים','טיל נוסף'];

/** Optional presentation readers; no model mutation or saved equipment changes. */
export function alienFlightHudStatus(model,mode='touch'){
 const laser=model.powerup===1||(model.upgrades?.laser||0)>0||(model.equipment?.weapon||0)>=2,rapid=model.powerup===2,spread=model.spreadTime>0;
 const weapon=spread?'spread':laser?'laser':rapid?'rapid':'normal';
 const names={normal:'תותח',spread:'ירי מניפה',laser:'לייזר',rapid:'ירי מהיר'};
 const extras=[];if(spread&&laser)extras.push('לייזר');if(spread&&rapid)extras.push('ירי מהיר');if(model.powerup===3)extras.push('מגן');
 const wings=model.wings?.filter(w=>w.active).length||0;if(wings)extras.push(wings===1?'מלווה':`${wings} מלווים`);
 return {weapon,weaponText:`נשק: ${names[weapon]}${extras.length?' · '+extras.join(' · '):''}`,
  controlText:mode==='keyboard'?'חצים לתנועה · רווח לירי':mode==='mouse'?'גרירה לתנועה · רווח לירי':mode==='stick'?'סטיק לתנועה ולירי':'גוררים לתנועה ולירי'};
}

export function alienFlightFeedbackText(feedback){
 if(!feedback||!(feedback.life>0))return null;
 if(feedback.kind==='pickup'){const value=Number(feedback.value);return pickupIds[value]?{id:feedback.id,text:pickupNames[value],pickup:pickupIds[value]}:null;}
 if(feedback.kind==='spread-cooldown')return {id:feedback.id,text:`ירי מניפה בטעינה · ${Math.ceil(feedback.value)} שנ׳`,pickup:null};
 if(feedback.kind==='wave')return {id:feedback.id,text:`גל ${feedback.value}`,pickup:null};
 if(feedback.kind==='boss-phase')return {id:feedback.id,text:'הבוס משנה התקפה',pickup:null};
 if(feedback.kind==='player-hit')return {id:feedback.id,text:'פגיעה בחללית',pickup:null};
 return null;
}

/** Stable icon/label nodes let the alien visual decorator add authored symbols
 * without a per-frame DOM replacement. All text stays outside the input plane. */
export function createAlienFlightHud({dialog,controls,documentTarget=globalThis.document}={}){
 const root=documentTarget.createElement('aside');root.className='alien-flight-hud';root.setAttribute('aria-label','מצב החללית');
 const guide=documentTarget.createElement('small');guide.className='alien-flight-control';
 const row=(className,live=false)=>{const node=documentTarget.createElement('div'),icon=documentTarget.createElement('span'),label=documentTarget.createElement('span');node.className=className;icon.dataset.alienHudIcon='true';icon.setAttribute('aria-hidden','true');label.dataset.alienHudLabel='true';node.append(icon,label);if(live){node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');}return {node,label};};
 const weapon=row('alien-flight-weapon'),feedback=row('alien-flight-feedback',true);feedback.node.hidden=true;root.append(guide,weapon.node,feedback.node);dialog.append(root);
 let lastId=null,message=null,until=0;
 const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 return {
  update(model,input,paused=false){
   root.hidden=Boolean(paused);root.dataset.side=controls.dataset.movementSide||'left';if(paused)return;
   const status=alienFlightHudStatus(model,input.active&&input.mode==='stick'?'stick':input.device),notice=alienFlightFeedbackText(model.feedback);
   text(guide,status.controlText);text(weapon.label,status.weaponText);if(weapon.node.dataset.alienWeapon!==status.weapon)weapon.node.dataset.alienWeapon=status.weapon;
   if(notice&&notice.id!==lastId){lastId=notice.id;message=notice;until=model.time+Math.max(1.4,model.feedback.life);}
   const visible=message&&model.time<until;feedback.node.hidden=!visible;
   if(visible){text(feedback.label,message.text);if(message.pickup)feedback.node.dataset.alienPickup=message.pickup;else delete feedback.node.dataset.alienPickup;}
  },
  setPaused(value){root.hidden=Boolean(value);},dispose(){root.remove();}
 };
}
