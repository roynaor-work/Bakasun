#!/usr/bin/env python3
"""Original procedural soccer audio. No samples, recordings, TTS or network input.

Requires Python 3.12+, NumPy, SciPy, ffmpeg/libopus/libmp3lame and ffprobe.
Build: python synthesize.py
Verify existing assets without writing: python synthesize.py --verify
Use --output /tmp/soccer-rebuild to reproduce outside the repository.
All outputs are confined to the selected output directory; WAVs stay in /tmp.
SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import scipy
from scipy import signal

ROOT = Path(__file__).resolve().parent
SR = 48_000
LIMIT = 80_000  # Decimal KB, stricter than 80 KiB.
TARGET_LUFS = -23.0
PEAK_CEILING_DB = -3.0
BASE_SEED = 20261114

# id, Hebrew label, family, duration, playback dB, description, whistle pulses
SPECS = [
    ("whistle-kickoff", "שריקת פתיחה", "referee", 1.20, -2,
     "שריקה יחידה, נקייה ובינונית לפתיחת המשחק או חידושו.", [(0.04, 0.65)]),
    ("whistle-foul", "שריקת עבירה", "referee", 1.35, -2,
     "שריקה חדה ונחרצת עם התקפה מהירה, שונה משריקת הפתיחה.", [(0.04, 0.82)]),
    ("whistle-halftime", "שריקת סיום מחצית", "referee", 1.95, -2,
     "שתי שריקות: קצרה ואחריה ארוכה.", [(0.04, 0.29), (0.54, 0.86)]),
    ("whistle-fulltime", "שריקת סיום משחק", "referee", 2.55, -2,
     "שלוש שריקות מובחנות: קצרה, קצרה וארוכה.",
     [(0.04, 0.28), (0.54, 0.28), (1.04, 1.00)]),
    ("whistle-short", "שריקה קצרה לחטיפה או עבירה קלה", "referee", 0.65, -4,
     "ציוץ קצר אחד; חטיפה חוקית אינה מחייבת שריקה, לפי כללי המשחק.", [(0.04, 0.16)]),
    ("crowd-stadium-loop", "קהל אצטדיון שקט · לולאה", "crowd", 12.00, -14,
     "המון רחוק, דיבור עמום וקריאות פזורות ללא שירה או מנגינה.", []),
    ("crowd-shot-rise", "קהל עולה לקראת בעיטה לשער", "crowd", 3.60, -5,
     "ציפייה שמתגברת בהדרגה; לעצור עם תוצאת הבעיטה.", []),
    ("crowd-goal", "גוווול · קהל ענק", "crowd", 6.20, 0,
     "עשרות גרונות מסונתזים בהתקפה מדורגת, גוווול ממושך ושובל שאגה.", []),
    ("crowd-miss", "אוהו · החטאה", "crowd", 3.40, -2,
     "אוהו משותף, גלישה מטה ואכזבה שנחלשת.", []),
    ("crowd-applause", "מחיאות כפיים", "crowd", 3.60, -4,
     "מאות טפיחות כף לא מסונכרנות במרחב האצטדיון.", []),
    ("ball-kick-soft", "בעיטה חלשה", "ball", 0.80, -6,
     "מגע רך בכדור עור, בס קצר ומעט חיכוך.", []),
    ("ball-kick-medium", "בעיטה בינונית", "ball", 0.85, -3,
     "מכה מלאה ומהירה, תהודת כדור נמוכה וחבטת נעל.", []),
    ("ball-kick-hard", "בעיטה חזקה", "ball", 0.95, 0,
     "מכה דחוסה, בס עמוק וחבטה בהירה עם שובל קצר.", []),
    ("ball-post", "כדור בקורה", "ball", 1.75, -3,
     "חבטת כדור חלולה ותהודות מתכת של עמוד שער.", []),
    ("ball-net", "כדור ברשת", "ball", 1.10, -4,
     "פגיעה רכה ומתיחה מתנפנפת של מיתרי רשת.", []),
    ("ball-grass-bounce", "כדור מקפץ על דשא", "ball", 1.85, -5,
     "ארבע קפיצות דועכות במרווחים מתקצרים, עם רשרוש דשא.", []),
]


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def db(value):
    return 20 * math.log10(max(float(value), 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x))))


def unit(x):
    return x / max(rms(x), 1e-12)


def timeline(duration):
    return np.arange(round(duration * SR)) / SR


def fade(x, attack=0.012, release=0.12):
    x = x.copy()
    a, b = min(round(attack * SR), len(x)), min(round(release * SR), len(x))
    if a:
        x[:a] *= np.sin(np.linspace(0, np.pi / 2, a))[:, None] ** 2
    if b:
        x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b))[:, None] ** 2
    return x


def band_noise(n, rng, low, high, periodic=False):
    """FFT synthesis has a circular boundary; no prerecorded noise is used."""
    frequencies = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    shape = (1 - np.exp(-(frequencies / low) ** 4))
    shape *= np.exp(-(frequencies / high) ** 4)
    spectrum *= shape
    spectrum[0] = 0
    x = unit(np.fft.irfft(spectrum, n=n))
    if not periodic:
        x *= np.minimum(np.arange(n) / (0.003 * SR), 1)
    return x


def pan(x, position=0):
    angle = (position + 1) * np.pi / 4
    return np.column_stack((x * np.cos(angle), x * np.sin(angle)))


def place(dst, src, start, gain=1):
    at = round(start * SR)
    begin, end = max(0, at), min(len(dst), at + len(src))
    if end > begin:
        dst[begin:end] += gain * src[begin - at:end - at]


def stadium_space(x, wet=0.23, periodic=False):
    """Sparse decorrelated early reflections and a diffuse, decaying tail."""
    y = x.copy()
    for delay, level in [(0.047, .42), (.083, .32), (.131, .27), (.197, .22),
                         (.283, .16), (.397, .11), (.541, .075), (.719, .045)]:
        samples = round(delay * SR)
        reflection = np.roll(x[:, ::-1], samples, axis=0)
        if not periodic:
            reflection[:samples] = 0
        y += wet * level * reflection
    return y


def whistle(duration, pulses, rng, kind):
    result = np.zeros((round(duration * SR), 2))
    base = {"whistle-foul": 2980, "whistle-short": 3140}.get(kind, 2830)
    for start, length in pulses:
        t = timeline(length)
        frequency = base + 95 * (1 - np.exp(-t * 70))
        frequency += 21 * np.sin(2 * np.pi * 41 * t) + 8 * np.sin(2 * np.pi * 7.3 * t)
        phase = 2 * np.pi * np.cumsum(frequency) / SR
        # Two air-column modes and pea flutter, never a plain sine beep.
        modes = np.sin(phase) + .35 * np.sin(phase * 1.039 + .5)
        modes += .10 * np.sin(phase * 2.002)
        flutter = .80 + .13 * np.sin(2 * np.pi * 57 * t) + .07 * np.sin(2 * np.pi * 93 * t)
        breath = band_noise(len(t), rng, 2200, 6500)
        mono = .62 * modes * flutter + .045 * breath
        blow = np.minimum(t / .014, 1) * np.minimum((length - t) / .035, 1)
        place(result, pan(mono * np.maximum(blow, 0), -.05), start)
    return fade(stadium_space(result, .10), .008, .16)


def bed(duration, rng):
    t = timeline(duration)
    n = len(t)
    result = np.zeros((n, 2))
    for channel in range(2):
        noise = band_noise(n, rng, 130, 2900, True)
        slow = band_noise(n, rng, .12, 1.4, True)
        envelope = .82 + .16 * np.tanh(slow)
        result[:, channel] = .32 * noise * envelope
    # Dense low-level vowel bands, periodic pitches and periodic envelopes.
    for _ in range(32):
        f0 = round(rng.uniform(92, 240) * duration) / duration
        phase = 2 * np.pi * f0 * t + rng.uniform(0, 2 * np.pi)
        voice = np.zeros(n)
        formants = rng.choice([0, 1])
        f1, f2 = [(490, 1050), (650, 1250)][formants]
        for harmonic in range(1, 17):
            f = f0 * harmonic
            weight = (.7 * np.exp(-.5 * ((f - f1) / 160) ** 2)
                      + .45 * np.exp(-.5 * ((f - f2) / 240) ** 2)
                      + .09 / harmonic)
            voice += weight * np.sin(harmonic * phase) / 5
        rate = int(rng.integers(2, 9))
        env = .4 + .6 * np.sin(np.pi * rate * t / duration + rng.uniform(0, np.pi)) ** 4
        result += .075 * pan(voice * env, rng.uniform(-1, 1))
    return stadium_space(result, .55, periodic=True)


def vowel_voice(duration, rng, goal):
    """Glottal excitation and moving formants: /g o: l/ or falling /o h o/."""
    t = timeline(duration)
    f0 = rng.uniform(100, 245)
    pitch = f0 * (1.0 + .035 * np.sin(2 * np.pi * rng.uniform(4, 7) * t))
    pitch *= np.interp(t / duration, [0, .12, .35, 1],
                       [1.02, 1.18, 1.07, .82] if goal else [1.10, 1.16, .91, .68])
    phase = np.cumsum(pitch) / SR + rng.random()
    # Asymmetric glottal pulses: differentiated Rosenberg-like source.
    cycle = phase % 1
    source = np.where(cycle < .55, np.sin(np.pi * cycle / .55) ** 2, 0)
    source = signal.lfilter([1, -.96], [1], source)
    source += .025 * band_noise(len(t), rng, 250, 5000)
    tract = rng.uniform(.87, 1.13)

    def formants(values):
        sound = np.zeros(len(t))
        for freq, width, gain in values:
            center = freq * tract
            b, a = signal.iirpeak(center, center / width, fs=SR)
            sound += gain * signal.lfilter(b, a, source)
        return sound

    oh = formants([(520, 105, 1), (920, 135, .65), (2450, 260, .20), (3450, 330, .10)])
    oo = formants([(360, 95, 1), (780, 125, .55), (2250, 240, .16)])
    ell = formants([(360, 105, 1), (1320, 180, .5), (2850, 230, .18)])
    morph = np.clip((t / duration - .22) / .42, 0, 1)
    voice = (1 - .55 * morph) * oh + .55 * morph * oo
    if goal:
        ending = np.clip((t / duration - .76) / .16, 0, 1)
        voice = voice * (1 - ending) + ending * ell
        onset = 1 - np.exp(-t / .026)
    else:
        # A brief breathy notch creates the second syllable in the crowd's "o-ho".
        notch = 1 - .58 * np.exp(-((t / duration - .32) / .045) ** 2)
        voice *= notch
        onset = 1 - np.exp(-t / .045)
    release = np.maximum(1 - t / duration, 0) ** .45
    voice = unit(voice) * onset * release
    return pan(voice, rng.uniform(-.95, .95))


def crowd(duration, rng, kind):
    t = timeline(duration)
    result = .12 * bed(duration, rng)
    if kind == "crowd-stadium-loop":
        result = bed(duration, rng)
        # A circular source alone cannot seed a lossy decoder's initial state.
        # Short cosine shoulders + 3 ms guards suppress start/end ringing;
        # only 38 ms of the 12 s bed are affected, without a long fade or gap.
        guard, edge = round(.003 * SR), round(.016 * SR)
        shoulder = np.sin(np.linspace(0, np.pi / 2, edge)) ** 2
        result[:guard] = 0
        result[-guard:] = 0
        result[guard:guard + edge] *= shoulder[:, None]
        result[-guard - edge:-guard] *= shoulder[::-1, None]
        return result
    if kind == "crowd-applause":
        result *= .9
        for _ in range(430):
            start = rng.uniform(.035, duration - .32)
            length = rng.uniform(.028, .070)
            local = timeline(length)
            slap = band_noise(len(local), rng, 650, 8500)
            slap *= (1 - np.exp(-local / .0007)) * np.exp(-local / .010)
            shape = np.sin(np.pi * start / duration) ** .55
            place(result, pan(slap, rng.uniform(-1, 1)), start, rng.uniform(.1, .4) * shape)
        return fade(stadium_space(result, .60), .025, .40)
    goal = kind == "crowd-goal"
    rise = kind == "crowd-shot-rise"
    count = 72 if goal else 44
    for _ in range(count):
        start = rng.uniform(.06, .38) if not rise else rng.uniform(0, 1.45)
        length = rng.uniform(3.7, 5.2) if goal else rng.uniform(1.5, 2.4)
        if rise:
            length = rng.uniform(1.6, 2.9)
        voice = vowel_voice(length, rng, goal or rise)
        place(result, voice, start, rng.uniform(.055, .13))
    roar = np.column_stack([band_noise(len(t), rng, 210, 4300) for _ in range(2)])
    if rise:
        envelope = np.interp(t, [0, .8, 2.8, 3.12, duration], [.04, .13, .9, 1, 0])
    elif goal:
        envelope = np.interp(t, [0, .08, .35, 1.9, 3.7, duration], [0, .2, 1, .9, .7, 0])
    else:
        envelope = np.interp(t, [0, .13, .4, 1.1, 2.2, duration], [0, .8, 1, .6, .2, 0])
    result = (result + .13 * roar) * envelope[:, None]
    return fade(stadium_space(result, .65), .025, .32)


def impact(rng, strength=1, length=.46):
    t = timeline(length)
    freq = (95 + 40 * strength) + (55 + 20 * strength) * np.exp(-t / .018)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = .85 * np.sin(phase) * np.exp(-t / (.046 + .012 * strength))
    body += .26 * np.sin(phase * 1.73 + .3) * np.exp(-t / .022)
    skin = band_noise(len(t), rng, 350, 1900 + strength * 2100) * np.exp(-t / .020)
    attack = np.minimum(t / .0018, 1)
    return (body + (.30 + .18 * strength) * skin) * attack


def ball(duration, rng, kind):
    result = np.zeros((round(duration * SR), 2))
    if kind.startswith("ball-kick-"):
        strength = {"ball-kick-soft": .35, "ball-kick-medium": .70, "ball-kick-hard": 1.05}[kind]
        place(result, pan(impact(rng, strength), -.08), .035)
    elif kind == "ball-grass-bounce":
        for start, force in [(.035, .85), (.69, .57), (1.17, .37), (1.51, .20)]:
            hit = impact(rng, .18 + force * .25, .30)
            local = timeline(.30)
            grass = band_noise(len(local), rng, 1500, 6700) * np.exp(-local / .038)
            place(result, pan(.55 * force * hit + .10 * force * grass, -.15 + start * .18), start)
    elif kind == "ball-post":
        t = timeline(duration - .035)
        clang = np.zeros(len(t))
        for f, weight, decay in [(397, .8, .43), (871, .55, .29), (1473, .34, .20),
                                  (2337, .17, .14), (3461, .09, .10)]:
            clang += weight * np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
        clang *= np.minimum(t / .0015, 1)
        place(result, pan(clang, .15), .035, .65)
        place(result, pan(impact(rng, .7, .35), .03), .035, .8)
    elif kind == "ball-net":
        place(result, pan(impact(rng, .24, .30), -.04), .035, .45)
        for i in range(28):
            length = .40
            t = timeline(length)
            rustle = band_noise(len(t), rng, 700, 5500) * np.exp(-t / .06)
            rustle *= np.minimum(t / .006, 1)
            pluck = np.sin(2 * np.pi * rng.uniform(180, 510) * t) * np.exp(-t / .055)
            start = .045 + i * .013 + rng.uniform(0, .023)
            place(result, pan(.065 * rustle + .022 * pluck, rng.uniform(-.8, .8)), start,
                  np.exp(-i / 13))
    return fade(stadium_space(result, .11), .004, .16)


def synthesize(spec, seed):
    name, _, family, duration, *_ = spec
    rng = np.random.default_rng(seed)
    if family == "referee":
        result = whistle(duration, spec[6], rng, name)
    elif family == "crowd":
        result = crowd(duration, rng, name)
    else:
        result = ball(duration, rng, name)
    result -= np.mean(result, axis=0)
    # Gentle common crest shaping before the same loudness normalization.
    result = np.tanh(result / max(rms(result) * 4.5, 1e-9))
    return np.asarray(result, dtype="<f4")


def measure(pcm, sample_rate=SR):
    result = run(["ffmpeg", "-hide_banner", "-nostdin", "-f", "f32le", "-ar", str(sample_rate),
                  "-ac", "2", "-i", "pipe:0", "-af",
                  "loudnorm=I=-23:TP=-3:LRA=20:print_format=json", "-f", "null", "-"],
                 input=np.asarray(pcm, dtype="<f4").tobytes())
    match = re.search(rb'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not match:
        raise RuntimeError("ffmpeg did not return loudness statistics")
    values = json.loads(match.group())
    return {"lufs_i": float(values["input_i"]), "true_peak_dbfs": float(values["input_tp"])}


def normalize(pcm):
    stats = measure(pcm)
    gain = min(TARGET_LUFS - stats["lufs_i"], PEAK_CEILING_DB - stats["true_peak_dbfs"])
    normalized = np.asarray(pcm * 10 ** (gain / 20), dtype="<f4")
    after = measure(normalized)
    if abs(after["lufs_i"] - TARGET_LUFS) > .3:
        raise RuntimeError(f"Common normalization target not met: {after}")
    return normalized, gain, after


def decode(path, sample_rate=SR):
    result = run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-f", "f32le",
                  "-ar", str(sample_rate), "-ac", "2", "pipe:1"])
    return np.frombuffer(result.stdout, dtype="<f4").reshape(-1, 2)


def seam(pcm, sample_rate=SR):
    edge = pcm[0] - pcm[-1]
    slope = np.diff(pcm, axis=0)
    seam_step = float(np.max(np.abs(edge)))
    typical = float(np.quantile(np.abs(slope), .99))
    width = round(.05 * sample_rate)
    local = np.concatenate((pcm[-width:], pcm[:width]))
    return {"boundary_step_dbfs": round(db(seam_step), 3),
            "boundary_step_over_p99_delta": round(seam_step / max(typical, 1e-12), 4),
            "seam_100ms_vs_body_rms_db": round(db(rms(local) / rms(pcm)), 3)}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(path):
    output = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)])
    return json.loads(output.stdout)


def encode(pcm, path):
    common = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(SR),
              "-ac", "2", "-i", "pipe:0", "-map_metadata", "-1", "-fflags", "+bitexact"]
    if path.suffix == ".ogg":
        options = ["-c:a", "libopus", "-b:a", "48k", "-vbr", "off", "-application", "audio",
                   "-frame_duration", "20", "-ar", "48000", "-page_duration", "1000000"]
    else:
        # Xing/LAME delay + padding metadata is retained for exact decoded trim.
        options = ["-c:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", "-write_xing", "1",
                   "-id3v2_version", "0"]
    # Compensate the encoder's small level bias (notably LAME's attenuation),
    # so both deliverable formats meet the SAME measured loudness target.
    codec_gain = 1.0
    for attempt in range(5):
        run(common + options + [str(path)], input=np.asarray(pcm * codec_gain, dtype="<f4").tobytes())
        error = TARGET_LUFS - measure(decode(path))["lufs_i"]
        if abs(error) <= .30:
            return round(db(codec_gain), 4)
        if attempt < 4:
            codec_gain *= 10 ** (error * .85 / 20)
    raise RuntimeError(f"Codec loudness compensation did not converge: {path}")


def file_metadata(path, expected_duration, loop):
    pcm = decode(path)
    details = probe(path)
    stream = details["streams"][0]
    stats = measure(pcm)
    metadata = {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path),
                "codec": stream["codec_name"], "channels": stream["channels"],
                "sample_rate_hz": int(stream["sample_rate"]),
                "decoded_frames_48000hz": len(pcm), "decoded_duration_s": len(pcm) / SR,
                "lufs_i": stats["lufs_i"], "true_peak_dbfs": stats["true_peak_dbfs"],
                "dc_offset": [round(float(value), 8) for value in np.mean(pcm, axis=0)],
                "stereo_correlation": round(float(np.corrcoef(pcm.T)[0, 1]), 5)}
    if not np.all(np.isfinite(pcm)) or np.max(np.abs(pcm)) >= 1:
        raise RuntimeError(f"Invalid or clipped decoded PCM: {path}")
    if metadata["bytes"] > LIMIT:
        raise RuntimeError(f"File exceeds {LIMIT} bytes: {path}")
    if abs(metadata["decoded_duration_s"] - expected_duration) > 1 / 24_000:
        raise RuntimeError(f"Wrong decoded duration: {metadata}")
    if abs(stats["lufs_i"] - TARGET_LUFS) > .35 or stats["true_peak_dbfs"] > -1:
        raise RuntimeError(f"Decoded loudness or headroom outside limits: {metadata}")
    if loop:
        metadata["seam"] = seam(pcm)
        if metadata["seam"]["boundary_step_dbfs"] > -40:
            raise RuntimeError(f"Loop boundary step too large: {metadata}")
        if metadata["seam"]["boundary_step_over_p99_delta"] > 1:
            raise RuntimeError(f"Loop boundary outlier: {metadata}")
        if abs(metadata["seam"]["seam_100ms_vs_body_rms_db"]) > 2:
            raise RuntimeError(f"Loop energy hole: {metadata}")
    return metadata


def build(output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema_version": 1, "pack_id": "soccer-whistle-crowd-v1", "created": "2026-11-14",
        "license": "MIT", "license_file": "LICENSE.txt", "preview": "listen.html",
        "generator": {"script": "synthesize.py", "seed": BASE_SEED,
                      "python": platform.python_version(), "numpy": np.__version__,
                      "scipy": scipy.__version__,
                      "ffmpeg": run(["ffmpeg", "-version"]).stdout.decode().splitlines()[0],
                      "source": "Original DSP only; no recordings, samples, TTS, network or models."},
        "audio": {"master_sample_rate_hz": SR, "channels": 2, "max_file_bytes": LIMIT,
                  "normalization": {"method": "Shared BS.1770/EBU R128 gated integrated loudness; linear gain",
                                    "target_lufs_i": TARGET_LUFS, "master_true_peak_ceiling_dbtp": PEAK_CEILING_DB,
                                    "encoded_loudness_tolerance_lu": .35, "encoded_true_peak_ceiling_dbtp": -1,
                                    "playback_gain_baked_in": False},
                  "formats": {"ogg": {"mime": 'audio/ogg; codecs="opus"', "codec": "Opus", "bitrate_bps": 48000},
                              "mp3": {"mime": "audio/mpeg", "codec": "MP3", "bitrate_bps": 48000}}},
        "integration": {"loop": "Decode once with Web Audio; loopStart=0, loopEnd=12; preserve codec trim metadata.",
                        "gain": "Apply recommended_gain_linear once; then master gain 0.70. Preview does both.",
                        "max_event_voices": 3, "max_crowd_beds": 1,
                        "exclusive_groups": {"referee": [s[0] for s in SPECS if s[2] == "referee"],
                                             "crowd-reaction": ["crowd-shot-rise", "crowd-goal", "crowd-miss"]},
                        "duck_stadium_during_referee_db": -8, "duck_attack_ms": 35, "duck_release_ms": 350,
                        "stop_ramp_ms": 40, "rise_to_reaction_crossfade_ms": 100,
                        "preview_only": True},
        "assets": []}
    # Validate complete temporary encodes before copying them into the pack.
    with tempfile.TemporaryDirectory(prefix="soccer-synthesis-") as scratch:
        for index, spec in enumerate(SPECS):
            name, label, family, duration, playback_db, description, pulses = spec
            seed = BASE_SEED + index * 997
            source, gain, stats = normalize(synthesize(spec, seed))
            loop = name == "crowd-stadium-loop"
            asset = {"id": name, "label_he": label, "group": family, "description_he": description,
                     "duration_s": duration, "loop": loop, "loop_start_s": 0 if loop else None,
                     "loop_end_s": duration if loop else None, "seed": seed,
                     "recommended_gain_db": playback_db,
                     "recommended_gain_linear": round(10 ** (playback_db / 20), 6),
                     "source_pcm_sha256": hashlib.sha256(source.tobytes()).hexdigest(),
                     "normalization_gain_db": round(gain, 4), "master": stats,
                     "whistle_pulses": [{"start_s": at, "duration_s": length} for at, length in pulses],
                     "files": {}}
            if loop:
                asset["source_seam"] = seam(source)
            for extension in ("ogg", "mp3"):
                tmp = Path(scratch) / f"{name}.{extension}"
                compensation = encode(source, tmp)
                asset["files"][extension] = file_metadata(tmp, duration, loop)
                asset["files"][extension]["codec_compensation_db"] = compensation
                shutil.copyfile(tmp, output / tmp.name)
            manifest["assets"].append(asset)
            print(f"{name}: " + ", ".join(f"{ext} {meta['bytes']} B / {meta['lufs_i']} LUFS"
                                         for ext, meta in asset["files"].items()), flush=True)
    target = output / "manifest.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    verify(output)


def verify(output):
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    if [asset["id"] for asset in manifest["assets"]] != [spec[0] for spec in SPECS]:
        raise RuntimeError("Missing, reordered or unexpected assets")
    expected_files = set()
    for asset, spec in zip(manifest["assets"], SPECS):
        if asset["duration_s"] != spec[3] or asset["recommended_gain_db"] != spec[4]:
            raise RuntimeError(f"Asset specification mismatch: {asset['id']}")
        if len(asset["whistle_pulses"]) != len(spec[6]):
            raise RuntimeError(f"Whistle pulse mismatch: {asset['id']}")
        for extension in ("ogg", "mp3"):
            saved = asset["files"][extension]
            path = output / saved["path"]
            expected_files.add(path.name)
            actual = file_metadata(path, asset["duration_s"], asset["loop"])
            if actual != {key: value for key, value in saved.items() if key != "codec_compensation_db"}:
                raise RuntimeError(f"Manifest does not match decoded file: {path}")
            if asset["group"] == "referee":
                # Inspect the AUDIO envelope, independently of declared pulses.
                pcm = decode(path)
                frame = round(.01 * SR)
                blocks = pcm[:len(pcm) // frame * frame].reshape(-1, frame, 2)
                envelope = np.sqrt(np.mean(np.square(blocks), axis=(1, 2)))
                audible = envelope > .22 * np.max(envelope)
                changes = np.diff(np.pad(audible.astype(int), (1, 1)))
                pulse_count = int(np.sum(changes == 1))
                if pulse_count != len(spec[6]):
                    raise RuntimeError(f"Wrong number of audible whistle pulses: {path}: {pulse_count}")
    actual_files = {p.name for p in output.iterdir() if p.suffix in (".ogg", ".mp3")}
    if actual_files != expected_files:
        raise RuntimeError("Unexpected or missing audio files")
    for path in output.rglob("*"):
        if path.is_file() and path.stat().st_size > LIMIT:
            raise RuntimeError(f"Pack file over {LIMIT} bytes: {path}")
    print("PASS: 16 assets / 32 files; hashes, duration, codec, loudness, headroom, loop seams and audible whistle counts.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    parser.add_argument("--verify", action="store_true", help="Read-only verification of existing files")
    args = parser.parse_args()
    for command in ("ffmpeg", "ffprobe"):
        if not shutil.which(command):
            parser.error(f"Required executable not found: {command}")
    if args.verify:
        verify(args.output.resolve())
    else:
        build(args.output.resolve())


if __name__ == "__main__":
    main()
