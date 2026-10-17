import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {localModelURL} from './model-art.mjs?v=g2i-20261019-1';

export function disposeBoat(root) {
  const resources=new Set();
  root.traverse(node=>{if(node.geometry)resources.add(node.geometry);if(node.skeleton)resources.add(node.skeleton);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
  root.removeFromParent();for(const resource of resources)resource.dispose();root.clear();
}
export function normalizeBoat(object,config) {
  object.rotation.y=T.MathUtils.degToRad(config.rotationY);object.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  if(!Number.isFinite(size.length())||Math.max(size.x,size.z)<=0)throw Error('invalid patrol bounds');
  const scale=config.length/Math.max(size.x,size.z)*config.scale;
  const root=new T.Group();root.scale.setScalar(scale);root.position.set(-center.x*scale,-bounds.min.y*scale-config.waterline,-center.z*scale);root.add(object);root.updateMatrixWorld(true);
  return root;
}
export async function loadPatrolBoat(config,adapters={}) {
  const url=localModelURL(config.path);if(!url)return null;
  const island=new URL('../',import.meta.url),manager=new T.LoadingManager();
  manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,island);if(url.origin!==island.origin||!url.pathname.startsWith(island.pathname))throw Error('local patrol resources only');return url.href;});
  const loader=adapters.loader||new GLTFLoader(manager),gltf=await loader.loadAsync(url.href);
  try{return normalizeBoat(gltf.scene,config);}catch(error){disposeBoat(gltf.scene);throw error;}
}
