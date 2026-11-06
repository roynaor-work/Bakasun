import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { launch } from '../source/browser.mjs';
import { root, serve } from '../source/server.mjs';
import { inspectLayout } from '../source/inspect.mjs';
import { inspectCopy, copyErrors } from '../source/privacy.mjs';

const docs = JSON.parse(await readFile(path.join(root,'templates.json')));
const dictionary = JSON.parse(await readFile(path.join(root,'fields.json')));
const baseline = JSON.parse(await readFile(path.join(root,'copy-allowlist.json')));
const finalRound=(await readdir(path.join(root,'iterations'))).filter(x=>/^\d{2}$/.test(x)).sort().at(-1);
const provenance=JSON.parse(await readFile(path.join(root,'iterations',finalRound,'render.json')));
let browser, server, temp;
before(async () => { server = await serve(); browser = await launch(); temp = await mkdtemp(path.join(os.tmpdir(),'bakasun-docs-')); });
after(async () => { await browser?.close(); await server?.close(); if (temp) await rm(temp,{ recursive:true }); });

function checkPDF(file, expectedPages) {
  const info = execFileSync('/usr/bin/pdfinfo',[file],{encoding:'utf8'});
  assert.equal(Number(info.match(/Pages:\s+(\d+)/)?.[1]),expectedPages,'Unexpected printed page count');
  const dimensions = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  assert.ok(dimensions,'Missing PDF dimensions');
  assert.ok(Math.abs(Number(dimensions[1])-595.276)<1 && Math.abs(Number(dimensions[2])-841.89)<1,'PDF must be portrait A4');
  const fonts = execFileSync('/usr/bin/pdffonts',[file],{encoding:'utf8'}).trim().split('\n').slice(2);
  assert.ok(fonts.length && fonts.some(f=>/NotoSansHebrew/.test(f)),'Hebrew font missing');
  assert.ok(fonts.every(f=>/\s+yes\s+yes\s+yes\s+\d+\s+\d+\s*$/.test(f)),'All PDF fonts must be embedded with Unicode mappings');
  const text = execFileSync('/usr/bin/pdftotext',['-layout',file,'-'],{encoding:'utf8'});
  assert.ok(/[א-ת]/.test(text),'PDF needs selectable Hebrew text');
  assert.ok(!/(?:\d[\s()+.\/-]*){7,}/u.test(text),'PDF contains a long identifier');
  if (file.includes('invoice-draft')) assert.ok(/טיוטה|הטויט/u.test(text),'PDF draft warning missing');
}

for (const doc of docs) {
  test(`${doc.id}: loads, placeholder-only, RTL, embedded fonts and A4 print`,async () => {
    const context = await browser.newContext({ viewport:{width:1000,height:1200} });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
    page.on('requestfailed',r=>errors.push(r.url()));
    await context.route('**/*',route=>route.request().url().startsWith(server.url) || !/^https?:/.test(route.request().url()) ? route.continue() : (errors.push('External request'),route.abort()));
    try {
      await page.emulateMedia({media:'print'});
      const response = await page.goto(`${server.url}/${doc.id}.html`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      await page.evaluate(()=>document.fonts.ready);
      assert.deepEqual(errors,[]);
      assert.equal(await page.getAttribute('html','lang'),'he');
      assert.equal(await page.getAttribute('html','dir'),'rtl');
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.locator('script,input,textarea,[contenteditable],iframe').count(),0);
      const copy = await page.evaluate(inspectCopy);
      assert.deepEqual(copyErrors(copy,dictionary,baseline[doc.id]),[]);
      assert.equal(await page.locator('bdi[data-field]').count(),copy.fields.length);
      const layout = await page.evaluate(inspectLayout);
      assert.ok(layout.fontLoaded);
      assert.equal(layout.sheets.length,doc.pages);
      for(const sheet of layout.sheets){
        assert.ok(Math.abs(sheet.width-793.7)<1);
        assert.ok(Math.abs(sheet.height-1122.52)<1,'Sheet exceeds one A4');
        assert.equal(sheet.direction,'rtl');
        assert.ok(sheet.footerGap>=-1,'Footer overlaps body');
        assert.ok(sheet.contentGap>=8,'Body content is too close to footer');
        assert.deepEqual(sheet.escapes,[]);
      }
      const tableDirections = await page.locator('tr').evaluateAll(rows=>rows.every(row=>{const cells=[...row.cells];return cells.length<2 || cells[0].getBoundingClientRect().right>cells[1].getBoundingClientRect().right;}));
      assert.ok(tableDirections,'First column must start on the right');
      if(doc.id==='invoice-draft'){
        assert.ok(await page.locator('.draft-banner').isVisible());
        assert.match(await page.locator('.page-footer').innerText(),/טיוטה בלבד/);
      }
      const pdf = path.join(temp,doc.id+'.pdf');
      await page.pdf({path:pdf,preferCSSPageSize:true,printBackground:true,tagged:true});
      checkPDF(pdf,doc.pages);
      checkPDF(path.join(root,'pdf',doc.id+'.pdf'),doc.pages);
      const captured=provenance.results.find(r=>r.id===doc.id);
      const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha(await readFile(path.join(root,doc.id+'.html'))),captured.htmlSHA256,'Stale HTML capture');
      assert.equal(sha(await readFile(path.join(root,'assets/documents.css'))),provenance.cssSHA256,'Stale CSS capture');
      assert.equal(sha(await readFile(path.join(root,'pdf',doc.id+'.pdf'))),captured.pdfSHA256,'Final PDF differs from reviewed render');
      const uncolored=path.join(temp,doc.id+'-no-backgrounds.pdf');
      await page.pdf({path:uncolored,preferCSSPageSize:true,printBackground:false,tagged:true});
      checkPDF(uncolored,doc.pages);
      // This managed Chromium blocks file:// URLs. Fulfill local assets from disk
      // with networking and JavaScript disabled to verify offline dependencies.
      const offlineContext=await browser.newContext({offline:true,javaScriptEnabled:false});
      try{
        await offlineContext.route('**/*',async route=>{
          const u=new URL(route.request().url());
          const relative=u.pathname.slice(1);
          assert.ok(u.origin===server.url && !relative.includes('..'),'Unexpected offline dependency');
          const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css','.ttf':'font/ttf'};
          await route.fulfill({body:await readFile(path.join(root,relative)),contentType:contentTypes[path.extname(relative)]});
        });
        const offline=await offlineContext.newPage();
        await offline.goto(`${server.url}/${doc.id}.html`);
        await offline.evaluate(()=>document.fonts.ready);
        assert.equal(await offline.locator('.sheet').count(),doc.pages);
        assert.ok(await offline.evaluate(()=>document.fonts.check('12px "Event Hebrew"')));
      }finally{await offlineContext.close();}
    } finally {await context.close();}
  });
}

test('privacy guards reject filled names, added fixed copy, identifiers and bank details',async () => {
  const page = await browser.newPage();
  try{
    await page.goto(`${server.url}/quote.html`);
    const copy = await page.evaluate(inspectCopy);
    for(const injected of ['שם פרטי ושם משפחה','person@example.invalid',Array(3).fill('0'.repeat(3)).join('-'),'IL'+'0'.repeat(24)]){
      const mutated=structuredClone(copy); mutated.fields[0].text=injected; mutated.text+=' '+injected;
      assert.ok(copyErrors(mutated,dictionary,baseline.quote).length,`Failed to reject ${injected}`);
    }
    const added=structuredClone(copy); added.fixed.push('מידע נוסף שלא אושר');
    assert.ok(copyErrors(added,dictionary,baseline.quote).includes('Unreviewed fixed copy'));
  }finally{await page.close();}
});

test('package budget and iteration retention',async () => {
  let bytes=0;
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else bytes+=(await stat(p)).size;}}
  await walk(root);
  assert.ok(bytes<=60_000_000,`Package exceeds 60 MB: ${bytes}`);
  const rounds=(await readdir(path.join(root,'iterations'))).filter(x=>/^\d{2}$/.test(x)).sort();
  assert.equal(rounds.length,2);
  assert.equal(Number(rounds[1])-Number(rounds[0]),1);
  assert.ok(Number(rounds[1])>=5,'At least five render rounds required');
});

test('mixed Hebrew/Latin values and long tokens wrap within table cells',async()=>{
  const page=await browser.newPage();
  try{
    await page.emulateMedia({media:'print'});
    await page.goto(`${server.url}/quote.html`);
    await page.evaluate(()=>document.fonts.ready);
    // Synthetic strings exist only in memory and are never captured into assets.
    await page.locator('[data-field="line_1_description"]').evaluate(el=>{el.textContent='אבג ABC (אבג) '+ 'ABC'.repeat(18);});
    await page.locator('[data-field="line_1_amount"]').evaluate(el=>{el.textContent='₪ 1,234.50';});
    const layout=await page.evaluate(inspectLayout);
    assert.deepEqual(layout.sheets[0].escapes,[]);
    assert.ok(layout.sheets[0].height<=1123,'Mixed text breaks A4');
    assert.equal(await page.locator('[data-field="line_1_amount"]').getAttribute('dir'),'ltr');
  }finally{await page.close();}
});

test('gallery links and PDF previews load without errors',async()=>{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  try{
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:1000});
      await page.goto(server.url,{waitUntil:'networkidle'});
      assert.equal(await page.locator('.preview-card').count(),6);
      assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
