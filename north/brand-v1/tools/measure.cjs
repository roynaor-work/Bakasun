/* Measures scrolling under CPU throttling and rendered text/background contrast. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const B=require('./browser.cjs'),brand=path.resolve(__dirname,'..');
const output=process.argv[2]||'verification';if(!/^(verification|iterations\/\d{2})$/.test(output))throw Error('Invalid output folder');
const mobile=process.argv.includes('--mobile'),dpr=mobile?2:1;
const result={started:new Date().toISOString(),method:{cpuThrottle:4,scrollDurationMs:3000,viewportDpr:dpr,mobileEmulation:mobile,network:'offline; local file fulfillment',fps:'requestAnimationFrame intervals while the harness scrolls a fully local static page; this is desktop CPU-throttled evidence, not a physical-phone benchmark',contrast:'All visible text is made transparent for a second render. Every second background pixel in each original text run rectangle is compared with its original computed foreground color; elementFromPoint excludes text pixels occluded by sticky or overlapping elements. This is a conservative rectangle test; photo backgrounds flagged by it require visual review.'},performance:[],contrast:[],sourceHashes:{}};
for(const name of ['tokens.css','site.css','site.js','preview.css','preview.js','assets.js'])result.sourceHashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(brand,name))).digest('hex');
const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
async function contrast(page,label){
  const runs=await page.evaluate(()=>{
    const runs=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walk.nextNode()){
      const n=walk.currentNode,el=n.parentElement;if(!n.textContent.trim()||!el||el.closest('script,style,noscript,svg,[hidden],[aria-hidden="true"]'))continue;
      const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0)continue;
      const range=document.createRange();range.selectNodeContents(n);const color=cs.color.match(/[\d.]+/g)?.map(Number)||[];if(color.length<3||color[3]===0)continue;
      for(const r of range.getClientRects())if(r.width>2&&r.height>2&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight){
        const rect={left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)},points=[];
        for(let y=Math.ceil(rect.top);y<Math.floor(rect.bottom);y+=2)for(let x=Math.ceil(rect.left);x<Math.floor(rect.right);x+=2){const hit=document.elementFromPoint(x,y);if(hit&&(hit===el||el.contains(hit)))points.push([x,y]);}
        if(points.length)runs.push({text:n.textContent.trim().slice(0,100),tag:el.tagName,className:el.className,color:color.slice(0,3),fontSize:parseFloat(cs.fontSize),fontWeight:parseInt(cs.fontWeight)||400,rect,points});
      }
    }return runs;
  });
  const style=await page.addStyleTag({content:'*,*::before,*::after{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important}'});
  const png=await page.screenshot({animations:'disabled'});await style.evaluate(e=>e.remove());
  const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const sampled=runs.map(r=>{
    let min=21,maxBackgroundLum=0,samples=0;
    for(const [x,y]of r.points){const i=(Math.round(y*dpr)*info.width+Math.round(x*dpr))*info.channels,bg=[data[i],data[i+1],data[i+2]];min=Math.min(min,ratio(r.color,bg));maxBackgroundLum=Math.max(maxBackgroundLum,lum(bg));samples++;}
    const threshold=r.fontSize>=24||r.fontSize>=18.66&&r.fontWeight>=700?3:4.5;
    const {points,...metadata}=r;return {...metadata,minimumRatio:+min.toFixed(3),threshold,pass:min+.01>=threshold,samples};
  });
  return {view:label,runs:sampled.length,failures:sampled.filter(r=>!r.pass),minimumRatio:sampled.length?Math.min(...sampled.map(r=>r.minimumRatio)):null,measurements:sampled};
}
(async()=>{
  const browser=await B.launch();try{
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      for(const name of ['home','product','builder','index']){
        const {ctx,logs}=await B.context(browser,viewport,mobile?{deviceScaleFactor:2,isMobile:true,hasTouch:true}:{}),page=await B.open(ctx,name),cdp=await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await page.evaluate(()=>Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;}).map(i=>i.decode().catch(()=>{}))));
        const frames=await page.evaluate(async()=>{
          const frames=[],start=performance.now();let previous;
          await new Promise(resolve=>{const tick=t=>{if(previous!==undefined)frames.push(t-previous);previous=t;const maximum=document.documentElement.scrollHeight-innerHeight;scrollTo({top:Math.max(0,maximum)*Math.min(1,(t-start)/3000),behavior:'instant'});if(t-start<3000)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
          const sorted=frames.slice().sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
          return {frames:frames.length,elapsedMs:performance.now()-start,meanFrameMs:frames.reduce((s,v)=>s+v,0)/frames.length,medianFrameMs:percentile(.5),p95FrameMs:percentile(.95),p99FrameMs:percentile(.99),over33ms:frames.filter(x=>x>33.4).length,maxFrameMs:Math.max(...frames)};
        });
        result.performance.push({page:name,viewport,...frames,estimatedAverageFps:+(1000/frames.meanFrameMs).toFixed(1),aboveThirtyFps:1000/frames.meanFrameMs>=30,rawRequestedBytes:logs.responses.filter(r=>r.status===200).reduce((s,r)=>s+(r.bytes||0),0),externalRequests:logs.external.length});
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
        result.contrast.push(await contrast(page,`${name} ${viewport.width}x${viewport.height} opening`));
        if(name==='home'){await page.locator('#catalog').scrollIntoViewIfNeeded();result.contrast.push(await contrast(page,`${name} ${viewport.width}x${viewport.height} catalog`));}
        if(name==='builder'){await page.locator('[data-base="b-red"]').click();await page.locator('#builder-next').click();await page.locator('#builder-next').click();await page.locator('[data-pack="p-black"]').click();await page.locator('#greeting').fill('לרגעים הקטנים שבדרך.');await page.locator('.greeting-preview').scrollIntoViewIfNeeded();result.contrast.push(await contrast(page,`${name} ${viewport.width}x${viewport.height} greeting`));}
        await ctx.close();
      }
    }
  }finally{await browser.close();}
  result.finished=new Date().toISOString();result.summary={performanceScenarios:result.performance.length,allAverageFpsAtLeast30:result.performance.every(p=>p.aboveThirtyFps),contrastViews:result.contrast.length,contrastTextRuns:result.contrast.reduce((s,c)=>s+c.runs,0),contrastFlags:result.contrast.reduce((s,c)=>s+c.failures.length,0)};
  const target=path.join(brand,output);fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,mobile?'mobile-measurements.json':'measurements.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary:result.summary,performance:result.performance.map(p=>({page:p.page,width:p.viewport.width,fps:p.estimatedAverageFps,p95:p.p95FrameMs})),contrastFlags:result.contrast.filter(c=>c.failures.length).map(c=>({view:c.view,failures:c.failures.map(f=>({text:f.text,ratio:f.minimumRatio,threshold:f.threshold}))}))}));
})().catch(e=>{console.error(e);process.exit(1)});
