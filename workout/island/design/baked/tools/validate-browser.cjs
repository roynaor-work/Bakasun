// File:// QA with every external request blocked. Requires Playwright.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const rows=[],errors=[],external=[];
 try{
  const context=await browser.newContext({offline:true});
  await context.route(/^https?:/,route=>{external.push(route.request().url());return route.abort()});
  for(const [w,h] of [[390,844],[844,390]]){
   const page=await context.newPage();await page.setViewportSize({width:w,height:h});
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.join(root,'preview.html')).href);
   for(const orientation of ['portrait','landscape']){
    await page.locator(`[data-orientation="${orientation}"]`).click();
    for(const state of ['ao','light']){
     await page.locator(`[data-state="${state}"]`).click();
     await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
     const result=await page.evaluate(()=>({images:[...document.images].map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight})),
       overflow:document.documentElement.scrollWidth>innerWidth,sections:document.querySelectorAll('section').length}));
     assert.equal(result.images.length,12);assert.equal(result.sections,3);assert.equal(result.overflow,false);
     rows.push({viewport:[w,h],orientation,state,images_loaded:result.images.length,horizontal_overflow:result.overflow});
    }
   }
   const range=page.locator('input[type=range]').first();await range.fill('0');
   assert.ok((await page.locator('figure').first().getAttribute('style')).includes('0%'));
   await range.fill('100');assert.ok((await page.locator('figure').first().getAttribute('style')).includes('100%'));
   await range.fill('50');
   await page.locator(`[data-orientation="${w<h?'portrait':'landscape'}"]`).click();
   await page.locator('[data-state="ao"]').click();
   await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
   const dir=process.argv[2];if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,`preview-${w}x${h}.png`),fullPage:true});}
   await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(root,'browser-validation.json'),JSON.stringify({status:'PASS',scheme:'file:',offline:true,external_requests:external,page_errors:errors,cases:rows,slider_endpoints:'PASS'},null,2)+'\n');
  process.stdout.write(JSON.stringify({status:'PASS',cases:rows.length,external_requests:external.length})+'\n');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
