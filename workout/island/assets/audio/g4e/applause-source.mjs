// Original synthetic crowd applause, dedicated to CC0 1.0 Universal.
// Regenerate: node applause-source.mjs /tmp/applause.wav
// ffmpeg -i /tmp/applause.wav -c:a libvorbis -q:a 5 applause.ogg
// No recordings, impact samples, footsteps or third-party sound inputs.
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function synthesizeApplause(rate=44100){
 let seed=410604;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const seconds=2.8,channels=[new Float32Array(Math.ceil(rate*seconds)),new Float32Array(Math.ceil(rate*seconds))];
 // 32 independently timed people, 5-9 claps each, drifting rather than marching.
 for(let person=0;person<32;person++){
  let at=.03+random()*.5;const pan=random(),gain=.15+random()*.16;
  while(at<2.45){
   const duration=.024+random()*.034,offset=Math.floor(at*rate),decay=.004+random()*.007;
   for(let n=0;n<duration*rate;n++){
    const t=n/rate,noise=random()*2-1;
    // A few fast hand-contact transients then a short papery tail.
    const envelope=Math.exp(-t/decay)+.45*Math.exp(-Math.abs(t-.009)/.002)+.2*Math.exp(-Math.abs(t-.017)/.003);
    const value=noise*envelope*gain;
    channels[0][offset+n]+=value*Math.sqrt(1-pan);channels[1][offset+n]+=value*Math.sqrt(pan);
   }
   at+=.22+random()*.23;
  }
 }
 // Cascaded high passes remove the low, heavy energy heard as stamping.
 const alpha=Math.exp(-2*Math.PI*850/rate);
 for(const channel of channels)for(let pass=0;pass<2;pass++){
  let previous=0,filtered=0;
  for(let n=0;n<channel.length;n++){const value=channel[n];filtered=alpha*(filtered+value-previous);previous=value;channel[n]=filtered;}
 }
 let peak=0;for(const channel of channels)for(const value of channel)peak=Math.max(peak,Math.abs(value));
 for(const channel of channels)for(let n=0;n<channel.length;n++)channel[n]*=.88/peak;
 return {rate,channels};
}
export function applauseWav(){
 const {rate,channels}=synthesizeApplause(),frames=channels[0].length,data=Buffer.alloc(44+frames*4);
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*4,40);
 for(let n=0;n<frames;n++)for(let c=0;c<2;c++)data.writeInt16LE(Math.round(channels[c][n]*32767),44+n*4+c*2);
 return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)writeFileSync(process.argv[2]||'/tmp/applause.wav',applauseWav());
