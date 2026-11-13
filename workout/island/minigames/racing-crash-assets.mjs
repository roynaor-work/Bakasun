// racing-crash-fx-v1 (Codex, CC0): sparks and dust sprite atlases, six body fragments and the formula tyre (assets/racing-crash-fx-v1, from design/racing-crash-fx).
// Off with ?racingCrashAssets=0 (the boxes, cylinder and gradient sprites of racing-effects.mjs stay exactly as they were). Everything is fetched and checked first; any problem
// rejects, and the caller keeps the old effects. Loaded lazily by racing-view.mjs.
export const crashAssetsEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingCrashAssets')!=='0';
export const CRASH_DIR='../assets/racing-crash-fx-v1/';
export const CRASH_FILES=['sparks-atlas.png','smoke-dust-atlas.png','body-fragments.glb','formula-tire.glb'];
export const FRAGMENTS=['broken_front_wing','half_sidepod','mirror','nose_fragment','body_panel_a','body_panel_b'];
const find=(scene,name)=>{let found=null;scene.traverse(o=>{if(!found&&o.isMesh&&o.name===name)found=o;});return found;};

/** Resolves {sparksMap, smokeMap, fragments:[BufferGeometry x6], tyreGeometry, tyreMaterial}; rejects if a file or a named mesh is missing. */
export async function loadCrashAssets({T,GLTFLoader,version=''}){
 const url=f=>new URL(CRASH_DIR+f+(version?'?v='+version:''),import.meta.url).href,loader=new GLTFLoader(),tex=new T.TextureLoader();
 const atlas=async f=>{const t=await tex.loadAsync(url(f));t.colorSpace=T.SRGBColorSpace;t.minFilter=t.magFilter=T.LinearFilter;t.generateMipmaps=false;t.wrapS=t.wrapT=T.ClampToEdgeWrapping;return t;};
 const [sparksMap,smokeMap,frag,tire]=await Promise.all([atlas(CRASH_FILES[0]),atlas(CRASH_FILES[1]),loader.loadAsync(url(CRASH_FILES[2])),loader.loadAsync(url(CRASH_FILES[3]))]);
 try{
  const fragments=FRAGMENTS.map(name=>{const mesh=find(frag.scene,name);if(!mesh)throw Error('racing crash fx lacks '+name);return mesh.geometry;});
  const tyre=find(tire.scene,'formula_tire');if(!tyre)throw Error('racing crash fx lacks formula_tire');
  return {sparksMap,smokeMap,fragments,tyreGeometry:tyre.geometry,tyreMaterial:tyre.material};
 }catch(error){sparksMap.dispose();smokeMap.dispose();throw error;}
}
