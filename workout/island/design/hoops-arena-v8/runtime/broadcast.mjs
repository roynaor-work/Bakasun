import * as THREE from './vendor/three.module.js';
/** Reuses the scene and the recorded transforms. At most two scene submissions. */
export function createBroadcastRenderer({renderer,scene,liveCamera,replayCamera,recorder,prepareView=()=>{},onProgress=()=>{}}) {
  let active=false,cursor=0,width=1,height=1,inset=null;
  const size=new THREE.Vector2();
  function resize(w,h) {
    width=w;height=h;
    liveCamera.aspect=replayCamera.aspect=w/h;liveCamera.updateProjectionMatrix();replayCamera.updateProjectionMatrix();
    const portrait=h>w;
    inset=portrait?{x:18,y:h-230-100,width:146,height:100}:{x:16,y:h-74-82,width:146,height:82};
  }
  function setReplay(enabled) {active=!!enabled&&recorder.start();cursor=0;if(!active)recorder.stop();return active;}
  function seek(fraction){cursor=Math.max(0,Math.min(1,fraction))*recorder.duration;}
  const originalAutoReset=renderer.info.autoReset;renderer.info.autoReset=false;
  function render(delta=1/30) {
    renderer.getSize(size);if(size.x!==width||size.y!==height)resize(size.x,size.y);
    renderer.info.reset();renderer.setRenderTarget(null);renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.clear();
    if(active) {
      cursor=(cursor+Math.max(0,delta)*.5)%Math.max(.001,recorder.duration);
      recorder.render(cursor,()=>{prepareView(replayCamera);renderer.render(scene,replayCamera);});
      renderer.setScissorTest(true);renderer.setScissor(inset.x,inset.y,inset.width,inset.height);renderer.setViewport(inset.x,inset.y,inset.width,inset.height);
      const oldAspect=liveCamera.aspect;liveCamera.aspect=inset.width/inset.height;liveCamera.updateProjectionMatrix();
      renderer.clear(true,true,true);prepareView(liveCamera);renderer.render(scene,liveCamera);liveCamera.aspect=oldAspect;liveCamera.updateProjectionMatrix();
      renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);onProgress(cursor,recorder.duration);
    } else {prepareView(liveCamera);renderer.render(scene,liveCamera);}
  }
  return {render,resize,setReplay,seek,get active(){return active;},get inset(){return inset;},dispose(){renderer.info.autoReset=originalAutoReset;}};
}
