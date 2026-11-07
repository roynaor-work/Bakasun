import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {clipBlocker,startBootSplash,SPLASH_DELAY_MS} from '../workout/island/ui/boot-splash.mjs';

const root=new URL('../workout/island/',import.meta.url);
/** Minimal DOM: just what the splash touches. */
function fakeDoc({hidden=false}={}){
  const mk=tag=>{const e={tag,children:[],attrs:{},dataset:{},style:{},className:'',removed:false,
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k];},
    append(...c){this.children.push(...c);},prepend(...c){this.children.unshift(...c);},remove(){this.removed=true;},
    querySelectorAll(sel){return sel==='source'?this.children.filter(c=>c.tag==='source'):[];},
    querySelector(sel){return sel==='[data-boot-text]'?this.textNode:null;},
    addEventListener(t,f){(this.ev??={})[t]=f;},pause(){this.paused=true;},load(){this.loads=(this.loads||0)+1;},play(){this.played=true;return Promise.resolve();}};return e;};
  const splash=mk('div'),root=mk('main');splash.textNode=mk('span');
  return {hidden,splash,root,createElement:mk,querySelector:sel=>sel==='[data-boot-splash]'?splash:sel==='#interface'?root:null};
}
function fakeWin({reduced=false,connection,search=''}={}){
  const timers=new Map();let n=0;
  return {location:{search},navigator:{connection},matchMedia:()=>({matches:reduced}),
    setTimeout(f,ms){timers.set(++n,{f,ms});return n;},clearTimeout(id){timers.delete(id);},
    fire(ms){for(const [id,t] of [...timers])if(t.ms<=ms){timers.delete(id);t.f();}},timers};
}
const src=[['x.mp4','video/mp4']];

test('clipBlocker: reduced motion, save data, 2g and the off flag all keep the clip away',()=>{
  assert.equal(clipBlocker({win:fakeWin()}),'');
  assert.equal(clipBlocker({win:fakeWin({reduced:true})}),'reduced-motion');
  assert.equal(clipBlocker({win:fakeWin({connection:{saveData:true}})}),'save-data');
  assert.equal(clipBlocker({win:fakeWin({connection:{effectiveType:'2g'}})}),'slow-network');
  assert.equal(clipBlocker({win:fakeWin({connection:{effectiveType:'slow-2g'}})}),'slow-network');
  assert.equal(clipBlocker({win:fakeWin({connection:{effectiveType:'4g'}})}),'');
  assert.equal(clipBlocker({win:fakeWin({search:'?bootVideo=0'})}),'flag');
  assert.equal(clipBlocker({win:fakeWin({reduced:true,search:'?bootVideo=1'})}),'');
});

test('splash: nothing is requested before the delay, and a fast load never requests the clip',()=>{
  const doc=fakeDoc(),win=fakeWin(),s=startBootSplash({doc,win,sources:src});
  assert.equal(doc.splash.children.some(c=>c.tag==='video'),false,'no video element at first paint');
  s.end();win.fire(1e9);
  assert.equal(doc.splash.children.some(c=>c.tag==='video'),false,'ended before the delay: never created');
  assert.equal(doc.splash.dataset.state,'leaving');
});

test('splash: slow load starts the clip after the delay, end() cancels the download and restores the page',()=>{
  const doc=fakeDoc(),win=fakeWin(),s=startBootSplash({doc,win,sources:src});
  assert.equal(doc.root.attrs['aria-hidden'],'true');
  win.fire(SPLASH_DELAY_MS);
  const v=doc.splash.children.find(c=>c.tag==='video');
  assert.ok(v,'video created after the delay');assert.equal(v.preload,'none');assert.equal(v.muted,true);assert.equal(v.attrs['aria-hidden'],'true');assert.ok(v.played);
  s.end();
  assert.ok(v.removed&&v.paused&&!v.attrs.src,'download cancelled: src dropped and element removed');
  assert.equal(doc.root.attrs['aria-hidden'],undefined);
  s.end(); // idempotent
});

test('splash: an error, a missing file or a stall falls back to the static screen',()=>{
  for(const how of ['error','stall']){
    const doc=fakeDoc(),win=fakeWin(),s=startBootSplash({doc,win,sources:src,stallMs:4000});
    win.fire(SPLASH_DELAY_MS);const v=doc.splash.children.find(c=>c.tag==='video');
    if(how==='error')v.ev.error();else win.fire(SPLASH_DELAY_MS+4000);
    assert.ok(v.removed,how);assert.notEqual(doc.splash.dataset.clip,'playing');assert.equal(doc.splash.removed,false,'the static splash stays until the island is ready');
    s.end();
  }
});

test('splash: failsafe ends the splash even if the app never calls end()',()=>{
  const doc=fakeDoc(),win=fakeWin();startBootSplash({doc,win,sources:src,failsafeMs:25000});
  win.fire(25000);assert.equal(doc.splash.dataset.state,'leaving');
});

test('splash: reduced motion shows only the static screen',()=>{
  const doc=fakeDoc(),win=fakeWin({reduced:true}),s=startBootSplash({doc,win,sources:src});
  win.fire(1e9-1);assert.equal(doc.splash.children.some(c=>c.tag==='video'),false);assert.equal(s.state,'reduced-motion');
});

test('the shipped page: static splash markup, own script before the app, clip inside budget and cached offline',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  assert.match(html,/data-boot-splash[^>]*role="status"/);assert.match(html,/האי שלכם מתעורר/);
  assert.ok(html.indexOf('boot-splash-start.mjs')<html.indexOf('app.mjs'));
  assert.doesNotMatch(html,/<video/,'no video in the first HTML');
  const css=await readFile(new URL('ui/boot-splash.css',root),'utf8');
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/boot-failsafe/);
  const clip=new URL('assets/boot/boot-montage.mp4',root),size=(await stat(clip)).size;
  assert.ok(size<=1.5*1024*1024,'clip is '+size+' bytes');
  const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'));
  assert.ok(manifest.core.includes('assets/boot/boot-montage.mp4'),'clip is kept on the device for offline');
  const app=await readFile(new URL('app.mjs',root),'utf8');
  assert.match(app,/splash\.end\(\)/);
});

test('worker: byte ranges on a cached clip answer 206 so Safari can play it offline',async()=>{
  const src=await readFile(new URL('offline-sw.js',root),'utf8');
  assert.match(src,/status:206/);assert.match(src,/Accept-Ranges/);assert.match(src,/ranged\(request,hit\)/);
});
