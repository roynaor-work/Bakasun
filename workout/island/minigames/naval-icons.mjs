export const NAVAL_WEAPON_COLORS=Object.freeze(['#ffd36e','#f7776f','#61d7ed','#d69bf4','#ffac58','#73e7aa']);
/** Six distinct silhouettes, readable without labels during play. */
export function navalWeaponIcons(controls){
 const drawings=[
  '<path d="M24 52V23q8-25 16 0v29Z" fill="#ffd36e" stroke="#724f26" stroke-width="3"/><path d="M25 39h14" stroke="#fff8d1" stroke-width="4"/>',
  '<path d="m32 5 10 18v23H22V23Z" fill="#f7776f" stroke="#793c43" stroke-width="3"/><path d="m22 34-9 13 9-3m20-10 9 13-9-3M27 50l5 10 5-10" fill="#ffcc62"/><circle cx="32" cy="26" r="5" fill="#eaffff"/>',
  '<path d="M12 25h32q18 7 0 14H12Z" fill="#61d7ed" stroke="#216b87" stroke-width="3"/><path d="m13 25-7-8v30l7-8M8 32H2" stroke="#216b87" stroke-width="4"/>',
  '<g stroke="#754e96" stroke-width="5"><path d="M32 4v56M4 32h56M12 12l40 40M12 52l40-40"/><circle cx="32" cy="32" r="18" fill="#d69bf4"/></g><circle cx="27" cy="25" r="5" fill="#f5eaff"/>',
  '<g fill="#ffac58" stroke="#8a4c26" stroke-width="2"><path d="M9 48V26q6-17 12 0v22ZM26 48V18q6-17 12 0v30ZM43 48V26q6-17 12 0v22Z"/></g><path d="M8 55h48" stroke="#8a4c26" stroke-width="4"/>',
  '<rect x="8" y="14" width="48" height="38" rx="8" fill="#73e7aa" stroke="#29745b" stroke-width="3"/><path d="M25 14V8h14v6" fill="none" stroke="#29745b" stroke-width="4"/><path d="M27 22h10v8h8v10h-8v8H27v-8h-8V30h8Z" fill="#f3fff9"/>',
 ];
 drawings.forEach((drawing,index)=>{const icon=controls.querySelector(`[data-ammo-index="${index}"] .game-icon`),button=controls.querySelector(`[data-ammo-index="${index}"]`);if(icon)icon.innerHTML=drawing;button?.style?.setProperty('--naval-weapon',NAVAL_WEAPON_COLORS[index]);});
}
