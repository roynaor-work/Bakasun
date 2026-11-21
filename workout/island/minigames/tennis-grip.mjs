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
 const url=new URL('../assets/tennis-grip-v1/racket.glb?v=island-v2-20261107-21',base).href;
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
/** v24.4 ready stance (Roy, 18/11/2026, after v24.3: "the look of holding the racket at the side came back"). The grip itself held (the fist closes
 * on the handle), but between strokes the game still held the racket the v24 way: shaft pointing down and out (handRotation [0,0,.6], the head
 * .9 below the hand), so from the game camera it hung by the child's leg. Between strokes (not swinging, not preparing, not tossing; waiting to serve
 * too, the ball then rests at the throat) the racket now comes up in front of the body, head up and forward toward the middle, the other hand on its throat, the way
 * a player waits for the ball; it blends in and out in `blend` seconds, so the backswing and the serve are untouched.
 * ?tennisReady=0 keeps the hanging racket. Directions are in the character's root space (+Y up, +Z forward, +X the racket hand's side). */
export function tennisReadyEnabled(search=globalThis.location?.search||''){return param('tennisReady',search)!=='0';}
export const READY_DEFAULTS=Object.freeze({dir:Object.freeze([-.38,.5,.78]),rightHand:Object.freeze([.24,1.33,.4]),rightElbow:Object.freeze([.36,1.36,.08]),throat:.27,leftElbow:Object.freeze([-.18,1.28,.3]),blend:.14});
export function readyConfig(config){return {...READY_DEFAULTS,...(config?.animation?.readyHold||{})};}
/** Is this player waiting between strokes (the ready stance applies)? */
export function readyStance(player,{phase,server,index}){
 if(player.swing>0||player.preparing)return false;
 if(index===server&&phase==='toss')return false;/* waiting to serve: the ball rests in the other hand, at the racket's throat */
 return true;
}
/** The racket's orientation in the ready stance (old-racket frame: shaft -Y toward the head, strings' normal +Z) and the hand targets. */
export function readyHold(T,cfg=READY_DEFAULTS){
 const d=new T.Vector3(...cfg.dir).normalize(),n=new T.Vector3(-d.z,0,d.x).normalize(),y=d.clone().negate(),x=new T.Vector3().crossVectors(y,n).normalize();
 const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,n));
 const right=new T.Vector3(...cfg.rightHand),left=right.clone().addScaledVector(d,cfg.throat);
 return {quaternion,dir:d,rightHand:right.toArray(),rightElbow:[...cfg.rightElbow],leftHand:left.toArray(),leftElbow:[...cfg.leftElbow]};
}
/** v24.5 racket poses (Roy, 18/11/2026, after v24.4: "the racket indeed is not seen in front, but it should be seen going up in the serve, and held
 * a little to the side when he tries to return a ball on the other side"). Two holds on top of the v24.4 ready stance, eased in and out:
 *  - trophy: while the server tosses, the racket rises from the ready hold to beside and above the head (the trophy position of a real serve:
 *    racket hand up at the side, elbow high, the head of the racket up and out past the hair: the game camera is high behind the child,
 *    and a racket straight above the head hides in his big hair, as v24.4's toss pose did), slowly enough to be seen (`tossRise` s); the
 *    serve swing takes over from there as before (contact IK unchanged);
 *  - backhand: while the ball comes to this player on the backhand side (the game's own forehand/backhand rule on the predicted contact), the
 *    racket is held a little to the other side with both hands (a short unit turn, the chest turned a little), not straight in front; it eases
 *    back out for the swing, so the backswing and the contact are untouched.
 * ?tennisPose=0 keeps v24.4. Positions in the character's root space (+Y up, +Z forward, +X the racket hand's side). */
export function tennisPoseEnabled(search=globalThis.location?.search||''){return param('tennisPose',search)!=='0';}
export const POSE25_DEFAULTS=Object.freeze({
 blend:.16,tossRise:.42,
 trophy:Object.freeze({dir:Object.freeze([.75,1,-.05]),rightHand:Object.freeze([.5,1.85,-.05]),rightElbow:Object.freeze([.56,1.56,-.02])}),
 backhand:Object.freeze({dir:Object.freeze([-.86,.46,.3]),rightHand:Object.freeze([-.18,1.3,.32]),rightElbow:Object.freeze([.16,1.3,.12]),throat:.27,leftElbow:Object.freeze([-.42,1.24,.2]),chest:.26})
});
export function pose25Config(config){const c=config?.animation?.pose25||{};return {...POSE25_DEFAULTS,...c,trophy:{...POSE25_DEFAULTS.trophy,...(c.trophy||{})},backhand:{...POSE25_DEFAULTS.backhand,...(c.backhand||{})}};}
/** The game's stroke side for a ball at x (tennis.mjs: forehand when (x - player.x) x (index 0 ? -1 : 1) >= 0). */
export function strokeSide(player,x,index){return (x-player.x)*(index===0?-1:1)>=0?'forehand':'backhand';}
/** Which v24.5 hold applies now: 'trophy' | 'backhand' | null. */
export function pose25Mode(player,{phase,server,index,contact,lastHitter}){
 if(player.swing>0)return null;
 if(phase==='toss'&&index===server)return 'trophy';
 if(player.preparing)return null;
 if(phase==='rally'&&contact&&contact.side===index&&lastHitter!==index&&Number.isFinite(contact.x)&&strokeSide(player,contact.x,index)==='backhand')return 'backhand';
 return null;
}
/** A hold's racket orientation (old-racket frame, as readyHold: shaft -Y toward the head) and arm targets; the left hand on the throat when `throat` is set. */
export function hold25(T,h){
 const d=new T.Vector3(...h.dir).normalize(),y=d.clone().negate();let n=new T.Vector3(-d.z,0,d.x);if(n.length()<.2)n.set(0,0,1);
 n.addScaledVector(d,-n.dot(d)).normalize();const x=new T.Vector3().crossVectors(y,n).normalize();
 const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,n)),out={quaternion,dir:d,rightHand:[...h.rightHand],rightElbow:[...h.rightElbow],chest:h.chest||0};
 if(h.throat){out.leftHand=new T.Vector3(...h.rightHand).addScaledVector(d,h.throat).toArray();out.leftElbow=[...h.leftElbow];}
 return out;
}
