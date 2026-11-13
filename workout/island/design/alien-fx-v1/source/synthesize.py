"""SPDX-License-Identifier: CC0-1.0. Original sample-free sci-fi sound design.

Requires Python 3, NumPy and FFmpeg. Creates deterministic mono 48 kHz masters
in a temporary directory, encodes, then measures each decoded delivery file.
"""
from pathlib import Path
import json, math, re, subprocess, tempfile, wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
RNG = np.random.default_rng(7112026)
(ROOT / 'audio').mkdir(exist_ok=True)

def noise(n, width=17):
    return np.convolve(RNG.normal(0, 1, n), np.ones(width) / math.sqrt(width), mode='same')

def tone(freq):
    return np.sin(np.cumsum(freq) * (2 * np.pi / SR))

def soft_edges(x, attack=.003, release=.025):
    a, r = int(SR * attack), int(SR * release)
    x[:a] *= np.sin(np.linspace(0, np.pi/2, a))**2
    x[-r:] *= np.cos(np.linspace(0, np.pi/2, r))**2
    return np.tanh(x * .85) * .75

def make_vulcan():
    t = np.arange(int(SR*.5))/SR
    x = np.zeros(len(t))
    bed = noise(len(t), 23)
    for start in np.arange(0, .46, .0625):
        u = np.maximum(0, t-start)
        env = np.exp(-u*61) * (t >= start)
        x += env * (.43*tone(110+190*np.exp(-u*100)) + .26*bed)
    return soft_edges(x)

def make_overheat():
    t = np.arange(int(SR*.4))/SR
    # A soft mechanical power-down with a cooling-air release, no speech/alarm.
    x = .37*tone(100+430*np.exp(-t*9)) * np.exp(-t*6)
    x += .27*noise(len(t), 33)*(1-np.exp(-t*45))*np.exp(-t*7)
    x += .10*tone(70+150*np.exp(-t*12))*np.exp(-t*10)
    return soft_edges(x, .008, .045)

def make_boss():
    t = np.arange(int(SR*1.5))/SR
    # Rounded low impact, expanding low-mid rumble and a small sparkling tail.
    x = .62*tone(48+110*np.exp(-t*22))*np.exp(-t*4.8)
    x += .34*noise(len(t), 51)*np.exp(-t*3.7)
    x += .17*noise(len(t), 11)*np.exp(-t*8)
    for delay in [.075, .16, .28]:
        u=np.maximum(0,t-delay)
        x += .1*tone(115+90*np.exp(-u*20))*np.exp(-u*11)*(t>=delay)
    x += .035*tone(760+60*np.sin(t*8))*(1-np.exp(-t*4))*np.exp(-t*3)
    return soft_edges(x, .006, .12)

def run(args):
    return subprocess.run(['ffmpeg','-hide_banner','-nostdin','-y',*args],capture_output=True,text=True,check=True)

def measure(path):
    # Analysis-only silence gives sub-second cues enough EBU measurement blocks.
    # This analysis padding is never written into the delivered sound.
    result=run(['-i',str(path),'-af','apad=pad_dur=0.4,loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'])
    return json.loads(re.findall(r'\{[^{}]+\}',result.stderr)[-1])

sounds=[]
with tempfile.TemporaryDirectory(prefix='alien-fx-') as tmp:
    for name, seconds, x in [('vulcan-burst',.5,make_vulcan()),('overheat',.4,make_overheat()),('boss-explosion',1.5,make_boss())]:
        master=Path(tmp)/(name+'.wav')
        with wave.open(str(master),'wb') as out:
            out.setparams((1,2,SR,0,'NONE','not compressed'))
            out.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())
        compressed=Path(tmp)/(name+'-compressed.wav')
        run(['-i',str(master),'-af','acompressor=threshold=0.08:ratio=6:attack=0.3:release=35:knee=4',
             '-c:a','pcm_s24le',str(compressed)])
        before=measure(compressed)
        norm=f'volume={-16-float(before["input_i"])}dB'
        normalized=Path(tmp)/(name+'-normalized.wav')
        run(['-i',str(compressed),'-af',norm,'-ar',str(SR),'-c:a','pcm_f32le',str(normalized)])
        variants=[]
        for ext,codec in [('ogg',['-c:a','libvorbis','-q:a','6']),('mp3',['-c:a','libmp3lame','-b:a','192k'])]:
            path=ROOT/'audio'/f'{name}.{ext}'
            # Measure after lossy encoding, correct small codec gain changes.
            gain=0.
            pad_samples=0
            for attempt in range(8):
                filters=f'volume={gain}dB,alimiter=limit=0.66:attack=0.1:release=15:level=false:latency=true'
                if pad_samples: filters+=f',apad=pad_len={pad_samples}'
                run(['-i',str(normalized),'-af',filters,'-ar',str(SR),*codec,'-map_metadata','-1',str(path)])
                decoded=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-'],capture_output=True,check=True).stdout
                sample_count=len(decoded)//4
                if sample_count < len(x):
                    # Compensate the Vorbis encoder/decoder's 128-sample tail.
                    pad_samples+=len(x)-sample_count
                    continue
                reading=measure(path)
                delta=-16-float(reading['input_i'])
                if abs(delta)<=.1: break
                gain+=delta
            variants.append({'path':str(path.relative_to(ROOT)),'mimeType':'audio/ogg' if ext=='ogg' else 'audio/mpeg','codec':'vorbis' if ext=='ogg' else 'mp3','integratedLufs':float(reading['input_i']),'truePeakDbtp':float(reading['input_tp']),'decodedSamples':sample_count,'decodedDurationSeconds':sample_count/SR})
            assert abs(float(reading['input_i'])+16)<=.15, reading
            assert float(reading['input_tp']) <= -1.0, reading
            assert sample_count == len(x), (name,ext,sample_count,len(x))
        sounds.append({'id':name,'durationSeconds':seconds,'sampleRate':SR,'channels':1,'targetLufs':-16,'loop':False,'variants':variants})
measurements={'method':'FFmpeg 7.1 loudnorm, EBU R128 / ITU-R BS.1770, measured after decoding each delivered file with 400 ms analysis-only trailing silence; gating active. Analysis padding is not written into files. Vorbis tail compensation preserves the requested decoded duration. Short cues use integrated loudness, not momentary LUFS.','sounds':sounds}
(ROOT/'source/audio-measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
print(json.dumps(measurements,indent=2))
