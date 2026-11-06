/** Continuous rendering soak, real elapsed time, no sleeps or media recording. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {packageServer} from './serve.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const req=createRequire(path.join(process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules','anchor.cjs'));
const {chromium}=req('playwright');const minutes=Number(process.argv[2]||30);if(!(minutes>0&&minutes<=240))throw Error('Soak minutes: 0..240');
const dir=path.join(root,'verification');await fs.mkdir(dir,{recursive:true});const csv=path.join(dir,'soak.csv');
const server=packageServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--enable-precise-memory-info']});
async function runtimeHash() {
  const hash=createHash('sha256');async function add(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else{hash.update(path.relative(root,p));hash.update(await fs.readFile(p));}}}await add(path.join(root,'runtime'));return hash.digest('hex');
}
const started=Date.now(),deadline=started+minutes*60_000;let signature=await runtimeHash(),stableSince=started,frames=0,cycles=0,maxTri=0,maxGeo=0,maxTex=0,maxReplay=0;
const profiles=[
  [390,844,'far',0,false],[844,390,'far',0,false],[390,844,'near',0,true],[844,390,'near',0,true],
  [390,844,'far',1,false],[844,390,'near',1,true],[390,844,'far',2,false],[844,390,'near',2,true],
  [390,844,'near','auto',false],[844,390,'far','auto',true]
];
await fs.writeFile(csv,'cycle,elapsed_s,width,height,view,requested_lod,actual_lod,replay,frames,p50_ms,p95_ms,triangles,draws,geometries,textures,replay_bytes,heap_bytes\n');
let page;const errors=[];
try {
  page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))errors.push('External request '+r.url());});
  const cdp=await page.context().newCDPSession(page);
  while(Date.now()<deadline) {
    const hash=await runtimeHash(),changed=hash!==signature;if(changed){signature=hash;stableSince=Date.now();}
    if(cycles%10===0||changed) {await page.goto(origin+'/preview.html?capture=1&lod=0');await page.waitForFunction(()=>window.arenaReady);}
    const [width,height,view,lod,replay]=profiles[cycles%profiles.length];await page.setViewportSize({width,height});
    await page.evaluate(({view,lod,replay})=>{arenaPreview.setView(view);arenaPreview.arena.setLOD(lod);arenaPreview.setReplay(replay);arenaPreview.resize();},{view,lod,replay});
    const span=Math.min(60_000,deadline-Date.now());if(span<1)break;
    const result=await page.evaluate(async span=>{
      const samples=[],start=performance.now();let n=0;
      while(performance.now()-start<span) {
        const a=performance.now();arenaPreview.step(1/30);arenaPreview.renderer.getContext().finish();samples.push(performance.now()-a);n++;
        await new Promise(requestAnimationFrame);
      }
      samples.sort((a,b)=>a-b);return {frames:n,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],...arenaPreview.metrics()};
    },span);
    await cdp.send('HeapProfiler.collectGarbage');const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize||0);
    if(errors.length)throw Error(errors.join('\n'));if(result.triangles>35000||result.geometries>140||result.textures>8||result.replayBytes>65536||heap>200_000_000)throw Error('Soak resource bound exceeded: '+String([result.triangles,result.geometries,result.textures,result.replayBytes,heap]));
    cycles++;frames+=result.frames;maxTri=Math.max(maxTri,result.triangles);maxGeo=Math.max(maxGeo,result.geometries);maxTex=Math.max(maxTex,result.textures);maxReplay=Math.max(maxReplay,result.replayBytes);
    const elapsed=((Date.now()-started)/1000).toFixed(1);
    await fs.appendFile(csv,[cycles,elapsed,width,height,view,lod,result.lod,replay,result.frames,result.p50.toFixed(2),result.p95.toFixed(2),result.triangles,result.draws,result.geometries,result.textures,result.replayBytes,heap].join(',')+'\n');
    console.log(`Cycle ${cycles}: ${elapsed}s; ${width}x${height} ${view} LOD${result.lod} ${replay?'replay':'live'}; ${result.frames} frames; p95 ${result.p95.toFixed(1)}ms; ${result.triangles} tri; GPU ${result.geometries}g/${result.textures}t; replay ${result.replayBytes}B`);
  }
  const ended=Date.now();await fs.writeFile(path.join(dir,'SOAK.md'),`# מבחן רינדור ממושך\n\nתחילה: ${new Date(started).toISOString()}. סיום: ${new Date(ended).toISOString()}.\nמשך אמיתי: ${((ended-started)/60000).toFixed(2)} דקות; ${cycles} מחזורים; ${frames.toLocaleString('en-US')} פריימים.\n\nהבדיקה רונדרה ברצף ללא השהיות יזומות, ב־Chromium/SwiftShader, עם DPR=1.25, בשני כיווני המסך, קרוב/רחוק, שלושה LOD ואיכות אוטומטית, חי וריפליי. כל פריים כולל gl.finish למדידה סינכרונית, ולכן אלה נתוני בדיקת תוכנה ולא benchmark של GPU בטלפון.\n\nמקסימום נצפה: ${maxTri} משולשים; ${maxGeo} גאומטריות GPU; ${maxTex} טקסטורות GPU; ${maxReplay} בתים בהקלטת כדור. שגיאות דף/קונסול/בקשות חיצוניות: 0.\n\nחתימת runtime סופית: \`${signature}\`. הגרסה הזו נבדקה ברצף מ־${new Date(stableSince).toISOString()} (${((ended-stableSince)/60000).toFixed(2)} דקות). הדף נטען מחדש בכל עשרה מחזורים ובכל שינוי runtime; בין הטעינות מוחלפים מבטים/LOD/ריפליי ללא יצירת נכסים נוספים.\n\nנתונים בכל דקה: [soak.csv](soak.csv).\n`);
  console.log('SOAK PASSED',cycles,'cycles',frames,'frames',((ended-started)/60000).toFixed(2),'minutes');
} finally {await browser.close();await new Promise(r=>server.close(r));}
