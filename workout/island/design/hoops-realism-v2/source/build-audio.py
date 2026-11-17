#!/usr/bin/env python3
"""Original deterministic basketball Foley synthesis; no recordings or samples.

Requires Python 3, NumPy, SciPy and ffmpeg (libvorbis/libmp3lame).
Run from any directory: python3 /path/to/source/build-audio.py
All output stays in this package. PCM intermediates are streamed, never committed.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess

import numpy as np
from scipy import signal


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "audio"
RATE = 44100
LIMIT = 40000
TAU = math.tau


def noise(rng, count, lo, hi):
    """Bounded, causal bandpass noise, normalised by RMS."""
    sos = signal.butter(3, (lo, hi), btype="bandpass", fs=RATE, output="sos")
    n = signal.sosfilt(sos, rng.standard_normal(count))
    return n / max(float(np.sqrt(np.mean(n * n))), 1e-10)


def transient(t, attack, decay):
    return (1 - np.exp(-t / attack)) * np.exp(-t / decay)


def rim(rng, variant):
    # Inharmonic rim modes with deliberately short damping: no long gong tail.
    duration = (0.230, 0.255, 0.215)[variant]
    t = np.arange(round(duration * RATE)) / RATE
    modes = (
        ((698, .041, .40), (1119, .028, .22), (1823, .020, .10), (2731, .012, .045)),
        ((764, .047, .38), (1237, .027, .23), (1999, .018, .09), (2897, .011, .040)),
        ((647, .035, .42), (1067, .023, .23), (1747, .016, .10), (2549, .010, .040)),
    )[variant]
    x = np.zeros_like(t)
    for frequency, decay, amplitude in modes:
        x += amplitude * np.sin(TAU * frequency * t) * transient(t, .0006, decay)
    # Ball contact softens the rim tick and adds a tiny rubber body.
    x += .11 * np.sin(TAU * 188 * t) * transient(t, .0005, .013)
    x += .032 * noise(rng, len(t), 1000, 5300) * transient(t, .0004, .005)
    return x


def net_swish(rng):
    t = np.arange(round(.390 * RATE)) / RATE
    high = noise(rng, len(t), 1600, 7800)
    low = noise(rng, len(t), 450, 2700)
    progress = np.clip(t / .30, 0, 1)
    flow = .65 * (1 - progress) * high + (.2 + .55 * progress) * low
    env = (1 - np.exp(-t / .011)) * np.exp(-t / .075)
    flutter = .68 + .22 * np.sin(TAU * (39 * t + 37 * t * t))
    x = .28 * flow * env * flutter
    for start, amount in ((.024, .026), (.061, .020), (.103, .013)):
        age = np.maximum(t - start, 0)
        x += amount * high * (t >= start) * transient(age, .0012, .009)
    return x


def backboard(rng):
    t = np.arange(round(.240 * RATE)) / RATE
    x = .52 * np.sin(TAU * 146 * t) * transient(t, .0010, .027)
    x += .18 * np.sin(TAU * 337 * t) * transient(t, .0006, .018)
    x += .08 * np.sin(TAU * 593 * t) * transient(t, .0005, .009)
    x += .06 * noise(rng, len(t), 180, 1800) * transient(t, .0005, .010)
    return x


def parquet_bounce(rng):
    t = np.arange(round(.295 * RATE)) / RATE
    # Air cavity drops quickly in pitch; a woody high mode marks hardwood.
    phase = TAU * (103 * t + (110 * .012) * (1 - np.exp(-t / .012)))
    env = transient(t, .0013, .041)
    x = .48 * np.sin(phase) * env
    x += .13 * np.sin(2.17 * phase) * transient(t, .0008, .020)
    x += .08 * np.sin(TAU * 616 * t) * transient(t, .0004, .011)
    x += .042 * noise(rng, len(t), 1200, 5200) * transient(t, .0006, .006)
    # Tiny early floor reflection, not a second bounce.
    delay = round(.008 * RATE)
    x[delay:] += .09 * x[:-delay]
    return x


def shoe_squeak(rng):
    t = np.arange(round(.375 * RATE)) / RATE
    # Friction oscillator with changing contact force and two stick-slip bursts.
    f = 1370 + 650 * np.sin(np.minimum(t / .29, 1) * np.pi) + 125 * np.sin(TAU * 34 * t)
    phase = TAU * np.cumsum(f) / RATE
    env = np.exp(-((t - .085) / .044) ** 2) + .57 * np.exp(-((t - .205) / .048) ** 2)
    pulse = .78 + .22 * np.sin(TAU * 73 * t)
    tonal = np.sin(phase) + .19 * np.sin(2 * phase + .6) + .035 * np.sin(3 * phase)
    x = .21 * tonal * env * pulse
    x += .018 * noise(rng, len(t), 650, 4700) * env
    x += .012 * noise(rng, len(t), 120, 1300) * transient(t, .008, .041)
    return x


def finish(x):
    # DC blocker, sub-millisecond ramp in, and a 12 ms silent-end ramp.
    x = signal.sosfilt(signal.butter(2, 55, btype="highpass", fs=RATE, output="sos"), x)
    x -= np.mean(x)
    attack = round(.0006 * RATE)
    tail = round(.012 * RATE)
    x[:attack] *= np.linspace(0, 1, attack) ** 2
    x[-tail:] *= np.linspace(1, 0, tail) ** 2
    x *= 10 ** (-4.5 / 20) / max(float(np.max(np.abs(x))), 1e-10)
    return np.asarray(x, dtype="<f4")


def run(args, data=None):
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout


def db(value):
    return round(20 * math.log10(max(float(value), 1e-10)), 3)


def metrics(x):
    x = x.astype(float)
    power = np.abs(np.fft.rfft(x)) ** 2
    frequencies = np.fft.rfftfreq(len(x), 1 / RATE)
    cumulative = np.cumsum(x * x)
    energy = cumulative[-1]
    tail = x[-round(.015 * RATE):]
    return {
        "decoded_samples": len(x),
        "decoded_duration_seconds": round(len(x) / RATE, 6),
        "peak_dbfs": db(np.max(np.abs(x))),
        "rms_dbfs": db(np.sqrt(np.mean(x * x))),
        "dc_mean": round(float(np.mean(x)), 8),
        "tail_15ms_rms_dbfs": db(np.sqrt(np.mean(tail * tail))),
        "energy_95_percent_seconds": round(float(np.searchsorted(cumulative, .95 * energy)) / RATE, 6),
        "spectral_centroid_hz": round(float(np.sum(frequencies * power) / np.sum(power)), 1),
        "energy_below_300hz_percent": round(float(np.sum(power[frequencies < 300]) / np.sum(power)) * 100, 3),
        "last_sample_abs": round(abs(float(x[-1])), 8),
        "clipped_samples": int(np.count_nonzero(np.abs(x) >= 1)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    definitions = [
        ("rim-hit-01", "פגיעה בטבעת · רכה", "rim", "Short damped inharmonic metal tick, low soft ball contact", lambda r: rim(r, 0), .72),
        ("rim-hit-02", "פגיעה בטבעת · מעט גבוהה", "rim", "Short alternate rim tick; no sustained bell resonance", lambda r: rim(r, 1), .69),
        ("rim-hit-03", "פגיעה בטבעת · עמוקה", "rim", "Lower, tighter muted metal contact", lambda r: rim(r, 2), .75),
        ("net-swish", "סווש רשת", "net", "Descending noisy cord friction with three tiny thread flicks", net_swish, .78),
        ("backboard-thud", "חבטה עמומה בלוח", "backboard", "Damped low panel and rubber impact, no glass-shatter sample", backboard, .76),
        ("parquet-bounce", "כדור על פרקט", "bounce", "Rubber air-cavity pitch drop, woody contact, short early reflection", parquet_bounce, .85),
        ("shoe-squeak", "חריקת נעלי כדורסל", "shoe", "Two short changing-pitch stick-slip contacts and rubber friction", shoe_squeak, .52),
    ]
    assets = []
    for index, (name, label, event, description, synth, gain) in enumerate(definitions):
        samples = finish(synth(np.random.default_rng(2026111700 + index)))
        entry = {"id": name, "label_he": label, "event": event, "description": description,
                 "loop": False, "sample_rate_hz": RATE, "channels": 1,
                 "duration_seconds": round(len(samples) / RATE, 6), "suggested_gain": gain,
                 "license": "CC0-1.0", "source": "source/build-audio.py", "files": {}}
        for extension, encoder in (("ogg", ["-c:a", "libvorbis", "-q:a", "3"]),
                                   ("mp3", ["-c:a", "libmp3lame", "-b:a", "96k", "-write_xing", "1"])):
            path = OUT / f"{name}.{extension}"
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(RATE),
                 "-ac", "1", "-i", "pipe:0", "-map_metadata", "-1", "-fflags", "+bitexact",
                 "-flags:a", "+bitexact", *encoder, str(path)], samples.tobytes())
            decoded = np.frombuffer(run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                                          "-ar", str(RATE), "-ac", "1", "-f", "f32le", "pipe:1"]), dtype="<f4")
            data = path.read_bytes()
            measured = metrics(decoded)
            assert len(data) <= LIMIT, path
            assert measured["peak_dbfs"] < -1.0, (path, measured)
            assert measured["clipped_samples"] == 0, path
            assert abs(measured["dc_mean"]) < .001, path
            assert measured["tail_15ms_rms_dbfs"] < -40, (path, measured)
            # Vorbis raw PCM decode may expose one 1024-sample padding frame;
            # the container granule still declares the exact logical duration.
            assert abs(measured["decoded_duration_seconds"] - entry["duration_seconds"]) < .025, path
            file_entry = {"path": f"audio/{path.name}", "bytes": len(data),
                          "sha256": hashlib.sha256(data).hexdigest(), "metrics": measured}
            entry["files"][extension] = file_entry
        assets.append(entry)
    catalog = {"schema_version": 1, "license": "CC0-1.0", "provenance": "Original deterministic procedural synthesis; no external audio samples",
               "file_limit_bytes": LIMIT, "sample_rate_hz": RATE, "channels": 1, "assets": assets,
               "total_bytes": sum(f["bytes"] for a in assets for f in a["files"].values())}
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sounds": len(assets), "encoded_files": 2 * len(assets), "total_bytes": catalog["total_bytes"],
                      "largest_file_bytes": max(f["bytes"] for a in assets for f in a["files"].values()),
                      "max_decoded_peak_dbfs": max(f["metrics"]["peak_dbfs"] for a in assets for f in a["files"].values())}))


if __name__ == "__main__":
    main()
