/** CC0-1.0. Render the delivered files in Chromium; no application files change. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.ATHLETE_TOOL_ROOT||'/tmp/athlete-tools']}));
const evidence=path.join(root,'verification');
await fs.mkdir(path.join(evidence,'sheets'),{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(root,'motion-manifest.json'),'utf8'));
const bodies=['soccer','guard','wing','center'];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[],warnings=[],responses=[],failedRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('response',r=>{responses.push({url:r.url(),status:r.status()});});
page.on('requestfailed',r=>failedRequests.push({url:r.url(),failure:r.failure()}));
await page.addInitScript(()=>{
 window.__wasmAttempts=[];window.__cspViolations=[];
 document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push({directive:e.violatedDirective,blocked:e.blockedURI}));
 for(const name of ['compile','compileStreaming','instantiate','instantiateStreaming','Module'])if(window.WebAssembly?.[name])window.WebAssembly[name]=function(){window.__wasmAttempts.push(name);throw Error('WebAssembly disabled during asset verification');};
});
const url=process.env.ATHLETE_PREVIEW_URL||'http://127.0.0.1:8765/workout/island/design/athlete-body-v1/preview.html';
const writePNG=async(name,url)=>{await fs.writeFile(path.join(evidence,name),Buffer.from(url.split(',')[1],'base64'));return 'verification/'+name;};
const stripImages=result=>Object.fromEntries(Object.entries(result).filter(([k])=>!k.endsWith('DataURL')&&k!=='dataURL'));
try{
 await page.goto(url);await page.waitForFunction(()=>window.athletePreview?.ready,{},{timeout:45000});
 const ready=await page.evaluate(()=>window.athletePreview.readyPromise);
 await page.evaluate(()=>window.athletePreview.setAppearance({playing:false,time:0,angle:'three'}));
 const assets=await page.evaluate(()=>window.athletePreview.inspectAssets());
 const loads=assets.loads;
 if(loads.length!==37||!loads.every(x=>x.ok))throw Error('Expected all 37 runtime GLBs to load');
 const sheets=[];
 for(const body of bodies)for(const clip of manifest.clips){
  const result=await page.evaluate(({body,id})=>window.athletePreview.renderSheet(body,id),{body,id:clip.id});
  if(result.frameCount!==8||!result.frames.every(f=>f.finite))throw Error('Invalid sheet '+body+'/'+clip.id);
  const filename='sheets/'+body+'--'+clip.id.replaceAll('/','--')+'.png';
  await writePNG(filename,result.dataURL);sheets.push({...stripImages(result),path:'verification/'+filename});
  if(sheets.length%10===0)console.log(`Rendered ${sheets.length}/100 eight-frame sheets`);
 }
 // Exercise the actual controls, including their event handlers.
 const interactions=[];
 for(const sport of ['soccer','basketball','tennis','hockey']){
  await page.click(`[data-sport="${sport}"]`);
  await page.waitForFunction(s=>window.athletePreview.state.sport===s,sport);
  interactions.push({control:'sport',value:sport});
  const shot=await page.evaluate(()=>window.athletePreview.renderCompare({sameUniform:true}));
  // renderSheet explicitly chooses the requested morph and exposes all four bodies.
  const variant=await page.evaluate(sport=>window.athletePreview.renderSheet('wing','hoops-v11/center/jump_shot',{sport,frameWidth:260,frameHeight:300}),sport);
  await writePNG('uniform-'+sport+'.png',variant.dataURL);
  void shot;
 }
 for(let i=0;i<6;i++){
  await page.click(`#skin-options button:nth-child(${i+1})`);
  await page.waitForFunction(i=>window.athletePreview.state.skin===i,i);
  interactions.push({control:'skin',value:i});
 }
 const hairChoices=await page.locator('#hair option').evaluateAll(nodes=>nodes.map(n=>n.value));
 const hairPreviews=[];
 for(const hair of hairChoices){
  await page.selectOption('#hair',hair);
  await page.waitForFunction(hair=>window.athletePreview.state.hair===hair,hair);
  interactions.push({control:'hair',value:hair});
  const result=await page.evaluate(()=>window.athletePreview.renderCompare({sameUniform:true,appearance:{skin:1}}));
  hairPreviews.push({id:hair,label:assets.hair.find(h=>h.id===hair)?.label||hair,dataURL:result.leftDataURL});
 }
 const hairGrid=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1000;c.height=520;const ctx=c.getContext('2d');ctx.fillStyle='#e9eadd';ctx.fillRect(0,0,c.width,c.height);
  for(let i=0;i<rows.length;i++){
   const img=new Image();img.src=rows[i].dataURL;await img.decode();const x=(i%4)*250,y=Math.floor(i/4)*260;
   ctx.drawImage(img,170,10,260,230,x,y,250,230);ctx.fillStyle='#17352e';ctx.font='16px Arial';ctx.textAlign='center';ctx.fillText(rows[i].label,x+125,y+249);
  }return c.toDataURL('image/png');
 },hairPreviews);
 await writePNG('hair-eight.png',hairGrid);
 for(const [id,value]of Object.entries({primary:'#8f254b',secondary:'#233d77',trim:'#ffd263'})){
  await page.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await page.waitForFunction(({id,value})=>window.athletePreview.state[id]===value,{id,value});interactions.push({control:id,value});
 }
 await page.evaluate(()=>window.athletePreview.setAppearance({sport:'soccer',skin:1,hair:'crop',primary:'#187e83',secondary:'#16363b',trim:'#e7dbb9',angle:'front',playing:false,time:0}));
 const comparisons=[];
 for(const item of [{id:'same-kit-normalized',normalizeHeight:true,sameUniform:true},{id:'sports-normalized',normalizeHeight:true,sameUniform:false},{id:'sports-native-height',normalizeHeight:false,sameUniform:false},{id:'control-identical-body',normalizeHeight:true,sameUniform:true,rightId:'soccer'}]){
  const result=await page.evaluate(options=>window.athletePreview.renderCompare(options),item);
  const files={pair:await writePNG('compare-'+item.id+'.png',result.dataURL),left:await writePNG('compare-'+item.id+'-left.png',result.leftDataURL),right:await writePNG('compare-'+item.id+'-right.png',result.rightDataURL)};
  comparisons.push({...stripImages(result),id:item.id,files});
 }
 await page.click('#compare-refresh');await page.waitForFunction(()=>document.querySelector('#comparison-image').getAttribute('aria-busy')!=='true');
 await page.screenshot({path:path.join(evidence,'preview-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,'preview-mobile.png'),fullPage:true});
 const overflow=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 const runtime=await page.evaluate(()=>({wasmAttempts:window.__wasmAttempts,cspViolations:window.__cspViolations,webglLost:document.querySelector('#stage').getContext('webgl2')?.isContextLost()??false}));
 const badHTTP=responses.filter(r=>r.status>=400);
 const passed=sheets.length===100&&errors.length===0&&failedRequests.length===0&&badHTTP.length===0&&runtime.wasmAttempts.length===0&&runtime.cspViolations.length===0&&!runtime.webglLost&&overflow.document<=overflow.viewport;
 const report={schemaVersion:1,url,renderer:'Chromium / ANGLE SwiftShader, WebAssembly entry points disabled',ready,loads,sheets,comparisons,interactions,runtime,overflow,errors,warnings,failedRequests,badHTTP,passed};
 await fs.writeFile(path.join(evidence,'browser.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed,sheets:sheets.length,frames:sheets.length*8,loads:loads.length,errors,warnings: warnings.length,runtime,overflow},null,2));
 if(!passed)process.exitCode=1;
}finally{await browser.close();}
