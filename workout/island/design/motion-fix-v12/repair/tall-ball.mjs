/** Original CC0-1.0. Retarget an independently authored ball trajectory for tall actors.
 * Provenance: immutable hoops-tall-v1 runtime/keyframes/{v8,v9}/*.json.gz and rig.json
 * from commit cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa (CC0-1.0). The source's ball
 * positions and contact windows are retained as evidence. No ball position is obtained
 * from the target hand, its FK, or a hand guide. Only rest proportions, source flight
 * lift, and the already documented target dunk-lift calibration affect the trajectory.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const cacheRoot=process.env.MOTION_FIX_CACHE??'/tmp/motion-fix-cache';
const radius=.12,canonicalPalm=[0,-.08,.025];
const norm=v=>Math.hypot(...v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const lerp=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const hash=b=>createHash('sha256').update(b).digest('hex');
const documents=new Map();
async function immutableJson(library,relative){
 const full=`${library.source.path}/${relative}`,key=`${library.source.commit}:${full}`;
 if(!documents.has(key))documents.set(key,(async()=>{const bytes=await readFile(join(cacheRoot,library.source.commit,full)),record=library.sources?.find(s=>s.path===full);if(record?.sha256&&hash(bytes)!==record.sha256)throw new Error(`Tall source integrity mismatch: ${full}`);return JSON.parse((relative.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));})());
 return documents.get(key);
}
function sample(keys,t){if(t<=keys[0].time)return keys[0];if(t>=keys.at(-1).time)return keys.at(-1);let a=0,b=keys.length-1;while(b-a>1){const m=(a+b)>>1;if(keys[m].time<=t)a=m;else b=m;}const x=keys[a],y=keys[b],u=(t-x.time)/(y.time-x.time||1);return {time:t,ballPositionMeters:lerp(x.ballPositionMeters,y.ballPositionMeters,u),hipsOffsetMeters:lerp(x.hipsOffsetMeters??[0,0,0],y.hipsOffsetMeters??[0,0,0],u),referenceRootTranslationMeters:lerp(x.referenceRootTranslationMeters??[0,0,0],y.referenceRootTranslationMeters??[0,0,0],u)};}
function sourceBoneMap(data){return new Map((data.skeleton?.bones??[]).map(j=>[j.name,{...j,translation:j.restTranslationMeters??j.translation??[0,0,0]}]));}
function restWorld(map,name){const j=map.get(name);return j?plus(j.translation,j.parent?restWorld(map,j.parent):[0,0,0]):[0,0,0];}
function proportions(data,profile){
 const source=sourceBoneMap(data),target=new Map(profile.joints.map(j=>[j.name,j]));
 const reach=(map,palm)=>{const shoulder=restWorld(map,'RightArm')[1],upper=norm(map.get('RightForeArm')?.translation??[0,-.27,0]),lower=norm(map.get('RightHand')?.translation??[0,-.24,0]);return shoulder+upper+lower+norm(palm);};
 const sourceReach=reach(source,canonicalPalm),targetPalm=profile.palms?.RightHand?.palmPoint??profile.palmPoint??canonicalPalm,targetReach=reach(target,targetPalm),armLength=map=>norm(map.get('RightForeArm')?.translation??[0,-.27,0])+norm(map.get('RightHand')?.translation??[0,-.24,0]);
 return {horizontalWidth:Math.abs(target.get('RightArm').translation[0]/source.get('RightArm').translation[0]),horizontalReach:armLength(target)/armLength(source),verticalReach:(targetReach-radius)/(sourceReach-radius),sourceReach,targetReach};
}
const windowSeconds=(w,D)=>({bone:w.bone??w.effector,start:w.startSeconds??w.start??(w.startTime??0)*D,end:w.endSeconds??w.end??(w.endTime??1)*D});
/** Return a copy. The baseline clip, its frames and its metadata are never mutated. */
export async function augmentTallClip(clip,library){
 if(library.id!=='hoops-tall-v1'&&library.source?.kind!=='tall')return clip;
 const [profileId,sourceLibrary,sourceId]=clip.id.split('/'),profileName=clip.profile??profileId,motionId=clip.motionId??sourceId;
 const rig=await immutableJson(library,'rig.json'),profile=rig.profiles.find(p=>p.id===profileName);
 if(!profile)throw new Error(`Unknown tall profile ${profileName}`);
 const relative=`runtime/keyframes/${clip.metadata?.sourceLibrary??sourceLibrary}/${motionId}.json.gz`,data=await immutableJson(library,relative);
 if(data.ball?.visible===false||!data.keyframes?.length||!data.keyframes.every(f=>Array.isArray(f.ballPositionMeters)&&f.ballPositionMeters.every(Number.isFinite)))return clip;
 const D=data.durationSeconds,scale=proportions(data,profile),jumpScale=clip.metadata?.calibration?.jumpScale??1;
 // Ground-relative affine body scaling keeps the sphere's lower surface on the floor.
 // Positive airborne hips lift is removed before that scale and reintroduced once with
 // the same calibrated lift that drove the target body. This avoids double jump scaling.
 const retarget=f=>{const p=f.ballPositionMeters,lift=Math.max(0,f.hipsOffsetMeters?.[1]??0);return [p[0]*scale.horizontalWidth,Math.max(radius,radius+(p[1]-radius-lift)*scale.verticalReach+lift*jumpScale),p[2]*scale.horizontalReach];};
 const frames=clip.frames.map(frame=>{const source=sample(data.keyframes,clamp(frame.t/D,0,1)),reference=[...(frame.referenceRoot??source.referenceRootTranslationMeters??[0,0,0])],local=retarget(source);return {...frame,ball:plus(local,reference),sourceBall:{originalRootLocal:[...source.ballPositionMeters],retargetedRootLocal:local,referenceRoot:reference,independent:true}};});
 const contacts=(data.ballContactWindows??[]).map(w=>{const c=windowSeconds(w,D);return {...w,...c,local:[...(profile.palms?.[c.bone]?.palmPoint??profile.palmPoint??canonicalPalm)]};});
 const events=(data.events??[]).map(e=>({...e,type:e.type??e.name??e.event,time:e.timeSeconds??e.atSeconds??(e.time??0)*D,bone:e.bone??e.effector??e.hand??e.foot}));
 const metadata={...clip.metadata,events,ballContacts:contacts,ballRadius:radius,ballVisible:true,ballContactExpected:contacts.length>0,ball:{...clip.metadata.ball,...data.ball,radius,radiusMeters:radius,visible:true,coordinateSpace:'retargeted independent source root-local path plus source reference translation exactly once'},ballRetargeting:{method:'independent source path; rest width and arm reach; floor-radius-preserving vertical reach; calibrated flight lift applied once',source:{commit:library.source.commit,path:`${library.source.path}/${relative}`,license:'CC0-1.0'},profile:profileName,scale,jumpScale,contactPointSource:'measured target profile palm surface in rig.json',attachedToTargetHand:false}};
 delete metadata.ballMeasurementUnavailable;delete metadata.unavailableBallContactCount;
 return {...clip,metadata,frames,sourceBall:{independent:true,originalSource:metadata.ballRetargeting.source,normalizedTime:true,duration:D,retargeting:metadata.ballRetargeting}};
}
