// racing-broadcast-v1 (Codex, CC0; assets/racing-broadcast-v1, from design/racing-broadcast): a start gantry with five lamp materials, twelve team crests, a podium backdrop, a
// leaderboard strip and a card frame. Off with ?racingBroadcastArt=0 (or ?racingBroadcast=0, whose HUD this art belongs to): the lamps of racing-env-v2, the colour bars and the plain
// podium stay exactly as before. The DOM layer (racing-broadcast.mjs, racing-tower.mjs) and the 3D view (racing-view.mjs) read this module; nothing here touches the race model.
import {GRID_DRIVERS} from './racing-league-core.mjs?v=island-v2-20261107-12';

export const broadcastArtEnabled=(search=globalThis.location?.search||'')=>{const q=new URLSearchParams(search);return q.get('racingBroadcastArt')!=='0'&&q.get('racingBroadcast')!=='0';};
export const ART_DIR='../assets/racing-broadcast-v1/';
/** Crest file per grid index (GRID_DRIVERS order: the player, then the eleven rivals), 64x64 SVG each. */
export const CREST_IDS=Object.freeze(['flame','wave','sun','sea','silver','sunset','forest','purple','sand','rock','night','cloud']);
export const LAMPS=Object.freeze(['lamp1','lamp2','lamp3','lamp4','lamp5']);
export const ART_FILES=Object.freeze(['start-gantry.glb','podium.webp','leaderboard-strip.svg','card-frame.svg','LICENSES.md',...CREST_IDS.map(id=>'teams/'+id+'.svg')]);
export const artUrl=file=>new URL(ART_DIR+file,import.meta.url).href;
/** The crest of a car by its race number (numbers are unique on the grid); '' for a car outside it. */
export function crestUrl(number){const i=GRID_DRIVERS.findIndex(d=>d.number===number);return i>=0?artUrl('teams/'+CREST_IDS[i]+'.svg'):'';}
/** The class and style the DOM layer sets on a container so racing.css can use the panels (urls are relative to this module, not to the stylesheet). */
export function applyPanelArt(el){el.classList.add('rb-art');el.style.setProperty('--rb-podium',`url("${artUrl('podium.webp')}")`);el.style.setProperty('--rb-strip',`url("${artUrl('leaderboard-strip.svg')}")`);el.style.setProperty('--rb-frame',`url("${artUrl('card-frame.svg')}")`);}
/** How many of the five lamps are lit for a startLights() result. */
export const litCount=lights=>!lights||lights.out?0:Math.max(0,Math.min(LAMPS.length,lights.lit|0));

/** Loads the gantry model and checks that the five lamp materials exist. Rejects otherwise (the caller keeps the lamps of racing-env-v2). */
export async function loadGantry({GLTFLoader,version=''}){
 const gltf=await new GLTFLoader().loadAsync(new URL(ART_DIR+'start-gantry.glb'+(version?'?v='+version:''),import.meta.url).href),found=new Set();
 gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(LAMPS.includes(m.name))found.add(m.name);});
 for(const name of LAMPS)if(!found.has(name))throw Error('racing gantry lacks '+name);
 return gltf.scene;
}

/** Places the gantry across the start line (the spot racing-env-v2 gives its own gantry, 10 m before the line, facing the grid) with its lamps dark.
 * bake = racing-env-v2's merge of the plain parts; the five lamp materials stay separate so they can glow one by one. */
export function buildGantry({T,scene,track,keep,f1,model,bake}){
 const root=new T.Group();root.name='racing-start-gantry';scene.add(root);
 const q=f1.at(track.length-10,0,0),lamps=new Map();
 for(const part of bake(T,model,keep)){const mesh=new T.Mesh(part.geometry,part.material);mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);if(LAMPS.includes(part.material.name)){lamps.set(part.material.name,part.material);part.material.emissiveIntensity=0;}}
 root.position.set(q.x,q.y,q.z);root.rotation.y=q.heading+Math.PI;root.scale.set((track.width+3)/14.15,1,1);
 let shown=-1,boost=1;
 return {root,lamps,
  /** n lamps lit, left to right from the cars' side; cheap when unchanged */
  light(n,night=false){const k=Math.max(0,Math.min(LAMPS.length,n|0));if(k===shown)return;shown=k;boost=night?1.35:1;LAMPS.forEach((name,i)=>{const m=lamps.get(name);if(m)m.emissiveIntensity=i<k?boost:0;});},
  lit:()=>shown,
  metrics:()=>({parts:root.children.length,lit:shown}),
  dispose(){root.removeFromParent();}};
}
