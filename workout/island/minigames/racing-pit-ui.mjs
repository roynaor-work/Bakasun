// racing-v24 pit stop HUD (DOM only; the stop itself is racing-pit.mjs): a tyre wear meter next to the speedometer, a "פיטס" button with the controls, the big tyre
// change button while the car stands in its box (a tap starts the 2 s change; after 0.8 s it starts by itself, so a 7-year-old is never stuck there), and a "פיטס"
// tag on the cars of the timing tower that are in the pit lane. Off with the race (?racingPit=0, or a race of fewer than 3 laps: nothing is created).
// racing-v24: the Codex icons (design/racing-pit-v1, CC0; assets/racing-pit-v1/icons): four tyre wear steps, the pit entry and the wheel change
const phoneFixDEnabled=()=>{try{const p=new URLSearchParams(globalThis.location?.search||'');return p.get('phoneFixes')!=='0'&&p.get('phoneFixD')!=='0';}catch{return true;}};
import {kidUx, kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-26';

const ICONS=new URL('../assets/racing-pit-v1/icons/',import.meta.url),icon=name=>new URL(name+'.svg',ICONS).href;
/** the wear step of the icon: 0 = new .. 3 = worn (the package's thresholds: a quarter of the tyre each) */
export const wearStep=tyre=>Math.max(0,Math.min(3,Math.floor((1-Math.max(0,Math.min(1,Number.isFinite(tyre)?tyre:1)))*4)));
const PHASE_TEXT={entry:'כניסה לעצירת צמיגים',lane:'נתיב עצירת הצמיגים',stop:'עצירה',change:'מחליפים צמיגים',leave:'יציאה מעצירת הצמיגים',exit:'חזרה למסלול'};
// racing-v24.1 (`auto`, the model's pit.auto): the button shows the automatic stop from the start of its lap (state 'auto', pulsing: Roy did not notice the v24
// stop coming), and a tap on it, or on a stop asked by hand, cancels (onCancel) until the car is committed to the entry (then it hides, like during the stop)
// racing-v24.4 (changeButton:false, the session's default unless ?racingPitSeq=0; Roy: "remove the change button"): the stop has no tap, so the big button is never
// created; the crew changes the wheels by itself and the toast says so
// racing-v24.9 (tyreHud:'pit', the session's default unless ?racingTyreHud=old; Roy: "a permanent caption about changing tyres, not relevant, should not appear"):
// the wear meter and the notice are on the screen only while the car is in the pit lane; the stop a lap ahead is not announced, and the automatic stop has no button
export function createPitUi({stage,controls,document:doc=stage.ownerDocument,onRequest,onTap,onCancel,auto=false,changeButton=true,signal,phoneFix=phoneFixDEnabled(),tyreHud='old'}){
 const pitOnly=tyreHud==='pit';
 const node=(tag,cls,text='')=>{const n=doc.createElement(tag);n.className=cls;n.textContent=text;return n;};
 const kidPit=kidUx('021');
 if(kidPit)stage.closest('.game-screen')?.setAttribute('data-kid-racing-pit','true');
 if(kidPit)kidUxStyle('021',
  '.game-screen[data-game=islandRacing][data-kid-racing-pit] .game-controls .racing-pit-button{min-height:48px;height:48px;min-width:116px;width:116px;bottom:calc(var(--race-bottom) + 159px);background:#292309}' +
  '.game-screen[data-game=islandRacing][data-kid-racing-pit] .game-controls .racing-pit-button .racing-pit-sub{font-size:14px;white-space:nowrap}' +
  '.game-screen[data-game=islandRacing][data-kid-racing-pit] .game-controls .racing-pit-button[data-state=idle]{grid-template-rows:1fr}' +
  '.game-screen[data-game=islandRacing][data-kid-racing-pit] .racing-pit-notice{position:absolute;right:calc(var(--race-edge) + 150px);bottom:calc(var(--race-bottom) + 166px);z-index:4;max-width:50%;padding:6px 12px;background:#101b29;color:#fff;border:1px solid #f5cf42;border-radius:8px;font:800 14px/1.3 system-ui,sans-serif;pointer-events:none}'
 );
 const notice=kidPit?node('span','racing-pit-notice'):null;
 if(notice){notice.hidden=true;notice.setAttribute('role','status');stage.append(notice);}
 const meter=node('div','racing-tyres');meter.setAttribute('role','meter');meter.setAttribute('aria-label','שחיקת הצמיגים');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
 const ring=doc.createElement('img');ring.className='racing-tyre-icon';ring.alt='';ring.setAttribute('aria-hidden','true');ring.src=icon('tire_wear_0');ring.draggable=false;let step=0;
 const bar=node('span','racing-tyre-bar'),fill=node('i','racing-tyre-fill'),value=node('bdi','racing-tyre-value','100%');bar.append(fill);meter.append(ring,bar,value);stage.append(meter);
 const button=node('button','racing-pit-button');button.type='button';button.dataset.action='racing-pit';button.dataset.state='idle';button.setAttribute('aria-label','כניסה לעצירת צמיגים להחלפת צמיגים');
 const pitIcon=doc.createElement('img');pitIcon.className='racing-pit-icon';pitIcon.alt='';pitIcon.setAttribute('aria-hidden','true');pitIcon.src=icon('pit_entry');pitIcon.draggable=false;
 const label=node('span','racing-pit-label','צמיגים'),sub=node('small','racing-pit-sub','');button.append(pitIcon,label,sub);if(!((phoneFix||pitOnly)&&auto))controls.append(button);
 const change=node('button','racing-pit-change');change.type='button';change.dataset.action='racing-pit-change';change.hidden=true;change.setAttribute('aria-label','החלפת צמיגים');
 const changeIcon=doc.createElement('img');changeIcon.className='racing-pit-change-icon';changeIcon.alt='';changeIcon.setAttribute('aria-hidden','true');changeIcon.src=icon('wheel_change');changeIcon.draggable=false;
 const changeText=node('strong','racing-pit-change-text','החלפת צמיגים'),changeHint=node('small','racing-pit-change-hint','לחצו'),progress=node('span','racing-pit-progress'),progressFill=node('i','racing-pit-progress-fill');progress.append(progressFill);change.append(changeIcon,changeText,changeHint,progress);if(changeButton)controls.append(change);
 const press=(el,fn)=>el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn();},{signal});
 press(button,()=>{if(phoneFix&&auto)return;const st=button.dataset.state;if(st==='idle')onRequest?.();else if(auto&&(st==='requested'||st==='auto'))onCancel?.();});press(change,()=>onTap?.());
 let lastState='',lastTyre=-1;
 /** every frame: the player's car, the race (laps), whether stops are possible */
 function update(state,{on=true}={}){
  const p=state.player;if(!on){meter.hidden=button.hidden=change.hidden=true;if(notice)notice.hidden=true;return;}
  const pct=Math.round(Math.max(0,Math.min(1,p.tyre??1))*100);if(pitOnly)meter.hidden=!p.pit?.phase;
  if(pct!==lastTyre){lastTyre=pct;value.textContent=pct+'%';fill.style.transform=`scaleX(${pct/100})`;meter.setAttribute('aria-valuenow',String(pct));meter.dataset.level=pct>60?'good':pct>35?'mid':'low';const st=wearStep(pct/100);if(st!==step){step=st;ring.src=icon('tire_wear_'+st);}}
  const phase=p.pit?.phase||'',last=p.lap>=state.laps,done=(p.pits||0)>0&&!p.pit;
  const st=phase||(auto&&p.pitGo&&p.pitRequest)?'busy':done?'done':last?'last':p.pitRequest?(auto&&p.pitAuto?'auto':'requested'):'idle';
  if(st!==lastState){lastState=st;button.dataset.state=st;button.hidden=st==='busy'||st==='done'||st==='last';sub.textContent=st==='auto'?'אוטומטי · לביטול':st==='requested'?(auto?'בהקפה הזו · לביטול':'בהקפה הזו'):'';
   button.setAttribute('aria-label',st==='auto'?'עצירת צמיגים אוטומטית בסוף ההקפה, לחיצה מבטלת':st==='requested'&&auto?'עצירת צמיגים בסוף ההקפה, לחיצה מבטלת':'כניסה לעצירת צמיגים להחלפת צמיגים');}
  if(notice){
   const message=pitOnly?PHASE_TEXT[phase]||'':st==='requested'?'✓ ביקשתם להחליף צמיגים':st==='auto'?'⏱ החלפת צמיגים בסוף ההקפה':PHASE_TEXT[phase]||'';
   if(notice.textContent!==message)notice.textContent=message;
   notice.hidden=!message;
   if(st==='requested'||st==='auto')sub.textContent=auto?'לביטול':'בהקפה הזו';
  }
  meter.dataset.pit=phase?'1':'0';
  change.hidden=!changeButton||!(phase==='stop'||phase==='change');change.dataset.phase=phase;
  if(phase==='change'){const P=p.pit;changeText.textContent='מחליפים צמיגים';changeHint.textContent='';progressFill.style.transform=`scaleX(${Math.min(1,(P.t||0)/(P.dur||2))})`;}
  else if(phase==='stop'){changeText.textContent='החלפת צמיגים';changeHint.textContent='לחצו';progressFill.style.transform='scaleX(0)';}
 }
 /** a toast line for a pit event of the player's car (null: nothing to say) */
 function toast(e){if(e.car!=='player')return null;if(e.type==='pitIn')return PHASE_TEXT.entry;if(e.type==='pitChange'&&!changeButton)return PHASE_TEXT.change;if(e.type==='pitDone')return 'צמיגים חדשים';if(e.type==='pitRequest'&&e.auto)return pitOnly?null:auto?'בסוף ההקפה: עצירת צמיגים אוטומטית להחלפת צמיגים':'בסוף ההקפה: עצירת צמיגים להחלפת צמיגים';if(e.type==='pitCancel')return 'עצירת הצמיגים בוטלה';return null;}
 /** the timing tower: a "פיטס" tag instead of the gap for every car in the pit lane */
 function markTower(state){
  const rows=stage.querySelectorAll?.('.rt-row');if(!rows||!rows.length)return;const inPit=new Map(state.cars.filter(c=>c.pit).map(c=>[c.id,c.pit.phase]));
  for(const r of rows){const ph=inPit.get(r.dataset.id);if(ph){r.dataset.pit='1';const g=r.querySelector('.rt-gap');if(g&&g.textContent!=='צמיגים')g.textContent='צמיגים';}else if(r.dataset.pit)delete r.dataset.pit;}
 }
 return {update,toast,markTower,phaseText:phase=>PHASE_TEXT[phase]||'',dispose(){meter.remove();button.remove();change.remove();notice?.remove();}};
}
