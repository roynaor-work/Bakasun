import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import * as SkeletonUtils from './skeleton-utils.mjs?v=island-alpine-20261028-1';
import {localModelURL,modelSpec,disposeObject} from '../minigames/model-art.mjs?v=island-alpine-20261028-1';

/** Local GLBs share geometry, materials and clips across instances. Clones get
 * independent skeletons; callers own their mixers and skeleton disposal. The
 * cache releases shared resources once, including loads after view closure. */
export class LocalModels {
  constructor(adapters={}) {
    this.assets=new Map();this.animations=new Map();this.pending=new Map();this.failed=0;this.disposed=false;
    const root=new URL('../',import.meta.url),manager=new T.LoadingManager();
    manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local model resources only');return url.href;});
    this.loader=adapters.loader||new GLTFLoader(manager);
  }
  load(value) {
    const spec=modelSpec(value),url=spec&&localModelURL(spec.path);
    if(!url||this.disposed)return Promise.resolve(false);
    if(!this.pending.has(spec.path))this.pending.set(spec.path,(async()=>{
      try{const gltf=await this.loader.loadAsync(url.href),object=gltf.scene;if(this.disposed){disposeObject(object);return false;}this.assets.set(spec.path,object);this.animations.set(spec.path,gltf.animations||[]);return true;}
      catch{this.failed++;return false;}
    })());
    return this.pending.get(spec.path);
  }
  create(value,fit={}) {
    const spec=modelSpec(value),source=spec&&this.assets.get(spec.path);
    if(!source||this.disposed)return null;
    return fitModel(SkeletonUtils.clone(source),spec,fit);
  }
  metrics(){return {requested:this.pending.size,loaded:this.assets.size,failed:this.failed};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const object of this.assets.values())disposeObject(object);this.assets.clear();this.animations.clear();}
}

/** Keep the authored proportions, center X/Z, and put the lowest vertex at Y=0.
 * A supplied dimension fits that axis; scale then applies a relative art size. */
export function fitModel(object,spec,fit={}) {
  const root=new T.Group();root.add(object);object.rotation.y=T.MathUtils.degToRad(spec.rotationY);object.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const factor=fit.width?fit.width/Math.max(size.x,.001):fit.height?fit.height/Math.max(size.y,.001):fit.length?fit.length/Math.max(size.x,size.z,.001):1;
  const scale=factor*spec.scale;object.scale.multiplyScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  root.userData.modelPath=spec.path;return root;
}
