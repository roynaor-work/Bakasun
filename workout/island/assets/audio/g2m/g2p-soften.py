"""Rebuild the G2p CC0 mix: python3 g2p-soften.py /path/to/original-bank.

Original Kenney Digital Audio samples and their pinned CC0 source URLs are in
sources.json. All added harmonic/noise layers in this script are dedicated CC0.
Requires numpy and ffmpeg; produces seven mono Vorbis clips next to this file.
"""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np

ROOT = Path(__file__).resolve().parent
RATE = 22050
# duration, target peak, body Hz, airy layer gain
RECIPES = {
    'shot': (.105, .070, 420, .12),
    'hit': (.17, .145, 220, .22),
    'explosion': (.38, .210, 95, .5),
    'missileLaunch': (.60, .220, 340, .35),
    'missileExplosion': (.80, .360, 62, .65),
    'bonus': (.42, .195, 523.25, .03),
    'stageEnd': (.92, .235, 392, .02),
}
sources = json.loads((ROOT / 'sources.json').read_text())
for item in sources:
    name = item['event']
    duration, peak, hz, air = RECIPES[name]
    t = np.arange(round(RATE * duration)) / RATE
    rng = np.random.default_rng(941 + list(RECIPES).index(name))
    # Low-pass noise, a warm fundamental and detuned partial: never one beep.
    noise = np.convolve(rng.normal(0, 1, len(t)), np.ones(18) / 18, mode='same')
    noise /= max(abs(noise))
    freq = hz * (1 - .52 * t / duration)
    phase = np.cumsum(freq) * (2 * np.pi / RATE)
    body = np.sin(phase) + .20 * np.sin(phase * 1.997)
    if name in ('bonus', 'stageEnd'):
        body = sum(np.sin(2 * np.pi * hz * ratio * t) * np.exp(-t * decay)
                   for ratio, decay in [(1, 5), (1.25, 6), (1.5, 7)]) * .4
    if name == 'missileLaunch':
        whistle = np.cumsum(950 - 650 * t / duration) * (2 * np.pi / RATE)
        body = body * .35 + np.sin(whistle) * .33
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i',
        str(Path(sys.argv[1]) / item['file']), '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-'])
    original = np.frombuffer(raw, dtype='<f4')
    original = np.interp(np.linspace(0, len(original)-1, len(t)), np.arange(len(original)), original)
    original = np.convolve(original, np.ones(22) / 22, mode='same')
    envelope = np.minimum(1, t / .012) * np.exp(-t / (duration * .28))
    envelope *= np.minimum(1, (duration - t) / .045)
    mixed = (body * .65 + noise * air + original * .12) * envelope
    mixed *= peak / max(abs(mixed))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE),
        '-ac', '1', '-i', '-', '-c:a', 'libvorbis', '-q:a', '3',
        '-metadata', 'license=CC0-1.0', str(ROOT / item['file'])],
        input=mixed.astype('<f4').tobytes(), check=True)
    item.update(duration=duration, peak=peak, rms=round(float(np.sqrt(np.mean(mixed**2))), 5),
                bytes=(ROOT / item['file']).stat().st_size)
(ROOT / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n')
