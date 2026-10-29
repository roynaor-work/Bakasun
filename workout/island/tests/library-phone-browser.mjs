import assert from 'node:assert/strict';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

// Regular route, as on the phone: no dev flag and no bypassed conditions.
// Every library card must be on screen without scrolling, and the newest game opens from its card.
const server=await serveIsland(),chromium=await islandChromium(),out=process.env.LIBRARY_QA_DIR;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try{
  for(const [width,height] of [[844,390],[740,360],[915,412],[390,844],[360,780]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.url,{waitUntil:'networkidle'});
    await page.locator('[data-action=avatar-start]').click();
    await page.locator('[data-action=quick-games]').click();
    await page.waitForSelector('.modal[data-game-library] .adventure-game-card');
    await page.waitForTimeout(500);
    const library=await page.evaluate(()=>{const m=document.querySelector('.modal[data-game-library]'),box=m.getBoundingClientRect();
      return {overflow:m.scrollHeight-m.clientHeight,cards:[...m.querySelectorAll('.adventure-game-card')].map(c=>{const r=c.getBoundingClientRect();return {id:c.dataset.game,isNew:c.dataset.new==='true',inside:r.top>=box.top-1&&r.bottom<=box.bottom+1&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1};})};});
    if(out)await page.screenshot({path:`${out}/library-${width}x${height}.png`});
    assert.ok(library.overflow<=1,`${width}x${height}: library scrolls by ${library.overflow}px`);
    assert.ok(library.cards.length>=9);
    assert.deepEqual(library.cards.filter(c=>!c.inside).map(c=>c.id),[],`${width}x${height}: cards off screen`);
    assert.equal(library.cards[0].id,'boarDefense');assert.equal(library.cards[0].isNew,true);
    await page.locator('[data-action=game-enter][data-game-id=boarDefense]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.src.includes('/boar-island/index.html')));
    assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: all ${library.cards.length} games on one screen, boar first and opens: ok`);
    await context.close();
  }
}finally{await browser.close();await server.close();}
