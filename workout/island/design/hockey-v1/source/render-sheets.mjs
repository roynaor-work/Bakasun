// SPDX-License-Identifier: CC0-1.0
// מקור: יצירה מקורית עבור חבילת ההוקי, 2026-11-12.
// node workout/island/design/hockey-v1/source/render-sheets.mjs
// Requires Playwright and system Chromium; no runtime files are modified.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../../../../../',import.meta.url))),out=resolve(root,'workout/island/design/hockey-v1');
let pw;
for(const candidate of [process.env.HOCKEY_PLAYWRIGHT,'playwright','/opt/codex/runtimes/cua/lib/node_modules/playwright-core/index.mjs','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'].filter(Boolean)){try{pw=await import(candidate);break}catch{}}
if(!pw)throw new Error('נדרשת ספריית Playwright להצגת הנכסים');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}try{const buf=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(buf)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port,url=`http://127.0.0.1:${port}/workout/island/design/hockey-v1/preview.html`;
const browser=await pw.chromium.launch({executablePath:process.env.HOCKEY_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1320,height:980},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const inputPaths=['clips.json','models/skater.glb','models/goalie.glb','models/stick.glb','preview.html','source/render-sheets.mjs'];
const inputHashes=()=>Promise.all(inputPaths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(resolve(out,path))).digest('hex')})));
await mkdir(resolve(out,'sheets'),{recursive:true});await mkdir(resolve(out,'preview'),{recursive:true});
try{
const inputsBefore=await inputHashes();
await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.hockeyReady||window.hockeyError,{timeout:30000});
const failure=await page.evaluate(()=>window.hockeyError);if(failure)throw new Error(failure);
await page.screenshot({path:resolve(out,'preview/gallery.png'),fullPage:true});
const ids=await page.evaluate(()=>window.hockeyPreview.ids),evidence={license:'CC0-1.0',source:'יצירה מקורית; רנדר דפדפן מהנכסים שבתיקייה',renderer:await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');return {vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};}),clipCount:ids.length,sheets:[],models:[],errors};
evidence.inputs=inputsBefore;
evidence.view={rootMotion:'referenceRootMotion',camera:'עוקבת אחרי מיקום ההחלקה; סיבובי הגוף נשארים כפי שנכתבו בקליפ',sheets:'שמונה דגימות בשלושה רבעים ובמבט מהצד',engine:'תצוגת נכסים עצמאית; קוד משחק אינו מופעל'};
for(const role of ['skater','goalie']){const result=await page.evaluate(role=>window.hockeyPreview.modelSheet(role),role);await writeFile(resolve(out,'preview',role+'.png'),Buffer.from(result.image.split(',')[1],'base64'));evidence.models.push({role,path:`preview/${role}.png`,width:result.width,height:result.height});}
if(!process.argv.includes('--models-only'))for(const id of ids){const result=await page.evaluate(id=>window.hockeyPreview.sheet(id),id);const {image,...meta}=result;await writeFile(resolve(out,'sheets',id+'.png'),Buffer.from(image.split(',')[1],'base64'));evidence.sheets.push({...meta,path:`sheets/${id}.png`});console.log(`גיליון: ${id}`);}
if(JSON.stringify(inputsBefore)!==JSON.stringify(await inputHashes()))throw new Error('הנכסים השתנו במהלך הרנדר; יש להפיק גיליונות מחדש');
await writeFile(resolve(out,'preview/browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
if(errors.length)throw new Error('שגיאות דפדפן: '+errors.join('\n'));
console.log(`נוצרו ${evidence.sheets.length} גיליונות ו־${evidence.models.length} תצוגות גוף ללא שגיאות דפדפן`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
