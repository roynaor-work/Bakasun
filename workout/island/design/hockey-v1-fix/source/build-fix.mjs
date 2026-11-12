// SPDX-License-Identifier: CC0-1.0
// מקור: תהליך תיקון ושמירת ניסיונות מקורי על קליפי CC0 של PR 414.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as stride from './stride-fixes.mjs';
import * as edge from './edge-fixes.mjs';
import * as goalie from './goalie-fixes.mjs';
const root=new URL('../',import.meta.url),original=new URL('../../hockey-v1/clips.json',import.meta.url);
const pack=JSON.parse(readFileSync(original,'utf8'));
const before=JSON.parse(readFileSync(new URL('../../hockey-v1/evidence/codex-qa/report.json',import.meta.url),'utf8'));
export const failed=before.libraries[0].clips.filter(c=>c.score<88).map(c=>c.id);
if(failed.length!==15)throw Error('צפויים 15 קליפים לתיקון');
const modules=[stride,edge,goalie];
function make(attempt){
 const out=structuredClone(pack);
 out.source='תיקון מקורי של Codex ל-PR 414, source/build-fix.mjs, 12/11/2026; מקור CC0 dc99f03416ca279b549b7f2db927ef7a6ac401e0';
 for(const id of failed){
  let state=pack.states[id];
  for(const m of modules)state=m.revise(id,state,attempt,pack);
  out.states[id]=state;
 }
 return out;
}
const attempts=[];
for(let attempt=1;attempt<=3;attempt++){
 const out=make(attempt),directory=new URL(`evidence/attempt-${attempt}/`,root);
 mkdirSync(directory,{recursive:true});
 writeFileSync(new URL('clips.json',directory),JSON.stringify(out,null,1)+'\n');
 attempts.push(out);
}
// בחירה מפורשת: גרסה 3 מקטינה תנועה רוחבית; בפניית 180 גרסה 1 שומרת ציון המקור.
// בחגיגה גרסה 2 נותנת את הפירואט בעל הכניסה והיציאה המדויקות והציון הגבוה.
const selected=Object.fromEntries(failed.map(id=>[id,id==='celebrate_3'?2:id==='skate_turn_180'?1:3]));
const final=structuredClone(attempts[2]);
for(const [id,attempt]of Object.entries(selected))final.states[id]=attempts[attempt-1].states[id];
writeFileSync(new URL('clips.json',root),JSON.stringify(final,null,1)+'\n');
const changes=failed.map(id=>{
 const source=id.startsWith('goalie_')||id==='celebrate_3'?goalie:id.startsWith('skate_push')||id==='skate_backward'?stride:edge;
 return {id,selectedAttempt:selected[id],attempts:[1,2,3].map(attempt=>({attempt,change:source.changesHe?.[id]?.[attempt-1]??(Array.isArray(source.descriptions)?source.descriptions[attempt-1]:source.descriptions[attempt])}))};
});
writeFileSync(new URL('evidence/changes.json',root),JSON.stringify({license:'CC0-1.0',baseCommit:'dc99f03416ca279b549b7f2db927ef7a6ac401e0',clips:changes},null,2)+'\n');
console.log(JSON.stringify({directory:fileURLToPath(root),attempts:3,revised:failed.length,selected}));
