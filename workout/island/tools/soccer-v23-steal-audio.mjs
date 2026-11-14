/** Which sounds start around a steal (evidence only): reads a soccer-v23-touch.mjs recording and, for every steal/tackle press of the
 * child (the pass button in defence = steal, the kick button = slide) and every steal/slide/foul event of either team, lists the audio
 * sources that started within the window (Web Audio buffer URL or oscillator type and frequency).
 * Usage: node tools/soccer-v23-steal-audio.mjs <recording.json> [--window=250] */
import {readFile} from 'node:fs/promises';

const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--')),win=Number((args.find(a=>a.startsWith('--window='))||'--window=250').slice(9));
const rec=JSON.parse(await readFile(file,'utf8')),F=rec.frames;
const audio=[],presses=[],events=[];
for(let i=0;i<F.length;i++){
  const f=F[i];for(const a of f.audio||[])audio.push({...a,frame:i,mode:f.mode,phase:f.phase});
  for(const b of f.buttons||[])if(b.ev==='pointerdown'&&['pass','shoot','sprint','soccer-switch'].includes(b.id))presses.push({...b,frame:i,mode:f.mode,phase:f.phase,input:f.input?.state});
  for(const e of f.events||[])if(['steal','slide','slide-contact','foul','possession','pass','shot','switch'].includes(e.type))events.push({...e,frame:i,t:e.at});
}
const label=a=>a.kind==='osc'?`osc ${a.type} ${a.hz}Hz`:a.url;
const near=(t,list)=>list.filter(a=>a.t>=t-20&&a.t<=t+win).map(a=>`${label(a)} @+${Math.round(a.t-t)}ms`);
const summary={};
const bump=(key,sounds)=>{const s=summary[key]||(summary[key]={count:0,withSound:0,sounds:{}});s.count++;if(sounds.length)s.withSound++;for(const x of new Set(sounds.map(v=>v.replace(/ @\+-?\d+ms$/,''))))s.sounds[x]=(s.sounds[x]||0)+1;};
for(const p of presses){const what=p.id==='pass'?(p.mode==='defense'?'press:steal':'press:pass'):p.id==='shoot'?(p.mode==='defense'?'press:slide':'press:shoot'):p.id==='soccer-switch'?'press:switch':'press:sprint';bump(what,near(p.t,audio));}
let lastTeam=null;
for(const e of events){
  if(e.type==='possession'){const turnover=lastTeam!==null&&e.team!==lastTeam;lastTeam=e.team;if(!turnover)continue;bump(`turnover:${e.team===0?'won':'lost'}`,near(e.t,audio));continue;}
  bump(`event:${e.type}${e.won===true?':won':e.won===false?':lost':''}`,near(e.t,audio));
}
const sources={};for(const a of audio){const k=label(a);sources[k]=(sources[k]||0)+1;}
console.log(JSON.stringify({file,frames:F.length,audioStarts:audio.length,sources,around:summary},null,1));
