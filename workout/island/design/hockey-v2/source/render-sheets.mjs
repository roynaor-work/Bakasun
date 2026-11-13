// SPDX-License-Identifier: CC0-1.0
// מקור: עיבוד מקורי של hockey-v1/source/render-sheets.mjs להשוואת תנועה, 2026-11-13.
// מרנדר את אותם דגמי GLB ושמונה רגעים זהים לפני ואחרי; אין שינוי בנכסי המקור.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
const out=resolve(root,'workout/island/design/hockey-v2');
const original=resolve(root,'workout/island/design/hockey-v1');
const before=resolve(root,'workout/island/design/hockey-v1-fix');
let pw;
for(const candidate of [process.env.HOCKEY_PLAYWRIGHT,'playwright','/opt/codex/runtimes/cua/lib/node_modules/playwright-core/index.mjs','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'].filter(Boolean)){
  try{pw=await import(candidate);break}catch{}
}
if(!pw)throw new Error('נדרשת ספריית Playwright להצגת הנכסים');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const buf=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(buf)}catch{res.writeHead(404).end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port,url=`http://127.0.0.1:${port}/workout/island/design/hockey-v2/preview.html`;
const browser=await pw.chromium.launch({executablePath:process.env.HOCKEY_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1320,height:980},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const inputPaths=[
  resolve(before,'clips.json'),resolve(out,'clips.json'),
  ...['skater','goalie','stick'].map(id=>resolve(original,`models/${id}.glb`)),
  resolve(out,'preview.html'),resolve(out,'source/render-sheets.mjs'),
];
const inputHashes=()=>Promise.all(inputPaths.map(async path=>({path:path.slice(root.length+1),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
for(const path of ['sheets/before','sheets/after','sheets/comparison','preview'])await mkdir(resolve(out,path),{recursive:true});
try{
  const inputsBefore=await inputHashes();
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.hockeyReady||window.hockeyError,{timeout:30000});
  const failure=await page.evaluate(()=>window.hockeyError);
  if(failure)throw new Error(failure);
  const gallery=await page.evaluate(()=>window.hockeyPreview.gallery());
  await writeFile(resolve(out,'preview/gallery.png'),Buffer.from(gallery.image.split(',')[1],'base64'));
  const {image:galleryImage,...galleryMeta}=gallery;
  const allIds=await page.evaluate(()=>window.hockeyPreview.changedIds);
  const ids=process.env.HOCKEY_RENDER_IDS?process.env.HOCKEY_RENDER_IDS.split(','):allIds;
  if(ids.some(id=>!allIds.includes(id)))throw Error('Unknown clip requested');
  const evidence={license:'CC0-1.0',source:'רנדר דפדפן מקורי של נכסי hockey-v1 ושל תנועות התיקון; אותם דגמי גוף, תאורה, מצלמה וזמנים בכל גרסה',clipCount:ids.length,framesPerRevision:8,viewsPerFrame:2,comparisonViewsPerFrame:1,sheets:[],errors,inputs:inputsBefore};
  evidence.gallery={...galleryMeta,path:'preview/gallery.png'};
  evidence.renderer=await page.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2');
    return {vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};
  });
  for(const id of ids){
    for(const revision of ['before','after']){
      const result=await page.evaluate(({id,revision})=>window.hockeyPreview.sheet(id,revision),{id,revision});
      const {image,...meta}=result,path=`sheets/${revision}/${id}.png`;
      await writeFile(resolve(out,path),Buffer.from(image.split(',')[1],'base64'));
      evidence.sheets.push({...meta,path});
    }
    const result=await page.evaluate(id=>window.hockeyPreview.comparison(id),id);
    const {image,...meta}=result,path=`sheets/comparison/${id}.png`;
    await writeFile(resolve(out,path),Buffer.from(image.split(',')[1],'base64'));
    evidence.sheets.push({...meta,path});
    console.log(`גיליונות לפני, אחרי והשוואה: ${id}`);
  }
  if(JSON.stringify(inputsBefore)!==JSON.stringify(await inputHashes()))throw new Error('הקלט השתנה במהלך הרנדר; יש להפיק גיליונות מחדש');
  await writeFile(resolve(out,'preview/browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  if(errors.length)throw new Error('שגיאות דפדפן: '+errors.join('\n'));
  console.log(JSON.stringify({clipCount:ids.length,sheets:evidence.sheets.length,errors}));
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
