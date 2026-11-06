import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {packageServer} from './serve.mjs';
const req=createRequire(path.join(process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules','anchor.cjs'));
const {chromium}=req('playwright');const server=packageServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];const sampleCount=Number(process.argv[2]||500);if(!(sampleCount>=60&&sampleCount<=2000))throw Error('Samples 60..2000');
try {
  const p=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});await p.goto('http://127.0.0.1:'+server.address().port+'/preview.html?capture=1&lod=0');await p.waitForFunction(()=>window.arenaReady);
  const cadence=await p.evaluate(async()=>{const stamps=[];for(let i=0;i<40;i++)stamps.push(await new Promise(requestAnimationFrame));const gaps=stamps.slice(1).map((n,i)=>n-stamps[i]);return {visibility:document.visibilityState,rafMs:gaps.reduce((a,b)=>a+b,0)/gaps.length};});
  for(const level of [0,1,2])for(const replay of [false,true]) {
    const r=await p.evaluate(({level,replay,sampleCount})=>{
      arenaPreview.arena.setLOD(level);arenaPreview.setReplay(replay);
      for(let i=0;i<10;i++){arenaPreview.step(1/30);arenaPreview.renderer.getContext().finish();}
      const work=[],begin=performance.now();
      for(let i=0;i<sampleCount;i++){const a=performance.now();arenaPreview.step(1/30);arenaPreview.renderer.getContext().finish();work.push(performance.now()-a);}
      work.sort((a,b)=>a-b);return {p50:work[Math.floor(sampleCount*.5)],p95:work[Math.floor(sampleCount*.95)],max:work.at(-1),mean:(performance.now()-begin)/sampleCount,...arenaPreview.metrics()};
    },{level,replay,sampleCount});rows.push(`| ${level} | ${replay?'ריפליי + חלונית':'חי'} | ${r.triangles} | ${r.draws} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.mean.toFixed(2)} | ${r.max.toFixed(2)} |`);console.log(level,replay?'replay':'live','p95',r.p95.toFixed(2),'ms; mean',r.mean.toFixed(2),'max',r.max.toFixed(2));
  }
  const root=fileURLToPath(new URL('../verification/',import.meta.url));await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'PERFORMANCE.md'),'# מדידת עלות רינדור בתוכנה\n\nChromium עם SwiftShader, חלון 844×390, DPR מוגבל ל־1.25, '+sampleCount+' פריימים בכל מצב אחרי 10 פריימי חימום. כל מדידה כוללת update, רינדור ו־gl.finish. במקביל רץ מבחן יציבות מתמשך באותו מארח.\n\n| LOD | מצב | משולשים נצפים | הגשות | p50 ms | p95 ms | ממוצע ms | מקסימום ms |\n|---|---|---:|---:|---:|---:|---:|---:|\n'+rows.join('\n')+`\n\nקצב requestAnimationFrame של סביבת הענן: מרווח ממוצע ${cadence.rafMs.toFixed(2)}ms, visibility=${cadence.visibility}. נתון זה נמדד בנפרד מעלות הציור; אין להסיק ממנו קצב GPU של טלפון. ב־30fps תקציב הפריים הוא 33.33ms. הטבלה מציגה את עלות העבודה הסינכרונית במארח התוכנה, לא הבטחת 30fps במכשיר פיזי.\n\nלא נבדק טלפון פיזי. המנוע צריך להפעיל LOD אוטומטי ולהגביל DPR, ויש לבצע בדיקת מכשיר במסגרת האינטגרציה.\n`);
  console.log('rAF interval',cadence.rafMs.toFixed(2),'ms,',cadence.visibility);
} finally {await browser.close();await new Promise(r=>server.close(r));}
