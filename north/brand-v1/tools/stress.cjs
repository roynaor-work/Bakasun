/* UI boundary cases: long unbroken greeting, modal overflow, menu resize and empty gallery. */
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const B=require('./browser.cjs'),brand=path.resolve(__dirname,'..');
const round=process.argv[2];if(!/^\d{2}$/.test(round||''))throw Error('Round number required');
const target=path.join(brand,'iterations',round);fs.mkdirSync(target,{recursive:true});
const result={started:new Date().toISOString(),checks:[],screenshots:[]};
const check=(name,pass,detail={})=>result.checks.push({name,pass,...detail});
async function shot(page,name){let q=82,buf;const png=await page.screenshot({animations:'disabled'});do{buf=await sharp(png).webp({quality:q,effort:6}).toBuffer();q-=4;}while(buf.length>195000&&q>=48);fs.writeFileSync(path.join(target,name),buf);result.screenshots.push({file:name,bytes:buf.length});}
(async()=>{
  const browser=await B.launch();try{
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      const {ctx}=await B.context(browser,viewport),page=await B.open(ctx,'builder');
      await page.locator('[data-base="b-gin"]').click();await page.locator('#builder-next').click();
      for(const id of ['a-rocks','a-flask','a-shaker','a-honey','a-candle'])await page.locator(`[data-addon="${id}"]`).click();
      await page.locator('#builder-next').click();await page.locator('[data-pack="p-black"]').click();await page.locator('#greeting').fill('ש'.repeat(180));await page.locator('#builder-finish').click();
      const boxes=await page.locator('#cart-dialog,.cart-body,.cart-item,.cart-item>div').evaluateAll(es=>es.map(e=>({selector:e.id||e.className,width:e.clientWidth,scrollWidth:e.scrollWidth,overflow:e.scrollWidth>e.clientWidth+1})));
      check('long greeting has no horizontal modal overflow '+viewport.width,boxes.every(b=>!b.overflow),{boxes});
      await shot(page,`stress-cart-${viewport.width}x${viewport.height}.webp`);
      await page.keyboard.press('Escape');await page.close();await ctx.close();
    }
    const {ctx}=await B.context(browser),page=await B.open(ctx,'home');await page.locator('[data-menu]').click();check('menu expanded',await page.locator('[data-menu]').getAttribute('aria-expanded')==='true');await page.setViewportSize({width:1280,height:900});await page.locator('#mobile-menu').waitFor({state:'hidden'});check('menu closes at desktop breakpoint',await page.locator('#mobile-menu').isHidden());await page.close();
    const gallery=await B.open(ctx,'index');await gallery.locator('#photo-search').fill('zz-no-result');check('empty gallery state is visible',(await gallery.locator('#photo-grid').textContent()).includes('לא נמצאו'));check('empty gallery has clear control',await gallery.locator('[data-reset-photos]').isVisible().catch(()=>false));await gallery.locator('[data-reset-photos]').click();check('empty state reset restores all 72',await gallery.locator('.photo-card').count()===72);check('reset restores search focus',await gallery.locator('#photo-search').evaluate(e=>document.activeElement===e));for(const key of ['sticker','greeting','bag','wrapping']){await gallery.locator('[data-open-mockup="'+key+'-mockup"]').click();await gallery.locator('#asset-image').evaluate(i=>i.decode());check('mockup '+key+' opens local full image',await gallery.locator('#asset-image').evaluate(i=>i.naturalWidth===1000));await gallery.keyboard.press('Escape');}await gallery.close();await ctx.close();
  }finally{await browser.close();}
  result.finished=new Date().toISOString();result.passed=result.checks.every(c=>c.pass);fs.writeFileSync(path.join(target,'stress-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1)});
