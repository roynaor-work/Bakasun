/** 06/11/2026 polish kill switches. `?navalAim=v1`, `?fireTruck=v1`, `?boar=v1` restore the previous behaviour of that game. */
export function polishLegacy(name,search=globalThis.location?.search||''){try{return new URLSearchParams(search).get(name)==='v1';}catch{return false;}}
