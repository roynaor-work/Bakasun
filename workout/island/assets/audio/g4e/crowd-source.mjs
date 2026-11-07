// Original synthetic tennis crowd, dedicated to CC0 1.0 Universal. No recordings or third-party audio.
// Regenerate: node crowd-source.mjs /tmp/crowd && for n in applause-soft applause-big crowd-murmur crowd-ooh; do ffmpeg -y -i /tmp/crowd/$n.wav -c:a libvorbis -q:a 3 $n.ogg; done
// Soft, layered, rounded: band-limited noise shaped by many smooth (not sharp) hand events, a slow swell, low-passed so there are no hard peaks.
import {writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const RATE=32000;
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function biquad(type,f,q,rate=RATE){const w=2*Math.PI*f/rate,a=Math.sin(w)/(2*q),c=Math.cos(w);let b0,b1,b2,a0=1+a,a1=-2*c,a2=1-a;
 if(type==='lp'){b0=(1-c)/2;b1=1-c;b2=(1-c)/2;}else if(type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;}else{b0=a;b1=0;b2=-a;}
 let x1=0,x2=0,y1=0,y2=0;return x=>{const y=(b0*x+b1*x1+b2*x2-a1*y1-a2*y2)/a0;x2=x1;x1=x;y2=y1;y1=y;return y;};}
function render({seconds,people,density,swell,seed,loop=false,bandLow=700,bandHigh=4200,gain=.9,formant=null}){
 const n=Math.ceil(seconds*RATE),out=[new Float32Array(n),new Float32Array(n)],r=rng(seed);
 for(let ch=0;ch<2;ch++){
  const raw=new Float32Array(n),nz=rng(seed+ch*97+1);
  for(let p=0;p<people;p++){
   let at=r()*.4;const pan=r();
   while(at<seconds){
    const rate=density(at/seconds);if(r()<rate){const len=Math.floor((.012+r()*.03)*RATE),start=Math.floor(at*RATE),amp=(.3+r()*.7)*(ch?Math.sqrt(pan):Math.sqrt(1-pan));
     for(let k=0;k<len&&start+k<n;k++){const t=k/len,env=Math.sin(Math.PI*Math.min(1,t*1.15))**2*Math.exp(-3*t);raw[start+k]+=(nz()*2-1)*env*amp;}}
    at+=.035+r()*.07;
   }
  }
  // continuous soft bed so the claps sit in a crowd rather than a rattle
  const bed=biquad('bp',1800,.5),f1=biquad('hp',bandLow,.7),f2=biquad('lp',bandHigh,.7),f3=biquad('lp',bandHigh*1.2,.5),vowels=formant?formant.map(f=>biquad('bp',f,3)):null;
  for(let i=0;i<n;i++){const t=i/RATE/seconds;let v=raw[i]+bed(nz()*2-1)*.035*(.4+swell(t));
   if(vowels)v=vowels.reduce((a,f)=>a+f(nz()*2-1),0)*.9;
   v=f3(f2(f1(v)));out[ch][i]=v*swell(t)*gain;}
 }
 if(loop){const fade=Math.floor(RATE*.6);for(const c of out)for(let i=0;i<fade;i++){const a=i/fade;c[i]=c[i]*a+c[n-fade+i]*(1-a);}for(const c of out)out[0]===c?0:0;
  for(let ch=0;ch<2;ch++)out[ch]=out[ch].slice(0,n-fade);}
 // normalise to a gentle peak with a soft knee: nothing can clip
 let peak=0;for(const c of out)for(const v of c)peak=Math.max(peak,Math.abs(v));const k=.5/(peak||1);
 for(const c of out)for(let i=0;i<c.length;i++){const v=c[i]*k;c[i]=Math.tanh(v*1.2)/1.2;}
 return out;
}
export const SOUNDS={
 'applause-soft':()=>render({seconds:1.7,people:26,density:t=>.55,swell:t=>Math.sin(Math.PI*Math.min(1,t**.7*1))**1.3*Math.exp(-t*1.4)+.02,seed:11}),
 'applause-big':()=>render({seconds:3.6,people:48,density:t=>.7,swell:t=>Math.min(1,t*6)*Math.exp(-Math.max(0,t-.45)*2.4)+.03,seed:23}),
 'crowd-murmur':()=>render({seconds:8,people:14,density:t=>.1,swell:t=>.5+.18*Math.sin(2*Math.PI*t*2)+.1*Math.sin(2*Math.PI*t*3+1),seed:37,loop:true,bandLow:260,bandHigh:2400,gain:.55,formant:[420,760,1500]}),
 'crowd-ooh':()=>render({seconds:1.2,people:0,density:t=>0,swell:t=>Math.sin(Math.PI*t)**1.6,seed:51,bandLow:260,bandHigh:1800,gain:.7,formant:[360,700,1400]})
};
export function wav(chans){const frames=chans[0].length,d=Buffer.alloc(44+frames*4);d.write('RIFF');d.writeUInt32LE(d.length-8,4);d.write('WAVEfmt ',8);d.writeUInt32LE(16,16);d.writeUInt16LE(1,20);d.writeUInt16LE(2,22);d.writeUInt32LE(RATE,24);d.writeUInt32LE(RATE*4,28);d.writeUInt16LE(4,32);d.writeUInt16LE(16,34);d.write('data',36);d.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++)for(let c=0;c<2;c++)d.writeInt16LE(Math.round(Math.max(-1,Math.min(1,chans[c][i]))*32767),44+i*4+c*2);return d;}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const dir=process.argv[2]||'/tmp/crowd';mkdirSync(dir,{recursive:true});for(const [name,fn] of Object.entries(SOUNDS))writeFileSync(`${dir}/${name}.wav`,wav(fn()));}
