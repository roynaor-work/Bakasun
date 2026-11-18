#!/usr/bin/env python3
"""Original, deterministic synthesis. CC0-1.0. Python + NumPy + SciPy + FFmpeg."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 44100
SEED = 20261107
CORE = 3 * SR
GUARD = 6615  # 150 ms of circular continuation on each side; not silence.


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def noise(n, seed, low=80, high=9000):
    """FFT-shaped circular noise: no filter startup transient or edge splice."""
    rng = np.random.default_rng(seed)
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = (1 - np.exp(-(f / low) ** 4)) * np.exp(-(f / high) ** 4)
    z = np.fft.rfft(rng.normal(size=n)) * shape
    x = np.fft.irfft(z, n)
    return x / np.std(x)


def engine(rpm, seed):
    t = np.arange(CORE) / SR
    # Six cylinders, four-stroke: three firing events per crank revolution.
    firing = rpm / 20
    cycle = rpm / 120
    phase = 2 * np.pi * firing * t + .07 * np.sin(2 * np.pi * 2 * t)
    x = np.zeros(CORE)
    for k in range(1, int(11000 / firing) + 1):
        hz = k * firing
        resonance = .7 + 1.7 * np.exp(-((hz - 2100) / 650) ** 2)
        x += resonance / k ** .88 * np.sin(k * phase + .16 * k)
    x *= 1 + .10 * np.sin(2 * np.pi * cycle * t)
    x += .23 * np.sin(2 * np.pi * cycle * t)
    x += .13 * noise(CORE, seed, 800, 10500) * (1 + .25 * np.sin(phase))
    # Exhaust saturation, not a recording of any particular vehicle.
    return np.tanh(x * 1.1)


def burst(t, start, decay, seed):
    u = np.maximum(t - start, 0)
    env = (t >= start) * (1 - np.exp(-u * 2200)) * np.exp(-u / decay)
    return env * (.75 * noise(len(t), seed, 150, 8500)
                  + .7 * np.sin(2 * np.pi * (125 * u + 120 * decay * (1 - np.exp(-u / decay)))))


def event(kind, duration, seed):
    t = np.arange(round(duration * SR)) / SR
    n = len(t)
    air = noise(n, seed, 450, 10500)
    if kind == 'shift-up':
        # Engine tail, 45 ms ignition cut, then a compact exhaust pop.
        tone = np.sin(2 * np.pi * (650 * t - 180 * t * t))
        x = .65 * tone * np.exp(-t * 5) * ((t < .055) | (t > .10))
        x += burst(t, .105, .060, seed + 1)
    elif kind == 'shift-down':
        phase = 2 * np.pi * (300 * t + 165 * (.12 * np.log(np.cosh((t - .14) / .12)) + t))
        x = .6 * np.sin(phase) * np.sin(np.pi * t / duration) ** 2
        for i, at in enumerate((.045, .22, .34)):
            x += .75 * burst(t, at, .055, seed + i + 1)
    elif kind == 'turbo-blowoff':
        env = (1 - np.exp(-t * 160)) * np.exp(-t * 6)
        x = env * (air + .4 * np.sin(2 * np.pi * (3300 * t - 1300 * t * t)))
        x *= .8 + .2 * np.sin(2 * np.pi * (55 * t - 18 * t * t))
    elif kind == 'startup':
        freq = 24 + 190 / (1 + np.exp(-(t - .75) * 9))
        phase = np.cumsum(2 * np.pi * freq / SR)
        body = np.sin(phase) + .55 * np.sin(2 * phase) + .3 * np.sin(4 * phase)
        x = body * (.35 + .65 / (1 + np.exp(-(t - .72) * 15)))
        x += .2 * air * (.6 + .4 * np.sin(phase))
    elif kind.startswith('exhaust-pop'):
        x = burst(t, .03, .075 + (seed % 3) * .015, seed + 1)
        x += .33 * burst(t, .17, .045, seed + 2)
    elif kind == 'kerb-rumble':
        envelope = np.sin(np.pi * t / duration) ** .6
        phase = 2 * np.pi * (38 * t + 11 * t * t)
        x = envelope * (.85 * np.sin(phase) + .4 * np.sin(phase * 3) + .32 * air)
        x *= .6 + .4 * np.maximum(np.sin(phase), 0)
    elif kind == 'pass-whoosh':
        envelope = np.exp(-((t - duration * .48) / .31) ** 2)
        # Continuous mono Doppler fall through the pass; no stereo dependency.
        phase = 2 * np.pi * (820 * t - 190 * t * t)
        x = envelope * (.75 * air + .5 * np.sin(phase) + .22 * np.sin(phase * 3))
    else:
        raise ValueError(kind)
    # One-shot edges are quiet; all internal transients remain intentional.
    fade = np.minimum(t / .012, 1) * np.minimum((duration - t) / .045, 1)
    x = np.tanh(x * 1.6)
    if kind.startswith('exhaust-pop'):
        x = np.sign(x) * np.abs(x) ** .5
        # Band-limit the nonlinear crack before a perceptual codec; otherwise
        # removed ultrasonic energy can reconstruct an excessive transient.
        f = np.fft.rfftfreq(n, 1 / SR)
        x = np.fft.irfft(np.fft.rfft(x) * np.exp(-(f / 6500) ** 8), n)
    x *= fade
    # Tame crest factor of very short pops before loudness normalization.
    return x


def loop_boundary(x):
    """Choose an ordinary low-slope seam without fading or inserting silence."""
    d = np.roll(x, -1) - x
    dd = np.roll(d, -1) - d
    candidates = np.argsort(np.abs(d) + 2 * np.abs(dd))[:1500]
    best = None
    for k in candidates:
        a = x[(np.arange(k - 441, k) % len(x))]
        b = x[(np.arange(k, k + 441) % len(x))]
        ratio = abs(20 * np.log10((np.std(a) + 1e-8) / (np.std(b) + 1e-8)))
        score = abs(d[(k - 1) % len(x)]) + .01 * ratio
        if best is None or score < best[0]:
            best = (score, k)
    return np.roll(x, -int(best[1]))


def measure(path):
    p = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
             'loudnorm=I=-16:TP=-3:LRA=7:print_format=json', '-f', 'null', '-'])
    log = p.stderr.decode()
    return json.loads(log[log.rfind('{'):log.rfind('}') + 1])


def encoded_loop_points(asset):
    """Select one shared seam in both decoded codecs, inside circular guards.

    Perceptual codecs quantize repeated material differently. Choosing from
    equivalent phases avoids a codec-dependent click without altering sound.
    """
    candidates = np.arange(GUARD - 2205, GUARD + 2206)
    score = np.zeros(len(candidates))
    for file in asset['files'].values():
        x = np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(ROOT / file['path']),
                               '-f', 'f32le', '-']).stdout, dtype='<f4').astype(float)
        end = candidates + CORE
        jump = x[candidates] - x[end - 1]
        slope = jump - .5 * ((x[candidates + 1] - x[candidates]) + (x[end - 1] - x[end - 2]))
        power = np.concatenate(([0], np.cumsum(x * x)))
        before = (power[end] - power[end - 441]) / 441
        after = (power[candidates + 441] - power[candidates]) / 441
        rms_delta = abs(10 * np.log10(after / before))
        guard_diff = x[CORE:] - x[:-CORE]
        guard_power = np.concatenate(([0], np.cumsum(guard_diff ** 2)))
        guard_rms = np.sqrt((guard_power[candidates + 441] - guard_power[candidates]) / 441)
        codec_score = abs(jump) + abs(slope) + .006 * rms_delta + .3 * guard_rms
        codec_score[(abs(jump) > .025) | (abs(slope) > .025) | (rms_delta > 1.5) | (guard_rms > .024)] += 10
        score = np.maximum(score, codec_score)
    at = int(candidates[np.argmin(score)])
    assert min(score) < 10, (asset['id'], 'no clean shared codec seam')
    asset['loop'].update(startSample=at, endSample=at + CORE,
                         startSeconds=at / SR, endSeconds=(at + CORE) / SR)


def main():
    specs = [(f'engine-{name}', 3, rpm, True) for name, rpm in
             [('idle', 4000), ('low', 6000), ('mid', 9000), ('high', 12000), ('redline', 15000)]]
    specs += [(name, duration, None, loop) for name, duration, loop in [
        ('shift-up', .55, False), ('shift-down', .65, False),
        ('turbo-blowoff', .75, False), ('startup', 1.8, False),
        ('exhaust-pop-1', .5, False), ('exhaust-pop-2', .55, False),
        ('exhaust-pop-3', .6, False), ('tyre-squeal', 3, True),
        ('kerb-rumble', .8, False), ('wind-speed', 3, True), ('pass-whoosh', 1.3, False)]]
    manifest = {'schemaVersion': 1, 'license': 'CC0-1.0', 'sampleRate': SR,
                'channels': 1, 'targetLufs': -16, 'maxTruePeakDbfs': -3,
                'loopEndExclusive': True, 'assets': []}
    with tempfile.TemporaryDirectory(prefix='racing-audio-') as temp:
        temp = Path(temp)
        for i, (name, duration, rpm, loop) in enumerate(specs):
            seed = SEED + i
            if rpm:
                x = engine(rpm, seed)
            elif name == 'tyre-squeal':
                t = np.arange(CORE) / SR
                phase = 2 * np.pi * 1470 * t + .9 * np.sin(2 * np.pi * 7 * t)
                x = np.tanh(.75 * np.sin(phase) + .3 * np.sin(1.6 * 2 * np.pi * 1470 * t)
                            + .32 * noise(CORE, seed, 1000, 8500))
            elif name == 'wind-speed':
                t = np.arange(CORE) / SR
                x = np.tanh(.65 * noise(CORE, seed, 130, 6400)) * (1 + .1 * np.sin(2 * np.pi * t))
            else:
                x = event(name, duration, seed)
            if loop:
                x = loop_boundary(x)
                x = np.concatenate((x[-GUARD:], x, x[:GUARD]))
            raw = temp / 'raw.wav'
            normalized = temp / 'normalized.wav'
            wavfile.write(raw, SR, x.astype(np.float32))
            m = measure(raw)
            filt = ('loudnorm=I=-16:TP=-3.8:LRA=7:linear=true:'
                    f'measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:'
                    f'measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:'
                    f'offset={m["target_offset"]}')
            run(['ffmpeg', '-y', '-v', 'error', '-i', str(raw), '-af', filt,
                 '-ar', str(SR), '-ac', '1', '-c:a', 'pcm_f32le', str(normalized)])
            asset = {'id': name, 'kind': 'engine' if rpm else 'loop' if loop else 'oneShot',
                     'durationSeconds': len(x) / SR, 'rpm': rpm,
                     'seed': seed, 'loop': {'startSample': GUARD, 'endSample': GUARD + CORE,
                     'startSeconds': GUARD / SR, 'endSeconds': (GUARD + CORE) / SR,
                     'lengthSamples': CORE, 'lengthSeconds': 3} if loop else None,
                     'files': {}}
            for ext, codec in [('ogg', ['-c:a', 'libvorbis', '-q:a', '7']),
                               ('mp3', ['-c:a', 'libmp3lame', '-b:a', '160k', '-write_xing', '1'])]:
                path = ROOT / f'{name}.{ext}'
                # Measure the delivered codec, including short-clip gating and
                # MP3's level change; encode from PCM on each correction pass.
                gain_db = 0.
                for attempt in range(5):
                    run(['ffmpeg', '-y', '-v', 'error', '-i', str(normalized),
                         '-af', f'volume={gain_db}dB', '-map_metadata', '-1',
                         '-ar', str(SR), '-ac', '1', *codec, str(path)])
                    encoded = measure(path)
                    correction = -16 - float(encoded['input_i'])
                    if abs(correction) <= .12:
                        break
                    gain_db += correction
                assert abs(float(encoded['input_i']) + 16) <= .15, name
                assert float(encoded['input_tp']) <= -3, (name, ext, encoded)
                asset['files'][ext] = {'path': path.name, 'bytes': path.stat().st_size,
                                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            if loop:
                encoded_loop_points(asset)
            manifest['assets'].append(asset)
            print(name, flush=True)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
