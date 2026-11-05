// Extract the soccer-v7 clips the game plays beyond its own motion library into
// assets/soccer-v7/clips.json, in the library's `states` shape so the same retarget,
// floor bake and mixer path compiles them. design/ is not published, so this compact
// copy (rotations rounded to 1e-4) is what ships. Usage: node tools/soccer-v7-clips.mjs
import {readFile,writeFile} from 'node:fs/promises';

const source=JSON.parse(await readFile(new URL('../design/soccer-v7/characters/animations.json',import.meta.url),'utf8'));
const WANTED={
  run_1:'locomotion',run_2:'locomotion',run_3:'locomotion',run_4:'locomotion',run_5:'locomotion',sprint:'locomotion',
  keeper_dive_left:'keeper',keeper_dive_right:'keeper',keeper_dive_high:'keeper',keeper_catch:'keeper',
  celebrate_arms_up:'celebration',celebrate_fist_pump:'celebration',celebrate_victory_leap:'celebration',celebrate_aeroplane:'celebration',
};
const r=v=>Math.round(v*1e4)/1e4;
const states={};
for(const clip of source.clips){
  if(!WANTED[clip.id])continue;
  const duration=clip.duration,last=clip.frames.length-1;
  states[clip.id]={clip:clip.id,group:WANTED[clip.id],durationSeconds:duration,loop:clip.loop,speedMps:clip.speedMps,strideLengthMeters:clip.strideLengthMeters,
    events:clip.events,ballContacts:clip.ballContacts,
    keyframes:clip.frames.map((frame,i)=>({time:last?frame.timeSeconds/duration:0,
      rotations:Object.fromEntries(Object.entries(frame.rotations).map(([name,q])=>[name,q.map(r)])),
      hipsOffsetMeters:frame.hipsOffsetMeters.map(r)}))};
}
const missing=Object.keys(WANTED).filter(id=>!states[id]);if(missing.length)throw Error('Missing v7 clips: '+missing);
const text=JSON.stringify({schemaVersion:1,source:'design/soccer-v7/characters/animations.json',fps:source.fps,states});
await writeFile(new URL('../assets/soccer-v7/clips.json',import.meta.url),text);
console.log(Object.keys(states).length+' clips, '+text.length+' bytes');
