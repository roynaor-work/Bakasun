/** Soccer v24.1: the referee on the pitch (Codex soccer-referee-v1, assets/soccer-v241/referee/referee.glb, 1,227 triangles, one skinned mesh,
 * the canonical 18 bones; its eight clips are in the GLB). Presentation only: he follows play on the diagonal (soccerRefereeTarget /
 * soccerRefereeStep) and makes the call for a foul, a penalty, an advantage or a goal (soccerRefereeCall); the simulation never reads him.
 * `?soccerReferee=0` = no referee (v24). If the file fails to load the match plays on without him. */
import {soccerRefereeUrl,soccerRefereeTarget,soccerRefereeStep,soccerRefereeCall,SOCCER_REFEREE} from './soccer-r241.mjs?v=island-v2-20261107-22';

export async function createSoccerReferee({T,GLTFLoader,scene,pitch,url=soccerRefereeUrl(),R=SOCCER_REFEREE}){
  const gltf=await new GLTFLoader().loadAsync(url),root=gltf.scene;let triangles=0;
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  // the pack is authored at its own stature; the players are 1.8 m (soccer-scale)
  root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),tall=box.max.y-box.min.y;if(tall>.5)root.scale.setScalar(R.height/tall);
  const pivot=new T.Group();pivot.name='soccer-referee';pivot.add(root);scene.add(pivot);
  const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  for(const [name,a] of Object.entries(actions)){if(name!=='idle'&&name!=='jog'){a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;}}
  let clip='idle',ref={x:0,z:-R.far,vx:0,vz:0},yaw=0,call=null,calls=0;actions.idle?.play();
  const play=name=>{if(!actions[name]||name===clip)return;const from=actions[clip],to=actions[name];to.reset().setEffectiveWeight(1).fadeIn(R.fade).play();from?.fadeOut(R.fade);clip=name;};
  return {
    root:pivot,
    /** A drained match event: the call it earns (held `hold` seconds facing where it happened). */
    noteEvent(event,s){const name=soccerRefereeCall(event);if(!name||!actions[name])return;call={name,left:R.hold[name]||2.4,x:Number.isFinite(event.x)?event.x:s?.ball?.x??ref.x,z:Number.isFinite(event.z)?event.z:s?.ball?.z??ref.z};calls++;play(name);},
    update(s,dt){
      if(!s||!(dt>=0))return;
      if(call){call.left-=dt;if(call.left<=0)call=null;}
      const target=soccerRefereeTarget(s.ball,s.attackDir,pitch);ref=soccerRefereeStep(ref,target,dt,{hold:Boolean(call)});
      const speed=Math.hypot(ref.vx,ref.vz),look=call||s.ball,want=Math.atan2(look.x-ref.x,look.z-ref.z),turn=Math.atan2(Math.sin(want-yaw),Math.cos(want-yaw));
      yaw+=turn*(1-Math.exp(-dt*(call?10:6)));
      if(!call)play(speed>.35?'jog':'idle');
      if(clip==='jog'&&actions.jog)actions.jog.setEffectiveTimeScale(Math.max(.6,Math.min(R.maxRate,speed/R.jogSpeed)));
      pivot.position.set(ref.x,0,ref.z);pivot.rotation.set(0,yaw,0);mixer.update(dt);
    },
    metrics:()=>({clip,calls,triangles,x:+ref.x.toFixed(2),z:+ref.z.toFixed(2),speed:+Math.hypot(ref.vx,ref.vz).toFixed(2)}),
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);root.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material)){m.map?.dispose();m.dispose();}}});pivot.removeFromParent();},
  };
}
