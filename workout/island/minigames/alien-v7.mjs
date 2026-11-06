import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {AlpineDracoLoader} from './alpine-draco.mjs';

/** Defense v7 (GPT/Codex): the player plane, four alien ships and the boss as
 * Draco GLBs under assets/defense-v7/. Runtime files only; nothing points at design/.
 * ?defenseV7=0 (or globalThis.__defenseV7=false) keeps the earlier models; any failed
 * load falls back to them silently (alien-view.mjs). The v7 files are +Z forward,
 * the legacy ones +X, so the raw rotation is chosen to land on the same on-screen
 * facing after alienModelSpecs adds facingCorrectionDegrees. */
export const V7_BASE='assets/defense-v7/';
export const V7_FILES=Object.freeze({player:'defender-plane.glb',enemies:['alien-scout-lod1.glb','alien-manta-lod1.glb','alien-beetle-lod1.glb','alien-carrier-lod1.glb','alien-boss-lod1.glb']});

export function defenseV7Enabled(search=globalThis.location?.search||'',flag=globalThis.__defenseV7){
 if(flag===false)return false;
 return new URLSearchParams(search).get('defenseV7')!=='0';
}

/** Same scale and boss sizing as the legacy rows; only path and rotation change. */
export function v7Specs(balance){
 const m=balance.models,corr=balance.render.facingCorrectionDegrees||0,raw=target=>((target-corr)%360+360)%360;
 return {player:{...m.player,path:V7_BASE+V7_FILES.player,rotationY:raw(180)},
  enemies:m.enemies.map((e,i)=>({...e,path:V7_BASE+V7_FILES.enemies[i],rotationY:raw(0)}))};
}

/** GLTF loader with the island's static Draco worker (script-src 'self'), local-only URLs. */
export function createV7Loader(){
 const root=new URL('../',import.meta.url),manager=new T.LoadingManager();
 manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local model resources only');return url.href;});
 const draco=new AlpineDracoLoader(manager).setDecoderPath(new URL('../vendor/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
 const loader=new GLTFLoader(manager).setDRACOLoader(draco);
 const loadAsync=loader.loadAsync.bind(loader);
 return {loadAsync,dispose(){draco.dispose();}};
}
