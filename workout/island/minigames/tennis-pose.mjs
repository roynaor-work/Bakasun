// Pure pose sampling. All joint targets and timing live in the tennis config.
const mix=(a,b,t)=>a+(b-a)*t;
function blend(a,b,t){return Object.fromEntries(Object.keys(a).filter(k=>k!=='at').map(k=>[k,Array.isArray(a[k])?a[k].map((v,i)=>mix(v,b[k][i],t)):mix(a[k],b[k],t)]));}
export function tennisPose(player,config,{toss=false,tossProgress=0}={}){
 const a=config.animation,ready=a.ready;
 let u,frames;
 if(toss){const t=Math.min(1,tossProgress*4);return blend(ready,a.serve[0],t*t*(3-2*t));}
 else if(player.swing>0){u=1-player.swing/(player.swingDuration||config.player.swingSeconds);frames=player.serving?a.serve:a[player.stroke||'forehand'];}
 else if(player.preparing){u=a.previewFraction;frames=a[player.stroke||'forehand'];}
 else return structuredClone(ready);
 const keys=[...frames,{at:1,...ready}],clamped=Math.max(0,Math.min(1,u));
 let low=keys[0],high=keys[1];for(let i=1;i<keys.length;i++){high=keys[i];if(clamped<=high.at)break;low=high;}
 let t=(clamped-low.at)/(high.at-low.at);t=t*t*(3-2*t);
 const pose=blend(low,high,t);
 if(player.lob&&!player.serving){const lift=Math.sin(clamped*Math.PI)*a.lobLift;pose.rightHand[1]+=lift;pose.rightElbow[1]+=lift*a.lobFollowLift;}
 return pose;
}
