#!/usr/bin/env python3
"""Original, seeded oscillator/noise SFX. Requires Python 3, NumPy and FFmpeg.

Run from any directory. Only writes audio/ next to this script. No recordings,
speech services, downloaded samples or network calls are used.
"""
from pathlib import Path
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent
SR = 22050
SEED = 7112026


def tone(t, start, end=None, decay=16, amplitude=1):
    end = start if end is None else end
    slope = (end - start) / max(t[-1], 1 / SR)
    return amplitude * np.sin(2 * np.pi * (start * t + slope * t * t / 2)) * np.exp(-decay * t)


def puff(rng, t, decay=25, cutoff=1500):
    # Windowed-sinc low-pass: rounded air, rather than a startling gun crack.
    n = np.arange(65) - 32
    kernel = 2 * cutoff / SR * np.sinc(2 * cutoff / SR * n) * np.hanning(65)
    kernel /= kernel.sum()
    return np.convolve(rng.uniform(-1, 1, len(t)), kernel, mode='same') * np.exp(-decay * t)


def nasal(t, pitch, contour, syllables=1):
    f0 = pitch + contour * np.sin(np.pi * t / max(t[-1], .01)) + 8 * np.sin(2 * np.pi * 18 * t)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    result = np.zeros_like(t)
    for h in range(1, 17):
        freq = h * f0
        formants = .12 + np.exp(-((freq - 620) / 270) ** 2) + .6 * np.exp(-((freq - 1420) / 420) ** 2)
        result += formants / h * np.sin(h * phase + .07 * h)
    pulse = (.5 + .5 * np.cos(2 * np.pi * syllables * t / max(t[-1], .01))) ** .55
    return result * (.25 + .75 * pulse) * np.exp(-3.7 * t)


SPECS = [
    ('shot-cork', 'shot', 'פקק קופץ', .18, .44, 'Cork pop + rounded air'),
    ('shot-pew', 'shot', 'פיו קפיצי', .22, .43, 'Falling sine chirp + soft spring'),
    ('shot-bubble', 'shot', 'בועה מהירה', .20, .43, 'Two hollow bubble pulses'),
    ('hit-dust', 'hit', 'פוף אבק', .27, .45, 'Filtered puff + wood-like low tap'),
    ('hit-stars', 'hit', 'כוכבים מצחיקים', .34, .44, 'Three soft ascending bell partials'),
    ('hit-burst', 'hit', 'בום קטן', .29, .46, 'Rounded low drum + airy tail'),
    ('hit-pop', 'hit', 'פופ גומי', .24, .44, 'Rubbery pop + short upward wobble'),
    ('miss-sand', 'miss', 'חול מתפזר', .31, .32, 'Quiet sandy scrape and tiny tick'),
    ('fall-squeak-roll', 'fall', 'חריקה וגלגול', .90, .43, 'Rubber squeak, then four slowing soft rolling taps'),
    ('pig-oink', 'voice', 'אוינק', .30, .38, 'Nasal descending oink'),
    ('pig-double', 'voice', 'אוינק אוינק', .43, .37, 'Two bouncy nasal pulses'),
    ('pig-snort', 'voice', 'נחרה קטנה', .28, .36, 'Low breathy snort'),
    ('pig-hiccup', 'voice', 'היק!', .24, .37, 'Short hiccupping upward chirp'),
    ('pig-chuckle', 'voice', 'צחקוק חזירי', .48, .37, 'Three gentle wobbling chuckles'),
]


def render(name, duration, index):
    rng = np.random.default_rng(SEED + index)
    t = np.arange(round(duration * SR)) / SR
    if name == 'shot-cork':
        y = tone(t, 390, 145, 27) + .55 * puff(rng, t, 45)
    elif name == 'shot-pew':
        y = tone(t, 880, 210, 19) + .22 * tone(t, 230, 360, 27) + .18 * puff(rng, t, 55)
    elif name == 'shot-bubble':
        y = tone(t, 620, 170, 28) + .32 * tone(np.maximum(0, t - .047), 390, 160, 35) * (t >= .047)
    elif name == 'hit-dust':
        y = 1.7 * puff(rng, t, 17, 1150) + .55 * tone(t, 210, 100, 28)
    elif name == 'hit-stars':
        y = np.zeros_like(t)
        for k, freq in enumerate([620, 780, 930]):
            local = np.maximum(0, t - k * .045)
            y += tone(local, freq, freq * .97, 19, .7 - k * .16) * (t >= k * .045)
    elif name == 'hit-burst':
        y = tone(t, 180, 65, 22) + 1.3 * puff(rng, t, 19, 1300)
    elif name == 'hit-pop':
        y = tone(t, 290, 610, 25) + .5 * tone(t, 440, 170, 30) + .2 * puff(rng, t, 45)
    elif name == 'miss-sand':
        y = puff(rng, t, 11, 1800) + .14 * tone(t, 730, 320, 50)
    elif name == 'fall-squeak-roll':
        y = tone(t, 530, 190, 11) * (.78 + .22 * np.sin(2 * np.pi * 32 * t))
        for k, offset in enumerate([.24, .37, .54, .75]):
            local = np.maximum(0, t - offset)
            y += (tone(local, 210 - k * 22, 80, 35, .65 / (1 + k * .38))
                  + .3 * puff(rng, local, 40, 900)) * (t >= offset)
    else:
        settings = {
            'pig-oink': (175, 60, 1), 'pig-double': (195, 45, 2),
            'pig-snort': (118, 22, 1), 'pig-hiccup': (250, 115, 1),
            'pig-chuckle': (158, 55, 3),
        }
        pitch, contour, count = settings[name]
        y = nasal(t, pitch, contour, count) + .28 * puff(rng, t, 13, 1050)
        if name == 'pig-snort':
            y += .65 * puff(rng, t, 10, 950) * (.5 + .5 * np.sin(2 * np.pi * 36 * t))
    # Remove DC, deterministic fades, and leave headroom even after lossy encoding.
    y -= y.mean()
    fade = min(round(.008 * SR), len(y) // 3)
    y[:fade] *= np.linspace(0, 1, fade)
    tail = min(round(.035 * SR), len(y) // 3)
    y[-tail:] *= np.linspace(1, 0, tail) ** 2
    return np.pad(y, (round(.004 * SR), round(.012 * SR)))


def main():
    if not shutil.which('ffmpeg'):
        raise SystemExit('FFmpeg with libvorbis and libmp3lame is required.')
    target = ROOT / 'audio'
    target.mkdir(exist_ok=True)
    entries = []
    with tempfile.TemporaryDirectory(prefix='boars-fx-audio-') as temp:
        for index, (name, group, label, duration, peak, recipe) in enumerate(SPECS):
            y = render(name, duration, index)
            y *= peak / max(1e-9, np.max(np.abs(y)))
            pcm = np.round(y * 32767).astype('<i2')
            wav = Path(temp) / (name + '.wav')
            with wave.open(str(wav), 'wb') as out:
                out.setparams((1, 2, SR, len(pcm), 'NONE', 'not compressed'))
                out.writeframes(pcm.tobytes())
            formats = {}
            for extension, codec in [('ogg', ['-c:a', 'libvorbis', '-q:a', '3']),
                                     ('mp3', ['-c:a', 'libmp3lame', '-b:a', '48k', '-write_xing', '1'])]:
                path = target / (name + '.' + extension)
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav),
                                '-map_metadata', '-1', '-ac', '1', '-ar', str(SR), *codec,
                                '-fflags', '+bitexact', '-flags:a', '+bitexact', str(path)], check=True)
                size = path.stat().st_size
                if size > 60000:
                    raise RuntimeError(f'{path.name}: {size} bytes exceeds 60 KB')
                formats[extension] = {'path': 'audio/' + path.name, 'bytes': size,
                                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            entries.append({'id': name, 'group': group, 'labelHe': label, 'recipe': recipe,
                            'durationMs': round(len(y) * 1000 / SR), 'sampleRate': SR,
                            'channels': 1, 'sourcePeakDbFS': round(20 * math.log10(peak), 2),
                            'gain': 1, 'formats': formats})
    index = {'seed': SEED, 'method': 'Original additive, FM-like chirp and filtered-noise synthesis',
             'sampleRate': SR, 'channels': 1, 'sounds': entries}
    (target / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    print(f'Synthesized {len(entries)} original cues, Ogg Vorbis + MP3, {SR} Hz mono.')


if __name__ == '__main__':
    main()
