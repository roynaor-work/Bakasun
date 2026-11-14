/** Build the runtime copies of soccer v24.1 (assets/soccer-v241/) from the Codex packs:
 *  clips/tackle.json  soccer-tackle-keeper-v2 (QA 88.4-96, pinned motion-qa-v1 5eb4f093): slide_tackle + getup_fast as one slide, stumble_light,
 *                     fall_foul + getup_foul, the six keeper dives (low / middle / high, both sides) each with its getup_keeper.
 *  clips/aerial.json  soccer-volley-scissor-v1 (volley 95.0 / 95.1, scissor + landing measured as one sequence 89.2): volley_right,
 *                     volley_left, scissor_backward + scissor_land_getup as one scissor.
 *  clips/kicks.json   soccer-kicks-v2 (QA 91.3-98.3): the twelve ground kicks and passes (its volley and scissors are not shipped: the
 *                     aerial pack has the volley, a scissor kick from the ground and the landing the simulation plays).
 *  audio/*.ogg        soccer-whistle-crowd-v1: the five referee whistles (the crowd and ball sounds are not shipped: the game keeps the v24 ones).
 * A joined clip is checked at its seam (same pose within 0.1 degree, the packs' own contract) before it is written. Keys are normalised to
 * 0..1, events and contacts in clip seconds, Hips offsets relative to the canonical rest (0, 0.86, 0) as in every other Codex pack (no root
 * motion: the simulation moves the player).
 * Run: node workout/island/tools/soccer-v241-clips.mjs [--design <dir with the four pack folders>]   (default: workout/island/design) */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOCCER_V241_EXPECTED,SOCCER_WHISTLE_V1} from '../minigames/soccer-r241.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
const design=path.resolve(args.includes('--design')?args[args.indexOf('--design')+1]:path.join(here,'../design')),out=path.join(here,'../assets/soccer-v241');
const COMMITS={'soccer-locomotion-v2':'ec6c73949fb5820826b4c082972f5d4f1136641f','soccer-tackle-keeper-v2':'1bd4ccb5d53a8ff21bb03930ad3b26e7c4815e17','soccer-volley-scissor-v1':'8277a659f43315036eed250bda2f53f44f8613bb','soccer-kicks-v2':'d4a27a94dd63127dd9f38fc641db414bd09bac35','soccer-whistle-crowd-v1':'9478aa43b018d9aa2690a0f493006a3e52216af1'};
const round=(v,n=5)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0],FPS=30;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;
const provenance=[];
async function readPack(pack,relative){const file=path.join(design,pack,relative),bytes=await readFile(file);provenance.push({pack,branch:'codex/'+pack,commit:COMMITS[pack],path:`workout/island/design/${pack}/${relative}`,bytes:bytes.length,sha256:sha(bytes)});return bytes;}
const eventTime=e=>e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/FPS;
const durationOf=c=>c.durationSeconds??c.duration;
/** One clip or several joined at matching poses (the packs' `next` chain): absolute times, events and the first contact. */
function join(parts,{id,category,from=0}){
  const frames=[],events=[];let offset=0,contact=null;
  for(let k=0;k<parts.length;k++){
    const part=parts[k],d=durationOf(part);
    if(k){const a=parts[k-1].frames.at(-1),b=part.frames[0];for(const bone of Object.keys(a.rotations)){const deg=ang(a.rotations[bone],b.rotations[bone]);if(deg>.1)throw Error(`${id}: seam ${parts[k-1].id} -> ${part.id} differs ${deg.toFixed(3)} deg at ${bone}`);}
      const dh=Math.hypot(...a.hips.map((v,i)=>v-b.hips[i]));if(dh>.001)throw Error(`${id}: seam hips differ ${dh} m`);}
    for(const f of part.frames)if(!frames.length||f.time>1e-7||!k)frames.push({time:f.time+offset,hips:f.hips,rotations:f.rotations});
    for(const e of part.events||[]){const type=e.type??e.event??e.name,t=eventTime(e)+offset;events.push({timeSeconds:round(t,4),name:'visual_'+type,bone:e.bone||null,domain:'presentation'});if(!contact&&['contact','release','receive'].includes(type))contact={time:t,type,bone:e.bone||null};}
    offset+=d;
  }
  // `from`: the lead-in the game never shows (it enters a kick just before its contact) is dropped; times start at 0 again.
  if(from>0){const kept=frames.filter(f=>f.time>=from-1e-6);for(const f of kept)f.time-=from;frames.length=0;frames.push(...kept);for(const e of events)e.timeSeconds=round(e.timeSeconds-from,4);events.splice(0,events.length,...events.filter(e=>e.timeSeconds>=0));if(contact)contact.time-=from;offset-=from;}
  if(frames.length<10)throw Error(id+': too few frames');
  const bones=Object.keys(frames[0].rotations);if(bones.length!==18)throw Error(id+': expected 18 bones, got '+bones.length);
  const duration=round(offset,4),keyframes=frames.map(f=>({time:round(f.time/duration),rotations:Object.fromEntries(bones.map(b=>[b,f.rotations[b].map(v=>round(v,4))])),hipsOffsetMeters:f.hips.map((v,k)=>round(v-REST_HIPS[k],4))}));
  keyframes[0].time=0;keyframes.at(-1).time=1;
  let maxKeyDeg=0;for(let i=1;i<keyframes.length;i++)for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b]));
  return {clip:id,group:'action',category,durationSeconds:duration,loop:false,maxKeyDeg:round(maxKeyDeg,1),timeScale:1,parts:parts.map(p=>({id:p.id,durationSeconds:round(durationOf(p),4)})),events:events.sort((a,b)=>a.timeSeconds-b.timeSeconds),
    ballContacts:contact?[{time:round(contact.time/duration,6),atSeconds:round(contact.time,4),event:'visual_contact',kind:contact.type,bone:contact.bone}]:[],standSeconds:duration,keyframes};
}
const states={tackle:{},aerial:{},kicks:{},loco:{}};
// ---- tackle-keeper-v2 ----
{const m=JSON.parse(await readPack('soccer-tackle-keeper-v2','runtime/motions.json'));await readPack('soccer-tackle-keeper-v2','runtime/catalog.json');
 const by=id=>{const c=m.clips.find(x=>x.id===id);if(!c)throw Error('tackle-keeper-v2 lacks '+id);return c;};
 states.tackle.slide=join([by('slide_tackle'),by('getup_fast')],{id:'slide',category:'slide'});
 states.tackle.stumble=join([by('stumble_light')],{id:'stumble',category:'reaction'});
 states.tackle.fall_foul=join([by('fall_foul'),by('getup_foul')],{id:'fall_foul',category:'reaction'});
 for(const side of ['left','right'])for(const [row,source] of [['low',`dive_low_${side}`],['mid',`dive_${side}`],['high',`dive_high_${side}`]])
  states.tackle[`keeper_dive_${row}_${side}`]=join([by(source),by(`getup_keeper_${side}`)],{id:`keeper_dive_${row}_${side}`,category:'keeper'});}
// ---- volley-scissor-v1 ----
{const m=JSON.parse(await readPack('soccer-volley-scissor-v1','motions.json'));await readPack('soccer-volley-scissor-v1','catalog.json');
 const by=id=>{const c=m.clips.find(x=>x.id===id);if(!c)throw Error('volley-scissor-v1 lacks '+id);return c;};
 states.aerial.volley_right=join([by('volley_right')],{id:'volley_right',category:'aerial'});
 states.aerial.volley_left=join([by('volley_left')],{id:'volley_left',category:'aerial'});
 states.aerial.scissor=join([by('scissor_backward'),by('scissor_land_getup')],{id:'scissor',category:'aerial'});}
// ---- locomotion-v2 (only the clips authored near the game's own speeds: the three idles, the walk, the side steps and the run backwards;
// its jog, run and sprint are cycles of 1.65 / 2.2 / 3.2 m/s where the game runs 2.6 / 4.5 / 7.2+ m/s) ----
{const m=JSON.parse(await readPack('soccer-locomotion-v2','runtime/motions.json'));await readPack('soccer-locomotion-v2','runtime/catalog.json');
 for(const id of SOCCER_V241_EXPECTED.loco){const c=m.clips.find(x=>x.id===id);if(!c)throw Error('locomotion-v2 lacks '+id);const st=join([c],{id,category:c.category||'locomotion'});st.loop=Boolean(c.loop);st.speedMps=c.speedMps??0;st.group=c.loop?'locomotion':'action';states.loco[id]=st;}}
// ---- kicks-v2 ----
{const m=JSON.parse(await readPack('soccer-kicks-v2','runtime/motions.json'));await readPack('soccer-kicks-v2','runtime/catalog.json');
 for(const id of SOCCER_V241_EXPECTED.kicks){const c=m.clips.find(x=>x.id===id);if(!c)throw Error('kicks-v2 lacks '+id);const contact=(c.events||[]).find(e=>(e.type??e.event)==='contact');
  // 0.4 s of lead-in before the contact is kept (the state machine enters 0.05 s before it); the rest of the wind-up is never shown
  states.kicks[id]=join([c],{id,category:c.category||'kick',from:Math.max(0,Math.floor((eventTime(contact)-.4)*FPS)/FPS)});}}
for(const [file,expected] of Object.entries(SOCCER_V241_EXPECTED))for(const id of expected)if(!states[file][id])throw Error(`missing ${file}/${id}`);
await mkdir(path.join(out,'clips'),{recursive:true});await mkdir(path.join(out,'audio'),{recursive:true});
const sources={loco:'design/soccer-locomotion-v2 (Codex, CC0)',tackle:'design/soccer-tackle-keeper-v2 (Codex, CC0)',aerial:'design/soccer-volley-scissor-v1 (Codex, CC0)',kicks:'design/soccer-kicks-v2 (Codex, CC0)'};
for(const [file,s] of Object.entries(states))await writeFile(path.join(out,'clips',file+'.json'),JSON.stringify({schemaVersion:1,source:sources[file]+', joined at matching poses where the pack chains a recovery',fps:FPS,states:s}));
// ---- whistles ----
for(const {file} of Object.values(SOCCER_WHISTLE_V1)){await readPack('soccer-whistle-crowd-v1',file);await copyFile(path.join(design,'soccer-whistle-crowd-v1',file),path.join(out,'audio',file));}
// ---- licences ----
const licences=[];for(const [pack,name] of [['soccer-locomotion-v2','LICENSES.md'],['soccer-tackle-keeper-v2','LICENSES.md'],['soccer-volley-scissor-v1','LICENSES.md'],['soccer-kicks-v2','LICENSES.md'],['soccer-whistle-crowd-v1','LICENSE.txt']])licences.push(`## ${pack} (codex/${pack} ${COMMITS[pack]})\n\n`+(await readPack(pack,name)).toString('utf8').trim());
await writeFile(path.join(out,'LICENSES.md'),`# soccer v24.1 runtime copies\n\nConverted from the Codex packs below by tools/soccer-v241-clips.mjs (keyframes only; no mesh, texture or GLB is shipped). Each pack's own licence follows.\n\n${licences.join('\n\n')}\n`);
await writeFile(path.join(out,'provenance.json'),JSON.stringify({tool:'workout/island/tools/soccer-v241-clips.mjs',inputs:provenance},null,1));
for(const [file,s] of Object.entries(states))for(const [id,st] of Object.entries(s))console.log(file.padEnd(7),id.padEnd(22),String(st.durationSeconds).padEnd(6)+'s',String(st.keyframes.length).padEnd(4)+'k',String(st.maxKeyDeg).padEnd(6)+'deg/key',st.events.map(e=>e.name.slice(7)+'@'+e.timeSeconds).join(' '));
