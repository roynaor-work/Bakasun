// SPDX-License-Identifier: CC0-1.0
// מקור: יצירה מקורית עבור חבילת ההוקי.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../',import.meta.url);
async function list(url,prefix='') {
  const out=[];
  for(const entry of await readdir(url,{withFileTypes:true})) {
    const relative=prefix+entry.name;
    if(entry.isDirectory())out.push(...await list(new URL(entry.name+'/',url),relative+'/'));
    else if(entry.isFile()&&relative!=='manifest.json')out.push(relative);
  }
  return out;
}
function origin(p) {
  if(p.startsWith('models/'))return {source:'source/build-models.py',upstream:'workout/island/assets/hoops-tall/guard.glb',licenseEvidence:'LICENSES.md'};
  if(p==='clips.json'||p==='motion-measure.json')return {source:'source/build-clips.mjs'};
  if(p==='model-evidence.json')return {source:'source/build-models.py'};
  if(p.startsWith('sheets/')||p.startsWith('preview/'))return {source:'source/render-sheets.mjs',inputs:['clips.json','models/skater.glb','models/goalie.glb','models/stick.glb','preview.html']};
  if(p.startsWith('evidence/codex-qa/'))return {source:'source/qa-adapter-loader.mjs',upstream:'roynaor-work/Bakasun@5eb4f093bc22523ee417a7f2345c3b813bffba24',inputs:['clips.json'],licenseEvidence:'qa-tool-provenance.json'};
  if(p==='evidence/motion-measurements.json')return {source:'source/qa-adapter.mjs',inputs:['clips.json']};
  if(p==='evidence/validation.json')return {source:'source/validate.mjs'};
  if(p==='evidence/mesh-contact.json')return {source:'source/mesh-contact-audit.mjs',inputs:['clips.json','models/skater.glb','models/goalie.glb','models/stick.glb']};
  if(p==='evidence/gltf-validation.json')return {source:'source/validate-gltf.mjs'};
  if(p.startsWith('evidence/canonical-baseline'))return {source:'workout/island/tools/athletes/measure.mjs',purposeHe:'מדידת קו בסיס של הספריות הקיימות, ללא קליפי הוקי'};
  if(p.startsWith('evidence/'))return {source:'הרצות ואימות מקוריים המתועדים ב־REPORT.md'};
  if(p==='REPORT.md')return {source:'source/build-report.mjs',licenseEvidence:'LICENSES.md'};
  return {source:'יצירה מקורית לחבילת ההוקי, 12/11/2026',licenseEvidence:'LICENSES.md'};
}
const files=[];
for(const p of (await list(folder)).sort()) {
  const data=await readFile(new URL(p,folder));
  files.push({path:p,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),license:'CC0-1.0',...origin(p)});
}
let measurement;try{measurement=JSON.parse(await readFile(new URL('evidence/motion-measurements.json',folder),'utf8'))}catch{}
const evidence=async p=>JSON.parse(await readFile(new URL(p,folder),'utf8'));
const [structural,gltf,mesh,browser]=await Promise.all(['evidence/validation.json','evidence/gltf-validation.json','evidence/mesh-contact.json','preview/browser-evidence.json'].map(evidence));
const otherChecksPass=structural.passed&&gltf.passed&&mesh.summary.allBodyAboveTolerance&&mesh.summary.allStickAboveTolerance&&!browser.errors.length;
const manifest={schemaVersion:1,license:'CC0-1.0',source:'source/build-manifest.mjs',baseCommit:'34c9dee36497f0a242975c12004a3450259ddf03',
  directory:'workout/island/design/hockey-v1',rig:'canonical18',fps:30,language:'he',minimumAge:7,
  acceptance:{readyForIntegration:!!measurement&&otherChecksPass&&!measurement.summary.rawCodexFailures.length&&!measurement.summary.athleteFailures.length,
    structuralChecksPass:structural.passed,gltfChecksPass:gltf.passed,meshFloorChecksPass:mesh.summary.allBodyAboveTolerance&&mesh.summary.allStickAboveTolerance,browserErrors:browser.errors,
    feelScoreMinimumRequired:88,measuredMinimum:measurement?.summary.minRawCodexScore??null,rawFailures:measurement?.summary.rawCodexFailures??[],
    athleteFailures:measurement?.summary.athleteFailures??[]},
  checksumConventionHe:'כל הקבצים למעט המניפסט עצמו חתומים כאן ב־SHA-256 של הבתים המלאים. חתימת המניפסט עצמו מפורסמת בתיאור ה־PR כדי למנוע תלות מעגלית.',
  fileCount:files.length,files};
const text=JSON.stringify(manifest,null,2)+'\n';
await writeFile(new URL('manifest.json',folder),text);
console.log(JSON.stringify({files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0),manifestSha256:createHash('sha256').update(text).digest('hex'),acceptance:manifest.acceptance}));
