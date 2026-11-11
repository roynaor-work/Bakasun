#!/usr/bin/env python3
"""Original CC0 DSP. Build, or --verify existing deliveries, with Python/numpy/scipy/FFmpeg.

No recordings, network requests, or repository files outside this directory.
Temporary PCM lives in the OS temporary directory and is never delivered.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
SR = 44100
SEED = 11072026
SPECS = [
    ("siren-two-tone-loop", "סירנה — שני גוונים מתחלפים", 5, 1, True, -16),
    ("siren-wail-loop", "סירנה — יללה איטית", 5, 1, True, -16),
    ("siren-yelp-loop", "סירנה — יללה מהירה", 5, 1, True, -16),
    ("siren-doppler-loop", "סירנה — עקיפה עם דופלר עדין", 5, 2, True, -16),
    ("police-horn", "צפירה קצרה", .45, 1, False, -16),
    ("vulcan-fire-loop", "וולקן — ירי רציף, 80 פעימות בשנייה", 4, 1, True, -16),
    ("vulcan-spin-up", "וולקן — סיבוב עולה", .4, 1, False, -16),
    ("vulcan-spin-down", "וולקן — סיבוב יורד", .5, 1, False, -16),
    ("vulcan-flash", "וולקן — הבזק ירי / הדף רקע", .45, 1, False, -16),
    ("vulcan-background-loop", "וולקן — ירי רקע שקט", 4, 1, True, -24),
    ("metal-impact", "פגיעה במתכת", 1, 1, False, -16),
    ("near-miss-whoosh", "החמצה ליד האוזן", .7, 2, False, -16),
]


def run(args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, **kwargs)


def ffmpeg(*args):
    return run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *map(str, args)])


def db(value):
    return float(20 * np.log10(max(float(value), 1e-12)))


def fade(x, attack=.006, release=.012):
    x = x.copy()
    for length, end in [(round(attack * SR), False), (round(release * SR), True)]:
        curve = np.sin(np.linspace(0, np.pi / 2, length)) ** 2
        if end:
            x[-length:] *= curve[::-1, None]
        else:
            x[:length] *= curve[:, None]
    return x


def colored_noise(n, seed, low=90, high=8500, periodic=False):
    rng = np.random.default_rng(seed)
    if periodic:
        f = np.fft.rfftfreq(n, 1 / SR)
        spectrum = np.fft.rfft(rng.standard_normal(n))
        shape = (f / (f + low)) ** 2 / (1 + (f / high) ** 4)
        shape[0] = 0
        x = np.fft.irfft(spectrum * shape, n)
    else:
        sos = signal.butter(2, [low, high], btype="bandpass", fs=SR, output="sos")
        x = signal.sosfilt(sos, rng.standard_normal(n))
    return x / max(np.std(x), 1e-9)


def synth(spec):
    name, _, duration, channels, loop, _ = spec
    n = round(duration * SR)
    t = np.arange(n) / SR
    if name.startswith("siren"):
        if "two-tone" in name:
            freq = 840 + 160 * np.tanh(9 * np.sin(2 * np.pi * t))
        else:
            speed = 4 if "yelp" in name else .4
            freq = 800 + 280 * np.sin(2 * np.pi * speed * t)
        if "doppler" in name:
            # Smooth closed orbit: ±2.5% pitch / ±43 cents; far-left -> right -> left.
            freq *= 1 + .025 * np.sin(2 * np.pi * t / duration)
        # Integer total cycles, with a trapezoidal integral: periodic phase AND slope.
        freq += (round(freq.sum() / SR) - freq.sum() / SR) / duration
        phase = 2 * np.pi * (np.cumsum(freq) - .5 * freq - .5 * freq[0]) / SR
        x = .82 * np.sin(phase) + .16 * np.sin(3 * phase) + .045 * np.sin(5 * phase)
        x *= 1 + .025 * np.cos(2 * np.pi * 12 * t)
        if channels == 2:
            pan = -.85 * np.cos(2 * np.pi * t / duration)
            distance = .68 + .32 * np.sin(np.pi * t / duration) ** 2
            x = x[:, None] * distance[:, None] * np.stack([
                np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)], axis=1)
        else:
            x = x[:, None]
    elif "fire-loop" in name or "background-loop" in name:
        # 320 individual mechanical/combustion pulses. Circular noise is filtered in FFT.
        p = (80 * t + .3) % 1
        noise = colored_noise(n, SEED, periodic=True)
        body = np.sin(2 * np.pi * 160 * t) + .38 * np.sin(2 * np.pi * 560 * t)
        crack = .32 + .68 * np.exp(-7 * p)
        x = np.tanh(1.15 * (body * (.42 + .58 * np.exp(-5 * p)) + .29 * noise * crack))
        x = x[:, None]
        # At a quiet point in the pulse: a 2ms codec guard prevents codec edge clicks.
        x = fade(x, .002, .002)
    elif "spin-" in name:
        up = name.endswith("up")
        u = t / duration
        rate = (18 + 62 * u ** .7) if up else (80 - 68 * u ** .8)
        phase = 2 * np.pi * np.cumsum(rate) / SR
        rotor = np.sin(phase) + .35 * np.sin(3 * phase) + .18 * np.sin(7 * phase)
        noise = colored_noise(n, SEED + 1, high=6000)
        env = (.65 + .35 * u) if up else (1 - .7 * u)
        x = np.tanh(.9 * rotor + .14 * noise) * env
        x = fade(x[:, None], .008, .015)
    elif name == "police-horn":
        x = sum(a * np.sin(2 * np.pi * f * t) for f, a in [
            (370, .6), (493, .45), (740, .22), (986, .15), (1480, .06)])
        x = fade(np.tanh(x)[:, None], .018, .07)
    elif name == "vulcan-flash":
        noise = colored_noise(n, SEED + 2, low=70, high=7000)
        body = np.sin(2 * np.pi * (95 * t + 18 * (1 - np.exp(-14 * t))))
        x = np.tanh((.5 * noise + body) * 1.3) * np.exp(-8 * t)
        x = fade(x[:, None], .003, .06)
    elif name == "metal-impact":
        # Inharmonic decaying plate modes; shaped noise is an original strike exciter.
        x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-decay * t)
                for f, a, decay in [(530, .5, 4), (893, .45, 5), (1447, .3, 7),
                                    (2309, .18, 9), (3571, .12, 12)])
        x += .25 * colored_noise(n, SEED + 3) * np.exp(-35 * t)
        x = fade(np.tanh(2 * x)[:, None], .002, .08)
    elif name == "near-miss-whoosh":
        noise = colored_noise(n, SEED + 4, low=350, high=9000)
        phase = 2 * np.pi * (2400 * t - 1200 / duration * t ** 2)
        env = np.sin(np.pi * t / duration) ** 3
        x = np.tanh(.5 * noise + .08 * np.sin(phase)) * env
        pan = .98 * np.tanh(7 * (t / duration - .5))
        x = x[:, None] * np.stack([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)], axis=1)
        x = fade(x, .015, .025)
    else:
        raise ValueError(name)
    # Remove sub-audible/DC energy without changing circular phase for loops.
    if loop:
        spectrum = np.fft.rfft(x, axis=0)
        f = np.fft.rfftfreq(n, 1 / SR)
        spectrum *= (f * f / (f * f + 35 ** 2))[:, None]
        x = np.fft.irfft(spectrum, n, axis=0)
    else:
        x = signal.sosfilt(signal.butter(2, 35, "highpass", fs=SR, output="sos"), x, axis=0)
        x = fade(x, .001, .006)
    return x.astype(np.float32)


def measure(path):
    # Repeat short events to stabilize the 400ms EBU integration/gating window.
    r = ffmpeg("-stream_loop", "7", "-i", path, "-t", "12", "-af",
               "loudnorm=I=-16:TP=-3:LRA=11:print_format=json", "-f", "null", "-")
    log = r.stderr.decode()
    values, _ = json.JSONDecoder().raw_decode(log[log.rfind("{"):])
    return float(values["input_i"]), float(values["input_tp"])


def decode(path, channels):
    r = ffmpeg("-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-ar", SR, "-")
    return np.frombuffer(r.stdout, dtype="<f4").reshape(-1, channels)


def seam(x):
    # Compare each channel; a join must behave like an ordinary adjacent sample.
    diff = np.diff(x, axis=0)
    jump = np.abs(x[0] - x[-1])
    reference = np.quantile(np.abs(diff), .999, axis=0)
    ratio = float(np.max(jump / np.maximum(reference, 1e-9)))
    # 10ms cyclic RMS around the join must match its neighbouring 10ms windows.
    w = round(.01 * SR)
    joined = np.concatenate([x[-w // 2:], x[:w // 2]])
    neighbour = np.concatenate([x[-2*w:-w], x[w:2*w]])
    rms_delta = db(np.sqrt(np.mean(joined ** 2)) / max(np.sqrt(np.mean(neighbour ** 2)), 1e-9))
    # Detect inserted silence, including encoder padding at either end.
    edge_rms = [db(np.sqrt(np.mean(a ** 2))) for a in [x[:w], x[-w:]]]
    return {"jump_dbfs": round(db(np.max(jump)), 3),
            "jump_vs_internal_p999": round(ratio, 4),
            "rms_join_delta_db": round(rms_delta, 3),
            "edge_rms_dbfs": [round(v, 3) for v in edge_rms],
            "pass": bool(ratio <= 1.1 and abs(rms_delta) <= 3 and min(edge_rms) > -55)}


def pulse_rate(x):
    """Measure combustion envelope repetition, rather than reading a synthesis constant."""
    envelope = np.mean(x ** 2, axis=1)
    freq = np.fft.rfftfreq(len(x), 1 / SR)
    spectrum = np.abs(np.fft.rfft(envelope))
    band = (freq >= 60) & (freq <= 100)
    return float(freq[band][np.argmax(spectrum[band])])


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def build():
    manifest = {"schema": 1, "sample_rate": SR, "seed": SEED,
                "license": "CC0-1.0", "assets": []}
    with tempfile.TemporaryDirectory(prefix="sirens-vulcan-") as tmp:
        for spec in SPECS:
            name, title, duration, channels, loop, target = spec
            pcm = Path(tmp) / (name + ".wav")
            x = synth(spec)
            wavfile.write(pcm, SR, x)
            initial, peak = measure(pcm)
            gain = target - initial
            # Reduce crest factor only if the loudness target would violate headroom.
            for _ in range(12):
                if peak + gain <= -3.9:
                    break
                x = np.tanh(x * 1.35).astype(np.float32)
                wavfile.write(pcm, SR, x)
                initial, peak = measure(pcm)
                gain = target - initial
            else:
                raise RuntimeError("Cannot meet loudness and peak: " + name)
            x *= 10 ** (gain / 20)
            wavfile.write(pcm, SR, x)
            files = {}
            for ext in ("ogg", "mp3"):
                dest = ROOT / "audio" / (name + "." + ext)
                codec = ["-c:a", "libvorbis", "-q:a", "3"] if ext == "ogg" else [
                    "-c:a", "libmp3lame", "-b:a", "128k", "-write_xing", "1"]
                ffmpeg("-i", pcm, "-map_metadata", "-1", "-ar", SR, *codec, dest)
                files[ext] = str(dest.relative_to(ROOT))
            manifest["assets"].append({"id": name, "title": title, "duration": duration,
                "channels": channels, "loop": loop, "target_lufs": target, "files": files,
                "source_seam": seam(x) if loop else None,
                "pulse_rate_hz": 80 if "fire-loop" in name or "background-loop" in name else None})
            print("Built", name, flush=True)
    write_json(ROOT / "manifest.json", manifest)


def verify():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    rows, errors = [], []
    for asset in manifest["assets"]:
        for ext, rel in asset["files"].items():
            path = ROOT / rel
            x = decode(path, asset["channels"])
            probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)]).stdout)["streams"][0]
            integrated, true_peak = measure(path)
            row = {"file": rel, "bytes": path.stat().st_size,
                   "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                   "samples": len(x), "sample_rate": int(probe["sample_rate"]),
                   "channels": int(probe["channels"]),
                   "duration_seconds": round(len(x) / SR, 6), "integrated_lufs": integrated,
                   "true_peak_dbtp": true_peak, "sample_peak_dbfs": round(db(np.max(np.abs(x))), 3),
                   "clipped_samples": int(np.count_nonzero(np.abs(x) >= 1)),
                   "dc_dbfs": round(db(np.max(np.abs(np.mean(x, axis=0)))), 3),
                   "seam": seam(x) if asset["loop"] else None}
            if asset["pulse_rate_hz"]:
                row["measured_pulse_rate_hz"] = pulse_rate(x)
            # Source and actual decoded loops both have to pass; never just inspect PCM.
            checks = {"size": row["bytes"] <= 150000,
                "format": row["sample_rate"] == SR and row["channels"] == asset["channels"],
                # Vorbis transient block sizes can shift FFmpeg's decoded one-shot
                # length by <15ms. Loops must always decode to the exact frame count.
                "duration": (len(x) == round(asset["duration"] * SR) if asset["loop"]
                             else abs(len(x) / SR - asset["duration"]) <= .015),
                "loudness": abs(integrated - asset["target_lufs"]) <= .7,
                "true_peak": true_peak <= -3,
                "clipping": row["clipped_samples"] == 0,
                "pulse_rate": not asset["pulse_rate_hz"] or abs(row["measured_pulse_rate_hz"] - 80) <= 1,
                "loop": not asset["loop"] or (row["seam"]["pass"] and asset["source_seam"]["pass"])}
            row["checks"] = checks
            errors += [rel + ": " + k for k, ok in checks.items() if not ok]
            rows.append(row)
            print(rel, integrated, true_peak, row["seam"], flush=True)
    total = sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    errors += [str(p.relative_to(ROOT)) + ": exceeds 150,000 bytes"
               for p in ROOT.rglob("*") if p.is_file() and p.stat().st_size > 150000]
    # Account for the report itself at final verification, not just the audio budget.
    if total > 1500000:
        errors.append("package exceeds 1,500,000 bytes")
    report = {"schema": 1, "method": "FFmpeg loudnorm EBU R128 + decoded PCM; short clips repeated 8x, capped at 12s",
              "ffmpeg": run(["ffmpeg", "-version"]).stdout.decode().splitlines()[0],
              "numpy": np.__version__, "audio_bytes": sum(r["bytes"] for r in rows),
              "package_bytes_at_verification": total, "files": rows, "errors": errors,
              "pass": not errors}
    for _ in range(3):
        write_json(ROOT / "measurements.json", report)
        report["package_bytes_at_verification"] = sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    write_json(ROOT / "measurements.json", report)
    if errors:
        raise SystemExit("Validation failed: " + ", ".join(errors))
    print("PASS", len(rows), "files;", report["audio_bytes"], "audio bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="verify deliveries without regenerating audio")
    args = parser.parse_args()
    if not args.verify:
        build()
    verify()
