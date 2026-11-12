// SPDX-License-Identifier: CC0-1.0
// מקור: תהליך מדידה מקורי; run.mjs והמדדים נעולים למקור, ללא שינוי ספים.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fetchTool,hashes,commit} from '../../hockey-v1/source/qa-adapter-fetch.mjs';
const folder=fileURLToPath(new URL('../',import.meta.url));
const source=fileURLToPath(new URL('./',import.meta.url));
const original=path.resolve(folder,'../hockey-v1/clips.json');
const tool=await fetchTool(process.env.HOCKEY_QA_TOOL_DIR||'/tmp/hockey-qa');
function omitHtml(directory){for(const e of readdirSync(directory,{withFileTypes:true})){const p=path.join(directory,e.name);if(e.isDirectory())omitHtml(p);else if(e.name.endsWith('.html'))unlinkSync(p);}}
const locations=[['before',original],...Array.from({length:3},(_,i)=>[`attempt-${i+1}`,path.join(folder,`evidence/attempt-${i+1}/clips.json`)]),['after',path.join(folder,'clips.json')]];
for(const [name,input]of locations){
 const out=path.join(folder,'evidence',name);mkdirSync(out,{recursive:true});
 const env={...process.env,HOCKEY_FIX_CLIPS:input,HOCKEY_QA_TOOL_DIR:tool};
 const stdout=execFileSync(process.execPath,['--loader',path.join(source,'qa-loader.mjs'),path.join(tool,'run.mjs'),'--library','hockey-v1','--out',path.join(out,'codex-qa')],{env,encoding:'utf8',maxBuffer:8e6});
 writeFileSync(path.join(out,'cli.log'),stdout);
 omitHtml(path.join(out,'codex-qa'));
 execFileSync(process.execPath,[path.join(source,'qa-adapter.mjs'),out],{env,encoding:'utf8',maxBuffer:8e6});
 const cli=JSON.parse(readFileSync(path.join(out,'codex-qa/report.json'))),direct=JSON.parse(readFileSync(path.join(out,'motion-measurements.json')));
 const mismatches=cli.libraries[0].clips.filter(c=>JSON.stringify(c.metrics)!==JSON.stringify(direct.clips.find(x=>x.id===c.id).rawCodex.metrics));
 if(mismatches.length)throw Error('אי התאמת CLI/API: '+mismatches.map(c=>c.id));
 console.log(JSON.stringify({stage:name,summary:cli.libraries[0].summary,athleteFailures:direct.summary.athleteFailures}));
}
const fresh=JSON.parse(readFileSync(path.join(folder,'evidence/before/codex-qa/report.json'))).libraries[0].clips;
const old=JSON.parse(readFileSync(path.resolve(folder,'../hockey-v1/evidence/codex-qa/report.json'))).libraries[0].clips;
const baselineMismatches=fresh.filter(c=>JSON.stringify(c.metrics)!==JSON.stringify(old.find(x=>x.id===c.id).metrics)).map(c=>c.id);
const verified=Object.entries(hashes).map(([name,expected])=>({name,expected,actual:createHash('sha256').update(readFileSync(path.join(tool,name))).digest('hex')}));
if(baselineMismatches.length||verified.some(v=>v.expected!==v.actual))throw Error('אי התאמת מקור הכלי או קו הבסיס');
writeFileSync(path.join(folder,'qa-tool-provenance.json'),JSON.stringify({license:'CC0-1.0',source:'נגזר ממתאם PR 414; רק נתיב קובץ הקלט ופרטי מקור הוחלפו. בחירת idle/mirror, דגימות, מטא-דאטה ונוסחאות זהות.',toolCommit:commit,files:verified,baselineExactMetricMatch:true,baselineMismatches,cliApiExactMetricMatch:true,retained:'כל JSON ו-SVG המקוריים; HTML הושמט כי נתיבי התצוגה שלו שייכים לכלי הזמני. preview.html בתיקיית התיקון מציג GLB לפני ואחרי.'},null,2)+'\n');
