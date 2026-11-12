// SPDX-License-Identifier: CC0-1.0
// מקור: אימות נתוני מסירת התיקון מול קו בסיס PR 414 והמדדים המקוריים.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CANON_NAMES,normaliseSoccerClip,sampleCanonical,jointWorld} from '../../../minigames/athletes-core.mjs';
const folder=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,folder),'utf8'));
const pack=read('clips.json'),original=read('../hockey-v1/clips.json');
const before=read('evidence/before/codex-qa/report.json').libraries[0].clips;
const after=read('evidence/after/codex-qa/report.json').libraries[0].clips;
const measured=read('evidence/after/motion-measurements.json');
const errors=[],fail=(ok,message)=>{if(!ok)errors.push(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const preserved=before.filter(c=>c.score>=88).map(c=>{
 const next=after.find(x=>x.id===c.id),unchangedState=same(original.states[c.id],pack.states[c.id]),unchangedMetrics=same(c.metrics,next.metrics);
 fail(unchangedState&&unchangedMetrics&&c.score===next.score,'נסיגה בקליפ עובר: '+c.id);
 return {id:c.id,before:c.score,after:next.score,unchangedState,unchangedMetrics,stateSha256:digest(pack.states[c.id])};
});
fail(preserved.length===15,'מספר הקליפים השמורים אינו 15');
fail(Object.keys(pack.states).length===30,'מספר קליפים אינו 30');
for(const [id,c]of Object.entries(pack.states)){
 fail(c.fps===30&&c.keyframes.length===Math.round(c.durationSeconds*30)+1,id+': קצב או כיסוי');
 for(let i=0;i<c.keyframes.length;i++){
  const k=c.keyframes[i];
  fail(Math.abs(k.time-i/(c.keyframes.length-1))<1e-5,id+': זמן פריים');
  fail(same(Object.keys(k.rotations),CANON_NAMES),id+': כיסוי עצמות');
  fail(k.hipsOffsetMeters.length===3&&k.hipsOffsetMeters.every(Number.isFinite),id+': אגן');
  fail(Object.values(k.rotations).every(q=>q.length===4&&q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<1e-5),id+': קווטרניון');
 }
 if(c.loop){
  const a=c.keyframes[0],b=c.keyframes.at(-1);
  fail(same(a.rotations,b.rotations)&&same(a.hipsOffsetMeters,b.hipsOffsetMeters),id+': לולאה');
 }
}
const protectedFields=['durationSeconds','fps','loop','speedMps','referenceVelocityMps','referenceRootMotion','supports','gaitKind','group'];
const attempts=[1,2,3].map(attempt=>{
 const p=read(`evidence/attempt-${attempt}/clips.json`),m=read(`evidence/attempt-${attempt}/motion-measurements.json`);
 for(const [id,state]of Object.entries(p.states))if(id!=='celebrate_3')for(const field of protectedFields)fail(same(state[field],original.states[id][field]),`ניסיון ${attempt} ${id}: שדה מוגן ${field}`);
 fail(m.summary.athleteFailures.length===0,`ניסיון ${attempt}: תקן אתלט`);
 return {attempt,athleteFailures:m.summary.athleteFailures,clipsSha256:createHash('sha256').update(readFileSync(new URL(`evidence/attempt-${attempt}/clips.json`,folder))).digest('hex')};
});
// בנוסף ל-elbowMean של התקן: טווח מרפק פנימי בכל דגימות 120Hz, עבור דרישת המשתמש.
const angle=(a,b,c)=>{
 const u=a.map((v,i)=>v-b[i]),v=c.map((x,i)=>x-b[i]);
 return Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,i)=>s+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI;
};
const athlete=measured.clips.filter(c=>c.gaitKind).map(c=>{
 const state=pack.states[c.id],clip={...normaliseSoccerClip(c.id,state,'hockey-v1'),loop:false};let min=Infinity,max=-Infinity;
 const count=Math.ceil(state.durationSeconds*120);
 for(let i=0;i<=count;i++){
  const w=jointWorld(sampleCanonical(clip,state.durationSeconds*i/count));
  for(const side of ['Left','Right']){
   const a=angle(w[side+'Arm'].p,w[side+'ForeArm'].p,w[side+'Hand'].p);min=Math.min(min,a);max=Math.max(max,a);
  }
 }
 fail(!c.athleteFails.length&&min>=40-1e-4&&max<=100+1e-4,c.id+': תקן אתלט/טווח מרפק בפריים');
 return {id:c.id,gaitKind:c.gaitKind,...c.athleteMetrics,elbowMin120Hz:min,elbowMax120Hz:max,samples120Hz:count+1,fails:c.athleteFails};
});
const mesh=read('evidence/mesh-contact.json');
fail(mesh.summary.allBodyAboveTolerance&&mesh.summary.allStickAboveTolerance,'חדירת רשת לקרח');
const hash=createHash('sha256').update(readFileSync(new URL('clips.json',folder))).digest('hex');
fail(hash===mesh.inputs.clipsSha256&&hash===measured.clipSource.sha256,'חתימת קלט אינה תואמת');
const browser=read('preview/browser-evidence.json');
fail(browser.errors.length===0&&browser.sheets.length===45&&browser.framesPerRevision===8,'גיליונות דפדפן חסרים או שגויים');
fail(browser.inputs.find(i=>i.path.endsWith('hockey-v1-fix/clips.json'))?.sha256===hash,'חתימת הרנדר אינה תואמת');
for(const sheet of browser.sheets)fail(readFileSync(new URL(sheet.path,folder)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'קובץ PNG לא תקין: '+sheet.path);
const result={license:'CC0-1.0',source:'source/validate-fix.mjs',passed:errors.length===0,errors,clipsSha256:hash,preserved,attempts,athlete,meshSummary:mesh.summary,ready:after.filter(c=>before.find(x=>x.id===c.id).score<88&&c.score>=88&&!Object.values(c.metrics).some(m=>m.status==='red')).map(c=>({id:c.id,score:c.score})),notReady:after.filter(c=>before.find(x=>x.id===c.id).score<88&&(c.score<88||Object.values(c.metrics).some(m=>m.status==='red'))).map(c=>({id:c.id,score:c.score,redMetrics:Object.entries(c.metrics).filter(([,m])=>m.status==='red').map(([key])=>key)}))};
writeFileSync(new URL('evidence/validation.json',folder),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,errors,ready:result.ready,notReady:result.notReady.length,preserved:preserved.length,athlete:athlete.length}));
if(errors.length)process.exitCode=1;
