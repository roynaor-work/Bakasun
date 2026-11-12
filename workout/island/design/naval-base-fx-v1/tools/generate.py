#!/usr/bin/env python3
"""Rebuild the atlases and original synthesized sound. No downloaded samples.

Python 3 + numpy, scipy, Pillow; ffmpeg/ffprobe with Vorbis and LAME encoders.
The explosion is sliced, resized, padded and faded to transparent, never keyed.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261112
RATE = 44100


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def atlas(frames, columns, name):
    sheet = Image.new('RGBA', (128 * columns, 128 * (len(frames) // columns)))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i % columns * 128, i // columns * 128))
    sheet.save(ROOT / name, optimize=True)


def explosion():
    source = Image.open(ROOT / 'sources/explosion-generated.png').convert('RGBA')
    frames = []
    for i in range(64):
        col, row = i % 8, i // 8
        box = (round(col * source.width / 8), round(row * source.height / 8),
               round((col + 1) * source.width / 8), round((row + 1) * source.height / 8))
        # RGBa makes the resize premultiplied; the delivered PNG is straight RGBA.
        tile = source.crop(box).convert('RGBa').resize((112, 112), Image.Resampling.LANCZOS).convert('RGBA')
        frame = Image.new('RGBA', (128, 128))
        frame.paste(tile, (8, 8))
        pixels = np.array(frame)
        if i >= 48:
            pixels[:, :, 3] = np.round(pixels[:, :, 3].astype(float) * (1 - smooth((i - 47) / 16))).astype(np.uint8)
        pixels[pixels[:, :, 3] == 0, :3] = 0
        frames.append(Image.fromarray(pixels))
    atlas(frames, 8, 'explosion.png')


Y, X = np.mgrid[0:128, 0:128].astype(float)
SMOKE_SOURCE = Image.open(ROOT / 'sources/smoke-puff-generated.png').convert('RGBa').resize((256, 256), Image.Resampling.LANCZOS)


def smoke_frame(phase):
    """Animate the original smoke texture; alpha is preserved, no color keying.

    The population is analytic and periodic in phase. Births and deaths have
    zero opacity and zero envelope derivative, including the 15 -> 0 seam.
    """
    frame = Image.new('RGBA', (128, 128))
    particles = []
    for i in range(6):
        age = (phase + i / 6) % 1
        particles.append((age, i))
    for age, i in sorted(particles, reverse=True):
        envelope = float(smooth(age / .15) * (1 - smooth((age - .56) / .44)))
        size = round(17 + 78 * age)
        sprite = SMOKE_SOURCE.rotate(i * 37 + age * 24, Image.Resampling.BICUBIC).resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')
        sprite.putalpha(sprite.getchannel('A').point(lambda value: round(value * envelope * .88)))
        cx = 64 + 7 * np.sin(age * 4.7 + i * 2.4) * age
        cy = 108 - 65 * age
        frame.alpha_composite(sprite, (round(cx - size / 2), round(cy - size / 2)))
    rgba = np.array(frame)
    # Keep the same eight-pixel UV guard as the other sheets.
    rgba[:8] = rgba[120:] = 0
    rgba[:, :8] = rgba[:, 120:] = 0
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def sparks():
    rng = np.random.default_rng(SEED)
    angles = rng.uniform(-np.pi, np.pi, 42)
    velocity = rng.uniform(19, 51, 42)
    life = rng.uniform(.45, 1, 42)
    frames = []
    for f in range(16):
        t = f / 15
        emission = np.zeros((128, 128))
        for angle, speed, duration in zip(angles, velocity, life):
            if t >= duration:
                continue
            vx, vy = np.cos(angle) * speed, np.sin(angle) * speed - 13
            px = 64 + vx * t
            py = 72 + vy * t + 17 * t * t
            dx, dy = X - px, Y - py
            length = 1.3 + 3.8 * (1 - t)
            direction = np.arctan2(vy + 34 * t, vx)
            along = dx * np.cos(direction) + dy * np.sin(direction)
            across = -dx * np.sin(direction) + dy * np.cos(direction)
            streak = np.exp(-((along / length) ** 2 + (across / .58) ** 2) * 2)
            emission += streak * (1 - smooth(t / duration))
        edge = (X >= 8) & (X < 120) & (Y >= 8) & (Y < 120)
        strength = np.clip(emission * edge, 0, 1)
        rgba = np.zeros((128, 128, 4), dtype=np.uint8)
        rgba[:, :, 0] = 255
        rgba[:, :, 1] = (115 + strength * 135).astype(np.uint8)
        rgba[:, :, 2] = (22 + strength * 150).astype(np.uint8)
        rgba[:, :, 3] = np.round(strength * 255).astype(np.uint8)
        rgba[rgba[:, :, 3] == 0, :3] = 0
        frames.append(Image.fromarray(rgba))
    atlas(frames, 4, 'sparks.png')


def measure(path):
    result = command(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
                      'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'])
    return json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])[0]


def synthesize():
    rng = np.random.default_rng(SEED)
    t = np.arange(round(RATE * 4.2)) / RATE
    def band(noise, low, high):
        return sosfilt(butter(3, [low, high], btype='bandpass', fs=RATE, output='sos'), noise)
    noise = rng.standard_normal(len(t))
    attack = smooth(t / .006)
    # Sweeping low oscillators, pressure noise, crack and late falling debris.
    body = np.sin(2 * np.pi * (41 * t + 7.2 * (1 - np.exp(-t * 6)))) * np.exp(-t * 2.5)
    sub = np.sin(2 * np.pi * (29 * t + 3.1 * (1 - np.exp(-t * 9)))) * np.exp(-t * 1.6)
    rumble = band(noise, 65, 480) * np.exp(-t * 1.15) * 2.6
    crack = band(noise, 380, 7200) * np.exp(-t * 16) * .46
    debris = np.zeros_like(t)
    for start, pitch, level in zip(rng.uniform(.12, 1.35, 22), rng.uniform(110, 1700, 22), rng.uniform(.01, .055, 22)):
        age = np.maximum(t - start, 0)
        debris += np.sin(2 * np.pi * pitch * age) * np.exp(-age * 22) * (t >= start) * level
    signal = attack * (body * .36 + sub * .12 + rumble + crack + debris)
    signal = np.tanh(signal * 1.2)
    # Original synthetic early reflections and a low-pass diffuse tail.
    reverb = np.zeros_like(signal)
    for delay, gain in [(.071, .22), (.137, .17), (.223, .12), (.359, .08), (.503, .04)]:
        offset = round(delay * RATE)
        reverb[offset:] += signal[:-offset] * gain
    signal += sosfilt(butter(2, 1600, fs=RATE, output='sos'), reverb)
    signal = sosfilt(butter(2, 23, btype='highpass', fs=RATE, output='sos'), signal)
    signal *= 1 - smooth((t - 3.6) / .6)
    signal[0] = signal[-1] = 0
    signal /= max(abs(signal)) * 1.05
    report = {}
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / 'original.wav'
        master = Path(tmp) / 'master.wav'
        compressed = Path(tmp) / 'compressed.wav'
        with wave.open(str(raw), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(np.round(signal * 32767).astype('<i2').tobytes())
        command(['ffmpeg', '-y', '-v', 'error', '-i', str(raw), '-af',
                 'acompressor=threshold=0.08:ratio=8:attack=0.2:release=250:makeup=2,alimiter=limit=0.8:level=false',
                 '-ar', str(RATE), '-c:a', 'pcm_s24le', str(compressed)])
        stats = measure(compressed)
        normalization = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={stats['input_i']}:"
                         f"measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
                         f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true")
        command(['ffmpeg', '-y', '-v', 'error', '-i', str(compressed), '-af', normalization,
                 '-ar', str(RATE), '-c:a', 'pcm_s24le', str(master)])
        for extension, encoder in [('ogg', ['-c:a', 'libvorbis', '-q:a', '6']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '192k'])]:
            target = ROOT / f'explosion-deep.{extension}'
            adjustment = 0
            for attempt in range(4):
                command(['ffmpeg', '-y', '-v', 'error', '-i', str(master), '-af', f'volume={adjustment}dB',
                         '-ar', str(RATE), '-ac', '1', *encoder, '-fflags', '+bitexact', '-flags:a', '+bitexact',
                         '-metadata', 'title=Naval base warehouse explosion',
                         '-metadata', 'copyright=CC0-1.0; original procedural synthesis', str(target)])
                measured = measure(target)
                error = -16 - float(measured['input_i'])
                if abs(error) <= .05:
                    break
                adjustment += error
            assert abs(float(measured['input_i']) + 16) <= .1, measured
            assert float(measured['input_tp']) <= -1, measured
            probe = json.loads(command(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(target)]).stdout)
            report[target.name] = {'integratedLufs': float(measured['input_i']),
                                   'truePeakDbtp': float(measured['input_tp']),
                                   'sampleRate': int(probe['streams'][0]['sample_rate']),
                                   'channels': probe['streams'][0]['channels'],
                                   'codec': probe['streams'][0]['codec_name'],
                                   'containerDurationSeconds': float(probe['format']['duration'])}
    return report


def main():
    explosion()
    atlas([smoke_frame(i / 16) for i in range(16)], 4, 'smoke-loop.png')
    sparks()
    report = {'seed': SEED, 'audio': synthesize(), 'sha256': {}}
    for filename in ['explosion.png', 'smoke-loop.png', 'sparks.png', 'explosion-deep.ogg', 'explosion-deep.mp3', 'sources/explosion-generated.png', 'sources/smoke-puff-generated.png']:
        path = ROOT / filename
        report['sha256'][filename] = hashlib.sha256(path.read_bytes()).hexdigest()
    (ROOT / 'verification/media.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
