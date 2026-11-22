/** Tennis v24.4 line calls (Roy, 18/11/2026, after v24.3 on the phone: "if it is out, a shout of OUT; if it is stuck in the net, NET").
 * At v24.4 no callout package existed from Codex, so both parts were made here (v24.7 connects codex/tennis-callouts-v1, see the end of the file):
 *  - the sign: the v24.1 out plate at the top centre now carries a big call word ("OUT" / "NET") next to the Codex tennis-ui-v2 symbol
 *    (fx-out.svg: the red X, fx-net.svg: the ball in the net, CC0, copied to assets/tennis-ui-v2), for 1.5 s, on a serve fault and on a rally point;
 *  - the shout: a short line judge's call synthesised with Web Audio (no recording, no speech engine, works offline): a sawtooth voice whose
 *    pitch falls like a shout, through three formant band-passes that glide through the vowel ("aa-oo" for OUT, "e" for NET, with a nasal
 *    start), ended by a short "t" burst of filtered noise. It goes through the tennis audio master, so the island sound switch mutes it.
 * ?tennisCallouts=0 keeps v24.3 (the plate with the word "אאוט" on an out only, and no shout). Pure rules first, then the Web Audio voice. */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function tennisCalloutsEnabled(search=globalThis.location?.search||''){return param('tennisCallouts',search)!=='0';}
/** Which call a new fault mark makes: 'out' | 'net' | null (only out and net are called). */
export function calloutFor(mark){return mark?.reason==='out'||mark?.reason==='net'?mark.reason:null;}
export const CALL_WORD=Object.freeze({out:'OUT',net:'NET'});
export const CALL_SECONDS=1.5;
/** The voice of one call: f0 [start, end] Hz, formants [[from, to, bandwidth, gain]...], vowel seconds, a nasal start (seconds), the "t" burst. */
export const VOICES=Object.freeze({
 out:Object.freeze({f0:[262,158],seconds:.36,nasal:0,formants:[[760,360,90,1],[1150,820,110,.62],[2450,2250,170,.24]],burst:.035}),
 net:Object.freeze({f0:[240,160],seconds:.3,nasal:.07,formants:[[560,540,90,1],[1820,1780,130,.58],[2500,2560,170,.24]],burst:.035})
});
/** Play one call on an AudioContext into `destination`. Returns the seconds it lasts (0 when it could not start). */
export function playCall(context,destination,kind,{level=.85,random=Math.random}={}){
 const v=VOICES[kind];if(!v||!context||!destination)return 0;
 try{
  const t0=context.currentTime+.01,end=t0+v.nasal+v.seconds,out=context.createGain(),nodes=[out];out.gain.setValueAtTime(0,t0);out.connect(destination);
  const voice=context.createOscillator();voice.type='sawtooth';voice.frequency.setValueAtTime(v.f0[0],t0);voice.frequency.exponentialRampToValueAtTime(v.f0[1],end);nodes.push(voice);
  for(const [from,to,width,gain]of v.formants){const band=context.createBiquadFilter(),g=context.createGain();band.type='bandpass';band.frequency.setValueAtTime(from,t0+v.nasal);band.frequency.linearRampToValueAtTime(to,t0+v.nasal+v.seconds*.8);band.Q.value=from/width;g.gain.value=gain*4;voice.connect(band);band.connect(g);g.connect(out);nodes.push(band,g);}
  // The nasal "n" of NET: the voice through a low-pass alone, then the vowel opens.
  if(v.nasal>0){const hum=context.createBiquadFilter(),g=context.createGain();hum.type='lowpass';hum.frequency.value=320;g.gain.setValueAtTime(.9,t0);g.gain.linearRampToValueAtTime(0,t0+v.nasal+.03);voice.connect(hum);hum.connect(g);g.connect(destination);nodes.push(hum,g);}
  out.gain.linearRampToValueAtTime(level*(v.nasal>0?.25:1),t0+.03);if(v.nasal>0)out.gain.linearRampToValueAtTime(level,t0+v.nasal+.04);out.gain.setValueAtTime(level,end-.09);out.gain.linearRampToValueAtTime(0,end);
  voice.start(t0);voice.stop(end+.02);
  const length=Math.max(1,Math.floor(context.sampleRate*v.burst)),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(random()*2-1)*(1-i/length);
  const burst=context.createBufferSource(),high=context.createBiquadFilter(),bg=context.createGain();burst.buffer=buffer;high.type='highpass';high.frequency.value=2800;bg.gain.value=level*.55;burst.connect(high);high.connect(bg);bg.connect(destination);burst.start(end+.035);nodes.push(burst,high,bg);
  burst.onended=()=>{for(const n of nodes){try{n.disconnect();}catch{}}};
  return end+.035+v.burst-context.currentTime;
 }catch{return 0;}
}
/** v24.5 recorded calls (Roy, 18/11/2026, after v24.4: "it sounds a bit processed and not good... like in a real tennis match... if needed we
 * will record"). The synthesised voice is not tuned further: this is the hook for real recordings. Drop up to three takes per call in
 * assets/tennis-callouts-rec/ as out-1..3 and net-1..3 (.ogg and/or .mp3) and list them in that folder's takes.json (the list keeps the game from
 * asking the server for files that are not there; add each file to offline-manifest.json games.tennis too, then run tools/offline-shell.mjs,
 * so the phone keeps it offline). Each call plays one recorded take at random, never the same take twice in a row while there are two or more
 * (a shuffled bag); a call with no take that decodes keeps the synthesised voice, as does ?tennisCalloutRec=0 (or ?tennisCallouts=0). */
export function tennisCalloutRecEnabled(search=globalThis.location?.search||''){return param('tennisCalloutRec',search)!=='0'&&tennisCalloutsEnabled(search);}
export const CALLOUT_REC_DIR='assets/tennis-callouts-rec/';
export const CALLOUT_REC_LIST=CALLOUT_REC_DIR+'takes.json';
export const CALLOUT_REC_TAKES=3;
const TAKE=/^(out|net)-([1-9])\.(ogg|mp3)$/;
/** From the names in takes.json: per call, per take number, the files to try in order (the playable format first). */
export function recordedTakes(names,{ogg=true,dir=CALLOUT_REC_DIR}={}){
 const found={out:new Map(),net:new Map()};
 for(const name of Array.isArray(names)?names:[]){const m=TAKE.exec(String(name).split('/').pop());if(!m||+m[2]>CALLOUT_REC_TAKES)continue;const list=found[m[1]].get(+m[2])||[];if(!list.some(f=>f.ext===m[3]))list.push({ext:m[3],path:dir+m[0]});found[m[1]].set(+m[2],list);}
 const order=f=>(f.ext==='ogg')===ogg?0:1,out={};
 for(const kind of ['out','net'])out[kind]=[...found[kind].entries()].sort((a,b)=>a[0]-b[0]).map(([take,files])=>({take,files:files.sort((a,b)=>order(a)-order(b)).map(f=>f.path)}));
 return out;
}
/** A shuffled bag: every take once in random order, then a new bag that never starts with the take just played. */
export function createTakeBag(count,random=Math.random){
 let bag=[],last=-1;
 return {next(){if(count<=0)return -1;if(count===1)return last=0;if(!bag.length){bag=Array.from({length:count},(_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag[bag.length-1]===last)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}return last=bag.pop();}};
}
/** Load the recorded takes into AudioBuffers: {out:[AudioBuffer], net:[AudioBuffer]} (empty lists when there are none or nothing decodes).
 * `base` is this module's URL (the paths are relative to the island root). One take = its first file that loads and decodes. */
export async function loadRecordedCalls(context,{base,fetcher=globalThis.fetch,ogg=true,version='island-v2-20261107-22',dir=CALLOUT_REC_DIR}={}){
 const out={out:[],net:[]};
 try{
  const response=await fetcher(new URL('../'+dir+'takes.json?v='+version,base));if(!response?.ok)return out;
  const list=await response.json(),takes=recordedTakes(list?.takes,{ogg,dir});
  for(const kind of ['out','net'])for(const {files} of takes[kind])for(const path of files){
   try{const file=await fetcher(new URL('../'+path+'?v='+version,base));if(!file?.ok)continue;out[kind].push(await context.decodeAudioData(await file.arrayBuffer()));break;}catch{}
  }
 }catch{}
 return out;
}
/** v24.7 Codex callout pack (codex/tennis-callouts-v1, CC0; the design package stays in design/tennis-callouts-v1, the game loads only the
 * copies in assets/tennis-callouts-v1). Two parts are connected, both off with ?tennisCalloutPack=0 (or ?tennisCallouts=0):
 *  - the sign: the "club" plaque of the pack (out-club.svg terracotta, net-club.svg green, each with its own symbol and a brass rim) is the
 *    plate of the call, the live word OUT! / NET! sits on its text anchor in the pack's label colour;
 *  - the voice: the pack's synthesised umpire takes (one audio sprite, three takes per call) replace the v24.4 Web Audio voice, but only for
 *    a call that has no recorded take. Roy's own recordings (assets/tennis-callouts-rec) always win, so while both calls have a recorded
 *    take the sprite is not even downloaded.
 * Not connected (the engine gives no event for them): the GOOD and FAULT calls, the four crowd reactions and the line flash. */
export function tennisCalloutPackEnabled(search=globalThis.location?.search||''){return param('tennisCalloutPack',search)!=='0'&&tennisCalloutsEnabled(search);}
export const CALLOUT_PACK_DIR='assets/tennis-callouts-v1/';
/** From design/tennis-callouts-v1/manifest.json: sprite ranges [start seconds, seconds] per take, the plaque per call, the text anchor (0..1 of
 * the 256 px art) and the label colours. */
export const CALLOUT_PACK=Object.freeze({
 files:Object.freeze({ogg:CALLOUT_PACK_DIR+'callouts.ogg',mp3:CALLOUT_PACK_DIR+'callouts.mp3'}),
 takes:Object.freeze({out:Object.freeze([[.032,.543],[.671,.543],[1.31,.543]]),net:Object.freeze([[1.949,.489],[2.534,.489],[3.119,.489]])}),
 signs:Object.freeze({out:CALLOUT_PACK_DIR+'out-club.svg',net:CALLOUT_PACK_DIR+'net-club.svg'}),
 textAnchor:Object.freeze([.586,.492]),labelColors:Object.freeze({out:'#411c18',net:'#102e2b'})
});
/** The sprite as one AudioBuffer, the playable format first and the other as a fallback; null when neither loads and decodes. */
export async function loadCalloutPack(context,{base,fetcher=globalThis.fetch,opus=true,version='island-v2-20261107-22'}={}){
 for(const path of opus?[CALLOUT_PACK.files.ogg,CALLOUT_PACK.files.mp3]:[CALLOUT_PACK.files.mp3,CALLOUT_PACK.files.ogg]){
  try{const file=await fetcher(new URL('../'+path+'?v='+version,base));if(!file?.ok)continue;return await context.decodeAudioData(await file.arrayBuffer());}catch{}
 }
 return null;
}
/** Play take `index` of a call from the sprite into `destination`. Returns the seconds it lasts (0 when it could not start). */
export function playPackCall(context,destination,buffer,kind,index=0,{level=1}={}){
 const takes=CALLOUT_PACK.takes[kind],range=takes?.[((index%takes.length)+takes.length)%takes.length];
 if(!range||!context||!destination||!buffer||range[0]+range[1]>buffer.duration+.05)return 0;
 try{const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=level;source.connect(gain);gain.connect(destination);source.onended=()=>{try{source.disconnect();gain.disconnect();}catch{}};source.start(0,range[0],range[1]);return range[1];}catch{return 0;}
}
/** v24.9 spoken words (Roy on the phone, 22/11/2026: "in tennis, if words like NET and OUT can be found instead of my recordings, that is
 * best"). The first voice of a call is now a generic spoken English word: assets/tennis-callouts-v2 (three takes of "Out" and three of "Net",
 * generated offline with a text-to-speech voice, CC0, see SOURCES.md there; same file scheme and takes.json as the recorded folder).
 * The Codex pack voice was measured first and is not the first voice: it is formant synthesis (the kind Roy called "processed" in v24.4) and
 * an offline speech recogniser reads its OUT as "oh" and its NET as "men"; it keeps its v24.7 place after the recordings.
 * Order of a call: words -> Roy's recordings (only loaded when a call has no word take that decodes) -> Codex pack -> Web Audio voice.
 * ?tennisVoiceRec=1 puts Roy's recordings first again (v24.8 order, the words after them); ?tennisCalloutWords=0 removes the words. */
export function tennisCalloutWordsEnabled(search=globalThis.location?.search||''){return param('tennisCalloutWords',search)!=='0'&&tennisCalloutsEnabled(search);}
export function tennisVoiceRecFirst(search=globalThis.location?.search||''){return param('tennisVoiceRec',search)==='1';}
export const CALLOUT_WORDS_DIR='assets/tennis-callouts-v2/';
export const CALLOUT_VOICE_DIRS=Object.freeze({words:CALLOUT_WORDS_DIR,rec:CALLOUT_REC_DIR});
/** The voices a call tries, first to last: 'words' | 'rec' | 'pack' | 'synth'. */
export function calloutVoiceOrder(search=globalThis.location?.search||''){
 const words=tennisCalloutWordsEnabled(search)?['words']:[],rec=tennisCalloutRecEnabled(search)?['rec']:[];
 return [...(tennisVoiceRecFirst(search)?[...rec,...words]:[...words,...rec]),...(tennisCalloutPackEnabled(search)?['pack']:[]),'synth'];
}
/** Which voice plays a call: the first in `order` that has something for `kind`. `sets` = {words:{out:[],net:[]},rec:{...}}, `pack` = loaded or not. */
export function pickCallVoice(order,sets,pack,kind){for(const name of order){if(name==='synth')return name;if(name==='pack'){if(pack)return name;}else if(sets?.[name]?.[kind]?.length)return name;}return null;}
