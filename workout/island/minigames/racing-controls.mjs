/** Input is released on every lifecycle boundary; pointer IDs are independent. */
export function createRacingControls({root,canvas,t}){
 const abort=new AbortController(),options={signal:abort.signal},keys=new Set(),held=new Set(),pointers=new Map(),doc=canvas.ownerDocument;let enabled=true,steer=0,automatic=true;
 const node=(tag,cls,text='')=>{const n=doc.createElement(tag);n.className=cls||'';n.textContent=text;return n;};
 const icon=path=>{const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 32 32');s.innerHTML=`<path d="${path}"/>`;s.setAttribute('aria-hidden','true');return s;};
 root.classList.add('racing-controls');root.dataset.racingAutomatic='true';
 const steering=node('div','racing-steering'),wheel=node('div','racing-wheel');wheel.setAttribute('aria-hidden','true');wheel.append(icon('M3 21a13 13 0 0 1 26 0M7 21a9 9 0 0 1 18 0M16 8v5m-9 1 3 3m15-3-3 3M13 25h6'));
 const slider=node('input','racing-steer');slider.type='range';slider.min='-1';slider.max='1';slider.step='.01';slider.value='0';slider.setAttribute('aria-label',t('racing.steer'));slider.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight A D');slider.setAttribute('aria-valuetext','מרכז');
 steering.append(wheel,slider,node('span','racing-steering-label',t('racing.steer')));root.append(steering);
 const actions=node('div','racing-actions'),buttons={};
 for(const [id,path]of [['drift','M5 24c-4-7 5-5 1-12m8 13c-4-7 5-5 1-12m7 12h7M20 5h7v13h-7Z'],['nitro','m18 2-12 17h9l-2 11L27 12H17Z'],['accelerate','m8 22 8-13 8 13M8 15l8-13 8 13']]){
  const b=node('button','racing-action racing-'+id);b.type='button';b.dataset.gameControl=id;b.setAttribute('aria-label',t('racing.'+id));b.setAttribute('aria-keyshortcuts',id==='drift'?'Space':id==='nitro'?'Shift':'ArrowUp W');b.append(icon(path),node('span','racing-action-copy',t('racing.'+id)));buttons[id]=b;actions.append(b);pointers.set(id,new Set());
  b.addEventListener('pointerdown',e=>{if(!enabled)return;e.preventDefault();b.setPointerCapture?.(e.pointerId);pointers.get(id).add(e.pointerId);held.add(id);b.classList.add('held');},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{pointers.get(id).delete(e.pointerId);if(!pointers.get(id).size){held.delete(id);b.classList.remove('held');}},options);
 }
 buttons.accelerate.hidden=true;root.append(actions);
 const auto=node('button','racing-auto');auto.type='button';auto.dataset.action='racing-auto';auto.setAttribute('aria-label',t('racing.auto'));auto.setAttribute('aria-pressed','true');auto.textContent=t('racing.auto');root.append(auto);
 auto.addEventListener('click',()=>{if(!enabled)return;automatic=!automatic;auto.setAttribute('aria-pressed',String(automatic));root.dataset.racingAutomatic=String(automatic);buttons.accelerate.hidden=automatic;held.delete('accelerate');pointers.get('accelerate').clear();buttons.accelerate.classList.remove('held');},options);
 const resetSteer=()=>{steer=0;slider.value='0';wheel.style.setProperty('--turn','0deg');steering.classList.remove('active');slider.setAttribute('aria-valuetext','מרכז');};
 slider.addEventListener('pointerdown',()=>{if(enabled)steering.classList.add('active');},options);
 slider.addEventListener('input',()=>{if(!enabled)return;steer=Math.max(-1,Math.min(1,Number(slider.value)||0));wheel.style.setProperty('--turn',`${steer*38}deg`);slider.setAttribute('aria-valuetext',Math.round(Math.abs(steer)*100)+'% '+(steer<0?'שמאלה':'ימינה'));},options);
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])slider.addEventListener(event,resetSteer,options);
 const relevant=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','ShiftLeft','ShiftRight']);
 const win=doc.defaultView;
 win.addEventListener('keydown',e=>{if(!enabled||!relevant.has(e.code)||e.target?.closest?.('input:not(.racing-steer),textarea,select'))return;e.preventDefault();keys.add(e.code);},options);
 win.addEventListener('keyup',e=>{keys.delete(e.code);},options);
 function cancel(){keys.clear();held.clear();for(const group of pointers.values())group.clear();resetSteer();for(const b of Object.values(buttons))b.classList.remove('held');}
 win.addEventListener('blur',cancel,options);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},options);
 return {sample(){
  const direction=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),rawSteer=direction||steer;
  const drift=held.has('drift')||keys.has('Space'),brake=keys.has('ArrowDown')||keys.has('KeyS');
  // Holding turbo also holds gas, including at rest and after the energy runs out.
  // Keep this player-input mapping here so AI throttle decisions stay independent.
  const nitro=held.has('nitro')||keys.has('ShiftLeft')||keys.has('ShiftRight');
  // The chase camera follows +Z from behind. Its screen-right points toward -X,
  // so driver-right input needs negative world yaw; UI labels/arc stay clockwise.
  return {steer:enabled&&rawSteer?-rawSteer:0,throttle:enabled&&(nitro||held.has('accelerate')||keys.has('ArrowUp')||keys.has('KeyW'))?1:0,autoAccelerate:automatic,brake:enabled&&(brake||drift),drift:enabled&&drift,nitro:enabled&&nitro};
 },cancel,setEnabled(value){enabled=!!value;slider.disabled=auto.disabled=!enabled;for(const b of Object.values(buttons))b.disabled=!enabled;cancel();},dispose(){enabled=false;cancel();abort.abort();},get enabled(){return enabled;}};
}
