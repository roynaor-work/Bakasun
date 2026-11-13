/** Soccer v24 real-touch proof (evidence only; never writes match state). Same rig as the v23 harness (tools/soccer-v23-touch.mjs):
 * Chromium + SwiftShader, 844x390, hasTouch + isMobile, the island entered through its menu, a bot that plays only through CDP touches
 * (the floating stick and the real action buttons), the page clock stepped one 60 Hz frame at a time. On top it records what v24 adds:
 * which Codex v13 clip each player enters and on which event, the effects and Foley that fire (buffer URLs; oscillators for the
 * whistle check), the 3D fans' budget, the pitch kit and the bodies (numbers, gloves), the renderer's triangles / draw calls / tier,
 * and takes one screenshot per trigger (kickoff, set pieces, a lofted pass, a slide, a goal...).
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/soccer-v24-touch.mjs <outDir>
 *        [--query=soccerTier=0] [--seconds=60 | --full] [--tag=after] [--stage=4] [--shots=kickoff,goalKick,throwIn,...]
 *        `--full` plays until the result (both halves). `--query` is added to the island URL (e.g. all five v24 switches =0 for "before"). */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {openSoccer,createTouchBot,controlLayout} from './soccer-v23-touch.mjs';

const FRAME_MS=16;
const SHOTS=['kickoff','goalKick','throwIn','corner','keeperThrow','loft','slide','chest','goal','fans','finished'];

/** In-page read of what v24 shows this frame (after the frame was rendered). */
function readV24(){
  const session=window.__island.games.current?.session;if(!session)return null;
  const view=session.debug.view,model=session.debug.model,s=model.getState(),m=view?.metrics?.();
  const clips=[];for(const p of s.players){const c=view?.characters?.[p.id],state=c?.motion?.state;if(typeof state==='string'&&state.startsWith('v24_'))clips.push({id:p.id,clip:state,restart:p.restartMotion?.kind||null,mode:c.mode});}
  const bodies=(view?.characters||[]).map(c=>c.metrics?.()).filter(Boolean).map(b=>({kind:b.kind,number:b.number,gloves:b.gloves,keeper:b.keeper}));
  return {clips,restart:s.restart?{type:s.restart.type,player:s.restart.player}:null,restartMotions:s.players.filter(p=>p.restartMotion).map(p=>({id:p.id,kind:p.restartMotion.kind,elapsed:+p.restartMotion.elapsed.toFixed(3)})),
    triangles:m?.triangles,draws:m?.drawCalls,quality:m?.quality,v24:m?.v24,bodies,audio:session.snapshot?.audio||null};
}

async function main(){
  const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'soccer-v24-out');
  const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
  const query=opt('query',''),tag=opt('tag','after'),stage=Number(opt('stage',4)),full=args.includes('--full'),seconds=Number(opt('seconds',60));
  const wanted=new Set((opt('shots',SHOTS.join(','))||'').split(',').filter(Boolean)),taken={};
  await mkdir(out,{recursive:true});
  const h=await openSoccer({query,stage});const t0=Date.now(),frames=[],clipEntries=[],eventCounts={},samples=[];
  let previousClips=new Map(),lastEvents=[];
  const shot=async(name,f)=>{if(!wanted.has(name)||taken[name]!==undefined)return;taken[name]=f.elapsed;try{await h.page.screenshot({path:path.join(out,`${tag}-${name}.png`),timeout:90000});}catch(e){process.stderr.write(`${tag} screenshot ${name} failed: ${e.message}\n`);}process.stderr.write(`${tag} shot ${name} at ${f.elapsed}\n`);};
  try{
    let layout=await controlLayout(h);
    // every set piece and action shows up: kicks out for throw-ins / goal kicks / corners, lofted passes and headers, switches in defence
    const bot=createTouchBot({layout,switchEvery:5,airEvery:.35,outEvery:.6});
    const limit=full?Infinity:seconds*62.5;
    for(let i=0;i<limit;i++){
      const f=await h.frame();if(!f)break;
      const v=i%2===0||f.events?.length?await h.page.evaluate(readV24):null;
      for(const e of f.events||[]){eventCounts[e.type]=(eventCounts[e.type]||0)+1;}
      if(f.events?.length)lastEvents=f.events.map(e=>({type:e.type,player:e.player,restart:e.restart??null,kind:e.kind??null,power:e.power??null,at:f.elapsed}));
      if(v){
        const now=new Map(v.clips.map(c=>[c.id,c.clip]));
        for(const c of v.clips)if(previousClips.get(c.id)!==c.clip)clipEntries.push({at:f.elapsed,player:c.id,clip:c.clip,restart:c.restart,mode:c.mode,setPiece:v.restart?.type??null,recent:lastEvents});
        previousClips=now;
        if(i%120===0)samples.push({at:f.elapsed,phase:f.phase,triangles:v.triangles,draws:v.draws,quality:v.quality,crowd:v.v24?.crowd&&{status:v.v24.crowd.status,fans:v.v24.crowd.fans,on:v.v24.crowd.on,triangles:v.v24.crowd.triangles,draws:v.v24.crowd.draws},fx:v.v24?.fx?.counts});
        f.v24=v;
      }
      frames.push({elapsed:f.elapsed,phase:f.phase,score:f.score,quality:f.quality,audio:f.audio,events:f.events,buttons:f.buttons?.length||0});
      // screenshots (each once)
      if(!f.hold&&!f.replaying){
        if(f.phase==='playing'&&f.elapsed>.3)await shot('kickoff',f);
        if(f.phase==='restartReady'||f.restart){const type=f.restart?.type;if(type==='goalKick'||type==='throwIn'||type==='corner'){const m=v?.restartMotions?.find(r=>r.id===f.restart.player);if(m&&m.elapsed>.25)await shot(type,f);}}
        if(v?.clips.some(c=>c.clip==='v24_keeper_throw'))await shot('keeperThrow',f);
        if(v?.clips.some(c=>c.clip==='v24_lob_pass'))await shot('loft',f);
        if(v?.clips.some(c=>c.clip==='v24_slide_tackle'))await shot('slide',f);
        if(v?.clips.some(c=>c.clip==='v24_chest_control'))await shot('chest',f);
        if(v?.v24?.crowd?.on&&f.elapsed>8&&f.phase==='playing')await shot('fans',f);
      }
      if(f.phase==='goal')await shot('goal',f);
      if(f.result){await shot('finished',f);break;}
      if(i%120===0)layout=await controlLayout(h);
      const act=await bot.step(f,h.touch,FRAME_MS/1000);if(act?.pressed)frames.at(-1).bot=act.pressed;
      if(i%600===0)process.stderr.write(`${tag} frame ${i} wall=${((Date.now()-t0)/1000).toFixed(0)}s elapsed=${f.elapsed} score=${f.score} phase=${f.phase}\n`);
    }
  }finally{
    const last=await h.page.evaluate(readV24).catch(()=>null);
    const audio=frames.flatMap(f=>f.audio||[]),buffers={},oscillators=[];
    for(const a of audio){if(a.kind==='buffer')buffers[a.url]=(buffers[a.url]||0)+1;else oscillators.push(a);}
    const clipsByName={};for(const c of clipEntries)clipsByName[c.clip]=(clipsByName[c.clip]||0)+1;
    const summary={tag,query,stage,frames:frames.length,gameSeconds:frames.at(-1)?.elapsed??0,wallSeconds:(Date.now()-t0)/1000,result:frames.at(-1)?.phase,score:frames.at(-1)?.score,
      events:eventCounts,clipEntries:clipsByName,clipDetail:clipEntries,shots:taken,audioBuffers:buffers,oscillators:oscillators.length,oscillatorDetail:oscillators.slice(0,20),
      v24:last?.v24??null,bodies:last?.bodies??null,samples,qualityMax:Math.max(...frames.map(f=>f.quality??0)),errors:h.errors};
    await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summary,null,1));
    await h.close();
    console.log(JSON.stringify({tag,frames:summary.frames,gameSeconds:summary.gameSeconds,wall:summary.wallSeconds,score:summary.score,clips:clipsByName,shots:Object.keys(taken),errors:h.errors.slice(0,5)}));
  }
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
