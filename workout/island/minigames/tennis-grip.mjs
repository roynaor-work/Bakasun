/** Tennis v25 grip (Roy, 14/11/2026: the racket was glued to the hand with no grip contract). v24 built a 1.24 m toy racket out of a torus and
 * a cylinder and hung it from the wrist bone along the fingers, so the fingers never closed on anything. v25 takes the Codex package
 * tennis-grip-v1 (CC0, copied to assets/tennis-grip-v1): a real 68 cm racket whose `grip` node is the top of the handle and whose `head` node is
 * the centre of the strings, and holds it IN the fist with one fixed contract per hand (no per-frame offsets):
 *  - the handle crosses the palm diagonally, from the heel of the hand on the little-finger side to the root of the index finger (`tilt` toward
 *    the fingers), the strings parallel to the palm, the hand centre of the handle (`handY` from the butt) inside the closed fingers;
 *  - the four finger bones of the kid model (Finger0-3_R, single joints) curl around it and the thumb (Finger4_R) closes over it: the package's
 *    hand mask, done on the kid's own finger bones instead of a second rigid hand mesh;
 *  - the swing stays the game's: the view still computes the racket orientation it always did (shaft and face), and the hand is turned so the
 *    racket in it points exactly there (hand = racket x correction). The arm IK aims the real head node (headLocal) at the ball.
 * ?tennisGrip=0 keeps the v24 racket. Any load failure keeps it too (the view builds the old racket first and swaps only on success). */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function tennisGripEnabled(search=globalThis.location?.search||''){return param('tennisGrip',search)!=='0';}
export const GRIP_DEFAULTS=Object.freeze({
 scale:1.15,           // the kid model is drawn at 1.08 and the court is the game's; 68 cm x 1.15 = 78 cm on screen next to a 1.6 m player
 tilt:.6,              // radians from "across the palm" toward the finger tips (an eastern forehand: the handle runs diagonally)
 palm:[.012,-.074,0],  // centre of the palm in Hand_R space (fingers along -Y, thumb on -X, see kid-full.glb Finger0-4_R)
 palmSide:1,           // the palm faces +Z of Hand_R (-1: -Z)
 inset:.028,           // the handle's axis sits this far in front of the palm, inside the curled fingers (handle radius .021)
 handY:.065,           // where along the handle (from the butt) the hand's centre is, from the package (primaryHandCenterY)
 curl:1.35,            // finger curl around the handle (radians, the four fingers)
 thumb:.75             // thumb closing over the handle (radians)
});
export function gripConfig(config){return {...GRIP_DEFAULTS,...(config?.animation?.grip||{})};}
/** The fixed racket-in-hand transform (Hand_R space) and what the view needs from it:
 *  quaternion/position: the racket scene's local transform under Hand_R;
 *  correction: hand rotation = old racket rotation x correction (the v24 racket was the hand's own frame: shaft along -Y, face normal +Z;
 *   the package racket's shaft is +Y, so F = half turn about Z, then the inverse of the grip rotation);
 *  headLocal: the head node in Hand_R space, for the arm IK. */
export function gripTransform(T,cfg=GRIP_DEFAULTS){
 const side=cfg.palmSide>=0?1:-1,shaft=new T.Vector3(-Math.cos(cfg.tilt),-Math.sin(cfg.tilt),0).normalize(),normal=new T.Vector3(0,0,side);
 const xAxis=new T.Vector3().crossVectors(shaft,normal).normalize(),basis=new T.Matrix4().makeBasis(xAxis,shaft,normal),quaternion=new T.Quaternion().setFromRotationMatrix(basis);
 const centre=new T.Vector3(...cfg.palm).addScaledVector(normal,cfg.inset),position=centre.clone().sub(new T.Vector3(0,cfg.handY*cfg.scale,0).applyQuaternion(quaternion));
 const half=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI),correction=half.clone().multiply(quaternion.clone().invert());
 const headLocal=position.clone().add(new T.Vector3(0,.5*cfg.scale,0).applyQuaternion(quaternion));
 return {quaternion,position,correction,headLocal,shaft,normal};
}
/** Load the package racket once (no decoders). Resolves the template scene; rejects on any failure (the caller keeps the v24 racket). */
export async function loadGripRacket({GLTFLoader,base,fetcher=globalThis.fetch,buffer}){
 const url=new URL('../assets/tennis-grip-v1/racket.glb?v=island-v2-20261107-16',base).href;
 const data=buffer?await buffer:await (await fetcher(url)).arrayBuffer();
 const gltf=await new GLTFLoader().parseAsync(data,'');const scene=gltf.scene;
 if(!scene.getObjectByName('grip')||!scene.getObjectByName('head'))throw Error('tennis grip racket is missing grip/head');
 return scene;
}
/** Put a clone of the racket in a character's right hand and close the fingers. Returns what the view swaps in. */
export function attachGrip(T,{hand,fingers,template,cfg=GRIP_DEFAULTS,shadows=true}){
 const t=gripTransform(T,cfg),racket=template.clone(true);racket.name='tennis-grip-racket';
 racket.quaternion.copy(t.quaternion);racket.position.copy(t.position);racket.scale.setScalar(cfg.scale);
 racket.traverse(o=>{if(o.isMesh){o.castShadow=shadows;o.receiveShadow=false;o.frustumCulled=false;}});
 hand.add(racket);racket.updateMatrixWorld(true);
 const side=cfg.palmSide>=0?1:-1,curled=[];
 // Curl about Hand_R's X axis toward the palm; the thumb closes about the shaft direction so it wraps over the handle.
 for(const name of ['Finger0_R','Finger1_R','Finger2_R','Finger3_R']){const f=fingers[name];if(!f)continue;f.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),side*cfg.curl));curled.push(name);}
 const thumb=fingers.Finger4_R;if(thumb){thumb.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(t.shaft.clone().negate(),side*cfg.thumb));curled.push('Finger4_R');}
 return {racket,head:racket.getObjectByName('head'),correction:t.correction,headLocal:t.headLocal,curled,transform:t};
}
