/** Original CC0-1.0. Explicit integration gate; never edits measured scores. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {summarize,METRICS} from './measure.mjs';
const base=path.dirname(fileURLToPath(import.meta.url)),manifest=JSON.parse(await readFile(path.join(base,'manifest.json')));
if(manifest.clips.length!==741||manifest.libraries.length!==10)throw new Error('Refusing to finalize an incomplete source inventory.');
const yellow=c=>Object.entries(c.after.metrics).filter(([,m])=>m.status==='yellow');
function reasonFor(name,m){
 const e=m.evidence??{},n=v=>Number.isFinite(v)?Number(v.toFixed(5)):'—';
 let detail=`${METRICS[name].label}: ${m.status}, ערך ${n(m.value)}; גבול ירוק ${METRICS[name].green}, גבול צהוב ${METRICS[name].yellow}`;
 if(name==='footSliding')detail+=`; תזוזת סוליה ${n(e.maxDriftMeters)} מ׳ (${e.worst?.bone??''})`;
 if(name==='posePops')detail+=`; צעד סיבוב ${n(e.maxDegrees60Hz)} מעלות שקולות ב־60Hz, עצם ${e.worst?.bone??''}, זמן ${n(e.worst?.t)} ש׳`;
 if(name==='bodySliding')detail+=`; מהירות שורש ${n(e.rootSpeedMetersPerSecond)} לעומת סחיפת רגל ${n(e.backwardSweepSpeedMetersPerSecond)} מ׳/ש׳`;
 if(name==='symmetry')detail+=`; ${e.mode??''}, פער תנועה מנורמל ${n(e.motionRmsHeight)}`;
 if(name==='continuity')detail+=`; קצה ${e.worstEndpoint??''}`;
 if(m.reason)detail+=`; ${m.reason}`;
 return detail;
}
for(const c of manifest.clips){
 const failures=Object.entries(c.after.metrics).filter(([,m])=>['red','insufficient-data'].includes(m.status));
 if(failures.length||c.after.score<80){c.status='blocked';c.reason=failures.map(([k,m])=>reasonFor(k,m)).join(' · ')||`ציון מועמד ${c.after.score} נמוך מ־80`;c.blockingClass='unresolved-measurement';}
}
for(const library of manifest.libraries){
 const entries=manifest.clips.filter(c=>c.library===library.id),admitted=entries.filter(c=>c.status!=='blocked'),green=admitted.filter(c=>!yellow(c).length),yellowEntries=admitted.filter(c=>yellow(c).length);
 // Retain the mildest measured residuals within an exact 5% budget.
 // All exclusions remain in the full-library report and retain their assets.
 const budget=Math.floor(green.length/19);
 const severity=c=>Math.max(...yellow(c).map(([k,m])=>m.value/METRICS[k].green));
 yellowEntries.sort((a,b)=>severity(a)-severity(b)||b.after.score-a.after.score||a.key.localeCompare(b.key));
 for(const c of yellowEntries.slice(budget)){
  c.status='blocked';c.blockingClass='residual-yellow-budget';
  c.reason=`נותרו מדדים צהובים לאחר תיקון IK, החלקה ותזמון מוגבל; נשמר לסקירה מחוץ לקטלוג המותר כדי לא לחרוג מ־5% צהובים. `+yellow(c).map(([k,m])=>reasonFor(k,m)).join(' · ');
 }
 const accepted=entries.filter(c=>c.status!=='blocked');library.after=summarize(entries.map(c=>c.after));library.accepted=summarize(accepted.map(c=>c.after));library.blocked=entries.length-accepted.length;
 const yp=accepted.filter(c=>yellow(c).length).length/accepted.length;
 if(!accepted.length||library.accepted.redMetrics||library.accepted.average<88||yp>.05+1e-12)throw new Error(`Admitted catalog fails quality policy: ${library.id}`);
}
manifest.qualityGate={version:'motion-fix-v12',sourceInventory:741,maximumRedMetrics:0,minimumLibraryAverage:88,maximumYellowClipPercent:5,denominator:'Admitted runtime subset only; full-source report retains every blocked candidate separately.',selection:'After blocking red/unknown candidates, keep all green and the mildest residual yellow candidates within 5%; never edit scores or metrics.'};
const blocked=manifest.clips.filter(c=>c.status==='blocked');
await writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest)+'\n');
await writeFile(path.join(base,'blocklist.json'),JSON.stringify({version:'motion-fix-v12',policy:'No clips deleted. Excluded assets remain review-only; the full-source denominator and candidate measurements remain in REPORT/report.html.',qualityGate:manifest.qualityGate,clips:blocked.map(c=>({key:c.key,library:c.library,id:c.id,blockingClass:c.blockingClass,reason:c.reason,before:c.before.score,after:c.after.score,metrics:c.after.metrics,animation:c.after.animation,timeScale:c.after.metadata?.timeScale??1}))},null,2)+'\n');
console.log(JSON.stringify({sourceCount:manifest.clips.length,blocked:blocked.length,admitted:manifest.clips.length-blocked.length,libraries:manifest.libraries.map(l=>({id:l.id,count:l.accepted.count,average:l.accepted.average,red:l.accepted.redMetrics,yellow:l.accepted.yellowClips}))}));
