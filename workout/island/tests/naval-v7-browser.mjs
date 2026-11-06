// Naval v7 hulls (05/11/2026): real page, real CSP, 844x390. NAVAL_V7_MODE=on (default) loads the v7 ships;
// NAVAL_V7_MODE=blocked blocks assets/naval-v7/ so the game must fall back to the earlier Meshy boats (the "before" picture and the silent-fallback test).
// Writes verification/gpt-v7-naval-fire-defense/naval-<mode>.json and naval-<mode>.png.
import {verify} from './night-browser.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const mode=process.env.NAVAL_V7_MODE||'on',out=fileURLToPath(new URL('../verification/gpt-v7-naval-fire-defense/',import.meta.url));await mkdir(out,{recursive:true});
await verify('gpt-v7-naval-fire-defense/run-'+mode,[{width:844,height:390}],async({page,tick,snap,start,assert})=>{
 // The island service worker answers asset requests itself, so page.route cannot see them: fail the two loaders in the page (GLB fetch, atlas image).
 if(mode==='blocked')await page.evaluate(()=>{const f=window.fetch.bind(window);window.fetch=(u,...a)=>String(u?.url||u).includes('/naval-v7/')?Promise.reject(new TypeError('blocked')):f(u,...a);const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(v){if(String(v).includes('/naval-v7/')){setTimeout(()=>this.dispatchEvent(new Event('error')),0);return;}d.set.call(this,v);}});});
 const bytes=new Map();page.on('response',async r=>{try{const u=new URL(r.url());if(/\.(glb|png|wasm)$/.test(u.pathname)&&u.pathname.includes('/workout/island/assets/')){const b=await r.body();bytes.set(u.pathname.replace('/workout/island/',''),b.length);}}catch{}});
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;});
 await start('navalDuel',3);
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{},{polling:100});
 await page.waitForFunction(()=>{const m=window.__island.games.current.session.snapshot.renderMetrics;return m.enemiesLoaded>=1;},{},{polling:100}).catch(()=>{});
 await tick(1500);
 let m=(await snap()).renderMetrics;
 const samples=[];for(let i=0;i<20;i++){await tick(100);const r=(await snap()).renderMetrics;samples.push([r.triangles,r.drawCalls]);}
 await page.screenshot({path:out+'naval-'+mode+'.png'});
 m=(await snap()).renderMetrics;
 const assetBytes=[...bytes.entries()].filter(([k])=>/naval-v7|boat-patrol|enemy-gunboat|enemy-ship|boss-ship/.test(k)),report={mode,v7:m.v7,triangles:m.triangles,drawCalls:m.drawCalls,peak:m.peak,medianTriangles:samples.map(s=>s[0]).sort((a,b)=>a-b)[10],models:m.models,playerLength:m.playerLength,enemyLengths:m.enemyLengths,gpu:m.gpu,assetBytes:Object.fromEntries(assetBytes),totalBytes:assetBytes.reduce((a,[,n])=>a+n,0)};
 await writeFile(out+'naval-'+mode+'.json',JSON.stringify(report,null,1)+'\n');
 if(mode==='on'){assert.equal(m.v7.enabled,true);assert.equal(m.v7.player,true,'the v7 destroyer is the player hull');assert.ok(m.v7.enemies>=1);assert.equal(m.v7.failed,0);}
 else{assert.equal(m.v7.player,false);assert.equal(m.v7.enemies,0);assert.equal(m.playerLoaded,true,'Meshy player boat is the silent fallback');}
 return report;
});
