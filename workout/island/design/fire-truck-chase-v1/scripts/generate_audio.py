#!/usr/bin/env python3
"""Rebuild the original CC0 fire-truck sound pack and its measured QA record.

Requirements: Python 3, NumPy, ffmpeg. Run from any directory.
Signals are synthesized; no recordings, pretrained models or external media.
Output is mono 48 kHz PCM s16 WAV. Full-buffer loops contain no encoder delay.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path
import platform
import re
import subprocess
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "audio"
QA = ROOT / "verification" / "audio.json"
RATE = 48_000
TARGET_LUFS = -16.0
SEED = 20261114
RNG = np.random.default_rng(SEED)


def timeline(seconds: float) -> np.ndarray:
    return np.arange(round(seconds * RATE), dtype=np.float64) / RATE


def periodic_noise(seconds: float, low: float, high: float, slope: float = 0) -> np.ndarray:
    """FFT-domain band shaping makes one continuous, deterministic period."""
    n = round(seconds * RATE)
    f = np.fft.rfftfreq(n, 1 / RATE)
    # Smooth edges avoid the ringing of an ideal rectangular band-pass.
    weight = np.zeros_like(f)
    valid = f > 0
    ff = f[valid]
    weight[valid] = (1 / np.sqrt(1 + (low / ff) ** 8)) * (1 / np.sqrt(1 + (ff / high) ** 8))
    weight[valid] *= (np.maximum(ff, low) / low) ** slope
    spectrum = (RNG.normal(size=len(f)) + 1j * RNG.normal(size=len(f))) * weight
    spectrum[0] = 0
    spectrum[-1] = 0
    result = np.fft.irfft(spectrum, n)
    return result / np.sqrt(np.mean(result * result))


def envelope(t: np.ndarray, start: float, duration: float, attack: float, release: float) -> np.ndarray:
    u = t - start
    result = np.zeros_like(t)
    inside = (u >= 0) & (u < duration)
    result[inside] = 1
    a = inside & (u < attack)
    r = inside & (u > duration - release)
    result[a] = np.sin(np.pi * u[a] / (2 * attack)) ** 2
    result[r] = np.sin(np.pi * (duration - u[r]) / (2 * release)) ** 2
    return result


def phase_align_loop(x: np.ndarray) -> np.ndarray:
    """Put the splice at a zero-slope point without adding silence or a fade."""
    cyclic_deltas = np.roll(x, -1) - x
    join = int(np.argmin(np.abs(cyclic_deltas))) + 1
    return np.roll(x, -join)


def siren() -> np.ndarray:
    t = timeline(8)
    # Alternating rounded 370/493 Hz tones, once every two seconds. Both
    # oscillators and the envelope complete integer cycles in the 8 s buffer.
    blend = 0.5 + 0.5 * np.tanh(3.0 * np.sin(2 * np.pi * t / 4))
    first = np.sin(2 * np.pi * 370 * t) + 0.075 * np.sin(2 * np.pi * 1110 * t)
    second = np.sin(2 * np.pi * 493 * t) + 0.065 * np.sin(2 * np.pi * 1479 * t)
    return (blend * first + (1 - blend) * second) * (0.96 + 0.04 * np.cos(2 * np.pi * t / 2))


def engine(rpm: int) -> np.ndarray:
    t = timeline(4)
    # Stylized six-cylinder four-stroke combustion. Ignition order produces
    # 3 pulses per crankshaft revolution; integer frequencies keep it periodic.
    ignition = rpm / 20
    fundamental = np.zeros_like(t)
    for harmonic in range(1, 15):
        amp = (1 / harmonic ** 1.4) * (1 if harmonic % 2 else 0.72)
        fundamental += amp * np.sin(2 * np.pi * ignition * harmonic * t + harmonic * 0.31)
    body = 0.37 * np.sin(2 * np.pi * (ignition / 2) * t)
    chassis = periodic_noise(4, 45, 680 + rpm * 0.28, -0.38)
    flutter = 0.89 + 0.06 * np.cos(2 * np.pi * 3 * t) + 0.05 * np.sin(2 * np.pi * 1.25 * t)
    return np.tanh(1.15 * (fundamental + body + 0.18 * chassis)) * flutter


def horn() -> np.ndarray:
    t = timeline(1.25)
    tones = np.sin(2 * np.pi * 196 * t) + 0.66 * np.sin(2 * np.pi * 246.94 * t)
    tones += 0.12 * np.sin(2 * np.pi * 392 * t) + 0.06 * np.sin(2 * np.pi * 493.88 * t)
    return np.tanh(0.8 * tones) * envelope(t, 0.03, 1.12, 0.075, 0.22)


def brakes() -> np.ndarray:
    t = timeline(1.8)
    air = periodic_noise(1.8, 550, 5200, -0.24)
    air = np.tanh(air * 0.62)
    stop = np.sin(2 * np.pi * (94 * t - 13 * t * t))
    return (0.75 * air * np.exp(-t * 1.2) + 0.24 * stop * np.exp(-t * 4.1)) * envelope(t, 0.02, 1.7, 0.1, 0.45)


def hose() -> np.ndarray:
    t = timeline(4)
    spray = np.tanh(0.65 * periodic_noise(4, 380, 7400, -0.25))
    water = 0.25 * np.tanh(0.8 * periodic_noise(4, 120, 900, -0.5))
    modulation = 0.96 + 0.025 * np.sin(2 * np.pi * 1.25 * t) + 0.015 * np.cos(2 * np.pi * 2.5 * t)
    return (spray + water) * modulation


def mallet(t: np.ndarray, start: float, frequency: float, sustain: float) -> np.ndarray:
    u = np.maximum(0, t - start)
    tone = np.sin(2 * np.pi * frequency * u) + 0.16 * np.sin(2 * np.pi * frequency * 2 * u)
    return tone * np.exp(-u * sustain) * envelope(t, start, float(t[-1]) - start, 0.018, 0.16)


def arrival() -> np.ndarray:
    t = timeline(1.5)
    cue = mallet(t, 0.03, 392.0, 3) + 0.87 * mallet(t, 0.28, 523.25, 3.4)
    air = 0.12 * np.tanh(periodic_noise(1.5, 180, 2400, -0.4)) * envelope(t, 0, 1.48, 0.18, 0.75)
    return cue + air


def firefighting_start() -> np.ndarray:
    t = timeline(1.8)
    cue = 0.6 * mallet(t, 0.04, 329.63, 2.4) + 0.66 * mallet(t, 0.23, 493.88, 2.8)
    valve = 0.34 * np.tanh(periodic_noise(1.8, 350, 5200, -0.2)) * envelope(t, 0.19, 1.55, 0.22, 0.65)
    return cue + valve


def write_wave(path: Path, x: np.ndarray) -> None:
    samples = np.rint(x * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(samples.tobytes())


def loudness(path: Path) -> dict:
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
         "loudnorm=I=-16:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    )
    matches = re.findall(r'\{\s*"input_i"[\s\S]+?\}', process.stderr)
    if not matches:
        raise RuntimeError(process.stderr)
    raw = json.loads(matches[-1])
    return {"integrated_lufs": float(raw["input_i"]), "true_peak_dbtp": float(raw["input_tp"]),
            "loudness_range_lu": float(raw["input_lra"]), "threshold_lufs": float(raw["input_thresh"])}


def independent_ebur128(x: np.ndarray, repetitions: int) -> dict:
    """Measure the final samples through the independent ebur128 filter."""
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        data = np.rint(x * 32768).astype("<i2").tobytes()
        wav.writeframes(data * repetitions)
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", "pipe:0", "-af", "ebur128=peak=true", "-f", "null", "-"],
        input=output.getvalue(), capture_output=True, check=True,
    )
    log = process.stderr.decode()
    matches = re.findall(r"Integrated loudness:\s*I:\s*([-\d.]+) LUFS", log)
    if not matches:
        raise RuntimeError(log)
    integrated = float(matches[-1])
    return {"filter": "FFmpeg ebur128=peak=true", "repetitions": repetitions,
            "integrated_lufs": integrated, "passed": abs(integrated - TARGET_LUFS) <= 0.2}


def normalize(path: Path, x: np.ndarray) -> tuple[np.ndarray, dict]:
    x = np.asarray(x, dtype=np.float64)
    x -= np.mean(x)
    x *= 0.72 / np.max(np.abs(x))
    # Constant gain preserves a synthesized loop exactly. Loudnorm is used for
    # BS.1770/EBU R128 analysis only; its time-varying gain is never rendered.
    for _ in range(4):
        write_wave(path, x)
        measurement = loudness(path)
        gain = 10 ** ((TARGET_LUFS - measurement["integrated_lufs"]) / 20)
        if abs(measurement["integrated_lufs"] - TARGET_LUFS) <= 0.03:
            break
        if np.max(np.abs(x * gain)) >= 0.88:
            # Bound crest factor before normalization, with a static function
            # that keeps the endpoints and all derivatives cyclic.
            x = np.tanh(2 * x / np.max(np.abs(x)))
            x -= np.mean(x)
            x *= 0.5 / np.max(np.abs(x))
            continue
        x *= gain
    write_wave(path, x)
    measured = loudness(path)
    with wave.open(str(path), "rb") as wav:
        decoded = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(float) / 32768
    if abs(measured["integrated_lufs"] - TARGET_LUFS) > 0.2 or measured["true_peak_dbtp"] > -1:
        raise RuntimeError(f"Audio normalization failed for {path.name}: {measured}")
    return decoded, measured


def main() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    QA.parent.mkdir(parents=True, exist_ok=True)
    specs = [
        ("siren-two-tone-loop.wav", siren, True, "Soft 370/493 Hz alternating two-tone siren; rounded harmonics, smooth handover."),
        ("engine-idle-loop.wav", lambda: engine(640), True, "Heavy six-cylinder diesel idle layer, nominal 640 RPM."),
        ("engine-cruise-loop.wav", lambda: engine(1280), True, "Heavy six-cylinder diesel cruise layer, nominal 1280 RPM."),
        ("engine-high-loop.wav", lambda: engine(1920), True, "Heavy six-cylinder diesel high layer, nominal 1920 RPM."),
        ("horn.wav", horn, False, "Rounded dual air-horn note; short attack and long release."),
        ("brakes.wav", brakes, False, "Pneumatic braking hiss and falling low mechanical rumble."),
        ("hose-water-loop.wav", hose, True, "Pressurized broad water jet with low turbulent body, no clicks or silence."),
        ("arrival.wav", arrival, False, "Soft two-note arrival confirmation with settling air hiss."),
        ("firefighting-start.wav", firefighting_start, False, "Valve opening/water swell with warm two-note firefighting-start confirmation."),
    ]
    assets = []
    for filename, synth, looping, description in specs:
        x = synth()
        x -= np.mean(x)
        if looping:
            x = phase_align_loop(x)
        else:
            x[0] = 0
            x[-1] = 0
        path = AUDIO / filename
        decoded, measurement = normalize(path, x)
        # Remove sub-LSB offset created by mean normalization on finite cues.
        # Every one-shot endpoint is forced to digital zero before final QA.
        if not looping:
            decoded[0] = decoded[-1] = 0
            write_wave(path, decoded)
            with wave.open(str(path), "rb") as wav:
                decoded = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(float) / 32768
            measurement = loudness(path)
        item = {
            "id": filename.removesuffix(".wav"), "file": f"audio/{filename}",
            "description": description, "sample_rate_hz": RATE, "channels": 1,
            "encoding": "PCM signed 16-bit little-endian", "frames": len(decoded),
            "duration_seconds": len(decoded) / RATE, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "loop": looping, "target_lufs": TARGET_LUFS, **measurement,
            "sample_peak_dbfs": round(20 * math.log10(float(np.max(np.abs(decoded)))), 4),
            "dc_offset": round(float(np.mean(decoded)), 9),
        }
        if looping:
            deltas = np.diff(decoded)
            boundary = float(abs(decoded[0] - decoded[-1]))
            normal_q99 = float(np.quantile(np.abs(deltas), 0.99))
            # A click creates an exceptional boundary impulse; the seam here
            # is phase-aligned and must remain below both one thousandth FS
            # and the ordinary 99th percentile of within-buffer changes.
            cyclic_delta = np.diff(np.r_[decoded[-2:], decoded[:2]])
            splice_curvature = float(np.max(np.abs(np.diff(cyclic_delta))))
            ordinary_curvature_q99 = float(np.quantile(np.abs(np.diff(decoded, n=2)), 0.99))
            item["loop_region_frames"] = {"start_inclusive": 0, "end_exclusive": len(decoded)}
            item["loop_qa"] = {
                "method": "Periodic Fourier/oscillator synthesis; zero-slope phase-aligned splice; constant-gain normalization; uncompressed PCM.",
                "boundary_delta_full_scale": boundary,
                "boundary_delta_dbfs": round(20 * math.log10(boundary), 4) if boundary else None,
                "boundary_delta_is_digital_zero": bool(boundary == 0),
                "ordinary_delta_q99_full_scale": normal_q99,
                "splice_curvature_full_scale": splice_curvature,
                "ordinary_curvature_q99_full_scale": ordinary_curvature_q99,
                "passed": bool(boundary <= min(0.001, normal_q99) and splice_curvature <= ordinary_curvature_q99),
            }
            if not item["loop_qa"]["passed"]:
                raise RuntimeError(f"Loop boundary failed: {filename}")
        else:
            item["endpoints_digital_zero"] = bool(decoded[0] == 0 and decoded[-1] == 0)
        item["independent_ebur128"] = independent_ebur128(decoded, 3 if looping else 1)
        item["passed"] = bool(abs(item["integrated_lufs"] - TARGET_LUFS) <= 0.2 and item["true_peak_dbtp"] <= -1 and item["independent_ebur128"]["passed"] and (item.get("loop_qa", {}).get("passed", True)))
        assets.append(item)
        print(f"{filename}: {measurement['integrated_lufs']:.2f} LUFS, {measurement['true_peak_dbtp']:.2f} dBTP, {len(decoded) / RATE:g}s")
    result = {
        "schema_version": 1, "generator": "scripts/generate_audio.py", "seed": SEED,
        "provenance": "Original deterministic additive/subtractive and periodic-noise synthesis; no recordings or external media.",
        "license": "CC0-1.0", "loudness_method": "FFmpeg loudnorm input measurement (BS.1770 / EBU R128), measured after final PCM16 encoding.",
        "acceptance": {"integrated_lufs": -16, "tolerance_lu": 0.2, "maximum_true_peak_dbtp": -1,
                       "loop_boundary_delta_maximum_full_scale": 0.001,
                       "loop_boundary_delta_also_at_most": "99th percentile of within-buffer absolute first difference"},
        "versions": {"python": platform.python_version(), "numpy": np.__version__,
                     "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=True).stdout.splitlines()[0]},
        "integration": {
            "decode": "Load each WAV into an AudioBuffer once; use source.loop=true, loopStart=0, loopEnd=duration for looping files.",
            "ramps": "Fade each source gain over 60-120 ms at start/stop; do not fade individual loop iterations.",
            "rpm_layers": "Nominal RPMs are 640/1280/1920; interpolate adjacent layer gains with cos(pi*u/2) and sin(pi*u/2). Never play all at unity.",
            "mix": "All files are -16 LUFS individually. Start with engine gain 0.30, siren 0.26, hose 0.38 and cue 0.45, then set game bus headroom/limiting. Suspend engine/siren on arrival, ramp hose with the valve cue.",
        },
        "assets": assets, "passed": all(a["passed"] for a in assets),
    }
    QA.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
