#!/usr/bin/env python3
"""Original, deterministic crowd synthesis. No recordings or external assets.

Requires Python 3.11+, NumPy, SciPy and FFmpeg (libvorbis/libmp3lame).
Run this file, then: python verify.py --report
SPDX-License-Identifier: CC0-1.0
"""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d

ROOT = Path(__file__).resolve().parent
SR = 44100
SEED = 20261107
SOUNDS = [
    ("stadium-bed", "קהל רקע שקט", 24.0, True, 0.22),
    ("applause-short", "מחיאות קצרות", 1.5, False, 0.65),
    ("applause-medium", "מחיאות בינוניות", 3.0, False, 0.72),
    ("applause-large", "מחיאות גדולות", 5.0, False, 0.8),
    ("near-point-oh", "אוו — כמעט נקודה", 2.4, False, 0.65),
    ("mistake-aw", "אאוו — טעות", 2.8, False, 0.65),
    ("pre-serve-hush", "לחישה ושקט לפני הגשה", 4.0, False, 0.35),
    ("match-cheer", "תרועה בסוף משחק", 6.5, False, 0.85),
]


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def rms(x):
    return np.sqrt(np.mean(x * x) + 1e-20)


def band(x, low, high):
    return signal.sosfiltfilt(signal.butter(3, [low, high], fs=SR,
                                          btype="bandpass", output="sos"), x, axis=0)


def pink(rng, n):
    """FFT pink noise, with DC and subsonic components removed."""
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(rng.normal(size=n))
    spectrum *= 1 / np.sqrt(np.maximum(freqs, 80))
    spectrum[freqs < 80] = 0
    x = np.fft.irfft(spectrum, n)
    return x / rms(x)


def envelope(n, attack, release):
    t = np.arange(n) / SR
    duration = n / SR
    a = np.sin(np.minimum(t / attack, 1) * np.pi / 2) ** 2
    r = np.sin(np.clip((duration - t) / release, 0, 1) * np.pi / 2) ** 2
    return a * r


def place(out, mono, start, pan, gain=1):
    offset = int(start * SR)
    lo, hi = max(0, offset), min(len(out), offset + len(mono))
    if hi <= lo:
        return
    angle = (pan + 1) * np.pi / 4
    out[lo:hi] += mono[lo-offset:hi-offset, None] * gain * np.array([
        np.cos(angle), np.sin(angle)])


def voice(rng, duration, vowel="oh", contour="murmur"):
    """Anonymous synthetic phonation: jittered glottal harmonics + formants.

    Each utterance has a new pitch, phase, vocal-tract scale and breath layer.
    These are abstract crowd vowels, with no words, speaker model or identity.
    """
    n = int(duration * SR)
    t = np.arange(n) / SR
    u = t / duration
    f0 = rng.uniform(100, 245)
    pitch = 1 + .012 * np.sin(2*np.pi*rng.uniform(3, 6)*t + rng.uniform(0, 6))
    pitch += .007 * np.sin(2*np.pi*13.7*t + rng.uniform(0, 6))
    if contour == "rise":
        pitch *= np.interp(u, [0, .28, .6, 1], [.94, 1.15, 1.10, .96])
    elif contour == "fall":
        pitch *= np.interp(u, [0, .18, .7, 1], [1.06, 1.08, .86, .79])
    else:
        pitch *= 1 + .025 * np.sin(2*np.pi*.8*t + rng.uniform(0, 6))
    phase = 2 * np.pi * np.cumsum(f0 * pitch) / SR + rng.uniform(0, 6)
    formants = {"oh": [440, 820, 2400], "aw": [710, 1080, 2450],
                "ah": [760, 1230, 2600], "uh": [480, 1170, 2450]}[vowel]
    scale = rng.uniform(.89, 1.12)
    y = np.zeros(n)
    for h in range(1, min(38, int(4800/f0))):
        hz = h*f0
        weight = .035 + sum(a / (1 + ((hz-f*scale)/bw)**2)
                           for a, f, bw in zip([1, .7, .15], formants, [100, 150, 240]))
        y += weight / h**.9 * np.sin(h * phase)
    breath = band(rng.normal(size=n), 220, 2700)
    y = y / rms(y) * .85 + breath / rms(breath) * .15
    return y * envelope(n, min(.16, duration*.24), min(.4, duration*.38))


def murmur(rng, duration, density=15):
    n = int(duration * SR)
    out = np.zeros((n, 2))
    # Overlapping, independently panned syllables; no exposed lead speaker.
    for start in rng.uniform(-1, duration, int((duration+1)*density)):
        d = rng.uniform(.28, .95)
        place(out, voice(rng, d, rng.choice(["oh", "uh", "ah"])),
              start, rng.uniform(-.95, .95), rng.uniform(.045, .10))
    for ch in range(2):
        texture = band(pink(rng, n), 180, 1700)
        out[:, ch] += texture * .08
    return out


def applause(rng, duration, size):
    out = np.zeros((int(duration*SR), 2))
    # Each virtual spectator has their own cadence, jitter and onset latency.
    # Broad palm/body noise replaces narrow, hard clicks.
    people = [15, 26, 42][size]
    for _ in range(people):
        pan = rng.uniform(-.95, .95)
        start = rng.uniform(-.015, .16)
        cadence = rng.uniform(.17, .34)
        while start < duration-.12:
            d = rng.uniform(.065, .13)
            n = int(d*SR)
            t = np.arange(n)/SR
            palm = band(rng.normal(size=n), rng.uniform(350, 550), rng.uniform(2400, 3500))
            body = band(rng.normal(size=n), 180, 850)
            clap = .7*palm/rms(palm) + .3*body/rms(body)
            env = (1-np.exp(-t/.005))**2 * np.exp(-t/rng.uniform(.016, .027))
            env *= envelope(n, .007, .024)
            place(out, clap*env, start, pan, rng.uniform(.35, .65))
            start += cadence * rng.uniform(.65, 1.4)
    out += murmur(rng, duration, 8) * .13
    # A clear, sustained asynchronous plateau between the opening and decay.
    return out * envelope(len(out), min(.15, duration*.075), min(1.2, duration*.30))[:, None]


def reaction(rng, duration, kind, count=48):
    out = np.zeros((int(duration*SR), 2))
    for _ in range(count):
        start = rng.uniform(.02, .29)
        d = rng.uniform(duration*.52, duration*.80)
        vowel = "oh" if kind == "rise" else "aw"
        place(out, voice(rng, d, vowel, kind), start,
              rng.uniform(-.95, .95), rng.uniform(.10, .19))
    out += murmur(rng, duration, 10) * .08
    return out


def space(x, rng, periodic=False):
    """Quiet, diffuse stadium early reflections; no discrete echo or whistle."""
    out = x.copy()
    for delay, gain in [(.037,.17), (.061,.14), (.097,.12), (.149,.10),
                        (.213,.08), (.281,.06), (.367,.045)]:
        shift = int((delay+rng.uniform(-.004, .004))*SR)
        reflection = np.roll(x[:, ::-1], shift, axis=0)
        if not periodic:
            reflection[:shift] = 0
        out += gain*reflection
    return band(out, 140, 3900)


def render(index, key, duration):
    rng = np.random.default_rng(SEED + index)
    loop = key == "stadium-bed"
    if loop:
        # Extra second supplies a continuous boundary, equal-power crossfade.
        x = murmur(rng, duration+1)
    elif key.startswith("applause-"):
        x = applause(rng, duration, index-1)
    elif key == "near-point-oh":
        x = reaction(rng, duration, "rise")
    elif key == "mistake-aw":
        x = reaction(rng, duration, "fall")
    elif key == "pre-serve-hush":
        x = murmur(rng, duration, 20) * .3
        for ch in range(2):
            x[:, ch] += band(pink(rng, len(x)), 450, 2700)*.12
        # The first half whispers; the final second approaches genuine silence.
        t = np.arange(len(x))/SR
        x *= np.interp(t, [0, .4, 1.1, 2.5, 3.4, 4], [.3, 1, .8, .10, .004, 0])[:, None]
    else:
        x = applause(rng, duration, 2)*.85
        x += reaction(rng, duration, "rise", 70)*.55
        # A second diffuse swell, not an isolated shout.
        swell = reaction(rng, 3.7, "rise", 40)
        x[int(1.6*SR):int(1.6*SR)+len(swell)] += swell*.32
    x = space(x, rng, periodic=loop)
    # Gentle analytic saturation spreads energy without hard clipping.
    x = .66*np.tanh(x/(rms(x)*(1.8 if key.startswith("applause-") else 2.5)))
    # Post-saturation low-pass removes newly generated high harmonics too.
    x = signal.sosfiltfilt(signal.butter(4, 2600, fs=SR, output="sos"), x, axis=0)
    if loop:
        n = int(duration*SR)
        cross = SR
        w = np.linspace(0, 1, cross)
        x[:cross] = (x[n:n+cross]*np.cos(w*np.pi/2)[:, None]
                     + x[:cross]*np.sin(w*np.pi/2)[:, None])
        x = x[:n]
        # Slow periodic gain control keeps the ambience level even across a lap.
        power = np.mean(x*x, axis=1)
        for _ in range(3):
            power = uniform_filter1d(power, int(SR*.36), mode="wrap")
        smooth_rms = np.sqrt(power+1e-12)
        x *= (np.median(smooth_rms)/smooth_rms)[:, None]**.65
        # Put the encoder boundary at a naturally quiet joint zero crossing.
        # Rotation preserves the continuous, constant-energy periodic waveform.
        boundary_cost = np.sum(x*x + np.roll(x, 1, axis=0)**2, axis=1)
        x = np.roll(x, -int(np.argmin(boundary_cost)), axis=0)
        # Tiny raised-cosine shoulders protect the join from lossy-codec
        # startup ringing. No silence is inserted; the 1 s overlap remains.
        edge = int(SR*.008)
        shoulder = np.sin(np.linspace(0, np.pi/2, edge))**2
        x[:edge] *= shoulder[:, None]
        x[-edge:] *= shoulder[::-1, None]
    else:
        # A single gentle outer fade avoids compounded steep fade slopes.
        # Even the very first 100 ms contains a soft spread of crowd energy.
        if key.startswith("applause-"):
            x *= envelope(len(x), .02, .10)[:, None]
        else:
            x *= envelope(len(x), .10, .24)[:, None]
    if key.startswith("applause-") or key == "match-cheer":
        # Follow the local envelope, so a quiet first clap cannot stick out.
        # The common stereo envelope preserves spatial balance; tanh has no
        # hard corner. Refilter the new harmonics before codec normalization.
        power = uniform_filter1d(np.mean(x*x, axis=1), int(SR*.10), mode="constant")
        ceiling = 2*np.sqrt(np.maximum(power, 1e-12))[:, None]
        x = ceiling*np.tanh(x/ceiling)
        x = signal.sosfiltfilt(signal.butter(4, 2600, fs=SR, output="sos"), x, axis=0)
    return x.astype(np.float32)


def integrated(path):
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                  "-af", "loudnorm=I=-18:TP=-3:LRA=7:print_format=json",
                  "-f", "null", "-"])
    log = result.stderr.decode()
    return float(json.JSONDecoder().raw_decode(log[log.rfind("{"):])[0]["input_i"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="+", choices=[s[0] for s in SOUNDS],
                        help="Regenerate selected cues; default: entire pack")
    args = parser.parse_args()
    manifest = {"sampleRate": SR, "channels": 2, "seed": SEED,
                "license": "CC0-1.0", "sounds": []}
    with tempfile.TemporaryDirectory(prefix="tennis-crowd-") as folder:
        scratch = Path(folder)
        for index, (key, label, duration, loop, gain) in enumerate(SOUNDS):
            manifest["sounds"].append({"id": key, "label": label, "duration": duration,
                "loop": loop, "suggestedGameGain": gain,
                "files": {ext: f"{key}.{ext}" for ext in ["ogg", "mp3"]}})
            if args.only and key not in args.only:
                continue
            print(f"Rendering {key}", flush=True)
            x = render(index, key, duration)
            raw = scratch / "source.wav"
            wavfile.write(raw, SR, x)
            # Linear gain only: preserve envelopes, hush decay and loop boundary.
            x *= 10 ** ((-18-integrated(raw))/20)
            wavfile.write(raw, SR, x)
            for ext, codec in [("ogg", "libvorbis"), ("mp3", "libmp3lame")]:
                dest = ROOT / f"{key}.{ext}"
                # Short cues use 96 kb/s to preserve their soft transients.
                # 56 kb/s keeps the 24 s bed MP3 below 200,000 bytes.
                bitrate = "56k" if loop else "96k"
                run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                     "-i", str(raw), "-map_metadata", "-1", "-ar", str(SR),
                     "-ac", "2", "-c:a", codec, "-b:a", bitrate, str(dest)])
                # Measure the delivered codec, then correct codec gain drift.
                correction = -18-integrated(dest)
                if abs(correction) > .12:
                    adjusted = scratch / "adjusted.wav"
                    wavfile.write(adjusted, SR, (x*10**(correction/20)).astype(np.float32))
                    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(adjusted), "-map_metadata", "-1", "-ar", str(SR),
                         "-ac", "2", "-c:a", codec, "-b:a", bitrate, str(dest)])
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")


if __name__ == "__main__":
    main()
