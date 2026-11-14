"""Original deterministic, wordless mechanical/crew sound synthesis. CC0-1.0.
All delivered codecs are decoded and independently remeasured by FFmpeg.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

BASE = Path(__file__).resolve().parent.parent
SR = 48000
SEED = 20261114
SOUNDS = [('wheel_gun_loosen', 1.20), ('wheel_gun_tighten', 1.15), ('jack', 1.65),
          ('wheel_drop', 1.25), ('crew_cheer', 2.80), ('wheel_attach', .85), ('engine_exit', 3.40)]


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def measure(path):
    stderr = run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(path), '-af',
                  'loudnorm=I=-16:TP=-1.2:LRA=8:print_format=json', '-f', 'null', '-']).stderr
    data = json.loads(re.findall(r'\{\s*"input_i".*?\}', stderr, re.S)[-1])
    return {'integratedLUFS': float(data['input_i']), 'truePeakDBTP': float(data['input_tp']),
            'loudnessRangeLU': float(data['input_lra']), 'thresholdLUFS': float(data['input_thresh'])}


def noise(n, seed, lo=100, hi=12000):
    rng = np.random.default_rng(seed)
    values = sosfilt(butter(3, [lo, hi], btype='bandpass', fs=SR, output='sos'), rng.standard_normal(n))
    return values / max(np.std(values), 1e-8)


def impact(t, at, decay, seed, frequency=160):
    dt = np.maximum(t - at, 0)
    env = (t >= at) * (1 - np.exp(-dt * 1800)) * np.exp(-dt / decay)
    body = np.sin(2 * np.pi * (frequency * dt + 8 * .08 * (1 - np.exp(-dt / .08))))
    return env * (.65 * body + .33 * noise(len(t), seed, 150, 9000))


def synth(name, duration, seed):
    t = np.arange(round(duration * SR)) / SR
    rng = np.random.default_rng(seed)
    pan = np.zeros(len(t))
    if name.startswith('wheel_gun'):
        tight = name.endswith('tighten')
        start, stop = .09, .89
        gate = (t >= start) * (t < stop)
        rpm = 115 + (65 if tight else -40) * t / duration
        phase = 2 * np.pi * np.cumsum(rpm) / SR
        pulses = (.28 + .72 * np.maximum(0, np.sin(phase)) ** 4)
        # Ratchet teeth, pneumatic body, and a distinct release hiss.
        x = gate * pulses * (.50 * noise(len(t), seed, 850, 14500)
                              + .24 * np.sin(phase * 3) + .18 * np.sin(phase * 7))
        for i, at in enumerate(np.arange(.14, .88, .075 if tight else .09)):
            x += .16 * impact(t, at, .012, seed + i + 10, 900)
        x += .14 * noise(len(t), seed + 1, 2500, 17000) * np.exp(-np.maximum(0, t - stop) / .065) * (t >= stop)
        x += .28 * impact(t, .88, .035, seed + 2, 1150 if tight else 720)
    elif name == 'jack':
        x = np.zeros(len(t))
        for i, at in enumerate([.12, .48, .84, 1.20]):
            x += .5 * impact(t, at, .10, seed + i, 95)
            dt = np.maximum(t - at, 0)
            x += .18 * noise(len(t), seed + 10 + i, 500, 3200) * (t >= at) * np.exp(-dt / .12)
            x += .1 * np.sin(2 * np.pi * (350 * dt - 35 * dt * dt)) * (t >= at) * np.exp(-dt / .09)
    elif name == 'wheel_drop':
        x = .95 * impact(t, .14, .16, seed, 72)
        x += .45 * impact(t, .43, .11, seed + 1, 91)
        x += .22 * impact(t, .65, .07, seed + 2, 105)
        x += .09 * impact(t, .81, .05, seed + 3, 115)
        x += .1 * noise(len(t), seed + 4, 100, 1000) * np.sin(np.pi * np.clip((t - .25) / .85, 0, 1)) ** 2
    elif name == 'wheel_attach':
        x = .6 * impact(t, .12, .10, seed, 180)
        for i, at in enumerate([.32, .365, .40]):
            x += .40 * impact(t, at, .035, seed + i + 1, 850 + i * 200)
        x += .09 * noise(len(t), seed + 4, 300, 3500) * np.exp(-np.maximum(0, t - .12) / .18) * (t >= .12)
    elif name == 'crew_cheer':
        # Wordless synthetic vowels, seven independent voices; no speech or recording.
        voices = []
        for i in range(7):
            at = .10 + i * .055
            dt = np.maximum(0, t - at)
            length = 1.65 + rng.uniform(-.2, .3)
            env = np.sin(np.pi * np.clip(dt / length, 0, 1)) ** .65 * (t >= at) * (dt < length)
            pitch = (125 + i * 13) * (1 + .09 * np.sin(2 * np.pi * .5 * dt))
            phase = 2 * np.pi * np.cumsum(pitch) / SR
            voice = np.zeros(len(t))
            for k in range(1, 35):
                hz = pitch * k
                formants = sum(a * np.exp(-((hz - f) / width) ** 2)
                               for f, width, a in [(520, 110, 1.3), (980, 160, .8), (2400, 340, .35)])
                voice += formants * np.sin(k * phase + i * .7) / k ** .65
            voice += .035 * noise(len(t), seed + i, 700, 7000)
            voices.append(voice * env)
        x = sum(voices) / 4
        for i, at in enumerate([.35, .59, .88, 1.16, 1.38, 1.63, 1.90, 2.12]):
            x += .2 * impact(t, at, .028, seed + 20 + i, 1500)
        pan = .10 * sum(v * (-1 if i % 2 else 1) for i, v in enumerate(voices))
    else:
        # Generic small racing engine: harmonic ignition pulses and accelerating exhaust.
        rpm = 1250 + 9200 * np.clip((t - .18) / 2.8, 0, 1) ** 1.2
        frequency = rpm / 20
        phase = 2 * np.pi * np.cumsum(frequency) / SR
        x = sum(np.sin(k * phase + .15 * k) / k ** .82 for k in range(1, 23))
        x = np.tanh(x * .85)
        x += .19 * noise(len(t), seed, 250, 9500) * (.6 + .4 * np.sin(phase) ** 2)
        x *= .55 + .45 * np.sin(np.pi * np.clip(t / duration, 0, 1))
        x *= np.exp(-np.maximum(0, t - 2.1) * 1.6)
        pan = x * np.linspace(-.20, .35, len(t))
    fade = np.minimum(1, t / .015) * np.minimum(1, (duration - t) / .035)
    x, pan = x * fade, pan * fade
    stereo = np.column_stack((x - pan, x + pan))
    stereo *= .65 / max(np.max(np.abs(stereo)), 1e-8)
    return stereo.astype(np.float32)


def main():
    (BASE / 'audio').mkdir(exist_ok=True)
    results = []
    with tempfile.TemporaryDirectory(prefix='racing-pit-audio-') as folder:
        temp = Path(folder)
        for i, (name, duration) in enumerate(SOUNDS):
            source = temp / (name + '.wav')
            normalized = temp / (name + '-normalized.wav')
            wavfile.write(source, SR, synth(name, duration, SEED + i * 100))
            # Two-pass EBU R128 normalization followed by a little peak headroom for codecs.
            analysis = run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(source), '-af',
                            'loudnorm=I=-16:TP=-1.8:LRA=8:print_format=json', '-f', 'null', '-']).stderr
            stats = json.loads(re.findall(r'\{\s*"input_i".*?\}', analysis, re.S)[-1])
            normalizer = ('loudnorm=I=-16:TP=-1.8:LRA=8:linear=true:'
                          f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
                          f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
                          f'offset={stats["target_offset"]}')
            run(['ffmpeg', '-y', '-hide_banner', '-nostdin', '-i', str(source), '-af', normalizer,
                 '-ar', str(SR), '-c:a', 'pcm_f32le', str(normalized)])
            files = []
            for extension, encoder in [('ogg', ['-c:a', 'libvorbis', '-q:a', '5']),
                                        ('mp3', ['-c:a', 'libmp3lame', '-b:a', '160k'])]:
                output = BASE / 'audio' / f'{name}.{extension}'
                gain = 0
                for attempt in range(10):
                    run(['ffmpeg', '-y', '-hide_banner', '-nostdin', '-i', str(normalized), '-af',
                         'acompressor=threshold=0.125:ratio=4:attack=1:release=60,'
                         f'volume={gain:.4f}dB,alimiter=limit=0.68:level=false:attack=5:release=70:latency=true',
                         '-ar', str(SR), '-map_metadata', '-1', *encoder, str(output)])
                    measurements = measure(output)
                    difference = -16 - measurements['integratedLUFS']
                    if abs(difference) <= .12:
                        break
                    gain += difference
                if abs(measurements['integratedLUFS'] + 16) > .2 or measurements['truePeakDBTP'] > -1:
                    raise ValueError(f'{output.name}: loudness/peak target missed: {measurements}')
                probe = json.loads(run(['ffprobe', '-v', 'error', '-show_entries',
                                         'stream=codec_name,sample_rate,channels:format=duration',
                                         '-of', 'json', str(output)]).stdout)
                files.append({'file': f'audio/{output.name}', 'bytes': output.stat().st_size,
                              'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                              'codec': probe['streams'][0]['codec_name'], 'sampleRateHz': SR, 'channels': 2,
                              'decodedDurationSeconds': float(probe['format']['duration']), **measurements})
            results.append({'id': name, 'durationSeconds': duration, 'loop': False,
                            'origin': 'original deterministic wordless synthesis; no recordings', 'files': files})
            print(name, [(f['codec'], f['integratedLUFS'], f['truePeakDBTP']) for f in files], flush=True)
    data = {'schemaVersion': 1, 'targetLUFS': -16, 'toleranceLU': .2, 'maxTruePeakDBTP': -1,
            'measurement': 'FFmpeg EBU R128 loudnorm input measurement after decoding each delivered codec',
            'seed': SEED, 'sounds': results}
    (BASE / 'verification' / 'audio.json').write_text(json.dumps(data, indent=2) + '\n')


if __name__ == '__main__':
    main()
