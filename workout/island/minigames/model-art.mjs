import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {dataURL} from '../release.mjs?v=g2f-20261015-1';

/** Bake optional local GLBs into the existing sprite factories once per session.
 * Failed/absent assets keep procedural art; closing also disposes late loads. */
export function localModelURL(path) {
  if(typeof path!=='string'||!path.endsWith('.glb'))return null;
  try{const root=new URL('../',import.meta.url),url=new URL(path,root);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)?dataURL(path,root):null;}catch{return null;}
}
export async function loadOptionalArt(art,balance,isDisposed=()=>false) {
  const models=balance.models;if(!models)return;
  const targets=[{path:models.player,sprite:art.player},...(models.enemies||[]).map((path,i)=>({path,sprite:art.aliens[i]}))];
  const valid=targets.filter(row=>localModelURL(row.path)),status=art.modelArt={requested:valid.length,loaded:0,failed:0};if(!valid.length)return;
  let renderer;
  try {
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:false});renderer.setSize(balance.modelArt.size,balance.modelArt.size);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.fromArray(balance.modelArt.camera);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x445588,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,4,5);scene.add(light);
    const manager=new THREE.LoadingManager(),root=new URL('../',import.meta.url);manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local model resources only');return url.href;});
    const loader=new GLTFLoader(manager);
    for(const row of valid){
      let object;
      try {
        if(isDisposed())break;object=(await loader.loadAsync(localModelURL(row.path).href)).scene;
        if(isDisposed())continue;
        const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=balance.modelArt.scale/Math.max(size.x,size.y,size.z,.001);
        object.position.copy(center).multiplyScalar(-scale);object.scale.setScalar(scale);scene.add(object);renderer.render(scene,camera);
        const p=row.sprite.getContext('2d');p.clearRect(0,0,row.sprite.width,row.sprite.height);p.drawImage(renderer.domElement,0,0,row.sprite.width,row.sprite.height);status.loaded++;
      } catch {status.failed++; /* Optional models never prevent playing with the code artwork. */ }
      finally {if(object){scene.remove(object);object.traverse(o=>{o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)if(m){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});}}
    }
  } catch { /* WebGL unavailable: retain the procedural sprites. */ }
  finally {renderer?.dispose();renderer?.forceContextLoss();}
}
