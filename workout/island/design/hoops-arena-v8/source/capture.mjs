import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {packageServer} from './serve.mjs';
const req=createRequire(path.join(process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules','anchor.cjs'));
const {chromium}=req('playwright');
const number=String(process.argv[2]||'01').padStart(2,'0');if(!/^\d\d$/.test(number))throw Error('Two-digit iteration');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'iterations',number);await fs.mkdir(out,{recursive:true});
const signature=createHash('sha256');
async function addRuntime(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())await addRuntime(p);else{signature.update(path.relative(root,p));signature.update(await fs.readFile(p));}}}
await addRuntime(path.join(root,'runtime'));
await fs.writeFile(path.join(out,'STATE.md'),`# מצב הריצה שצולם\n\nתחילת צילום: ${new Date().toISOString()}.\n\nRuntime SHA-256: \`${signature.digest('hex')}\`.\n\nהחתימה כוללת נתיב ותוכן של כל קובצי runtime, במיון רקורסיבי לפי שם. הצילומים הם PNG ללא שינוי פיקסלים, במידות CSS המבוקשות וב־DPR=1.\n`);
const server=packageServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const rows=['view,width,height,lod,replay,triangles,draws,geometries,textures,crowd,replayBytes'];
try {
  for(const [width,height]of [[390,844],[844,390]])for(const [view,mode]of [['far','live'],['near','live'],['near','replay']]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});const errors=[];const external=[];
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
    const url=`http://127.0.0.1:${server.address().port}/preview.html?capture=1&lod=0&view=${view}&mode=${mode}`;
    await page.goto(url);await page.waitForFunction(()=>window.arenaReady||window.arenaError,{timeout:30000});
    const fatal=await page.evaluate(()=>window.arenaError);if(fatal)throw new Error(fatal);
    await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{window.arenaPreview.step(1/30);window.arenaPreview.step(1/30);});
    const m=await page.evaluate(()=>window.arenaPreview.metrics());
    const audit=await page.evaluate(()=>{
      const issues=[];for(const b of document.querySelectorAll('button:not([hidden])')) {
        if(!b.getClientRects().length)continue;const r=b.getBoundingClientRect();if(r.width<44||r.height<44)issues.push('Small button: '+b.textContent);
        if(r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight)issues.push('Clipped button: '+b.textContent);
      }
      const score=document.querySelector('.arenaHud__score').getBoundingClientRect();if(score.right>innerWidth||score.x<0)issues.push('Clipped score');return issues;
    });
    if(errors.length||external.length||audit.length)throw new Error([...errors,...external,...audit].join('\n'));
    if(m.triangles>35000)throw Error('Renderer triangle budget exceeded: '+m.triangles);
    const name=`${width}x${height}-${view}-${mode}`;await page.screenshot({path:path.join(out,name+'.png'),type:'png'});
    rows.push([view,width,height,m.lod,mode==='replay',m.triangles,m.draws,m.geometries,m.textures,m.crowd,m.replayBytes].join(','));console.log(name,m.triangles+' tri',m.draws+' draws');await page.close();
  }
  await fs.writeFile(path.join(out,'metrics.csv'),rows.join('\n')+'\n');
} finally {await browser.close();await new Promise(r=>server.close(r));}
