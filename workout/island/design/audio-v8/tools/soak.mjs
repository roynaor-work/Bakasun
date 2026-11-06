/** Finite real-time endurance run. Each event still has a finite source lifetime.
 * AUDIO_V8_PLAYWRIGHT=... node tools/soak.mjs [minutes=120] [report.md]
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serve,launch} from './browser-check.mjs';
const minutes=Number(process.argv[2]??120);
assert.ok(Number.isFinite(minutes)&&minutes>0&&minutes<=240);
const output=process.argv[3],started=Date.now(),deadline=started+minutes*60000;
const {server,url}=await serve(),browser=await launch(),page=await browser.newPage();
let version='',events=0,cycles=0,checks=0;
const history=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  while(Date.now()<deadline) {
    const source=await readFile(new URL('../runtime/sports-audio.mjs',import.meta.url));
    const hash=createHash('sha256').update(source).digest('hex');
    if(hash!==version) {
      if(version)await page.evaluate(async()=>{await window.soak?.player.dispose();});
      await page.goto(url);await page.waitForSelector('.card');
      await page.evaluate(async()=>{
        const {createSportsAudio,SOUND_CATALOG}=await import('./runtime/sports-audio.mjs');
        window.soak={player:createSportsAudio({maxVoices:8,cacheBytes:512000}),names:Object.keys(SOUND_CATALOG),index:0};
        if(!await window.soak.player.unlock())throw Error('soak unlock failed');
      });
      version=hash;history.push({at:new Date().toISOString(),hash,kind:'module load'});
    }
    const result=await page.evaluate(async()=>{
      const {player,names}=window.soak;let accepted=0,maxActive=0,checks=0;
      const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      for(let iteration=0;iteration<30;iteration++) {
        const name=names[window.soak.index++%names.length];
        const handle=player[name]({seed:window.soak.index,tone:.75+(iteration%6)*.1,intensity:.3+(iteration%7)*.1});
        if(handle)accepted++;
        maxActive=Math.max(maxActive,player.metrics.activeVoices);
        if(iteration%7===0) {
          player.setMuted(true);if(player.metrics.activeVoices!==0)throw Error('mute leak');
          player.setMuted(false);checks++;
        }
        if(iteration%11===0) {
          player.setPaused(true);if(player.metrics.activeVoices!==0)throw Error('pause leak');
          player.setPaused(false);checks++;
        }
        await sleep(170);
      }
      player.stopAll();await sleep(30);
      const active=player.metrics.activeVoices;
      // A whistle followed by a measured quiet interval checks the original
      // regression repeatedly in real audio-clock time, not just offline PCM.
      await sleep(320);const whistle=player.whistle({duration:.28});
      if(whistle){
        accepted++;let timer;
        try{await Promise.race([whistle.ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('whistle end deadline exceeded')),2000);})]);}
        finally{clearTimeout(timer);}
      }
      await sleep(320);
      if(player.metrics.activeVoices!==0)throw Error('post-whistle source survived');
      if(globalThis.gc)globalThis.gc();
      return {accepted,maxActive,active,checks,cache:player.metrics.cacheBytes,limit:player.metrics.cacheLimit,heap:performance.memory?.usedJSHeapSize??0};
    });
    events+=result.accepted;cycles++;checks+=result.checks+2;
    assert.equal(result.active,0);assert.ok(result.maxActive<=8);assert.ok(result.cache<=result.limit);assert.deepEqual(errors,[]);
    if(cycles%10===0||Date.now()>=deadline) {
      const row={at:new Date().toISOString(),hash:version,kind:'checkpoint',events,cycles,checks,...result};history.push(row);
      const report=`# Real-time endurance\n\nStarted ${new Date(started).toISOString()}. Elapsed ${((Date.now()-started)/60000).toFixed(2)} minutes. Requested ${minutes} minutes. Chromium ${await browser.version()}. Events ${events}; lifecycle/silence checks ${checks}; errors ${errors.length}.\n\nEach cycle plays varied bounded events, mutes, pauses, stops, then plays one whistle and waits for silence. Runtime changes trigger a fresh page and are recorded by SHA-256. Heap is an observation, not an allocation proof.\n\n| Time (UTC) | Event | Module SHA-256 | Total accepted | Max active | Cache bytes | Heap bytes |\n|---|---|---|---:|---:|---:|---:|\n`+
        history.map(row=>`| ${row.at} | ${row.kind} | ${row.hash} | ${row.events??''} | ${row.maxActive??''} | ${row.cache??''} | ${row.heap??''} |`).join('\n')+'\n';
      if(output)await writeFile(output,report);
      console.log(`elapsed=${((Date.now()-started)/60000).toFixed(1)}m events=${events} checks=${checks} active=${result.active} cache=${result.cache}/${result.limit} heap=${result.heap} sha=${version.slice(0,12)}`);
    }
  }
  console.log(`PASS real-time endurance: ${minutes} minutes, ${events} events, ${checks} checks`);
} finally {await page.evaluate(async()=>{await window.soak?.player.dispose();}).catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve));}
