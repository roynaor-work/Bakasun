"""Original procedural sports SFX. CC0-1.0; see ../LICENSES.md.

Python 3.12 + NumPy; ffmpeg with libopus. No recordings or sample libraries.
Run: python tools/generate.py --ffmpeg /path/to/ffmpeg
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parents[1]
TAU = 2 * np.pi
SEED = 20261030


def clock(seconds):
    return np.arange(round(seconds * SR), dtype=np.float64) / SR


def noise(n, rng, low=100, high=8000, slope=0):
    """Periodic, smoothly band-limited noise (FFT has no filter startup)."""
    f = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    shape = (1 - np.exp(-(f / low) ** 4)) * np.exp(-(f / high) ** 6)
    shape *= np.maximum(f, low) ** (-slope)
    spectrum *= shape
    spectrum[0] = 0
    x = np.fft.irfft(spectrum, n)
    return x / max(np.std(x), 1e-12)


def edge(x, attack=.008, release=.04):
    x = x.copy()
    for length, reverse in [(attack, False), (release, True)]:
        n = min(round(length * SR), len(x) // 2)
        ramp = np.sin(np.linspace(0, np.pi / 2, n)) ** 2
        if reverse:
            x[-n:] *= ramp[::-1]
        else:
            x[:n] *= ramp
    return x


def room(x, wet=.14, circular=False):
    y = x.copy()
    for delay, gain in [(.029, 1), (.047, .7), (.073, .5), (.113, .32)]:
        shift = round(delay * SR)
        if circular:
            y += wet * gain * np.roll(x, shift)
        elif shift < len(x):
            y[shift:] += wet * gain * x[:-shift]
    return y


def impact(t, rng, f=95, decay=.07, snap=.13):
    phase = TAU * (f * t + f * .65 * .016 * (1 - np.exp(-t / .016)))
    body = np.sin(phase) * np.exp(-t / decay)
    body += .25 * np.sin(phase * 2.31) * np.exp(-t / (decay * .4))
    body += snap * noise(len(t), rng, 500, 6500) * np.exp(-t / .012)
    return edge(body, .001, .05)


def crowd(t, rng, energy=.3, indoor=False, periodic=False):
    """Detuned vowel resonances + breath + scattered claps; no words."""
    n, dur = len(t), len(t) / SR
    out = .11 * noise(n, rng, 180, 3800, .15)
    for _ in range(28):
        f0 = rng.uniform(92, 270)
        if periodic:
            f0 = round(f0 * dur) / dur
        phase = rng.uniform(0, TAU)
        voice = np.zeros(n)
        f1, f2 = rng.uniform(450, 800), rng.uniform(1000, 1600)
        for h in range(1, 18):
            freq = h * f0
            amp = (.8 * math.exp(-((freq - f1) / 180) ** 2)
                   + .5 * math.exp(-((freq - f2) / 260) ** 2) + .04) / h ** .6
            voice += amp * np.sin(TAU * freq * t + phase * h)
        cycles = int(rng.integers(3, 10)) if periodic else rng.uniform(.6, 2.3) * dur
        env = (.5 + .5 * np.sin(TAU * cycles * t / dur + phase)) ** 2
        out += (.022 + .04 * energy) * voice * env
    out *= .8 + .2 * np.sin(TAU * (3 if periodic else dur * .21) * t / dur)
    for _ in range(round(dur * (.7 + 3 * energy))):
        start = int(rng.integers(0, max(1, n - round(.16 * SR))))
        ct = clock(.16)
        clap = edge(noise(len(ct), rng, 600, 6500) * np.exp(-ct / .018), .001, .03)
        out[start:start + len(clap)] += (.08 + .16 * energy) * clap
    return room(out, .27 if indoor else .1, periodic)


def make(kind, dur, rng, loop):
    t = clock(dur)
    n = len(t)
    if kind in ('kick', 'pass', 'bounce'):
        f, decay, snap = {'kick': (82, .065, .3), 'pass': (115, .043, .18),
                          'bounce': (148, .085, .26)}[kind]
        x = impact(t, rng, f, decay, snap)
        if kind == 'bounce':
            x = room(x, .32)
            x += .09 * np.sin(TAU * 310 * t) * np.exp(-t / .1)
    elif kind in ('net', 'swish'):
        x = noise(n, rng, 700 if kind == 'net' else 1600, 9500)
        env = (1 - np.exp(-t / .015)) * np.exp(-t / .09)
        x *= env * (.6 + .4 * np.sin(TAU * 39 * t) ** 2)
        for at in [.045, .092, .147]:
            q = np.maximum(0, t - at)
            x += .08 * (t >= at) * np.sin(TAU * 470 * q) * np.exp(-q / .026)
        x = room(x, .12)
    elif kind == 'whistle':
        freq = 2780 + 90 * np.sin(TAU * 31 * t) + 70 * np.exp(-t / .07)
        phase = TAU * np.cumsum(freq) / SR
        x = (.65 * np.sin(phase) + .25 * np.sin(phase * 1.083)
             + .05 * noise(n, rng, 2000, 7000))
        x *= (1 - np.exp(-t / .025)) * np.exp(-np.maximum(0, t - .36) / .055)
    elif kind.startswith('crowd'):
        e = {'crowd-calm': .1, 'crowd-excited': .7, 'crowd-goal': 1}[kind]
        x = crowd(t, rng, e, dur < 2.5)
        if kind == 'crowd-goal':
            x *= (1 - np.exp(-t / .07)) * np.exp(-np.maximum(0, t - .65) / .7)
        elif kind == 'crowd-excited':
            x *= (1 - np.exp(-t / .12)) * np.exp(-np.maximum(0, t - .5) / .5)
    elif kind == 'rim':
        x = .3 * impact(t, rng, 190, .045, .4)
        for f, a, d in [(520, .6, .12), (833, .38, .18), (1391, .17, .08), (2310, .08, .035)]:
            x += a * np.sin(TAU * f * t) * np.exp(-t / d)
        x = room(x, .25)
    elif kind == 'shoes':
        freq = 1080 + 650 * np.sin(np.minimum(1, t / .27) * np.pi)
        phase = TAU * np.cumsum(freq) / SR
        x = (.5 * np.sin(phase) + .16 * np.sin(phase * 2.03)
             + .1 * noise(n, rng, 1200, 7000))
        x *= (np.exp(-((t - .11) / .065) ** 2) + .5 * np.exp(-((t - .29) / .045) ** 2))
        x = room(x, .2)
    elif kind == 'buzzer':
        phase = TAU * 184 * t
        x = sum(np.sin(h * phase) / h for h in [1, 3, 5, 7, 9, 11])
        x *= .85 + .15 * np.sin(TAU * 46 * t)
        x *= 1 - np.exp(-t / .015)
        x *= np.exp(-np.maximum(0, t - .48) / .035)
    elif kind.startswith('scrape'):
        speed = {'scrape-slow': 0, 'scrape-medium': 1, 'scrape-fast': 2}[kind]
        x = noise(n, rng, 400 + 250 * speed, 3800 + 1800 * speed, .12)
        x *= (.64 + .24 * np.sin(TAU * (7 + 7 * speed) * t)
              + .12 * np.sin(TAU * 37 * t))
        x *= np.sin(np.pi * t / dur) ** .5
        for _ in range(12 + speed * 10):
            at = rng.uniform(0, dur)
            x += .17 * np.sin(TAU * rng.uniform(1800, 5500) * t) * np.exp(-((t - at) / .004) ** 2)
    elif kind in ('wind', 'ski-loop'):
        x = noise(n, rng, 95, 2100, .3)
        x *= .7 + .18 * np.sin(TAU * (3 if loop else 1) * t / dur) + .12 * np.cos(TAU * 7 * t / dur)
        x += .12 * noise(n, rng, 900, 5000) * (.5 + .5 * np.sin(TAU * 5 * t / dur))
    elif kind == 'jump':
        x = noise(n, rng, 400, 6500) * np.exp(-((t - .16) / .09) ** 2)
        x += .25 * impact(t, rng, 140, .04, .08)
    elif kind in ('landing', 'fall'):
        x = impact(t, rng, 64 if kind == 'landing' else 48, .08, .18)
        x += .65 * noise(n, rng, 350, 6200) * (1 - np.exp(-t / .01)) * np.exp(-t / .17)
        if kind == 'fall':
            for at, gain in [(.17, .6), (.36, .3)]:
                start = round(at * SR)
                x[start:] += gain * impact(t[:-start], rng, 76, .06, .23)
    elif kind == 'gate':
        x = .65 * impact(t, rng, 245, .035, .28)
        x += .25 * np.sin(TAU * 630 * t) * np.exp(-t / .055)
        x += .5 * noise(n, rng, 850, 5400) * np.exp(-((t - .1) / .055) ** 2)
    elif kind in ('soccer-loop', 'basketball-loop'):
        x = crowd(t, rng, .08, kind == 'basketball-loop', True)
        if kind == 'soccer-loop':
            x += .05 * noise(n, rng, 100, 1600, .3) * (.7 + .3 * np.sin(TAU * 3 * t / dur))
    elif kind == 'opening':
        # Air sweep + tactile latch; no pitched melody or musical cue.
        x = noise(n, rng, 450, 7000) * np.exp(-((t - .25) / .15) ** 2)
        start = round(.39 * SR)
        x[start:] += .6 * impact(t[:-start], rng, 130, .04, .1)
    elif kind == 'victory':
        x = .24 * crowd(t, rng, .9)
        for at, gain in [(.04, .7), (.18, .8), (.34, .6)]:
            start = round(at * SR)
            q = t[:-start]
            x[start:] += gain * edge(noise(len(q), rng, 650, 6500) * np.exp(-q / .024), .001, .04)
        x *= np.exp(-np.maximum(0, t - .5) / .28)
    elif kind == 'defeat':
        x = .6 * noise(n, rng, 180, 1600, .35) * np.exp(-((t - .22) / .16) ** 2)
        x += .35 * impact(t, rng, 72, .09, .04)
    else:
        raise ValueError(kind)
    # Remove DC and tame rare noise peaks before perceptual normalization.
    x -= x.mean()
    x = np.tanh(x / max(np.std(x) * 4, 1e-12))
    # Opus transform ringing is checked after decoding. Guard the boundary by
    # 10 ms with 24 ms cosine shoulders; the 100 ms seam energy must stay within
    # 4 dB of adjacent ambience (validated independently, no long fade-out).
    guard = round(.010 * SR)
    if loop:
        x[:guard] = 0
        x[-guard:] = 0
        x[guard:-guard] = edge(x[guard:-guard], .024, .024)
        return x
    x = np.r_[np.zeros(guard), x[:-guard]]
    return edge(x, .006, min(.09, dur / 5))


def run(ffmpeg, args, data=None):
    return subprocess.run([ffmpeg, '-hide_banner', '-nostdin', *args], input=data,
                          capture_output=True, check=True)


def loudness(ffmpeg, path):
    r = run(ffmpeg, ['-i', str(path), '-af', 'loudnorm=I=-23:TP=-3:LRA=7:print_format=json', '-f', 'null', '-'])
    text = r.stderr.decode()
    return json.loads(text[text.rfind('{'):text.rfind('}') + 1])


# id, synthesis recipe, seconds, recommended gain dB, highpass Hz, lowpass Hz, label
SPECS = [
    ('soccer/kick', 'kick', .55, -3, 55, 8500, 'בעיטה'),
    ('soccer/net', 'net', .6, -5, 250, 9500, 'כדור ברשת'),
    ('soccer/whistle', 'whistle', .7, -10, 1200, 6500, 'שריקה'),
    ('soccer/pass', 'pass', .5, -5, 80, 7500, 'מסירה'),
    ('soccer/crowd-calm', 'crowd-calm', 1.8, -14, 180, 4500, 'קהל רגוע'),
    ('soccer/crowd-excited', 'crowd-excited', 2, -9, 180, 6000, 'קהל מתרגש'),
    ('soccer/crowd-goal', 'crowd-goal', 2.8, -5, 140, 7000, 'שאגת שער'),
    ('soccer/ambience-loop', 'soccer-loop', 24, -18, 150, 5000, 'רקע אצטדיון'),
    ('basketball/bounce', 'bounce', .6, -4, 65, 8000, 'כדור על פרקט'),
    ('basketball/swish', 'swish', .55, -4, 950, 10000, 'סוויש'),
    ('basketball/rim', 'rim', .75, -6, 180, 8000, 'פגיעה בטבעת'),
    ('basketball/shoes', 'shoes', .65, -10, 650, 7000, 'נעליים על פרקט'),
    ('basketball/buzzer', 'buzzer', .7, -11, 140, 4500, 'זמזם'),
    ('basketball/crowd-calm', 'crowd-calm', 1.7, -15, 200, 5000, 'קהל רגוע באולם'),
    ('basketball/crowd-excited', 'crowd-excited', 2.1, -9, 200, 6500, 'קהל נרגש באולם'),
    ('basketball/ambience-loop', 'basketball-loop', 24, -18, 180, 5000, 'רקע אולם'),
    ('ski/scrape-slow', 'scrape-slow', 1.1, -12, 350, 5500, 'שלג איטי'),
    ('ski/scrape-medium', 'scrape-medium', 1.1, -10, 450, 7000, 'שלג בינוני'),
    ('ski/scrape-fast', 'scrape-fast', 1.1, -8, 650, 9000, 'שלג מהיר'),
    ('ski/wind', 'wind', 2.4, -15, 100, 3000, 'משב רוח'),
    ('ski/jump', 'jump', .6, -6, 180, 7500, 'קפיצה'),
    ('ski/landing', 'landing', .7, -4, 55, 7000, 'נחיתה'),
    ('ski/fall', 'fall', .95, -5, 60, 6500, 'נפילה'),
    ('ski/slalom-gate', 'gate', .55, -6, 180, 7500, 'שער סלאלום'),
    ('ski/ambience-loop', 'ski-loop', 24, -18, 100, 4000, 'רקע הרים ורוח'),
    ('scenes/opening', 'opening', .9, -6, 150, 8000, 'פתיחה'),
    ('scenes/victory', 'victory', 1.4, -5, 180, 7500, 'ניצחון'),
    ('scenes/defeat', 'defeat', .9, -9, 100, 3500, 'הפסד'),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    assets = {}
    for index, (ident, recipe, dur, gain, hp, lp, label) in enumerate(SPECS):
        seed = SEED + index
        loop = ident.endswith('-loop')
        x = make(recipe, dur, np.random.Generator(np.random.PCG64(seed)), loop)
        path = ROOT / (ident + '.ogg')
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='island-audio-') as tmp:
            raw = Path(tmp) / 'source.f32'
            wav = Path(tmp) / 'source.wav'
            raw.write_bytes(x.astype('<f4').tobytes())
            run(args.ffmpeg, ['-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', str(raw), str(wav)])
            measured = loudness(args.ffmpeg, wav)
            adjust = -23 - float(measured['input_i'])
            if float(measured['input_tp']) + adjust > -3.5:
                raise RuntimeError(f'{ident}: excessive crest factor; revise synthesis')
            for attempt in range(8):
                run(args.ffmpeg, ['-y', '-i', str(wav), '-af', f'volume={adjust:.5f}dB',
                    '-ac', '1', '-ar', str(SR), '-c:a', 'libopus', '-application', 'lowdelay',
                    '-b:a', '48k' if loop else '64k', '-vbr', 'off', '-frame_duration', '20',
                    '-cutoff', '16000',
                    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
                    str(path)])
                final = loudness(args.ffmpeg, path)
                error = -23 - float(final['input_i'])
                if abs(error) <= .2:
                    break
                adjust += error
            if abs(float(final['input_i']) + 23) > .3 or float(final['input_tp']) > -3:
                raise RuntimeError(f'{ident}: normalization failed: {final}')
        assets[ident] = {
            'file': ident + '.ogg', 'label_he': label, 'codec': 'opus', 'container': 'ogg',
            'channels': 1, 'sample_rate_hz': SR, 'duration_seconds': dur,
            'loop': loop, 'loop_start_seconds': 0 if loop else None,
            'loop_end_seconds': dur if loop else None, 'recommended_gain_db': gain,
            'recommended_gain_linear': round(10 ** (gain / 20), 6),
            'filters': {'highpass_hz': hp, 'lowpass_hz': lp, 'q': .7071, 'slope_db_octave': 12},
            'max_voices': 1 if loop or 'crowd' in ident else 2,
            'cooldown_ms': 900 if 'crowd' in ident else 100,
            'source': {'type': 'original_procedural', 'script': 'tools/generate.py',
                       'recipe': recipe, 'seed': seed, 'license': 'CC0-1.0'},
            'measured_lufs_i': float(final['input_i']),
            'measured_true_peak_dbtp': float(final['input_tp']),
            'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        print(f'{ident}: {path.stat().st_size} bytes, {final["input_i"]} LUFS, {final["input_tp"]} dBTP', flush=True)
    layers = {
        'soccer_play': {'bed': 'soccer/ambience-loop', 'events': ['soccer/pass', 'soccer/kick', 'soccer/net'], 'max_concurrent_events': 2},
        'soccer_goal': {'bed': 'soccer/ambience-loop', 'timeline': [{'asset': 'soccer/net', 'at_ms': 0}, {'asset': 'soccer/crowd-goal', 'at_ms': 80}], 'duck_bed_db': -6, 'duck_hold_ms': 2400},
        'soccer_restart': {'bed': 'soccer/ambience-loop', 'events': ['soccer/whistle'], 'duck_bed_db': -6, 'duck_hold_ms': 700},
        'basketball_play': {'bed': 'basketball/ambience-loop', 'events': ['basketball/bounce', 'basketball/shoes'], 'max_concurrent_events': 2},
        'basketball_score': {'bed': 'basketball/ambience-loop', 'timeline': [{'asset': 'basketball/swish', 'at_ms': 0}, {'asset': 'basketball/crowd-excited', 'at_ms': 100}], 'duck_bed_db': -6, 'duck_hold_ms': 1900},
        'basketball_miss': {'bed': 'basketball/ambience-loop', 'events': ['basketball/rim', 'basketball/bounce'], 'max_concurrent_events': 2},
        'ski_play': {'bed': 'ski/ambience-loop', 'alternatives': ['ski/scrape-slow', 'ski/scrape-medium', 'ski/scrape-fast'], 'max_active_alternatives': 1, 'crossfade_ms': 100, 'events': ['ski/slalom-gate', 'ski/wind'], 'max_concurrent_events': 1},
        'ski_air': {'bed': 'ski/ambience-loop', 'events': ['ski/jump'], 'mute_group': 'ski_scrape', 'resume_group_on': 'ski/landing'},
        'ski_landing': {'bed': 'ski/ambience-loop', 'events': ['ski/landing'], 'duck_bed_db': -4, 'duck_hold_ms': 500},
        'ski_fall': {'bed': 'ski/ambience-loop', 'events': ['ski/fall'], 'mute_group': 'ski_scrape', 'duck_bed_db': -6, 'duck_hold_ms': 900},
        'opening': {'events': ['scenes/opening'], 'duck_bed_db': -8, 'duck_hold_ms': 900},
        'victory': {'events': ['scenes/victory'], 'duck_bed_db': -8, 'duck_hold_ms': 1400, 'exclude': ['soccer/crowd-goal', 'basketball/crowd-excited']},
        'defeat': {'events': ['scenes/defeat'], 'duck_bed_db': -10, 'duck_hold_ms': 900},
    }
    manifest = {
        'schema_version': 1, 'relative_to': 'this JSON file',
        'normalization': {'integrated_target_lufs': -23, 'tolerance_lu': .3, 'true_peak_ceiling_dbtp': -3},
        'master': {'recommended_gain_db': -3, 'max_simultaneous_beds': 1, 'max_simultaneous_events': 3,
                   'suggested_limiter_ceiling_dbtp': -1, 'duck_attack_ms': 35, 'duck_release_ms': 350},
        'playback': {'background_player': 'decoded AudioBufferSourceNode with loop=true',
                     'start_stop_fade_ms': 40, 'loop_crossfade_ms': 0,
                     'note': 'Use the full decoded buffer; never pad, trim, or resample individual loop ends. HTML audio is for audition only.'},
        'exclusive_groups': {'soccer_crowd': ['soccer/crowd-calm', 'soccer/crowd-excited', 'soccer/crowd-goal'],
                             'basketball_crowd': ['basketball/crowd-calm', 'basketball/crowd-excited'],
                             'ski_scrape': ['ski/scrape-slow', 'ski/scrape-medium', 'ski/scrape-fast'],
                             'scene': ['scenes/opening', 'scenes/victory', 'scenes/defeat']},
        'assets': assets, 'layers': layers,
    }
    (ROOT / 'mix.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
