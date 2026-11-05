import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=await fs.readFile(path.join(root,'review.html'),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],requests=[],checks=[];
const context=await browser.newContext({viewport:{width:1280,height:900},offline:true});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const check=(label,pass,details)=>checks.push({label,pass:!!pass,details});
try{
  await page.setContent(html,{waitUntil:'load'});
  const initial=await page.evaluate(()=>({title:document.title,count:document.querySelector('#right').options.length,selected:document.querySelector('#right').selectedOptions[0].textContent,body:document.querySelector('#text-b').textContent}));
  check('All ten actual reviews available',initial.count===10&&initial.selected.includes('10')&&initial.body.includes('1.5'),initial);
  await page.locator('#left').selectOption('2');
  await page.locator('#right').selectOption('9');
  await page.locator('#wipe').evaluate(e=>{e.value='72';e.dispatchEvent(new Event('input',{bubbles:true}));});
  const state=await page.evaluate(()=>({clip:document.querySelector('#top').style.clipPath,seam:document.querySelector('#seam').style.left,a:document.querySelector('#pill-a').textContent,b:document.querySelector('#pill-b').textContent,aX:document.querySelector('#pill-a').getBoundingClientRect().x,bX:document.querySelector('#pill-b').getBoundingClientRect().x,review:document.querySelector('#review-b').getAttribute('href')}));
  check('Comparison controls and RTL labels agree',state.clip==='inset(0px 28% 0px 0px)'&&state.seam==='72%'&&state.a.includes('03')&&state.b.includes('10')&&state.aX>state.bX&&state.review==='iterations/10/REVIEW.md',state);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(root,'verification/review-page-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,selectors:[...document.querySelectorAll('select')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),links:[...document.querySelectorAll('.links a')].map(e=>e.getBoundingClientRect().height)}));
  check('Mobile has no horizontal overflow and 44px controls',mobile.scrollWidth<=mobile.width&&mobile.selectors.every(e=>e.height>=44)&&mobile.links.every(h=>h>=44),mobile);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(root,'verification/review-page-mobile.png')});
  check('Review page stays offline without script errors',errors.length===0&&requests.length===0,{errors,requests});
}finally{await browser.close();}
const report={at:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),offline:true,pass:checks.every(x=>x.pass),checks,errors,externalRequests:requests};
await fs.writeFile(path.join(root,'verification/review-page-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
