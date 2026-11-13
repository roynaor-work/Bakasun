// Original CC0 Node CLI: no npm install, browser, or WebAssembly required.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {loadLibraries,SOURCES} from './sources.mjs';
import {analyzeClip,METRICS} from './metrics.mjs';
import {renderReport,renderClip} from './report.mjs';
import {sheetSvg} from './sheets.mjs';
import {writeLicenses} from './licenses.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const relativeUrl=(from,to)=>path.relative(from,to).split(path.sep).join('/')||'.';
export const slug=value=>String(value).replace(/[^a-zA-Z0-9_.-]+/g,'_');
export function compareLibraries(libraries,fromVersion=9,toVersion=10) {
 const comparisons=[], version=v=>Number(String(v).replace(/^v/,''));
 const brief=c=>c?{id:c.id,score:c.score,reasons:c.reasons,coverage:c.coverage,htmlPath:c.htmlPath}:null;
 for(const sport of new Set(libraries.map(l=>l.sport))) {
  const from=libraries.find(l=>l.sport===sport&&version(l.version)===Number(fromVersion));
  const to=libraries.find(l=>l.sport===sport&&version(l.version)===Number(toVersion));
  if(!from||!to)continue;
  const old=new Map(from.clips.map(c=>[c.motionId??c.id,c]));
  const profiles=[...new Set(to.clips.map(c=>c.profile??''))];
  for(const profile of profiles){
   const target=new Map(to.clips.filter(c=>(c.profile??'')===profile).map(c=>[c.motionId??c.id,c]));
   for(const motionId of new Set([...old.keys(),...target.keys()])) {
    const prior=old.get(motionId),clip=target.get(motionId);
    comparisons.push({sport,id:profile?`${profile}/${motionId}`:motionId,motionId,profile,fromLibrary:from.id,toLibrary:to.id,from:from.id,to:to.id,before:brief(prior),after:brief(clip),delta:prior&&clip?Math.round((clip.score-prior.score)*100)/100:null,metrics:Object.fromEntries(Object.keys(METRICS).map(k=>[k,{from:prior?.metrics[k]?.value??null,to:clip?.metrics[k]?.value??null,delta:Number.isFinite(prior?.metrics[k]?.value)&&Number.isFinite(clip?.metrics[k]?.value)?clip.metrics[k].value-prior.metrics[k].value:null}]))});
   }
  }
 }
 return comparisons;
}
export function reasonMessage(reason,metrics) {
 if(typeof reason==='string')return reason;
 const m=metrics[reason.metric],e=m?.evidence??{},n=x=>Number.isFinite(x)?Number(x.toFixed(4)):'?';
 if(m?.status==='insufficient-data')return `${reason.label}: חסרים נתוני מדידה (${m.reason})`;
 let detail='';
 if(reason.metric==='footSliding')detail=e.model==='blade-contact-v2'?`להב: שגיאת מישור ${n(e.maxPlaneNormalErrorMeters)} מ׳, גובה ${n(e.maxAbsHeightMeters)} מ׳, סטייה רוחבית ${n(e.maxLateralResidualMeters)} מ׳`:`תזוזת סוליה ${n(e.maxDriftMeters)} מ׳, ${e.worst?.bone??''}, בזמן ${n(e.worst?.t)} ש׳`;
 if(reason.metric==='floorPenetration')detail=`חדירה ${n(e.maxDepthMeters)} מ׳, ${e.worst?.bone??''}, בזמן ${n(e.worst?.t)} ש׳`;
 if(reason.metric==='posePops')detail=`${e.worst?.bone??''} בזמן ${n(e.worst?.t)} ש׳; קפיצת סיבוב שקולה ${n(e.maxDegrees60Hz)} מעלות ב־60Hz`;
 if(reason.metric==='anatomy'){const v=e.violations?.[0];detail=`${e.affectedFrames}/${e.testedFrames} דגימות חורגות; ${v?.joint??''} ${v?.kind??''} בזמן ${n(v?.t)} ש׳`;}
 if(reason.metric==='ballContact'){const c=e.contacts?.[0];detail=`פער פני כדור ${n(c?.gapMeters)} מ׳, ${c?.bone??''}, בזמן ${n(c?.t)} ש׳`;}
 if(reason.metric==='continuity')detail=`פער ב־${e.worstEndpoint==='entry'?'כניסה':'יציאה'} מול המתנה; יחס חריגה ${n(m.value)}`;
 if(reason.metric==='bodySliding')detail=e.model==='skating-reference-velocity-v2'?`שורש ${n(e.rootSpeedMetersPerSecond)} מ׳/ש׳ מול מסלול צפוי ${n(e.referenceRootSpeedMetersPerSecond)} מ׳/ש׳; שגיאת וקטור מרבית ${n(e.maxVectorVelocityRelativeError)}`:`שורש ${n(e.rootSpeedMetersPerSecond)} מ׳/ש׳ מול צעד ${n(e.backwardSweepSpeedMetersPerSecond)} מ׳/ש׳; קצב ${n(e.cadenceStepsPerSecond)} צעדים/ש׳`;
 if(reason.metric==='symmetry')detail=`${e.mode??''}: הפרש עצמות ${n(e.structuralMismatch)}, פער תנועה מנורמל ${n(e.motionRmsHeight)}`;
 return `${reason.label}: ${detail||`${n(m?.value)} ${reason.unit??''}`} (${m?.status==='red'?'אדום':'צהוב'})`;
}
const round=x=>Math.round(x*100)/100;
export async function generate({out=path.join(base,'output'),only,fps=60,compare=[9,10],writeMarkdown=true,legacy=false}={}) {
 const started=performance.now();
 if(only?.length)for(const id of only)if(!SOURCES.some(s=>s.id===id))throw new Error(`Unknown library: ${id}`);
 const libraries=await loadLibraries({repoRoot:path.resolve(base,'../../../..'),cacheRoot:path.join(base,'.cache'),fps,only,legacy});
 for(const library of libraries){
  const usedNames=new Set();
  const idles=library.clips.filter(c=>/idle|ready|stance/.test(c.id));
  for(const clip of library.clips){
   const role=clip.role??clip.metadata?.role;
   const compatible=c=>(c.role??c.metadata?.role)===role&&(c.profile??c.metadata?.profile??'')===(clip.profile??clip.metadata?.profile??'')&&(c.metadata?.sourceLibrary??'')===(clip.metadata?.sourceLibrary??'');
   const idle=idles.find(c=>compatible(c)&&c!==clip)??idles.find(compatible);
   const mirrorId=clip.id.includes('_left')?clip.id.replace('_left','_right'):clip.id.includes('_right')?clip.id.replace('_right','_left'):null;
   const mirror=mirrorId?library.clips.find(c=>c.id===mirrorId):null;
   if(mirror)clip.metadata.mirrorFrames=mirror.frames;
   Object.assign(clip,analyzeClip({frames:clip.frames,duration:clip.duration,height:clip.height,metadata:clip.metadata,idleFrames:idle?.frames,clipId:clip.id,sport:library.sport}));
   clip.reasons=clip.reasons.map(r=>({...r,message:reasonMessage(r,clip.metrics)}));
   clip.idleReference=idle?.id??null;
   const {ball,travel,referenceRootMotion,mirrorFrames,...meta}=clip.metadata;
   clip.metadata={...meta,ball:{radius:ball?.radius??clip.metadata.ballRadius},referencePathAvailable:!!(travel?.length||referenceRootMotion?.samples?.length),symmetryReference:mirror?.id??null,heightKind:clip.profile?'declared profile stature':'skeleton stature proxy (head-to-ankle plus 0.30m)',diagnosticGeometry:'declared skeletal sole/contact points; mesh not decoded'};
   clip.library=library.id;
   const name=`${slug(library.id)}--${slug(clip.id)}`;
   if(usedNames.has(name))throw new Error(`Output filename collision: ${name}`);usedNames.add(name);
   clip.htmlPath=`clips/${name}.html`;clip.jsonPath=`clips/${name}.json`;clip.sheetPath=`sheets/${name}.svg`;clip.assetPrefix=relativeUrl(path.join(out,'clips'),base)+'/';clip.sheetHref=`../${clip.sheetPath}`;clip.jsonHref=path.basename(clip.jsonPath);
   if(library.sport==='hockey')clip.previewHref=relativeUrl(path.join(out,'clips'),path.resolve(base,'../hockey-v2/preview.html'));
  }
  library.summary={count:library.clips.length,average:round(library.clips.reduce((a,c)=>a+c.score,0)/library.clips.length),min:Math.min(...library.clips.map(c=>c.score)),max:Math.max(...library.clips.map(c=>c.score)),redMetrics:library.clips.reduce((a,c)=>a+Object.values(c.metrics).filter(m=>m.status==='red').length,0),unknownMetrics:library.clips.reduce((a,c)=>a+Object.values(c.metrics).filter(m=>!Number.isFinite(m.value)).length,0)};
 }
 await Promise.all(['clips','sheets'].map(p=>mkdir(path.join(out,p),{recursive:true})));
 for(const library of libraries)for(const clip of library.clips){
  // Measurements use every frame; the committed diagnostic viewer has eight poses.
  const frames=Array.from({length:8},(_,i)=>clip.frames.reduce((a,f)=>Math.abs(f.t-clip.duration*i/7)<Math.abs(a.t-clip.duration*i/7)?f:a)).map(f=>({t:f.t,joints:Object.fromEntries(Object.entries(f.joints).map(([n,p])=>[n,p.map(x=>Math.round(x*1e6)/1e6)])),root:f.root,ball:f.ball}));
  await writeFile(path.join(out,clip.jsonPath),JSON.stringify({...clip,frames}));
  await writeFile(path.join(out,clip.sheetPath),sheetSvg(clip,clip.frames));
  await writeFile(path.join(out,clip.htmlPath),renderClip(clip,library));
 }
 const definitions=Object.fromEntries(Object.entries(METRICS).map(([id,m])=>[id,{...m,description:m.description+(id==='footSliding'?' Opt-in blade-contact-v2: maximum blade endpoint height error, blade-length-scaled sole-normal error, integrated unrequested lateral residual, or pivot drift; longitudinal glide is legal.':id==='bodySliding'?' Opt-in skating-reference-velocity-v2: maximum actual/independent-reference vector velocity mismatch; the foot-sweep assumption is not used.':'')}]));
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),fps,measurementMode:legacy?'upstream planted-foot model':'per-clip explicit contact model',metricDefinitions:definitions,limitations:['Skeleton and declared sole/blade/contact points are audited; compressed mesh geometry and texture pixels are not decoded.','Reference-root paths describe the author scenario. Actual simulation speed/IK/blending are not executed.','Feeling score is a reproducible weighted diagnostic heuristic, not a perceptual or medical validation.','Missing applicable metadata is unavailable and earns zero points; not-applicable metrics are excluded. Coverage is shown.','All upstream metric weights and green/yellow thresholds are unchanged. Blade contact changes physical semantics only for clips explicitly declaring contactModel=blade.','Blade continuity removes the authored root heading from body markers, while retaining root height, limb pose, rotation and velocity errors.'],libraries:libraries.map(l=>({...l,clips:l.clips.map(({frames,...c})=>c)})),comparisons:compareLibraries(libraries,...compare),elapsedSeconds:round((performance.now()-started)/1000),assetPrefix:relativeUrl(out,base)+'/',...(libraries.some(l=>l.sport==='hockey')?{previewHref:relativeUrl(out,path.resolve(base,'../hockey-v2/preview.html'))}:{})};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 await writeFile(path.join(out,'report.html'),renderReport(report));
 if(writeMarkdown)await writeFile(path.join(out,'REPORT.md'),markdownReport(report,{toolHref:path.relative(out,base).split(path.sep).join('/')}));
 await writeLicenses(report);
 return report;
}
export function markdownReport(report,{toolHref='..'}={}){
 const all=report.libraries.flatMap(l=>l.clips.map(c=>({...c,library:l.id}))).sort((a,b)=>a.score-b.score||a.library.localeCompare(b.library)||a.id.localeCompare(b.id));
 const rows=report.libraries.map(l=>`| ${l.id} | ${l.summary.count} | ${l.summary.average} | ${l.summary.min} | ${l.summary.redMetrics} |`).join('\n');
 const worst=all.slice(0,20).map(c=>`| ${c.library} / ${c.id} | ${c.score} | ${c.reasons.map(r=>typeof r==='string'?r:r.message??r.label).join('; ').replaceAll('|','/')} |`).join('\n');
 return `# דוח מדידת תנועה\n\nנוצר: ${report.generatedAt}. מצב המדידה: **${report.measurementMode}**. ${all.length} קליפים, ${report.fps}Hz וגם זמני מפתח ומגע מדויקים.\n\n[דוח אינטראקטיבי](report.html) · [הגדרות המודלים והפעלה](${toolHref}/README.md) · [רישיונות ומקור](${toolHref}/LICENSES.md).\n\n| ספרייה | קליפים | ממוצע | מינימום | מדדים אדומים |\n|---|---:|---:|---:|---:|\n${rows}\n\n| ספרייה / קליפ | ציון | ממצאים |\n|---|---:|---|\n${worst}\n\nהציון הוא מדד אבחוני משוקלל. מודל להב מופעל רק בקליפים שמצהירים עליו. מודל הרגל הנטועה המקורי נשמר עבור שאר הקליפים, ועבור הרצת \`--legacy\`. הספים והמשקלות לא השתנו.\n\n${report.limitations.map(s=>'- '+s).join('\n')}\n\nמקור הכלי: קומיט \`5eb4f093bc22523ee417a7f2345c3b813bffba24\`. חתימות המקור והשינויים נמצאים ב־[provenance.json](${toolHref}/provenance.json). בדיקות כשלים מכוונים ושוויון לנוסחאות המקור: [skating.test.mjs](${toolHref}/skating.test.mjs). אימות חזותי ובדיקות של כל רשת הגוף מופיעים ב־[דוח המסירה](${toolHref}/../hockey-v2/REPORT-fix.md).\n`;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);let out=path.join(base,'output'),only,fps=60,compare=[9,10],legacy=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--out')out=path.resolve(args[++i]);
  else if(args[i]==='--library')only=(args[++i]??'').split(',');
  else if(args[i]==='--fps')fps=Number(args[++i]);
  else if(args[i]==='--compare')compare=(args[++i]??'').split(',').map(Number);
  else if(args[i]==='--legacy')legacy=true;
  else if(args[i]==='--help'){console.log('node run.mjs [--out DIRECTORY] [--library id,id] [--fps 60] [--compare 9,10] [--legacy]');process.exit(0);}
  else throw new Error(`Unknown argument: ${args[i]}`);
 }
 if(!Number.isFinite(fps)||fps<1||fps>240||compare.length!==2||!compare.every(Number.isFinite))throw new Error('Invalid fps or comparison versions');
 generate({out,only,fps,compare,legacy}).then(r=>console.log(JSON.stringify({libraries:r.libraries.length,clips:r.libraries.reduce((s,l)=>s+l.clips.length,0),elapsedSeconds:r.elapsedSeconds,report:path.join(out,'report.html')}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
