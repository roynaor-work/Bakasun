// SPDX-License-Identifier: CC0-1.0
// מקור: מתאם הרצה ושמירת ראיות מקורי לחבילת ההוקי.
// מריץ את run.mjs המקורי ללא שינוי, באמצעות קורא הספרייה המותאם בלבד.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdir, unlink, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchTool} from './qa-adapter-fetch.mjs';
import {runEvidence} from './qa-adapter.mjs';

const source=path.dirname(fileURLToPath(import.meta.url));
const evidence=path.resolve(source,'../evidence');
const out=path.join(evidence,'codex-qa');
const tool=await fetchTool(process.env.HOCKEY_QA_TOOL_DIR || '/tmp/hockey-qa');
const output=execFileSync(process.execPath,[
  '--loader',path.join(source,'qa-adapter-loader.mjs'),path.join(tool,'run.mjs'),
  '--library','hockey-v1','--out',out,
],{encoding:'utf8',env:{...process.env,HOCKEY_QA_TOOL_DIR:tool},maxBuffer:4e6});

// פלט HTML המקורי דורש דף תצוגה ותלויות מנתיב הכלי המקורי.
// נשמרים כאן JSON ו-SVG בלבד; preview.html של חבילת ההוקי מציג את הנכסים המלאים.
async function omitHtml(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())await omitHtml(target);
    else if(entry.name.endsWith('.html'))await unlink(target);
  }
}
await omitHtml(out);
const direct=await runEvidence(evidence);
const cli=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
const cliClips=cli.libraries.flatMap(l=>l.clips);
const mismatches=cliClips.filter(c=>c.score!==direct.clips.find(d=>d.id===c.id)?.rawCodex.score).map(c=>c.id);
if(mismatches.length)throw Error(`אי התאמה בין הכלי המקורי והמדידה הישירה: ${mismatches.join(', ')}`);
// תרגום תוויות התצוגה בלבד. הגאומטריה, זמני הדגימה, נוסחאות המדידה וה-JSON המקורי אינם משתנים.
const svgHashes=[];
const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const clip of cliClips) {
  const target=path.join(out,clip.sheetPath),raw=await readFile(target,'utf8');
  const label=escapeXml(clip.label || clip.id),id=escapeXml(clip.id);
  const localized=raw
    .replace(`${id} · eight diagnostic frames`,`${label} · שמונה פריימים למדידה`)
    .replace('Eight evenly spaced sampled poses. Original skeleton diagram, not a character mesh. Cyan is left, purple is right, orange is ball, red is below floor. Root motion is recentered; numeric world position is retained.','שמונה פוזות מדודות במרווחים שווים. תרשים שלד מקורי. שמאל בטורקיז, ימין בסגול, כדור בכתום וחדירה לרצפה באדום. השורש ממורכז בתמונה ומיקומו בעולם מצוין בכל פריים.')
    .replace(`${id} · 8 diagnostic skeleton frames`,`${label} · שמונה פריימים של השלד`)
    .replace('Left: cyan · Right: purple · Ball: orange · Below floor: red · root recentered, common scale','שמאל בטורקיז · ימין בסגול · כדור בכתום · חדירה לרצפה באדום · שורש ממורכז וקנה מידה אחיד')
    .replace('Skeleton positions from measured animation. No mesh silhouette, collision hull or subjective visual-quality claim.','מיקומי השלד מתוך דגימות התנועה. למדידת מראה הגוף המלא השתמשו בתצוגת הדגם של חבילת ההוקי.')
    .replaceAll('root x=','שורש x=')
    .replaceAll(' m</text>',' מ׳</text>')
    .replaceAll(' s</text>',' ש׳</text>');
  await writeFile(target,localized);
  svgHashes.push({path:clip.sheetPath,originalSha256:hash(raw),localizedSha256:hash(localized)});
}
await writeFile(path.join(out,'svg-localization.json'),JSON.stringify({
  schemaVersion:1,license:'CC0-1.0',sourceHe:'תוצרי SVG של כלי QA המקורי, בתרגום תוויות תצוגה לעברית בלבד. נקודות, קווים וזמנים נשארו זהים.',
  files:svgHashes,
},null,2)+'\n');
await writeFile(path.join(evidence,'codex-qa-run.json'),JSON.stringify({
  schemaVersion:1,license:'CC0-1.0',sourceHe:'תוצאת הרצת כלי QA המקורי באמצעות מתאם קורא ספרייה בלבד',
  originalStdout:output.trim(),originalCliSummary:cli.libraries[0].summary,
  directApiScoresMatchOriginalCli:true,
  localizedSvgLabelsOnly:true,
  omittedHtmlHe:'תוצרי HTML של הכלי המקורי הושמטו משום שהם דורשים את נתיבי התצוגה המקוריים. נשמרו כל מדידות JSON וגיליונות SVG. התצוגה המלאה נמצאת ב-preview.html של חבילת ההוקי.',
},null,2)+'\n');
const clipBytes=await readFile(path.resolve(source,'../clips.json'));
const clipHash=hash(clipBytes),errors=[];
if(direct.clipSource.sha256!==clipHash||cli.libraries[0].sources[0].sha256!==clipHash)errors.push('קובץ הקליפים השתנה במהלך המדידה');
for(const clip of cliClips) {
  const svg=await readFile(path.join(out,clip.sheetPath),'utf8');
  const frames=JSON.parse(await readFile(path.join(out,clip.jsonPath),'utf8')).frames;
  if((svg.match(/<g transform="translate\(/g)||[]).length!==8||frames.length!==8)errors.push(`מספר פריימים לא תקין: ${clip.id}`);
  if(hash(svg)!==svgHashes.find(s=>s.path===clip.sheetPath)?.localizedSha256)errors.push(`חתימת גיליון לא תקינה: ${clip.id}`);
}
await writeFile(path.join(evidence,'final-qa-verification.json'),JSON.stringify({
  schemaVersion:1,license:'CC0-1.0',sourceHe:'אימות סופי של ראיות QA מול קובץ הקליפים הקפוא',
  clipsSha256:clipHash,clips:cliClips.length,originalCliAndApiScoresMatch:true,localizedSheets:svgHashes.length,
  framesPerSheet:8,sourceHashesMatch:errors.length===0,athleteFailureCount:direct.summary.athleteFailures.length,
  codexBelow88Count:direct.summary.rawCodexFailures.length,codexAverage:cli.libraries[0].summary.average,
  codexMin:cli.libraries[0].summary.min,minCoverage:Math.min(...cliClips.map(c=>c.coverage)),
  actions:cliClips.filter(c=>['shot_wrist','shot_slap','pass'].includes(c.id)).map(c=>({id:c.id,score:c.score})),errors,
},null,2)+'\n');
if(errors.length)throw Error(errors.join('; '));
console.log(JSON.stringify({clips:cliClips.length,summary:cli.libraries[0].summary,rawReport:path.join(out,'report.json')}));
