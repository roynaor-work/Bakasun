/** Soccer v24.1 real-touch proof (evidence only; reads the match, never writes it). Same rig as tools/soccer-11v11-touch.mjs: Chromium +
 * SwiftShader, 844x390, hasTouch + isMobile, the island entered through its menu, every action a CDP touch on the real stick and buttons, the
 * page clock stepped one frame at a time. The bot is the v23 touch bot with lobs, plus the v24.1 high-ball habit: when the kick button shows
 * "עף"/"נגיחה" it presses it, when the fourth button shows a second way (data-air="alt-...") it presses that every other time.
 * Records: the radar element, the button labels shown for every high ball, the match events (volleys, scissor kicks, headers, fouls by kind,
 * advantages), the whistle cues the audio played, which clip every player is in (the v24.1 packs by prefix), the largest bone rotation
 * step per frame and per player (pops) and the locomotion clip changes per player-minute (churn), and one screenshot per moment.
 * Usage: ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/soccer-v241-touch.mjs <outDir>
 *        [--query=soccerV241=0] [--tag=before] [--seconds=40] [--frame=33] [--stage=4] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTouchBot,controlLayout,mulberry} from './soccer-v23-touch.mjs';
import {openFull} from './soccer-11v11-touch.mjs';

/** In-page read: what the bot needs, the events since the last read, the buttons and, every frame, each player's clip and largest bone step. */
function readV241(){
  const session=window.__island.games.current?.session;if(!session)return null;
  const model=session.debug.model,view=session.debug.view,s=model.getState(),P=window.__v241||(window.__v241={wrapped:null,events:[],prev:new Map()});
  if(P.wrapped!==model){const drain=model.drainEvents.bind(model);model.drainEvents=()=>{const list=drain();for(const e of list)P.events.push({type:e.type,team:e.team??(e.player!=null?s.players[e.player]?.team:null),player:e.player??null,kind:e.kind??null,aerial:e.aerial??null,restart:e.restart??null,penalty:e.penalty??null,won:e.won??null,elapsed:+s.elapsed.toFixed(2)});return list;};P.wrapped=model;}
  const chars=view?.characters||[],clips=[],pops=[];
  for(const p of s.players){
    const c=chars[p.id];if(!c?.root||!c.pivot?.visible){clips.push(null);pops.push(null);continue;}
    clips.push(c.motion?.state||c.active||null);
    let pop=0;const prev=P.prev.get(p.id)||new Map();
    c.root.traverse(o=>{if(!o.isBone)return;const q=o.quaternion,last=prev.get(o.name);if(last){const dot=Math.min(1,Math.abs(q.x*last[0]+q.y*last[1]+q.z*last[2]+q.w*last[3]));pop=Math.max(pop,2*Math.acos(dot)*180/Math.PI);}prev.set(o.name,[q.x,q.y,q.z,q.w]);});
    P.prev.set(p.id,prev);pops.push(+pop.toFixed(1));
  }
  const b=s.ball,shoot=document.querySelector('#shoot'),swap=document.querySelector('#soccer-switch');
  return {phase:s.phase,mode:s.mode,controlled:s.controlled,attackDir:s.attackDir,elapsed:+s.elapsed.toFixed(3),half:s.half,score:[...s.score],
    restart:s.restart?{type:s.restart.type,team:s.restart.team,player:s.restart.player}:null,
    ball:{x:b.x,y:b.y,z:b.z,vx:b.vx,vz:b.vz,owner:b.owner,flight:b.flight?1:0},players:s.players.map(p=>({x:p.x,z:p.z,team:p.team,fouled:p.fouledTime>0?1:0,stumble:p.stumbleTime>0?1:0,aerial:p.aerialKind||null})),
    hold:Boolean(view?.hold),replaying:Boolean(view?.replaying),result:Boolean(model.result),events:P.events.splice(0),clips,pops,
    air:{prompt:shoot?.dataset.air||'',slot:swap?.dataset.air||'',primaryLabel:shoot?.querySelector('.soccer-action-label')?.textContent||'',slotLabel:swap?.querySelector('.soccer-action-label')?.textContent||'',armed:s.headerArm?(s.headerArm.kind||'header'):'',options:s.airOptions?{primary:s.airOptions.primary,alt:s.airOptions.alt}:null},
    radar:Boolean(document.querySelector('.soccer-radar'))};
}
const final=()=>{const session=window.__island.games.current?.session;return {audio:session?.snapshot?.audio?.counts||null,whistleV1:session?.snapshot?.audio?.whistleV1??null,loaded:(session?.snapshot?.audio?.loaded||[]).filter(k=>/whistle/.test(k)),motion:null};};

async function main(){
  const args=process.argv.slice(2),out=path.resolve(args.find(a=>!a.startsWith('--'))||'soccer-v241-out');
  const opt=(n,f)=>{const hit=args.find(a=>a.startsWith(`--${n}=`));return hit?hit.slice(n.length+3):f;};
  const query=opt('query',''),tag=opt('tag','after'),stage=Number(opt('stage',4)),frameMs=Number(opt('frame',33)),seconds=Number(opt('seconds',40));
  await mkdir(out,{recursive:true});
  const t0=Date.now(),h=await openFull({query,stage});const loadSeconds=(Date.now()-t0)/1000;
  const layout=await controlLayout(h),rng=mulberry(11),bot=createTouchBot({layout,rng,switchEvery:6,airEvery:.6,pitchHalf:52.5,pitchWide:34});
  const counts={},prompts=[],strikes=[],fouls=[],clipCounts={},popHist={over20:0,over30:0,over45:0,frames:0,max:0},churn={changes:0,playerSeconds:0},shots={};
  let last=null,prevClips=null,altTurn=0,since=9,radar=null;const BUTTON=2;
  const shot=async(name,f)=>{if(shots[name]!==undefined)return;shots[name]=f.elapsed;const file=path.join(out,`${tag}-${name}.png`);try{await h.page.screenshot({path:file,timeout:120000});}catch(e){process.stderr.write(`${tag} screenshot ${name} failed: ${e.message.split('\n')[0]}\n`);}process.stderr.write(`${tag} shot ${name} at ${f.elapsed}\n`);};
  const pending=new Map();
  try{
    for(let i=0;i<Math.ceil(seconds*1000/frameMs);i++){
      await h.page.clock.runFor(frameMs);
      const f=await h.page.evaluate(readV241);if(!f)break;last=f;if(radar===null)radar=f.radar;
      for(const e of f.events){counts[e.type]=(counts[e.type]||0)+1;
        if(e.type==='shot'&&e.aerial){strikes.push(e);if(!pending.has('strike-'+e.aerial))pending.set('strike-'+e.aerial,i+4);}
        if(e.type==='header'&&e.team===0){strikes.push(e);if(!pending.has('strike-header'))pending.set('strike-header',i+4);}
        if(e.type==='foul'||e.type==='advantage'){fouls.push(e);if(!pending.has('foul'))pending.set('foul',i+3);}}
      // clips and pops of every visible player (the motion the eye sees)
      for(let k=0;k<f.clips.length;k++){const c=f.clips[k];if(!c)continue;const key=c.startsWith('v241_')?c:c.replace(/^(v\d+)_.*/,'$1').replace(/^(slide|keeper_dive|celebrate).*/,'$1');clipCounts[key]=(clipCounts[key]||0)+1;
        const pop=f.pops[k];if(pop!=null&&i>0){popHist.frames++;popHist.max=Math.max(popHist.max,pop);if(pop>20)popHist.over20++;if(pop>30)popHist.over30++;if(pop>45)popHist.over45++;}
        if(prevClips&&prevClips[k]&&prevClips[k]!==c&&f.phase==='playing')churn.changes++;}
      if(f.phase==='playing')churn.playerSeconds+=f.clips.filter(Boolean).length*frameMs/1000;
      prevClips=f.clips;
      if(f.air.options){const key=f.air.options.primary+'/'+(f.air.options.alt||'');if(!prompts.length||prompts.at(-1).key!==key||f.elapsed-prompts.at(-1).at>2)prompts.push({key,at:f.elapsed,shown:[f.air.primaryLabel,f.air.slotLabel],dataAir:[f.air.prompt,f.air.slot]});if(!pending.has('prompt'))pending.set('prompt',i+1);if(f.air.slot.startsWith('alt-')&&!pending.has('prompt-alt'))pending.set('prompt-alt',i+1);}
      // the v24.1 high-ball habit: press the kick button for the first way, the fourth button for the second way every other time
      since+=frameMs/1000;
      if(f.phase==='playing'&&!f.air.armed&&since>.3&&f.air.options){
        const useAlt=f.air.slot.startsWith('alt-')&&(altTurn++%2===0),r=useAlt?layout.switch:layout.shoot;
        if(r&&!h.touch.held(BUTTON)){since=0;await h.touch.down(BUTTON,r.x+r.width/2,r.y+r.height/2);await h.page.clock.runFor(frameMs);await h.touch.up(BUTTON);process.stderr.write(`${tag} pressed ${useAlt?'alt':'primary'} (${f.air.options.primary}/${f.air.options.alt}) at ${f.elapsed}\n`);continue;}
      }
      await bot.step(f,h.touch,frameMs/1000);
      if(f.phase==='playing'&&f.elapsed>.5&&shots.kickoff===undefined)await shot('kickoff',f);
      for(const [key,at] of [...pending])if(i>=at){pending.delete(key);await shot(key,f);}
      if(i%300===299){process.stderr.write(`${tag} t=${f.elapsed} score=${f.score} wall=${((Date.now()-t0)/1000).toFixed(0)}s ${JSON.stringify(counts)}\n`);}
      if(f.result||f.phase==='finished')break;
    }
  }finally{
    let end=null;try{end=await h.page.evaluate(final);}catch{}
    const summary={tag,query,stage,frameMs,loadSeconds,wallSeconds:(Date.now()-t0)/1000,gameSeconds:last?.elapsed??0,score:last?.score,radar,events:counts,prompts,strikes,fouls,audio:end,
      clips:Object.fromEntries(Object.entries(clipCounts).sort((a,b)=>b[1]-a[1])),pops:{...popHist,over30PerMinute:+(popHist.over30/Math.max(1,churn.playerSeconds/60)).toFixed(2),over45PerMinute:+(popHist.over45/Math.max(1,churn.playerSeconds/60)).toFixed(2)},
      churnPerPlayerMinute:+(churn.changes/Math.max(1,churn.playerSeconds/60)).toFixed(2),shots,errors:h.errors};
    await writeFile(path.join(out,`${tag}.json`),JSON.stringify(summary,null,1));
    await h.close();
    process.stdout.write(JSON.stringify({tag,gameSeconds:summary.gameSeconds,radar,events:counts,prompts:prompts.length,strikes:strikes.map(s=>s.aerial||s.type),fouls:fouls.map(f=>f.type+':'+(f.kind||'')),audio:end,pops:summary.pops,churn:summary.churnPerPlayerMinute,errors:h.errors.length})+'\n');
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exit(1);});
