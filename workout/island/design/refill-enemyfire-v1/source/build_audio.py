#!/usr/bin/env python3
"""Original sample-free synthesis; master and measure the FINAL lossy encodes.
SPDX-License-Identifier: CC0-1.0
Requires Python 3, NumPy and FFmpeg / ffprobe. No network access.
"""
from pathlib import Path
import json
import math
import re
import subprocess
import tempfile
import wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
RATE=48000


def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stderr


def measurement(path):
    out=run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-16:TP=-1:LRA=7:print_format=json','-f','null','-'])
    m=json.loads(re.findall(r'\{[^{}]+\}',out)[-1])
    return dict(integratedLUFS=float(m['input_i']),truePeakDBTP=float(m['input_tp']),loudnessRangeLU=float(m['input_lra']))


def wavefile(path,y):
    # Normalize only the synthesis source. Output LUFS normalization happens below.
    y=y/max(1,float(np.max(np.abs(y))))*.85
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes((y*32767).astype('<i2').tobytes())


def synth(kind):
    duration={'refill-pickup':.92,'incoming-shell':1.2,'enemy-cannon':1.35}[kind]
    t=np.arange(round(RATE*duration))/RATE
    rng=np.random.default_rng(7214+len(kind))
    noise=rng.normal(0,1,len(t))
    # Smoothed noise gives a soft mechanical air layer without a borrowed sample.
    air=np.convolve(noise,np.ones(17)/17,mode='same')
    y=np.zeros_like(t)
    if kind=='refill-pickup':
        for delay,freq in [(0,523.25),(.09,659.25),(.18,783.99),(.29,1046.5)]:
            u=np.maximum(0,t-delay)
            env=(t>=delay)*(1-np.exp(-u*350))*np.exp(-u*8)
            y+=env*(.22*np.sin(math.tau*freq*u)+.055*np.sin(math.tau*2*freq*u))
        y+=.14*air*(1-np.exp(-t*100))*np.exp(-t*12)
        y+=.14*np.sin(math.tau*(120*t+70*t*t))*np.exp(-t*16)
    elif kind=='incoming-shell':
        for delay in [0,.23,.46]:
            u=np.maximum(0,t-delay)
            env=(t>=delay)*(1-np.exp(-u*150))*np.exp(-u*22)
            y+=.21*env*(np.sin(math.tau*960*u)+.35*np.sin(math.tau*1440*u))
        env=(1-np.exp(-t*15))*np.exp(-t*2.9)
        phase=math.tau*(1700*t-410*t*t)
        y+=.12*np.sin(phase)*env+.13*air*env
    else:
        env=(1-np.exp(-t*800))*np.exp(-t*8)
        y+=.45*air*env
        y+=.33*np.sin(math.tau*(55*t+1.5*(1-np.exp(-t*40))))*(1-np.exp(-t*1000))*np.exp(-t*5)
        y+=.16*np.sin(math.tau*108*t)*np.exp(-t*13)
        y+=.055*noise*np.exp(-t*55)
        for delay,gain in [(.065,.12),(.14,.055),(.24,.025)]:
            u=np.maximum(0,t-delay)
            y+=gain*air*(t>=delay)*np.exp(-u*12)
        # Mid-band body keeps the short bass-heavy report audible on phone speakers.
        y+=.14*(np.sin(math.tau*220*t)+.35*np.sin(math.tau*440*t))*(1-np.exp(-t*200))*np.exp(-t*4)
        y=np.tanh(y*4)*.42
    # Exact-zero endpoints avoid clicks. Tail fades precede padding from codecs.
    y*=np.minimum(1,t/.004)*np.minimum(1,(duration-t)/.045)
    return y


def build():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    audio=ROOT/'audio'; audio.mkdir(exist_ok=True)
    entries={}
    with tempfile.TemporaryDirectory(prefix='refill-audio-') as temp:
        for kind in ['refill-pickup','incoming-shell','enemy-cannon']:
            raw=Path(temp)/f'{kind}.wav'; wavefile(raw,synth(kind))
            files={}
            for ext,codec in [('ogg',['-c:a','libvorbis','-q:a','5']),('mp3',['-c:a','libmp3lame','-b:a','160k'])]:
                path=audio/f'{kind}.{ext}'
                # Closed-loop correction includes codec overshoot and MP3/Vorbis changes.
                gain=0
                for _ in range(6):
                    run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(raw),'-af',f'highpass=f=45,acompressor=threshold=0.12:ratio=5:attack=1:release=100,volume={gain:.4f}dB,alimiter=limit=0.72:attack=1:release=60:level=false:latency=true','-ar',str(RATE),'-ac','1',*codec,'-map_metadata','-1',str(path)])
                    m=measurement(path)
                    if abs(m['integratedLUFS']+16)<=.08:
                        break
                    gain+=-16-m['integratedLUFS']
                if abs(m['integratedLUFS']+16)>.2 or m['truePeakDBTP']>-1:
                    raise ValueError((path,m))
                info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],text=True))
                stream=info['streams'][0]
                files[ext]=dict(file=str(path.relative_to(ROOT)),bytes=path.stat().st_size,codec=stream['codec_name'],sampleRateHz=int(stream['sample_rate']),channels=stream['channels'],durationSeconds=round(float(info['format']['duration']),6),**m)
                print(kind,ext,m)
            entries[kind]=dict(loop=False,originalSynthesis=True,targetLUFS=-16,toleranceLU=.2,truePeakCeilingDBTP=-1,measurement='FFmpeg loudnorm input_i/input_tp of decoded final delivery file; EBU R128 / ITU-R BS.1770',files=files)
    manifest['audio']=entries
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')


if __name__=='__main__':
    build()
