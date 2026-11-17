// SPDX-License-Identifier: CC0-1.0
// Verify that final browser, surface, QA and validator evidence describes these bytes.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),json=async p=>JSON.parse(await fs.readFile(new URL(p,base))),hash=b=>createHash('sha256').update(b).digest('hex');
const [catalog,qa,browser,surfaces,validator]=await Promise.all(['catalog.json','verification/motion-qa.json','verification/browser.json','verification/surfaces.json','verification/gltf-validation.json'].map(json));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
assert(catalog.clips.length===14&&qa.actorCount===24,'Expected fourteen choreographies and twenty-four actor tracks.');
assert(qa.passed&&qa.minimumScore>88&&qa.minimumCoverage===1,'Motion QA failed.');
assert(browser.passed&&validator.passed,'Browser or validator failed.');
assert(surfaces.results.length===14&&surfaces.summary.minimumSkinY>=0&&surfaces.summary.maxCalibratedSurfaceGapMeters<=.02,'Mesh floor or calibrated surface contact failed.');
const checked=[];
for(const c of catalog.clips){
 const bytes=await fs.readFile(new URL(c.asset,base)),digest=hash(bytes);
 const records=[c,qa.checks.find(r=>r.id===c.id),validator.results.find(r=>r.id===c.id)];
 for(const r of records)assert(r?.sha256===digest,`${c.id}: stale asset evidence.`);
 const rendered=browser.clips.find(r=>r.id===c.id);assert(rendered?.assetSha256===digest,`${c.id}: stale browser render.`);
 assert(rendered.frames===8&&rendered.framing.every(f=>f.inside),`${c.id}: incomplete contact sheet.`);
 assert(rendered.sheetSha256===hash(await fs.readFile(new URL(rendered.sheet,base))),`${c.id}: stale sheet bytes.`);
 const surface=surfaces.results.find(r=>r.id===c.id);assert(surface?.sha256===digest,`${c.id}: stale surface evidence.`);
 checked.push({id:c.id,sha256:digest,sheet:rendered.sheet,frames:8});
}
assert(browser.webAssemblyDisabled&&!browser.forbiddenRequests.length&&!browser.externalRequests.length,'Runtime local-only verification failed.');
const result={schemaVersion:1,clips:14,actors:24,renderedFrames:112,evidenceHashesMatch:true,noExternalRequests:true,webAssemblyDisabled:true,passed:true,checked};
await fs.writeFile(new URL('verification/package-integrity.json',base),JSON.stringify(result,null,2)+'\n');
console.log('PASS: final GLBs, catalog, QA, surface scan, validator and all 112 rendered frames agree.');
