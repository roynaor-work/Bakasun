#!/usr/bin/env python3
"""Original seeded physical-style synthesis. Standard Python + FFmpeg only.

No recordings, sound fonts, samples, network services or generative audio.
Writes 5 short mono sounds in OGG/Vorbis + MP3 and measured metadata.
WAV intermediates are temporary, never committed. Each deliverable <=40,000 B.
"""
from array import array
from pathlib import Path
import hashlib
import json
import math
import random
import subprocess
import tempfile
import wave

ROOT=Path(__file__).resolve().parent
RATE=44100
TAU=math.tau
SOUNDS=[('hit-01',.18,430,101),('hit-02',.21,340,102),
        ('hit-03',.24,255,103),('crack',.26,820,104),('explosion',.72,95,105)]


def synthesize(name,duration,pitch,seed):
    rng=random.Random(seed)
    n=round(duration*RATE)
    low=0
    previous=0
    samples=[]
    phase=0
    for i in range(n):
        t=i/RATE
        noise=rng.uniform(-1,1)
        low+=.075*(noise-low)
        high=noise-previous
        previous=noise
        if name.startswith('hit'):
            phase+=TAU*(pitch*math.exp(-t*20)+78)/RATE
            body=math.sin(phase)*math.exp(-t*29)*.7
            metal=sum(math.sin(TAU*pitch*k*t)*math.exp(-t*d)*a
                      for k,d,a in [(2.71,46,.2),(4.13,70,.12),(1.43,36,.16)])
            snap=high*math.exp(-t*130)*.22
            air=noise*math.exp(-t*48)*.09
            sample=body+metal+snap+air
        elif name=='crack':
            # Three fast fractures with inharmonic plate resonances.
            sample=0
            for at,amp in [(0,1),(.018,.6),(.043,.34)]:
                d=t-at
                if d>=0:
                    sample+=(high*.22*math.exp(-d*180)+sum(
                        math.sin(TAU*pitch*k*d)*math.exp(-d*rate)*a
                        for k,rate,a in [(1,45,.23),(1.59,55,.15),(2.73,85,.09)]))*amp
        else:
            # Deep falling pressure wave + filtered debris, no sustained drone.
            phase+=TAU*(pitch*math.exp(-t*8)+32)/RATE
            sample=math.sin(phase)*math.exp(-t*7)*.68
            sample+=low*math.exp(-t*5)*1.8+high*math.exp(-t*40)*.1
            for at in [.055,.11,.19,.28]:
                d=t-at
                if d>=0:
                    sample+=noise*.13*math.exp(-d*48)
        # Short attack avoids digital clicks; final 18 ms is exactly faded.
        sample*=min(1,t/.0007)*min(1,max(0,(duration-t)/.018))
        samples.append(sample)
    # Remove DC, retain headroom across overlapping SFX.
    mean=sum(samples)/n
    samples=[x-mean for x in samples]
    peak=max(abs(x) for x in samples)
    gain=(.79 if name=='explosion' else .68)/peak
    samples=[x*gain for x in samples]
    # Ensure zero endpoints after DC removal.
    for i in range(n):
        samples[i]*=min(1,i/32,(n-1-i)/128)
    return samples


def main():
    metadata=[]
    (ROOT/'audio').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='alien-hits-') as tmp:
        for name,duration,pitch,seed in SOUNDS:
            samples=synthesize(name,duration,pitch,seed)
            pcm=array('h',(round(x*32767) for x in samples))
            import sys
            if sys.byteorder!='little': pcm.byteswap()
            wav=Path(tmp)/f'{name}.wav'
            with wave.open(str(wav),'wb') as w:
                w.setparams((1,2,RATE,0,'NONE','not compressed'))
                w.writeframes(pcm.tobytes())
            sources=[]
            for ext,codec,args in [('ogg','libvorbis',['-q:a','3','-fflags','+bitexact','-flags:a','+bitexact']),
                                   ('mp3','libmp3lame',['-b:a','64k','-write_xing','1'])]:
                path=f'audio/{name}.{ext}'
                subprocess.run(['ffmpeg','-y','-v','error','-i',str(wav),'-map_metadata','-1',
                                '-ac','1','-ar',str(RATE),'-c:a',codec,*args,str(ROOT/path)],check=True)
                size=(ROOT/path).stat().st_size
                if size>40000: raise ValueError(f'{path}: {size} > 40000')
                sources.append(path)
            metadata.append({'id':name,'durationMs':round(duration*1000),'sampleRate':RATE,
                'channels':1,'sources':sources,'seed':seed,
                'synthesisPeakDbFS':round(20*math.log10(max(abs(x) for x in samples)),2),
                'synthesisRmsDbFS':round(20*math.log10(math.sqrt(sum(x*x for x in samples)/len(samples))),2),
                'pcmSha256':hashlib.sha256(pcm.tobytes()).hexdigest()})
    (ROOT/'audio-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps([{'id':a['id'],'ms':a['durationMs'],
                      'bytes':[ (ROOT/p).stat().st_size for p in a['sources']]} for a in metadata]))


if __name__=='__main__': main()
