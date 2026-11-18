/** Aliens v11 (Roy, 07/11/2026): the player's gun uses exactly the boar island's basic machine-gun
 * sound, plus a laser burst of 2-4 shots every 5-6 s with its own sound; small explosions only for
 * strong aliens / every few kills (a cooldown stops flooding), a big one for the boss; denser and
 * better-shaped alien fire in stages 1-3; guaranteed but short bonuses (pity timer).
 * ?alienV11=0 (or globalThis.__alienV11=false) restores v10. Numbers: config.json alienDefense.v11.
 * Dependency-free so tests and sims can import it. */
export function alienV11Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV11){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV11')!=='0';
}
/** Boar island basic rifle ("mg" in minigames/boar-island/game.js sfx.play): same three layers and
 * parameters, so the two games sound the same. */
export const BOAR_MG=Object.freeze({
 layers:[{kind:'noise',dur:.07,type:'bandpass',f0:2200,f1:700,gain:.42,q:.7},{kind:'tone',dur:.08,type:'sine',f0:140,f1:45,gain:.38},{kind:'noise',dur:.025,type:'highpass',f0:5000,f1:3000,gain:.12,q:.8}],
 pitchLow:.92,pitchHigh:1.08,minGap:.045
});
/** Laser: thin bright zap, clearly different from the MG thump. */
export const LASER_SFX=Object.freeze({layers:[{kind:'tone',dur:.16,type:'sawtooth',f0:2400,f1:520,gain:.11},{kind:'tone',dur:.11,type:'sine',f0:3600,f1:900,gain:.09},{kind:'noise',dur:.05,type:'highpass',f0:6000,f1:3500,gain:.05,q:.8}],minGap:.06});
/** Should this kill get a visible/audible explosion? Strong aliens and every Nth kill, with a cooldown. */
export function blastRule({boss=false,baseHp=1,kills=0,cooldown=0},v11){
 if(boss)return 'big';
 if(cooldown>0)return null;
 return baseHp>=v11.blastHp||kills%v11.blastEvery===0?'small':null;
}

/** White-noise buffer like the boar game's `sfx.noise` (a full second of uniform noise). */
export function whiteNoise(context){const b=context.createBuffer(1,context.sampleRate,context.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b;}
/** Play synthesised layers (same graph as the boar game's noiseHit/tone helpers). */
export function playLayers(context,master,noise,layers,t,{vol=1,pitch=1}={}){
 for(const l of layers){
  const gain=context.createGain();gain.gain.setValueAtTime(l.gain*vol,t);gain.gain.exponentialRampToValueAtTime(.0008,t+l.dur);gain.connect(master);
  if(l.kind==='noise'){
   const s=context.createBufferSource();s.buffer=noise;s.playbackRate.value=.9+Math.random()*.2;const f=context.createBiquadFilter();f.type=l.type;f.Q.value=l.q??.8;f.frequency.setValueAtTime(l.f0*pitch,t);f.frequency.exponentialRampToValueAtTime(Math.max(20,l.f1),t+l.dur);
   s.connect(f);f.connect(gain);s.start(t,Math.random()*.5);s.stop(t+l.dur+.02);
  }else{
   const o=context.createOscillator();o.type=l.type;o.frequency.setValueAtTime(l.f0*pitch,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,l.f1),t+l.dur);o.connect(gain);o.start(t);o.stop(t+l.dur+.02);
  }
 }
}
