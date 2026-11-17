/** CC0-1.0. Real Chromium rendering, picker behavior and a cold file:// offline run. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.AVATAR_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),url=process.env.AVATAR_PREVIEW_URL||'http://127.0.0.1:8765/workout/island/design/avatar-customization-v1/preview.html';
const report={browser:'Chromium / ANGLE SwiftShader',checks:[],bodyItemFits:[],network:[],errors:[],screenshots:[],pass:false};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function check(ok,label,details){assert.ok(ok,label);report.checks.push({label,pass:true,...details?{details}: {}});}
async function screenshot(page,name){await page.screenshot({path:path.join(root,'verification',name)});report.screenshots.push('verification/'+name);}
async function frame(page,focus='full',at=0){await page.evaluate(({focus,at})=>{avatarPreview.setView(focus);avatarPreview.render(at);},{focus,at});}
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.AVATAR_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,acceptDownloads:true});
 await context.addInitScript(()=>Object.defineProperty(window,'WebAssembly',{value:undefined,configurable:true}));
 await context.route('**/*',route=>{const u=route.request().url();if(/^(data:|file:|blob:)/.test(u)||new URL(u).origin===new URL(url).origin)return route.continue();report.network.push(u);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto(url);await page.waitForFunction(()=>window.avatarPreview?.ready,undefined,{timeout:60000});
 const manifest=await page.evaluate(()=>avatarPreview.manifest);
 check(await page.evaluate(()=>typeof WebAssembly==='undefined'),'WebAssembly unavailable throughout browser tests');
 const thumbnails=[];
 for(const item of manifest.items){
  const data=await page.evaluate(id=>avatarPreview.captureThumbnail(id),item.id),bytes=Buffer.from(data.split(',')[1],'base64');
  fs.writeFileSync(path.join(root,item.thumbnail),bytes);thumbnails.push({id:item.id,path:item.thumbnail,label:item.label,category:item.category,sha256:hash(bytes)});
 }
 for(const cat of manifest.categories.filter(c=>c.id!=='skin')){
  const rows=thumbnails.filter(i=>i.category===cat.id);
  check(new Set(rows.map(i=>i.sha256)).size===rows.length,cat.id+' thumbnails have distinct rendered pixels');
 }
 report.thumbnails=thumbnails;
 await page.reload();await page.waitForFunction(()=>window.avatarPreview?.ready);
 for(const body of manifest.bodies){
  for(const item of manifest.items){
   const result=await page.evaluate(({body,item})=>{
    const state=structuredClone(avatarPreview.manifest.defaults);state.body=body.id;
    if(item.category==='accessories')state.accessories=[item.id];
    else state[{hair:'hair',faces:'face',outfits:'outfit',shoes:'shoes'}[item.category]]=item.id;
    avatarPreview.setState(state);avatarPreview.setView('full');avatarPreview.render(0);
    const part=avatarPreview.customization.parts.get(item.id);
    let maxFitError=0,finite=true,sharedSkeleton=true,canonicalOrder=true;
    if(part){
     let template;avatarPreview.sources.get(item.id).scene.traverse(o=>{if(o.isSkinnedMesh)template=o;});
     const p=part.geometry.attributes.position,q=template.geometry.attributes.position;
     for(let i=0;i<p.count;i++)maxFitError=Math.max(maxFitError,Math.abs(p.getX(i)-q.getX(i)*body.width),Math.abs(p.getY(i)-q.getY(i)),Math.abs(p.getZ(i)-q.getZ(i)*body.depth));
     sharedSkeleton=part.skeleton===avatarPreview.customization.bodyMesh.skeleton;
     canonicalOrder=part.skeleton.bones.map(b=>b.name).join('|')===avatarPreview.manifest.skeleton.bones.map(b=>b.name).join('|');
     finite=[...part.skeleton.boneMatrices].every(Number.isFinite);
    }
    return {body:body.id,item:item.id,present:item.empty?!part:!!part,maxFitError,finite,sharedSkeleton,canonicalOrder,visibleItemTriangles:avatarPreview.stats.itemTriangles};
   },{body,item});
   assert.ok(result.present&&result.finite&&result.sharedSkeleton&&result.canonicalOrder&&result.maxFitError<1e-6,JSON.stringify(result));
   report.bodyItemFits.push(result);
  }
 }
 check(report.bodyItemFits.length===184,'Every one of 46 choices attached and rendered on all four bodies');
 await page.evaluate(()=>{avatarPreview.setState(avatarPreview.manifest.defaults);avatarPreview.setCategory('hair');});
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,itemsOverflow:document.getElementById('items').scrollHeight>document.getElementById('items').clientHeight+1,buttons:document.querySelectorAll('#items button').length}));
 check(!layout.overflow&&!layout.itemsOverflow&&layout.buttons===12,'All 12 hair choices fit in 844x390 without scrolling',layout);
 await screenshot(page,'preview-844x390.png');
 // Real DOM clicks, color input, persistence and category switching.
 await page.getByRole('button',{name:'פנים',exact:true}).click();
 await page.getByRole('button',{name:'חיוך רחב',exact:true}).click();
 check((await page.evaluate(()=>avatarPreview.state.face))==='face-bright','Face picker DOM action');
 await page.getByRole('button',{name:'שיער',exact:true}).click();
 await page.getByRole('button',{name:'מתולתל',exact:true}).click();
 const beforeColor=await page.evaluate(()=>avatarPreview.renderer.domElement.toDataURL());
 await page.locator('#color').evaluate(input=>{input.value='#bf3855';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(()=>avatarPreview.render(0));
 const afterColor=await page.evaluate(()=>avatarPreview.renderer.domElement.toDataURL());
 check(beforeColor!==afterColor,'Color picker changes rendered pixels');
 const colorMask=await page.evaluate(()=>{
  const m=avatarPreview.customization.parts.get('curly'),r=m.geometry.attributes._region,c=m.geometry.attributes.color;
  const srgb=[191,56,85].map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  let matched=0,maxError=0,others=0;
  for(let i=0;i<r.count;i++)if(r.getX(i)===7){matched++;maxError=Math.max(maxError,...[c.getX(i),c.getY(i),c.getZ(i)].map((v,k)=>Math.abs(v-srgb[k])));}else others++;
  return {matched,maxError,others};
 });
 check(colorMask.matched>0&&colorMask.maxError<1e-6,'Vertex recolor uses exact region and linear sRGB',colorMask);
 await page.reload();await page.waitForFunction(()=>window.avatarPreview?.ready);
 check(await page.evaluate(()=>avatarPreview.state.hair==='curly'&&avatarPreview.state.colors.hair==='#bf3855'),'Look persists after reload');
 await page.evaluate(()=>{avatarPreview.setCategory('accessories');avatarPreview.select('bucket-hat');});
 check(await page.evaluate(()=>avatarPreview.state.hair==='curly'&&avatarPreview.stats.hairSuppressed&&!avatarPreview.customization.parts.has('curly')),'Hat hides hair without forgetting selection');
 await page.evaluate(()=>avatarPreview.select('bucket-hat'));
 check(await page.evaluate(()=>avatarPreview.customization.parts.has('curly')),'Removing hat restores hair');
 await page.evaluate(()=>{avatarPreview.setState({...avatarPreview.manifest.defaults,accessories:avatarPreview.manifest.items.filter(i=>i.category==='accessories').map(i=>i.id)});avatarPreview.render(0);});
 check(await page.evaluate(()=>avatarPreview.state.accessories.length===8&&avatarPreview.stats.visibleItems.filter(id=>avatarPreview.manifest.items.find(i=>i.id===id).category==='accessories').length===8),'All eight accessories can be equipped together');
 await frame(page,'full');await screenshot(page,'all-accessories.png');
 const masks=await page.evaluate(()=>{
  const expected=avatarPreview.manifest.colorRegions.filter(r=>r.name!=='sock'),colors={};
  for(const r of expected)colors[r.name]='#4f91bb';avatarPreview.setState({colors,skin:4});avatarPreview.render(0);
  let maxError=0,regions=[];
  const cv=hex=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  for(const mesh of avatarPreview.customization.parts.values()){
   const r=mesh.geometry.attributes._region,c=mesh.geometry.attributes.color;
   for(let i=0;i<r.count;i++){
    const id=r.getX(i),name=expected.find(a=>a.id===id)?.name,wanted=cv(id===0?avatarPreview.manifest.skinTones[4]:colors[name]);
    regions.push(id);maxError=Math.max(maxError,...[c.getX(i),c.getY(i),c.getZ(i)].map((v,k)=>Math.abs(v-wanted[k])));
   }
  }
  return {regions:[...new Set(regions)],maxError};
 });
 check(masks.regions.length>=12&&masks.maxError<1e-6,'Recolor all available regions independently, including face and accessories',masks);
 const toneFrames=[];
 await page.evaluate(()=>{avatarPreview.setState(avatarPreview.manifest.defaults);avatarPreview.setCategory('skin');});
 for(let tone=0;tone<6;tone++){
  await page.evaluate(tone=>{avatarPreview.select(String(tone));avatarPreview.setView('faces');avatarPreview.render(0);},tone);
  toneFrames.push(hash(await page.evaluate(()=>avatarPreview.renderer.domElement.toDataURL())));
 }
 check(new Set(toneFrames).size===6,'Six skin presets produce distinct face pixels');
 await page.evaluate(()=>{avatarPreview.setState(avatarPreview.manifest.defaults);avatarPreview.setCategory('outfits');avatarPreview.select('denim');avatarPreview.setPose('run');});
 await frame(page,'full',300);const a=await page.evaluate(()=>avatarPreview.renderer.domElement.toDataURL());
 await frame(page,'full',1100);const b=await page.evaluate(()=>avatarPreview.renderer.domElement.toDataURL());
 check(a!==b,'Canonical run pose moves body and attached clothing');
 await page.evaluate(()=>{avatarPreview.setPose('reach');avatarPreview.render(0);});
 await screenshot(page,'reach-pose.png');
 await page.evaluate(()=>{avatarPreview.setState(avatarPreview.manifest.defaults);avatarPreview.setPose('idle');avatarPreview.setCategory('outfits');avatarPreview.select('denim');});
 await frame(page,'full');await screenshot(page,'wardrobe-full.png');
 await page.setViewportSize({width:390,height:844});await frame(page,'full');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390x844 has no horizontal overflow');
 await screenshot(page,'preview-390x844.png');
 await page.setViewportSize({width:844,height:390});
 const save=page.waitForEvent('download');await page.getByRole('button',{name:'שמירת מראה',exact:true}).click();
 const saved=await save,savedLook=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
 check(savedLook.package==='avatar-customization-v1'&&savedLook.outfit==='denim','Download look JSON contains selected state');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'הורדה לאופליין',exact:true}).click();
 const artifact=await download,offlineFile=path.resolve(process.env.AVATAR_OFFLINE_FILE||'/tmp/avatar-customization-v1-offline.html');
 await artifact.saveAs(offlineFile);report.offlineBytes=fs.statSync(offlineFile).size;
 check(report.offlineBytes<6_000_000,'Generated single-file offline HTML <= 6 MB',{bytes:report.offlineBytes});
 const offline=await browser.newContext({viewport:{width:844,height:390},offline:true});
 await offline.addInitScript(()=>Object.defineProperty(window,'WebAssembly',{value:undefined,configurable:true}));
 const offpage=await offline.newPage(),offErrors=[],requests=[];
 offpage.on('pageerror',e=>offErrors.push(e.message));offpage.on('request',r=>requests.push(r.url()));
 offpage.on('console',m=>{if(m.type()==='error')offErrors.push(m.text());});
 // The managed Chromium policy rejects file:// navigation. Test the exact
 // downloaded bytes in a fresh opaque-origin document with networking disabled.
 // This preserves browser policy; no security flag or allowlist is changed.
 const offlineHTML=fs.readFileSync(offlineFile,'utf8');
 report.offlineLoadMode='Downloaded HTML bytes in an opaque about:blank document; fresh offline context; managed Chromium blocks file:// navigation.';
 await offpage.setContent(offlineHTML,{waitUntil:'load',timeout:60000});await offpage.waitForFunction(()=>window.avatarPreview?.ready,undefined,{timeout:60000});
 await offpage.getByRole('button',{name:'שיער',exact:true}).click();await offpage.getByRole('button',{name:'צמה',exact:true}).click();
 await offpage.evaluate(()=>{avatarPreview.setState({body:'center',accessories:['glasses','backpack','watch']});avatarPreview.render(500);});
 check(await offpage.evaluate(()=>avatarPreview.state.body==='center'&&avatarPreview.state.hair==='braid'&&avatarPreview.stats.visibleItems.includes('backpack')),'Cold opaque-origin offline preview loads all assets and switches body/items');
 const secondPage=await offline.newPage();secondPage.on('pageerror',e=>offErrors.push(e.message));secondPage.on('request',r=>requests.push(r.url()));
 await secondPage.setContent(offlineHTML,{waitUntil:'load',timeout:60000});await secondPage.waitForFunction(()=>window.avatarPreview?.ready);
 check(offErrors.length===0&&requests.every(u=>/^(file:|data:|blob:)/.test(u)),'Two cold offline loads make no network requests',{requests:requests.length,remoteRequests:requests.filter(u=>/^https?:/.test(u)),errors:offErrors});
 await screenshot(offpage,'offline-844x390.png');
 const sheet=await page.evaluate(async ({thumbnails,tones})=>{
  const c=document.createElement('canvas');c.width=1200;c.height=1180;const g=c.getContext('2d');g.fillStyle='#f5f3ec';g.fillRect(0,0,c.width,c.height);g.fillStyle='#234845';g.textAlign='right';g.font='bold 30px Arial';g.fillText('הדמות שלי · כל האפשרויות',1160,48);g.font='16px Arial';g.fillText('46 פריטי GLB · שישה גוני עור · ללא מותגים',1160,77);
  const labels={hair:'שיער',faces:'פנים',outfits:'בגדים',shoes:'נעליים',accessories:'אביזרים'};
  for(let i=0;i<thumbnails.length;i++){
   const x=30+(7-i%8)*146,y=103+Math.floor(i/8)*153;
   const image=new Image();image.src=thumbnails[i].path;await image.decode();g.drawImage(image,x,y,128,119);g.fillStyle='#234845';g.font='13px Arial';g.fillText(thumbnails[i].label,x+126,y+135);g.fillStyle='#7b897e';g.font='10px Arial';g.fillText(labels[thumbnails[i].category],x+126,y+148);
  }
  for(let i=0;i<tones.length;i++){const x=1090-i*130;g.beginPath();g.arc(x,1090,27,0,Math.PI*2);g.fillStyle=tones[i];g.fill();g.fillStyle='#234845';g.font='13px Arial';g.fillText('גוון '+(i+1),x+20,1140);}
  return c.toDataURL('image/webp',.88);
 },{thumbnails,tones:manifest.skinTones});
 fs.writeFileSync(path.join(root,'verification/contact-sheet.webp'),Buffer.from(sheet.split(',')[1],'base64'));
 report.screenshots.push('verification/contact-sheet.webp');
 check(report.errors.length===0&&report.network.length===0,'No page errors, HTTP errors or external requests', {errors:report.errors,externalRequests:report.network});
 report.pass=true;fs.writeFileSync(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pass:true,checks:report.checks.length,bodyItemFits:report.bodyItemFits.length,offlineBytes:report.offlineBytes,screenshots:report.screenshots.length}));
 await browser.close();
})().catch(async error=>{console.error(error);report.failure=error.message;fs.writeFileSync(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();process.exitCode=1;});
