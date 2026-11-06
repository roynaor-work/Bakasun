import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SOUND_CATALOG,renderSound} from '../runtime/sports-audio.mjs';

// Analysis only: Hann-windowed radix-2 FFT, 2048 samples, 50% overlap.
// This does not run in the game and makes no claim to replace human listening.
export function spectrum(samples,sampleRate) {
  const size=2048,power=new Float64Array(size/2+1);
  // Centre the first window on t=0. Starting a Hann window at t=0 would
  // suppress the very impacts this audit is meant to measure.
  for(let offset=-size/2;offset<samples.length;offset+=size/2) {
    const real=new Float64Array(size),imaginary=new Float64Array(size);
    for(let i=0;i<size;i++)real[i]=(samples[offset+i]??0)*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));
    for(let i=1,j=0;i<size;i++) {
      let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
      if(i<j)[real[i],real[j]]=[real[j],real[i]];
    }
    for(let width=2;width<=size;width*=2) {
      const angle=-2*Math.PI/width,wr=Math.cos(angle),wi=Math.sin(angle);
      for(let base=0;base<size;base+=width) {
        let rotationReal=1,rotationImaginary=0;
        for(let j=0;j<width/2;j++) {
          const even=base+j,odd=even+width/2;
          const tr=rotationReal*real[odd]-rotationImaginary*imaginary[odd];
          const ti=rotationReal*imaginary[odd]+rotationImaginary*real[odd];
          real[odd]=real[even]-tr;imaginary[odd]=imaginary[even]-ti;
          real[even]+=tr;imaginary[even]+=ti;
          const next=rotationReal*wr-rotationImaginary*wi;
          rotationImaginary=rotationReal*wi+rotationImaginary*wr;rotationReal=next;
        }
      }
    }
    for(let bin=0;bin<power.length;bin++)power[bin]+=real[bin]**2+imaginary[bin]**2;
  }
  let total=0,weighted=0,dominant=0;
  for(let bin=1;bin<power.length;bin++) {
    total+=power[bin];weighted+=power[bin]*bin*sampleRate/size;
    if(power[bin]>power[dominant])dominant=bin;
  }
  function band(low,high) {
    let sum=0;
    for(let bin=1;bin<power.length;bin++)if(bin*sampleRate/size>=low&&bin*sampleRate/size<high)sum+=power[bin];
    return total?sum/total:0;
  }
  return {centroid:total?weighted/total:0,dominant:dominant*sampleRate/size,
    bass:band(0,180),body:band(180,1000),presence:band(1000,2000),whistleBand:band(2000,4500),treble:band(4500,12001),
    above2500:band(2500,12001)};
}
export function auditCatalog() {
  return Object.keys(SOUND_CATALOG).map(name=>{
    const rendered=renderSound(name,{seed:17});
    return {name,...spectrum(rendered.samples,rendered.sampleRate)};
  });
}
export function report(rows) {
  return '# Spectral separation\n\n24 kHz PCM, seed 17, Hann FFT 2048 / hop 1024. Energy fractions are spectral observations, not perceptual realism ratings. The crowd must not have the referee whistle’s narrow high band.\n\n'+
    '| Sound | Centroid (Hz) | Strongest bin (Hz) | <180 Hz | 180–1000 Hz | 1–2 kHz | 2–4.5 kHz | >4.5 kHz |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'+
    rows.map(row=>`| ${row.name} | ${row.centroid.toFixed(0)} | ${row.dominant.toFixed(0)} | ${row.bass.toFixed(3)} | ${row.body.toFixed(3)} | ${row.presence.toFixed(3)} | ${row.whistleBand.toFixed(3)} | ${row.treble.toFixed(3)} |`).join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const output=report(auditCatalog());if(process.argv[2])await writeFile(process.argv[2],output);else process.stdout.write(output);
}
