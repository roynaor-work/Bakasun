#!/usr/bin/env python3
"""Original CC0 procedural sound effects. Build or verify encoded deliverables."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TARGET = -16.0
SPECS = [
    dict(id="jet-flyby", title="מעבר מטוס", seconds=1.5, seed=2026111201,
         loop=False, recipe="Doppler-shifted turbine harmonics and swept filtered noise; approach/recede envelope."),
    dict(id="helicopter-rotor-loop", title="רוטור מסוק", seconds=4.0, seed=2026111202,
         loop=True, recipe="Periodic FFT-shaped noise, 24 Hz blade pulses, 6 Hz revolution and turbine harmonics."),
    dict(id="vulcan-metal-hit", title="פגיעת וולקן במתכת", seconds=0.55, seed=2026111203,
         loop=False, recipe="One short broadband strike, low body and inharmonic decaying metal modes."),
    dict(id="sea-fall", title="נפילה לים", seconds=2.0, seed=2026111204,
         loop=False, recipe="Descending 2300–300 Hz whistle, water impact, filtered spray and falling bubble oscillators."),
]


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def fade(x, attack=0.008, release=0.025):
    x = x.copy()
    a, b = round(attack * RATE), round(release * RATE)
    x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def noise(rng, n, low, high, periodic=False):
    if periodic:
        f = np.fft.rfftfreq(n, 1 / RATE)
        spectrum = np.fft.rfft(rng.standard_normal(n))
        # Smooth spectral shoulders; inverse FFT guarantees a periodic signal.
        weight = (1 - np.exp(-(f / low) ** 4)) * np.exp(-(f / high) ** 4)
        y = np.fft.irfft(spectrum * weight, n=n)
    else:
        sos = butter(3, [low, high], btype="bandpass", fs=RATE, output="sos")
        y = sosfilt(sos, rng.standard_normal(n))
    return y / np.std(y)


def synth(spec):
    n = round(spec["seconds"] * RATE)
    t = np.arange(n) / RATE
    rng = np.random.Generator(np.random.PCG64(spec["seed"]))
    name = spec["id"]
    if name == "jet-flyby":
        # Radial source velocity changes sign at closest approach (0.68 s).
        v, c, closest = 155.0, 343.0, 38.0
        along = v * (t - 0.68)
        distance = np.sqrt(closest ** 2 + along ** 2)
        radial = v * along / distance
        doppler = c / (c + radial)
        phase = 2 * np.pi * np.cumsum(460 * doppler) / RATE
        turbine = sum(np.sin(k * phase + 0.13 * k) / k ** 1.15 for k in range(1, 8))
        air_low = noise(rng, n, 100, 1800)
        air_high = noise(rng, n, 1000, 10500)
        presence = (closest / distance) ** 1.5
        x = fade(presence * (0.28 * turbine + 0.47 * air_low + 0.25 * presence * air_high), 0.06, 0.15)
    elif name == "helicopter-rotor-loop":
        # All modulation and carrier frequencies complete integer cycles in 4 s.
        pulse = (0.5 + 0.5 * np.cos(2 * np.pi * 24 * t)) ** 6
        rotation = 0.84 + 0.16 * np.cos(2 * np.pi * 6 * t)
        air = noise(rng, n, 90, 3200, periodic=True)
        engine = sum(np.sin(2 * np.pi * f * t + p) * a for f, p, a in
                     [(48, 0.2, 0.24), (96, 0.5, 0.12), (192, 0.1, 0.07), (384, 0.4, 0.025)])
        # Taper only the stochastic layer over ~20 ms at the cyclic boundary.
        # The periodic engine continues throughout, with no silent gap or full-signal fade.
        noise_wrap = 1 - np.exp(-(np.sin(np.pi * t / 4) / 0.016) ** 2)
        x = rotation * ((0.50 * pulse * air + 0.23 * air) * noise_wrap + engine)
    elif name == "vulcan-metal-hit":
        strike = noise(rng, n, 900, 14000) * np.exp(-t / 0.018)
        body = np.sin(2 * np.pi * (155 * t - 20 * t * t)) * np.exp(-t / 0.055)
        metal = np.zeros(n)
        for f, decay, amp in [(640, 0.11, 0.46), (1127, 0.15, 0.34),
                              (2133, 0.085, 0.28), (3451, 0.06, 0.22), (5707, 0.035, 0.14)]:
            metal += amp * np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
        x = fade(0.8 * strike + 0.5 * body + metal, 0.0015, 0.045)
    else:
        drop = np.clip(t / 1.1, 0, 1)
        frequency = 2300 * (300 / 2300) ** drop
        phase = 2 * np.pi * np.cumsum(frequency) / RATE
        whistle_env = np.sin(np.pi * drop) ** 0.7
        whistle_env[t >= 1.1] = 0
        x = whistle_env * (0.30 * np.sin(phase) + 0.09 * np.sin(2 * phase))
        x += whistle_env * 0.11 * noise(rng, n, 500, 6500)
        s = np.maximum(t - 1.08, 0)
        impact_env = (1 - np.exp(-s / 0.006)) * np.exp(-s / 0.09)
        spray_env = (1 - np.exp(-s / 0.018)) * np.exp(-s / 0.21)
        x += impact_env * (0.65 * noise(rng, n, 70, 1200) + 0.3 * np.sin(2 * np.pi * 90 * s))
        x += spray_env * 0.64 * noise(rng, n, 1200, 13000)
        for start, f in [(1.18, 720), (1.30, 550), (1.41, 900), (1.56, 420)]:
            b = np.maximum(t - start, 0)
            env = (1 - np.exp(-b / 0.004)) * np.exp(-b / 0.045)
            x += 0.12 * env * np.sin(2 * np.pi * f * (b + 2.1 * b * b))
        x = fade(x, 0.025, 0.09)
    x -= np.mean(x)
    # Smooth crest control before gain normalization; no recorded input or samples.
    x = np.tanh(0.55 * x / np.sqrt(np.mean(x * x)))
    if not spec["loop"]:
        x = fade(x, 0.001, 0.008)
    return x.astype("<f4")


def measure(path):
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                  "-af", "loudnorm=I=-16:TP=-1:LRA=11:print_format=json",
                  "-f", "null", "-"])
    log = result.stderr.decode()
    data, _ = json.JSONDecoder().raw_decode(log[log.rfind("{"):])
    return float(data["input_i"]), float(data["input_tp"])


def decode(path):
    return np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(path),
                              "-f", "f32le", "-acodec", "pcm_f32le", "-"]).stdout, dtype="<f4")


def encode(raw, path, gain, spec):
    codec = ["-c:a", "libvorbis", "-q:a", "6"] if path.suffix == ".ogg" else ["-c:a", "libmp3lame", "-b:a", "192k", "-write_xing", "1"]
    run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", str(raw),
         "-af", f"volume={gain:.8f}dB", *codec, "-ar", str(RATE), "-ac", "1",
         "-map_metadata", "-1", "-metadata", "artist=Bakasun procedural synthesis",
         "-metadata", f"title={spec['id']}", "-metadata", "license=CC0-1.0", str(path)])


def verify(manifest):
    rows = []
    for spec in manifest["assets"]:
        for item in spec["files"]:
            path = ROOT / item["path"]
            info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]).stdout)
            stream = info["streams"][0]
            samples = decode(path)
            integrated, peak = measure(path)
            assert stream["channels"] == 1 and int(stream["sample_rate"]) == RATE, path
            assert stream["codec_name"] == ("vorbis" if path.suffix == ".ogg" else "mp3"), path
            assert abs(integrated - TARGET) <= 0.15, (path, integrated)
            assert peak <= -1.0 and np.max(np.abs(samples)) < 1, (path, peak)
            expected_samples = round(spec["duration_seconds"] * RATE)
            # FFmpeg's Vorbis decoder can trim 128 samples on a subsecond
            # single-page stream; never allow this for the flyby or rotor loop.
            allowed_trim = 128 if spec["id"] == "vulcan-metal-hit" and path.suffix == ".ogg" else 0
            assert expected_samples - allowed_trim <= len(samples) <= expected_samples, (path, len(samples))
            assert np.isfinite(samples).all() and abs(float(np.mean(samples))) < 0.005, path
            sha = hashlib.sha256(path.read_bytes()).hexdigest()
            assert sha == item["sha256"], path
            row = dict(path=item["path"], codec=stream["codec_name"], sample_rate_hz=RATE,
                       channels=1, decoded_samples=len(samples), decoded_duration_seconds=len(samples) / RATE,
                       container_duration_seconds=float(info["format"]["duration"]),
                       integrated_lufs=integrated, true_peak_dbtp=peak, sha256=sha,
                       bytes=path.stat().st_size, passed=True)
            row["decoder_trim_samples"] = expected_samples - len(samples)
            if spec["loop"]:
                seam = abs(float(samples[0] - samples[-1]))
                steps = np.abs(np.diff(samples))
                # The seam may have a normal waveform step, but no exceptional jump or silence.
                edge_rms = [float(np.sqrt(np.mean(part ** 2))) for part in [samples[:441], samples[-441:]]]
                assert seam < 0.04 and seam < float(np.quantile(steps, 0.999)), (path, seam)
                assert min(edge_rms) > 0.03, (path, edge_rms)
                row["loop_seam"] = dict(boundary_step=round(seam, 8),
                                        interior_step_p999=round(float(np.quantile(steps, 0.999)), 8),
                                        edge_10ms_rms=edge_rms, passed=True)
            rows.append(row)
    return dict(method="FFmpeg loudnorm / EBU R128 (mono, dual_mono=false), decoded files; ffprobe; sample and loop seam checks",
                target_integrated_lufs=TARGET, tolerance_lu=0.15, maximum_true_peak_dbtp=-1.0,
                tools={"ffmpeg": run(["ffmpeg", "-version"]).stdout.decode().splitlines()[0],
                       "numpy": np.__version__}, passed=True, files=rows)


def build():
    assets = []
    with tempfile.TemporaryDirectory(prefix="naval-air-audio-") as directory:
        for spec in SPECS:
            raw = Path(directory) / (spec["id"] + ".f32")
            synth(spec).tofile(raw)
            entry = dict(id=spec["id"], title_he=spec["title"], duration_seconds=spec["seconds"],
                         loop=spec["loop"], loop_start_seconds=0 if spec["loop"] else None,
                         loop_end_seconds=spec["seconds"] if spec["loop"] else None,
                         license="CC0-1.0", provenance=dict(type="original-procedural-synthesis",
                         external_samples=[], generator="tools/build_audio.py", recipe=spec["recipe"], seed=spec["seed"]), files=[])
            for ext in ["ogg", "mp3"]:
                path = ROOT / f"{spec['id']}.{ext}"
                gain = -14.0
                for attempt in range(5):
                    encode(raw, path, gain, spec)
                    integrated, peak = measure(path)
                    if abs(integrated - TARGET) <= 0.04:
                        break
                    gain += TARGET - integrated
                print(f"{path.name}: {integrated:.2f} LUFS, {peak:.2f} dBTP", flush=True)
                entry["files"].append(dict(path=path.name, mime_type="audio/ogg" if ext == "ogg" else "audio/mpeg",
                                           codec="vorbis" if ext == "ogg" else "mp3", sample_rate_hz=RATE,
                                           channels=1, integrated_lufs=integrated, true_peak_dbtp=peak,
                                           decoded_samples=len(decode(path)),
                                           bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
            assets.append(entry)
    manifest = dict(schema_version=1, pack_id="naval-air-audio-v1", created="2026-11-12", license="CC0-1.0",
                    license_url="https://creativecommons.org/publicdomain/zero/1.0/", sample_rate_hz=RATE,
                    channels=1, target_integrated_lufs=TARGET, loudness_tolerance_lu=0.15,
                    loudness_method="EBU R128 / FFmpeg loudnorm; mono, dual_mono=false; measured after lossy decoding",
                    preview="preview.html", assets=assets)
    report = verify(manifest)
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["build", "verify"])
    if parser.parse_args().action == "build":
        build()
    else:
        result = verify(json.loads((ROOT / "manifest.json").read_text()))
        print(json.dumps(result, ensure_ascii=False, indent=2))
