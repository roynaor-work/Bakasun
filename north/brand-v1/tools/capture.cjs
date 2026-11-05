/* Deterministic visual evidence, not a runtime dependency. Requires Playwright and sharp. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright'),sharp=require('sharp');
const brand=path.resolve(__dirname,'..');
const round=process.argv[2];if(!/^\d{2}$/.test(round||''))throw Error('Supply a two-digit round number');
const target=path.join(brand,'iterations',round);if(fs.existsSync(path.join(target,'checks.json')))throw Error('Round already captured; evidence must not be overwritten');
fs.mkdirSync(target,{recursive:true});
const requestedPages=(process.argv[3]||'home,product,builder,index').split(',');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function shot(page,file){const png=await page.screenshot({animations:'disabled'});let q=84,b;do{b=await sharp(png).webp({quality:q,effort:6}).toBuffer();q-=4;}while(b.length>195000&&q>=48);fs.writeFileSync(path.join(target,file),b);return{file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const checks={round,started:new Date().toISOString(),mode:'offline Chromium; local files fulfilled directly by the capture harness at a loopback origin, without a web server or network requests',fileSchemeNote:'The managed Chromium URL policy blocks file:// navigation. No browser policy is modified.',viewports:[{width:390,height:844},{width:844,height:390}],screenshots:[],pages:[],sourceHashes:{}};
  for(const file of ['tokens.css','site.css','site.js','preview.css','preview.js','catalog.js','assets.js','home.html','product.html','builder.html','index.html'])if(fs.existsSync(path.join(brand,file)))checks.sourceHashes[file]=digest(path.join(brand,file));
  for(const viewport of checks.viewports){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,offline:true,reducedMotion:'reduce',locale:'he-IL'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://127.0.0.1:8765')return route.abort('blockedbyclient');
      const file=path.resolve(path.join(brand,'../..'),'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(brand+path.sep)&&!file.startsWith(path.resolve(brand,'../img/v4')+path.sep))return route.fulfill({status:403,body:'Outside preview directories'});
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not yet generated'});
      const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
      return route.fulfill({status:200,path:file,contentType:mime});
    });
    for(const name of requestedPages){
      const page=await context.newPage(),errors=[],external=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:8765\/|data:|about:)/.test(r.url()))external.push(r.url());});
      page.on('requestfailed',r=>failed.push({url:r.url().replace('file://'+path.dirname(brand)+'/',''),error:r.failure()?.errorText}));
      page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
      await page.goto('http://127.0.0.1:8765/north/brand-v1/'+name+'.html',{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(120);
      const axis=viewport.width===390?'portrait':'landscape';
      checks.screenshots.push(await shot(page,`${name}-${axis}-far.webp`));
      if(name==='home'){await page.locator('#catalog').scrollIntoViewIfNeeded();}
      if(name==='product'){await page.locator('[data-open-product-image]').click();if(+round>=4){await page.locator('[data-lightbox-native]').click();await page.locator('.lightbox-body').evaluate(e=>{e.scrollLeft=-(e.scrollWidth-e.clientWidth)/2;e.scrollTop=210;});}}
      if(name==='builder'){
        await page.locator('[data-base="b-red"]').click();await page.locator('#builder-next').click();
        await page.locator('[data-addon="a-candle"]').click();await page.locator('[data-addon="a-honey"]').click();await page.locator('#builder-next').click();
        await page.locator('[data-pack="p-black"]').click();await page.locator('#greeting').fill('לרגעים הקטנים שבדרך.');await page.locator('.greeting-preview').scrollIntoViewIfNeeded();
      }
      if(name==='index'){const opener=page.locator('[data-open-asset]').first();if(await opener.count()){await opener.click();if(+round>=4){await page.locator('#asset-native').click();await page.locator('#asset-image-wrap').evaluate(e=>{e.scrollLeft=-(e.scrollWidth-e.clientWidth)/2;e.scrollTop=210;});}}else await page.locator('#logo-stage').scrollIntoViewIfNeeded();}
      await page.waitForTimeout(100);
      checks.screenshots.push(await shot(page,`${name}-${axis}-near.webp`));
      if(+round>=5&&name==='index'){
        await page.keyboard.press('Escape');
        await page.locator('#photo-product').selectOption('single-malt');
        await page.locator('#photography').scrollIntoViewIfNeeded();
        checks.screenshots.push(await shot(page,`${name}-${axis}-gallery.webp`));
        await page.locator('#banner-grid .banner-card').first().scrollIntoViewIfNeeded();
        checks.screenshots.push(await shot(page,`${name}-${axis}-banners.webp`));
        await page.locator('.package-card').nth(2).scrollIntoViewIfNeeded();
        checks.screenshots.push(await shot(page,`${name}-${axis}-mockup.webp`));
      }
      if(+round>=5&&name==='home'){
        await page.locator('.build-feature').scrollIntoViewIfNeeded();
        checks.screenshots.push(await shot(page,`${name}-${axis}-builder-feature.webp`));
      }
      const state=await page.evaluate(()=>({title:document.title,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),brokenVisibleImages:[...document.images].filter(i=>{const b=i.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight&&b.width>0&&!i.naturalWidth;}).map(i=>i.getAttribute('src'))}));
      checks.pages.push({page:name,viewport,...state,errors,externalRequests:external,failedRequests:failed});await page.close();
    }
    await context.close();
  }
  checks.finished=new Date().toISOString();checks.passed=checks.pages.every(p=>!p.horizontalOverflow&&!p.errors.length&&!p.externalRequests.length&&!p.brokenVisibleImages.length&&!p.failedRequests.length);
  fs.writeFileSync(path.join(target,'checks.json'),JSON.stringify(checks,null,2)+'\n');await browser.close();
  console.log(JSON.stringify({round,passed:checks.passed,screenshots:checks.screenshots.length,issues:checks.pages.filter(p=>p.horizontalOverflow||p.errors.length||p.externalRequests.length||p.brokenVisibleImages.length||p.failedRequests.length)}));
})().catch(e=>{console.error(e);process.exit(1)});
