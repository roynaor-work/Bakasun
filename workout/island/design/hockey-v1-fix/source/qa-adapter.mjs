// SPDX-License-Identifier: CC0-1.0
// מקור: נגזר מ-PR 414 source/qa-adapter.mjs (CC0); שינוי נתיב קלט ומקור בלבד.
// כל דגימות, המטא-דאטה, נוסחאות, ספים ובחירת idle/mirror נשארו זהים.
// המדדים המקוריים המניחים סוליה נטועה נשמרים בציון הגולמי. אין שינוי ספים או החרגת כישלונות.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {CANON_NAMES, normaliseSoccerClip, sampleCanonical, jointWorld, qrotate, gaitMetrics, checkGait, checkStand, ATHLETE_STANDARD} from '../../../minigames/athletes-core.mjs';
import {fetchTool, commit, hashes, repository, sourcePath} from '../../hockey-v1/source/qa-adapter-fetch.mjs';

const folder = new URL('../', import.meta.url);
const clipPath = process.env.HOCKEY_FIX_CLIPS ? pathToFileURL(path.resolve(process.env.HOCKEY_FIX_CLIPS)) : new URL('clips.json', folder);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const round = x => Number(x.toFixed(6));
export const SOURCES = [{id:'hockey-v1', sport:'hockey', version:1, commit:'working-tree', path:'workout/island/design/hockey-v1-fix', ref:'codex/hockey-fix-v1'}];

function supportSeconds(state) {
  return (state.supports || []).map(w => ({...w,
    start:w.startSeconds ?? w.start ?? w.startTime * state.durationSeconds,
    end:w.endSeconds ?? w.end ?? w.endTime * state.durationSeconds,
    local:w.local ?? w.localPointMeters ?? [0,-.08,0],
  }));
}
function referenceAt(state, t) {
  if(Array.isArray(state.referenceRootMotion)&&state.referenceRootMotion.length) {
    const keys=state.referenceRootMotion;
    let i=0;while(i<keys.length-2&&keys[i+1].timeSeconds<t)i++;
    const a=keys[i],b=keys[Math.min(keys.length-1,i+1)],u=Math.max(0,Math.min(1,(t-a.timeSeconds)/(b.timeSeconds-a.timeSeconds||1)));
    return a.translationMeters.map((v,j)=>v+(b.translationMeters[j]-v)*u);
  }
  const u = t / state.durationSeconds;
  const keys = state.keyframes.filter(k=>k.referenceRootTranslationMeters);
  if (keys.length) {
    let i=0; while(i < keys.length-2 && keys[i+1].time < u) i++;
    const a=keys[i], b=keys[Math.min(keys.length-1,i+1)], q=Math.max(0,Math.min(1,(u-a.time)/(b.time-a.time||1)));
    return a.referenceRootTranslationMeters.map((v,j)=>v+(b.referenceRootTranslationMeters[j]-v)*q);
  }
  return (state.referenceVelocityMps || [0,0,state.speedMps || 0]).map(v=>v*t);
}
export function framesForState(name, state, fps=60) {
  const clip = normaliseSoccerClip(name, state, 'hockey-v1');
  const once = {...clip, loop:false};
  const supports = supportSeconds(state);
  const times = [...new Set([
    ...Array.from({length:Math.ceil(clip.dur*fps)+1},(_,i)=>Math.min(clip.dur,i/fps)),
    ...state.keyframes.map(k=>k.time*clip.dur),
    ...supports.flatMap(s=>[s.start,s.end]),
    ...(state.events||[]).map(e=>e.timeSeconds ?? e.time),
  ])].filter(t=>Number.isFinite(t)&&t>=0&&t<=clip.dur).sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-6);
  return times.map(t=>{
    const w=jointWorld(sampleCanonical(once,t));
    const localJoints=Object.fromEntries(CANON_NAMES.map(n=>[n,w[n].p]));
    const rotations=Object.fromEntries(CANON_NAMES.map(n=>[n,w[n].q]));
    const referenceRoot=referenceAt(state,t), assetRoot=[0,0,0];
    const joints=Object.fromEntries(CANON_NAMES.map(n=>[n,add(w[n].p,referenceRoot)]));
    const soles=Object.fromEntries(['LeftFoot','RightFoot'].map(b=>[b,add(joints[b],qrotate(rotations[b],[0,-.08,0]))]));
    const palms=Object.fromEntries(['LeftHand','RightHand'].map(b=>[b,add(joints[b],qrotate(rotations[b],[0,-.08,.025]))]));
    return {t,joints,rotations,localJoints,assetRoot,root:referenceRoot,referenceRoot,soles,palms,
      contactPoints:Object.fromEntries(Object.entries(soles).map(([b,p])=>[`${b}:sole`,p])),
      floorPoints:Object.entries(soles).map(([bone,position])=>({bone,position})),ball:null};
  });
}
export async function loadLibraries({fps=60}={}) {
  const bytes=await readFile(clipPath), pack=JSON.parse(bytes);
  const clips=Object.entries(pack.states).map(([id,state])=>{
    const supports=supportSeconds(state);
    return {id,label:state.labelHe ?? state.label ?? id,duration:state.durationSeconds,height:1.85,role:state.role ?? (/^goalie/.test(id)?'goalie':'skater'),
      metadata:{loop:state.loop,role:state.role ?? (/^goalie/.test(id)?'goalie':'skater'),
        locomotion:!!state.gaitKind,kind:state.gaitKind?'locomotion':'action',speed:state.speedMps ?? 0,
        rootMotion:false,referenceTravelKnown:!!state.referenceVelocityMps || state.speedMps > 0,
        referenceRootMotion:{samples:state.referenceRootMotion || []},
        supports,events:state.events || [],soleLocal:[0,-.08,0],floorY:0,checkHingeDirection:true,
        ballVisible:false,ballContacts:[],symmetryMode:state.loop&&state.gaitKind?'gait':'structural',
        coordinateSpace:'authored reference world; in-place canonical poses plus declared reference trajectory',
        contactModel:'blade',allowsTangentialBladeMotion:true,
        unsupportedMetrics:['footSliding assumes stationary soles','bodySliding assumes backward foot sweep equal to body speed']},
      frames:framesForState(id,state,fps)};
  });
  return [{...SOURCES[0],source:SOURCES[0],clips,sources:[{path:'clips.json',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}]}];
}
function bladeDiagnostics(frames,state) {
  return supportSeconds(state).map(window=>{
    const rows=frames.filter(f=>f.t>=window.start-1e-8&&f.t<=window.end+1e-8).map(f=>({
      t:f.t, point:add(f.joints[window.bone],qrotate(f.rotations[window.bone],window.local)),
      forward:qrotate(f.rotations[window.bone],[0,0,1]),
    }));
    let maxLateralSpeed=0, maxAlongBladeSpeed=0;
    for(let i=1;i<rows.length;i++) {
      const a=rows[i-1],b=rows[i],v=sub(b.point,a.point).map(x=>x/(b.t-a.t));
      const norm=Math.hypot(b.forward[0],b.forward[2]) || 1;
      const x=b.forward[0]/norm,z=b.forward[2]/norm;
      maxLateralSpeed=Math.max(maxLateralSpeed,Math.abs(v[0]*z-v[2]*x));
      maxAlongBladeSpeed=Math.max(maxAlongBladeSpeed,Math.abs(v[0]*x+v[2]*z));
    }
    return {bone:window.bone,start:window.start,end:window.end,contact:window.contact,
      samples:rows.length,maxAbsHeightMeters:round(Math.max(0,...rows.map(r=>Math.abs(r.point[1])))),
      maxLateralSpeedMps:round(maxLateralSpeed),maxAlongBladeSpeedMps:round(maxAlongBladeSpeed),
      horizontalTravelMeters:rows.length?round(Math.hypot(...sub(rows.at(-1).point,rows[0].point).filter((_,i)=>i!==1))):0};
  });
}
export async function runEvidence(out=new URL('evidence/',folder).pathname) {
  const toolDirectory=await fetchTool(process.env.HOCKEY_QA_TOOL_DIR || '/tmp/hockey-qa');
  const {analyzeClip}=await import(pathToFileURL(path.join(toolDirectory,'metrics.mjs')).href);
  const libraries=await loadLibraries(),library=libraries[0];
  const pack=JSON.parse(await readFile(clipPath,'utf8'));
  const idles=library.clips.filter(c=>/ready|stance/.test(c.id));
  const measured=library.clips.map(clip=>{
    const state=pack.states[clip.id];
    const idle=idles.find(c=>c.role===clip.role&&c.id!==clip.id) || idles.find(c=>c.role===clip.role);
    const mirrorId=clip.id.includes('_left')?clip.id.replace('_left','_right'):clip.id.includes('_right')?clip.id.replace('_right','_left'):null;
    const mirror=mirrorId?library.clips.find(c=>c.id===mirrorId):null;
    const metadata=mirror?{...clip.metadata,mirrorFrames:mirror.frames}:clip.metadata;
    const raw=analyzeClip({frames:clip.frames,duration:clip.duration,height:clip.height,metadata,idleFrames:idle?.frames,clipId:clip.id,sport:'hockey'});
    const canonical=normaliseSoccerClip(clip.id,state,'hockey-v1');
    const metrics=gaitMetrics(canonical,120);
    const fails=state.gaitKind?checkGait(metrics,state.gaitKind):/ready|stance/.test(clip.id)?checkStand(metrics):[];
    return {id:clip.id,label:clip.label,role:clip.role,gaitKind:state.gaitKind ?? null,
      idleReference:idle?.id ?? null,rawCodex:raw,athleteMetrics:metrics,athleteFails:fails,
      bladeDiagnostics:bladeDiagnostics(clip.frames,state)};
  });
  const result={schemaVersion:1,license:'CC0-1.0',source:'מדידה מחושבת מהקליפים ומנוסחאות המקור ללא שינוי',
    tool:{repository,commit,sourcePath,sha256:hashes},clipSource:library.sources[0],standard:ATHLETE_STANDARD,
    interpretationHe:'הציון הגולמי שומר את מדדי הסוליה הנטועה של הכלי. מדדים אלה אינם מודל פיזיקלי ללהב נע על קרח. מדדי הלהב הנוספים אינם מחליפים ציון זה ואינם ציון תחושה.',
    summary:{count:measured.length,minRawCodexScore:Math.min(...measured.map(c=>c.rawCodex.score)),
      rawCodexFailures:measured.filter(c=>c.rawCodex.score<88).map(c=>({id:c.id,score:c.rawCodex.score})),
      athleteFailures:measured.filter(c=>c.athleteFails.length).map(c=>({id:c.id,fails:c.athleteFails}))},clips:measured};
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'motion-measurements.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary));
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runEvidence(process.argv[2]);
