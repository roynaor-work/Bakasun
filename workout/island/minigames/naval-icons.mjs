export const NAVAL_WEAPON_COLORS=Object.freeze(['#ffd36e','#f7776f','#61d7ed','#d69bf4','#ffac58','#73e7aa']);
/** Original equipment silhouettes with restrained metal highlights, readable at 28 px. */
export function navalWeaponIcons(controls){
 const drawings=[
  '<path d="M23 51V24c0-9 5-17 9-20 4 3 9 11 9 20v27Z" fill="#c5a46e" stroke="#f2ddb2" stroke-width="1.5"/><path d="M23 25h18v9H23Z" fill="#657e85"/><path d="M27 23v24" stroke="#e9d2a4" stroke-width="2"/><path d="M21 51h22v6H21Z" fill="#8f7859" stroke="#f2ddb2" stroke-width="1.5"/>',
  '<path d="m32 4 8 16v28H24V20Z" fill="#b3c4c7" stroke="#e5eff0" stroke-width="1.5"/><path d="m32 4 8 16H24Z" fill="#c57464"/><path d="m24 34-10 17 10-5m16-12 10 17-10-5" fill="#758e96" stroke="#c7d7d9" stroke-width="1.5"/><path d="M28 51h8l-4 9Z" fill="#e6bd76"/><path d="M28 23v20M25 28h14" stroke="#eef5ef" stroke-width="1.5"/>',
  '<path d="M12 24h29c10 0 16 5 18 8-2 3-8 8-18 8H12Z" fill="#89afbb" stroke="#dae9e7" stroke-width="1.5"/><path d="M42 25c-3 3-3 11 0 14" fill="none" stroke="#e4bd7b" stroke-width="3"/><path d="m13 24-8-8v32l8-8" fill="#526e7c" stroke="#a6c7d0" stroke-width="1.5"/><path d="M17 28h20" stroke="#dcebed" stroke-width="2"/><path d="M5 32H1" stroke="#e4bd7b" stroke-width="2"/>',
  '<g stroke="#c2b4d2" stroke-width="3"><path d="M32 5v54M5 32h54M13 13l38 38M13 51l38-38"/><circle cx="32" cy="32" r="17" fill="#56617c" stroke-width="1.5"/></g><circle cx="32" cy="32" r="10" fill="#7b83a2" stroke="#d1c5dc" stroke-width="1.5"/><path d="M27 25a8 8 0 0 1 10 0" fill="none" stroke="#e8e3e3" stroke-width="2"/>',
  '<g fill="#bd9c70" stroke="#ebd4b1" stroke-width="1.5"><path d="M8 49V29c0-7 6-14 7-15 1 1 7 8 7 15v20ZM25 49V20c0-7 6-14 7-15 1 1 7 8 7 15v29ZM42 49V29c0-7 6-14 7-15 1 1 7 8 7 15v20Z"/></g><path d="M8 40h14M25 40h14M42 40h14" stroke="#6e858a" stroke-width="5"/><path d="M6 54h52" stroke="#e4c38a" stroke-width="3"/>',
  '<rect x="9" y="16" width="46" height="36" rx="4" fill="#537f78" stroke="#c5dcd1" stroke-width="1.5"/><path d="M24 16V9h16v7M9 24h46M17 16v36M47 16v36" fill="none" stroke="#c5dcd1" stroke-width="1.5"/><path d="M28 28h8v6h6v8h-6v6h-8v-6h-6v-8h6Z" fill="#e3e7d6"/>',
 ];
 drawings.forEach((drawing,index)=>{const icon=controls.querySelector(`[data-ammo-index="${index}"] .game-icon`),button=controls.querySelector(`[data-ammo-index="${index}"]`);if(icon)icon.innerHTML=drawing;button?.style?.setProperty('--naval-weapon',NAVAL_WEAPON_COLORS[index]);});
}
