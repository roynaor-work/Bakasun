import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** Alpine Rush frame pacing in Chromium with SwiftShader (software GL: a CPU measurement, not a phone GPU).
 * Runs tools/perf-alpine.html in both phone orientations, full size and with a tiny canvas (JS cost only).
 * Env: PERF_SECONDS (default 20), PERF_SIZES ("844x390,390x844"), PERF_PROFILE=1 (CPU profile, top self-time
 * functions), PERF_LABEL (file name suffix), CHROMIUM_PATH. Results: verification/alpine/perf-<label>.json */
const directory=fileURLToPath(new URL('../verification/alpine/',import.meta.url));await mkdir(directory,{recursive:true});
const seconds=Number(process.env.PERF_SECONDS)||20,label=process.env.PERF_LABEL||'run',profile=process.env.PERF_PROFILE==='1';
const sizes=(process.env.PERF_SIZES||'844x390,390x844').split(',').map(s=>s.split('x').map(Number));
const modes=(process.env.PERF_MODES||'full,small').split(',');
const executablePath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const server=await serveIsland(),chromium=await islandChromium(),results=[];
for(const [width,height] of sizes)for(const mode of modes){
  const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-precise-memory-info','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2,timezoneId:'Asia/Jerusalem'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(240000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const query=`?autostart=1&seconds=${seconds}&switch=1${mode==='small'?'&small=1':''}`;
  let cdp=null;if(profile){cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});}
  await page.goto(server.url+'tools/perf-alpine.html'+query,{waitUntil:'load'});
  if(cdp)await cdp.send('Profiler.start');
  await page.waitForFunction(()=>window.__perf?.done,null,{timeout:240000,polling:500});
  const result=await page.evaluate(()=>window.__perf.result),error=await page.evaluate(()=>window.__perf.error);
  if(cdp){const {profile:p}=await cdp.send('Profiler.stop');result.hot=topFunctions(p,30);}
  if(error)errors.push(error);
  result.mode=mode;result.errors=errors;results.push(result);
  if(result.frames!==undefined){console.log(`${width}x${height} ${mode}: ${result.avgFps} fps, p50 ${result.frameMs.p50} p95 ${result.frameMs.p95} ms, >33: ${result.over33}, >50: ${result.over50}, JS/frame ${result.tickMs.avg} ms (step ${result.parts.step}, snapshot ${result.parts.snapshot}, render ${result.parts.render}, other ${result.parts.other}), load ${result.loadMs} ms, alloc/frame ${JSON.stringify(result.allocKB)} KB, first racing frames ${result.firstRacingFrames.map(f=>f.frameMs).join('/')} ms, switches ${JSON.stringify(result.qualitySwitches)} ${JSON.stringify(result.switchMetrics)}`);
    if(result.auditHigh)console.log('  audit at start:',Object.entries(result.auditHigh.categories).map(([k,v])=>`${k} ${v.tris}+${v.shadowTris}s`).join(', '),`| shadow ${result.auditHigh.shadowMapSize} programs ${result.auditHigh.programs}`);
    if(result.audit)console.log('  audit at end:',Object.entries(result.audit.categories).map(([k,v])=>`${k} ${v.tris}+${v.shadowTris}s`).join(', '),`| shadow ${result.audit.shadowMapSize} programs ${result.audit.programs} calls ${result.render.calls} tris ${result.render.triangles}`);}
  else console.log(`${width}x${height} ${mode}: no result`,errors);
  if(result.hot)console.log('  hot:',result.hot.slice(0,14).map(h=>`${h.name} ${h.ms}ms (${h.where})`).join('\n       '));
  await browser.close();
}
await server.close();
await writeFile(directory+`perf-${label}.json`,JSON.stringify({seconds,date:new Date().toISOString(),results},null,1)+'\n');
console.log('perf alpine: written',`perf-${label}.json`);

/** Aggregates a CDP profile into self time per function (ms). */
function topFunctions(p,count){
  const byId=new Map(p.nodes.map(n=>[n.id,n])),self=new Map();
  const dt=new Map();for(let i=0;i<p.samples.length;i++)dt.set(p.samples[i],(dt.get(p.samples[i])||0)+(p.timeDeltas[i]||0));
  for(const [id,micro] of dt){const n=byId.get(id),f=n.callFrame,where=f.url?`${f.url.split('/').slice(-1)[0].split('?')[0]}:${f.lineNumber+1}`:'(native)',key=`${f.functionName||'(anonymous)'}|${where}`;self.set(key,(self.get(key)||0)+micro/1000);}
  return [...self].sort((a,b)=>b[1]-a[1]).slice(0,count).map(([k,ms])=>{const [name,where]=k.split('|');return {name,where,ms:Math.round(ms)};});
}
