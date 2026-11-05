/* Offline browser harness. It reads only the two new delivery directories. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const origin='http://127.0.0.1:8765';
async function launch(){return chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});}
async function context(browser,viewport={width:390,height:844},extra={}){
  const logs={external:[],responses:[],pageErrors:[]};
  const ctx=await browser.newContext({viewport,deviceScaleFactor:1,offline:true,reducedMotion:'reduce',locale:'he-IL',...extra});
  ctx.on('page',p=>p.on('pageerror',e=>logs.pageErrors.push(e.message)));
  ctx.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!/^(data:|about:)/.test(r.url()))logs.external.push(r.url());});
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin!==origin)return route.abort('blockedbyclient');
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!['north/brand-v1/','north/img/v4/'].some(p=>file.startsWith(path.join(root,p))))return route.fulfill({status:403,body:'Outside preview directories'});
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){logs.responses.push({url:u.pathname,status:404});return route.fulfill({status:404,body:'Missing local asset'});}
    const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
    logs.responses.push({url:u.pathname,status:200,bytes:fs.statSync(file).size});
    return route.fulfill({status:200,path:file,contentType:mime});
  });
  return {ctx,logs};
}
async function open(ctx,name,hash=''){const page=await ctx.newPage();await page.goto(origin+'/north/brand-v1/'+name+'.html'+hash,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);return page;}
module.exports={root,origin,launch,context,open};
