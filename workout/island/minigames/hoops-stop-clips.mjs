/** Island Pro Basketball: stop and fast-slide clips (hoops-stop-clips-v1, 28/11/2026). Pure rules plus the loader of the clip pack; no DOM.
 *
 * Why: the foot-slide measure (tools/hoops-v250-touch.mjs feet=1) found the planted foot dragging because the engine took a running player to
 * a standstill in about 0.3 s with no stopping clip (the foot slid up to 9 m/s) and the shuffle clip only covered speeds up to 2.2 m/s.
 * What: (1) the engine's stop mode: a player without the ball, running roughly where he looks, whose stick is released, stops on a constant
 * deceleration over `Ts` (0.42 / 0.34 / 0.30 s by entry speed) and the stop clip, which was authored for exactly that path, is played by the
 * time since the stop began, so a planted sole stays planted; (2) the fast shuffle clips (2.2 to 5.3 m/s) replace the run-and-turn above 2.2 m/s.
 * `?hoopsStopClips=0` returns to v25.0 behaviour (engine and view). The clips live in assets/hoops-stop-clips-v1/stop-clips.json, in the tall
 * pack encoding, canonical metres: a body of skeleton scale s plays them s times as fast and as far (`refScale` of its gait table). */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hyp=Math.hypot;

export const STOP_FLAG='hoopsStopClips';
/** On unless `?hoopsStopClips=0`. */
export function stopClipsEnabled(params){const q=params&&typeof params.get==='function'?params.get(STOP_FLAG):null;return q!=='0';}

/** Engine side. Speeds are world m/s. `bands`: the entry speed from which a stop lasts `Ts` seconds (the clips' own braking time). */
export const STOP=Object.freeze({
 minSpeed:2.4,        // slower than this the old physics stops the player at once
 release:0.4,         // stick released: wanted speed below this
 cancel:1.2,          // stick pushed again (wanted speed above this): the stop ends and the normal physics take over
 forward:0.77,        // the travel direction must be within about 40 degrees of where he looks (the clips run forward)
 hold:0.65,           // the stop (and the clip) lasts at most this long after it began
 bands:Object.freeze([{from:5.0,Ts:0.42,family:'sprint'},{from:3.2,Ts:0.34,family:'run'},{from:0,Ts:0.30,family:'jog'}]),
 slide:Object.freeze({from:2.2,to:5.3,hysteresis:0.2}),
});
/** The engine's option: STOP, or null when off. */
export const engineStopClips=params=>stopClipsEnabled(params)?STOP:null;
export function stopBand(v0,cfg=STOP){return cfg.bands.find(b=>v0>=b.from)||cfg.bands[cfg.bands.length-1];}

/** One engine step of the stop mode for player `p` ({vx,vz,face,act,stumble,stop}). Returns true when it set p.vx / p.vz this step
 * (the caller then skips its own acceleration), false when the normal physics run. `ctx` = {airborne, hasBall, wantSpeed}. */
export function stepStop(p,dt,ctx,cfg=STOP){
 if(!cfg)return false;
 const busy=ctx.airborne||ctx.hasBall||!!p.act||(p.stumble||0)>0;
 if(p.stop){
  if(busy||ctx.wantSpeed>cfg.cancel){p.stop=null;return false;}
 }else{
  if(busy||ctx.wantSpeed>cfg.release)return false;
  const sp=hyp(p.vx,p.vz);if(sp<cfg.minSpeed)return false;
  const ux=p.vx/sp,uz=p.vz/sp;
  if(ux*Math.sin(p.face||0)+uz*Math.cos(p.face||0)<cfg.forward)return false;
  p.stop={t:0,v0:sp,ux,uz,Ts:stopBand(sp,cfg).Ts};
 }
 const s=p.stop;s.t+=dt;
 if(s.t>=cfg.hold){p.stop=null;if(hyp(p.vx,p.vz)<0.05){p.vx=0;p.vz=0;}return false;}
 const k=Math.max(0,1-s.t/s.Ts);p.vx=s.ux*s.v0*k;p.vz=s.uz*s.v0*k;
 return true;
}
export const snapshotStop=p=>p.stop?{t:+p.stop.t.toFixed(3),v0:+p.stop.v0.toFixed(3),Ts:p.stop.Ts}:null;

// ---- the pack ----------------------------------------------------------------------------------------------------
/** json (tall-pack encoding + `stop` table) -> {pack (decodeTallPack output), meta}. Throws on anything unexpected. */
export function decodeStopPack(json,decodeTallPack){
 if(!json?.stop?.variants?.length||!json.stop.slide?.left||!json.stop.slide?.right)throw Error('Stop clip pack is malformed');
 const pack=decodeTallPack(json);
 for(const v of json.stop.variants)if(!pack.clips[v.id])throw Error('Stop clip missing: '+v.id);
 for(const id of [json.stop.slide.left,json.stop.slide.right])if(!pack.clips[id])throw Error('Slide clip missing: '+id);
 return {pack,meta:json.stop};
}
export async function loadStopClips(base,url,decodeTallPack,fetchImpl=globalThis.fetch){
 const r=await fetchImpl(new URL(url,base));if(!r.ok)throw Error('Stop clip pack '+r.status);
 return decodeStopPack(await r.json(),decodeTallPack);
}
/** The variant whose own entry speed (canonical) is nearest, in a log scale, to `v0World / scale`, within the family of the engine's `Ts`. */
export function pickStopVariant(meta,v0World,scale,Ts){
 const vc=Math.max(.2,v0World/Math.max(.5,scale||1));let best=null,bd=Infinity;
 for(const v of meta.variants){if(Math.abs(v.Ts-Ts)>0.005)continue;const d=Math.abs(Math.log(vc/v.v0));if(d<bd){bd=d;best=v;}}
 return best||meta.variants[0];
}
/** The fast shuffle for a lateral speed: clip, playback rate (the clip's reference speed times the body scale gives rate 1), or null outside its range.
 * `current` = the clip played now (hysteresis at both ends of the speed range). */
export function slideFastPlan(meta,speed,lat,scale,current=null,cfg=STOP){
 const s=meta.slide,h=cfg.slide.hysteresis,on=current&&/slide_fast/.test(current);
 if(speed<cfg.slide.from-(on?h:0)||speed>cfg.slide.to+(on?h:0))return null;
 const rr=s.rateRange||[.6,1.4],ref=s.refSpeed*Math.max(.5,scale||1);
 return {clip:lat>0?s.left:s.right,rate:clamp(speed/ref,rr[0],rr[1]+.05)};
}
