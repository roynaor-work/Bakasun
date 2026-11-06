import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../runtime/vendor/three.module.js';
import {decodeParts} from './inspect-glb.mjs';
import {createPopulation} from '../runtime/population.mjs';
import {createBallGeometry,createScoreSurfaces} from '../runtime/surfaces.mjs';
import {ASSETS} from '../runtime/layout.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function files(dir){let out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
const inventory=[];
for(const f of (await files(path.join(root,'runtime'))).sort()){const b=await fs.readFile(f);inventory.push({name:path.relative(path.join(root,'runtime'),f),size:b.length,hash:createHash('sha256').update(b).digest('hex')});}
await fs.writeFile(path.join(root,'RUNTIME.md'),'# קובצי ריצה מדויקים\n\nכל הנתיבים יחסיים ל־`runtime/`. הקבצים כאן הם תלות הריצה המקומית של דף התצוגה והאולם. LICENSE files מלווים את הספריות; כלי הפקה, בדיקות וצילומים נמצאים מחוץ ל־runtime. אין npm install ואין build בזמן ריצה.\n\n| קובץ | בתים | SHA-256 |\n|---|---:|---|\n'+inventory.map(f=>`| [${f.name}](runtime/${f.name}) | ${f.size.toLocaleString('en-US')} | \`${f.hash}\` |`).join('\n')+`\n\nסה״כ runtime: **${inventory.reduce((n,f)=>n+f.size,0).toLocaleString('en-US')} בתים**.\n\nכל שלושת ה־GLB דחוסים ב־Draco; חמש מפות WebP נפרדות משותפות לרמות. props.mjs והכדור מדגימים את חוזה הריפליי; המשחק יכול להשתמש בכדור הקיים שלו. הקובץ surfaces.mjs הוא מקור הגאומטריה הדינמית שהבדיקה סופרת.\n`);
const summaries=[],parts=[];
for(let level=0;level<3;level++) {
  const result=await decodeParts(new URL('../runtime/'+ASSETS[level],import.meta.url));const byName=new Map(result.parts.map(p=>[p.name,p.triangles]));let shell=0;
  function visit(index){const n=result.document.nodes[index];if(n.mesh!==undefined)for(const p of result.document.meshes[n.mesh].primitives)shell+=result.document.accessors[p.indices].count/3;for(const c of n.children||[])visit(c);}
  for(const n of result.document.scenes[result.document.scene??0].nodes)visit(n);
  const population=createPopulation(level);let pop=0;population.group.traverse(o=>{if(o.isMesh)pop+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
  const ball=createBallGeometry(),ballCount=ball.index.count/3;ball.dispose();const mat=new THREE.MeshBasicMaterial();const screens=createScoreSurfaces(mat,mat);let screenCount=0;screens.traverse(o=>{if(o.isMesh){screenCount+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;o.geometry.dispose();}});mat.dispose();
  const live=shell+pop+ballCount+screenCount;summaries.push({level,bytes:result.bytes,shell,pop,ball:ballCount,screens:screenCount,live,replay:live*2,crowd:population.count});parts.push(byName);population.dispose();
}
const names=[...new Set(parts.flatMap(p=>[...p.keys()]))];
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification/BUDGET.md'),'# תקציב משולשים — אחרי פענוח Draco\n\nנוצר מתוך הקבצים שנמסרו, ומ־factories אמיתיות של הגאומטריה הדינמית. אין הסתמכות על מספרי תקציב במניפסט. ספירת מעטפת כוללת את מספר מופעי nodes, ולא רק גאומטריה ייחודית. כל 3 רמות נבחנות נגד תקרה קשיחה של 35,000 בשתי הגשות מלאות.\n\n| LOD | GLB בתים | מעטפת | קהל+מושבים | כדור | מסכים | חי | ריפליי + חלונית | צופים |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'+summaries.map(s=>`| ${s.level} | ${s.bytes} | ${s.shell} | ${s.pop} | ${s.ball} | ${s.screens} | **${s.live}** | **${s.replay}** | ${s.crowd} |`).join('\n')+'\n\n| חלק GLB | LOD0 | LOD1 | LOD2 |\n|---|---:|---:|---:|\n'+names.map(name=>`| ${name} | ${parts.map(p=>p.get(name)??0).join(' | ')} |`).join('\n')+'\n\nקהל ומושבים: שני InstancedMesh בכל LOD. כל צופה 2 משולשים וכל מושב 2; משטחי alpha נצבעים במעבר יחיד. שמונת המסכים הם 16 משולשים. הכדור האופציונלי 224. מספרי רינדור בפועל יכולים להיות נמוכים יותר בגלל frustum culling וחיתוך אדריכלי של הגג/קיר קרוב. אין צללים דינמיים, PMREM בזמן טעינה או מעבר השתקפות סצנה נוסף. קובץ הבדיקה מפענח את כל ה־primitives, מאמת מספרי פנים/אינדקסים, UV וערכי attributes סופיים, וסופר את אותן factories שהמשחק טוען.\n\nהרצה ללא התקנת תלויות: `node --test` מתוך תיקיית החבילה.\n');
console.log('Runtime',inventory.reduce((n,f)=>n+f.size,0),'bytes; worst replay',Math.max(...summaries.map(s=>s.replay)),'triangles');
