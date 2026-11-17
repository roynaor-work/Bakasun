#!/usr/bin/env python3
"""Original, deterministic racing sound design. Local NumPy/SciPy + native FFmpeg.

Run `python synthesize.py` from any working directory, then `python analyze.py
--validate`. Only this new package is written; existing game assets are read-only.
Python >=3.10, NumPy >=1.24, SciPy >=1.10; FFmpeg with libvorbis/libmp3lame.
There are no downloads, recordings, model weights, WASM, or runtime dependencies.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
RATE = 32000
PERIOD_SAMPLES = 73728  # 2.304 s; common multiple of 1152 and 1024.
GUARD_SAMPLES = 9216  # 288 ms of cyclic context on either side, never loop silence.
TARGET_LUFS = -18.0
BASE_COMMIT = "8ad88bada735ba9f50da6319ab708a4905bdc09c"


def rms(x):
    return float(np.sqrt(np.mean(np.square(x))) + 1e-15)


def unit(x):
    return x / rms(x)


def ceiling(f):
    """Raised cosine transition 1350..1750 Hz, exactly zero thereafter."""
    z = np.clip((f - 1350.0) / 400.0, 0.0, 1.0)
    return 0.5 + 0.5 * np.cos(np.pi * z)


def bandlimit(x):
    f = np.fft.rfftfreq(len(x), 1 / RATE)
    h = ceiling(f) * (1 - np.exp(-np.square(f / 42.0)))
    h[0] = 0
    return np.fft.irfft(np.fft.rfft(x) * h, n=len(x))


def texture(n, rng, low=65, high=900, center=None):
    """Circular stochastic texture: coloured before it is ever audible."""
    f = np.fft.rfftfreq(n, 1 / RATE)
    shape = (1 - np.exp(-np.square(f / low))) / np.sqrt(1 + (f / high) ** 8)
    if center is not None:
        shape *= 0.3 + np.exp(-0.5 * ((f - center) / (center * 0.65)) ** 2)
    shape *= ceiling(f)
    shape[0] = 0
    return unit(np.fft.irfft(np.fft.rfft(rng.normal(size=n)) * shape, n=n))


def pulses(n, positions, strengths, high=650):
    """Fractional combustion/contact impulses through a broad, damped resonator.

    The engine is a pulse train with noise and timing variation, not a sine cue.
    Circular filtering makes the entire source period and its derivatives repeat.
    """
    exc = np.zeros(n)
    idx = np.asarray(positions) * RATE
    for k, a in zip(idx, strengths):
        i = math.floor(k)
        frac = k - i
        exc[i % n] += a * (1 - frac)
        exc[(i + 1) % n] += a * frac
    f = np.fft.rfftfreq(n, 1 / RATE)
    h = (1 - np.exp(-(f / 47) ** 2)) / (1 + (1j * f / high)) ** 2
    h *= ceiling(f)
    return unit(np.fft.irfft(np.fft.rfft(exc) * h, n=n))


def cyclic_engine(n, rng, count=141, limiter=False):
    duration = n / RATE
    t = np.arange(n) / RATE
    a = np.arange(count)
    positions = a * duration / count + 0.00035 * np.sin(2 * np.pi * a * 7 / count)
    strengths = 0.92 + 0.08 * np.sin(2 * np.pi * a * 13 / count)
    if limiter:
        # Soft irregular torque cuts, with no alert tone or high frequency beep.
        for center, width in [(0.36, 0.09), (1.03, 0.13), (1.65, 0.08), (2.04, 0.10)]:
            strengths *= 1 - 0.58 * np.exp(-0.5 * ((positions - center) / width) ** 2)
    body = pulses(n, positions, strengths, high=360 if not limiter else 440)
    air = texture(n, rng, low=70, high=680, center=260)
    uneven = 0.91 + 0.055 * np.sin(2 * np.pi * t / duration * 3)
    return (0.76 * body + 0.24 * air) * uneven


def soft_grains(n, rng, count, high=700):
    duration = n / RATE
    positions = rng.uniform(0, duration, count)
    strengths = rng.uniform(0.25, 1.0, count)
    return pulses(n, positions, strengths, high=high)


def make_loop(category, intensity, rng):
    n = PERIOD_SAMPLES
    t = np.arange(n) / RATE
    u = t / (n / RATE)
    level = {"low": 0, "medium": 1, "high": 2}.get(intensity, 0)
    if category == "pit_engine":
        return cyclic_engine(n, rng)
    if category == "pit_limiter":
        return cyclic_engine(n, rng, count=177, limiter=True)
    if category == "pit_bay":
        ventilation = texture(n, rng, low=80, high=510, center=190)
        rubber = soft_grains(n, rng, 12, high=290)
        return 0.88 * ventilation + 0.12 * rubber
    if category == "pit_crew":
        # Indistinct synthetic murmur, fabric and padded tools. No recorded voice.
        f = np.fft.rfftfreq(n, 1 / RATE)
        voice_shape = sum(np.exp(-0.5 * ((f - c) / w) ** 2)
                          for c, w in [(210, 100), (460, 160), (830, 210)])
        murmur = np.fft.irfft(np.fft.rfft(rng.normal(size=n)) * voice_shape * ceiling(f), n=n)
        env = 0.22 + 0.30 * (1 + np.sin(2 * np.pi * u * 2 + 0.7)) ** 2
        return 0.78 * unit(murmur) * env + 0.22 * soft_grains(n, rng, 15, 360)
    if category == "gravel":
        contact = soft_grains(n, rng, 130 + 85 * level, 460 + 145 * level)
        bed = texture(n, rng, low=90, high=720 + 170 * level, center=430)
        env = 0.88 + 0.08 * np.sin(2 * np.pi * u * (5 + level))
        return (0.65 * contact + 0.35 * bed) * env
    if category == "grass":
        fiber = texture(n, rng, low=110, high=640 + 160 * level, center=400)
        roll = texture(n, rng, low=50, high=220, center=110)
        env = 0.72 + 0.18 * np.sin(2 * np.pi * u * (7 + level)) ** 2
        return (0.72 * fiber + 0.28 * roll) * env
    if category == "brake":
        friction = texture(n, rng, low=145, high=760 + 180 * level, center=430 + 65 * level)
        contact = soft_grains(n, rng, 110 + 55 * level, 330 + 90 * level)
        env = 0.91 + 0.07 * np.sin(2 * np.pi * u * (6 + level))
        return (0.83 * friction + 0.17 * contact) * env
    raise ValueError(category)


def moving_engine(t, rpm_hz):
    phase = np.cumsum(rpm_hz) / RATE
    marks = np.flatnonzero(np.diff(np.floor(phase), prepend=-1) > 0)
    strengths = 0.9 + 0.1 * np.sin(marks / RATE * 31)
    return pulses(len(t), marks / RATE, strengths, high=530)


def fade(x, attack=0.028, release=0.13):
    a = min(round(attack * RATE), len(x) // 3)
    b = min(round(release * RATE), len(x) // 3)
    x = x.copy()
    x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def make_event(category, variant, duration, rng):
    t = np.arange(round(duration * RATE)) / RATE
    u = t / duration
    if category == "deceleration":
        freq = (153 + 9 * variant) * np.exp(-1.13 * u) + 15
        freq += (7 + 2 * variant) * np.exp(-0.5 * ((u - 0.36) / 0.055) ** 2)
        torque = 0.97 - 0.48 * u
        pop_at = 0.38 + variant * 0.025
    elif category == "shift_up":
        change = 0.5 + 0.5 * np.tanh((u - 0.30) / 0.045)
        freq = 165 + variant * 8 - (48 + variant * 3) * change + 10 * u
        torque = 0.84 - 0.48 * np.exp(-0.5 * ((u - 0.29) / 0.09) ** 2)
        pop_at = 0.20 + variant * 0.018
    elif category == "shift_down":
        freq = 94 + variant * 5 + 52 * np.exp(-0.5 * ((u - 0.40) / 0.14) ** 2) + 17 * u
        torque = 0.78 - 0.28 * np.exp(-0.5 * ((u - 0.24) / 0.07) ** 2)
        pop_at = 0.29 + variant * 0.02
    else:
        raise ValueError(category)
    body = moving_engine(t, freq) * torque
    air = texture(len(t), rng, low=70, high=700, center=300)
    # Small rounded exhaust puff; its energy remains below the engine body.
    puff = texture(len(t), rng, low=45, high=390, center=140)
    puff *= np.exp(-0.5 * ((t - pop_at) / 0.026) ** 2)
    clunk = texture(len(t), rng, low=65, high=300, center=140)
    clunk *= np.exp(-0.5 * ((u - 0.26) / 0.045) ** 2)
    x = (0.78 * body + 0.22 * air) * (1 - 0.18 * u) + 0.11 * puff + 0.055 * clunk
    return fade(x)


def definitions():
    result = []
    pit = [
        ("pit-engine-slow", "מנוע שקט בנסיעה לפיט", "pit_engine", -10,
         "פעימות בעירה נמוכות עם חספוס עדין, ללא צליל סינוס מבודד."),
        ("pit-limiter", "מגביל מהירות רך", "pit_limiter", -18,
         "קיטוע מומנט מעוגל, ללא צפצוף או התראה טונאלית."),
        ("pit-bay-proximity", "קרבת תא הטיפול", "pit_bay", -24,
         "אוורור עמום ורחש גומי; העוצמה עולה בהדרגה ככל שמתקרבים לתא."),
        ("pit-crew-background", "צוות ברקע", "pit_crew", -28,
         "מלמול סינתטי לא מילולי, בד וכלים מרופדים בעוצמה נמוכה."),
    ]
    for ident, label, synth, gain, desc in pit:
        result.append(dict(id=ident, label_he=label, category="pit", synthesis=synth,
                           nominal_gain_db=gain, intensity=None, variant=1,
                           speed_mps={"min": 0, "max": 20}, description_he=desc, is_loop=True))
    for cat, label, desc in [
        ("gravel", "חצץ", "גרגרים מעוגלים וגלגול נמוך, ללא רעש לבן חשוף."),
        ("grass", "עשב", "סיבים רכים ורחש צמיג עמום."),
        ("brake", "בלימה", "חיכוך צמיגים רחב ונמוך ללא חריקה מתכתית."),
    ]:
        for i, (level, name) in enumerate([("low", "חלשה"), ("medium", "בינונית"), ("high", "חזקה")]):
            prefix = "brake" if cat == "brake" else f"offtrack-{cat}"
            result.append(dict(id=f"{prefix}-{level}", label_he=f"{label} · {name}",
                               category=cat, synthesis=cat, intensity=level, variant=i + 1,
                               nominal_gain_db=[-18, -14, -10][i],
                               speed_mps={"min": [0, 18, 30][i], "max": [18, 30, 90][i]},
                               description_he=desc, is_loop=True))
    for cat, prefix, label, durations in [
        ("deceleration", "decel-downshift", "האטה והורדת הילוך", [0.972, 1.080, 1.152, 1.008]),
        ("shift_up", "shift-up", "העלאת הילוך", [0.720, 0.792, 0.864]),
        ("shift_down", "shift-down", "הורדת הילוך", [0.792, 0.864, 0.936]),
    ]:
        for i, duration in enumerate(durations, 1):
            result.append(dict(id=f"{prefix}-{i:02d}", label_he=f"{label} · {i}", category=cat,
                               synthesis=cat, intensity=None, variant=i, nominal_gain_db=-10,
                               speed_mps={"min": 0, "max": 90}, duration_seconds=duration,
                               description_he="מנוע משתנה עם הפסקת מומנט ופופ מפלט קטן ורך.", is_loop=False))
    return result


def measure(path):
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-af",
           "loudnorm=I=-18:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]
    p = subprocess.run(cmd, capture_output=True, text=True, check=True)
    start = p.stderr.rfind("{")
    data = json.loads(p.stderr[start:p.stderr.rfind("}") + 1])
    return float(data["input_i"]), float(data["input_tp"])


def encode_one(task):
    asset, samples, codec, scratch = task
    target = ROOT / "audio" / f"{asset['id']}.{codec}"
    wav = Path(scratch) / f"{asset['id']}-{codec}.wav"
    wavfile.write(wav, RATE, samples.astype(np.float32))
    input_lufs, _ = measure(wav)
    if not np.isfinite(input_lufs):
        raise RuntimeError(f"Cannot measure {asset['id']}")
    gain = 10 ** ((TARGET_LUFS - input_lufs) / 20)
    # Linear gain only: dynamic loudnorm/limiting would disturb a periodic seam.
    for attempt in range(4):
        wavfile.write(wav, RATE, (samples * gain).astype(np.float32))
        cmd = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(wav),
               "-map_metadata", "-1", "-ac", "1", "-ar", str(RATE),
               "-fflags", "+bitexact", "-flags:a", "+bitexact"]
        if codec == "ogg":
            cmd += ["-c:a", "libvorbis", "-q:a", "3", "-serial_offset", "0"]
        else:
            cmd += ["-c:a", "libmp3lame", "-b:a", "64k", "-write_xing", "1", "-id3v2_version", "0"]
        subprocess.run(cmd + [str(target)], capture_output=True, check=True)
        lufs, peak = measure(target)
        if abs(lufs - TARGET_LUFS) <= 0.08:
            break
        gain *= 10 ** ((TARGET_LUFS - lufs) / 20)
    if abs(lufs - TARGET_LUFS) > 0.15 or peak > -1.0:
        raise RuntimeError(f"Level out of specification: {target.name}: {lufs} LUFS / {peak} dBTP")
    if target.stat().st_size > 50000:
        raise RuntimeError(f"Size out of specification: {target.name}")
    return asset["id"], codec, dict(path=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
                                  sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                                  lufs_i=lufs, true_peak_dbtp=peak,
                                  normalization_gain_db=round(20 * math.log10(gain), 5))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=4, help="Local codec workers (default 4).")
    args = parser.parse_args()
    (ROOT / "audio").mkdir(exist_ok=True)
    assets = definitions()
    tasks = []
    with tempfile.TemporaryDirectory(prefix="racing-v5-") as scratch:
        for a in assets:
            seed = int.from_bytes(hashlib.sha256(("racing-v5-original:" + a["id"]).encode()).digest()[:8], "little")
            rng = np.random.default_rng(seed)
            if a["is_loop"]:
                x = make_loop(a["synthesis"], a["intensity"], rng)
            else:
                x = make_event(a["synthesis"], a["variant"], a["duration_seconds"], rng)
            # Soft compression tames peaks; spectral ceiling is applied AFTER it.
            x = bandlimit(np.tanh(unit(x) * 0.46))
            if a["is_loop"]:
                # This cyclic phase avoids a Vorbis short/long block decision at
                # the quiet gravel seam. No samples are removed or faded out.
                rotation = 4096 if a["id"] == "offtrack-gravel-low" else 0
                x = np.roll(x, rotation)
                x = np.concatenate([x[-GUARD_SAMPLES:], x, x[:GUARD_SAMPLES]])
                a["loop"] = dict(enabled=True, sample_rate=RATE, start_sample=GUARD_SAMPLES,
                                 end_sample=GUARD_SAMPLES + PERIOD_SAMPLES,
                                 start_seconds=GUARD_SAMPLES / RATE,
                                 end_seconds=(GUARD_SAMPLES + PERIOD_SAMPLES) / RATE,
                                 period_seconds=PERIOD_SAMPLES / RATE, guard_seconds=GUARD_SAMPLES / RATE,
                                 phase_rotation_samples=rotation, crossfade_ms=0,
                                 method="periodic PCM, cyclic codec guards, interior loop")
            else:
                a["loop"] = dict(enabled=False, start_seconds=0, end_seconds=len(x) / RATE, crossfade_ms=0)
            a["duration_seconds"] = len(x) / RATE
            a["playback_rate"] = {"min": 0.82, "max": 1.08} if a["is_loop"] else {"min": 1.0, "max": 1.0}
            a["seed"] = seed
            a["files"] = {}
            for codec in ["ogg", "mp3"]:
                tasks.append((a, x, codec, scratch))
        by_id = {a["id"]: a for a in assets}
        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
            for ident, codec, result in pool.map(encode_one, tasks):
                by_id[ident]["files"][codec] = result
                print(f"{ident}.{codec}: {result['bytes']} B, {result['lufs_i']:.2f} LUFS, {result['true_peak_dbtp']:.2f} dBTP", flush=True)
    for a in assets:
        del a["is_loop"]
    manifest = dict(
        schema_version=1, version="racing-audio-v5", title_he="ערכת צלילי מירוצים · גרסה 5",
        created_date="2026-11-17", source_commit=BASE_COMMIT, status="design-review; not connected to game",
        license="CC0-1.0 (audio); MIT (code). See LICENSE.txt.",
        audio=dict(sample_rate_hz=RATE, channels=1, codecs={"ogg": "Vorbis quality 3", "mp3": "LAME 64 kbit/s CBR with gapless Xing header"}),
        constraints=dict(target_lufs_i=-18, lufs_tolerance=0.25, max_bytes_per_file=50000,
                         max_true_peak_dbtp=-1, source_stopband_hz=1750, max_playback_rate=1.08,
                         decoded_high_band_energy_db_max=-45, significant_line_gate_db=-55,
                         local_only=True, wasm=False, original_synthesis=True),
        mixing=dict(master_gain_db=-6, surface_transition_ms=450, brake_transition_ms=180,
                    pit_transition_ms=650, layer_attack_ms=80, layer_release_ms=160,
                    speed_thresholds_mps=[6, 18, 30], max_speed_mps=90,
                    speed_note_he="מתחת ל־6 מ׳/ש׳ חיכוך ושוליים דועכים לשקט; 18 ו־30 הם מרכזי המעבר בין העוצמות.",
                    variant_policy="Round-robin or seeded no-immediate-repeat; never layer two variants of the same event.",
                    pit=dict(speed_limit_mps=20, bay_proximity_range=[0, 1], crew_gain_db=-28,
                             limiter_gain_db=-18, engine_gain_db=-10, bay_gain_db=-24),
                    instructions_he=["כל קובץ מנורמל לפני עוצמת הערבוב; עוצמת העוצמה נשמרת ב־nominal_gain_db.",
                                     "לנגן רק בין נקודות הלולאה; guards אינם חלק מהמחזור.",
                                     "לעבור בין עוצמות באמצעות דעיכה משולבת; לא להפעיל את כל שלוש העוצמות יחד בעוצמה מלאה.",
                                     "הגבלת מהירות היא אירוע המשחק; שכבת המגביל היא תגובה קולית, ללא צפצוף.",
                                     "לצורך חיבור למשחק יש להעביר phase של הפיט ולהנמיך את המנוע הישן בתרחישים אלה."]),
        baseline=dict(path="../../assets/racing-audio-v4", access="read-only", source_commit=BASE_COMMIT,
                      matched_pairs={f"brake-{v}": f"brake-loop-{old}" for v, old in [("low", "light"), ("medium", "medium"), ("high", "hard")]},
                      note_he="רק שלושת לופי הבלימה תואמים ישירות; side-scrape הוא הקשר לחיכוך בלבד. לפיט/שוליים/הילוכים אין דגימות v4 תואמות."),
        assets=assets,
    )
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(assets)} original cues / {len(tasks)} encoded files and manifest.json.")


if __name__ == "__main__":
    main()
