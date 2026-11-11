/** Whistle guard: pure classification of analyser frames and of the live-play cue
 * tables. Roy heard "a strange whistle still during play" after the referee rules
 * (sports-audio-rules.mjs) shipped, so the referee sample is not the only suspect:
 * anything narrow and high that lasts is a whistle to a child's ear. The browser
 * forensics tool (tools/audio-forensics.mjs) feeds frames in; node tests feed the
 * measured sample spectra in. No audio graph here. */
export const WHISTLE_BAND={lowHz:1500,highHz:5000};
/** Live-play phases per game: a tone during these is the bug, a tone at kickoff is not. */
export const LIVE_PHASES={soccer:['playing'],streetSlam:['live'],tennis:['rally','serve','toss'],alpineRush:['racing'],islandRacing:['racing']};

/** frames: [{t, hi:{f,db,prom,rel}}] in time order, t in seconds. `hi` is the
 * strongest bin inside WHISTLE_BAND: prom = dB above the median of its +-200 Hz
 * neighbourhood (a line, not a hump), rel = dB below the frame's loudest bin.
 * A stable line (within +-tolerance of the run median) for minSeconds is a 'tone';
 * a line that slides more than tolerance but less than glideStep per frame for
 * glideSeconds is a 'glide' (siren, squeak, pitch ramp; the sneaker squeak's
 * audible high part is only ~0.3 s, but it repeats on every fast dribble). Levels
 * are analyser dB (a loud thump peaks near -45), so thresholds are relative. */
export function whistleLike(frames,{minSeconds=.6,glideSeconds=.25,humSeconds=2,lowHz=WHISTLE_BAND.lowHz,highHz=WHISTLE_BAND.highHz,glideLowHz=900,tolerance=.05,glideStep=.35,minProminenceDb=10,maxBelowPeakDb=12,strongProminenceDb=18,strongBelowPeakDb=22,minLevelDb=-95,humShare=.2,humBelowPeakDb=6}={}){
  // The sneaker squeak (basketball/shoes) starts at 1.08 kHz and jumps to its
  // second partial, so glide candidates start lower and may step up to 35% a frame.
  // A very prominent line may sit further under the frame peak: the ear hears a
  // 2 kHz line 20 dB under a 150 Hz thump (equal-loudness), the FFT peak does not.
  const tonal=f=>!!f.hi&&f.hi.f>=glideLowHz&&f.hi.f<=highHz&&f.hi.db>=minLevelDb&&((f.hi.prom>=minProminenceDb&&f.hi.rel>=-maxBelowPeakDb)||(f.hi.prom>=strongProminenceDb&&f.hi.rel>=-strongBelowPeakDb));
  const segments=[];let run=null,gap=false;
  const close=()=>{
    if(!run)return;const seconds=run.end-run.start,sorted=run.freqs.slice().sort((a,b)=>a-b),hz=sorted[sorted.length>>1],top=sorted[sorted.length-1];
    const stable=run.freqs.every(f=>Math.abs(f-hz)/hz<=tolerance),kind=stable?'tone':'glide';
    const ok=kind==='tone'?seconds+1e-6>=minSeconds&&hz>=lowHz:seconds+1e-6>=glideSeconds&&top>=lowHz;
    if(ok)segments.push({kind,start:+run.start.toFixed(3),end:+run.end.toFixed(3),seconds:+seconds.toFixed(3),hz:Math.round(hz),fromHz:Math.round(run.freqs[0]),toHz:Math.round(run.freqs[run.freqs.length-1]),maxDb:+run.maxDb.toFixed(1),frames:run.freqs.length,phases:[...run.phases]});
    run=null;
  };
  for(const f of frames){
    // One masked frame (a thump on top of the line) does not end a run.
    if(!tonal(f)){if(run&&!gap){gap=true;continue;}close();gap=false;continue;}
    const last=run?.freqs[run.freqs.length-1];
    if(run&&Math.abs(f.hi.f-last)/last>glideStep)close();
    if(!run)run={start:f.t,end:f.t,freqs:[],maxDb:-Infinity,phases:new Set()};
    gap=false;run.end=f.t;run.freqs.push(f.hi.f);run.maxDb=Math.max(run.maxDb,f.hi.db);if(f.ph)run.phases.add(f.ph);
  }
  close();
  // Hum: no single line, but a steady bright bed whose 1.5-5 kHz content is within
  // humBelowPeakDb of the loudest bin and carries humShare of the energy for seconds
  // (the synthetic crowd loop; a real crowd bed sits 17 dB down with under 1%).
  let hum=null;const closeHum=()=>{if(hum&&hum.end-hum.start+1e-6>=humSeconds)segments.push({kind:'hum',start:+hum.start.toFixed(3),end:+hum.end.toFixed(3),seconds:+(hum.end-hum.start).toFixed(3),hz:Math.round(hum.freqs.reduce((a,b)=>a+b,0)/hum.freqs.length),share:+(hum.share/hum.freqs.length).toFixed(3),maxDb:+hum.maxDb.toFixed(1),frames:hum.freqs.length,phases:[...hum.phases]});hum=null;};
  for(const f of frames){
    const bright=!!f.hi&&(f.s25??0)>=humShare&&f.hi.rel>=-humBelowPeakDb&&(f.lvl??-Infinity)>=minLevelDb;
    if(!bright){closeHum();continue;}
    if(!hum)hum={start:f.t,end:f.t,freqs:[],share:0,maxDb:-Infinity,phases:new Set()};
    hum.end=f.t;hum.freqs.push(f.hi.f);hum.share+=f.s25;hum.maxDb=Math.max(hum.maxDb,f.lvl);if(f.ph)hum.phases.add(f.ph);
  }
  closeHum();return segments.sort((a,b)=>a.start-b.start);
}

/** Energy summary per phase: mean share of 2-5 kHz and 1-2 kHz, frames, peak level. */
export function summarizeFrames(frames){
  const by={};
  for(const f of frames){const k=f.ph||'(none)',s=by[k]||(by[k]={frames:0,s25:0,s12:0,maxDb:-Infinity,audible:0});s.frames++;s.s25+=f.s25||0;s.s12+=f.s12||0;s.maxDb=Math.max(s.maxDb,f.lvl??-Infinity);if((f.lvl??-Infinity)>-80)s.audible++;}
  for(const s of Object.values(by)){s.s25=+(s.s25/s.frames).toFixed(3);s.s12=+(s.s12/s.frames).toFixed(3);s.maxDb=+s.maxDb.toFixed(1);}
  return by;
}

/** Which live-play events each sport maps to which sample. Mirrors the private maps
 * in hoops-audio.mjs (`map`, dribble), soccer-design-audio.mjs (`event`, `update`)
 * and tennis-session.mjs; the test compares them with the measured spectra so a
 * future remap to a long high tone fails before Roy hears it. */
export const LIVE_CUES={
  streetSlam:{floor:'basketball/bounce',rim:'basketball/rim',board:'g3h/kick',pad:'g3h/kick',pass:'g3h/pass',release:'g3h/pass',steal:'basketball/shoes',interception:'basketball/shoes',block:'g3h/kick',dribble:'basketball/bounce',dribbleFast:'basketball/shoes',score:'basketball/swish',scoreCrowd:'basketball/crowd-excited'},
  soccer:{shot:'soccer/kick',header:'soccer/kick',volley:'soccer/kick',post:'soccer/kick',pass:'soccer/pass',loft:'soccer/pass',throw:'soccer/pass',crowd:'soccer/crowd-calm',excited:'soccer/crowd-excited',bed:'soccer/ambience-loop'},
  tennis:{hit:'g4e/racket',bounce:'g4e/bounce',net:'g4e/net',crowdBed:'g4e/stadium-bed'}
};
/** Referee whistles are the only cues allowed to be a sustained line in the band. */
export const WHISTLE_ASSETS=new Set(['soccer/whistle','g3h/whistle']);

/** spectra: {asset:{dur, peaks:[Hz...], band2to5k, lines:[{hz,seconds,promDb}]}} measured
 * offline (verification/.../sample-spectra.json). A live cue fails when its sample is
 * longer than maxSeconds and either its strongest line sits in the band for most of
 * the sample or its dominant peak is in the band with most energy there. */
export function liveCueProblems(cues=LIVE_CUES,spectra={},{maxSeconds=.4,lowHz=WHISTLE_BAND.lowHz,highHz=WHISTLE_BAND.highHz}={}){
  const problems=[];
  for(const [game,table] of Object.entries(cues))for(const [event,asset] of Object.entries(table)){
    if(WHISTLE_ASSETS.has(asset)){problems.push({game,event,asset,reason:'referee whistle mapped to a live-play event'});continue;}
    const s=spectra[asset];if(!s)continue;
    const line=(s.lines||[]).find(l=>l.hz>=lowHz&&l.hz<=highHz&&l.seconds>maxSeconds&&l.promDb>=10);
    const dominant=s.peaks?.[0]>=lowHz&&s.peaks?.[0]<=highHz&&s.band2to5k>=.5&&s.dur>maxSeconds;
    if(line||dominant)problems.push({game,event,asset,reason:line?`sustained line ${line.hz} Hz for ${line.seconds}s`:`dominant ${s.peaks[0]} Hz, ${Math.round(s.band2to5k*100)}% of energy in 2-5 kHz, ${s.dur}s`});
  }
  return problems;
}
