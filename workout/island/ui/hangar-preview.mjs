import * as T from '../vendor/three.module.js';
import {LocalModels} from '../view/local-models.mjs?v=g2i-20261019-1';
/** Small local GLB preview; owned by the pre-game modal and disposed on navigation. */
export function hangarPreview(canvas,balance,color){
 let renderer,frame,disposed=false;const models=new LocalModels();
 try{renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:false});}catch{canvas.dataset.mode='fallback';models.dispose();return {dispose(){}};}
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,60);camera.position.set(0,4,7);camera.lookAt(0,0,0);scene.add(new T.HemisphereLight(0xffffff,0x224466,3));renderer.setSize(balance.hangar.previewSize,balance.hangar.previewSize,false);renderer.setPixelRatio(1);let ship;
 models.load(balance.models.player).then(()=>{if(disposed)return;ship=models.create(balance.models.player,{length:balance.render.modelHeight});if(ship){ship.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color?.set(color);}});scene.add(ship);canvas.dataset.mode='three';}});
 function draw(at){if(disposed)return;if(ship)ship.rotation.y=at/2000;renderer.render(scene,camera);frame=requestAnimationFrame(draw);}frame=requestAnimationFrame(draw);
 return {dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);ship?.traverse(o=>{if(o.isMesh)o.material?.dispose();});models.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
