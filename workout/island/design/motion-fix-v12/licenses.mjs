/** Original CC0-1.0 file-level provenance ledger generator. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {filesUnder} from './verify.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const qaCommit='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const github=(commit,file)=>`https://github.com/roynaor-work/Bakasun/blob/${commit}/${file}`;
const escape=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const qaSources={
 'qa/metrics.mjs':{original:'metrics.mjs',operation:'העתק זהה ברמת הבתים של נוסחאות המדידה, המשקולות והספים המקוריים'},
 'qa/glb.mjs':{original:'glb.mjs',operation:'העתק של קורא ה־GLB המקורי; שונה רק נתיב הייבוא אל three.js הקיים'},
 'qa/sources.mjs':{original:'sources.mjs',operation:'נגזרת של מתאם המקורות המקורי, עם התאמות לקריאת ספריות v11 ולנתוני המקור הנוספים'},
 'qa/sources.json':{original:'sources.json',operation:'נגזרת של מניפסט המקורות המקורי, עם מקורות נעולים לספריות v11 ולטניס'},
};
export async function writeLicenses({root=here}={}){
 const files=await filesUnder(root);if(!files.includes('LICENSES.md'))files.push('LICENSES.md');
 let provenance={};try{provenance=JSON.parse(await readFile(path.join(root,'data/provenance.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 provenance=provenance.files??provenance;
 try{const modelData=JSON.parse(await readFile(path.join(root,'data/models-provenance.json'),'utf8'));for(const model of modelData.models??[])provenance[model.path]??={...model.source,operation:'דמות המקור; הסרת אנימציות ופענוח דחיסה מקומי תוך שמירת השלד, הרשת וחיבורי העור'};}catch(e){if(e.code!=='ENOENT')throw e;}
 let manifest={};try{manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const sourceMap=new Map();
 const collect=(v)=>{if(!v||typeof v!=='object')return;for(const key of ['asset','model','animation','frames'])if(typeof v[key]==='string'&&v.source)sourceMap.set(v[key],v.source);for(const x of Object.values(v))if(x&&typeof x==='object')collect(x);};collect(manifest);
 const rows=[],unknown=[];
 for(const file of files.sort()){
  let source,license='CC0-1.0',sha='—';
  if(file!=='LICENSES.md')sha=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  const record=provenance[file]??sourceMap.get(file);
  if(record){
   const records=Array.isArray(record)?record:[record];license=records[0]?.license??'CC0-1.0';
   if(records.some(r=>(r.license??'CC0-1.0')!=='CC0-1.0'))throw new Error(`New file ${file} includes a non-CC0 input`);
   source=records.map(r=>r.commit&&r.path?`[${escape(r.path)} @ ${r.commit.slice(0,12)}](${github(r.commit,r.path)})${r.operation?'; '+escape(r.operation):''}`:escape(r.source??r.description??r.operation??JSON.stringify(r))).join('; ');
  }else if(qaSources[file]){
   const q=qaSources[file];source=`[כלי QA המקורי @ ${qaCommit.slice(0,12)}](${github(qaCommit,'workout/island/design/motion-qa-v1/'+q.original)}); ${q.operation}`;
  }else if(file==='qa/tennis.mjs'){
   source='מתאם קריאה מקורי למשימה זו, CC0; קורא את ספריית הטניס הנעולה ב־[qa/sources.json](qa/sources.json) ושומר את מסלול הכדור העצמאי ואת טרנספורמציות הציוד המקוריות';
  }else if(file==='qa/provenance.json'){
   source='מניפסט מקור מקורי למשימה זו; רושם קומיטים וחותמות SHA-256 של ארבעת קובצי הקלט המקוריים של motion-qa-v1';
  }else if(file==='runtime/catalog.json'){
   source='קטלוג ריצה מקורי שנוצר ב־[write-docs.mjs](write-docs.mjs) מתוך [manifest.json](manifest.json); מפנה לקובצי התנועה ולמדידות של משימה זו';
  }else if(file.startsWith('runtime/')){
   unknown.push(file);source='חסר רישום מקור מפורש';
  }else if(file.startsWith('data/')||file.startsWith('verification/'))source='מדידה או תוצר אימות מקורי של משימה זו; מקורות הקלט הנעולים רשומים ב־qa/sources.json ובדוח';
  else source='יצירה מקורית למשימת תיקון התנועה v12';
  if(license!=='CC0-1.0')throw new Error(`New file ${file} must be original/CC0, found ${license}`);
  rows.push(`| [${escape(file)}](${encodeURI(file)}) | ${license} | ${source} | ${sha} |`);
 }
 const content=`# רישיונות ומקור לכל קובץ\n\nכל הקבצים החדשים המקוריים בחבילה זו משוחררים לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחברים מוותרים על זכויות היוצרים והזכויות הנלוות. נכסי התנועה והדמויות הנגזרים שומרים על מקורם הנעול ועל רישיון CC0 של ספריית המקור. לא נעשה שימוש במותגים, בדמויות של אנשים אמיתיים או בנכסי מדיה חיצוניים.\n\nשלוש תלותי התצוגה הקיימות, [three.module.js](../../vendor/three.module.js), [GLTFLoader.js](../../vendor/GLTFLoader.js), [SkeletonUtils.js](../../vendor/SkeletonUtils.js), זמינות במאגר ברישיון [MIT הקיים](../../vendor/LICENSE.three), ממקור [three.js](https://github.com/mrdoob/three.js). הן מופנות בנתיב יחסי בלבד ולא הועתקו או שונו. כלי המדידה משתמש גם ב־three.js הקיים של ספריית כדורגל v8. שום קובץ חדש בחבילה אינו ברישיון MIT. Playwright ו־Chromium שימשו מחוץ למאגר לאימות בלבד.\n\nמקורות ה־QA: [motion-qa-v1 @ ${qaCommit.slice(0,12)}](${github(qaCommit,'workout/island/design/motion-qa-v1/LICENSES.md')}), ברישיון CC0-1.0. מודול המדדים הועתק ללא שינוי ברמת הבתים; מתאמי קריאת המקורות הורחבו בלי לשנות את נוסחאות המדידה והספים. מקור ומידת ההתאמה מפורטים לכל קובץ בטבלה.\n\nלשחזור הרישום: \`node workout/island/design/motion-fix-v12/licenses.mjs\`. חותמת SHA-256 של קובץ הרישיון עצמו אינה נרשמת כדי להימנע מהפניה עצמית.\n\n| קובץ | רישיון | מקור | SHA-256 |\n|---|---|---|---|\n${rows.join('\n')}\n`;
 await writeFile(path.join(root,'LICENSES.md'),content);
 if(unknown.length)throw new Error(`Missing explicit runtime provenance: ${unknown.join(', ')}`);
 return {files:files.length,runtimeFiles:files.filter(p=>p.startsWith('runtime/')).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await writeLicenses()));
