/** CC0-1.0. Read existing motion without writing or changing any clip.
 * Quaternions bind directly by the canonical 18 names. Only rest-relative
 * translation is converted from a tall donor's leg length to the canonical rig.
 */
export const BONES = Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
export const TALL_RATIOS = Object.freeze({guard:.824177,wing:.782552,center:.744929});

function base64Array(value, Type) {
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  return new Type(bytes.buffer);
}
function makeClip(T,id,duration,loop,times,rotations,hips) {
  const tracks=BONES.map((b,i)=>new T.QuaternionKeyframeTrack(b+'.quaternion',times,rotations[i]));
  tracks.push(new T.VectorKeyframeTrack('Hips.position',times,hips));
  const clip=new T.AnimationClip(id,duration,tracks);
  clip.userData={loop}; return clip;
}
export function soccerClip(T,id,state) {
  const times=[], rotations=BONES.map(()=>[]), hips=[];
  for(const f of state.keyframes) {
    times.push(f.time*state.durationSeconds);
    BONES.forEach((b,i)=>{const q=new T.Quaternion().fromArray(f.rotations[b]||[0,0,0,1]).normalize();rotations[i].push(...q.toArray());});
    const h=f.hipsOffsetMeters||[0,0,0]; hips.push(h[0],.86+h[1],h[2]);
  }
  return makeClip(T,id,state.durationSeconds,state.loop,times,rotations,hips);
}
export function tallClip(T,id,state,fps,profile) {
  const q=base64Array(state.quat,Int16Array),h=base64Array(state.hips,Int16Array);
  const times=[], rotations=BONES.map(()=>[]), hips=[],ratio=TALL_RATIOS[profile];
  for(let f=0;f<state.frames;f++) {
    times.push(f/fps);
    BONES.forEach((b,i)=>{const at=(f*18+i)*4;const v=new T.Quaternion(q[at]/32767,q[at+1]/32767,q[at+2]/32767,q[at+3]/32767).normalize();rotations[i].push(...v.toArray());});
    const jump=state.jumpScale?.[profile]??1;
    hips.push(h[f*3]/10000*ratio,.86+h[f*3+1]/10000*ratio*(h[f*3+1]>0?jump:1),h[f*3+2]/10000*ratio);
  }
  return makeClip(T,id,(state.frames-1)/fps,state.loop,times,rotations,hips);
}
export function hoopsV11Clip(T,state) {
  const data=base64Array(state.samples,Float32Array),times=[],rotations=BONES.map(()=>[]),hips=[];
  for(let f=0;f<state.frames;f++) {
    const at=f*76;
    times.push(data[at]*state.duration);
    hips.push(data[at+1]*state.legRatio,.86+data[at+2]*state.legRatio,data[at+3]*state.legRatio);
    BONES.forEach((b,i)=>{const k=at+4+i*4;rotations[i].push(...data.slice(k,k+4));});
  }
  return makeClip(T,'hoops-v11/'+state.id,state.duration,state.loop,times,rotations,hips);
}

export async function loadMotionCatalog(T) {
  const base=new URL('../../../assets/',import.meta.url);
  const json=async path=>{const response=await fetch(path);if(!response.ok)throw Error(response.status+' '+path);return response.json();};
  const [v9,v10,v11,v12,tall,hoops]=await Promise.all([
    ...['soccer-v9/clips.json','soccer-v10/clips.json','soccer-v11/clips.json','soccer-v12/clips.json','hoops-tall/motion-v12.json'].map(p=>json(new URL(p,base))),
    json(new URL('hoops-v11.json',import.meta.url)),
  ]);
  const clips=new Map();
  for(const [lib,doc] of [['soccer-v9',v9],['soccer-v10',v10],['soccer-v11',v11]])
    for(const [id,state] of Object.entries(doc.states)){const key=lib+'/'+id;clips.set(key,soccerClip(T,key,state));}
  for(const [library,states] of Object.entries(v12.libraries))for(const [id,state] of Object.entries(states)){
    const key='soccer-v12/'+library+'/'+id;clips.set(key,soccerClip(T,key,state));
  }
  for(const profile of ['guard','wing','center'])for(const [id,state] of Object.entries(tall.clips)){
    const key='hoops-tall-v12/'+profile+'/'+id;clips.set(key,tallClip(T,key,state,tall.fps,profile));
  }
  for(const state of hoops.clips){const clip=hoopsV11Clip(T,state);clips.set(clip.name,clip);}
  return clips;
}
