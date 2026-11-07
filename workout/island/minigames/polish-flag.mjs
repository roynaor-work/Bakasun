/** 06/11/2026 polish kill switches. `?navalAim=v1`, `?fireTruck=v1`, `?boar=v1` restore the previous behaviour of that game. */
export function polishLegacy(name,search=globalThis.location?.search||''){try{return new URLSearchParams(search).get(name)==='v1';}catch{return false;}}
/** Raw flag value (for flags with more than one old behaviour, e.g. `?fireTruck=v8`). */
export function polishValue(name,search=globalThis.location?.search||''){try{return new URLSearchParams(search).get(name);}catch{return null;}}
/** 07/11/2026 fire controls (floating stick on the left half, large always-visible buttons on the right); `?fireControls=v8` or `?fireTruck=v1` restores the old layout. */
export const fireControlsV9=search=>!polishLegacy('fireTruck',search)&&polishValue('fireControls',search)!=='v8';
