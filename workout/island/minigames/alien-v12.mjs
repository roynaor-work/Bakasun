/** Aliens v12 (Roy, 07/11/2026): the ship fires like a Vulcan (M61-style Gatling): two wing cannons with
 * rotating barrels, a very fast stream of small bullets (same damage per second as before: bullet damage
 * is scaled by the rate), muzzle flashes and sparks, a slight shake, and a continuous BRRRT sound
 * (about 66 pulses per second, spin-up and spin-down) synthesised locally from noise and sine pulses.
 * ?alienV12=0 (or globalThis.__alienV12=false) restores v11. Numbers: config.json alienDefense.v12.
 * Dependency-free so tests and sims can import it. */
export function alienV12Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV12){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV12')!=='0';
}
/** One loop of the Vulcan sound: `hz` pulses per second for exactly one second (whole periods, so the
 * loop is seamless). Each pulse is a 2 ms noise crack on top of a short 110 Hz thump. Pure maths, no
 * recordings; deterministic for a given seed. */
export function vulcanSamples(sampleRate,hz=66,seed=7){
 const period=Math.round(sampleRate/hz),count=Math.round(hz),out=new Float32Array(period*count);
 let s=seed>>>0||1;const rnd=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};
 for(let k=0;k<count;k++){
  const amp=.82+.18*rnd(),base=k*period;
  for(let i=0;i<period;i++){const t=i/sampleRate;out[base+i]=amp*((rnd()*2-1)*Math.exp(-t/.0016)*.85+Math.sin(2*Math.PI*110*t)*Math.exp(-t/.006)*.75);}
 }
 let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));if(peak>0)for(let i=0;i<out.length;i++)out[i]/=peak;
 return out;
}
/** Spin-up / spin-down envelope: playbackRate and gain at `age` seconds after start (up) or stop (down). */
export function vulcanSpin(age,up=true,{upSeconds=.35,downSeconds=.45,minRate=.35}={}){
 if(up){const k=Math.min(1,age/upSeconds);return {rate:minRate+(1-minRate)*k*k*(3-2*k),gain:Math.min(1,age/.08)};}
 const k=Math.min(1,age/downSeconds);return {rate:1-(1-minRate+.1)*k,gain:1-k};
}
