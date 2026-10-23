/** Input is released on every lifecycle boundary; pointer IDs are independent. */
export function createRacingControls({root,canvas,t}){
 const abort=new AbortController(),options={signal:abort.signal},keys=new Set(),held=new Set();let enabled=true,steer=0,automatic=true;
 const node=(tag,cls)=>{const n=document.createElement(tag);n.className=cls||'';return n;};
 const icon=path=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 32 32');s.innerHTML=`<path d="${path}"/>`;s.setAttribute('aria-hidden','true');return s;};
 const steering=node('div','racing-steering'),wheel=node('div','racing-wheel');wheel.append(icon('M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26Zm-11 8 8 4m14-4-8 4m-3 4v8m-4-11a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z'));
 const slider=node('input','racing-steer');slider.type='range';slider.min='-1';slider.max='1';slider.step='.01';slider.value='0';slider.setAttribute('aria-label',t('racing.steer'));slider.setAttribute('aria-valuetext','מרכז');steering.append(wheel,slider);root.append(steering);
 const actions=node('div','racing-actions'),buttons={};
 for(const [id,path]of [['drift','M5 24c-4-7 5-5 1-12m8 13c-4-7 5-5 1-12m7 12h7M20 5h7v13h-7Z'],['nitro','m18 2-12 17h9l-2 11L27 12H17Z'],['accelerate','m8 22 8-13 8 13M8 15l8-13 8 13']]){
  const b=node('button','racing-action racing-'+id);b.type='button';b.dataset.gameControl=id;b.setAttribute('aria-label',t('racing.'+id));b.append(icon(path));buttons[id]=b;actions.append(b);
  b.addEventListener('pointerdown',e=>{if(!enabled)return;e.preventDefault();b.setPointerCapture?.(e.pointerId);held.add(id);b.classList.add('held');},{...options});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{held.delete(id);b.classList.remove('held');},options);
 }
 buttons.accelerate.hidden=true;root.append(actions);
 const auto=node('button','racing-auto');auto.type='button';auto.dataset.action='racing-auto';auto.setAttribute('aria-label',t('racing.auto'));auto.setAttribute('aria-pressed','true');auto.textContent=t('racing.auto');root.append(auto);
 auto.addEventListener('click',()=>{automatic=!automatic;auto.setAttribute('aria-pressed',String(automatic));buttons.accelerate.hidden=automatic;},options);
 const resetSteer=()=>{steer=0;slider.value='0';wheel.style.setProperty('--turn','0deg');slider.setAttribute('aria-valuetext','מרכז');};
 slider.addEventListener('input',()=>{if(!enabled)return;steer=Number(slider.value);wheel.style.setProperty('--turn',`${steer*65}deg`);slider.setAttribute('aria-valuetext',Math.round(Math.abs(steer)*100)+'% '+(steer<0?'שמאלה':'ימינה'));},options);
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])slider.addEventListener(event,resetSteer,options);
 const relevant=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','ShiftLeft','ShiftRight']);
 const win=canvas.ownerDocument.defaultView;
 win.addEventListener('keydown',e=>{if(!enabled||!relevant.has(e.code)||e.target?.closest?.('input:not(.racing-steer),textarea,select'))return;e.preventDefault();keys.add(e.code);},options);
 win.addEventListener('keyup',e=>{keys.delete(e.code);},options);
 function cancel(){keys.clear();held.clear();resetSteer();for(const b of Object.values(buttons))b.classList.remove('held');}
 win.addEventListener('blur',cancel,options);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},options);
 return {sample(){const direction=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),drift=held.has('drift')||keys.has('Space'),brake=keys.has('ArrowDown')||keys.has('KeyS');return {steer:enabled?(direction||steer):0,throttle:enabled&&(held.has('accelerate')||keys.has('ArrowUp')||keys.has('KeyW'))?1:0,autoAccelerate:automatic,brake:enabled&&(brake||drift),drift:enabled&&drift,nitro:enabled&&(held.has('nitro')||keys.has('ShiftLeft')||keys.has('ShiftRight'))};},cancel,setEnabled(value){enabled=!!value;cancel();},dispose(){cancel();abort.abort();},get enabled(){return enabled;}};
}
