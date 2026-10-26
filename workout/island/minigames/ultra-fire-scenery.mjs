import * as T from '../vendor/three.module.js';
import {LocalModels} from '../view/local-models.mjs?v=island-people-scale-20261026-1';

const TREE=Object.freeze({path:'assets/ultra-fire/tree-a-512.glb',rotationY:0,scale:1});
const POSITIONS=Object.freeze([[24,0,6],[24,0,18]]);

/** Two existing Meshy street trees, with their original texture and material.
 * This cache belongs only to scenery; city model counts retain their contract. */
export function createUltraFireScenery({scene,canAdd=()=>true,adapters={}}){
  const root=new T.Group();root.name='ultra-fire-scenery';scene.add(root);
  const models=new LocalModels(adapters),trees=[];
  let disposed=false,pending=null,rejected=0;
  function load(){
    if(pending)return pending;
    pending=(async()=>{
      if(disposed||!await models.load(TREE)||disposed)return false;
      for(const position of POSITIONS){
        if(disposed)break;
        const tree=models.create(TREE,{height:3.8});if(!tree)continue;
        tree.position.fromArray(position);tree.name='ultra-fire-meshy-tree';
        tree.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
        root.add(tree);
        if(!canAdd()){tree.removeFromParent();rejected++;continue;}
        trees.push(tree);
      }
      return trees.length>0;
    })();
    return pending;
  }
  function dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();root.clear();trees.length=0;models.dispose();
  }
  function metrics(){return {trees:trees.length,rejected,models:models.metrics(),disposed};}
  return {load,dispose,metrics};
}
