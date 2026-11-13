// SPDX-License-Identifier: CC0-1.0
// Derived from the locked upstream inventory; distinguishes copied and new code.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashes,commit,repository,sourcePath} from '../hockey-v1/source/qa-adapter-fetch.mjs';
const base=dirname(fileURLToPath(import.meta.url));
async function walk(dir){const all=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.cache')continue;const p=join(dir,e.name);if(e.isDirectory())all.push(...await walk(p));else all.push(p);}return all;}
export async function writeLicenses(){
 const upstream=[];
 for(const [name,sha256]of Object.entries(hashes)){
  const currentSha256=createHash('sha256').update(await readFile(join(base,name))).digest('hex');
  upstream.push({name,sourceUrl:`https://github.com/${repository}/blob/${commit}/${sourcePath}/${name}`,sourceSha256:sha256,currentSha256,unchanged:sha256===currentSha256});
 }
 const originalMetricsHash=createHash('sha256').update(await readFile(join(base,'legacy-metrics.mjs'))).digest('hex');
 if(originalMetricsHash!==hashes['metrics.mjs'])throw Error('Frozen original metric source changed.');
 const rows=(await walk(base)).map(p=>relative(base,p)).concat('LICENSES.md','provenance.json').filter((p,i,a)=>a.indexOf(p)===i).sort().map(name=>{
  const source=upstream.find(x=>x.name===name);
  const attribution=name==='legacy-metrics.mjs'?`עותק זהה ל־[metrics.mjs המקורי](${upstream.find(x=>x.name==='metrics.mjs').sourceUrl})`:
   source?`${source.unchanged?'עותק זהה':'נגזר עם הרחבות'} מ־[${name} @ ${commit.slice(0,12)}](${source.sourceUrl})`:'קוד, תיעוד או תוצר חישובי חדשים למשימת hockey-fix-v2';
  return `| ${name} | CC0-1.0 | ${attribution} |`;
 });
 await writeFile(join(base,'provenance.json'),JSON.stringify({schemaVersion:1,license:'CC0-1.0',upstream:{repository,commit,path:sourcePath,files:upstream},frozenOriginalMetrics:{path:'legacy-metrics.mjs',sha256:originalMetricsHash},extension:'Explicit blade contact and independent skating reference velocity; planted-foot formulas, thresholds and weights remain unchanged.',newFiles:['hockey-source.mjs','skating.mjs','skating.test.mjs','report-browser-test.mjs','report-ui.mjs','style.css','README.md']},null,2)+'\n');
 await writeFile(join(base,'LICENSES.md'),`# רישיונות ומקור\n\nכל הקבצים כאן ברישיון [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). שמונה קובצי הכלי הובאו מקומיט נעול של PR #371; חלקם הורחבו כמפורט בטבלה וב־[provenance.json](provenance.json). העותק legacy-metrics.mjs זהה בחתימת SHA-256 למקור, ומשמש להשוואת רגרסיה. הקוד החדש והמדידות החדשות משוחררים אף הם לפי CC0-1.0.\n\nהכלי אינו כולל נכסי מדיה חיצוניים. נתוני התנועה נקראים מספריות המקור, שהרישיון והחתימות שלהן נרשמים בדוחות JSON.\n\n| קובץ | רישיון | מקור |\n|---|---|---|\n${rows.join('\n')}\n`);
 return rows.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Licensed ${await writeLicenses()} files`);
