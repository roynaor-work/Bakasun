import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {dataURL} from '../release.mjs?v=island-cityscape-20261025-1';

export function localModelURL(path) {
  if(typeof path!=='string'||!path.endsWith('.glb')||/^(?:[a-z]+:|\/\/)/i.test(path)||path.includes('\\'))return null;
  try{if(decodeURIComponent(path).split(/[\\/]/).includes('..'))return null;const root=new URL('../',import.meta.url),url=new URL(path,root);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)?dataURL(path,root):null;}catch{return null;}
}
export function modelSpec(value){
  if(typeof value==='string')return {path:value,rotationY:0,scale:1};
  if(!value||!Number.isFinite(value.rotationY)||!Number.isFinite(value.scale)||value.scale<=0)return null;
  return value;
}
export function modelTargets(art,models){
  return [{value:models.player,sprite:art.player,index:-1},...(models.enemies||[]).map((value,index)=>({value,sprite:art.aliens[index],index}))].map(row=>({...row,spec:modelSpec(row.value)})).filter(row=>row.spec&&row.sprite&&localModelURL(row.spec.path));
}
export function disposeObject(object){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
}
/** Bake once per round. Relative sizes are applied to the finished sprites so
 * the boss keeps its complete silhouette rather than being clipped in the bake.
 * Adapters allow the same load/failure/disposal path to run without a GPU. */
export async function loadOptionalArt(art,balance,isDisposed=()=>false,adapters={}) {
  if(!balance.models)return;
  const targets=modelTargets(art,balance.models),status=art.modelArt={requested:targets.length,loaded:0,failed:0};
  art.modelScales={player:1,enemies:(balance.models.enemies||[]).map(()=>1)};
  if(!targets.length)return;
  let renderer;
  try {
    renderer=adapters.createRenderer?.()||new THREE.WebGLRenderer({alpha:true,antialias:false});renderer.setSize(balance.modelArt.size,balance.modelArt.size);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const half=balance.modelArt.frameDiameter/2,scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,100);
    // Meshy Y is up. Looking straight down Y makes -Z the top of the sprite:
    // -90° turns the player's -X nose to -Z, +90° turns enemies toward +Z.
    camera.position.fromArray(balance.modelArt.camera);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x445588,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,4,5);scene.add(light);
    const manager=new THREE.LoadingManager(),root=new URL('../',import.meta.url);
    manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local model resources only');return url.href;});
    const loader=adapters.createLoader?.(manager)||new GLTFLoader(manager);
    for(const row of targets){
      let object;
      try {
        if(isDisposed())break;object=(await loader.loadAsync(localModelURL(row.spec.path).href)).scene;
        if(isDisposed())continue;
        object.rotation.y=THREE.MathUtils.degToRad(row.spec.rotationY);object.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=balance.modelArt.scale/Math.max(size.x,size.y,size.z,.001);
        object.position.copy(center).multiplyScalar(-scale);object.scale.setScalar(scale);
        object.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)for(const value of Object.values(m))if(value?.isTexture&&value.image&&globalThis.document){const image=value.image,limit=balance.modelArt.maxTextureSize;if(Math.max(image.width,image.height)>limit){const c=document.createElement('canvas'),ratio=limit/Math.max(image.width,image.height);c.width=Math.round(image.width*ratio);c.height=Math.round(image.height*ratio);c.getContext('2d').drawImage(image,0,0,c.width,c.height);value.image=c;value.needsUpdate=true;}}});
        scene.add(object);renderer.render(scene,camera);
        if(isDisposed())continue;
        const p=row.sprite.getContext('2d');p.save();p.setTransform(1,0,0,1,0,0);p.clearRect(0,0,row.sprite.width,row.sprite.height);p.drawImage(renderer.domElement,0,0,row.sprite.width,row.sprite.height);p.restore();
        if(row.index<0)art.modelScales.player=row.spec.scale;else art.modelScales.enemies[row.index]=row.spec.scale;status.loaded++;
      }catch{status.failed++;}
      finally{if(object){scene.remove(object);disposeObject(object);}}
    }
  }catch{status.failed=targets.length-status.loaded;}
  finally{renderer?.dispose();renderer?.forceContextLoss();}
}
