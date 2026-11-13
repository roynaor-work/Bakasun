// SPDX-License-Identifier: CC0-1.0
// Original reproducible runner. The QA CLI and its mathematics are fetched byte-for-byte.
import {readFile, writeFile, mkdir, mkdtemp, symlink} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {renderClipReport} from './qa-report.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../../..');
const pinned = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath = 'workout/island/design/motion-qa-v1';
const output = path.join(base, 'verification');
const workspace = await mkdtemp(path.join(tmpdir(), 'soccer-clips-v13-qa-'));
const qaRoot = path.join(workspace, qaPath);
await mkdir(qaRoot, {recursive: true});
try { execFileSync('git', ['cat-file', '-e', `${pinned}^{commit}`], {cwd: repo, stdio: 'pipe'}); }
catch { execFileSync('git', ['fetch', '--depth=1', '--filter=blob:none', '--no-tags', 'origin', pinned], {cwd: repo, stdio: 'inherit'}); }
const sourceFiles = ['run.mjs', 'sources.mjs', 'sources.json', 'metrics.mjs', 'glb.mjs', 'report.mjs', 'sheets.mjs', 'licenses.mjs'];
const provenance = [];
for (const file of sourceFiles) {
  const bytes = execFileSync('git', ['show', `${pinned}:${qaPath}/${file}`], {cwd: repo, maxBuffer: 4 * 1024 * 1024});
  await writeFile(path.join(qaRoot, file), bytes);
  provenance.push({path: `${qaPath}/${file}`, commit: pinned,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length});
}
// The unchanged sampler imports the repository's existing MIT dependency.
await mkdir(path.join(qaRoot, '../soccer-motion-v8/runtime'), {recursive: true});
await symlink(path.join(repo, 'workout/island/design/soccer-motion-v8/runtime/vendor'),
  path.join(qaRoot, '../soccer-motion-v8/runtime/vendor'), 'dir');
await mkdir(output, {recursive: true});
const env = {...process.env, SOCCER_CLIPS_QA_ROOT: qaRoot,
  SOCCER_CLIPS_SOURCE_COMMIT: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim()};
const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(base, 'qa-register.mjs')).href,
  path.join(qaRoot, 'run.mjs'), '--library', 'soccer-clips-v13', '--fps', '120', '--out', path.join(output, 'qa')],
  {cwd: repo, env, stdio: 'inherit'});
if (result.status !== 0) throw new Error(`Pinned QA CLI failed with exit ${result.status}`);
process.env.SOCCER_CLIPS_QA_ROOT=qaRoot;
const {loadClipAssets}=await import('./qa-sources.mjs');
const {parseGLB,readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const {catalog,clips}=await loadClipAssets({fps:120});
const motionBytes=await readFile(path.join(base,'runtime/motions.json'));
const motions=JSON.parse(motionBytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(await readFile(path.join(output,'qa/report.json'),'utf8'));
const results=report.libraries[0].clips.filter(c=>catalog.clips.some(e=>e.id===c.id));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const nearest=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
function rotate(v,q){const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];}
const point=(f,bone,local)=>f.joints[bone].map((v,i)=>v+rotate(local,f.rotations[bone])[i]);
const canonical=catalog.skeleton;
const rig=JSON.parse(await readFile(path.join(repo,'workout/island/design/motion/soccer.json'),'utf8')).skeleton.bones;
const sameDefinition=canonical.length===18&&rig.length===18&&rig.every(b=>{const n=canonical.find(n=>n.name===b.name);return n?.parent===b.parent&&distance(n.rest,b.restTranslationMeters)<1e-8;});
// Read-only compatibility evidence against the actual v12 serialized skeleton.
const fixCommit='5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad';
try{execFileSync('git',['cat-file','-e',`${fixCommit}^{commit}`],{cwd:repo,stdio:'pipe'});}
catch{execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',fixCommit],{cwd:repo,stdio:'inherit'});}
const fixPath='workout/island/design/motion-fix-v12/runtime/soccer-v10/run.motion-fix-v12.glb';
const fixBytes=execFileSync('git',['show',`${fixCommit}:${fixPath}`],{cwd:repo,maxBuffer:4e6});
const fix=parseGLB(fixBytes).json,parents=new Map();
fix.nodes.forEach(n=>(n.children??[]).forEach(i=>parents.set(fix.nodes[i].name,n.name)));
const sameV12=canonical.every(b=>{const n=fix.nodes.find(n=>n.name===b.name);return n&&(parents.get(n.name)??null)===b.parent&&distance(n.translation??[0,0,0],b.rest)<1e-8;});
const checks=[];
for(const clip of clips){
  const entry=catalog.clips.find(c=>c.id===clip.id),authored=motions.clips.find(c=>c.id===clip.id),qa=results.find(c=>c.id===clip.id);
  const bytes=await readFile(path.join(base,'runtime',entry.asset)),glb=parseGLB(bytes),d=glb.json;
  const times=d.animations.flatMap(a=>a.samplers.map(s=>Array.from(readAccessor(glb,s.input))));
  let maxQuaternionError=0,maxHipsError=0;
  for(const f of authored.frames){const actual=nearest(clip.frames,f.time);maxHipsError=Math.max(maxHipsError,distance(actual.joints.Hips,f.hips));for(const b of canonical){const q=f.rotations[b.name],n=Math.hypot(...q),expected=q.map(v=>v/n);maxQuaternionError=Math.max(maxQuaternionError,Math.min(distance(actual.localRotations[b.name],expected),distance(actual.localRotations[b.name],expected.map(v=>-v))));}}
  const supports=entry.supports.map(w=>{const frames=clip.frames.filter(f=>f.t>=w.start-1e-7&&f.t<=w.end+1e-7),anchor=point(nearest(clip.frames,w.start),w.bone,w.local);return {...w,samples:frames.length,maxDrift3DMeters:Math.max(0,...frames.map(f=>distance(point(f,w.bone,w.local),anchor))),maxFloorErrorMeters:Math.max(0,...frames.map(f=>Math.abs(point(f,w.bone,w.local)[1])))};});
  const hit=entry.events.find(e=>['contact','release','receive'].includes(e.type));
  const hitFrame=hit?nearest(clip.frames,hit.time):null;
  const contact=hit?{...hit,ballCenter:hitFrame.ball,contactPoint:point(hitFrame,hit.bone,hit.local),gapMeters:Math.abs(distance(hitFrame.ball,point(hitFrame,hit.bone,hit.local))-.11)}:null;
  const required={goal_kick:['place','approach','contact'],keeper_throw:['release'],slide_tackle:['contact','recover','stand'],lob_pass:['contact'],chest_control:['receive'],volley:['contact'],throw_in:['release'],keeper_celebrate:['celebrate']}[clip.id];
  const fixedDurations={keeper_celebrate:1.8,goal_kick:1.6,keeper_throw:1.2,slide_tackle:1};
  const assertions={
    assetHash:hash(bytes)===entry.sha256&&bytes.length===entry.bytes,
    motionHash:hash(motionBytes)===catalog.sourceMotionSha256,
    fullNativePose:maxQuaternionError<1e-6&&maxHipsError<1e-6,
    canonical18:sameDefinition&&sameV12&&Object.keys(clip.frames[0].joints).length===18,
    native30Hz:times.every(a=>a.length===entry.frameCount&&a.every((t,i)=>Math.abs(t-i/30)<1e-6)),
    requestedDuration:!(clip.id in fixedDurations)||Math.abs(clip.duration-fixedDurations[clip.id])<1e-6,
    fixedRoot:clip.frames.every(f=>distance(f.root,[0,0,0])<1e-7&&distance(f.localRotations.Root,[0,0,0,1])<1e-7),
    noCompression:!JSON.stringify(d).includes('KHR_draco_mesh_compression')&&!JSON.stringify(d).includes('EXT_meshopt_compression'),
    score:qa.score>=88,noRedMetric:Object.values(qa.metrics).every(m=>m.status!=='red'),completeApplicableMetrics:qa.coverage===1,
    allSupportSliding:supports.every(w=>w.maxDrift3DMeters<=.02)&&qa.metrics.footSliding.evidence.maxDriftMeters<=.02,
    supportsOnFloor:supports.every(w=>w.maxFloorErrorMeters<=.02),
    requiredEvents:required.every(type=>entry.events.some(e=>e.type===type&&e.frame===Math.round(e.time*30))),
    contactGap:!contact||contact.gapMeters<=.02,
    idleBoundary:qa.metrics.continuity.status==='green',
    goalKickGroundBall:clip.id!=='goal_kick'||Math.abs(contact.ballCenter[1]-.11)<.015,
    volleyAirborne:clip.id!=='volley'||point(hitFrame,'RightFoot',[0,-.08,0])[1]>.35,
    lobFootBelowBall:clip.id!=='lob_pass'||contact.contactPoint[1]<contact.ballCenter[1]-.05,
    slideContactWindow:clip.id!=='slide_tackle'||entry.ballContactWindows.some(w=>w.end-w.start>=.09&&w.bone==='RightFoot'),
    slideRecovered:clip.id!=='slide_tackle'||distance(nearest(clip.frames,.9).joints.Hips,nearest(clip.frames,0).joints.Hips)<.03,
    overheadTwoHands:clip.id!=='throw_in'||(contact.ballCenter[1]>hitFrame.joints.Head[1]&&qa.metrics.ballContact.evidence.contacts.some(c=>c.bone==='RightHand'&&c.gapMeters<.02)),
    throwInBothSoles:clip.id!=='throw_in'||['LeftFoot','RightFoot'].every(b=>supports.some(w=>w.bone===b&&w.start===0&&w.end===entry.duration)),
  };
  checks.push({id:clip.id,score:qa.score,duration:clip.duration,assertions,nativePoseError:{maxQuaternionError,maxHipsErrorMeters:maxHipsError},supports,contact});
}
const failures=checks.flatMap(c=>Object.entries(c.assertions).filter(([,v])=>!v).map(([k])=>`${c.id}: ${k}`));
const evidence={schemaVersion:1,qaCommit:pinned,qaFiles:provenance,qaInvocation:'Original motion-qa-v1/run.mjs --library soccer-clips-v13 --fps 120; only sources.mjs redirected by Node hook',compatibility:{canonicalMainDefinition:sameDefinition,motionFixV12:{commit:fixCommit,path:fixPath,sha256:hash(fixBytes),matches:sameV12}},referenceRows:['idle_relaxed','idle_keeper'],clips:checks.length,minimumScore:Math.min(...results.map(c=>c.score)),redMetrics:results.reduce((s,c)=>s+Object.values(c.metrics).filter(m=>m.status==='red').length,0),maxHorizontalFootDriftMeters:Math.max(...results.map(c=>c.metrics.footSliding.evidence.maxDriftMeters)),maxSupportDrift3DMeters:Math.max(...checks.flatMap(c=>c.supports.map(w=>w.maxDrift3DMeters))),checks,failures,passed:checks.length===8&&!failures.length};
await writeFile(path.join(output,'requirements.json'),JSON.stringify(evidence,null,2)+'\n');
await renderClipReport(report,path.join(output,'qa'));
console.log(JSON.stringify({clips:evidence.clips,minimumScore:evidence.minimumScore,redMetrics:evidence.redMetrics,maxFootDriftMeters:evidence.maxHorizontalFootDriftMeters,passed:evidence.passed,failures},null,2));
if(!evidence.passed)process.exitCode=1;
