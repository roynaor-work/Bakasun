const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try {
    const page = await browser.newPage();
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'mix.json'),'utf8'));
    const rows=[];
    for(const [id,asset] of Object.entries(manifest.assets)){
      const result = await page.evaluate(async ({b64,loop})=>{
        const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
        const ctx=new OfflineAudioContext(1,1,48000);
        const buffer=await ctx.decodeAudioData(bytes.buffer);
        const pcm=buffer.getChannelData(0);
        const result={channels:buffer.numberOfChannels,sample_rate_hz:buffer.sampleRate,frames:buffer.length,duration_seconds:buffer.duration};
        if(loop){
          const offline=new OfflineAudioContext(1,buffer.length*2+4800,48000);
          const src=offline.createBufferSource();src.buffer=buffer;src.loop=true;src.loopStart=0;src.loopEnd=buffer.duration;src.connect(offline.destination);src.start(0);
          const output=(await offline.startRendering()).getChannelData(0);
          let maxError=0;
          for(let i=0;i<4800;i++)maxError=Math.max(maxError,Math.abs(output[buffer.length+i]-pcm[i]));
          result.repeat_max_sample_error=maxError;
          result.seam_jump_dbfs=20*Math.log10(Math.max(1e-12,Math.abs(output[buffer.length]-output[buffer.length-1])));
        }
        return result;
      },{b64:fs.readFileSync(path.join(root,asset.file)).toString('base64'),loop:asset.loop});
      assert.equal(result.channels,1,id);assert.equal(result.frames,Math.round(asset.duration_seconds*48000),id);
      if(asset.loop){assert.ok(result.repeat_max_sample_error<1e-6,id);assert.ok(result.seam_jump_dbfs<=-65,id);}
      rows.push({id,...result});
    }
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://island.test/**',async route=>{
      const file=decodeURIComponent(new URL(route.request().url()).pathname).slice(1)||'preview.html';
      assert.ok(!file.includes('..'));
      const mime=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.ogg')?'audio/ogg':'application/json';
      await route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:mime});
    });
    await page.goto('http://island.test/preview.html');
    assert.equal(await page.locator('audio').count(),28);
    assert.equal(await page.locator('.loop').count(),3);
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('.loop').first().click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('הלולאה חוזרת'));
    await page.locator('#stop').click();
    assert.ok(await page.locator('.loop').first().isEnabled());
    assert.deepEqual(errors,[]);
    const report={status:'PASS',browser:await browser.version(),asset_count:rows.length,decode:'Chrome OfflineAudioContext, 48 kHz mono',loop_test:'AudioBufferSourceNode.loop rendered for more than two full repeats; exact sample comparison at first repeat',preview:{audio_controls:28,loop_buttons:3,viewports:['390x844','844x390'],overflow:false,start_stop:'PASS',page_errors:errors},assets:rows};
    fs.writeFileSync(path.join(root,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,browser:report.browser,decoded:rows.length,loops:rows.filter(r=>r.seam_jump_dbfs!==undefined)}));
  } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
