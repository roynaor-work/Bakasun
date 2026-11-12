"""Original stochastic crowd synthesis and delivery measurements. CC0-1.0.

Run from any directory: python /path/to/crowd-audio-v1/generate.py
Requires Python, NumPy, SciPy and FFmpeg (libvorbis/libmp3lame).
Writes only this new asset directory. No recordings or sample libraries.
"""

import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
import scipy
from scipy import ndimage, signal


ROOT = Path(__file__).resolve().parent
SR = 48000
BASE_SHA = "51f4faab518c695672efaf6323a8b72f239a2b84"
BANDS = [(0, 200), (200, 500), (500, 1100), (1100, 2000),
         (2000, 5000), (5000, 24001)]
RECIPES = [
    ("ambience-loop", "המולת אצטדיון רחבה", 24, True, -18, 0.30, 2026111201, 0.32),
    # 12.288 s aligns the repeating PCM to both Vorbis (1024) and MP3 (1152)
    # long-frame grids. 24 s already aligns to both grids.
    ("crowd-calm", "רקע קהל שקט", 12.288, True, -18, 0.12, 2026111202, 0.24),
    ("crowd-excited", "קהל בהתרגשות", 4, False, -18, 0.72, 2026111203, 0.48),
    ("crowd-goal", "שאגת שער", 5, False, -16, 1.0, 2026111204, 0.65),
]


def ffmpeg(args, data=None):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args],
                          input=data, capture_output=True, check=True)


def raw(x):
    return np.asarray(x, dtype="<f4").tobytes()


def meter(x):
    result = ffmpeg(["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
                     "-af", "loudnorm=I=-18:TP=-1:LRA=11:print_format=json",
                     "-f", "null", "-"], raw(x)).stderr.decode()
    values = json.loads(result[result.rfind("{"):result.rfind("}") + 1])
    return {"integrated_lufs": float(values["input_i"]),
            "true_peak_dbtp": float(values["input_tp"]),
            "loudness_range_lu": float(values["input_lra"])}


def decode(path):
    return np.frombuffer(ffmpeg(["-v", "error", "-i", str(path), "-ar", str(SR),
                                "-ac", "2", "-f", "f32le", "pipe:1"]).stdout,
                         dtype="<f4").reshape(-1, 2).copy()


def noise(n, rng, low=100, high=1800, formant=None):
    """Circular noise with broad, non-resonant spectral shaping; no oscillators."""
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = (1 - np.exp(-(f / low) ** 4)) * np.exp(-0.5 * (f / high) ** 8)
    if formant is not None:
        center, width = formant
        shape *= np.exp(-0.5 * ((f - center) / width) ** 2)
    spectrum = np.fft.rfft(rng.standard_normal(n)) * shape
    spectrum[0] = 0
    x = np.fft.irfft(spectrum, n)
    return x / np.std(x)


def slow(n, rng, interval=0.25):
    """Periodic smooth random envelopes, without repeating an internal beat."""
    knots = rng.uniform(0.2, 1.0, max(8, round(n / SR / interval)))
    positions = np.arange(n) * len(knots) / n
    return ndimage.map_coordinates(knots, [positions], order=3, mode="grid-wrap")


def render(seconds, loop, energy, seed, name):
    rng = np.random.Generator(np.random.PCG64(seed))
    n = round(seconds * SR)
    t = np.arange(n) / SR
    x = np.zeros((n, 2))
    # Diffuse low murmur, with independently evolving left/right texture.
    for ch in range(2):
        x[:, ch] = 0.22 * noise(n, rng, high=1450) * (0.65 + 0.35 * slow(n, rng, 0.6))
    # Broad breath/vowel-like masses, not pitched synthetic voices. Each layer
    # has an independent random envelope and pan, preventing stationary lines.
    for _ in range(28):
        center = rng.uniform(320, 1250)
        width = rng.uniform(180, 360)
        layer = noise(n, rng, formant=(center, width))
        env = slow(n, rng, rng.uniform(0.16, 0.55)) ** 2
        if not loop:
            at = rng.uniform(0.08, 0.65 if name == "crowd-goal" else 1.4)
            q = np.maximum(0, t - at)
            rise = 0.08 if name == "crowd-goal" else 0.23
            env *= (t >= at) * (1 - np.exp(-q / rise)) * np.exp(-q / rng.uniform(1.0, 2.6))
        pan = rng.uniform(0.12, 0.88)
        x += (0.055 + 0.065 * energy) * (layer * env)[:, None] * np.sqrt([1 - pan, pan])
    # Soft irregular applause: stochastic low-mid bursts, never sharp clicks.
    for _ in range(round(seconds * (0.4 + energy * 5))):
        length = round(rng.uniform(0.07, 0.15) * SR)
        q = np.arange(length) / SR
        clap = noise(length, rng, low=350, high=1750)
        clap *= (1 - np.exp(-q / 0.008)) ** 2 * np.exp(-q / 0.023)
        clap *= np.sin(np.linspace(0, np.pi, length)) ** 2
        start = int(rng.integers(0, n if loop else n - length))
        indices = (start + np.arange(length)) % n
        pan = rng.uniform(0.05, 0.95)
        x[indices] += (0.10 + energy * 0.17) * clap[:, None] * np.sqrt([1 - pan, pan])
    # Diffuse reflections; circular for beds so both sides of the loop agree.
    dry = x.copy()
    for delay, gain in [(0.031, 0.14), (0.067, 0.11), (0.109, 0.08), (0.173, 0.05)]:
        shift = round(delay * SR)
        if loop:
            x += gain * np.roll(dry[:, ::-1], shift, axis=0)
        else:
            x[shift:] += gain * dry[:-shift, ::-1]
    if not loop:
        if name == "crowd-goal":
            x *= ((0.22 + 0.78 * (1 - np.exp(-t / 0.09))) *
                  np.exp(-np.maximum(0, t - 0.95) / 1.2))[:, None]
        else:
            x *= ((0.25 + 0.75 * (1 - np.exp(-t / 0.28))) *
                  np.exp(-np.maximum(0, t - 1.35) / 0.75))[:, None]
    # Broad final rolloff; no notches or narrow resonators. Circular FFT keeps
    # the entire steady-state bed periodic, including first-order continuity.
    f = np.fft.rfftfreq(n, 1 / SR)
    rolloff = np.exp(-0.5 * (f / 1750) ** 8)
    x = np.fft.irfft(np.fft.rfft(x, axis=0) * rolloff[:, None], n, axis=0)
    x -= x.mean(axis=0)
    if loop:
        guard = SR // 2
        x = np.concatenate([x[-guard:], x, x[:guard]])
    # Exact 10 ms raised-cosine onset. Beds loop inside the guard regions.
    attack = round(0.010 * SR)
    release = round((0.010 if loop else 0.25) * SR)
    x[:attack] *= np.sin(np.linspace(0, np.pi / 2, attack))[:, None] ** 2
    x[-release:] *= np.sin(np.linspace(np.pi / 2, 0, release))[:, None] ** 2
    return x


def analyze(x, loop=None):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    p = np.abs(np.fft.rfft(x.astype(float), axis=0)) ** 2
    p[1:(-1 if n % 2 == 0 else None)] *= 2
    p = p.sum(axis=1)
    bands = {f"{lo}-{min(hi, 24000)}": float(100 * p[(f >= lo) & (f < hi)].sum() / p.sum())
             for lo, hi in BANDS}
    # Transient high-band budget, measured in 100 ms windows, 50% overlap.
    frames = np.lib.stride_tricks.sliding_window_view(x, 4800, axis=0)[::2400]
    wp = (np.abs(np.fft.rfft(frames * np.hanning(4800), axis=-1)) ** 2).sum(axis=1)
    wp[:, 1:-1] *= 2
    wf = np.fft.rfftfreq(4800, 1 / SR)
    high = 100 * wp[:, (wf >= 2000) & (wf < 5000)].sum(axis=1) / wp.sum(axis=1)
    # Persistent narrow lines: >12 dB over local +/-120 Hz median in >=40%
    # of 171 ms frames. Stereo powers are added, never downmixed/cancelled.
    ps = []
    for ch in range(2):
        tf, _, sp = signal.spectrogram(x[:, ch], SR, nperseg=8192, noverlap=4096)
        ps.append(sp)
    sp = sum(ps)
    local = ndimage.median_filter(sp, size=(41, 1), mode="nearest")
    prominence = 10 * np.log10(np.maximum(sp, 1e-30) / np.maximum(local, 1e-30))
    eligible = (tf >= 100) & (tf < 5000)
    persistence = (prominence[eligible] > 12).mean(axis=1)
    result = {"decoded_frames": n, "duration_seconds": n / SR, **meter(x),
              "energy_percent": bands, "max_100ms_2_5khz_percent": float(high.max()),
              "max_narrow_line_persistence_percent": float(100 * persistence.max()),
              "persistent_line_count": int((persistence >= 0.4).sum()),
              "first_sample_dbfs": float(20 * np.log10(max(np.abs(x[0]).max(), 1e-12)))}
    if loop:
        start, end = round(loop["start_seconds"] * SR), round(loop["end_seconds"] * SR)
        step = x[start] - x[end - 1]
        # Codec error at a loop seam, relative to the same continuation in the
        # guard. Separates an ordinary band-limited sample step from a click.
        seam_error = x[start] - x[end]
        a = x[start:start + 960]
        b = x[end:end + 960]
        result["loop"] = {
            "sample_step_dbfs": float(20 * np.log10(max(np.abs(step).max(), 1e-12))),
            "continuation_error_dbfs": float(20 * np.log10(max(np.abs(seam_error).max(), 1e-12))),
            "guard_20ms_rms_error_dbfs": float(20 * np.log10(max(np.sqrt(np.mean((a - b) ** 2)), 1e-12))),
        }
    return result


def deliver(x, name, ext, target, loop):
    gain_db = target - meter(x)["integrated_lufs"]
    path = ROOT / f"{name}.{ext}"
    codec = ["-c:a", "libvorbis", "-q:a", "6"] if ext == "ogg" else [
        "-c:a", "libmp3lame", "-b:a", "192k", "-write_xing", "1"]
    # Correct any codec loudness shift with static gain; no dynamic compression.
    for _ in range(3):
        ffmpeg(["-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2",
                "-i", "pipe:0", "-map_metadata", "-1", *codec, str(path)],
               raw(x * 10 ** (gain_db / 20)))
        decoded = decode(path)
        loudness = meter(decoded)["integrated_lufs"]
        if abs(loudness - target) <= 0.05:
            break
        gain_db += target - loudness
    measurement = analyze(decoded, loop)
    if len(decoded) != len(x):
        raise ValueError(f"{path.name}: decoder changed sample count")
    if measurement["energy_percent"]["2000-5000"] > 8:
        raise ValueError(f"{path.name}: high-band energy over budget")
    if measurement["max_100ms_2_5khz_percent"] > 8:
        raise ValueError(f"{path.name}: transient high-band energy over budget")
    if abs(measurement["integrated_lufs"] - target) > 0.1:
        raise ValueError(f"{path.name}: loudness off target")
    if measurement["true_peak_dbtp"] > -1 or measurement["persistent_line_count"]:
        raise ValueError(f"{path.name}: clipping headroom or persistent tone check failed")
    if loop and measurement["loop"]["guard_20ms_rms_error_dbfs"] > -55:
        raise ValueError(f"{path.name}: loop continuation mismatch")
    measurement["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    measurement["bytes"] = path.stat().st_size
    return measurement


def main():
    manifest = {
        "schema_version": 1, "package": "crowd-audio-v1", "license": "CC0-1.0",
        "sample_rate_hz": SR, "channels": 2, "attack_ms": 10,
        "loop_end_exclusive": True, "loop_units": "decoded PCM seconds and frames at 48000 Hz",
        "loudness_tolerance_lu": 0.1, "max_2_5khz_energy_percent": 8,
        "volume_units": "linear gain 0..1, after file loudness normalization",
        "playback_notes": [
            "Decode full files with codec pre-skip / LAME gapless metadata honored.",
            "Loop only the declared internal region, not the entire encoded file.",
            "Play from time zero on first use; intro and outro guards are outside the loop.",
            "Apply a 10 ms gain ramp when manually starting inside the loop or stopping a bed.",
            "Recommended volumes are mix starting points, not a change to the file LUFS target.",
            "No runtime low-pass is needed to meet this asset spectral budget; integration is separate.",
        ], "samples": [],
    }
    measurements = {"reference_commit": BASE_SHA, "sample_rate_hz": SR,
                    "versions": {"numpy": np.__version__, "scipy": scipy.__version__,
                                 "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0]},
                    "samples": {}}
    for name, label, seconds, looping, target, energy, seed, volume in RECIPES:
        print(f"Rendering {name}", flush=True)
        loop = {"enabled": looping, "start_seconds": 0.5 if looping else None,
                "end_seconds": seconds + 0.5 if looping else None,
                "start_frame": SR // 2 if looping else None,
                "end_frame": round((seconds + 0.5) * SR) if looping else None,
                "duration_seconds": seconds if looping else None,
                "crossfade_ms": 0}
        x = render(seconds, looping, energy, seed, name)
        formats = {}
        after = {}
        for ext in ["ogg", "mp3"]:
            after[ext] = deliver(x, name, ext, target, loop if looping else None)
            formats[ext] = {"file": f"{name}.{ext}",
                            "codec": "vorbis" if ext == "ogg" else "mp3",
                            "mime_type": "audio/ogg; codecs=vorbis" if ext == "ogg" else "audio/mpeg",
                            "measured_lufs": after[ext]["integrated_lufs"],
                            "true_peak_dbtp": after[ext]["true_peak_dbtp"],
                            "sha256": after[ext]["sha256"]}
            print(f"  {ext}: {after[ext]['integrated_lufs']} LUFS; "
                  f"2–5 kHz {after[ext]['energy_percent']['2000-5000']:.4f}%", flush=True)
        # Read baseline bytes from the pinned main commit, never a later checkout.
        reference_path = f"workout/island/design/audio/soccer/{name}.ogg"
        reference = subprocess.check_output(["git", "-C", str(ROOT), "show", f"{BASE_SHA}:{reference_path}"])
        baseline_x = np.frombuffer(ffmpeg(["-v", "error", "-i", "pipe:0", "-ar", str(SR),
                                          "-ac", "2", "-f", "f32le", "pipe:1"], reference).stdout,
                                   dtype="<f4").reshape(-1, 2)
        before = analyze(baseline_x)
        before.update({"file": reference_path, "sha256": hashlib.sha256(reference).hexdigest()})
        measurements["samples"][name] = {"before": before, "after": after}
        manifest["samples"].append({"id": name, "name": label, "seed": seed,
                                    "duration_seconds": len(x) / SR,
                                    "decoded_frames": len(x), "loop": loop,
                                    "target_lufs": target, "recommended_volume": volume,
                                    "formats": formats})
    for filename, data in [("manifest.json", manifest), ("measurements.json", measurements)]:
        (ROOT / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
